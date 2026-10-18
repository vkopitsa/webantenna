import type { Design } from "../types";
import { mm } from "./rules";
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
