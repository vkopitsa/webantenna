# Wire Cut and Bend Aids Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For every wire antenna, give a bend recipe (cut length + bend marks), a printed cut board, and two printed benders (lever A, plate B).

**Architecture:** A pure lib module `src/lib/recipe.ts` turns `Design.wires` into recipes using the existing flattening in `print/paths.ts`. A new print family `print/families/cutbend.ts` builds the cut board and the two benders from the recipes and cut list. `template.ts` draws the recipe strips into the build PDF/SVG, and the Build panel shows the recipe table.

**Tech Stack:** TypeScript 6, React 19, manifold-3d, vitest. Lib code has no DOM.

**Spec:** `docs/superpowers/specs/2026-10-19-wire-cut-bend-design.md`

## Global Constraints

- SI in `lib/` types (metres); print geometry in mm (`print/` convention). `Wire.r` is a radius in metres.
- Strings: English keys, `{0}` placeholders with typed args (`{ len }` metres); every new string in `BUILD_STRINGS` or the print string arrays, UK translation in `src/i18n/uk.ts`; `src/i18n.test.ts` must pass.
- No enums, no parameter properties (`erasableSyntaxOnly`).
- Print rules from `print/rules.ts`: `CLEAR = 0.3`, `WALL = 2`, `MAX_SIZE = 180`; cut-board hole depth ≤ 170 mm.
- Eligible for printed aids: wire Ø ≤ 3 mm (`D_MAX` in `bend.ts`, export it and reuse).
- Die bolts: M3 / M4 / M5 / M6, radius 1.5 / 2 / 2.5 / 3 mm; die = smallest with radius ≥ `max(1.5, d)`. Clearance holes 3.4 / 4.5 / 5.5 / 6.6 mm.
- Corner = vertex turning > 20° (`CORNER` in `paths.ts`, export it).
- Sky-cone families (`skycone*`) get no recipe, no cut board, no benders.
- Every part builds watertight or throws a `PartError` with a `FAIL` / "Too large" message; no supports needed (flat bottoms, teardrop holes).
- Commit with plain `git`, message ending with the attribution lines in the session.

## Review Focus

1. A closed loop whose `bendPaths()` start is not at the feed: B1 must still be the first corner from the feed point (Task 1 test on the quad driven loop).
2. Wire Ø between bolt sizes (1.6 mm → M4) and runs shorter than the tangent lengths: marks use the bolt radius, the short bend is flagged, nothing NaN/negative (Task 1 test).
3. Design with no eligible piece (dipole HF, Ø12 Yagi): no cut board / bender parts at all, recipe still shows numbers for > 3 mm bent pieces (Task 1 + Task 4 tests).
4. Many short pieces (cloverleaf, biquad at 5.8 GHz, ground plane radials at 1.3 GHz): the board splits into several boards within `MAX_SIZE`, same lengths share a hole (Task 3 test).
5. Parameter extremes (`print.test.ts` extremes loop) never yield a broken cut board or bender (Task 4 runs it).

---

### Task 1: Bend recipe (lib)

**Files:**
- Modify: `src/lib/print/paths.ts` (export `CORNER`; add `wires: number[]` to `BendPath`, filled in `bendPaths`)
- Modify: `src/lib/print/families/bend.ts` (export `D_MAX`)
- Create: `src/lib/recipe.ts`
- Test: `src/lib/recipe.test.ts`

**Interfaces:**
- Consumes: `bendPaths(d): BendPath[]`, `flatten(p): Flat | null`, `signature(f): string` (paths.ts); `pieces(d): Piece[]`, `cutList(def, d, trimmed): CutRow[]` (build.ts).
- Produces:
```ts
export interface Die { bolt: "M3" | "M4" | "M5" | "M6"; r: number; hole: number }   // mm
export function dieFor(dMm: number): Die | null;          // null when dMm > D_MAX
export interface Bend { at: number; angle: number; dir: "L" | "R"; short: boolean }   // at: m from cut start to arc start; angle deg
export interface Curve { from: number; to: number }        // m, gentle turns ≤ 20°
export interface Recipe {
  tag: string; group: string; dia: number; qty: number;    // dia m
  cut: number; length: number;                             // m: cut-list length, developed (filleted) length
  closed: boolean; die: Die | null; bends: Bend[]; curves: Curve[];
  path: P2[];                                              // mm, flattened design path from the start point, for drawing
}
export function bendRecipes(def: AntennaDef, p: Params, d: Design): Recipe[];
```

- [ ] **Step 1: Write the failing tests** in `src/lib/recipe.test.ts` (use `ANTENNA_BY_ID` + `def.build(def.defaults)`-style setup as other lib tests do):
  - `dieFor`: `dieFor(1).bolt === "M3"`, `dieFor(1.5).bolt === "M3"`, `dieFor(1.6).bolt === "M4"`, `dieFor(2).r === 2`, `dieFor(3).bolt === "M6"`, `dieFor(3.1) === null`.
  - `"quad driven loop: 4 corners, B1 is the first corner from the feed"`: recipe for the driven tag has `closed`, `bends.length === flatten(...).corners.length` (4 on the square loop), all `angle ≈ 90 ± 0.5`, all `dir` equal, `bends[0].at` < quarter of `length`.
  - `"marks land on the design corners"`: test helper `rebuild(r)` walks a turtle from (0,0) heading +x: straight to `at`, arc of radius `die.r + dia_mm/2` by `angle` in `dir`, … ; take intersections of consecutive straight lines as virtual corners; compare with `flatten()` corners of the same piece (aligned on first point and first direction): every non-`short` corner within 0.5 mm. Run for quad (UHF band `430e6-440e6`), moxon, biquad, cloverleaf, yagi `{ driven: "folded", d: 2e-3 }`.
  - `"wire between bolt sizes uses the bolt radius"`: biquad with `d: 1.6e-3` → `die.bolt === "M4"`, marks pass the rebuild test with r = 2.
  - `"short run is flagged"`: synthetic `Design` with a 2 mm wire U of legs 50 mm and base 3 mm → both bends `short: true`, all `at` finite and ≥ 0.
  - `"thick bent pieces still get numbers"`: yagi defaults (`d` 12 mm, folded) → recipe with `die === null`, 4 bends; marks at the sharp corners (`at` = distance to the vertex).
  - `"skycone gets none"`: `bendRecipes` for `skyconecage` → `[]`.
  - `"identical pieces merge"`: cloverleaf → leaves give one recipe with `qty === 4` (or the leaf count).

- [ ] **Step 2: Run** `npx vitest run src/lib/recipe.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/recipe.ts`.**
  - Pieces → recipes: for each `BendPath` from `bendPaths(d)` with a `flatten()` result, find the `Piece` sharing its `wires`; take its tag; the cut row is the `cutList(def, d, trimmed)` row whose `tag` list contains it (trimmed = same set `buildPack` uses; extract that computation into an exported helper in `build.ts` if it is inline), else `piece.length`. Skip `def.id.startsWith("skycone")`. Merge equal `signature()` → `qty`.
  - Closed loop start: rotate the point list so it starts at the feed point (`d.feed` wire's position on the loop: the vertex nearest `feedPoint(d)`); the open ends are both at that point.
  - Marks (die present), with `Rc = die.r + dMm/2`, corners `i` with turn `θ_i` (rad), segment lengths `L_k` between vertices, tangent `t_i = Rc·tan(θ_i/2)`:
```
s = 0                       // developed position along the wire, mm
for each vertex i in order:
  s += L_(i-1) − t_(i−1) − t_i           // t = 0 for non-corners and ends
  if corner: bends.push({ at: s/1000, angle: θ_i deg, dir, short: L_(i−1) < t_(i−1)+t_i or L_i < t_i+t_(i+1) })
             s += Rc·θ_i
  else (gentle, ≤ 20°): extend/open a Curve at s
length = s + last segment
```
    With `die === null` (Ø > 3 mm): `t = 0`, no arc, `at` = vertex distance.
  - `dir`: sign of the 2D cross product of incoming × outgoing on the flattened path (`"L"` positive).

- [ ] **Step 4: Run** `npx vitest run src/lib/recipe.test.ts src/lib/print` — Expected: PASS (paths/bend tests still pass with the `wires` field).

- [ ] **Step 5: Commit** `feat(recipe): bend recipe per wire piece (cut length, marks at the die's arc start)`.

---

### Task 2: Engraved digits (print shapes)

**Files:**
- Modify: `src/lib/print/shapes.ts`
- Test: `src/lib/print/shapes.test.ts`

**Interfaces:**
- Produces: `export function digits(M: M, text: string, x: number, y: number, h: number, depth: number, zTop: number): Manifold` — seven-segment glyphs for `0-9` (other chars throw), height `h` mm, width `0.6·h`, stroke `max(0.8, h/7)`, gap `0.25·h`, left-bottom at (x, y), extruded from `zTop − depth` to `zTop + 0.01` for subtraction.

- [ ] **Step 1: Failing tests:** `"digits: every glyph builds"` (for "0".."9": status NoError, non-empty); `"8 has more volume than 1"`; `"width grows with length"` (bounding box of "123" wider than "1"); `"rejects letters"` (`expect(() => digits(M, "A", …)).toThrow()`).
- [ ] **Step 2: Run** `npx vitest run src/lib/print/shapes.test.ts` — FAIL.
- [ ] **Step 3: Implement** as a union of `box()` segments per glyph from a segment table `a–g`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(print): seven-segment engraved digits`.

---

### Task 3: Cut board part

**Files:**
- Create: `src/lib/print/families/cutbend.ts`
- Test: `src/lib/print/families/cutbend.test.ts`

**Interfaces:**
- Consumes: `Recipe`, `dieFor` (Task 1), `digits` (Task 2), `CutRow` (build.ts), `D_MAX`.
- Produces:
```ts
export interface Hole { n: number; cut: number; dia: number; qty: number; what: Msg; marks: number[] }  // m; marks = recipe bend `at`s
export function boardHoles(rows: CutRow[], recipes: Recipe[]): Hole[];     // eligible: cut ≤ 0.170 m, dia ≤ D_MAX mm; ±0.5 mm same length+dia → one hole, qty summed; numbered 1.. longest first
export function cutBoards(holes: Hole[]): PartSpec[];                     // id "cut-board" or "cut-board-1".., use "jig"
export const CUTBEND_STRINGS: string[]; export const CUTBEND_HOWTO: { board: string[]; lever: string[]; plate: string[] };
```
- Geometry (pinned): board printed flat; hole axis along +x at mid-thickness, open at x = 0 (cut edge), blind end at x = cut (mm); hole Ø `max(2, dia + CLEAR)` with teardrop top (45° roof); thickness `hole Ø + 2·WALL` min 5 mm; pitch between holes ≥ hole Ø + 2·WALL and ≥ 9 mm for the number; number engraved 0.6 mm deep on top beside the open end, `h = 5`; bend slits 1 mm wide across the hole from the top surface down to the hole at each mark (`at` from x = 0); boards split so each stays within `MAX_SIZE` in y (length is ≤ 170 + margin by construction).

- [ ] **Step 1: Failing tests:**
  - `boardHoles`: biquad 2.4 GHz defaults → one hole for the driven wire with `marks.length === 7`; ground plane at `1.3e9` band → radials share one hole with `qty === 4` (or the radial count); dipole 14 MHz → `[]`.
  - `"cut board: wire goes in to the cut length and no further"`: with `along()`/`ball()` from `testkit.ts`, a probe of Ø `0.8·dia` from x = 1 to x = cut − 1 is clear (`inside < 1e-3`), a ball at x = cut + 1.5 is held by plastic (`> 0.9` volume).
  - `"slits open at the marks"`: a thin probe from top surface to hole centre at each mark is clear.
  - `"many holes split into boards within MAX_SIZE"`: 40 synthetic holes → ≥ 2 parts, each `buildPart(...).ok` and every segment size ≤ `MAX_SIZE`.
- [ ] **Step 2: Run** `npx vitest run src/lib/print/families/cutbend.test.ts` — FAIL.
- [ ] **Step 3: Implement `boardHoles` and `cutBoards`.** Purpose msg: `"Cut board: push the wire to the bottom of a hole and cut flush; {0} holes"`; how-to lists, per hole, `"Hole {0}: {1}, cut {2} × {3}"` (n, what, `{len}`, qty) — these per-hole lines are `howTo` entries so they reach the panel and README.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(print): cut board with one hole per wire length`.

---

### Task 4: Benders A and B, wired into the families

**Files:**
- Modify: `src/lib/print/families/cutbend.ts`
- Modify: `src/lib/print/index.ts` (append `cutBendParts` to wire families, merge strings into `PRINT_STRINGS`)
- Modify: `src/i18n/uk.ts`
- Test: `src/lib/print/families/cutbend.test.ts`

**Interfaces:**
- Produces:
```ts
export interface BenderGeom { die: Die; dMm: number; stops: { angle: number; c: P2 }[]; roller: P2; tangentX: number }
export function benderGeometry(die: Die, dMm: number, angles: number[]): BenderGeom;  // pure, mm, die centre at (0,0), wire enters along −x→ at y = −(die.r + dMm/2)
export function benderLever(g: BenderGeom): PartSpec;    // id `bender-lever-${die.bolt.toLowerCase()}`, segments: base, lever
export function benderPlate(g: BenderGeom): PartSpec;    // id `bender-plate-${…}`, one segment
export function cutBendParts(def: AntennaDef, p: Params, d: Design): PartSpec[];  // board(s) + one A and one B per distinct die among eligible bent recipes; [] for skycone*
```
- Pinned geometry: stop holes on a circle of radius 40 mm about the die at each distinct recipe angle (rounded to 0.5°) plus 90°, measured from the wire's entry direction in the bend direction; roller centre at distance `die.r + dMm + CLEAR + die.r` from the die centre at 0°; tangent line engraved at x = `tangentX` = 0 (perpendicular to the wire through the die centre); angle lines every 15° (longer at 45°, 90°, 135°, 180°), 0.6 mm deep. Lever bender: base ≈ 150 × 90 × 8 mm with a 25 × 40 mm vise tab under it and two Ø4.5 mounting holes; lever ≈ 140 mm, 8 mm thick, pivot hole = `die.hole` at the die, roller hole = `die.hole`; entry groove `dMm + CLEAR` in a 15 mm back-stop block on the base. Plate B: ≈ 90 × 90 × 6 mm, die hole, a trap-bolt hole on the outside of the wire at x = −(2·die.r + dMm + CLEAR + die.r), entry groove, stop holes, engraved lines. All holes through, no overhangs.
- `FAMILIES` wiring: append `...cutBendParts(def, p, d)` for dipole, fandipole, groundplane, yagi, discone, moxon, quad, biquad, cloverleaf, spring, jpole, collinear (it returns `[]` when nothing qualifies). Get `def` via `ANTENNA_BY_ID` if importing it into `print/index.ts` creates no cycle (check `npm run build` / vitest); otherwise change `partsFor` callers (`print.worker.ts`, `usePrintParts.ts`) to pass `def`.
- How-to for both benders starts with `"Print either this lever bender or the bending plate, not both"` and names the bolts: `"Die and roller: two {0} × 30 mm bolts with nuts"`-style typed args (bolt name as string arg).

- [ ] **Step 1: Failing tests:**
  - `benderGeometry(dieFor(2)!, 2, [90, 45])`: stops at 45 and 90 (dedup), each `c` at radius 40 ± 0.01 and at the right angle (atan2 check); roller at the stated distance.
  - `"lever bender: wire clears between die and roller"`: probe ball Ø `0.8·dMm` at the wire line between die and roller is clear in the base.
  - `"benders build at Ø0.5, 1, 2, 3 mm"`: both parts `buildPart(...).ok`, segments ≤ `MAX_SIZE`.
  - `"which designs get parts"`: quad UHF → has `cut-board*`, `bender-lever-*`, `bender-plate-*`; yagi defaults (Ø12) → none of them; dipole 2.4 GHz → `cut-board` only; `skyconecage` → none.
  - Existing `print.test.ts` "every part builds at defaults" and the extremes loop must still pass.
- [ ] **Step 2: Run** `npx vitest run src/lib/print` — FAIL.
- [ ] **Step 3: Implement** the geometry, parts, family wiring, strings and UK translations.
- [ ] **Step 4: Run** `npx vitest run src/lib/print src/i18n.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(print): lever bender and bending plate (bolt die), cut aids for wire antennas`.

---

### Task 5: Recipe in the build pack and templates

**Files:**
- Modify: `src/lib/template.ts` (recipe drawing, `TemplateKind` gains `"recipe"`, `templateKind`, `templatePages`, `buildSheetPages`)
- Modify: `src/lib/build.ts` (`BuildPack.recipes: Recipe[]`, recipe strings in `BUILD_STRINGS`; cut-list bends note points at the recipe: `"Bends: {0}, see the bend recipe"`)
- Modify: `src/components/BuildPanel.tsx` (recipe table under the cut list; fix the hint at line 40 so a straight design no longer says "too large")
- Modify: `src/i18n/uk.ts`, `src/i18n.test.ts` (`VARIANTS` if a new conditional label needs it)
- Test: `src/lib/template.test.ts` (or the existing template test file)

**Interfaces:**
- Consumes: `bendRecipes`, `Recipe` (Task 1).
- Produces: `recipeDrawings(rs: Recipe[]): Drawing[]` (private to template.ts): per recipe a 1:1 strip — wire line of length `cut`, cut ticks at 0 and `cut`, red ticks at each `at` labelled `B{n}`, `{at mm}`, `{angle}° L/R`, small preview of `path` in a corner, caption with tag, Ø, die bolt, qty; recipes with `cut` such that the strip needs > 6 A4 tiles get no strip (table only).

- [ ] **Step 1: Failing tests:** (rule: a design keeps its existing kind and pages, recipe pages are appended to `templatePages`; `templateKind` returns `"recipe"` only where it used to return `"none"` and there is ≥ 1 strip) biquad 2.4 GHz → kind unchanged; `templatePages` contains text prims `"B1"`…`"B7"`; dipole 2.4 GHz → no recipe pages and `templateKind === "none"`; quad HF (`14e6-14.35e6`) → recipe in `buildPack().recipes` but no strip pages (too long); `buildSheetPages` includes a recipe table text row with `"B1"` for the quad.
- [ ] **Step 2: Run** `npx vitest run src/lib/template` — FAIL.
- [ ] **Step 3: Implement** drawing, pack field, table in `BuildPanel.tsx` (columns: piece, Ø, cut, bends as `B1 31 mm 90° L; …`, die bolt), hint fix, strings + UK.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint` — PASS. Check the PDF with `pdfinfo` on a biquad pack written by a quick vitest snapshot or script.
- [ ] **Step 5: Commit** `feat(build): bend recipe table and 1:1 recipe strips`.

---

### Task 6: Docs and final verification

**Files:**
- Modify: `CLAUDE.md` (layout lines for `src/lib/recipe.ts` and `print/families/cutbend.ts`; remove nothing)

- [ ] **Step 1:** Add the two layout lines.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npm run lint && npm run build` — all PASS.
- [ ] **Step 3:** `npm run dev`, open quad (UHF) and biquad: Build tab shows the recipe table, the PDF has the strips, Print panel lists cut board + both benders and the STL preview looks right.
- [ ] **Step 4: Commit** `docs: CLAUDE.md layout for recipe and cut/bend parts`.
