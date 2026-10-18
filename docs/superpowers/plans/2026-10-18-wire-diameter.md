# Wire Diameter for Every Wire Antenna Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user set the wire Ø on the five sky-cone wire cages and the S40 shorting wire. Geometry, BOM,
printed jigs and the tabulated Simulation results all follow it. Also add a whip Ø on the collinear and drop the 1 mm
floor on the spring radials.

**Architecture:**
- **Tables (Python):** re-run the existing NEC-2 table scripts in `tools/wideband-antenna` at Ø 0.5/0.8/1.5/2.0 mm
  (reference scale), with the hub ring grown to fit thick wire. Add them to each `SkyconeTable` as compact `wires`
  variants that share the base table's frequency grids.
- **Interpolation (TypeScript):** `tableAt(t, dRef)` returns a table whose `r`/`x`/`g`/`bare` are interpolated in log(Ø).
  Every existing consumer (`skyconeZ`, `skyconeGain`, `tablePerf`, synth) keeps working unchanged once it is handed
  that table.
- **Plumbing:** the design carries the reference-scale Ø it was built for (`Design.skyconeWire`).

**Tech Stack:** TypeScript 6 / React 19 / Vitest; Python 3.12 + PyNEC (venv in
`/tmp/claude-1000/-home-vkopytsia-Projects-antenna-generator/5ef02d81-4f02-4d42-a761-e7e65e0dd628/scratchpad/venv`).

**Spec:** `docs/superpowers/specs/2026-10-18-wire-diameter-design.md`

## Global Constraints

- **Tabulated diameters:** Ø 0.5, 0.8, 1.0, 1.5, 2.0 mm at each table's reference band (`t.fLo`). 1.0 mm is the
  existing base table.
- **Interpolation:** `dRef = d / s` with `s = t.fLo / fLow`. Linear in log(dRef) between neighbouring tables. Outside
  the tabulated range: clamp plus a Simulation note, no extrapolation.
- **Hub:** `hub(d) = max(3e-3, n · d · 1.1 / (2π))` at reference scale (n = 16). This gives Ø ≤ 1.1 mm → 3 mm (no
  change), Ø1.5 → 4.20 mm, Ø2.0 → 5.60 mm. The same formula is used in Python and TS.
- **Thick-wire segmentation:** `seg = max(1.5e-3, 4 · r)`, and ≤ λ/10 at the top frequency. Convergence check: Z moves
  < 2 % and gain < 0.2 dB against `seg × 0.75`. If 2.0 mm fails, the top table becomes 1.5 mm.
- **Ø1 gate:** re-run 1.0 mm first. Within 0.5 Ω (R and X) and 0.1 dB (gain) everywhere: keep the committed data.
  Otherwise regenerate every diameter, update the tests, and report the drift.
- **Param:** key `d` (so Synthesis passes its "Element diameter"), `kind: "length"`, min 0.2e-3, max 5e-3, default
  1e-3 absolute. The label is "Wire diameter" on the cages and "Shorting wire diameter" on S40.
- **A55:** the effective Ø is capped at what fits its coil, `min(coilDia / 3, 0.8 · coilPitch)` at reference scale.
  Geometry, BOM and simulation all use the capped value, and a note is added.
- **No re-optimisation:** the frames, shorting wire position and capacitors stay as tabulated. Only the hub radius
  follows Ø.
- **Process rules:**
  - Kill runs by PID only. Never `pkill -f` or `pgrep -f` guards. Wait on output files.
  - About 600 MB of disk is free: no new venvs, and delete `*.log` noise after runs.
- **Repo conventions:**
  - English labels go in UK `src/i18n/uk.ts`, and `src/i18n.test.ts` must pass.
  - New simulate notes go in `SIM_STRINGS`.
  - No enums.
  - Commit with plain `git`, ending with the attribution lines.

## Review Focus

1. **Synthesis passes a large `d`** (its "Element diameter", e.g. 12 mm) into a cage. It must clamp, add the note, and
   produce no NaN in the SWR or ranking. Test in Task 4.
2. **Old share links / localStorage without `d`** for a cage build at Ø1 mm absolute and don't throw. Test in Task 4.
3. **Bare coax plus non-1 mm wire:** the bare rows are interpolated too, so changing Ø changes the bare-coax SWR. Test
   in Task 3.
4. **A cage moved to a much higher band** (`s` ≪ 1, so dRef ≫ 2 mm): clamped, noted, and the geometry still builds
   (hub large but valid). Test in Task 4.
5. **A55 with `d` above the coil limit:** the BOM, coil and Simulation use the capped Ø, with the note. Test in Task 4.

---

### Task 1: Python: hub, segment and wire Ø configurable; run script; Ø1 gate

**Files:**
- Modify: `tools/wideband-antenna/family10.py`: `HUB_R` (line 39) from env `HUB_R`, default `3.0e-3`.
- Modify: `tools/wideband-antenna/wirecage.py`: `HUB_R` (line 38) from env `HUB_R`.
- Modify: `tools/wideband-antenna/export_shaped_table.py`: line 58 `seg=1.5e-3` becomes env `SEG`, default `1.5e-3`;
  `cage.hub` (line 52) records the `HUB_R` used.
- Modify: `tools/wideband-antenna/export_cage_table.py`: optional env `SEG` passed as `seg=` to `W.model` (otherwise
  `per=30` as now).
- Modify: `tools/wideband-antenna/export_bare_table.py` and `export_sheet_table.py`: honour `SEG` for antenna wires.
  `cable_seg` is unchanged.
- Create: `tools/wideband-antenna/wire_variant.py`: helper `hub_for(d_m, n=16) -> float` and
  `seg_for(d_m, f_hi) -> float` (the Global Constraints formulas), plus a CLI that prints the env for one diameter.
  Example: `python wire_variant.py 1.5e-3 7e9` prints `RWIRE=0.00075 HUB_R=0.0042 SEG=0.003`.
- Create: `tools/wideband-antenna/compare_tables.py`:
  `python compare_tables.py <a.json> <b.json>` prints the max |ΔR|, |ΔX| (Ω) and |Δg| (dB) over the common grid.
  It reads app_*.json / bare_*.json, or a `SKYCONE_X` entry when passed `skycone.data.ts:SKYCONE_W16`.
  Exit code 0 if within `--tol-z 0.5 --tol-g 0.1`.
- Create: `tools/wideband-antenna/results/run_wires.sh`: for each design (W16, W65, W40, B44f, A55, S40) and each
  diameter in `$DS` (default `1.0`), writes `wires/app_<D>_d<mm>.json` and `wires/bare_<D>_d<mm>.json`. It uses the
  same command lines, bands and `nf` as `run_bare.sh` and the README pipeline, with env from `wire_variant.py`.
  - Parallelise across designs, at most 8 processes, using `&` plus `wait`.
  - Write `wires/done_<D>_d<mm>` per pair.
- Commit: `tools/wideband-antenna/app_A55.json`, `app_B44f.json`, `app_W40.json` (the inputs for those designs).

**Interfaces:**
- Produces: `wires/app_<D>_d<mm>.json` in the same JSON shape as today's `app_*.json` (`f`, `r`, `x`, `g`, `els`, `cage`
  with `r`, `hub`), and `wires/bare_<D>_d<mm>.json` in today's bare shape. `<mm>` is `0.5`, `0.8`, `1.0`, `1.5`, `2.0`.

- [ ] **Step 1:** Check `python wire_variant.py 1.0e-3 6.4e9` prints `HUB_R=0.003 SEG=0.0015`, and
  `python wire_variant.py 2.0e-3 6.4e9` prints `HUB_R=0.0056` with `SEG=0.004`.
- [ ] **Step 2:** Run the gate: `DS=1.0 nohup ./results/run_wires.sh &` (run from `tools/wideband-antenna`, `PY` = the
  venv python). Wait on the `wires/done_*_d1.0` files.
- [ ] **Step 3:** Run `compare_tables.py wires/app_<D>_d1.0.json ../../src/lib/antennas/skycone.data.ts:SKYCONE_<D>`
  for all six designs, and the same for bare. Record the numbers. On a failure, stop and report the drift to the user
  before continuing. The spec's fallback is to regenerate all of them.
- [ ] **Step 4:** Commit the scripts, the three app_*.json inputs and the gate results.

### Task 2: Python: convergence check, then the four new diameters

**Files:**
- Create: `tools/wideband-antenna/wires/` outputs (JSON only).
- Modify: `tools/wideband-antenna/README.md`: a "Wire-diameter tables" section covering the commands, the gate, the
  convergence rule and the regeneration order (`to_ts.py`, then `add_bare.py`, then wires).

- [ ] **Step 1:** Run the convergence check for W16 and B44f at Ø2.0 mm: once with `SEG` from `wire_variant.py` and once
  with `SEG × 0.75`. Use `compare_tables.py --rel-z 0.02 --tol-g 0.2` (add a relative-Z option). If it fails, try
  Ø2.0 with `SEG × 1.25`. If it still fails, drop 2.0 from `DS` and record that.
- [ ] **Step 2:** Compute the A55 coil limit, `min(coilDia / 3, 0.8 · pitch)` in reference mm, from `app_A55.json`
  (pitch = short-wire length along the axis / turns). Restrict A55's `DS` to tabulated diameters ≤ that limit.
- [ ] **Step 3:** Start `DS="0.5 0.8 1.5 2.0" nohup ./results/run_wires.sh &` in the background (3–5 h) and wait on the
  done files.
- [ ] **Step 4:** Sanity check: SWR ≤ 2 bandwidth per design per Ø, printed as a small table by
  `compare_tables.py --summary`. It should be monotonic or close to it. A jump > 1 dB in gain between neighbours is a
  red flag; investigate before continuing.
- [ ] **Step 5:** Commit the outputs and the README.

### Task 3: Data format, generator and interpolation

**Files:**
- Modify: `tools/wideband-antenna/to_ts.py`:
  - Copy `bare` through, which fixes the dropped-bare bug. Also correct the docstring in `export_bare_table.py:10`.
  - Add `--wires <dir>`, which attaches the variants to each entry.
  - Assert every variant's `f` (and bare `f`) equals the base grid to 1e-9.
- Modify: `src/lib/antennas/skycone.data.ts`: regenerated.
- Modify: `src/lib/antennas/skycone.ts`: new type field, `tableAt`.
- Test: `src/lib/antennas/skycone.test.ts`.

**Interfaces:**
- Produces, on `SkyconeTable`:

  ```ts
  /** Re-solved at other wire diameters (reference scale, m), on the base table's f / bare.f grids; the base table is
   *  its own wire (2·cage.r, or 2·short.r for S40). hub: the hub ring radius used (m). */
  wires?: { d: number; hub?: number; r: number[]; x: number[]; g: number[][]; bare?: { r: number[][]; x: number[][] } }[];
  ```

- Produces: `export function tableAt(t: SkyconeTable, dRef: number): { t: SkyconeTable; clamped: boolean }`.
  - It returns `t` itself when dRef equals the base Ø within 1e-6 relative.
  - Otherwise it returns a shallow copy with `r`, `x`, `g` and `bare.r`/`bare.x` interpolated linearly in log(d)
    between the two neighbouring diameters (the base counts as one of them), and `cage.r` / `short.r` / `cage.hub` set
    to the interpolated values.
  - Results are memoised per (t, dRef rounded to 1e-6).
- Produces: `export const baseWire = (t: SkyconeTable) => number`, the base Ø (m).
- Produces: `export const hubFor = (n: number, dRef: number) => Math.max(3e-3, (n * dRef * 1.1) / (2 * Math.PI))`.

- [ ] **Step 1: Write the failing tests** in `skycone.test.ts`, under `describe("wire diameter tables")`:
  - `"every wire cage and S40 has variants on the base grid"`: for skyconecage, skyconecagemini, skyconecage40,
    skyconecage44, skyconecage55 and skycone40, `t.wires!.length >= 3`, every `r.length === t.f.length`, and `bare`
    lengths equal `t.bare.f.length`.
  - `"tableAt reproduces each tabulated diameter exactly"`: for every variant `w`,
    `tableAt(t, w.d).t.r` equals `w.r`, and the same for `g[10]` and `bare.r[1]`.
  - `"tableAt at the base wire is the base table"`: `tableAt(t, baseWire(t)).t === t`.
  - `"halfway in log Ø lies between its neighbours"`: at `sqrt(0.8e-3 * 1e-3)`, every R lies within
    [min, max] of the two neighbours.
  - `"outside the range clamps"`: `tableAt(t, 10e-3)` gives `clamped: true` and `r` equal to the largest variant's `r`.
  - `"bare rows follow the diameter"`: for W16, `skyconeZ(tableAt(t, 0.5e-3).t, t.fLo, 1.2e9, 1)` differs from the base
    by > 0.1 Ω.
  - `"the variant hub follows hubFor"`: for every variant with `hub`, `hub` is within 1e-6 of `hubFor(16, w.d)`.
- [ ] **Step 2:** Run `npx vitest run src/lib/antennas/skycone.test.ts`. Expected: FAIL (`tableAt` and `wires` are not
  defined).
- [ ] **Step 3:** Regenerate the data file with
  `python to_ts.py app_*.json --wires wires > ../../src/lib/antennas/skycone.data.ts`, using the same input list and
  order as today's header comment. Then run `git diff --stat`: only the `wires` arrays may be added, and the base fields
  must be byte-identical. Check with `compare_tables.py` against `git show HEAD:...` if in doubt. Implement `tableAt`,
  `baseWire` and `hubFor`.
- [ ] **Step 4:** Run `npx vitest run src/lib/antennas/skycone.test.ts`. Expected: PASS, including all the old tests.
- [ ] **Step 5:** Commit.

### Task 4: Wire Ø param on cages and S40, wired through build, simulate, synth, perf

**Files:**
- Modify: `src/lib/types.ts`: `Design.skyconeWire?: { dRef: number; clamped: boolean; capped?: boolean }`.
- Modify: `src/lib/antennas/skycone.ts`:
  - The param lists: new `PARAMS_CAGE`, `PARAMS_CAGE_TUBE` and `PARAMS_CAGE_TUBES` for the cages, and
    `PARAMS_SHORT` for S40.
  - Defaults `d: 1e-3`.
  - `buildCage`: `r = dRef/2 · s`; hub through `cageFrames(t, s, hub)`; the A55 cap; `tablePerf` called with
    `tableAt(...)`.
  - `build` for S40: the short wire's `r`.
  - `skyconeCurrents` uses `d.skyconeWire` for the element radius.
- Modify: `src/lib/simulate.ts`: `skyconeSim` uses `tableAt(t, d.skyconeWire.dRef).t`. Add notes `SKYCONE_WIRE_CLAMP`
  and `SKYCONE_WIRE_DETUNE`, both in `SIM_STRINGS`. Update the cage note text to "precomputed NEC-2 sweeps of this cage
  at several wire diameters".
- Modify: `src/lib/synth.ts:153-161`: use `tableAt` the same way.
- Modify: `src/i18n/uk.ts`: UK for "Shorting wire diameter", the new notes and the changed cage note.
- Test: `src/lib/antennas/skycone.test.ts`, `src/lib/simulate.test.ts`, `src/lib/synth.test.ts`,
  `src/lib/build.test.ts`.

**Interfaces:**
- Consumes: `tableAt`, `baseWire`, `hubFor` (Task 3).
- Produces: `Design.skyconeWire` set by every cage build and S40, where `dRef` is the clamped/capped reference Ø the
  table is read at. Produces `cageFrames(t: SkyconeTable, s: number, hub = (t.cage!.hub)): …` with the hub radius in
  metres at reference scale.
- Notes (exact copy):
  - `SKYCONE_WIRE_CLAMP = "Your wire is thinner or thicker (for this size) than the precomputed diameters: the Simulation uses the nearest one."`
  - `SKYCONE_WIRE_DETUNE = "The shape was optimised for Ø1 mm wire at its reference size; other wire shifts the match. The Simulation shows that wire on the same shape (not re-optimised)."`
  - The A55 design note: `"The coiled shorting wires can't be wound from wire this thick: the wire diameter is capped at what fits the coil."`
    It goes in `design.notes`. Add its UK translation.

- [ ] **Step 1: Write the failing tests:**
  - skycone.test.ts:
    - `"default Ø1 mm at the reference band is the old design"`: for each cage and S40, `def.build({ bands })` (the
      def's default band, no `d`) gives `d.skyconeWire.dRef === 1e-3`. The existing number tests at lines 39–205 stay
      unchanged and must still pass.
    - `"thicker wire: BOM, Dimensions and hub follow"`: for skyconecage with `d: 2e-3`, every `cuts[*].dia` of a frame
      is 2e-3, the "Wire diameter" Dimension is 2e-3, and the hub ring radius is ≈ 5.60 mm (`hubFor(16, 2e-3)`).
    - `"S40: the shorting wire Ø changes, the sheet doesn't"`: with `d: 0.5e-3` the tag `S` wire's `r` is 0.25e-3 and
      the sheets are deep-equal to the default build.
    - `"A55 caps the wire at the coil"`: with `d: 3e-3`, `skyconeWire.capped` is true, the shorting wire cut `dia` is
      ≤ the cap, and the note is present.
    - `"an old saved design without d still builds"`: `build({ bands: "960e6-6400e6", coax: "ferrite" })` gives
      dRef 1e-3.
    - `"a cage moved far up the band clamps but builds"`: skyconecage at `"5e9-33e9"`, `d: 1e-3` gives `clamped` true,
      and every wire is finite.
  - simulate.test.ts:
    - `"cage Ø changes the Simulation"`: skyconecage at the default band. `d: 0.5e-3` vs `d: 2e-3` give a max |ΔZ| over
      the sweep > 1 Ω. The `SKYCONE_WIRE_DETUNE` note is present for both and absent at 1e-3.
    - `"cage Ø outside the tables is noted"`: `d: 5e-3` gives `SKYCONE_WIRE_CLAMP` in the notes.
  - synth.test.ts:
    - `"a synthesis element diameter far outside a cage's tables still scores it"`: synthesize with `d = 12e-3`. The
      skyconecage candidate's `swr` values are all finite.
- [ ] **Step 2:** Run `npx vitest run src/lib`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement as in Files/Interfaces.
  - Effective dRef: `d / s`, then the A55 cap, then the clamp to `[min, max]` of the tabulated diameters for
    `skyconeWire.dRef`. The geometry uses the unclamped dRef (A55: capped), and the Simulation reads the clamped one.
  - The hoop and spoke caps `min(r, …)` stay.
  - `hoopSeats(…, 2 * r, …)` already follows `r`.
- [ ] **Step 4:** Run `npm test && npm run typecheck && npm run lint`. Expected: all pass, including `i18n.test.ts`.
- [ ] **Step 5:** Commit.

### Task 5: Printed parts follow and build at the extremes

**Files:**
- Modify (only if a test fails): `src/lib/print/families/skycone.ts`, where `frameGrooves` and the hoop-step jig take
  `wireD`.
- Test: `src/lib/print/families/skycone.test.ts` (or the existing print test file that builds skycone parts; look for
  `skyconeParts` in the `*.test.ts` files).

- [ ] **Step 1: Write the failing test.** Title: `"cage jigs build watertight or report too large at Ø0.2 and Ø5 mm"`.
  - For skyconecage and skyconecage44 with `d` in `[0.2e-3, 2e-3, 5e-3]`, every part from `skyconeParts` builds
    watertight (same check the existing print tests use) or is reported "too large".
  - The cradle's groove width equals `2 · r` in mm.
- [ ] **Step 2:** Run it. Expected: it may FAIL at 5 mm because the grooves merge near the hub.
- [ ] **Step 3:** Fix it. Stop the grooves short where adjacent ones would overlap: start them at the radius where the
  arc spacing ≥ wireD + 0.4 mm. Keep the rest unchanged.
- [ ] **Step 4:** Run `npx vitest run src/lib/print`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 6: Collinear whip Ø and spring radials

**Files:**
- Modify: `src/lib/antennas/collinear.ts:13-20,33`: new param
  `{ key: "wd", label: "Whip diameter", kind: "length", min: 0.3e-3, max: 10e-3 }` with default `wd: 2e-3`. The whip
  wire's `r` becomes `wd / 2`.
- Modify: `src/lib/antennas/spring.ts:118`: the radials' `r` becomes `r`.
- Modify: `src/i18n/uk.ts`: "Whip diameter": "Діаметр штиря".
- Test: the existing antenna tests, `src/lib/antennas/*.test.ts` for collinear and spring.

- [ ] **Step 1: Write the failing tests:**
  - `"collinear whip follows its own diameter"`: with `wd: 4e-3`, the tag `W` wire has `r === 2e-3`. The default build's
    whip `r === 1e-3`, the same as today.
  - `"spring radials use the spring's wire"`: with `d: 0.6e-3`, every `ground` wire has `r === 0.3e-3`.
- [ ] **Step 2:** Run `npx vitest run src/lib/antennas`. Expected: FAIL.
- [ ] **Step 3:** Implement. If a spring MoM-number test moves because of the radial change, update its expected value
  from a fresh run, and say so in the commit message.
- [ ] **Step 4:** Run `npm test && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 7: Docs

**Files:**
- Modify: `docs/ANTENNAS.md`: a "Wire diameter tables (sky-cone cages, S40)" section covering:
  - the method (NEC-2 re-runs, the hub rule, segmentation and convergence numbers from Task 2, the Ø1 gate result);
  - per design, the SWR ≤ 2 range at 0.5 / 1.0 / 2.0 mm (from `compare_tables.py --summary`);
  - the A55 cap.
- Modify: `CLAUDE.md`: in the Layout skycone line, mention `wires` variants plus `tableAt`, and `run_wires.sh` /
  `wire_variant.py` / `compare_tables.py`. Remove nothing else.

- [ ] **Step 1:** Write both. The numbers must come from the Task 2 outputs, not be typed from memory.
- [ ] **Step 2:** Run `npm test && npm run build`. Expected: PASS. Check that the bundle grew by less than about
  0.5 MB (`ls -l dist/assets`).
- [ ] **Step 3:** Commit.
