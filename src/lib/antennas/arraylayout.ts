import type { Params } from "../types";
import { num, str } from "../types";
import { microstripEeff, microstripWidth, wavelength } from "../rf";
import { r as pr, type PcbPoly, type PcbRect } from "../pcb";
import { patchDesign } from "./patch";
import { cpSetup, type CpModel } from "./cppatch";

/**
 * Corporate-fed patch array (geometry and feed tree; the electrical model is in arraymodel.ts).
 *
 * Elements sit on an nx × ny grid (nx, ny ∈ {2, 4, 8}) of pitch d, every one fed at the middle of its bottom edge (CP: the edge the
 * element's rotation brings there) by a 100 Ω line, so all elements of a linear array radiate in phase (a patch fed at the opposite edge
 * is 180° out of phase). The network is the standard binary corporate tree (Pozar, Microwave Engineering, 5.1 and 2.5 / Balanis 6.x):
 *   - two 100 Ω lines meet at a T-junction (50 Ω there); a λg/4 70.7 Ω section (Zc = √(50·100)) steps it back to 100 Ω for the next level;
 *   - along a row, level k joins two sub-trees 2^(k−1)·d apart; each level hangs one line pitch lower (the T is the lowest point, its
 *     output leaves downwards), so no line crosses another;
 *   - each row's root leaves to the right along the channel under the row, to a vertical bus beyond the last patch; there the rows are
 *     joined pairwise (a T at the middle of two rows, equal arms ±d/2), then pairs of pairs (jog right by one pitch, arms ±d, ±2d), up to
 *     the 50 Ω trunk to the edge port.
 * Every junction is symmetric, so the path from the port to every element has the same length. Bends are chamfered (optimum mitre,
 * Douville & James / Gupta, Garg, Bahl, "Microstrip Lines and Slotlines", 1996).
 * CP (sequential rotation, Hall 1989; Huang 1986): in every 2 × 2 cell the elements go round BL, BR, TR, TL, element k rotated by
 * k·90° (so it is fed from its bottom, right, top, left edge) and its feed line lengthened by k·λg/4 (mod λg, a meander bump in the arm).
 */
type Pt = [number, number];
const plen = (p: Pt[]) => p.reduce((s, a, i) => (i ? s + Math.hypot(a[0] - p[i - 1][0], a[1] - p[i - 1][1]) : 0), 0);

function clean(p: Pt[]): Pt[] {
  const o: Pt[] = [];
  for (const a of p) { const b = o[o.length - 1]; if (b && Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12) continue; o.push(a); }
  for (let i = o.length - 2; i >= 1; i--) {
    const ux = o[i][0] - o[i - 1][0], uy = o[i][1] - o[i - 1][1], vx = o[i + 1][0] - o[i][0], vy = o[i + 1][1] - o[i][1];
    if (Math.abs(ux * vy - uy * vx) < 1e-12 * (Math.hypot(ux, uy) * Math.hypot(vx, vy) + 1e-30) && ux * vx + uy * vy > 0) o.splice(i, 1);
  }
  return o;
}

/** The last s metres of a path (tail, from its cut point) and the rest (head), sharing the cut point. */
function cutEnd(p: Pt[], s: number): [Pt[], Pt[]] {
  let rem = s;
  for (let i = p.length - 1; i > 0; i--) {
    const a = p[i - 1], b = p[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (rem <= l + 1e-15) { const t = l > 0 ? (l - rem) / l : 0, m: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; return [[...p.slice(0, i), m], [m, ...p.slice(i)]]; }
    rem -= l;
  }
  return [[p[0]], p];
}

export interface Strip { pts: Pt[]; w: number }
export interface TNode {
  pt: Pt; kids?: [TNode, TNode]; leaf?: number;
  /** Centre line from the parent junction (the port for the root) to pt. */
  path: Pt[];
  /** Sections from pt towards the parent: width (m) and length (m). */
  secs: { w: number; len: number }[];
}

export type ElemDesign = ReturnType<typeof elemDesign>;

/** One element: size (px along x, py along y, unrotated, fed at the middle of the bottom edge), inset depth y0 and the cavity model. */
export function elemDesign(p: Params, f: number) {
  const er = num(p, "er", 3.38), h = num(p, "h", 1.524e-3), tanD = num(p, "tanD", 0.0027), trim = num(p, "trim", 0), lam = wavelength(f);
  const cp = str(p, "elem", "linear") === "cp";
  if (cp) {
    const { q, model, lhcp } = cpSetup({ ...p, feed: "truncated" }, f), a = q.aT;
    // the two split modes are in series (R0/2 each): R0 = 2·Zin = 200 Ω for a 100 Ω input at f0 (cppatch.ts uses 2·Z0 for 50 Ω)
    const y0 = q.Rin > 200 ? (a / Math.PI) * Math.acos(Math.sqrt(200 / q.Rin)) : 0;
    return { cp, px: a, py: a, y0, c: q.c, dL: q.dL, Q: q.Q, Qr: q.Qr, fr: q.fr, R0: 100, cpm: model as CpModel, lhcp, eff: q.Q / q.Qr, eeff: q.eeff, Rin: q.Rin };
  }
  const q = patchDesign(f, er, h, 100), floor = 0.1 * lam / Math.sqrt(er), fix = (x: number) => (Number.isFinite(x) ? Math.max(floor, x) : floor);
  const k = 1 + trim / 100, L0 = fix(q.L), W0 = fix(q.W);
  const y0 = q.Rin > 100 ? (L0 / Math.PI) * Math.acos(Math.sqrt(100 / q.Rin)) : 0;
  const Qr = 1 / (Math.SQRT2 * q.bw), Q = 1 / (1 / Qr + tanD), R0 = q.Rin * Math.cos((Math.PI * y0) / L0) ** 2;
  return { cp, px: W0 * k, py: L0 * k, y0: y0 * k, c: 0, dL: q.dL, Q, Qr, fr: f / k, R0: Number.isFinite(R0) ? R0 : 100, cpm: undefined as CpModel | undefined, lhcp: false, eff: Q / Qr, eeff: q.eeff, Rin: q.Rin };
}

const SIZES = [2, 4, 8];
/** Columns × rows from the size select ("4x2" = 4 columns, 2 rows). */
export function arraySize(p: Params): [number, number] {
  const m = /^(\d+)x(\d+)$/.exec(str(p, "size", "2x2"));
  const ok = (n: number) => (SIZES.includes(n) ? n : 2);
  return m ? [ok(+m[1]), ok(+m[2])] : [2, 2];
}

const rot = (x: number, y: number, k: number): Pt => (k === 0 ? [x, y] : k === 1 ? [-y, x] : k === 2 ? [-x, -y] : [y, -x]);
const PIN = [0, 1, 3, 2]; // (row parity)·2 + (column parity) → position in the cell's BL, BR, TR, TL circuit

export function arrayLayout(p: Params, f: number) {
  const er = num(p, "er", 3.38), h = num(p, "h", 1.524e-3), tanD = num(p, "tanD", 0.0027), lam = wavelength(f);
  const [nx, ny] = arraySize(p), e = elemDesign(p, f), cp = e.cp, lhcp = e.lhcp;
  const wid = (z: number) => { const w = microstripWidth(z, er, h); return Number.isFinite(w) && w > 0 ? w : 0.1 * h; };
  const w50 = wid(50), w70 = wid(100 * Math.SQRT1_2), w100 = wid(100);
  const ee = (w: number) => microstripEeff(er, w / h), lg = (w: number) => lam / Math.sqrt(ee(w));
  const q = lg(w70) / 4, lg100 = lg(w100);
  const gl = Math.max(2 * w100, h), pitch = w100 + gl, dv = (w70 + w100) / 2 + gl, jog = dv;
  const s = Math.max(2 * w100, h), gp = Math.max(4 * w100, h);
  const { px, py } = e, lx = Math.log2(nx), ly = Math.log2(ny);
  const off0 = w70 / 2 + gl + w100 / 2;
  const dReq = num(p, "dsp", 0.75) * lam;
  const dMinX = cp ? px + 2 * (gp + off0 + 2 * pitch) : px + 2 * gl;
  const dMinY = py + s + lx * dv + w70 / 2 + gl + (cp ? gp + w100 / 2 : 0);
  const d = Math.max(dReq, dMinX, dMinY), raised = d > dReq * (1 + 1e-9);
  let fit = true;
  const mitre = 0.52 + 0.65 * Math.exp(-1.35 * w100 / h);
  const rects: PcbRect[] = [], polys: PcbPoly[] = [], strips: Strip[] = [];

  const emitStrip = (path: Pt[], w: number) => {
    const c = clean(path);
    if (c.length < 2 || !(w > 0)) return;
    strips.push({ pts: c, w });
    if (c.length === 2) { rects.push(pr("top", c[0][0] - (c[0][1] === c[1][1] ? 0 : w / 2), c[0][1] - (c[0][1] === c[1][1] ? w / 2 : 0), c[1][0] + (c[0][1] === c[1][1] ? 0 : w / 2), c[1][1] + (c[0][1] === c[1][1] ? w / 2 : 0), "Feed line")); return; }
    const hw = w / 2, t = Math.min(0.98 * w, 2 * (1 - mitre) * w), L: Pt[] = [], R: Pt[] = [];
    const dir = (a: Pt, b: Pt): Pt => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    c.forEach((a, i) => {
      if (i === 0 || i === c.length - 1) {
        const dd = i === 0 ? dir(a, c[1]) : dir(c[i - 1], a), n: Pt = [-dd[1], dd[0]];
        L.push([a[0] + hw * n[0], a[1] + hw * n[1]]); R.push([a[0] - hw * n[0], a[1] - hw * n[1]]);
        return;
      }
      const d1 = dir(c[i - 1], a), d2 = dir(a, c[i + 1]), n1: Pt = [-d1[1], d1[0]], n2: Pt = [-d2[1], d2[0]], left = d1[0] * d2[1] - d1[1] * d2[0] > 0;
      const sx = hw * (n1[0] + n2[0]), sy = hw * (n1[1] + n2[1]);
      const inner: Pt = left ? [a[0] + sx, a[1] + sy] : [a[0] - sx, a[1] - sy], outer: Pt = left ? [a[0] - sx, a[1] - sy] : [a[0] + sx, a[1] + sy];
      const ch: Pt[] = [[outer[0] - t * d1[0], outer[1] - t * d1[1]], [outer[0] + t * d2[0], outer[1] + t * d2[1]]];
      if (left) { L.push(inner); R.push(...ch); } else { R.push(inner); L.push(...ch); }
    });
    polys.push({ layer: "top", pts: [...L, ...R.reverse()], label: "Feed line", w });
  };

  // ---- element positions, rotation, leaf routes
  const xs = Array.from({ length: nx }, (_, i) => (i - (nx - 1) / 2) * d), ys = Array.from({ length: ny }, (_, j) => (j - (ny - 1) / 2) * d);
  const ycOf = (j: number) => ys[j] - py / 2 - s;
  const hg = (d - px) / 2, Hmax = Math.max(0.25 * lam, d - lx * dv - w70 / 2 - gl - w100 / 2);
  const lag = (k: number) => (cp ? (k * lg100) / 4 : 0);
  const baseRoute = (i: number, j: number, k: number): Pt[] => {
    const cx = xs[i], cy = ys[j], xJ = (xs[i & ~1] + xs[i | 1]) / 2, yc = ycOf(j), a = px / 2, J: Pt = [xJ, yc];
    if (!cp || k === 0) return [J, [cx, yc], [cx, cy - py / 2 + e.y0]];
    if (k === 1) return [J, [cx + a + gp, yc], [cx + a + gp, cy], [cx + a - e.y0, cy]];
    if (k === 2) return [J, [cx + a + gp, yc], [cx + a + gp, cy + a + gp], [cx, cy + a + gp], [cx, cy + a - e.y0]];
    return [J, [cx - a - gp, yc], [cx - a - gp, cy], [cx - a + e.y0, cy]];
  };
  const kOf = (i: number, j: number) => (cp ? PIN[(j & 1) * 2 + (i & 1)] : 0);
  // extra length of leaf k (relative to leaf 0): the route-length difference made up to k·λg/4 modulo λg
  const Nk = (k: number) => plen(baseRoute(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0, k)); // the route length depends on the side of the pair the element is on
  const extra = [0, 1, 2, 3].map((k) => (k === 0 || !cp ? 0 : (((lag(k) - (Nk(k) - Nk(0))) % lg100) + lg100) % lg100));
  const withBump = (base: Pt[], E: number): Pt[] => {
    if (!(E > 1e-9)) return base;
    const n = Math.max(1, Math.ceil(E / (2 * Hmax))), H = E / (2 * n), sg = base[1][0] > base[0][0] ? 1 : -1, y = base[0][1];
    if (off0 + (2 * n - 1) * pitch > hg - gp + 1e-12) fit = false;
    const out: Pt[] = [base[0]];
    for (let b = 0; b < n; b++) {
      const x1 = base[0][0] + sg * (off0 + 2 * b * pitch), x2 = x1 + sg * pitch;
      out.push([x1, y], [x1, y + H], [x2, y + H], [x2, y]);
    }
    return [...out, ...base.slice(1)];
  };

  const elems: { x: number; y: number; psi: number; lag: number; hx: number; hy: number; k: number }[] = [];
  const mk = (pt: Pt, path: Pt[], kids?: [TNode, TNode], leaf?: number): TNode => ({ pt, path, kids, leaf, secs: [] });
  const block = (j: number, i0: number, n: number): TNode => {
    if (n === 2) {
      const xJ = (xs[i0] + xs[i0 + 1]) / 2, J: Pt = [xJ, ycOf(j)], kids = [i0, i0 + 1].map((i) => {
        const k = kOf(i, j), path = withBump(baseRoute(i, j, k), extra[k]);
        elems.push({ x: xs[i], y: ys[j], psi: (k * Math.PI) / 2, lag: (k * Math.PI) / 2, hx: px / 2, hy: py / 2, k });
        return mk(path[path.length - 1], path, undefined, elems.length - 1);
      }) as [TNode, TNode];
      return mk(J, [], kids);
    }
    const a = block(j, i0, n / 2), b = block(j, i0 + n / 2, n / 2), ya = a.pt[1], pt: Pt = [(a.pt[0] + b.pt[0]) / 2, ya - dv];
    a.path = [pt, [a.pt[0], pt[1]], a.pt]; b.path = [pt, [b.pt[0], pt[1]], b.pt];
    return mk(pt, [], [a, b]);
  };
  const rows = ys.map((_, j) => block(j, 0, nx));
  const xmax = xs[nx - 1] + px / 2 + (cp ? gp : 0), xB1 = xmax + 2 * gp, yT = (j: number) => rows[j].pt[1] - dv;
  let level: TNode[] = [];
  for (let m = 0; m < ny; m += 2) {
    const ym = (yT(m) + yT(m + 1)) / 2, M = mk([xB1, ym], [], [rows[m], rows[m + 1]]);
    for (const j of [m, m + 1]) rows[j].path = [M.pt, [xB1, yT(j)], [rows[j].pt[0], yT(j)], rows[j].pt];
    level.push(M);
  }
  while (level.length > 1) {
    const next: TNode[] = [];
    for (let m = 0; m < level.length; m += 2) {
      const a = level[m], b = level[m + 1], xB = a.pt[0] + jog, M = mk([xB, (a.pt[1] + b.pt[1]) / 2], [], [a, b]);
      a.path = [M.pt, [xB, a.pt[1]], a.pt]; b.path = [M.pt, [xB, b.pt[1]], b.pt];
      next.push(M);
    }
    level = next;
  }
  const top = level[0], trunk = Math.max(4 * w50, 3 * h), port: Pt = [top.pt[0] + trunk, top.pt[1]];
  top.path = [port, top.pt];

  // ---- sections and copper of the feed tree
  const fin = (n: TNode, root = false) => {
    const len = plen(n.path);
    if (root) n.secs = [{ w: w50, len }];
    else if (n.leaf != null) n.secs = [{ w: w100, len }];
    else { const qq = Math.min(q, len); n.secs = [{ w: w70, len: qq }, { w: w100, len: len - qq }]; }
    if (root) emitStrip(n.path, w50);
    else if (n.leaf != null) emitStrip(n.path, w100);
    else { const [head, tail] = cutEnd(n.path, n.secs[0].len); emitStrip(head, w100); emitStrip(tail, w70); }
    n.kids?.forEach((k) => fin(k));
  };
  fin(top, true);

  // ---- patches
  const gapn = Math.max(w100 / 2, 0.3e-3), wg = w100 / 2 + gapn;
  const notch = e.y0 > 0 && px / 2 - wg > 0.5 * gapn && e.y0 < py - 2 * gapn;
  const y0 = notch ? e.y0 : 0;
  elems.forEach((el) => {
    const { x: cx, y: cy } = el;
    if (!cp) {
      if (notch) rects.push(pr("top", cx - px / 2, cy - py / 2 + y0, cx + px / 2, cy + py / 2, "Patch"), pr("top", cx - px / 2, cy - py / 2, cx - wg, cy - py / 2 + y0, "Patch"), pr("top", cx + wg, cy - py / 2, cx + px / 2, cy - py / 2 + y0, "Patch"));
      else rects.push(pr("top", cx - px / 2, cy - py / 2, cx + px / 2, cy + py / 2, "Patch"));
      return;
    }
    const a = px / 2, c = e.c, yi = -a + y0;
    const loc: Pt[] = [[-a + c, -a], ...(notch ? [[-wg, -a], [-wg, yi], [wg, yi], [wg, -a]] as Pt[] : []), [a, -a], [a, a - c], [a - c, a], [-a, a], [-a, -a + c]];
    polys.push({ layer: "top", label: "Patch", pts: loc.map(([x, y]) => { const r = rot(x, y, el.k); return [cx + r[0], cy + r[1]] as Pt; }) });
  });

  // ---- board, mirror for the left hand
  const xsAll: number[] = [], ysAll: number[] = [];
  for (const r of rects) { xsAll.push(r.x0, r.x1); ysAll.push(r.y0, r.y1); }
  for (const q2 of polys) for (const [x, y] of q2.pts) { xsAll.push(x); ysAll.push(y); }
  const mb = Math.max(3 * h, 2 * gp);
  const board = { x0: Math.min(...xsAll) - mb, y0: Math.min(...ysAll) - mb, x1: port[0], y1: Math.max(...ysAll) + mb };
  const portBox = { start: [port[0], port[1] - w50 / 2, 0] as [number, number, number], stop: [port[0], port[1] + w50 / 2, h] as [number, number, number] };
  const m = lhcp ? -1 : 1;
  const fx = (r: PcbRect): PcbRect => (m > 0 ? r : { ...r, x0: -r.x1, x1: -r.x0 });
  const outRects = rects.map(fx), outPolys = polys.map((q2) => (m > 0 ? q2 : { ...q2, pts: q2.pts.map(([x, y]) => [-x, y] as Pt) }));
  const outBoard = m > 0 ? board : { x0: -board.x1, y0: board.y0, x1: -board.x0, y1: board.y1 };
  const outPort = m > 0 ? portBox : { start: [-portBox.start[0], portBox.start[1], 0] as [number, number, number], stop: [-portBox.stop[0], portBox.stop[1], h] as [number, number, number] };
  const outElems = elems.map((el) => ({ ...el, x: m * el.x, psi: m * el.psi }));
  const outStrips = strips.map((st) => ({ w: st.w, pts: st.pts.map(([x, y]) => [m * x, y] as Pt) }));
  const lineW = { w50, w70, w100 };
  return {
    nx, ny, d, dReq, raised, fit, cp, lhcp, lam, f, e, er, h, tanD, px, py, y0, notch, q, lg100, lineW, gp, s, dv, off0, lx, ly,
    elems: outElems, root: top, rects: outRects, polys: outPolys, strips: outStrips, board: outBoard, port: outPort, portY: port[1],
    ee, lg,
  };
}
export type ArrayLayout = ReturnType<typeof arrayLayout>;

/** Path length (m) from the port to every element, in element order. */
export function leafLengths(root: TNode): number[] {
  const out: number[] = [];
  const walk = (n: TNode, acc: number) => {
    const t = acc + n.secs.reduce((s, x) => s + x.len, 0);
    if (n.leaf != null) out[n.leaf] = t;
    n.kids?.forEach((k) => walk(k, t));
  };
  walk(root, 0);
  return out;
}
