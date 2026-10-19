# Wire cut and bend aids (recipe, cut board, two benders): design

## Intent

The build pack gives a cut length and "Bends: N, see the template", but for most wire antennas there is no template
showing *where* along the straight wire to bend, by how much and which way. The existing groove plates and corner
jigs (`print/families/bend.ts`, spec 2026-10-18) hold a finished shape; they don't help cut many pieces to length fast
or make repeatable bends. The user wants:

1. a **bend recipe**: for each bent wire piece, the cut length and a mark for every bend (position, angle, direction);
2. a **printed cut board**: one board per design with a hole for every needed wire length; push the wire to the
   bottom of the hole, cut flush, done;
3. **two printed benders**, both offered, the builder picks one: **A** a lever bender modelled on the Stalex W-10 hand
   bender (clamped in a vise, die + lever with roller + angle scale + stop), **B** a flat bending plate (die pin + stop
   pin + engraved angle lines, bend by hand).

Mockups shown in the brainstorm: `.superpowers/brainstorm/*/content/bender-and-recipe.html`, `cut-gauge.html`,
`cut-board.html`.

## Goals

1. **Bend recipe** for every *planar* bent wire piece of any wire antenna (quad, moxon, biquad, cloverleaf, yagi
   folded driven, J-pole bottom, inverted-V-like shapes, any future type) computed from `Design.wires`:
   - cut length (same number as the cut list), then marks B1…Bn in bending order: distance from the cut start,
     angle, direction (left / right looking at the drawing), on which side of the die the mark goes.
   - 1:1 strip in the build PDF and SVG template when the piece fits (strip tiled over A4 pages like other templates,
     ≤ 6 tiles); otherwise a table only (measure with a tape).
   - the recipe table also appears in the build sheet / cut list area of the Build panel.
2. **Cut board** (`cut-board` part, `use: "jig"`): one board per design, one blind hole per distinct cut length
   ≤ 170 mm, labelled by an engraved hole number; the how-to and README map number → piece, length, quantity.
   Bend-mark slits open to the top of each hole at the recipe's mark positions (only for planar bent pieces).
3. **Lever bender** (`bender-lever`): a W-10-style hand bender sized for the design's wire.
4. **Bending plate** (`bender-plate`): flat plate with die pin and stop pin, engraved angle lines.
5. Both benders and the cut board appear in the Print panel for every wire antenna that has at least one piece they
   apply to; their how-to says "print either bender A or B".
6. EN + UK strings, `i18n.test.ts` passes; every part builds watertight at parameter extremes or fails with a known
   message (existing print tests pattern).

## Non-goals

- Non-planar (3D) pieces: sky-cone cage frames keep `skycone-bend` and the frame template; the helix keeps its former,
  the spring its mandrel. No recipe with "rotate the wire" steps in this round.
- Tubes and wire thicker than 3 mm (Yagi 12 mm, J-pole 6 mm defaults): no bender, no board hole; the recipe still
  shows the numbers (they are just as useful with a pipe bender).
- No stop-block / long-wire cutting jig: pieces longer than 170 mm are cut with a tape measure using the recipe.
- No spiral cut channel (shown, not chosen).
- No change to the existing groove plates and corner jigs.

## Anti-goals

- Marks that don't land the corners on the design vertices once bent round the actual die: the recipe must be computed
  for the die radius the benders really have, not for sharp corners.
- A board or bender that needs supports or post-processing.
- Geometry re-derived from formulas: everything from `Design.wires` (build-pack rule).

## Decisions (my calls: check these)

- **Die = a steel bolt, not plastic.** A printed 1.5–3 mm radius pin would break bending 2 mm copper. Both benders
  take a standard metric bolt as the die: M3 / M4 / M5 / M6, radius 1.5 / 2 / 2.5 / 3 mm. The design's die is the
  smallest bolt with radius ≥ `max(1.5, d)`, which equals the corner radius `rp` already used by the groove plates
  (`paths.ts:125`), so the recipe, the benders and the groove plates agree. Parts get the matching clearance hole;
  the how-to names the bolt (and its length) to buy. Stop pin = a second bolt of the same size.
- **Recipe geometry:** use the same filleted centre-line as the groove plates (`flatten` + `filleted`, centre-line
  radius `rp + (d + CLEAR)/2` → use `rp + d/2` for the wire's own centre line). Each mark is at the start of the bend
  arc (tangent point) measured along the centre line from the cut start; the bender has an engraved line at the die's
  tangent point to put the mark on. Cut length stays the cut-list length; any excess over the filleted length is at the
  end (trim / solder overlap), as in the 2026-10-18 spec. Corners are vertices turning > 20° (`CORNER`); smaller
  turns (cloverleaf arcs) are listed as "gentle curve from X to Y mm, shape by hand / on the groove plate".
- **The recipe follows the bolt, not the groove plates.** Marks use the actual die radius (bolt radius + d/2 on the
  centre line). For d between bolt sizes (e.g. 1.6 or 1.8 mm → M4) and on short runs where `filleted()` shrinks the
  fillet, this differs slightly from the groove plates; the groove plates are not changed (≈ 1 mm effect). When a run
  is shorter than the two tangent lengths it joins, the bend is flagged in the recipe ("run too short for the die:
  bend with pliers") and excluded from the 0.5 mm vertex test.
- **Closed loops (quad, biquad):** the recipe starts at the feed point (the loop's open ends), whichever path order
  `bendPaths()` gives; B1 is the first corner from there. Excess (cut length − filleted length) is at the far end, the
  second feed end: trim it or keep it as the solder overlap. A closed loop with no feed wire starts at the design's
  feed location if there is one, otherwise at its first vertex.
- **Several wire diameters in one design:** the cut board holds every eligible piece with a hole sized to its own d.
  Benders: one set (A and B) per distinct die bolt among the eligible bent pieces (usually one), part ids suffixed by
  bolt size (`bender-lever-m4`).
- **Sky-cone families:** no cut board, no benders and no recipe (they have their own kit and non-planar frames).
- **Bending order and direction:** bends in order from the cut start; direction is the turn sign of the flattened
  path seen from the drawing's side; the strip is drawn in that same orientation.
- **Springback:** stops are set at the nominal angle; the how-to says to press 2–5° past the stop for copper and
  check against the engraved line or the groove plate.
- **Cut board holes:** diameter `max(2, d + CLEAR)` mm, teardrop top, board printed flat (holes horizontal), one end
  open on the cut edge, bottom = stop at the cut length. (The user first suggested a fixed Ø5 mm hole; sized holes were
  chosen because thin wire buckles in a loose hole and comes out short. Revisit if the user prefers 5 mm.)
  Same-length pieces (±0.5 mm) share a hole; the label/README gives the count. Board width/length capped by
  `MAX_SIZE`: holes ≤ 170 mm deep; too many holes → split into several boards (`qty`/segments). Hole spacing ≥ hole Ø
  + 2·`WALL`.
- **Engraved numbers:** `print/` has no font. Add a minimal 7-segment digit engraver (boxes) in `shapes.ts`; numbers
  only, no letters. Benders' angle scale = engraved lines every 15°, longer at 45° and 90°, no numbers needed.
- **Lever bender A:** base plate (vise tab underneath + 2 screw holes for bench mounting), die bolt vertical through
  the base and acting as the lever pivot, lever with a roller (a second bolt with a printed sleeve, or the bolt itself)
  at `die r + d + CLEAR` from the die, a wire clamp / back-stop block on the entry side with a groove `d + CLEAR`,
  angle scale around the pivot, stop holes in the base at each distinct angle the design needs (plus 90°) where a stop
  bolt blocks the lever. Lever length ~120–150 mm within `MAX_SIZE`. Printed parts: base, lever (two segments or one).
- **Bending plate B:** one plate with a die-bolt hole, a stop-bolt hole beside it to trap the wire, a groove leading
  in, engraved angle lines around the die, the tangent line, and holes for the stop at the design's angles. Bend by
  hand / with pliers around the bolt.
- **Where it plugs in:** `src/lib/recipe.ts` (lib, no DOM): `bendRecipes(d: Design): Recipe[]` reusing `pieces()`,
  `bendPaths()`/`flatten`/`filleted`. Template: new drawing in `template.ts` / `drawing.ts`, included in
  `templatePages` and the build PDF; `templateKind` gains a "recipe" case so straight-only designs no longer hit the
  wrong "too large for a paper template" hint (`BuildPanel.tsx:40`, fix the hint). Print: new
  `print/families/cutbend.ts` with `cutBoard(d)`, `benderLever(d)`, `benderPlate(d)`, added to every wire family in
  `FAMILIES` (and cloverleaf/spring etc.) when applicable; strings merged into `PRINT_STRINGS`; recipe strings in
  `BUILD_STRINGS`.
- **Which designs get what:** recipe for every planar bent piece of any size (d any); cut board when ≥ 1 piece is
  ≤ 170 mm and d ≤ 3 mm (straight pieces too: dipole arms at UHF, ground-plane radials, discone rods); benders when
  ≥ 1 planar bent piece has d ≤ 3 mm.

## Left to the builder

- Exact bender proportions, clamp shape, roller detail, vise-tab size; keep everything printable flat without
  supports.
- Strip layout on the page and table wording (short, matching the build sheet).
- Test design (follow `bend.test.ts`, `testkit.ts`): recipe marks re-bent with the die radius must land on the design
  vertices within 0.5 mm; board holes probed at the right depth; parts watertight at d = 0.5 / 1 / 2 / 3 mm.

## Done when

- Default quad (UHF), moxon, biquad, cloverleaf, yagi with `driven: "folded"` and `d` = 2 mm, dipole at 2.4 GHz and ground plane
  at 1.3 GHz produce a recipe and the expected parts; STL looks right in `MeshView`.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` pass.
- CLAUDE.md layout lines for `recipe.ts` and `print/families/cutbend.ts`.
