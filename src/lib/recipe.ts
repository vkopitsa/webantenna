import type { AntennaDef, Design, Params } from "./types";
import { cutList, cutWhat, pieces, tuning, type Msg } from "./build";
import { bendPaths, CORNER, flatten, signature, splitByPiece, type BendPath, type P2 } from "./print/paths";
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
  what: Msg;                                               // the piece, as the cut list names it
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

const TRIMMED = new WeakMap<Design, Set<string>>();
/** Tags of the trimmed parts (`tuning(def, p, d).rows`), memoised per Design: tuning rebuilds the design. */
export function trimmedTags(def: AntennaDef, p: Params, d: Design): Set<string> {
  let t = TRIMMED.get(d);
  if (!t) TRIMMED.set(d, t = new Set(tuning(def, p, d).rows.map((r) => r.tag)));
  return t;
}

const RECIPES = new WeakMap<Design, Recipe[]>();

/** Bend recipes of the design's wire pieces (one per distinct shape, `qty` copies); [] for sky-cone types.
 *  Memoised per Design (the Build panel, the templates, the PDF and the printed parts share one result); a design with
 *  no bent path returns [] before the tuning (which rebuilds the design) runs. */
export function bendRecipes(def: AntennaDef, p: Params, d: Design): Recipe[] {
  const hit = RECIPES.get(d);
  if (hit) return hit;
  const out = recipesOf(def, p, d);
  RECIPES.set(d, out);
  return out;
}

/** Bend marks and gentle curves of one flattened wire (mm): the shared core of the per-piece and the sky-cone frame recipes. */
function recipeOf(f: { pts: P2[]; closed: boolean; d: number }, head: { tag: string; group: string; what: Msg; dia: number; cut: number }): Recipe {
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
  return { ...head, qty: 1, length: s / 1000, closed: f.closed, die, bends, curves, path: f.pts };
}

/** Wire cages (Design.cuts + frames): the hot and ground frame of each side, bent from the (ρ, z) profile; hoops and coiled
 *  shorting wires are rings and 3D coils, which get no recipe. */
function frameRecipes(d: Design, rows: ReturnType<typeof cutList>): Recipe[] {
  const out: Recipe[] = [];
  for (const [side, tag, prefix] of [["hot", "H", "Hot frame"], ["ground", "G", "Ground frame"]] as const) {
    const row = rows.find((r) => r.what.s.startsWith(prefix));
    const pts = d.frames![side].map(([r, z]) => [r * 1000, z * 1000] as P2);
    if (!row || pts.length < 2) continue;
    const rc = recipeOf({ pts, closed: false, d: row.dia * 1000 }, { tag, group: side === "hot" ? "driven" : "ground", what: row.what, dia: row.dia, cut: row.cut });
    rc.qty = row.qty;
    out.push(rc);
  }
  return out;
}

function recipesOf(def: AntennaDef, p: Params, d: Design): Recipe[] {
  // printed antennas have no bent wire; a sky-cone with sheets only has no wire pieces
  if (d.pcb || (def.id.startsWith("skycone") && !d.cuts)) return [];
  // d.cuts replaces the wire pieces by a table (wire cages: their frames are bent from d.frames)
  if (d.cuts) return d.frames ? frameRecipes(d, cutList(def, d, new Set())) : [];
  const bps = bendPaths(d);
  if (!bps.length) return [];
  const pcs = pieces(d), rows = cutList(def, d, trimmedTags(def, p, d));
  const out: Recipe[] = [], sigs: string[] = [];
  for (const bp0 of bps.flatMap((x) => splitByPiece(x, d, pcs))) {
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
    sigs.push(sig);
    out.push(recipeOf(f, { tag: pc.tag, group: bp.group, what: row?.what ?? { s: cutWhat(pc, def), a: [] }, dia: pc.dia, cut: cutLen }));
  }
  return out;
}
