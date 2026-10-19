// Antenna picker icons: Design → SVG path data in a SIZE × SIZE box. Pure (no DOM), so it runs in Node tests.
import type { Design, Vec3 } from "../lib/types";
import { cameraBasis } from "./plane";

export const SIZE = 36, PAD = 3;
/** Candidate [yaw, pitch] views; the 3/4 view wins unless another shows clearly more of the antenna. */
const VIEWS: { v: [number, number]; bias: number }[] = [
  { v: [125, 28], bias: 1.25 }, { v: [90, 90], bias: 1 }, { v: [180, 0], bias: 1 }, { v: [90, 0], bias: 1 },
];
const MAX_WIRE_PTS = 400, MAX_PLATES = 80;

export interface IconPaths { wires: string; metal: string; dielectric: string }
type P = [number, number];

const project = (yaw: number, pitch: number) => {
  const { right, down, depth } = cameraBasis(yaw, pitch);
  const dot = (a: Vec3, q: Vec3) => a[0] * q[0] + a[1] * q[1] + a[2] * q[2];
  return (q: Vec3): [number, number, number] => [dot(right, q), dot(down, q), dot(depth, q)];
};

/** Ramer–Douglas–Peucker, iterative. */
function rdp(pts: P[], tol: number): P[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = pts[s], dx = pts[e][0] - ax, dy = pts[e][1] - ay, len = Math.hypot(dx, dy);
    let best = -1, bi = -1;
    for (let i = s + 1; i < e; i++) {
      const d = len < 1e-12 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([s, bi], [bi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const near = (a: Vec3, b: Vec3) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 1e-9;

/** Merge wires that continue each other (end meets the next start) into polylines. */
function chains(wires: { a: Vec3; b: Vec3 }[]): Vec3[][] {
  const out: Vec3[][] = [];
  let cur: Vec3[] | null = null;
  for (const w of wires) {
    if (cur && near(cur[cur.length - 1], w.a)) cur.push(w.b);
    else { cur = [w.a, w.b]; out.push(cur); }
  }
  return out;
}

const n1 = (x: number) => String(Math.round(x * 10) / 10);

/** Icon paths for a design, or null when it has nothing to draw. */
export function iconGeometry(d: Design): IconPaths | null {
  const wires = d.wires.filter((w) => !w.necOnly && !w.drawOnly);
  const plates = d.plates;
  if (!wires.length && !plates.length) return null;
  const allPts: Vec3[] = [...wires.flatMap((w) => [w.a, w.b]), ...plates.flatMap((p) => p.pts)];
  const bbox = (P: (q: Vec3) => [number, number, number]) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of allPts) { const p = P(q); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    return { x0, x1, y0, y1 };
  };
  // pick the view whose fitted drawing is largest (scale = what fits the box, so a long thin dipole prefers a view that shows its length)
  let best = VIEWS[0].v, bestScore = -1;
  for (const { v, bias } of VIEWS) {
    const b = bbox(project(v[0], v[1]));
    const w = b.x1 - b.x0, h = b.y1 - b.y0, m = Math.max(w, h);
    if (m <= 0) continue;
    const score = ((w * h) / (m * m)) * bias;   // filled share of the square box (0 for an edge-on view)
    if (score > bestScore) { bestScore = score; best = v; }
  }
  const P = project(best[0], best[1]);
  const b = bbox(P);
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0, 1e-9);
  const k = (SIZE - 2 * PAD) / span;
  const ox = SIZE / 2 - ((b.x0 + b.x1) / 2) * k, oy = SIZE / 2 - ((b.y0 + b.y1) / 2) * k;
  const S = (q: Vec3): P => { const p = P(q); return [ox + p[0] * k, oy + p[1] * k]; };

  // wires: polylines, simplified until they fit the point budget
  const lines = chains(wires).map((c) => c.map(S));
  let tol = 0.25, simp = lines;
  for (let i = 0; i < 8; i++) {
    simp = lines.map((l) => rdp(l, tol));
    if (simp.reduce((s, l) => s + l.length, 0) <= MAX_WIRE_PTS) break;
    tol *= 2;
  }
  // drop specks (a polyline shorter than 0.6 px) and, if still too many, the shortest
  const plen = (l: P[]) => l.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - l[i][0], q[1] - l[i][1]), 0);
  let kept = simp.map((l) => ({ l, n: plen(l) })).filter((x) => x.n >= 0.6);
  if (kept.reduce((s, x) => s + x.l.length, 0) > MAX_WIRE_PTS * 1.5) kept = kept.sort((a, c) => c.n - a.n).slice(0, 150);
  const wd = kept.map(({ l }) => "M" + l.map((q) => n1(q[0]) + " " + n1(q[1])).join("L")).join("");

  // plates: biggest first, far to near so the nearer one overdraws
  const polys = plates.map((p) => {
    const q = p.pts.map(S);
    let area = 0;
    for (let i = 0; i < q.length; i++) { const j = (i + 1) % q.length; area += q[i][0] * q[j][1] - q[j][0] * q[i][1]; }
    return { p, q, area: Math.abs(area) / 2, z: p.pts.reduce((s, x) => s + P(x)[2], 0) / p.pts.length };
  }).filter((x) => x.area > 0.5);
  const top = polys.sort((a, c) => c.area - a.area).slice(0, MAX_PLATES).sort((a, c) => c.z - a.z);
  const pd = (m: "metal" | "dielectric") => top.filter((x) => x.p.material === m).map((x) => "M" + x.q.map((q) => n1(q[0]) + " " + n1(q[1])).join("L") + "Z").join("");
  const res = { wires: wd, metal: pd("metal"), dielectric: pd("dielectric") };
  return res.wires || res.metal || res.dielectric ? res : null;
}
