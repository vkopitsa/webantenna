import { C0 } from "../rf";
import { add, axialRatio, cpResponse, div, mul, sc, type C } from "./cppatch";
import type { ArrayLayout, TNode } from "./arraylayout";

/**
 * Electrical model of the corporate-fed patch array (layout in arraylayout.ts):
 *  - feed network: every section is a lossy microstrip line (Zc, εeff from Hammerstad, Zc and widths of the design); loss per metre
 *    α = α_c + α_d with α_c = Rs/(Zc·w), Rs = √(π f µ0/σ), σ = 5.8·10⁷ S/m and α_d = k0 εr (εeff − 1) tan δ / (2 √εeff (εr − 1))
 *    (Pozar, Microwave Engineering, 3.8, eq. 3.30; Hammerstad & Jensen 1980 for the same εeff). Junctions are ideal T's (no step,
 *    corner or radiation effects). The tree is solved from the elements back to the port (ABCD of each section), so Zin, the
 *    amplitude and phase at every element and the power lost in the lines are exact for this circuit.
 *  - element: the cavity RLC (patch.ts) or the two-mode truncated-corner patch (cppatch.ts, its impedance doubled: it is designed for 100 Ω).
 *  - radiation: element field × array factor (isotropic positions, no mutual coupling), upper hemisphere (infinite ground).
 *    Gain = D · η_net · (1 − |Γ|²) · η_el, η_el = Q/Qr (dielectric loss of the cavity).
 */
const MU0 = 4e-7 * Math.PI, SIGMA = 5.8e7, DEG = Math.PI / 180;
const one: C = [1, 0];

function sect(zl: C, zc: number, al: number, bl: number): { zin: C; r: C } {
  const ea = Math.exp(al), ca = (ea + 1 / ea) / 2, sa = (ea - 1 / ea) / 2, cb = Math.cos(bl), sb = Math.sin(bl);
  const ch: C = [ca * cb, sa * sb], sh: C = [sa * cb, ca * sb];
  const a = add(mul(zl, ch), sc(sh, zc)), b = add(sc(ch, zc), mul(zl, sh));
  return { zin: sc(div(a, b), zc), r: div(zl, a) };
}

/** Loss (Np/m), phase constant (rad/m) and nominal Zc of the feed line of width w at f. */
export function lineAt(L: ArrayLayout, w: number, f: number) {
  const { er, tanD } = L, ee = L.ee(w), k0 = (2 * Math.PI * f) / C0, zc = w === L.lineW.w50 ? 50 : w === L.lineW.w70 ? 100 * Math.SQRT1_2 : 100;
  const ad = er > 1 ? (k0 * er * (ee - 1) * tanD) / (2 * Math.sqrt(ee) * (er - 1)) : 0;
  const ac = Math.sqrt(Math.PI * f * MU0 / SIGMA) / (zc * w);
  return { zc, alpha: ad + ac, beta: k0 * Math.sqrt(ee), ad, ac };
}

/** Element input impedance (Ω) and its field per volt: [gx, gy] (linear: gx only). */
export function elemResponse(L: ArrayLayout, f: number): { z: C; g: [C, C] } {
  const e = L.e;
  if (e.cp) { const r = cpResponse(e.cpm!, f); return { z: sc(r.z, 2), g: [div(r.ax, r.z), div(r.ay, r.z)] }; }
  const u = e.Q * (f / e.fr - e.fr / f), den = 1 + u * u;
  return { z: [e.R0 / den, (-e.R0 * u) / den], g: [one, [0, 0]] };
}

function solve(L: ArrayLayout, n: TNode, f: number, ze: C): { z: C; tf: [number, C][] } {
  if (n.leaf != null) return { z: ze, tf: [[n.leaf, one]] };
  const kids = n.kids!.map((k) => {
    const s = solve(L, k, f, ze);
    let z = s.z, r: C = one;
    for (const sec of k.secs) {
      if (!(sec.len > 0)) continue;
      const ln = lineAt(L, sec.w, f), o = sect(z, ln.zc, ln.alpha * sec.len, ln.beta * sec.len);
      z = o.zin; r = mul(r, o.r);
    }
    return { z, tf: s.tf.map(([i, t]) => [i, mul(t, r)] as [number, C]) };
  });
  return { z: div(mul(kids[0].z, kids[1].z), add(kids[0].z, kids[1].z)), tf: [...kids[0].tf, ...kids[1].tf] };
}

export interface NetResult { z: C; gamma: number; v: C[]; etaNet: number; ze: C; g: [C, C] }

/** Solve the network at f with 1 V at the port: input impedance, |Γ| against 50 Ω, voltage at every element feed, share of the accepted power that reaches the elements. */
export function netSolve(L: ArrayLayout, f: number): NetResult {
  const { z: ze, g } = elemResponse(L, f), s = solve(L, L.root, f, ze);
  let z = s.z, r: C = one;
  for (const sec of L.root.secs) {
    if (!(sec.len > 0)) continue;
    const ln = lineAt(L, sec.w, f), o = sect(z, ln.zc, ln.alpha * sec.len, ln.beta * sec.len);
    z = o.zin; r = mul(r, o.r);
  }
  const v: C[] = [];
  for (const [i, t] of s.tf) v[i] = mul(r, t);
  const gm = div([z[0] - 50, z[1]], [z[0] + 50, z[1]]), gamma = Math.hypot(gm[0], gm[1]);
  const pin = z[0] / (z[0] * z[0] + z[1] * z[1]), pel = v.reduce((a, x) => a + (x[0] * x[0] + x[1] * x[1]) * ze[0] / (ze[0] * ze[0] + ze[1] * ze[1]), 0);
  return { z, gamma, v, etaNet: pin > 0 ? Math.min(1, pel / pin) : 0, ze, g };
}

/** Width (Hz) of the contiguous range round f0 (±25 % scanned) where ok(f) holds; 0 if f0 itself fails within ±1 %. */
export function widthAround(ok: (f: number) => boolean, f0: number): number {
  const n = 600, lo = 0.75 * f0, df = (0.5 * f0) / n, mid = Math.round((f0 - lo) / df);
  const at = (i: number) => i >= 0 && i <= n && ok(lo + i * df);
  let c = -1;
  for (let k = 0; k <= n && c < 0 && k <= 0.01 * n * 2; k++) c = at(mid + k) ? mid + k : at(mid - k) ? mid - k : -1;
  if (c < 0) return 0;
  let a = c, b = c;
  while (at(a - 1)) a--;
  while (at(b + 1)) b++;
  return (b - a + 1) * df;
}

/** Boresight axial ratio (dB) of the array at f. */
export function arBoresight(L: ArrayLayout, f: number): number {
  const net = netSolve(L, f);
  let ex: C = [0, 0], ey: C = [0, 0];
  L.elems.forEach((el, i) => {
    const rho = el.psi + Math.PI / 2, c = Math.cos(rho), s = Math.sin(rho), v = net.v[i];
    ex = add(ex, mul(v, add(sc(net.g[0], c), sc(net.g[1], -s)))); ey = add(ey, mul(v, add(sc(net.g[0], s), sc(net.g[1], c))));
  });
  return axialRatio(ex, ey);
}

/** AR < 3 dB width and VSWR < 2 width (Hz) round the design frequency. */
export function arrayScan(L: ArrayLayout): { arBw: number; swrBw: number } {
  const arBw = L.cp ? widthAround((f) => arBoresight(L, f) < 3, L.f) : 0;
  const swrBw = widthAround((f) => netSolve(L, f).gamma < 1 / 3, L.f);
  return { arBw, swrBw };
}

const sinc = (x: number) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x);

/**
 * Directivity pattern (co-polar, circular for CP) of the array at f as D(θ, φ) in dBi (−60 below the horizon) together with the
 * network result. step: integration step (deg) of the radiated power.
 */
export function arrayPattern(L: ArrayLayout, f: number, step = 1) {
  const net = netSolve(L, f), k0 = (2 * Math.PI * f) / C0, e = L.e, Le = L.py + 2 * e.dL, Wd = L.px;
  const xv = [...new Set(L.elems.map((q) => q.x))], yv = [...new Set(L.elems.map((q) => q.y))];
  const ix = L.elems.map((q) => xv.indexOf(q.x)), iy = L.elems.map((q) => yv.indexOf(q.y));
  const types = [...new Set(L.elems.map((q) => (L.cp ? Math.round((q.psi / (Math.PI / 2) + 400) % 4) : 0)))];
  const typeOf = L.elems.map((q) => types.indexOf(L.cp ? Math.round((q.psi / (Math.PI / 2) + 400) % 4) : 0));
  const sg = L.lhcp ? -1 : 1, ex = new Float64Array(xv.length * 2), ey = new Float64Array(yv.length * 2);
  /** Complex field components (Eθ, Eφ) summed over the elements, or [|E|², 0] for the linear array. */
  const field = (th: number, ph: number): { et: C; ep: C } => {
    const st = Math.sin(th), ct = Math.cos(th), u = st * Math.cos(ph), v = st * Math.sin(ph);
    xv.forEach((x, i) => { ex[2 * i] = Math.cos(k0 * x * u); ex[2 * i + 1] = Math.sin(k0 * x * u); });
    yv.forEach((y, i) => { ey[2 * i] = Math.cos(k0 * y * v); ey[2 * i + 1] = Math.sin(k0 * y * v); });
    const af: C[] = types.map(() => [0, 0] as C);
    for (let i = 0; i < L.elems.length; i++) {
      const pr = ex[2 * ix[i]] * ey[2 * iy[i]] - ex[2 * ix[i] + 1] * ey[2 * iy[i] + 1], pi = ex[2 * ix[i]] * ey[2 * iy[i] + 1] + ex[2 * ix[i] + 1] * ey[2 * iy[i]];
      const a = af[typeOf[i]], w = net.v[i];
      a[0] += w[0] * pr - w[1] * pi; a[1] += w[0] * pi + w[1] * pr;
    }
    if (!L.cp) {
      // L along y: the patch.ts two-slot pattern turned by 90°
      const phr = ph - Math.PI / 2, cp = Math.cos(phr), sp = Math.sin(phr);
      const fe = Math.cos((k0 * Le * st * cp) / 2) * sinc((k0 * Wd * st * sp) / 2), pw = fe * fe * (cp * cp + ct * ct * sp * sp);
      const m = Math.sqrt(pw);
      return { et: [m * af[0][0], m * af[0][1]], ep: [0, 0] };
    }
    let et: C = [0, 0], ep: C = [0, 0];
    types.forEach((_, ti) => {
      const q = L.elems[typeOf.indexOf(ti)], phr = ph - (q.psi + Math.PI / 2), cph = Math.cos(phr), sph = Math.sin(phr);
      const slot = (p2: number) => Math.cos((k0 * Le * st * Math.cos(p2)) / 2) * sinc((k0 * Wd * st * Math.sin(p2)) / 2);
      const sx = slot(phr), sy = slot(phr - Math.PI / 2), [gx, gy] = net.g;
      const t1 = add(sc(gx, sx * cph), sc(gy, sy * sph)), t2 = sc(add(sc(gy, sy * cph), sc(gx, -sx * sph)), ct);
      et = add(et, mul(af[ti], t1)); ep = add(ep, mul(af[ti], t2));
    });
    return { et, ep };
  };
  const power = (th: number, ph: number) => {
    const { et, ep } = field(th, ph);
    return L.cp ? (et[0] ** 2 + et[1] ** 2 + ep[0] ** 2 + ep[1] ** 2) : et[0] ** 2 + et[1] ** 2;
  };
  const co = (th: number, ph: number) => {
    const { et, ep } = field(th, ph);
    if (!L.cp) return et[0] ** 2 + et[1] ** 2;
    const re = et[0] - sg * ep[1], im = et[1] + sg * ep[0];
    return 0.5 * (re * re + im * im);
  };
  let P = 0;
  const ds = step * DEG;
  for (let t = step / 2; t < 90; t += step) for (let p = step / 2; p < 360; p += step) P += power(t * DEG, p * DEG) * Math.sin(t * DEG) * ds * ds;
  const dir = (th: number, ph: number) => (th > Math.PI / 2 ? -60 : 10 * Math.log10(Math.max((4 * Math.PI * co(th, ph)) / P, 1e-6)));
  return { dir, d0: dir(0, 0), net };
}

/** −3 dB full width (deg) of the cut through the boresight in the plane φ. */
export function cutWidth(dir: (th: number, ph: number) => number, d0: number, ph: number): number {
  let prev = d0;
  for (let a = 0.1; a <= 90; a += 0.1) {
    const v = dir(a * DEG, ph);
    if (v < d0 - 3) return 2 * (a - 0.1 + (0.1 * (prev - (d0 - 3))) / (prev - v));
    prev = v;
  }
  return NaN;
}

/** Everything the design page and the simulation quote at frequency f. */
export function arrayMetrics(L: ArrayLayout, f: number, step = 2) {
  const { dir, d0, net } = arrayPattern(L, f, step);
  const mis = 1 - net.gamma ** 2, el = L.e.eff;
  const lossNet = -10 * Math.log10(Math.max(net.etaNet, 1e-6)), lossMis = -10 * Math.log10(Math.max(mis, 1e-6)), lossEl = -10 * Math.log10(Math.max(el, 1e-6));
  return { dir, d0, net, gain: d0 - lossNet - lossMis - lossEl, lossNet, lossMis, lossEl, hpbwE: cutWidth(dir, d0, Math.PI / 2), hpbwH: cutWidth(dir, d0, 0) };
}
