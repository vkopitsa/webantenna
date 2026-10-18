import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { Design } from "../../types";
import { msg, type PartSpec } from "../parts";
import { bendPaths, filleted, flatten, signature, type BendPath, type Flat, type Groove, type P2 } from "../paths";
import { CLEAR, MAX_SIZE } from "../rules";
import { rod, type V3 } from "../shapes";

// Bend jigs for planar bent wires (quad loops, biquad, cloverleaf leaves, folded dipoles): a plate with the piece's
// groove, the same for every identical piece; a piece too big for a plate gets corner jigs instead (one per distinct
// corner, or per group of corners close together). Geometry comes from the design's wires (print/paths.ts).

export const BEND_STRINGS = [
  "Bend plate",
  "Groove with the exact shape of {0} piece(s) of {1} wire, {2} long: press the wire into it and bend it round the pegs, so that every piece comes out the same.",
  "Corner jig",
  "Bends {0} corner(s) of {1} wire by {2}° round the peg, so that every corner comes out the same.",
  "Bends {0} pair(s) of corners of {1} wire by {2}° each, {3} apart, in one go round the two pegs.",
  "Bends {0} group(s) of {1} corners of {2} wire in one go round the pegs, with the spacing between them built in.",
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
  corner: [
    "Print it flat, grooves up, with 100 % infill.",
    "Cut the wire to the length in the cut list and mark each corner on it.",
    "Lay the wire through the groove with the corner mark at the peg and bend it round the peg with pliers, by the angle given above, until it lies in the groove.",
    "On a jig with two or more pegs, lay all the corners of the group in at once and bend them in one go.",
    "Repeat for every corner listed, with the same jig.",
  ],
  mandrel: [],
  mandrelPlain: [],
};

const D_MAX = 3;      // thicker wire is not bent in a printed jig
const MARGIN = 4;     // plastic round the groove, as skycone-bend

const LEAD = 1;       // mm: an open groove's stop faces along the path from its start to the first point this far away
const ARM = 40;       // mm of straight groove each side of a corner jig's fillets
const LINK = 60;      // mm: corners joined by a shorter run share one corner jig

/** The filleted groove in plate coordinates (the flat piece shifted by the margin); start = groove point at the piece's
 *  first point; lead = first groove point more than LEAD (and its ball radius + 0.5) from the start (the stop faces along start → lead). */
export function plateGroove(f: Flat): Groove & { start: number; lead: number } {
  const g = filleted(f), sh = ([x, y]: P2): P2 => [x + MARGIN, y + MARGIN], s = sh(f.pts[0]), far = Math.max(LEAD, (f.d + CLEAR) / 2 + 0.5);
  const path = g.path.map(sh), dist = (q: P2) => Math.hypot(q[0] - s[0], q[1] - s[1]), lead = path.findIndex((q) => dist(q) > far);
  return { path, pegs: g.pegs.map((p) => ({ ...p, c: sh(p.c) })), at: g.at, start: path.reduce((m, q, i) => (dist(q) < dist(path[m]) ? i : m), 0), lead: Math.max(1, lead) };
}

const at0 = (q: P2): V3 => [q[0], q[1], 0];

/** Groove cutters along a path (wire centre on z = 0): overrun-free rods between points, balls at the points. */
function cutters(M: ManifoldToplevel, path: P2[], d: number) {
  const n = path.length;
  return {
    seg: (i: number) => rod(M, at0(path[i]), at0(path[(i + 1) % n]), d + CLEAR),
    ballAt: (i: number) => M.Manifold.sphere((d + CLEAR) / 2, 16).translate(at0(path[i])),
    live: (i: number) => Math.hypot(path[(i + 1) % n][0] - path[i][0], path[(i + 1) % n][1] - path[i][1]) > 1e-6,
  };
}

/** Plate W × H × T (z ∈ [−T, 0], T = max(3, d + 2)) with the pegs standing up to d + 1 above it. */
const slab = (M: ManifoldToplevel, W: number, H: number, d: number, pegs: Groove["pegs"]) => {
  const T = Math.max(3, d + 2);
  return M.Manifold.union([M.Manifold.cube([W, H, T]).translate([0, 0, -T]),
    ...pegs.map((p) => M.Manifold.cylinder(T + d + 1, p.r, p.r, 32).translate([p.c[0], p.c[1], -T]))]);
};

/** Plate z ∈ [−T, 0] with the wire centre on the top face: groove (open: flat stop at the start), pegs up to d + 1, closed: start notch. */
function plate(M: ManifoldToplevel, f: Flat): Manifold {
  const { path, pegs, start, lead } = plateGroove(f), d = f.d, n = path.length, at = at0;
  const W = f.size[0] + 2 * MARGIN, H = f.size[1] + 2 * MARGIN, { seg, ballAt, live } = cutters(M, path, d);
  const cuts: Manifold[] = [];
  if (f.closed) for (let i = 0; i < n; i++) { if (live(i)) cuts.push(seg(i)); cuts.push(ballAt(i)); }
  else {
    // open: the lead (up to the first point LEAD from the start) is trimmed by the stop plane through the start, square
    // to start → lead, so a short kinked lead cannot cut back past it; the rest may pass behind the stop (a cloverleaf
    // leaf's two ends meet at the hub)
    const a = path[0], b = path[lead], l = Math.hypot(b[0] - a[0], b[1] - a[1]), u: V3 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l, 0];
    const head: Manifold[] = [];
    for (let i = 0; i < lead; i++) { if (live(i)) head.push(seg(i)); if (i > 0) head.push(ballAt(i)); }
    cuts.push(M.Manifold.union(head).trimByPlane(u, u[0] * a[0] + u[1] * a[1]));
    for (let i = lead; i < n; i++) { if (i < n - 1 && live(i)) cuts.push(seg(i)); cuts.push(ballAt(i)); }
  }
  if (f.closed) {   // 1 mm wide, d/2 deep notch across the groove at the start
    const q = path[start], r = path[(start + 1) % n], ang = Math.atan2(r[1] - q[1], r[0] - q[0]) * 180 / Math.PI;
    cuts.push(M.Manifold.cube([1, d + CLEAR + 4, d], true).rotate([0, 0, ang]).translate(at(q)));
  }
  return slab(M, W, H, d, pegs).subtract(M.Manifold.union(cuts));
}

/** A corner jig: a group of corners cut from the whole piece's filleted groove, in its own plate coordinates (margin
 *  included); corners = how many, angles (°, signed: the first one positive) and runs (mm, corner to corner) for the key;
 *  arms = straight groove kept beyond the fillets (mm); mids = fillet midpoints. */
export interface CornerJig { key: string; corners: number; angles: number[]; runs: number[]; path: P2[]; pegs: Groove["pegs"]; mids: P2[]; size: P2; arms: number }

/** Corner jigs of a flat piece: corners joined by a run < LINK grouped (as long as the jig fits the bed), each group's
 *  groove from ARM before its first fillet to ARM after its last, clamped to the path's ends and the neighbouring fillets. */
export function cornerJigs(f: Flat): CornerJig[] {
  const g = filleted(f), N = g.path.length, n = f.pts.length, cs = f.corners, k = cs.length;
  if (!k) return [];
  const P = f.pts, dist = (a: P2, b: P2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const end = (i: number) => (i + 1 < n ? g.at[i + 1] : N) - 1;   // last path point of vertex i
  const run = (i: number, j: number) => { let s = 0; for (let m = i; m !== j; m = (m + 1) % n) s += dist(P[m], P[(m + 1) % n]); return s; };
  const turn = (i: number) => {
    const A = P[(i + n - 1) % n], B = P[i], C = P[(i + 1) % n], u = [B[0] - A[0], B[1] - A[1]], v = [C[0] - B[0], C[1] - B[1]];
    return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180 / Math.PI;
  };
  /** Path points from index a walking by step ±1 for up to ARM mm, not past index lim (interpolated at ARM). */
  const walk = (a: number, step: 1 | -1, lim: number) => {
    const out: P2[] = [];
    let s = 0;
    for (let i = a, c = 0; i !== lim && c < N; c++) {
      const j = (i + step + N) % N, l = dist(g.path[i], g.path[j]);
      if (s + l >= ARM) { const t = (ARM - s) / l, q = g.path[i]; if (ARM - s > 1e-6) out.push([q[0] + (g.path[j][0] - q[0]) * t, q[1] + (g.path[j][1] - q[1]) * t]); s = ARM; break; }
      s += l; out.push(g.path[j]); i = j;
    }
    return { out, s };
  };
  const jig = (grp: number[]): CornerJig => {
    const a = grp[0], b = grp[grp.length - 1], ia = cs.indexOf(a), ib = cs.indexOf(b);
    // arms stop at the neighbouring corners' fillets (an open path's ends when there is none)
    const prev = f.closed || ia > 0 ? end(cs[(ia + k - 1) % k]) : 0, next = f.closed || ib < k - 1 ? g.at[cs[(ib + 1) % k]] : N - 1;
    const back = walk(g.at[a], -1, prev), fwd = walk(end(b), 1, next), mid: P2[] = [];
    for (let i = g.at[a]; ; i = (i + 1) % N) { mid.push(g.path[i]); if (i === end(b)) break; }
    const raw = [...back.out.reverse(), ...mid, ...fwd.out], pegs = g.pegs.filter((p) => grp.includes(p.i));
    const lo = [0, 1].map((x) => Math.min(...raw.map((q) => q[x]), ...pegs.map((p) => p.c[x] - p.r)));
    const hi = [0, 1].map((x) => Math.max(...raw.map((q) => q[x]), ...pegs.map((p) => p.c[x] + p.r)));
    const sh = (q: P2): P2 => [q[0] - lo[0] + MARGIN, q[1] - lo[1] + MARGIN];
    const mids = grp.map((i) => { const m = (g.at[i] + end(i)) / 2, p = g.path[Math.floor(m)], q = g.path[Math.ceil(m)]; return sh([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); });
    const t0 = turn(a), angles = grp.map((i) => Math.sign(t0) * turn(i)), runs = grp.slice(1).map((i, m) => run(grp[m], i));
    const seq = (as: number[], rs: number[]) => as.map((x, m) => `${Math.round(x * 2)}${m < rs.length ? `:${Math.round(rs[m] * 10)}` : ""}`).join(",");
    const ra = [...angles].reverse(), rev = seq(ra.map((x) => Math.sign(ra[0]) * x), [...runs].reverse()), fw = seq(angles, runs);
    return { key: `${Math.round(f.d * 100)}|${rev < fw ? rev : fw}`, corners: grp.length, angles, runs, path: raw.map(sh), pegs: pegs.map((p) => ({ ...p, c: sh(p.c) })),
      mids, size: [hi[0] - lo[0], hi[1] - lo[1]], arms: back.s + fwd.s };
  };
  // a closed piece starts after its longest run, so a group never straddles the start
  let o = 0;
  if (f.closed) for (let m = 1; m < k; m++) if (run(cs[m - 1], cs[m]) > run(cs[(o + k - 1) % k], cs[o])) o = m;
  const order = [...cs.slice(o), ...cs.slice(0, o)], out: CornerJig[] = [];
  let grp = [order[0]];
  for (const c of order.slice(1)) {
    const fits = run(grp[grp.length - 1], c) < LINK && Math.max(...jig([...grp, c]).size) + 2 * MARGIN <= MAX_SIZE;
    if (fits) grp.push(c); else { out.push(jig(grp)); grp = [c]; }
  }
  out.push(jig(grp));
  return out;
}

/** Corner jig plate: the group's groove, open through the plate edge at both ends (the wire passes through), pegs as on a plate. */
function cornerPlate(M: ManifoldToplevel, j: CornerJig, d: number): Manifold {
  const { path, pegs } = j, n = path.length, W = j.size[0] + 2 * MARGIN, H = j.size[1] + 2 * MARGIN, { seg, ballAt, live } = cutters(M, path, d);
  const cuts: Manifold[] = [];
  for (let i = 0; i < n; i++) { if (i < n - 1 && live(i)) cuts.push(seg(i)); cuts.push(ballAt(i)); }
  for (const [e, s] of [[0, 1], [n - 1, -1]]) {   // run out along the end tangent to past the plate edge
    let o = e + s;
    while (o > 0 && o < n - 1 && Math.hypot(path[o][0] - path[e][0], path[o][1] - path[e][1]) < 1e-6) o += s;
    const q = path[e], l = Math.hypot(q[0] - path[o][0], q[1] - path[o][1]), u = [(q[0] - path[o][0]) / l, (q[1] - path[o][1]) / l];
    const t = Math.min(...[0, 1].filter((x) => Math.abs(u[x]) > 1e-9).map((x) => ((u[x] > 0 ? [W, H][x] : 0) - q[x]) / u[x]));
    cuts.push(rod(M, at0(q), [q[0] + u[0] * (t + 1), q[1] + u[1] * (t + 1), 0], d + CLEAR));
  }
  return slab(M, W, H, d, pegs).subtract(M.Manifold.union(cuts));
}

/** Design length of a piece in metres. */
const length = ({ pts, closed }: BendPath) => {
  let s = 0;
  for (let i = closed ? 0 : 1; i < pts.length; i++) { const a = pts[(i + pts.length - 1) % pts.length], b = pts[i]; s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
  return s / 1000;
};

/** Bend jigs for every planar bent piece of wire up to 3 mm: one plate per distinct shape; pieces too big for a plate get
 *  one corner jig per distinct corner group (purpose: how many corners or groups of the design it bends). */
export function bendParts(d: Design): PartSpec[] {
  const groups = new Map<string, { f: Flat; p: BendPath; n: number }>();
  for (const p of bendPaths(d)) {
    if (p.d > D_MAX + 1e-9) continue;
    const f = flatten(p);
    if (!f) continue;
    const k = signature(f), g = groups.get(k);
    if (g) g.n++; else groups.set(k, { f, p, n: 1 });
  }
  const out: PartSpec[] = [], jigs = new Map<string, { j: CornerJig; d: number; n: number }>();
  for (const { f, p, n } of groups.values()) {
    if (Math.max(...f.size) + 2 * MARGIN > MAX_SIZE) {   // too big for a plate: corner jigs (the one with the longest arms kept)
      for (const j of cornerJigs(f)) {
        const e = jigs.get(j.key);
        if (!e) jigs.set(j.key, { j, d: f.d, n });
        else { e.n += n; if (j.arms > e.j.arms + 1e-6) e.j = j; }
      }
      continue;
    }
    out.push({
      id: `bend-plate-${out.length + 1}`, title: BEND_STRINGS[0], use: "jig", qty: 1,
      purpose: msg(BEND_STRINGS[1], n, { len: f.d / 1000 }, { len: length(p) }), howTo: BEND_HOWTO.plate.map((s) => msg(s)),
      build: (M) => [plate(M, f)],
    });
  }
  let c = 0;
  for (const { j, d, n } of jigs.values()) {
    const deg = Math.round(Math.abs(j.angles[0]) * 2) / 2, len = { len: d / 1000 };
    const pair = j.corners === 2 && Math.round(Math.abs(j.angles[1]) * 2) / 2 === deg;
    out.push({
      id: `bend-corner-${++c}`, title: BEND_STRINGS[2], use: "jig", qty: 1,
      purpose: j.corners === 1 ? msg(BEND_STRINGS[3], n, len, deg) : pair ? msg(BEND_STRINGS[4], n, len, deg, { len: j.runs[0] / 1000 }) : msg(BEND_STRINGS[5], n, j.corners, len),
      howTo: BEND_HOWTO.corner.map((s) => msg(s)),
      build: (M) => [cornerPlate(M, j, d)],
    });
  }
  return out;
}
