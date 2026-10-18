import type { Design } from "../types";
import { CLEAR, mm } from "./rules";
import type { V3 } from "./shapes";

/** A wire centre line to bend, in mm: a chain of wires through nodes of degree 2. Closed paths do not repeat the start point. */
export interface BendPath { pts: V3[]; closed: boolean; d: number; group: string }

const TURN_MIN = 1;   // degrees; below this the path is a straight rod

/** Ordered bend paths of a design: wires grouped by group + radius (feed, necOnly, drawOnly left out), split at nodes of degree ≠ 2. */
export function bendPaths(d: Design): BendPath[] {
  const len = (w: { a: number[]; b: number[] }) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1], w.b[2] - w.a[2]);
  const tol = Math.max(1e-3, ...d.wires.map(len)) * 1e-6;
  const key = (p: number[]) => p.map((c) => Math.round(c / tol)).join(",");
  const es = d.wires.filter((w) => w.group !== "feed" && !w.necOnly && !w.drawOnly && len(w) > 0);
  const kind = (w: (typeof es)[number]) => `${w.group ?? ""}|${w.r.toExponential(4)}`;
  const feedEnds = d.wires.filter((w) => w.group === "feed" && !w.necOnly).flatMap((w) => [w.b, w.a]).map(key);
  const at = new Map<string, number[]>();   // kind@node → wire indices
  const k2 = (i: number, p: number[]) => `${kind(es[i])}@${key(p)}`;
  es.forEach((w, i) => { for (const p of [w.a, w.b]) (at.get(k2(i, p)) ?? at.set(k2(i, p), []).get(k2(i, p))!).push(i); });
  const used = new Set<number>(), out: BendPath[] = [];
  const other = (i: number, k: string) => (key(es[i].a) === k ? es[i].b : es[i].a);
  /** The wire that continues past node k from wire i (null at a free end or a junction). */
  const next = (i: number, k: string) => { const js = at.get(`${kind(es[i])}@${k}`)!; return js.length === 2 ? js.find((j) => j !== i) ?? i : null; };
  es.forEach((w0, i0) => {
    if (used.has(i0)) return;
    // back up to the start of the chain; coming round to i0 again means a closed loop
    let i = i0, k = key(w0.a), closed = false;
    for (;;) {
      const j = next(i, k);
      if (j == null) break;
      if (j === i0) { closed = true; break; }
      k = key(other(j, k)); i = j;
    }
    if (closed) { i = i0; k = key(w0.a); }
    const pts: V3[] = [], start = closed ? (es[i].a) : (key(es[i].a) === k ? es[i].a : es[i].b);
    pts.push(start.map(mm) as V3);
    let node = start, j: number | null = i;
    while (j != null && !used.has(j)) {
      used.add(j);
      node = other(j, key(node));
      const nk = key(node);
      j = next(j, nk);
      if (!(closed && j === i)) pts.push(node.map(mm) as V3);
    }
    if (closed) {   // start at the feed end touching the loop
      const ks = pts.map((p) => key(p.map((c) => c / 1000)));
      const f = feedEnds.map((e) => ks.indexOf(e)).find((m) => m >= 0) ?? 0;   // feed.b first, then feed.a, else the first wire's a
      if (f > 0) pts.push(...pts.splice(0, f));
    }
    const ang = (a: V3, b: V3, c: V3) => {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      const cs = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v) || 1);
      return Math.acos(Math.max(-1, Math.min(1, cs))) * 180 / Math.PI;
    };
    const n = pts.length, turn = (m: number) => ang(pts[(m + n - 1) % n], pts[m], pts[(m + 1) % n]);
    let bent = false;
    for (let m = closed ? 0 : 1; m < (closed ? n : n - 1); m++) if (turn(m) > TURN_MIN) bent = true;
    if (n >= 3 && bent) out.push({ pts, closed, d: 2 * w0.r * 1000, group: w0.group ?? "" });
  });
  return out;
}

export type P2 = [number, number];
/** A planar bend path in 2D (mm, origin at the min corner, x along the longest segment); corners = vertices turning > CORNER°. */
export interface Flat { pts: P2[]; closed: boolean; d: number; corners: number[]; size: P2 }
/** Filleted centre line plus the pegs (inner side of each filleted corner, i = its vertex) that hold it; at[i] = index of vertex i's first path point. */
export interface Groove { path: P2[]; pegs: { c: P2; r: number; i: number }[]; at: number[] }

const CORNER = 20;   // degrees
const DEG = Math.PI / 180;
const turn2 = (a: P2, b: P2, c: P2) => {
  const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1)))) / DEG;
};

/** Project a path onto its best-fit plane (Newell normal; an open path's end points are projected); null when it leaves the plane by more than max(0.2, 0.1·d) mm (an end: max(1, d, half its segment)) or is a straight line. */
export function flatten(p: BendPath): Flat | null {
  const q = p.pts, n = q.length, dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // an open path's end points are feed leads and may sit off the plane (by ≤ max(1, d, half the end segment), projected onto
  // it): fit the interior when it can fix a plane
  const plane = (fit: V3[]) => {
    const m = fit.length, nrm = [0, 0, 0], c = [0, 0, 0];
    for (let i = 0; i < m; i++) {
      const a = fit[i], b = fit[(i + 1) % m];
      nrm[0] += (a[1] - b[1]) * (a[2] + b[2]); nrm[1] += (a[2] - b[2]) * (a[0] + b[0]); nrm[2] += (a[0] - b[0]) * (a[1] + b[1]);
      for (let k = 0; k < 3; k++) c[k] += a[k] / m;
    }
    let nl = Math.hypot(...nrm);
    if (nl < 1e-6) {   // Newell's sum vanishes for a Z-like shape: use the widest triple from the first point
      nl = 0;
      for (let i = 1; i < m; i++) for (let j = i + 1; j < m; j++) {
        const u = [fit[i][0] - fit[0][0], fit[i][1] - fit[0][1], fit[i][2] - fit[0][2]], v = [fit[j][0] - fit[0][0], fit[j][1] - fit[0][1], fit[j][2] - fit[0][2]];
        const w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...w);
        if (l > nl) { nl = l; nrm[0] = w[0]; nrm[1] = w[1]; nrm[2] = w[2]; }
      }
    }
    return nl < 1e-6 ? null : { N: nrm.map((x) => x / nl), c };
  };
  const inner = !p.closed && n >= 5 ? plane(q.slice(1, -1)) : null, pl = inner ?? plane(q);
  if (!pl) return null;
  const { N, c } = pl;
  const off = q.map((a) => dot([a[0] - c[0], a[1] - c[1], a[2] - c[2]], N));
  const tol = Math.max(0.2, 0.1 * p.d), seg = (i: number, j: number) => Math.hypot(q[j][0] - q[i][0], q[j][1] - q[i][1], q[j][2] - q[i][2]);
  const lead = (i: number) => (inner ? Math.max(1, p.d, 0.5 * (i === 0 ? seg(0, 1) : seg(n - 2, n - 1))) : tol);
  if (off.some((o, i) => Math.abs(o) > (inner && (i === 0 || i === n - 1) ? lead(i) : tol))) return null;
  const pr = q.map((a, i) => [a[0] - c[0] - N[0] * off[i], a[1] - c[1] - N[1] * off[i], a[2] - c[2] - N[2] * off[i]]);
  let best = 0, ax = [1, 0, 0];   // u along the longest segment
  for (let i = 0; i < (p.closed ? n : n - 1); i++) {
    const j = (i + 1) % n, w = [pr[j][0] - pr[i][0], pr[j][1] - pr[i][1], pr[j][2] - pr[i][2]], l = Math.hypot(...w);
    if (l > best) { best = l; ax = w.map((x) => x / l); }
  }
  if (best < 1e-6) return null;
  const V = [N[1] * ax[2] - N[2] * ax[1], N[2] * ax[0] - N[0] * ax[2], N[0] * ax[1] - N[1] * ax[0]];
  const xy = pr.map((a) => [dot(a, ax), dot(a, V)] as P2);
  const x0 = Math.min(...xy.map((a) => a[0])), y0 = Math.min(...xy.map((a) => a[1]));
  const pts = xy.map((a) => [a[0] - x0, a[1] - y0] as P2);
  const corners: number[] = [];
  for (let i = p.closed ? 0 : 1; i < (p.closed ? n : n - 1); i++) if (turn2(pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n]) > CORNER) corners.push(i);
  return { pts, closed: p.closed, d: p.d, corners, size: [Math.max(...pts.map((a) => a[0])), Math.max(...pts.map((a) => a[1]))] };
}

/** Replace each corner by an arc of centre-line radius Rf = rp + (d + CLEAR)/2 (tangent length clamped to 0.45 × the shorter neighbour run); pegs of radius rp inside. */
export function filleted(f: Flat): Groove {
  const rp = Math.max(1.5, f.d), Rf0 = rp + (f.d + CLEAR) / 2, n = f.pts.length, isC = new Set(f.corners);
  const path: P2[] = [], pegs: Groove["pegs"] = [], at: number[] = [];
  f.pts.forEach((P, i) => {
    at.push(path.length);
    if (!isC.has(i)) { path.push(P); return; }
    const A = f.pts[(i + n - 1) % n], B = f.pts[(i + 1) % n], la = Math.hypot(P[0] - A[0], P[1] - A[1]), lb = Math.hypot(B[0] - P[0], B[1] - P[1]);
    const u1 = [(P[0] - A[0]) / la, (P[1] - A[1]) / la], u2 = [(B[0] - P[0]) / lb, (B[1] - P[1]) / lb];
    const th = turn2(A, P, B) * DEG, tn = Math.tan(th / 2);
    const t = Math.min(Rf0 * tn, 0.45 * Math.min(la, lb)), Rf = t / tn;
    const bx = u2[0] - u1[0], by = u2[1] - u1[1], bl = Math.hypot(bx, by) || 1, k = Rf / Math.cos(th / 2) / bl;
    const C: P2 = [P[0] + bx * k, P[1] + by * k];
    const a1 = Math.atan2(P[1] - u1[1] * t - C[1], P[0] - u1[0] * t - C[0]), a2 = Math.atan2(P[1] + u2[1] * t - C[1], P[0] + u2[0] * t - C[0]);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const m = Math.max(1, Math.ceil(Math.abs(da) / (10 * DEG)));
    for (let s = 0; s <= m; s++) path.push([C[0] + Rf * Math.cos(a1 + da * s / m), C[1] + Rf * Math.sin(a1 + da * s / m)]);
    if (Rf >= rp + f.d / 2) pegs.push({ c: C, r: rp, i });
  });
  return { path, pegs, at };
}

/** Equal for pieces equal up to rotation, mirror and (for closed paths) start point (wire d and the closed flag included): segment lengths (0.1 mm) and |turn| (0.5°), minimum over reversal and rotation. */
export function signature(f: Flat): string {
  const seq = (q: P2[]) => {
    const n = q.length, o: string[] = [];
    for (let i = 0; i < n; i++) {
      if (!f.closed && i === n - 1) break;
      const b = q[(i + 1) % n], l = Math.round(Math.hypot(b[0] - q[i][0], b[1] - q[i][1]) * 10);
      o.push(f.closed || i > 0 ? `${Math.round(turn2(q[(i + n - 1) % n], q[i], b) * 2)}:${l}` : `${l}`);
    }
    return o;
  };
  const vs: string[] = [];
  for (const q of [f.pts, [...f.pts].reverse()]) {
    const s = seq(q), r = f.closed ? s.length : 1;
    for (let k = 0; k < r; k++) vs.push([...s.slice(k), ...s.slice(0, k)].join(","));
  }
  return `${f.closed ? "c" : "o"}${Math.round(f.d * 100)}|${vs.reduce((a, b) => (b < a ? b : a))}`;
}
