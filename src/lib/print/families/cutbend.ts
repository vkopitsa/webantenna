import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { AntennaDef, Design, Params } from "../../types";
import { cutList, pieces, type CutRow, type Msg, type Piece } from "../../build";
import { bendRecipes, trimmedTags, type Die, type Recipe } from "../../recipe";
import { msg, type PartSpec } from "../parts";
import { bendPaths, type P2 } from "../paths";
import { CLEAR, MAX_SIZE, WALL, mm } from "../rules";
import { box, digits, type V3 } from "../shapes";
import { D_MAX } from "./bend";

// Cut board (wire cut and bend aids): a printed board with one blind hole per wire cut length. Push the wire to the
// bottom of its hole and cut it flush at the board edge; slits across the hole mark where each bend goes.
// Benders (one pair per die bolt): A, a lever bender like the Stalex W-10 clamped in a vise, and B, a flat plate to bend
// by hand. The die is a steel bolt (the recipe's die), the roller / trap pin and the stops are bolts of the same size.

export const CUTBEND_STRINGS = [
  "Cut board",
  "Cut board: push the wire to the bottom of a hole and cut flush; {0} hole(s)",
  "Hole {0}: cut {1} × {2}",
  "Lever bender",
  "Hand bender for {0} wire, clamped in a vise: a {1} bolt is the die and the roller on the lever bends the wire round it; stop holes at {2}°.",
  "Bending plate",
  "Plate for bending {0} wire by hand round a {1} bolt up to a stop bolt; stop holes at {2}°.",
  "Die and roller: two {0} × 30 mm bolts and one {0} nut",
  "Stop: one {0} × 8 mm bolt",
  "Die, trap pin and stop: three {0} × 16 mm countersunk bolts",
];

/** How-to steps per part, in order (lever and plate: the benders). */
export const CUTBEND_HOWTO: { board: string[]; lever: string[]; plate: string[] } = {
  board: [
    "Print it flat, with the numbers up.",
    "Straighten the wire, push it into the hole with the number from the how-to list until it stops at the bottom, and cut it flush with the board edge.",
    "Mark the wire with a pen through each slit across the hole: those are the bends.",
    "The freshly cut end is the start of the bend recipe: B1 is the mark nearest the cut end; bend in order from that end (B1, B2, …).",
  ],
  lever: [
    "Print either this lever bender or the bending plate, not both",
    "Print the base standing on its long edge (the one with the tab and the block) and the lever flat; neither needs supports.",
    "Push the nut into the hexagon on top of the base, screw the die bolt up through it from below and slide the lever onto the die.",
    "Drop the roller bolt into the other hole of the lever, head up: its tip rests on the bottom of the hole, clear of the base.",
    "Clamp the tab in a vise: the head of the die bolt sticks out under the base, so it does not lie flat on a bench.",
    "Drop the stop bolt into the hole for the bend angle, head up, so the head rests on the base: the stop holes sit at the recipe angles on the engraved lines (every 15°, longer at 45°, 90°, 135° and 180°), and the lever stops against the bolt head.",
    "Lay the wire on the lever through the groove in the block, between the die and the roller, with the cut end on the far side of the die and the mark on the engraved line across the lever.",
    "B1 is the mark nearest the cut end: bend in order from that end, then push the wire on to the next mark.",
    "Bends marked R are made with the wire lying as drawn, bends marked L with it turned over (half a turn about its own axis): turn it over only when the letter changes from the previous bend.",
    "Swing the lever until it hits the stop. Copper springs back: press 2–5° past it and check the angle against the engraved lines or the groove plate.",
  ],
  plate: [
    "Print either this lever bender or the bending plate, not both",
    "Print it flat, lines up; it needs no supports.",
    "Push the bolts up from below through the die hole, the trap hole beside it and the stop hole for the bend angle: the countersunk heads sit flush with the bottom.",
    "The stop holes sit at the recipe angles on the engraved lines (every 15°, longer at 45°, 90°, 135° and 180°).",
    "Lay the wire through the groove in the block, between the trap pin and the die, with the cut end past the die and the mark on the engraved line across the wire at the die.",
    "B1 is the mark nearest the cut end: bend in order from that end, then push the wire on to the next mark.",
    "Bends marked R are made with the wire lying as drawn, bends marked L with it turned over (half a turn about its own axis): turn it over only when the letter changes from the previous bend.",
    "Bend the free end round the die by hand until it rests against the stop bolt. Copper springs back: press 2–5° past it and check the angle against the engraved lines or the groove plate.",
  ],
};

export interface Hole { n: number; cut: number; dia: number; qty: number; what: Msg; marks: number[] }   // m; marks = recipe bend marks (arc ends)

const MAX_CUT = 0.170;   // m: longest wire a board takes
const SAME = 0.5e-3;     // m: lengths this close share one hole
const NUM_H = 5;         // mm: engraved number height
const NUM_DEPTH = 0.6;
const MIN_PITCH = 9;     // mm between holes: room for the number
const SLIT = 1;          // mm wide

const tags = (t: string) => t.split(/[,–]/).map((x) => x.trim()).filter(Boolean);

/** Holes for the wires of the cut list that fit a board: ≤ 170 mm and ≤ D_MAX thick, equal lengths and diameters (±0.5 mm)
 *  share one hole; numbered from 1, longest first; marks = the bends of the matching recipe. */
export function boardHoles(rows: CutRow[], recipes: Recipe[]): Hole[] {
  const out: Hole[] = [];
  for (const r of rows) {
    if (r.cut > MAX_CUT + 1e-9 || mm(r.dia) > D_MAX + 1e-9) continue;
    const e = out.find((h) => Math.abs(h.cut - r.cut) <= SAME && Math.abs(h.dia - r.dia) <= SAME);
    if (e) { e.qty += r.qty; continue; }
    // a cut table without tags (wire cages) matches the recipe by the piece's name
    const ts = tags(r.tag), rc = recipes.find((q) => Math.abs(q.cut - r.cut) <= SAME && (ts.length ? tags(q.tag).some((x) => ts.includes(x)) : q.what.s === r.what.s));
    out.push({ n: 0, cut: r.cut, dia: r.dia, qty: r.qty, what: r.what, marks: rc ? rc.bends.map((b) => b.mark) : [] });
  }
  out.sort((a, b) => b.cut - a.cut);
  return out.map((h, i) => ({ ...h, n: i + 1 }));
}

const holeD = (h: Hole) => Math.max(2, mm(h.dia) + CLEAR);
const pitch = (h: Hole) => Math.max(holeD(h) + 2 * WALL, MIN_PITCH);

/** One board: holes side by side along y, open at x = 0, blind at x = cut, axis at mid-thickness. */
function board(M: ManifoldToplevel, hs: Hole[]): Manifold {
  const T = Math.max(5, ...hs.map((h) => holeD(h) + 2 * WALL)), L = Math.max(...hs.map((h) => mm(h.cut))) + WALL, zc = T / 2;
  const W = hs.reduce((s, h) => s + pitch(h), 0), cuts: Manifold[] = [];
  let y0 = 0;
  for (const h of hs) {
    const d = holeD(h), r = d / 2, c = mm(h.cut), y = y0 + pitch(h) / 2;
    y0 += pitch(h);
    // round hole with a 45° roof (a square on its corner) so it prints without supports
    const bore = M.Manifold.cylinder(c + 1, r, r, 32).rotate([0, 90, 0]).translate([-1, y, zc]);
    const roof = M.Manifold.cube([c + 1, 2 * r, 2 * r], false).translate([-1, -r, -r]).rotate([45, 0, 0]).translate([0, y, zc]);
    cuts.push(bore, roof.intersect(box(M, [-1, y - r, zc], [c, y + r, zc + r * Math.SQRT2 + 1])));
    for (const a of h.marks) {
      const x = mm(a);
      if (x > 0 && x < c) cuts.push(box(M, [x - SLIT / 2, y - r, zc], [x + SLIT / 2, y + r, T + 1]));
    }
    cuts.push(digits(M, String(h.n), 1, y - NUM_H / 2, NUM_H, NUM_DEPTH, T));
  }
  return M.Manifold.cube([L, W, T], false).subtract(M.Manifold.union(cuts));
}

/** Cut boards: the holes in order, a new board whenever the next one would not fit MAX_SIZE across. */
export function cutBoards(holes: Hole[]): PartSpec[] {
  const groups: Hole[][] = [];
  let w = 0;
  for (const h of holes) {
    if (!groups.length || w + pitch(h) > MAX_SIZE) { groups.push([]); w = 0; }
    groups[groups.length - 1].push(h);
    w += pitch(h);
  }
  return groups.map((hs, i) => ({
    id: groups.length > 1 ? `cut-board-${i + 1}` : "cut-board", title: CUTBEND_STRINGS[0], use: "jig" as const, qty: 1,
    purpose: msg(CUTBEND_STRINGS[1], hs.length),
    howTo: [...CUTBEND_HOWTO.board.map((s) => msg(s)), ...hs.flatMap((h) => [msg(CUTBEND_STRINGS[2], h.n, { len: h.cut }, h.qty), h.what])],
    build: (M: ManifoldToplevel) => [board(M, hs)],
  }));
}

// ---------------------------------------------------------------- benders

/** Bender layout in mm, seen from above: die centre at (0, 0), the wire comes in along +x at y = −(die r + d/2) and is
 *  wrapped counter-clockwise round the die; `stops` on a 40 mm circle at each bend angle measured from +x. */
export interface BenderGeom { die: Die; dMm: number; stops: { angle: number; c: P2 }[]; roller: P2; tangentX: number }

const STOP_R = 40;      // mm, stop-hole circle about the die
const BASE_T = 8, LEVER_T = 8, PLATE_T = 6;
const ROLLER_FLOOR = 1;   // mm of lever under the roller bolt: its tip rides clear of the base and the die nut's open pocket
const LINE_W = 0.8, LINE_DEPTH = 0.6;
// ISO 4762 socket head Ø, ISO 4032 nut across flats and height, ISO 10642 countersunk head Ø (mm)
const HEAD: Record<Die["bolt"], number> = { M3: 5.5, M4: 7, M5: 8.5, M6: 10 };
const NUT: Record<Die["bolt"], [number, number]> = { M3: [5.5, 2.4], M4: [7, 3.2], M5: [8, 4.7], M6: [10, 5.2] };
const CSK: Record<Die["bolt"], number> = { M3: 6.72, M4: 8.96, M5: 11.2, M6: 13.44 };
const DEG = Math.PI / 180;

/** Stops at every distinct angle (rounded to 0.5°) plus 90°; roller at rest beside the die across the wire (die r + d + clearance + roller r). */
export function benderGeometry(die: Die, dMm: number, angles: number[]): BenderGeom {
  const as = [...new Set([...angles.map((a) => Math.round(a * 2) / 2), 90])].sort((a, b) => a - b);
  return {
    die, dMm, tangentX: 0, roller: [0, -(2 * die.r + dMm + CLEAR)],
    stops: as.map((angle) => ({ angle, c: [STOP_R * Math.cos(angle * DEG), STOP_R * Math.sin(angle * DEG)] as P2 })),
  };
}

type M = ManifoldToplevel;
/** Vertical hole of diameter d through z0..z1; `tear` adds a 45° roof towards +y (for a part printed with +y up). */
function zHole(M: M, x: number, y: number, d: number, z0: number, z1: number, tear: boolean): Manifold {
  const c = M.Manifold.cylinder(z1 - z0 + 2, d / 2, d / 2, 32).translate([x, y, z0 - 1]);
  if (!tear) return c;
  const t = y + (d / 2) * Math.SQRT2;
  return M.Manifold.hull([c, [x, t, z0 - 1], [x, t, z1 + 1]]);
}
/** Engraved line from a to b on the top face zTop. */
function line(M: M, a: P2, b: P2, zTop: number): Manifold {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
  return M.Manifold.cube([L, LINE_W, LINE_DEPTH + 0.01], false).translate([0, -LINE_W / 2, zTop - LINE_DEPTH]).rotate([0, 0, ang]).translate([a[0], a[1], 0]);
}
/** Angle lines every 15° up to 180°, longer at multiples of 45°: lines at angle φ offset by `o` to the right of the ray from the die. */
function scale(M: M, o: number, s0: number, sLong: number, s1: number, zTop: number): Manifold[] {
  const out: Manifold[] = [];
  for (let a = 15; a <= 180; a += 15) {
    const c = Math.cos(a * DEG), s = Math.sin(a * DEG), p = (t: number): P2 => [o * s + t * c, -o * c + t * s];
    out.push(line(M, p(a % 45 === 0 ? sLong : s0), p(s1), zTop));
  }
  return out;
}

/** Lever bender in use position (z up): base z 0..8 with the vise tab below and the back-stop block above, lever z 8..16
 *  lying on it, the wire on the lever (centre at wireZ). The lever stops against the head of a bolt in a stop hole. */
export function leverSolids(M: M, g: BenderGeom): { base: Manifold; lever: Manifold; wireZ: number } {
  const { die, dMm: d } = g, r = die.r, w = d + CLEAR, yw = -(r + d / 2), top = BASE_T + LEVER_T;
  const headR = HEAD[die.bolt] / 2, [af, nutH] = NUT[die.bolt];
  const X0 = -92, X1 = 58, Y0 = -32, Y1 = 58;
  // base: plate, engraved (stop-edge lines, tangent line), then tab and block added, then holes
  let base = box(M, [X0, Y0, 0], [X1, Y1, BASE_T]).subtract(M.Manifold.union([
    ...scale(M, headR, 49, 46, 55, BASE_T),
    line(M, [g.tangentX, 14], [g.tangentX, STOP_R - die.hole / 2 - 2], BASE_T),
  ]));
  const yR = yw + w / 2, yL = yw - w / 2, bTop = top + w + 1.5;
  base = base.add(box(M, [-90, Y0, -25], [-50, Y0 + 12, 0])).add(box(M, [-30, Y0, BASE_T], [-15, yR + WALL, bTop]));
  // entry groove: open on top, its +y wall flared at 45° above the wire so the base prints on its −y edge
  const slot = M.Manifold.hull(([[yL, top], [yR, top], [yR, top + w], [yR + bTop + 1 - top - w, bTop + 1], [yL, bTop + 1]] as P2[])
    .flatMap(([y, z]) => [[-31, y, z], [-14, y, z]] as V3[]));
  const nut = M.Manifold.cylinder(nutH + 1.3, af / Math.sqrt(3) + 0.15, af / Math.sqrt(3) + 0.15, 6).rotate([0, 0, 30]).translate([0, 0, BASE_T - nutH - 0.3]);
  base = base.subtract(M.Manifold.union([
    slot, nut, zHole(M, 0, 0, die.hole, 0, BASE_T, true),
    ...g.stops.map((s) => zHole(M, s.c[0], s.c[1], die.hole, 0, BASE_T, true)),
    zHole(M, -80, 45, 4.5, 0, BASE_T, true), zHole(M, -80, 10, 4.5, 0, BASE_T, true),
  ]));
  // lever: hub round the die, handle through the roller (−y at rest), arm whose +y edge (at y = −head r) meets the stop bolt head
  const hub = M.Manifold.cylinder(LEVER_T, 12, 12, 64).translate([0, 0, BASE_T]);
  const handle = box(M, [-10, -128, BASE_T], [10, 0, top]);
  const arm = M.Manifold.hull([box(M, [0, -headR - 14, BASE_T], [STOP_R + 4, -headR, top]), box(M, [-10, -40, BASE_T], [10, -headR, top])]);
  const lever = M.Manifold.union([hub, handle, arm]).subtract(M.Manifold.union([
    zHole(M, 0, 0, die.hole, BASE_T, top, false), zHole(M, g.roller[0], g.roller[1], die.hole, BASE_T + ROLLER_FLOOR + 1, top, false),
    line(M, [g.tangentX, die.hole / 2 + 0.6], [g.tangentX, 10], top),
    line(M, [g.tangentX, g.roller[1] - die.hole / 2 - 1], [g.tangentX, g.roller[1] - die.hole / 2 - 8], top),
  ]));
  return { base, lever, wireZ: top + d / 2 };
}

const bendersFor = (g: BenderGeom) => ({ bolt: g.die.bolt, stops: g.stops.map((s) => s.angle).join(", "), d: { len: g.dMm / 1000 } });

/** Lever bender A: base (printed on its −y edge, rotated so that edge is on the bed) and lever (flat). */
export function benderLever(g: BenderGeom): PartSpec {
  const { bolt, stops, d } = bendersFor(g);
  return {
    id: `bender-lever-${bolt.toLowerCase()}`, title: CUTBEND_STRINGS[3], use: "jig", qty: 1,
    purpose: msg(CUTBEND_STRINGS[4], d, bolt, stops),
    howTo: [msg(CUTBEND_HOWTO.lever[0]), msg(CUTBEND_STRINGS[7], bolt), msg(CUTBEND_STRINGS[8], bolt), ...CUTBEND_HOWTO.lever.slice(1).map((s) => msg(s))],
    build: (M: ManifoldToplevel) => {
      const { base, lever } = leverSolids(M, g);
      return [base.rotate([90, 0, 0]).translate([0, 0, -base.boundingBox().min[1]]), lever.translate([0, 0, -BASE_T])];
    },
  };
}

/** Bending plate B (printed flat): die and trap-pin holes, the entry groove in a block, stop holes, engraved lines. */
export function benderPlate(g: BenderGeom): PartSpec {
  const { bolt, stops, d } = bendersFor(g);
  return {
    id: `bender-plate-${bolt.toLowerCase()}`, title: CUTBEND_STRINGS[5], use: "jig", qty: 1,
    purpose: msg(CUTBEND_STRINGS[6], d, bolt, stops),
    howTo: [msg(CUTBEND_HOWTO.plate[0]), msg(CUTBEND_STRINGS[9], bolt), ...CUTBEND_HOWTO.plate.slice(1).map((s) => msg(s))],
    build: (M: ManifoldToplevel) => [plate(M, g)],
  };
}

function plate(M: M, g: BenderGeom): Manifold {
  const { die, dMm: dw } = g, r = die.r, w = dw + CLEAR, yw = -(r + dw / 2), T = PLATE_T, kR = CSK[die.bolt] / 2 + 0.2;
  // trap pin outside the wire, upstream of the die; moved out further only if the two countersunk heads would touch
  const xt = -(2 * r + dw + CLEAR + r), yt = -Math.max(2 * r + dw + CLEAR, Math.sqrt(Math.max(0, (2 * kR + 0.6) ** 2 - xt * xt)));
  const csk = (x: number, y: number) => M.Manifold.union([
    zHole(M, x, y, die.hole, 0, T, false),
    M.Manifold.cylinder(kR - die.hole / 2 + 0.01, kR, die.hole / 2, 48).translate([x, y, 0]),
    M.Manifold.cylinder(1, kR, kR, 48).translate([x, y, -1]),
  ]);
  const x1 = xt - r - 2, x0 = x1 - 15, bTop = T + w + 2;
  let s = box(M, [-48, -42, 0], [48, 48, T]).subtract(M.Manifold.union([
    ...scale(M, r + dw / 2, 18, 14, 30, T),
    line(M, [g.tangentX, -die.hole / 2 - 0.3], [g.tangentX, -36], T), line(M, [g.tangentX, die.hole / 2 + 1], [g.tangentX, 12], T),
  ]));
  s = s.add(box(M, [x0, yw - w / 2 - 6, T], [x1, yw + w / 2 + WALL, bTop]));
  return s.subtract(M.Manifold.union([
    box(M, [x0 - 1, yw - w / 2, T], [x1 + 1, yw + w / 2, bTop + 1]),
    csk(0, 0), csk(xt, yt), ...g.stops.map((p) => csk(p.c[0], p.c[1])),
  ]));
}

const CACHE = new WeakMap<Design, PartSpec[]>();

/** Cut board(s) for the straight and bent pieces ≤ 170 mm, plus one lever bender and one bending plate per die bolt among
 *  the bent pieces of wire ≤ D_MAX (sky-cone wire cages: their frames, beside their own kit); [] for printed antennas and sheet sky-cones. Memoised per Design:
 *  the tuning (one rebuild of the design, shared with bendRecipes) runs once, and not at all when nothing can qualify. */
export function cutBendParts(def: AntennaDef, p: Params, d: Design): PartSpec[] {
  if (d.pcb || (def.id.startsWith("skycone") && !d.cuts)) return [];
  const hit = CACHE.get(d);
  if (hit) return hit;
  // nothing to bend and no cut-list piece short and thin enough for a board (the cut is never shorter than the piece): skip the tuning
  const onBoard = (q: Piece) => q.group !== "feed" && !(q.mech && q.length < 5e-3) && q.length <= MAX_CUT + 1e-9 && mm(q.dia) <= D_MAX + 1e-9;
  const fits = d.cuts ? d.cuts.some((c) => c.length <= MAX_CUT + 1e-9 && mm(c.dia) <= D_MAX + 1e-9) : pieces(d).some(onBoard);
  if (!(d.cuts ? d.frames : bendPaths(d).length) && !fits) {
    CACHE.set(d, []);
    return [];
  }
  const recipes = bendRecipes(def, p, d);
  const holes = boardHoles(cutList(def, d, d.cuts ? new Set() : trimmedTags(def, p, d)), recipes);
  const out = holes.length ? cutBoards(holes) : [];
  const bent = recipes.filter((r) => r.die && r.bends.length);
  for (const bolt of [...new Set(bent.map((r) => r.die!.bolt))].sort()) {
    const rs = bent.filter((r) => r.die!.bolt === bolt);
    const g = benderGeometry(rs[0].die!, Math.max(...rs.map((r) => mm(r.dia))), rs.flatMap((r) => r.bends.map((b) => b.angle)));
    out.push(benderLever(g), benderPlate(g));
  }
  CACHE.set(d, out);
  return out;
}
