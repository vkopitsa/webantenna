# Wire bend jigs (3D-printed) — design

## Intent

People who build a wire antenna from the app today get a cut list and, for some types, parts that *hold* the
wire (spreader corner caps, biquad standoffs, Yagi clips). Getting the *shape* right — corner positions, bend
angles, the curved cloverleaf leaf, a small coil — is still done with a tape measure and a protractor, and it is
where home builds go wrong. The goal: print a jig, press a straight wire into it, bend where the jig makes you
bend, and the result matches `Design.wires` with no measuring.

The sky-cone wire cages already have this (`skycone-bend`, a flat plate with the frame profile grooved in) and
the helix has a grooved winding former. This work generalises the plate idea to every bent-wire type that lacks a
shaping aid, and adds a coil mandrel.

## Goals

1. **Bend plate** (`bend-plate`): for every planar bent piece that fits the bed, a flat plate with the piece's
   exact 1:1 centre-line grooved in, a peg on the inside of every sharp corner, and an end stop at the start of an
   open piece so the straight wire registers against it (then every corner lands in the right place by itself).
2. **Corner jig** (`bend-corner`): for planar pieces too big for one plate, one small block per distinct corner
   angle (or per linked pair of close corners, see below), with a grooved bend at that angle and a peg;
   quantity = how many corners use it. Lengths come
   from the existing cut list.
3. **Coil mandrel** (`coil-mandrel`): a solid grooved rod for the spring antenna (and the A55 sky-cone coiled
   shorting wires if the same code fits), groove at the design's diameter, pitch and hand.
4. Antennas covered: `quad`, `moxon`, `biquad`, folded driven element of `yagi`, `cloverleaf`, `spring`
   (`skyconecage55` coils as a stretch).
5. Each part has `purpose` + `howTo` steps (panel + README), translated (EN + UK).
6. Every new part builds watertight at parameter extremes or fails with a known message (existing print tests).

## Non-goals

- No change to straight-rod types (dipole, ground plane, J-pole, collinear, discone, fan dipole) or PCB / sheet
  types.
- No duplicate for the sky-cone cages' frames (they keep `skycone-bend`).
- No helix change (it has its former).
- No embossed text or numbers on parts (no font support in `print/`); identification is by part title/qty and the
  how-to.
- No cloverleaf tilt / assembly jig in this round (the leaf shape is the hard part; tilt can come later).
- No printer settings (fixed rules in `print/rules.ts`, as today).

## Anti-goals (fails even if it "works")

- A jig whose groove doesn't match `Design.wires` — geometry must come from the design, never re-derived from
  formulas (existing build-pack rule).
- Parts that the user must post-process (supports inside grooves, sanding to fit). Grooves are open on top,
  printed flat, groove floor at half wire depth like `skycone-bend`.
- Jigs for wire a person can't bend by hand around a printed peg (thick tubes): skip them rather than emit a
  useless part.

## Constraints (from the codebase)

- Parts are `PartSpec` (`src/lib/print/parts.ts:8-17`), built with manifold-3d in mm, ≤ `MAX_SIZE` 180 mm per
  segment, otherwise "Too large to print in one piece". Composition in `src/lib/print/index.ts` (`FAMILIES`,
  `partsFor`).
- Groove = `channel(d + CLEAR)` + a sphere at each vertex (`skycone.ts:336`, `shapes.ts:28-31`); reuse that.
- Wires are straight segments; curves are chord polylines (cloverleaf 18 chords per leaf, spring/helix 16 per
  turn). `pieces()` (`build.ts:50-103`) groups wires into physical pieces but **not in path order** — an ordered
  polyline helper is needed.
- Print strings live in exported arrays merged into `PRINT_STRINGS` (`print/index.ts:58-63`), UK in `uk.ts`;
  `i18n.test.ts` enforces coverage.
- `lib/` has no DOM/React; parts are rebuilt in `print.worker.ts` from `defId/params/design`.

## Decisions made (my calls — check these)

- **Ordered path helper:** add `piecePath(d, piece): { pts: Vec3[]; closed: boolean }` next to `pieces()` in
  `build.ts`, walking shared endpoints. Reusable by templates later.
- **Planarity:** fit a plane to the path (largest-extent pair of axes / PCA); planar if every point is within
  `max(0.2 mm, 0.1·d)` of it. Non-planar pieces get no plate.
- **Sharp corner vs curve:** a vertex is a *corner* if the turn angle > 20°; smaller turns are curve chords
  (grooved smoothly, no peg). This is what makes the cloverleaf arc a smooth groove with pegs only at the hub
  legs.
- **Peg:** a cylinder on the inside of each corner, radius = `max(1.5 mm, d)` (minimum bend radius for copper
  wire up to ~2.5 mm), tangent to the groove's inner wall, top flush with plate top + d.
- **Eligible wire:** d ≤ 3 mm (hand-bendable). The Yagi's default 12 mm tube folded dipole gets no jig; a 2 mm
  wire one does.
- **Plate:** thickness `max(3, d + 2)`, 4 mm margin, like `skycone-bend`. Identical pieces (same path up to
  rigid motion, e.g. the 4 cloverleaf leaves, quad sides) → one plate with `qty`. Closed loops: the plate grooves
  the whole loop; the how-to says where to start (at the feed gap / the joint) and the end stop sits there.
- **Corner jig:** two arms of 40 mm grooved at the corner angle + peg; angles rounded to 0.5° when deduping.
  Used when the piece's plate would exceed 180 mm.
- **Mandrel:** solid rod of `D − d − CLEAR` core diameter with `twistGroove` (from `former.ts`), a 20 mm plain
  handle and an end slot to anchor the wire. Spring needs an adapter (axis at (−R, 0), lead is `driven`, no
  radial stub, `spring.ts:106-118`) rather than `helixGeometry`. If the core would be < 3 mm the part is not
  made and the how-to says to wind on a drill bit of the stated size instead (shown in the build pack).
- **Rounded corners vs sharp design corners:** a wire bent round a peg can't follow a sharp corner. The groove
  follows the design polyline with each corner filleted to the peg's centre-line radius (`peg r + d/2`). The
  groove ends exactly at the design's end points. Cut length stays the design (sharp-corner) length, which is a
  few mm longer, and the extra is trimmed at the groove end. On a closed loop it becomes the solder overlap.
  Electrically this matches the design to within the fillet (≈ 1 mm per 90° corner at d = 2 mm). Probe tests
  check the filleted path; design vertices away from corners must lie in the groove.
- **Junctions (biquad, cloverleaf hub):** `piecePath` excludes `feed`-group wires (the feed gap / coax stub is
  not bent). The remaining bent wire is traced as one path, and at a node where 4 wires meet it continues
  through the straightest pair. Biquad: one figure-8 plate from one wire, starting at the feed point; the how-to
  says to cut the gap there. Cloverleaf: each leaf is its own path from hub top to hub bottom.
- **Linked corners:** consecutive corners joined by a straight run shorter than 60 mm go into one corner jig,
  keeping both angles and the exact spacing. This covers the Yagi folded-dipole U-fold (sets the conductor gap
  `fs`) and the Moxon tips. A lone corner gets a single-angle jig.
- **Mandrel printing:** printed upright like the helix former, so the grooves need no supports. A mandrel over
  180 mm splits into keyed segments with the former's `stack`/`dShape` (`SEG_H`). Minimum ridge between grooves
  is 0.8 mm (pitch − d − CLEAR ≥ 0.8). Below that, or with a core under 3 mm, no part is made, and the build
  pack says "wind on a Ø X mm drill bit or bolt" instead. Same d ≤ 3 mm limit as the plates.
- **Where it plugs in:** a new `src/lib/print/families/bend.ts` exporting `bendParts(p, d)`; the families of the
  covered types append it (quad/moxon spreader, biquad standoff, yagi boom; cloverleaf and spring get a family
  for the first time).

## Left to the builder

- Exact peg placement math, groove-vs-peg overlap tolerances, end-stop shape.
- Whether the A55 coiled shorting wires reuse the mandrel (do it if `coilPath` gives D/pitch/turns cleanly;
  otherwise skip and note it).
- How-to wording (short, imperative, matching existing parts).
- Optional: fix the inflated "Bends: N" count for chord curves in `build.ts:282` using the same 20° rule.

## Done when

- Default designs of quad (UHF and 2 m), moxon, biquad, cloverleaf, spring, yagi with a ≤ 3 mm folded element
  produce the expected parts; exported STL looks right in the preview (`MeshView`).
- Probe tests (`testkit.ts` `ball`/`along`) show each design point of each piece lies in its groove and clear,
  for both cloverleaf hands.
- `npm test`, `npm run typecheck`, `npm run lint` pass; i18n coverage passes.
- CLAUDE.md layout line for `print/families/bend.ts` added.
