# Build Step Animations, Batch 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a looping, labelled SVG animation beside each general Build step (wire, PCB, air-patch, loop and common branches) and each how-to line of the cut board, lever bender and bending plate.

**Architecture:**
- Step texts move into one exported `STEP_TEXT` object in `src/lib/build.ts`, so there is one place that names every step.
- A small eager registry (`src/components/steps/registry.ts`) maps each English step key (`Msg.s`) to a scene id.
- The scenes (inline SVG with SMIL `<animate*>` elements) live in a lazy chunk (`src/components/steps/scenes/`).
- A `StepList` component renders the `<ol>` rows with a `StepPic` player. The player pauses off-screen scenes, shows a fixed still frame under reduced motion, and enlarges a scene on tap.

**Tech Stack:** React 19, TypeScript 6 (`erasableSyntaxOnly`), Vite 8, vitest 5 (node environment, no jsdom), `react-dom/server` for render tests, oxlint.

**Spec:** `docs/superpowers/specs/2026-10-19-build-step-animations-design.md` (batch 1 of 4)

## Global Constraints

- Moving picture for every covered line. Standard "how to do it" drawings, never this design's geometry.
- One general drawing per step text, even when the step is shared by very different antennas. It must not look like any one antenna.
- On screen only. `template.ts` (PDF), `fab.ts` and `print/index.ts` READMEs are untouched.
- Style as `.superpowers/brainstorm/2161318-1792422924/content/step-style-v3.html`:
  - flat 2D, one clear view (from above, or side when height matters);
  - every part the step text names is labelled with a short noun;
  - fixed colours: copper wire copper-brown, marks red, bolts grey, stop bolt yellow, printed plastic light grey-blue, motion arrows in the accent blue.
- Clarity beats elegance. A picture that disagrees with its text (direction, L/R side, order, tool) is a bug.
- Colours only via CSS tokens in `src/index.css`, defined in all three places: `:root`, `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and `:root[data-theme="dark"]`.
- Labels through `t("…")` as string literals in `.tsx` files (so `uiStrings()` in `src/i18n.test.ts` finds them), each with a UK entry in `src/i18n/uk.ts`.
- `src/lib` stays free of DOM and React. No new runtime dependencies, no image/GIF/video files.
- Loops of 3–5 s with a hold on the finished state. Only on-screen scenes run. `prefers-reduced-motion: reduce` shows the still (finished state with its motion arrow).
- Scenes load as a lazy chunk. The registry (keys → ids) is eager and tiny.
- Row layout: picture left at 140 px, text right; below 600 px wide the picture goes above the text. Tap enlarges.
- Lines without a picture yet (batches 2–4, reference rows) render as text only, exactly as today.
- Test files are `.test.ts` (tsconfig.app.json excludes only `*.test.ts`), so render tests use `createElement`, not JSX.
- Commits: plain `git`, messages ending with the two attribution lines from the session.

## Review Focus

1. **A picture contradicting its text** (wrong bend direction, R/L, order, missing tool). Expected: every scene matches its key's sentence.
   Pinned by the gallery review step in each scene task: screenshot each new scene with its text under it and compare clause by clause.
2. **UK labels longer than the English ones overflow the 320-wide scene.** Expected: every label stays inside the scene.
   Pinned by `steps.test.ts › every label fits` (Task 3), rendering every scene with the UK translator and requiring each `<text>` ≤ 22 characters.
3. **Reduced motion shows a half-finished frame.** Expected: the still is the finished state.
   Pinned by `steps.test.ts › still is inside the loop` (0 < still ≤ dur) plus the gallery `?reduced` check per scene task.
4. **A long Build panel with 15+ running scenes stutters.** Expected: smooth scroll; off-screen scenes paused.
   Pinned by Task 9's Performance check, and by the unit test that `StepPic` calls `pauseAnimations()` when not intersecting (Task 2).
5. **Dark mode makes labels or parts vanish** (e.g. black outlines on a dark panel). Expected: everything readable in both themes.
   Pinned by `steps.test.ts › no hard-coded colours` (no `#rrggbb` or `rgb(` in scene markup; only `var(--…)`) plus the dark gallery screenshots.

---

## File Structure

```
src/lib/build.ts                     MODIFY  STEP_TEXT (all steps() sentences), steps() uses it, BUILD_STRINGS spreads it
src/lib/build.test.ts                MODIFY  (or create steps.test in lib) pack steps ⊆ STEP_TEXT
src/index.css                        MODIFY  material tokens + .steps/.step-row/.step-pic/.step-big styles
src/components/steps/kit.tsx         CREATE  Scene contract + drawing primitives (Wire, Bolt, Label, Arrow, Pliers, Iron, Coax, …)
src/components/steps/StepPic.tsx     CREATE  player: renders a scene's <svg>, pause off-screen, reduced motion, tap to enlarge
src/components/steps/StepList.tsx    CREATE  <ol className="notes steps"> rows: picture (if registered) + text
src/components/steps/registry.ts     CREATE  STEP_PICS: Record<string, SceneId>; SceneId union
src/components/steps/scenes/index.ts CREATE  SCENES: Record<SceneId, Scene> (lazy-imported by StepPic)
src/components/steps/scenes/wire.tsx      CREATE  wire + common scenes (Task 4)
src/components/steps/scenes/board.tsx     CREATE  PCB, loop, air-patch scenes (Task 5)
src/components/steps/scenes/cutboard.tsx  CREATE  cut board scenes (Task 6)
src/components/steps/scenes/lever.tsx     CREATE  lever bender + shared bend-order scenes (Task 7)
src/components/steps/scenes/plate.tsx     CREATE  bending plate scenes (Task 8)
src/components/steps/Gallery.tsx     CREATE  dev review page: every scene, its key texts, light/dark/UK/reduced toggles (?stepgallery)
src/components/steps/steps.test.ts   CREATE  registry coverage, render, label length, colour, still tests
src/components/BuildPanel.tsx        MODIFY  Build steps <ol> → <StepList items={pack.steps} />
src/components/PrintPanel.tsx        MODIFY  how-to <ol> → <StepList items={specs[sel].howTo} />
src/App.tsx (or main.tsx)            MODIFY  render <Gallery/> when location.search has "stepgallery"
src/i18n/uk.ts                       MODIFY  UK for every new label
```

---

### Task 1: One home for the step texts (`STEP_TEXT`)

**Files:**
- Modify: `src/lib/build.ts:445-504` (`steps()`), `src/lib/build.ts:567+` (`BUILD_STRINGS`)
- Test: `src/lib/steptext.test.ts` (create)

**Interfaces:**
- Produces:
  ```ts
  export const STEP_TEXT: {
    loop:   { etch; connector; caps; trimmer };
    air:    { cut; drill; jack; mount; director };
    pcb:    { make; stack; connector; balun; stitch };
    sheets: { print; roll; hotSkirt; hot; short };
    frames: { bend; solderCap; solder; hoops; pinCap; short1; coil1; coilN; shortN; shortCap };
    wire:   { cutLong; cut; wind; boom; bend; feedMatch; feed };
    common: { position; measure; trim; enclosure; s1p; seal };
  }  // every value a string; `as const`
  ```
  Each value is the exact sentence now inlined in `steps()`. The mapping follows the branch order in `steps()`. In `pcb`, `connector` = "Solder the connector at the feed port…" and `make` = "Order the board from the Gerber files…".

- [ ] **Step 1: Write the failing test** `src/lib/steptext.test.ts`
  - `it("every pack step of every antenna is a STEP_TEXT sentence")`: for each `a` of `ANTENNAS`, `buildPack(a, a.defaults).steps.every(m => ALL.has(m.s))`, where `ALL = new Set(Object.values(STEP_TEXT).flatMap(Object.values))`. On failure, report `a.id` and the stray `m.s`.
  - `it("BUILD_STRINGS holds every STEP_TEXT sentence")`: `ALL ⊆ new Set(BUILD_STRINGS)`.
  - `it("STEP_TEXT has no duplicates")`: `ALL.size === Object.values(STEP_TEXT).flatMap(Object.values).length`. Note that `stack` currently appears both in `BUILD_STRINGS` and in `steps()`. Dedupe it in `BUILD_STRINGS`, since the list feeds a key set anyway.
- [ ] **Step 2:** `npx vitest run src/lib/steptext.test.ts`. Expected: FAIL, `STEP_TEXT` is not exported.
- [ ] **Step 3:** Add `STEP_TEXT` above `steps()`. Replace every `M("…")` literal in `steps()` with `M(STEP_TEXT.<group>.<name>, …args)`. In `BUILD_STRINGS`, remove the hand copies of those sentences and add `...Object.values(STEP_TEXT).flatMap(Object.values)`.
- [ ] **Step 4:** Run `npx vitest run src/lib/steptext.test.ts src/i18n.test.ts`. Expected: PASS. The i18n test must stay green, which proves no sentence changed.
- [ ] **Step 5:** Commit: `refactor(build): STEP_TEXT holds every build step sentence`.

---

### Task 2: Scene contract, kit primitives, tokens and the `StepPic` player

**Files:**
- Create: `src/components/steps/kit.tsx`, `src/components/steps/StepPic.tsx`
- Modify: `src/index.css`
- Test: `src/components/steps/steps.test.ts` (create; later tasks extend it)

**Interfaces:**
- Produces, in `kit.tsx`:
  ```ts
  export type T = (s: string, ...a: (string | number)[]) => string;   // same shape as useT()
  export interface Scene {
    dur: number;      // loop length in seconds, 3–5
    still: number;    // seconds into the loop that show the finished state (0 < still ≤ dur)
    view?: string;    // viewBox, default "0 0 320 240"
    draw: (t: T) => React.ReactNode;   // SVG children; every <animate*> uses dur={`${dur}s`} repeatCount="indefinite" begin="0s"
  }
  ```
  Primitives (SVG `<g>` components). Each takes `x, y` (and `rot` where it makes sense) and colours itself from tokens:
  - `Wire({ d, w? })`: a copper path. `w` is the stroke width, default 5.
  - `Mark({ x, y, rot? })`: a red tick.
  - `Bolt({ x, y, r?, head?: "hex" | "round" | "csk", stop?: boolean })`: grey, or yellow when `stop`.
  - `Plastic({ d } | { x, y, w, h, rx? })`: a printed part.
  - `Label({ x, y, text, to?: [x, y], anchor? })`: 11 px text, with a leader line to `to` when given.
  - `Arrow({ d })`: a dashed accent path with an arrowhead.
  - `Pliers`, `Cutters`, `Iron`, `Hand`, `Coax({ x, y, rot?, stripped?: boolean })`, `Board({ x, y, w, h })` (FR-4 green with copper), `Ruler({ x, y, len })`.

  Animated helpers share a `DurContext`, so a scene can't drift out of sync:
  - `Rot({ about: [x, y], values: number[], times: number[], children })`: an `<animateTransform type="rotate">`.
  - `Move({ values: [x, y][], times, children })`: a translate.
  - `Fade({ values: number[], times, children })`: opacity.
  - `Draw({ d, times })`: a stroke-dashoffset reveal, used for wire being wound or tape being wrapped.
- Produces, in `StepPic.tsx`:
  ```ts
  export function StepPic(props: { id: SceneId; title: string }): JSX.Element
  export const SceneSvg: (p: { scene: Scene; t: T; label: string }) => JSX.Element   // pure, no effects
  ```
  `SceneSvg` renders `<svg viewBox role="img" aria-label={label} className="step-svg">`.

  `StepPic` loads `SCENES` with `lazy(() => import("./scenes"))` (Suspense fallback: an empty `.step-pic` box of the same size). Once mounted it controls the `<svg>` element:
  - When the `IntersectionObserver` reports the scene off-screen, or `document.hidden` is true, it calls `pauseAnimations()`. Otherwise it calls `unpauseAnimations()`.
  - When `matchMedia("(prefers-reduced-motion: reduce)")` matches, it calls `pauseAnimations()` and then `setCurrentTime(scene.still)`, and never resumes.
  - Clicking or pressing Enter opens the same `SceneSvg` at about 560 px wide in a fixed overlay (`.step-big`) with the step title under it. The overlay closes on click, Esc or the ✕ button. No `alert` or `confirm`.

  Put this pause/reduced-motion logic in a pure function `controlScene(svg: Pick<SVGSVGElement, "pauseAnimations" | "unpauseAnimations" | "setCurrentTime">, s: { visible: boolean; hidden: boolean; reduced: boolean; still: number }): void`, exported for the test.
- Tokens to add in `src/index.css` (light / dark):
  - `--copper` #b5651d / #d9894a
  - `--mark` #d40000 / #ff6b6b
  - `--bolt` #9aa5b1 / #8a96a3
  - `--stop` #e9b949 / #e9b949
  - `--plastic` #dfe5ec / #3a4452
  - `--plastic-edge` #556070 / #9aa6b5
  - `--sheet` #c9ced6 / #6b7480
  - `--fr4` #2f7d4a / #3f9c5f
  - `--solder` #c0c4c8 / #d5d9dd
  - `--coax` #2b2f36 / #11141a

  Outlines use `--fg`, labels `--fg`, arrows `--accent`.
- CSS:
  - `.steps li` becomes a grid with columns `140px 1fr`, gap 10px, and `align-items: start`.
  - Below `@media (max-width: 600px)` it becomes one column with the picture at most 320 px wide.
  - `.step-pic`: 140 × 105, a border of `--line`, radius 6, background `--panel`, `cursor: zoom-in`.
  - `.step-big`: a fixed, centred overlay with a dimmed backdrop.

- [ ] **Step 1: Write the failing tests** in `steps.test.ts`:
  - `controlScene pauses off-screen`: given a fake svg recording calls, `{visible: false, hidden: false, reduced: false}` → `["pause"]`; `{visible: true}` → `["unpause"]`; `{hidden: true, visible: true}` → `["pause"]`.
  - `controlScene shows the still under reduced motion`: `{reduced: true, still: 2.4}` → `["pause", "set 2.4"]`.
  - `SceneSvg renders an svg with the label`: `renderToStaticMarkup(createElement(SceneSvg, { scene: demo, t: (s) => s, label: "x" }))` contains `<svg`, `role="img"`, `aria-label="x"`. Here `demo` is a tiny scene that uses `Rot` and `Label`.
  - `Rot uses the scene's dur`: the same markup contains `dur="4s"` when `demo.dur = 4`, and `repeatCount="indefinite"`.
- [ ] **Step 2:** `npx vitest run src/components/steps/steps.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement `kit.tsx`, `StepPic.tsx` (import `SCENES` lazily from `./scenes/index`, which starts as `export const SCENES = {} satisfies Record<string, Scene>`; until Task 3 adds `SceneId`, `StepPic` takes `id: string`), the tokens and the CSS.
- [ ] **Step 4:** Run the test, `npm run typecheck` and `npm run lint`. Expected: PASS and clean.
- [ ] **Step 5:** Commit: `feat(steps): scene kit, material tokens and the StepPic player`.

---

### Task 3: Registry, `StepList`, panel wiring, gallery, coverage tests

**Files:**
- Create: `src/components/steps/registry.ts`, `src/components/steps/StepList.tsx`, `src/components/steps/Gallery.tsx`
- Modify: `src/components/BuildPanel.tsx:114-117`, `src/components/PrintPanel.tsx:72-77`, `src/App.tsx`, `src/components/steps/scenes/index.ts`
- Test: `src/components/steps/steps.test.ts`

**Interfaces:**
- Consumes: `STEP_TEXT` (Task 1); `Scene`, `SceneSvg`, `StepPic`, `T` (Task 2); `CUTBEND_HOWTO` from `src/lib/print/families/cutbend.ts`.
- Produces:
  ```ts
  // registry.ts (eager, no scene imports)
  import type * as S from "./scenes/index";                // type-only: keeps the scenes out of the eager chunk
  export type SceneId = keyof typeof S.SCENES;              // SCENES is declared `{ … } satisfies Record<string, Scene>`
  export const STEP_PICS: Record<string, SceneId>           // English key → scene
  export const DONE_GROUPS: string[][]                      // key lists claimed complete; tests require every key mapped
  // StepList.tsx
  export function StepList(p: { items: Msg[] }): JSX.Element
  ```
  `StepList` renders `<ol className="notes steps">`. Each `<li>` holds `<StepPic id title={text}/>` when `STEP_PICS[m.s]` exists, and in all cases a `<span>` with `fmtMsg(t, unit, m)`. It gets `t` from `useT()` and `unit` from `useStore(s => s.unit)`.

  `Gallery` lists every `SceneId`. Each entry shows its `SceneSvg` at 320 px, followed by every English key that maps to it, in full, under the scene. A toolbar has: theme (light/dark), language (en/uk, by setting the store language) and a "reduced" toggle that applies `controlScene` with `reduced: true`. It is shown from `App.tsx` when `new URLSearchParams(location.search).has("stepgallery")`, before the share-hash handling. It is dev review only and is not linked from the UI.

- [ ] **Step 1: Write the failing tests**, appended to `steps.test.ts`:
  - `every key in DONE_GROUPS has a picture`: `DONE_GROUPS.flat().filter(k => !STEP_PICS[k])` must equal `[]`.
  - `every picture id has a scene`: for every value of `Object.values(STEP_PICS)`, `SCENES[id]` is defined.
  - `every scene renders` (`it.each` over `Object.keys(SCENES)`): `renderToStaticMarkup(SceneSvg)` contains `<animate`.
  - `still is inside the loop`: `0 < s.still && s.still <= s.dur && s.dur >= 3 && s.dur <= 5` for every scene.
  - `every label fits`: render each scene with `t = (s, ...a) => translate("uk", s, ...a)` (the non-hook from `src/i18n.ts`). Every `<text>…</text>` inner text is ≤ 22 chars.
  - `no hard-coded colours`: the rendered markup of every scene matches neither `/#[0-9a-f]{3,6}\b/i` nor `/rgb\(/`.
  - `reports what is still missing` (always passes): `console.info` the count and the first 10 keys of `Object.values(STEP_TEXT).flatMap(Object.values)` plus all `PRINT_STRINGS` how-to lines that lack a picture.
- [ ] **Step 2:** Run it. Expected: the new tests pass trivially, because `SCENES` and `DONE_GROUPS` are empty. Add one temporary key to `DONE_GROUPS` and check that the first test FAILS, then remove it.
- [ ] **Step 3:** Implement the registry, `StepList` and `Gallery`. Swap the two `<ol>`s for `<StepList items={…}/>`. Add `"stepgallery"` handling in `App.tsx`. Gallery chrome strings go through `t()` and get UK entries.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck` and `npm run lint`. Expected: all green. Then run `npm run dev` and open the Build tab. The steps look exactly as before (no pictures yet, text unchanged), and `?stepgallery` opens an empty gallery.
- [ ] **Step 5:** Commit: `feat(steps): StepList rows with pictures, scene registry and review gallery`.

---

## Scene tasks (4–8): shared procedure

Every scene task follows the same five steps. Its table lists the scenes: id → the `STEP_TEXT` / `CUTBEND_HOWTO` keys it serves, the view, the labels (each a literal `t("…")`), and the motion.

- [ ] **Step 1: Failing test.** In `registry.ts`, add the task's key list to `DONE_GROUPS`, for example `Object.values(STEP_TEXT.wire)` or `CUTBEND_HOWTO.lever`. Run `npx vitest run src/components/steps/steps.test.ts`. Expected: FAIL in "every key in DONE_GROUPS has a picture", listing the task's keys.
- [ ] **Step 2: Draw the scenes** in the task's `scenes/<file>.tsx`, using only kit primitives and tokens. Add the scenes to `SCENES` (that extends `SceneId` by itself), the key → id entries to `STEP_PICS`, and a UK translation for every new label to `uk.ts`.
- [ ] **Step 3: Tests green.** Run `npm test`, `npm run typecheck` and `npm run lint`. Expected: PASS. The label-length, colour and still tests now cover the new scenes.
- [ ] **Step 4: Gallery review (Review Focus 1, 3, 5).** With `npm run dev` running, screenshot `http://localhost:5173/?stepgallery` four times: light, dark, `uk` and reduced. For example, use `google-chrome --headless --screenshot --window-size=1300,<tall>`, and scroll or split as needed.
  For each new scene, read each key sentence under it and check, clause by clause:
  - every named tool and part is drawn and labelled;
  - the motion goes in the direction the sentence says, in the same order;
  - the finished state is shown in the still;
  - nothing is unreadable in dark mode or overflows in UK.

  Fix and repeat until all of them pass. Save the screenshots in the scratchpad, not in the repo.
- [ ] **Step 5: Commit:** `feat(steps): <group> step animations`.

General drawing rules for all scene tasks:
- One scene, one action.
- Hold the finished state for about 25 % of the loop.
- `still` = the middle of that hold.
- A motion arrow (`Arrow`) appears with the motion and stays in the still.
- Hands are simple mitten outlines.
- No text other than labels: no sentences and no numbers, except angle marks, `B1`/`B2`/`R`/`L` and `SWR`.

### Task 4: Wire and common steps → `scenes/wire.tsx`

`DONE_GROUPS += Object.values(STEP_TEXT.wire), Object.values(STEP_TEXT.common)`

| id | keys | view · labels · motion |
|---|---|---|
| `cut-wire` | wire.cut, wire.cutLong | Above. A wire is laid along a `Ruler`, and a red `Mark` appears at the length. The `Cutters` close on the mark and the off-cut drops away. Labels: wire, ruler, mark, cutters. |
| `wind-coil` | wire.wind | Side view. The wire wraps turn by turn round a horizontal drill bit (`Draw` reveals the turns). A rotation arrow and a hand hold the lead. Labels: drill bit or bolt, wire. |
| `boom-strip` | wire.boom | Above. A paper strip is taped on the boom, then the drill comes down at a mark and an element slides through the hole. Labels: drilling strip, boom, drill, element. |
| `bend-assemble` | wire.bend | Above. A straight wire on a paper template with a red mark. `Pliers` grip at the mark and the free end swings to the template line. Labels: template, wire, mark, pliers. This drawing must not resemble any particular antenna (no loop or dipole). |
| `feed-line` | wire.feed | Above. Coax arrives with the braid and centre separated (`Coax stripped`). The centre goes to the left terminal and the braid to the right one, then the `Iron` touches both. Labels: coax, centre, braid, feed point, iron. |
| `feed-match` | wire.feedMatch, pcb.balun | Above. Coax → a box labelled "balun" → two short leads to the feed terminals. The coax slides in, the leads join and the iron touches. Labels: coax, balun, feed point. |
| `position` | common.position | Side view. The antenna on a mast starts next to a metal fence or car, then slides into open space. The fence fades and a check mark appears. Labels: metal, antenna. |
| `measure` | common.measure | Analyser box with a screen. The coax goes to the antenna, a SWR curve draws left to right, and its dip gets a red marker plus a down arrow. Labels: analyser, SWR, best match. |
| `trim` | common.trim | Two panels in one scene. Left: cutters nip a tiny piece off the wire end. Right: the curve's dip moves right. Repeats. Labels: trim, SWR. |
| `enclosure` | common.enclosure | A board lowers into an open case. Then the dip on a small SWR curve moves left. Labels: case, board, SWR. |
| `load-s1p` | common.s1p | A file card ".s1p" moves into a browser window with a "Simulation" tab, then two curves overlap (measured and model). Labels: .s1p, Simulation, measured, model. |
| `seal` | common.seal | A close-up of the feed point. Tape (`Draw`) wraps round it in a spiral. Labels: feed point, self-amalgamating tape. If that is over 22 chars, use "tape". |

### Task 5: PCB, loop and air-patch steps → `scenes/board.tsx`

`DONE_GROUPS += Object.values(STEP_TEXT.pcb), Object.values(STEP_TEXT.loop), Object.values(STEP_TEXT.air)`

| id | keys | view · labels · motion |
|---|---|---|
| `make-board` | pcb.make, loop.etch | Three beats. (1) A paper template is laid face-down on copper, with a "mirrored" icon. (2) The board is dipped in an etch tray. (3) It comes out showing traces. A fork arrow in beat 1 to a factory icon shows "or order it". Labels: template, copper, etch, order. |
| `board-connector` | pcb.connector, loop.connector | Above. An SMA edge connector slides onto the board edge. Its centre pin lands on the trace and its shell legs on the ground, then the iron touches. Labels: connector, centre pin, ground, iron. |
| `stack-boards` | pcb.stack | Side view. A vertical coax stands up and two or three boards slide down onto it, with spacers between them. Solder dots appear. Labels: coax, board, spacer. |
| `stitch-vias` | pcb.stitch | Above. A board edge with the ground pour, where dots (vias) appear one by one along the edge. An inset side cut shows the top and bottom copper joined. Labels: via, ground pour. |
| `loop-caps` | loop.caps | Above. A loop trace with two gaps. Capacitor "Cs" drops into the top gap and "Cp" across the feed, then a trimmer appears beside Cs. Labels: Cs, Cp, trimmer. |
| `loop-trim` | loop.trimmer | A screwdriver turns the trimmer and a small SWR dip moves to the marker. Then the trimmer fades and a fixed capacitor appears in its place. Labels: trimmer, SWR, fixed capacitor. |
| `cut-plates` | air.cut | Above. Snips follow a line on the sheet and a plate comes free. Then a file strokes the edge. Labels: sheet, snips, file. |
| `drill-plates` | air.drill | Above, with the two plates side by side. Holes are drilled at marked points: probe, then two standoffs on a centre line. Labels: probe hole, standoff holes, ground plate, patch plate. |
| `fit-jack` | air.jack | Side cut. The SMA panel jack comes up under the ground plate and its pin pokes through. A ruler shows the patch height and the cutters snip the pin there. Labels: SMA jack, ground plate, pin, height. |
| `mount-patch` | air.mount | Side view. The patch plate lowers onto the standoffs and comes to rest on the pin, then the iron touches the pin. Labels: patch plate, standoff, pin, iron. |
| `fit-director` | air.director | Side view. A director plate lowers onto taller standoffs above the patch, centred. A spacing arrow is drawn. Labels: director, patch, standoff. |

### Task 6: Cut board → `scenes/cutboard.tsx`

`DONE_GROUPS += CUTBEND_HOWTO.board`. The drawing must match the printed cut board: a flat bar with numbered blind holes, slits across the holes and engraved numbers. Before drawing, check its shape in `src/lib/print/families/cutbend.ts` (`cutBoards`, `boardHoles`).

| id | keys | view · labels · motion |
|---|---|---|
| `print-flat-board` | board[0] | A printer bed. The board builds up layer by layer (rects fade in from the bottom) with the numbers on top. Labels: print bed, numbers up. |
| `cutboard-cut` | board[1] | Above. A straight wire is pushed into hole "3" until it stops (the stop flashes), then the cutters close flush at the board edge. Labels: wire, hole, cutters, flush. |
| `cutboard-mark` | board[2] | Above. A pen moves along the slits and leaves red marks on the wire at each slit. Labels: pen, slit, mark. |
| `bend-order` | board[3], lever "B1 is the mark nearest…", plate "B1 is the mark nearest…" | A straight wire with its cut end on the left and B1, B2, B3 marks. "B1" pulses first, then B2, then B3, with an arrow from the cut end. Labels: cut end, B1, B2, B3. |

### Task 7: Lever bender → `scenes/lever.tsx`

`DONE_GROUPS += CUTBEND_HOWTO.lever`. The drawing must match the printed lever bender: base with tab and block, hexagon nut pocket, die bolt, lever with roller hole, stop holes on engraved angle lines every 15°. Before drawing, read `benderLever`, `benderGeometry` and `leverSolids` in `cutbend.ts`, and copy their layout (relative positions, which side the tab is on). The v3 mockup is the starting point for `lever-swing`.

| id | keys | view · labels · motion |
|---|---|---|
| `bender-choice` | lever[0], plate[0] | The lever bender and the bending plate side by side, with "or" between them. One gets a check mark, then the other, alternating. Labels: lever bender, bending plate. |
| `lever-print` | lever[1] | Printer bed. The base stands on its long edge (tab and block visible) and the lever lies flat. Both build up layer by layer. Labels: base, lever. |
| `lever-assemble` | lever[2] | The nut drops into the hexagon on top. The die bolt screws up from below (`Rot` on the bolt plus an upward `Move`). The lever slides down onto the die. Labels: nut, die bolt, lever. |
| `lever-roller` | lever[3] | Side cut. The roller bolt drops head-up into the lever hole and its tip rests on the hole's bottom, clear of the base. Labels: roller bolt, lever, base. |
| `lever-vise` | lever[4] | Side view. The tab goes between the vise jaws and the jaws close. The die bolt head sticks out under the base. Labels: vise, tab, die bolt head. |
| `lever-stop` | lever[5] | Above. The engraved lines pulse (long ones at 45/90/135/180). A stop bolt drops head-up into the 90° hole. Labels: stop bolt, 90°, engraved lines. |
| `lever-load` | lever[6] | Above. The wire slides through the block's groove between the die and the roller. The cut end goes past the die, and the red mark meets the engraved line on the lever (the line flashes on alignment). Labels: wire, die, roller, cut end, mark. |
| `bend-order` | lever[7] | (scene from Task 6) |
| `bend-rl` | lever[8], plate[6] | Above. The wire with bends labelled R, R, L. At the change to L, the wire turns half a turn about its own axis (`Rot` on a side-on inset showing the bend now pointing the other way). Labels: R, L, turn over. |
| `lever-swing` | lever[9] | The v3 mockup scene. The lever swings to the stop, goes 2–5° past it (an arrow and a "+3°" tick), then releases and the wire springs back onto the line. Labels: lever, stop bolt, springback. |

### Task 8: Bending plate → `scenes/plate.tsx`

`DONE_GROUPS += CUTBEND_HOWTO.plate`. The drawing must match the printed plate: a flat plate with engraved lines, a block with a groove, and three countersunk holes (die, trap and stop). Before drawing, read `benderPlate` in `cutbend.ts`.

| id | keys | view · labels · motion |
|---|---|---|
| `bender-choice` | plate[0] | (Task 7) |
| `plate-print` | plate[1] | Printer bed. The plate lies flat with its lines up and builds layer by layer. Labels: plate, lines up. |
| `plate-bolts` | plate[2] | Side cut. Three countersunk bolts push up from below and their heads sit flush with the bottom (a flush tick). Labels: die, trap pin, stop, countersunk head. |
| `plate-stops` | plate[3] | Above. The engraved lines pulse in turn (15° steps, long lines at 45/90/135/180) and the stop holes at those angles highlight. Labels: stop holes, 45°, 90°, 135°, 180°. |
| `plate-load` | plate[4] | Above. The wire slides through the groove between the trap pin and the die, with the cut end past the die and the mark on the engraved line at the die. Labels: wire, trap pin, die, mark. |
| `bend-order` | plate[5] | (Task 6) |
| `bend-rl` | plate[6] | (Task 7) |
| `plate-bend` | plate[7] | Above. A hand pushes the free end round the die until it hits the stop bolt, then 2–5° past it, then lets go and it springs back. Labels: hand, die, stop bolt, springback. |

---

### Task 9: Batch-1 finish: performance, phone, docs

**Files:**
- Modify: `CLAUDE.md` (layout block: `src/components/steps/` line; Conventions: "new step sentences go in `STEP_TEXT`; register a scene in `steps/registry.ts`")
- Test: none new. This task is verification.

- [ ] **Step 1:** Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`. Expected: all green. In `dist/assets`, the scenes appear in their own chunk, separate from the main `index-*.js` (check the build output list).
- [ ] **Step 2: Performance (Review Focus 4).** Open the app and choose a wire design with a boom (for example a Yagi), then the Build tab. In the DevTools Performance panel, record 5 s of scrolling. Expected: no long frames > 50 ms caused by SVG animation, and in the Elements panel, off-screen scenes are paused (`svg.animationsPaused()` is true in the console for an off-screen one).
- [ ] **Step 3: Phone and enlarge.** At 390 px wide, the pictures sit above the text and nothing scrolls horizontally. Tap a picture: the overlay opens large and closes with Esc, ✕ and the backdrop.
- [ ] **Step 4: Print panel.** Pick a design that has the cut board and lever bender (for example a Moxon). Open the Print panel and select the cut board, the lever bender and the bending plate in turn. Each how-to line has its picture, the "Hole n: cut…" rows and bolt-list rows stay plain text, and other parts (batches 2–4) still show text only.
- [ ] **Step 5:** Update `CLAUDE.md` and commit: `docs: build step animations (batch 1) in CLAUDE.md`.
