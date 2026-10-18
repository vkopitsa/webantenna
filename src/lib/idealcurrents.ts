// Assumed current distributions for the antennas the wire solver cannot model (Radiation view only): the printed collinear's in-phase radiator currents, the patch's
// TM10 sheet current, the coaxial collinear's in-phase half-wave sections and the small loop's uniform current.
// Same element basis as the MoM currents, so the near-field code and the current glow use them unchanged.
import type { Design, Vec3 } from "./types";
import type { CurrentElement } from "./mom";
import { copperBoxes } from "./pcb";

export interface IdealCurrents { els: CurrentElement[]; segs: Float64Array; ir: Float64Array; ii: Float64Array }

/** Path a → b in n pieces carrying current I(t), t ∈ [0, 1] along the path. */
function path(a: Vec3, b: Vec3, n: number, I: (t: number) => number, r: number, out: { els: CurrentElement[]; segs: number[]; ir: number[]; ii: number[] }, ph: [number, number] = [1, 0]): void {
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    const p: Vec3 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0];
    const q: Vec3 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1];
    const c = I(tm);
    out.els.push({ dl: [q[0] - p[0], q[1] - p[1], q[2] - p[2]], mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], cr: c * ph[0], ci: c * ph[1], r });
    out.segs.push(...p, ...q);
    out.ir.push(c * ph[0]); out.ii.push(c * ph[1]);
  }
}

/** Assumed currents for patch, collinear and pcbloop; null for every other type. */
export function idealCurrents(defId: string, d: Design): IdealCurrents | null {
  const out = { els: [] as CurrentElement[], segs: [] as number[], ir: [] as number[], ii: [] as number[] };
  if ((defId === "patch" || defId === "airpatch") && d.pcb) {
    // TM10 current along x over the patch copper, cos(πx/L) about its centre
    const p = d.pcb.rects.filter((q) => q.label === "Patch");
    if (!p.length) return null;
    const x0 = Math.min(...p.map((q) => q.x0)), x1 = Math.max(...p.map((q) => q.x1)), y0 = Math.min(...p.map((q) => q.y0)), y1 = Math.max(...p.map((q) => q.y1));
    const ny = 5, z = d.pcb.h;
    for (let j = 0; j < ny; j++) {
      const y = y0 + ((y1 - y0) * (j + 0.5)) / ny;
      path([x0, y, z], [x1, y, z], 16, (t) => Math.sin(Math.PI * t), (y1 - y0) / ny / 4, out);
    }
  } else if (defId === "cppatch" && d.pcb) {
    // two orthogonal TM modes in quadrature (Ey = −j Ex for RHCP, +j for LHCP): x currents real, y currents ∓j
    const p = copperBoxes(d.pcb).filter((q) => q.label === "Patch");
    if (!p.length) return null;
    const x0 = Math.min(...p.map((q) => q.x0)), x1 = Math.max(...p.map((q) => q.x1)), y0 = Math.min(...p.map((q) => q.y0)), y1 = Math.max(...p.map((q) => q.y1));
    const n = 5, z = d.pcb.h, yph: [number, number] = [0, d.sense === "lhcp" ? 1 : -1];
    for (let j = 0; j < n; j++) {
      const y = y0 + ((y1 - y0) * (j + 0.5)) / n, x = x0 + ((x1 - x0) * (j + 0.5)) / n;
      path([x0, y, z], [x1, y, z], 16, (t) => Math.sin(Math.PI * t), (y1 - y0) / n / 4, out);
      path([x, y0, z], [x, y1, z], 16, (t) => Math.sin(Math.PI * t), (x1 - x0) / n / 4, out, yph);
    }
  } else if (defId === "patcharray" && d.pcb && d.elements?.length) {
    // one TM sheet current per patch: linear along y; CP two orthogonal modes in quadrature (as cppatch) in the element's frame, rotated
    // with the element and carrying its feed phase lag
    const cp = d.sense != null, z = d.pcb.h, many = d.elements.length > 4, n = many ? 3 : 5, np = many ? 8 : 16, yq: [number, number] = [0, d.sense === "lhcp" ? 1 : -1];
    for (const el of d.elements) {
      const rho = cp ? el.psi + Math.PI / 2 : 0, ex: [number, number] = [Math.cos(rho), Math.sin(rho)], ey: [number, number] = [-Math.sin(rho), Math.cos(rho)];
      const ph: [number, number] = [Math.cos(-el.lag), Math.sin(-el.lag)], q2: [number, number] = [yq[0] * ph[0] - yq[1] * ph[1], yq[0] * ph[1] + yq[1] * ph[0]];
      const at = (u: number, v: number): Vec3 => [el.x + u * ex[0] + v * ey[0], el.y + u * ex[1] + v * ey[1], z];
      for (let j = 0; j < n; j++) {
        const o = (j + 0.5) / n - 0.5;
        if (cp) {
          path(at(-el.hx, o * 2 * el.hy), at(el.hx, o * 2 * el.hy), np, (t) => Math.sin(Math.PI * t), el.hy / n / 2, out, ph);
          path(at(o * 2 * el.hx, -el.hy), at(o * 2 * el.hx, el.hy), np, (t) => Math.sin(Math.PI * t), el.hx / n / 2, out, q2);
        } else path([el.x + o * 2 * el.hx, el.y - el.hy, z], [el.x + o * 2 * el.hx, el.y + el.hy, z], np, (t) => Math.sin(Math.PI * t), el.hx / n / 2, out);
      }
    }
  } else if (defId === "collinear") {
    // sections in phase: each a half-sine standing wave; the top whip a quarter-sine to zero at its tip
    for (const w of d.wires) {
      const isWhip = w.tag === "W";
      path(w.a, w.b, 16, isWhip ? (t) => Math.cos((Math.PI / 2) * t) * 0.7 : (t) => Math.sin(Math.PI * t), w.r, out);
    }
  } else if (defId === "pcbcollinear" && d.pcb) {
    // half-sine current on every radiator, all in phase at the design frequency
    const rs = d.pcb.rects.filter((q) => q.label === "Radiator" || q.label === "Feed radiator");
    if (!rs.length) return null;
    for (const q of rs) path([0, q.y0, d.pcb.h], [0, q.y1, d.pcb.h], 12, (t) => Math.sin(Math.PI * t), (q.x1 - q.x0) / 2, out);
  } else if (defId === "pcbloop") {
    // small loop: uniform current around the rectangle at the trace centre (from the drawn loop strips)
    const loop = d.plates.filter((q) => q.label === "Loop");
    if (!loop.length) return null;
    const xs = loop.flatMap((q) => q.pts.map((t) => t[0])), ys = loop.flatMap((q) => q.pts.map((t) => t[1]));
    const w = Math.max(...loop[0].pts.map((t) => t[0])) - Math.min(...loop[0].pts.map((t) => t[0])), z = loop[0].pts[0][2];
    const xa = Math.min(...xs) + w / 2, xb = Math.max(...xs) - w / 2, ya = Math.min(...ys) + w / 2, yb = Math.max(...ys) - w / 2;
    const c: Vec3[] = [[xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z]];
    for (let i = 0; i < 4; i++) path(c[i], c[(i + 1) % 4], 12, () => 1, w / 4, out);
  } else return null;
  if (!out.els.length) return null;
  return { els: out.els, segs: Float64Array.from(out.segs), ir: Float64Array.from(out.ir), ii: Float64Array.from(out.ii) };
}
