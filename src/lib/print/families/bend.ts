import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { Design } from "../../types";
import { msg, type PartSpec } from "../parts";
import { bendPaths, filleted, flatten, signature, type BendPath, type Flat, type Groove, type P2 } from "../paths";
import { CLEAR, MAX_SIZE } from "../rules";
import { channel, rod, type V3 } from "../shapes";

// Bend jigs for planar bent wires (quad loops, biquad, cloverleaf leaves, folded dipoles): a plate with the piece's
// groove, the same for every identical piece. Geometry comes from the design's wires (print/paths.ts).

export const BEND_STRINGS = [
  "Bend plate",
  "Groove with the exact shape of {0} piece(s) of {1} wire, {2} long: press the wire into it and bend it round the pegs, so that every piece comes out the same.",
];

/** How-to steps per part, in order. */
export const BEND_HOWTO: { plate: string[]; corner: string[]; mandrel: string[]; mandrelPlain: string[] } = {
  plate: [
    "Print it flat, grooves up, with 100 % infill.",
    "Push the wire end against the stop at the start of the groove; for a closed loop, start at the notch across the groove.",
    "Press the wire into the groove as you go and bend it round each peg with pliers.",
    "Trim it at the end of the groove; a closed loop overlaps at the notch: solder the ends there.",
    "Use the same plate for every piece.",
  ],
  corner: [],
  mandrel: [],
  mandrelPlain: [],
};

const D_MAX = 3;      // thicker wire is not bent in a printed jig
const MARGIN = 4;     // plastic round the groove, as skycone-bend

/** The filleted groove in plate coordinates (the flat piece shifted by the margin); start = groove point at the piece's first point. */
export function plateGroove(f: Flat): Groove & { start: number } {
  const g = filleted(f), sh = ([x, y]: P2): P2 => [x + MARGIN, y + MARGIN], s = sh(f.pts[0]);
  const path = g.path.map(sh), dist = (q: P2) => Math.hypot(q[0] - s[0], q[1] - s[1]);
  return { path, pegs: g.pegs.map((p) => ({ c: sh(p.c), r: p.r })), start: path.reduce((m, q, i) => (dist(q) < dist(path[m]) ? i : m), 0) };
}

/** Plate z ∈ [−T, 0] with the wire centre on the top face: groove (open: flat stop at the start), pegs up to d + 1, closed: start notch. */
function plate(M: ManifoldToplevel, f: Flat): Manifold {
  const { path, pegs, start } = plateGroove(f), d = f.d, T = Math.max(3, d + 2), n = path.length;
  const W = f.size[0] + 2 * MARGIN, H = f.size[1] + 2 * MARGIN, at = (q: P2): V3 => [q[0], q[1], 0];
  const cuts: Manifold[] = [];
  for (let i = 0; i < (f.closed ? n : n - 1); i++) {
    const a = path[i], b = path[(i + 1) % n];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue;
    // open: a flat stop at the start (no overrun, no ball) and a round end at the last point (no overrun: the stop
    // may sit next to it, as on a cloverleaf leaf whose two ends meet at the hub)
    if (!f.closed && (i === 0 || i === n - 2)) cuts.push(rod(M, at(a), at(b), d + CLEAR));
    else cuts.push(channel(M, at(a), at(b), d));
  }
  path.forEach((q, i) => { if (f.closed || i > 0) cuts.push(M.Manifold.sphere((d + CLEAR) / 2, 16).translate(at(q))); });
  if (f.closed) {   // 1 mm wide, d/2 deep notch across the groove at the start
    const q = path[start], r = path[(start + 1) % n], ang = Math.atan2(r[1] - q[1], r[0] - q[0]) * 180 / Math.PI;
    cuts.push(M.Manifold.cube([1, d + CLEAR + 4, d], true).rotate([0, 0, ang]).translate(at(q)));
  }
  const body = M.Manifold.union([M.Manifold.cube([W, H, T]).translate([0, 0, -T]),
    ...pegs.map((p) => M.Manifold.cylinder(T + d + 1, p.r, p.r, 32).translate([p.c[0], p.c[1], -T]))]);
  return body.subtract(M.Manifold.union(cuts));
}

/** Design length of a piece in metres. */
const length = ({ pts, closed }: BendPath) => {
  let s = 0;
  for (let i = closed ? 0 : 1; i < pts.length; i++) { const a = pts[(i + pts.length - 1) % pts.length], b = pts[i]; s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
  return s / 1000;
};

/** Bend jigs for every planar bent piece of wire up to 3 mm: one plate per distinct shape. */
export function bendParts(d: Design): PartSpec[] {
  const groups = new Map<string, { f: Flat; p: BendPath; n: number }>();
  for (const p of bendPaths(d)) {
    if (p.d > D_MAX + 1e-9) continue;
    const f = flatten(p);
    if (!f) continue;
    const k = signature(f), g = groups.get(k);
    if (g) g.n++; else groups.set(k, { f, p, n: 1 });
  }
  const out: PartSpec[] = [];
  for (const { f, p, n } of groups.values()) {
    if (Math.max(...f.size) + 2 * MARGIN > MAX_SIZE) continue;   // too big for a plate: corner jigs (Task 4)
    out.push({
      id: `bend-plate-${out.length + 1}`, title: BEND_STRINGS[0], use: "jig", qty: 1,
      purpose: msg(BEND_STRINGS[1], n, { len: f.d / 1000 }, { len: length(p) }), howTo: BEND_HOWTO.plate.map((s) => msg(s)),
      build: (M) => [plate(M, f)],
    });
  }
  return out;
}
