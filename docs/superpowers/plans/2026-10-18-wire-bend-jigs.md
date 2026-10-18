# Wire Bend Jigs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D-printed bend plates, corner jigs and a coil mandrel generated from `Design.wires`, so a straight wire
pressed into the jig comes out in the design's shape.

**Architecture:** A pure path layer (`print/paths.ts`) turns the bendable wires of a design into ordered mm
polylines, flattens the planar ones and finds corners. `print/families/bend.ts` turns those paths into `PartSpec`s
(plate when it fits 180 mm, otherwise corner jigs) and a coil mandrel for the spring. The families of the covered
antennas append them.

**Tech Stack:** TypeScript 6, manifold-3d (mm), vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-wire-bend-jigs-design.md`

## Global Constraints

- Geometry comes from `Design.wires`, never re-derived from formulas.
- Eligible wire: diameter d ≤ 3 mm. Thicker → no bend part (not an error).
- Groove = `channel(M, a, b, d)` (adds `CLEAR` 0.3) + sphere of radius `(d + CLEAR)/2` at vertices; wire centre on
  plate top face z = 0 (half-depth groove); plate thickness `max(3, d + 2)`, margin 4 mm (as `skycone-bend`).
- Corner = turn angle > 20°; smaller turns are curve chords (smooth groove, no peg).
- Peg radius `rp = max(1.5, d)` mm; corner filleted with centre-line radius `Rf = rp + (d + CLEAR)/2`.
- Planar tolerance: every point within `max(0.2, 0.1·d)` mm of the fitted plane.
- Corner-jig arms 40 mm; corners joined by a straight run < 60 mm share one jig; angles deduped to 0.5°.
- Mandrel: core Ø `D − d − CLEAR`, printed upright, split with `stack()` over `SEG_H`; minimum ridge
  `pitch − d − CLEAR ≥ 0.8` for a groove; core < 3 mm → no part.
- `MAX_SIZE` 180 mm per segment; failures only via `PartError` with existing messages.
- Every English string in an exported array added to `PRINT_STRINGS`; UK translation in `src/i18n/uk.ts`.
- No embossed text. Static strings; numbers only as `Msg` args (`{ len }` in metres).
- `erasableSyntaxOnly`: no enums, no parameter properties.

## Calls made while planning (deviate from the spec; flag to the user)

- **qty = 1** for plates and corner jigs: one jig is reused for every identical piece/corner; the purpose text says
  how many to bend.
- **Paths split at nodes of degree ≠ 2** (after removing `feed`, `necOnly`, `drawOnly` wires and grouping by
  group + radius). The biquad comes out as one closed figure-8 (U and Lo are degree 2 once the feed wire is
  dropped); cloverleaf leaves split at the hub. No "straightest pair" rule is needed. The helper lives in
  `print/paths.ts` (mm, print-only), not `build.ts`.
- **Close-wound springs** (ridge < 0.8 mm, e.g. the 433 MHz default: pitch 1.2, d 0.8): a plain mandrel with a
  shoulder at the coil height H; wind close, then stretch to the shoulder. Grooved only when the ridge allows.

## Review Focus

1. Pieces right at the 180 mm boundary (quad at ~430 MHz, biquad reflector side): plate vs corner jig switch
   must never yield "Too large" for a bend part. → test in Task 3.
2. Very short runs between corners (yagi folded `fs` at small d, Moxon tips at extremes) where fillet tangents
   overlap. → fillet clamp test in Task 2, linked-corner test in Task 4.
3. Cloverleaf left vs right hand: the same plate must hold both (mirror). → probe test in Task 3.
4. d exactly 3 mm vs 3.01 mm, and the spring at d up to 5 mm: no part, no crash. → Task 3 / Task 5.
5. Closed loops: the start mark sits at the feed point (biquad: U) or the first wire's `a`. → Task 1 test.

---

### Task 1: Ordered bend paths

**Files:**
- Create: `src/lib/print/paths.ts`
- Test: `src/lib/print/paths.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BendPath { pts: V3[]; closed: boolean; d: number; group: string }  // mm, wire centre line
  export function bendPaths(d: Design): BendPath[]
  ```
  Closed paths start at the feed wire's end point when one touches the loop (biquad U = `feed.b`), else at the
  first wire's `a`; `pts` of a closed path do not repeat the start. Order follows the wires' original order
  where possible. Paths with fewer than 3 points or no turn > 1° are dropped (straight rods).

- [ ] **Step 1: Write failing tests** (`setup` from `families/testkit.ts`)
  - `biquad defaults → one closed path, 8 points, starts at U` (`pts[0]` ≈ mm(feed.b)), `d` = 1.5.
  - `quad defaults → two closed paths of 4 points` each.
  - `cloverleaf defaults (4 leaves) → 4 open paths, each 19 points`, first and last point at the hub.
  - `yagi { driven: "folded", d: 0.002 } → one closed path of 4 points`; straight elements dropped.
  - `dipole defaults → []`.
- [ ] **Step 2:** `npx vitest run src/lib/print/paths.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement: filter wires, node key by rounding to 1e-6 m (as `pieces()`), adjacency per
  `group|r` kind, walk maximal chains through degree-2 nodes.
- [ ] **Step 4:** Run the tests → PASS.
- [ ] **Step 5:** Commit `print: ordered bend paths from the design wires`.

### Task 2: Flatten, corners, fillets, signature

**Files:**
- Modify: `src/lib/print/paths.ts`
- Test: `src/lib/print/paths.test.ts`

**Interfaces:**
- Consumes: `BendPath` (Task 1).
- Produces:
  ```ts
  export type P2 = [number, number];
  export interface Flat { pts: P2[]; closed: boolean; d: number; corners: number[] /* indices into pts */; size: P2 /* extent */ }
  export function flatten(p: BendPath): Flat | null          // null when not planar
  export interface Groove { path: P2[]; pegs: { c: P2; r: number }[] }   // filleted centre line, mm
  export function filleted(f: Flat): Groove
  export function signature(f: Flat): string                 // equal for pieces equal up to rotation/mirror
  ```
  Plane normal by Newell's method; 2D basis with u along the largest extent; origin at min corner.
  Fillet tangent length `t = Rf·tan(θ/2)` clamped to `0.45 ×` the shorter adjacent segment (Rf reduced to match);
  peg on the inner bisector at `Rf/cos(θ/2)` from the vertex, radius `rp` (omit the peg if the clamped Rf < rp + d/2).
  Arcs sampled every ≤ 10°. Signature: cyclic (closed) / reversible (open) sequence of segment lengths (0.1 mm)
  and |turn| (0.5°), canonical minimum rotation.

- [ ] **Step 1: Write failing tests**
  - `quad loop flattens: 4 corners, each 90°, size ≈ side × side`.
  - `spring path → flatten returns null` (non-planar).
  - `cloverleaf leaf: corners only at the two leg/arc joints and the hub ends` (no corner inside the arc).
  - `filleted: every point is ≥ Rf − 0.01 from each peg centre and the path stays within 0.5·d + Rf of the polyline`.
  - `fillet clamp: a 3-point path with a 2 mm middle run and 90° turns → no NaN, tangent points inside the run`.
  - `cloverleaf: all 4 leaves share one signature; left and right hand (hand param) give the same signature`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `print: flatten bend paths, corners and fillets`.

### Task 3: Bend plate part

**Files:**
- Create: `src/lib/print/families/bend.ts`
- Test: `src/lib/print/families/bend.test.ts`

**Interfaces:**
- Consumes: `bendPaths`, `flatten`, `filleted`, `signature`.
- Produces:
  ```ts
  export const BEND_STRINGS: string[]; export const BEND_HOWTO: { plate: string[]; corner: string[]; mandrel: string[]; mandrelPlain: string[] };
  export function bendParts(d: Design): PartSpec[]   // plates + corner jigs (Task 4); ids "bend-plate-1", "bend-plate-2", …, use "jig"
  ```
  Plate when `size + 2·4 ≤ 180` in both axes, else that piece goes to corner jigs (Task 4). One plate per distinct
  signature, title "Bend plate" (+ purpose: "Groove with the exact shape of {0} piece(s) of {1} wire, {2} long …";
  args count, `{len}` d, `{len}` design length). Open path: groove starts with a flat stop at `pts[0]`
  (no 1 mm overrun there, no sphere) and ends at the last point. Closed path: continuous groove plus a 1 mm wide,
  d/2 deep start notch across it at `pts[0]`. Pegs: cylinders from z = −T to z = d + 1. How-to (plate): print flat
  grooves up, 100 % infill; push the wire end against the stop (closed: start at the notch); bend round each peg
  with pliers; trim at the groove end (closed: overlap and solder at the notch); reuse for every piece.

- [ ] **Step 1: Write failing tests** (`loadManifold`, `ball`, `inside` from testkit)
  - `biquad defaults → one bend-plate, builds, ≤ 180 mm`; every filleted path point has `inside(plate, ball(p, 0.8·d)) < 1e-3` and a ball 1 mm below the wire bottom is full plastic (`> 0.9 ×` its volume).
  - `cloverleaf defaults → exactly one bend-plate; qty 1; purpose arg count = 4`; same probes for leaf of `hand: "left"` and `"right"` (use the `hand` param's option values from cloverleaf.ts).
  - `quad at 435 MHz → one plate per loop size`; `quad at 145 MHz → no bend-plate` (Task 4 gives corner jigs).
  - `biquad { d: 0.003 } → plate present; { d: 0.0031 } → no bend parts`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `print: bend plate for planar bent wires`.

### Task 4: Corner jigs (single and linked)

**Files:**
- Modify: `src/lib/print/families/bend.ts`
- Test: `src/lib/print/families/bend.test.ts`

**Interfaces:**
- Consumes: Task 2/3 helpers.
- Produces: in `bendParts`, for pieces too big for a plate: ids `bend-corner-1`, … one per distinct corner group
  key (angles to 0.5°, plus the run length to 0.1 mm for linked pairs), title "Corner jig", qty 1, purpose args
  (count of corners using it, `{len}` d, angle in degrees; linked adds `{len}` spacing). Geometry: the filleted path
  from 40 mm before the first corner to 40 mm after the last (clamped to the real segment lengths), on a plate
  with 4 mm margin; pegs as Task 3.

- [ ] **Step 1: Write failing tests**
  - `quad 145 MHz → exactly one bend-corner (90°), builds; purpose count = 8`.
  - `yagi { driven: "folded", d: 0.002 } at 145 MHz → one linked U-fold jig`; probes: both corner fillet midpoints clear, and the two parallel straight probes are `fs` apart (from the design: `max(3d, 0.01λ)` in mm, compare to the jig path geometry within 0.05 mm).
  - `moxon defaults → corner jigs only, all build ≤ 180 mm`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `print: corner jigs for bent wires too big for a plate`.

### Task 5: Spring coil mandrel

**Files:**
- Modify: `src/lib/print/families/bend.ts`, `src/lib/build.ts:252` area (spring note)
- Test: `src/lib/print/families/bend.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function springGeometry(d: Design): { R: number; wireD: number; S: number; n: number; hand: 1 | -1; H: number }  // mm
  export function coilParts(d: Design): PartSpec[]   // [] or one "coil-mandrel", use "former"
  ```
  Geometry from the `driven` wires after the lead (axis = mean xy of the coil points, turns by unwrapped atan2
  as `helixGeometry`). Core Ø `2R − wireD − CLEAR`; < 3 mm or wireD > 3 → `[]`. Ridge ≥ 0.8 → `twistGroove`
  over the coil height; else plain core with a shoulder (core + 3 mm Ø, 2 mm thick) at height H. 20 mm plain
  handle below, 1 mm × wireD anchor slot at the top end. Split with `stack()` when taller than `SEG_H`.
  When no mandrel is made, `build.ts` adds the step "Wind it on a drill bit or bolt of {0}" (`{len}` core Ø) to the
  spring's build steps (add the string to `BUILD_STRINGS`).

- [ ] **Step 1: Write failing tests**
  - `spring defaults → plain coil-mandrel (no groove), shoulder at H within 0.2 mm`.
  - `spring { D: 0.02, pitch: 0.005, d: 0.0015 } → grooved mandrel; ball probes at the design coil points are clear`.
  - `spring { d: 0.004 } → no coil-mandrel`; `spring { D: 0.003 } → no coil-mandrel and build steps contain the drill-bit step`.
  - `spring at max turns builds as several segments, each ≤ 180 mm`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `print: coil mandrel for the spring antenna`.

### Task 6: Wire it in, i18n, docs

**Files:**
- Modify: `src/lib/print/index.ts` (FAMILIES for `quad`, `moxon`, `biquad`, `yagi`: append `bendParts(d)`;
  add `cloverleaf: (_p, d) => bendParts(d)`, `spring: (_p, d) => coilParts(d)`; add `BEND_STRINGS` and
  `Object.values(BEND_HOWTO).flat()` to `PRINT_STRINGS`)
- Modify: `src/i18n/uk.ts` (UK for every new string, next to "Frame bending jig")
- Modify: `CLAUDE.md` layout (`print/families/bend.ts` + `print/paths.ts` line)

- [ ] **Step 1:** Run `npx vitest run src/i18n.test.ts src/lib/print` → FAIL (missing UK keys) after wiring.
- [ ] **Step 2:** Add translations.
- [ ] **Step 3:** `npm test && npm run typecheck && npm run lint` → all pass (incl. the parameter-extremes test in
  `print.test.ts`, which now covers the new parts).
- [ ] **Step 4:** `npm run dev`, open quad / biquad / cloverleaf / spring Print panel, check the parts render in MeshView.
- [ ] **Step 5:** Commit `print: bend jigs for quad, Moxon, biquad, Yagi, cloverleaf and spring`.

### Task 7 (stretch): A55 coiled shorting wires

- [ ] If `coilPath` in `antennas/skycone.ts` exposes D, pitch, turns and hand, add a `coil-mandrel` to
  `skyconeParts` for `skyconecage55` via the Task 5 builder (generalise its input to that geometry), with a test
  that the design coil points are clear. Otherwise skip and add a line under "Not done / ideas" in CLAUDE.md.
