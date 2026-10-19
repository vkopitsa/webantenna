import type { AntennaDef, Design, Params } from "./types";
import { cutList, pieces, tuning, type Piece } from "./build";
import { bendPaths, CORNER, flatten, signature, type BendPath, type P2 } from "./print/paths";
import type { V3 } from "./print/shapes";
import { D_MAX } from "./print/families/bend";

/** The steel bolt that serves as the bending die (mm): r = bolt radius, hole = clearance hole in a printed part. */
export interface Die { bolt: "M3" | "M4" | "M5" | "M6"; r: number; hole: number }
/** A corner (turn > 20°): `at` = metres from the cut start to the start of the bend arc (geometry), `mark` = metres from
 *  the cut start to the mark the builder puts on the die's tangent line: the end of the arc (at + Rc·θ), because both
 *  benders hold the wire on the side away from the cut start and swing the cut-start end round the die (no die: the
 *  corner, mark = at). `angle` is the turn in degrees. */
export interface Bend { at: number; mark: number; angle: number; dir: "L" | "R"; short: boolean }
/** A gentle run (turns ≤ 20°) from `from` to `to`, metres from the cut start; shaped by hand. */
export interface Curve { from: number; to: number }
export interface Recipe {
  tag: string; group: string; dia: number; qty: number;    // dia m
  cut: number; length: number;                             // m: cut-list length, developed (filleted) length
  closed: boolean; die: Die | null; bends: Bend[]; curves: Curve[];
  path: P2[];                                              // mm, flattened design path from the start point, for drawing
}

const DIES: Die[] = [
  { bolt: "M3", r: 1.5, hole: 3.4 }, { bolt: "M4", r: 2, hole: 4.5 }, { bolt: "M5", r: 2.5, hole: 5.5 }, { bolt: "M6", r: 3, hole: 6.6 },
];
const TURN_MIN = 1;   // degrees, as bendPaths: smaller turns are straight
const DEG = Math.PI / 180;

/** The smallest bolt with radius ≥ max(1.5, wire Ø) (mm); null for wire thicker than the benders take. */
export function dieFor(dMm: number): Die | null {
  if (dMm > D_MAX + 1e-9) return null;
  return DIES.find((x) => x.r >= Math.max(1.5, dMm) - 1e-9) ?? null;
}

/** A closed loop with no feed wire is cut where the feed sits on it (a point is inserted unless a vertex is within 0.5 mm); otherwise it keeps its start. */
function startAtFeed(bp: BendPath, d: Design): BendPath {
  if (!bp.closed || !d.feed || d.wires.some((w) => w.group === "feed" && !w.necOnly)) return bp;
  const w = d.wires[d.feed.wire];
  if (!w) return bp;
  const F = (d.feed.at === "start" ? w.a : d.feed.at === "end" ? w.b : [0, 1, 2].map((k) => (w.a[k] + w.b[k]) / 2)).map((c) => c * 1000);
  const n = bp.pts.length;
  let best = { i: 0, t: 0, dist: Infinity };
  for (let i = 0; i < n; i++) {
    const a = bp.pts[i], b = bp.pts[(i + 1) % n], e = [0, 1, 2].map((k) => b[k] - a[k]), l2 = e[0] * e[0] + e[1] * e[1] + e[2] * e[2] || 1;
    const t = Math.max(0, Math.min(1, [0, 1, 2].reduce((acc, k) => acc + (F[k] - a[k]) * e[k], 0) / l2));
    const dist = Math.hypot(...[0, 1, 2].map((k) => F[k] - a[k] - t * e[k]));
    if (dist < best.dist) best = { i, t, dist };
  }
  if (best.dist > Math.max(1, bp.d)) return bp;
  const a = bp.pts[best.i], b = bp.pts[(best.i + 1) % n], el = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  let pts = bp.pts;
  if (best.t * el < 0.5) pts = [...pts.slice(best.i), ...pts.slice(0, best.i)];
  else if ((1 - best.t) * el < 0.5) pts = [...pts.slice((best.i + 1) % n), ...pts.slice(0, (best.i + 1) % n)];
  else {
    const q = [0, 1, 2].map((k) => a[k] + best.t * (b[k] - a[k])) as V3;
    pts = [q, ...pts.slice(best.i + 1), ...pts.slice(0, best.i + 1)];
  }
  return { ...bp, pts };
}

/** A bend path cut wherever consecutive wires belong to different cut-list pieces, so every part is one physical wire
 *  (a biquad's loop is two halves that meet at the feed). Segments are matched to wires by their end points. */
function splitByPiece(bp: BendPath, d: Design, pcs: Piece[]): BendPath[] {
  const n = bp.pts.length, m = bp.closed ? n : n - 1;
  const near = (a: V3, c: number[]) => Math.hypot(a[0] - c[0] * 1000, a[1] - c[1] * 1000, a[2] - c[2] * 1000) < 1e-3;
  const owner = (i: number) => {
    const a = bp.pts[i], b = bp.pts[(i + 1) % n];
    const w = bp.wires.find((j) => (near(a, d.wires[j].a) && near(b, d.wires[j].b)) || (near(a, d.wires[j].b) && near(b, d.wires[j].a)));
    return w == null ? -1 : pcs.findIndex((q) => q.wires.includes(w));
  };
  const own = Array.from({ length: m }, (_, i) => owner(i));
  if (own.some((o) => o < 0)) return [bp];
  let s0 = 0;
  if (bp.closed) {
    const k = own.findIndex((o, i) => o !== own[(i + m - 1) % m]);
    if (k < 0) return [bp];
    s0 = k;
  } else if (own.every((o) => o === own[0])) return [bp];
  const out: BendPath[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length > 1) out.push({ ...bp, closed: false, pts: [...run.map((i) => bp.pts[i]), bp.pts[(run[run.length - 1] + 1) % n]], wires: bp.wires.filter((j) => pcs[own[run[0]]].wires.includes(j)) });
    run = [];
  };
  for (let t = 0; t < m; t++) {
    const i = (s0 + t) % m;
    if (run.length && own[i] !== own[run[run.length - 1]]) flush();
    run.push(i);
  }
  flush();
  return out;
}

/** Bend recipes of the design's wire pieces (one per distinct shape, `qty` copies); [] for sky-cone types.
 *  `trimmed` = the tags of `tuning(def, p, d).rows`, when the caller has them already (tuning rebuilds the design). */
export function bendRecipes(def: AntennaDef, p: Params, d: Design, trimmed?: Set<string>): Recipe[] {
  // sky-cone types have their own kit; d.cuts replaces the wire pieces by a table, and printed antennas have no bent wire
  if (def.id.startsWith("skycone") || d.cuts || d.pcb) return [];
  trimmed ??= new Set(tuning(def, p, d).rows.map((r) => r.tag));
  const pcs = pieces(d), rows = cutList(def, d, trimmed);
  const out: Recipe[] = [], sigs: string[] = [];
  for (const bp0 of bendPaths(d).flatMap((x) => splitByPiece(x, d, pcs))) {
    const bp = startAtFeed(bp0, d), f = flatten(bp);
    if (!f) continue;
    const pc = pcs.find((q) => !q.mech && bp0.wires.some((w) => q.wires.includes(w)));
    if (!pc) continue;
    const row = rows.find((r) => r.tag.split(/[,–]/).map((x) => x.trim()).includes(pc.tag) && pc.tag !== "");
    const sig = signature(f), cutLen = row?.cut ?? pc.length;
    const k = sigs.findIndex((x, j) => x === sig && Math.abs(out[j].cut - cutLen) < 0.5e-3 && Math.abs(out[j].dia - pc.dia) < 1e-5);
    if (k >= 0) {
      out[k].qty++;
      const tags = out[k].tag.split(/[,–]/).map((x) => x.trim());
      if (pc.tag && !tags.includes(pc.tag)) out[k].tag = `${tags[0]}–${pc.tag}`;
      continue;
    }
    const die = dieFor(f.d), Rc = die ? die.r + f.d / 2 : 0;
    const n = f.pts.length, m = f.closed ? n : n - 1;   // vertices 0..m; for a closed loop vertex m is vertex 0 again
    const v = (i: number) => f.pts[i % n];
    const L = (k2: number) => Math.hypot(v(k2 + 1)[0] - v(k2)[0], v(k2 + 1)[1] - v(k2)[1]);
    const cross = (i: number) => { const a = v(i - 1), b = v(i), c = v(i + 1); return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); };
    const turn = (i: number) => {   // degrees, interior vertices only (vertex 0 and m are the cut ends)
      if (i <= 0 || i >= m) return 0;
      const a = v(i - 1), b = v(i), c = v(i + 1), u = [b[0] - a[0], b[1] - a[1]], w = [c[0] - b[0], c[1] - b[1]];
      return Math.acos(Math.max(-1, Math.min(1, (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w) || 1)))) / DEG;
    };
    const isCorner = (i: number) => turn(i) > CORNER;
    const tan = (i: number) => (die && isCorner(i) ? Rc * Math.tan(turn(i) * DEG / 2) : 0);
    const bends: Bend[] = [], curves: Curve[] = [];
    let s = 0, open = false;
    for (let i = 1; i <= m; i++) {
      s += L(i - 1) - tan(i - 1) - tan(i);
      if (isCorner(i)) {
        const th = turn(i);
        bends.push({ at: s / 1000, mark: (s + Rc * th * DEG) / 1000, angle: th, dir: cross(i) > 0 ? "L" : "R", short: L(i - 1) < tan(i - 1) + tan(i) || L(i) < tan(i) + tan(i + 1) });
        s += Rc * th * DEG;
        open = false;
      } else if (turn(i) > TURN_MIN) {
        if (open) curves[curves.length - 1].to = s / 1000;
        else curves.push({ from: s / 1000, to: s / 1000 });
        open = true;
      } else open = false;
    }
    sigs.push(sig);
    out.push({ tag: pc.tag, group: bp.group, dia: pc.dia, qty: 1, cut: cutLen, length: s / 1000, closed: f.closed, die, bends, curves, path: f.pts });
  }
  return out;
}
