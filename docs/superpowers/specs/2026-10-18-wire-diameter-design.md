# Wire diameter for every wire antenna

Date: 2026-10-18

## Intent

People build these antennas from the wire they have on hand, and not everyone has the same Ø. Every antenna made of
wire must therefore let the user set the wire diameter, and everything that depends on it must follow: geometry, BOM and
cut list, printed parts (grooves), exports and **the simulation results**.

## Current state (audit of all 37 types)

- **These already have a diameter param that flows through the BOM, NEC/FreeCAD export and printed parts:** dipole,
  fandipole, groundplane, jpole, moxon, quad, yagi and biquad use `DIAM`; helix, spring, discone and cloverleaf have
  their own `d`. Their simulation is the live MoM, so the results already follow it. **No change.**
- **Not in scope because they have no physical wire:** printed/PCB antennas (they use trace width `w`), the patches
  (probe pin), and the sheet sky-cones skycone7/8/21 (the solid sheet; the feed pin and coax are fixed hardware).
- **Gaps:**
  1. **Wire cages:** skyconecage (W16), skyconecagemini (W65), skyconecage40 (W40), skyconecage44 (B44), skyconecage55
     (A55). The wire radius is `cage.r · s` (Ø1 mm at the table's reference band, scaled by the band factor `s`). There
     is no param, and the Simulation tab is only the precomputed NEC-2 table solved at that one radius.
  2. **skycone40 (S40):** the shorting wire is `short.r · s` (Ø1 mm reference), with the same table-only simulation.
  3. **Secondary hard-coded wires:**
     - The collinear top whip is `min(od/2, 1 mm)`.
     - The spring radials are `max(r, 0.5 mm)`, which puts a 1 mm Ø floor under them.

## Goals

- A "Wire diameter" param on the five cages. It covers the frames, hub spokes/hoops (they keep their existing caps
  relative to it), the axis link and the shorting wires, all of which the solver models with one `RWIRE`.
- A "Shorting wire diameter" param on S40.
- The Simulation tab results (SWR/Z sweep, gain/pattern, Performance rows, bare-coax variants, Synthesis ranking) change
  with the chosen diameter. This comes from re-running the existing NEC-2 table pipeline at several diameters and
  interpolating between them.
- BOM, cut list, Dimensions, the 1:1 templates, printed jig grooves (`print/families/skycone.ts`) and the NEC export
  follow the chosen diameter. Most of this already reads `d.wires[*].r`, so it follows once the radius changes.
- The collinear whip gets its own "Whip diameter" param, and the spring radials use the spring's wire `d` (floor removed).

## Non-goals

- **No re-optimisation of the cage geometry per diameter** (user decision). The design stays as optimised for Ø1 mm.
  A different wire shows how that wire detunes the design: frame spacing, shorting wire position and the A55 capacitors
  stay fixed.
- No new solver in the browser. The in-app MoM stays off for these types.
- The J-pole tap (r/2 of the main wire) stays as it is.
- No change to the antennas that already have a diameter param.

## Anti-goals

- The default must change nothing for a user at the table's reference band. A sweep at Ø1 mm must reproduce today's
  numbers there; existing tests must stay green.
- No silent extrapolation. Outside the tabulated diameters, clamp and say so.
- Don't strip the existing `bare` blocks when regenerating `skycone.data.ts`. `to_ts.py` drops them, so `add_bare.py`
  must be rerun afterwards, or the generator fixed.

## Decisions taken

- **Tabulated diameters (user approved):** Ø 0.5, 0.8, 1.0, 1.5, 2.0 mm, at each table's reference band (`fLo` of the
  table). 1.0 mm already exists, so it is a regression check.
- **Solver:** the existing NEC-2 (PyNEC) table scripts in `tools/wideband-antenna`. The wire radius enters through
  `RWIRE` (env var; `export_cage_table.py` takes `wire_r_mm` for W16). The S40 sheet grid keeps its own grid-frame radius;
  only the shorting wire's radius changes.
- **Every diameter variant includes the bare-coax rows** (0.5 / 0.8 / 1.1 λ), so the `coax` param keeps working with any
  diameter.
- **Interpolation variable:** wire Ø relative to the antenna's size, i.e. `dRef = d / s`, where `d` is the user's
  absolute diameter and `s = t.fLo / fLow` is the existing band scale. Interpolate linearly in log(dRef) between the two
  neighbouring tables, for R, X, gain (dB) and bare R/X, on top of the existing log-f interpolation. Outside
  [0.5, 2.0] mm reference, clamp to the end table and add a Simulation note.
- **Radiation view currents:** taken from the nearest-diameter table (only the 1.0 mm table needs to carry `cur`).
- **Hub grows to fit thick wire (user decision).** The 16 frames meet at a hub ring of r = 3 mm (reference band), about
  18.8 mm round, so they fit only up to about Ø1.1 mm. For thicker wire the hub radius grows just enough to fit them:
  `hub(d) = max(hub0, n · d · k / (2π))`. The builder picks the clearance factor k (≈ 1.2). The NEC model of each
  diameter table uses that hub, so the results include it. The app geometry, BOM (washer/collar), Dimensions and printed
  jigs use the same formula. This is the only geometry change; everything else stays as optimised.
- **Thick-wire solver validity (my call).** NEC-2 thin-wire needs segments of several wire radii (today 1.5 mm segments,
  Ø1 mm wire). For the 1.5 and 2.0 mm tables, lengthen the segments, e.g. ≥ 4 r, still ≤ λ/10 at the top frequency.
  Check convergence by comparing two segmentations: Z moves < 2 % and gain < 0.2 dB. If 2.0 mm can't pass, the top
  tabulated diameter becomes 1.5 mm and the clamp follows. Record the numbers in docs/ANTENNAS.md.
- **Ø1 mm reproduction gate (my call).** Before the other runs, re-run Ø1.0 mm for every design with the current
  scripts. Within 0.5 Ω on R/X and 0.1 dB on gain: keep the committed 1.0 mm data. Otherwise regenerate every diameter
  (including 1.0) from the current code, update the affected tests and note how far the numbers moved. The untracked
  `app_A55.json`, `app_B44f.json` and `app_W40.json` are the inputs for those designs and get committed.
- **A55 coiled shorts.** Thick wire can't be wound into the 3.6 mm coil, and NEC is meaningless there. Limit A55's
  tabulated range to what fits the coil pitch (builder computes it, probably ≤ 1.0 mm), clamp the param there and add a note.
- **Param upper limit.** The param range is 0.2–5 mm, but the simulation clamps to the tabulated range and says so. The
  printed jigs must build or report "too large" at 5 mm, as the existing rule requires.

## Constraints

- The Python venv with PyNEC is in an old scratchpad:
  `/tmp/claude-1000/-home-vkopytsia-Projects-antenna-generator/5ef02d81-4f02-4d42-a761-e7e65e0dd628/scratchpad/venv`.
- The disk has about 600 MB free. Outputs are small JSON files, but don't create new venvs.
- Cost is about 10 s per frequency point per core and 64 points per table, plus 3 × 64 bare points. That is roughly
  10 min per design per diameter on 8 cores, and 3–5 h of background runs for 4 new diameters × 6 designs.
- Kill runs by PID, never with `pkill -f`. Wait on output files, not `pgrep`. See the memory notes.
- Bundle: `skycone.data.ts` is 309 KB. Variants store only `r`, `x`, `g` and `bare`, about 15 KB each, so about
  +360 KB in total. That is acceptable.
- Project conventions from CLAUDE.md:
  - No enums.
  - English label strings, with UK translations added in `src/i18n` (`i18n.test.ts` enforces coverage).
  - New Simulation notes go in `SIM_STRINGS`.
  - Values with numbers go through `Msg`.

## Left to the builder

- **Table format:** a `wires?: { d: number[]; r; x; g; bare }[]` array on `SkyconeTable`, or separate exported tables
  keyed by diameter. Keep the 1.0 mm entry's existing fields as they are.
- **Param form:** a `length` param on the cages and S40, default 1.0 mm absolute. My call: a fixed absolute default is
  what people buy. At bands other than the reference this changes today's results slightly, because today the wire
  scales with the band. That change is accepted, and the affected tests are updated with a note. Range 0.2–5 mm. The
  clamp to the tabulated range is in reference terms.
- **Run scripts:** how the run scripts are structured (a `results/run_wires.sh` driving the export scripts with `RWIRE`
  per design, parallelised). They must be committed, and the workflow documented in `tools/wideband-antenna/README.md`.
- **Hub spokes/hoops** keep their `min(r, …)` caps (relative to the grown hub).
- **Tests:**
  - At the tabulated diameters the interpolation reproduces the table exactly.
  - The Ø1 mm reference-band results equal the old ones.
  - Thicker wire changes Z monotonically or plausibly, e.g. a wider SWR bandwidth on W16.
  - BOM and print grooves follow the param.
  - Every part still builds watertight at 0.2 mm and 5 mm.
- **docs/ANTENNAS.md:** a short section on the diameter tables, with a few numbers per design (e.g. the SWR ≤ 2 range at
  0.5 / 1 / 2 mm).
