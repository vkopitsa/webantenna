import type { AntennaDef, Design, Params, Wire } from "../types";
import { num, str } from "../types";
import { C0, fmt, wavelength } from "../rf";
import { v } from "../geom";
import { pcbPlates, PRINTED_TRIM, r as pr, type Pcb, type PcbLevel, type PcbRect } from "../pcb";
import { band, BANDS } from "./common";
import { span } from "./pcbcommon";
import { patchDesign } from "./patch";

/**
 * Air-dielectric (suspended) probe-fed patch: a metal plate a height h above a ground plane, εr = 1 (cavity model, Balanis ch. 14;
 * Garg et al., "Microstrip Antenna Design Handbook", ch. 2; Lee & Luk, "Microstrip Patch Antennas", ch. 1–2).
 *  - L, W, ΔL: transmission-line model with εeff = 1 (Hammerstad ΔL, valid for h/λ up to ~0.1);
 *  - Q: Jackson & Alexopoulos 1991 radiation Q, Qr = (3/16)(εr/(p c1))(L/W)(λ0/h), c1 = 1 − 1/n² + 2/(5n⁴), n = √εr
 *    (the Jackson bandwidth fit of patch.ts goes to 0 for air); no dielectric loss, copper loss neglected;
 *  - probe: series inductance X_L = (η0 k h / 2π)(ln(2/(k a)) − γ) (a: probe radius, γ = 0.5772, Balanis 14.5 / Lee & Luk). On a
 *    thick air patch it is tens of ohms, so the patch is cut a little LONG (resonates below f0, capacitive at f0) and the probe goes
 *    nearer the edge (higher R0): R0 = Z0 (1 + (X_L/Z0)²), u = X_L/Z0 at f0 cancel X_L exactly.
 *  - director: a second plate above the patch, built into the Pcb (FDTD, openEMS, BOM) but NOT in the analytic model: the in-browser
 *    FDTD of sizes 0.7–1.4 × the patch at 0.1–0.25 λ showed no gain over the plain patch (≤ 9.5 dBi) and a worse match, see docs/ANTENNAS.md.
 */
const Z0 = 50, GAMMA = 0.5772156649, ETA0 = 120 * Math.PI;
const A2 = -0.16605, A4 = 0.00761, C2 = -0.0914153;

/** Probe radius (m): the SMA pin (Ø1.3 mm), a rod of 0.0053 λ below 2.4 GHz (Ø3.2 mm at 1 GHz), never more than a tenth of the height. */
export const probeR = (h: number, lam: number) => Math.min(0.1 * h, Math.max(0.65e-3, 0.0053 * lam));

/** Probe inductance (Ω) at f for height h and probe radius a. */
export function probeX(f: number, h: number, a: number): number {
  const k = (2 * Math.PI * f) / C0;
  return Math.max(0, ((ETA0 * k * h) / (2 * Math.PI)) * (Math.log(2 / (k * a)) - GAMMA));
}

/** Jackson–Alexopoulos radiation Q of a rectangular patch (L along the resonant direction). */
export function airQrad(f: number, L: number, W: number, h: number, er = 1): number {
  const lam = wavelength(f), k0 = (2 * Math.PI) / lam, kW = k0 * W, kL = k0 * L, n = Math.sqrt(er);
  const p = 1 + (A2 / 10) * kW ** 2 + ((3 * A2 ** 2 + 2 * A4) / 560) * kW ** 4 + (C2 / 5) * kL ** 2 + ((A2 * C2) / 70) * (kW * kL) ** 2;
  const c1 = 1 - 1 / (n * n) + 2 / (5 * n ** 4);
  return ((3 / 16) * (er / (Math.max(p, 0.25) * c1)) * (L / W) * lam) / h;
}

export interface AirModel { f0: number; fr: number; R0: number; XL: number; Q: number }

/** Input impedance: probe reactance (∝ f) in series with the cavity's parallel RLC at the probe. */
export function airZ(m: AirModel, f: number): [number, number] {
  const u = m.Q * (f / m.fr - m.fr / f), den = 1 + u * u;
  return [m.R0 / den, (-m.R0 * u) / den + (m.XL * f) / m.f0];
}

/** Width (Hz) of the contiguous VSWR < 2 range around f0 (0 if f0 is not matched; scan ±30 %). */
export function airScan(m: AirModel, z0 = Z0): { swrBw: number } {
  const n = 1200, f1 = 0.7 * m.f0, df = (0.6 * m.f0) / n, mid = Math.round((m.f0 - f1) / df);
  const ok = (i: number) => {
    if (i < 0 || i > n) return false;
    const [r, x] = airZ(m, f1 + i * df), g = Math.hypot(r - z0, x) / Math.hypot(r + z0, x);
    return (1 + g) / (1 - g) < 2;
  };
  let c = -1;
  for (let k = 0; k <= 40 && c < 0; k++) c = ok(mid + k) ? mid + k : ok(mid - k) ? mid - k : -1; // a match within ±3 % of f0
  if (c < 0) return { swrBw: 0 };
  let lo = c, hi = c;
  while (ok(lo - 1)) lo--;
  while (ok(hi + 1)) hi++;
  return { swrBw: (hi - lo + 1) * df };
}

/** The design for centre frequency f, height h (m) and the length trim (%). */
export function airDesign(f: number, h: number, trim = 0) {
  const lam = wavelength(f), a = probeR(h, lam);
  const q0 = patchDesign(f, 1, h, Z0); // εeff = 1; W = λ/2
  const W = q0.W, Qd = (L: number) => airQrad(f, L, W, h);
  const XL = probeX(f, h, a), uT = XL / Z0, Rt = Z0 * (1 + uT * uT);
  // Cavity at fr < f0 cancelling u·R0/(1+u²) = X_L; L, Q and Redge depend on the length, so a few passes.
  const pass = (R0: number, u: number) => {
    let q = q0, Q = Qd(q0.L), fr = f;
    for (let i = 0; i < 5; i++) {
      fr = f / ((u / Q + Math.sqrt((u / Q) ** 2 + 4)) / 2); // f0/fr − fr/f0 = u/Q
      q = patchDesign(fr, 1, h, Z0, W); Q = Qd(q.L);
    }
    return { q, Q, fr, R0, u };
  };
  let s = pass(Rt, uT);
  const matched = Rt <= s.q.Rin;
  if (!matched) { // the probe is at the edge: cancel as much of X_L as that R0 allows
    const R0 = q0.Rin, x = XL / R0;
    s = pass(R0, x <= 0 ? 0 : x < 0.5 ? (1 - Math.sqrt(1 - 4 * x * x)) / (2 * x) : 1);
    s = pass(s.q.Rin, s.u);
  }
  const { q, Q, fr, R0, u } = s;
  const k = 1 + trim / 100, L = q.L * k;
  const y0 = R0 < q.Rin ? (q.L / Math.PI) * Math.acos(Math.sqrt(R0 / q.Rin)) : 0;
  return { lam, h, a, W, L, Lc: q.L, dL: q.dL, Redge: q.Rin, R0, y0, XL, u, Q, fr: fr / k, Qrad: Q, matched, model: { f0: f, fr: fr / k, R0, XL, Q } as AirModel };
}

/** Zero-reactance frequency of the plates as built for height h (L, W, probe position fixed) when the real gap is h2 (m). */
export function airHeightShift(f: number, h: number, trim: number, h2: number): number {
  const d = airDesign(f, h, trim), W = d.W;
  let lo = 0.3 * f, hi = 2 * f; // fr2: the cavity length at gap h2 equals the built L (L falls as f rises)
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (patchDesign(mid, 1, h2, Z0, W).L > d.L) lo = mid; else hi = mid; }
  const fr = (lo + hi) / 2, q = patchDesign(fr, 1, h2, Z0, W), a = probeR(h2, wavelength(f));
  const m: AirModel = { f0: f, fr, R0: q.Rin * Math.cos((Math.PI * d.y0) / d.Lc) ** 2, XL: probeX(f, h2, a), Q: airQrad(f, d.L, W, h2) };
  let prev = airZ(m, fr)[1];
  for (let i = 1; i <= 2000; i++) { // first sign change of X above the cavity resonance
    const g = fr * (1 + (0.6 * i) / 2000), x = airZ(m, g)[1];
    if (prev < 0 && x >= 0) return g;
    prev = x;
  }
  return NaN;
}

/** Two-slot power pattern of the patch over a ground plane (upper hemisphere), including the slot height h. */
export function airRaw(d: { L: number; W: number; dL: number; h: number }, fPat: number) {
  const k0 = (2 * Math.PI * fPat) / C0, Le = d.L + 2 * d.dL;
  return (th: number, ph: number) => {
    if (th > Math.PI / 2) return 0;
    const st = Math.sin(th), ct = Math.cos(th), sp = Math.sin(ph), cp = Math.cos(ph);
    const sinc = (x: number) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x);
    const af = Math.cos((k0 * Le * st * cp) / 2), sw = sinc((k0 * d.W * st * sp) / 2), sh = sinc((k0 * d.h * ct) / 2);
    return (af * sw * sh) ** 2 * (cp * cp + ct * ct * sp * sp);
  };
}

/** Peak directivity (dBi) of the model pattern: boresight, upper hemisphere only. */
export function airDirectivity(d: ReturnType<typeof airDesign>, fPat: number, step = 2): number {
  const raw = airRaw(d, fPat);
  let P = 0;
  for (let t = step / 2; t < 90; t += step) for (let p = step / 2; p < 360; p += step) P += raw((t * Math.PI) / 180, (p * Math.PI) / 180) * Math.sin((t * Math.PI) / 180);
  return 10 * Math.log10((4 * Math.PI) / (P * (step * Math.PI / 180) ** 2));
}

/** Parameter set → design and response model (shared by the builder, the simulation and synthesis). */
export function airSetup(p: Params, f: number) {
  const hf = num(p, "hf", 0.06), dir = str(p, "director", "none") === "director";
  return { dir, ds: num(p, "ds", 0.1), dr: num(p, "dr", 0.95), q: airDesign(f, hf * wavelength(f), num(p, "trim", 0)) };
}

export const airpatch: AntennaDef = {
  id: "airpatch",
  name: "Air patch (suspended)",
  category: "Printed",
  traits: { pol: "linear", pattern: "beam" },
  summary: "Metal patch suspended in air over a ground plate on nylon standoffs, SMA probe feed: about 9 dBi, 6–8 % bandwidth, any band from 1 GHz. Optional experimental director plate.",
  params: [
    BANDS,
    { key: "hf", label: "Patch height above ground (× λ)", kind: "number", min: 0.02, max: 0.12, step: 0.005, hint: "0.05–0.08 λ: more height, more bandwidth, more probe inductance" },
    { key: "t", label: "Sheet thickness", kind: "length", min: 0.1e-3, max: 3e-3 },
    { key: "gs", label: "Ground plate side (× λ)", kind: "number", min: 0.6, max: 3, step: 0.05, hint: "About 1 λ; bigger gives a smaller back lobe" },
    { key: "director", label: "Director plate", kind: "select", options: [["none", "None"], ["director", "Parasitic plate above the patch (experimental)"]] },
    { key: "dr", label: "Director size (× patch)", kind: "number", min: 0.7, max: 1.4, step: 0.01, hint: "Used only with a director; experimental" },
    { key: "ds", label: "Director spacing above the patch (× λ)", kind: "number", min: 0.05, max: 0.25, step: 0.005, hint: "0.1–0.2 λ; used only with a director" },
    PRINTED_TRIM,
  ],
  defaults: { bands: "2.4e9-2.4835e9", hf: 0.06, t: 0.5e-3, gs: 1, director: "none", ds: 0.1, dr: 0.95, trim: 0 },
  build(p): Design {
    const { f, sweeps, f1, f2 } = band(p);
    const t = num(p, "t", 0.5e-3), gs = num(p, "gs", 1);
    const { dir, ds, dr, q } = airSetup(p, f);
    const { lam, h, W, L, y0, a } = q;
    const G = Math.max(gs * lam, Math.max(L, W) + 4 * h), sD = ds * lam;
    const xp = -L / 2 + y0, xs = 0, ys = W / 3;
    const board = { x0: -G / 2, y0: -G / 2, x1: G / 2, y1: G / 2 };
    const rects: PcbRect[] = [pr("bottom", -G / 2, -G / 2, G / 2, G / 2, "Ground"), pr("top", -L / 2, -W / 2, L / 2, W / 2, "Patch")];
    const levels: PcbLevel[] = dir ? [{ label: "Director", z0: sD, board: { x0: -dr * L / 2, y0: -dr * W / 2, x1: dr * L / 2, y1: dr * W / 2 }, rects: [pr("top", -dr * L / 2, -dr * W / 2, dr * L / 2, dr * W / 2, "Director")] }] : [];
    const sdia = Math.min(3.2e-3, Math.max(1e-3, 0.4 * h)); // standoff screw hole / post diameter
    const pcb: Pcb = {
      board, h, er: 1, tanD: 0, t, rects, levels: levels.length ? levels : undefined,
      port: { start: [xp, 0, 0], stop: [xp, 0, h], dir: "z", R: Z0 },
      drills: [{ x: xp, y: 0, d: Math.max(1.3e-3, 2 * a) }, { x: xs, y: ys, d: sdia }, { x: xs, y: -ys, d: sdia }],
    };
    const wires: Wire[] = [
      { a: v(xp, 0, -t), b: v(xp, 0, h), r: a, group: "feed", tag: "P", drawOnly: true },
      { a: v(xs, ys, 0), b: v(xs, ys, h), r: sdia / 2, group: "line", tag: "S", drawOnly: true },
      { a: v(xs, -ys, 0), b: v(xs, -ys, h), r: sdia / 2, group: "line", tag: "S", drawOnly: true },
    ];
    const m = q.model, swrBw = airScan(m).swrBw, bwPct = (100 * swrBw) / f, gain = airDirectivity(q, f);
    const dims: Design["dims"] = [
      { label: "Free-space wavelength λ", value: lam },
      { key: "L", label: "Patch length L (resonant, along x)", value: L, at: span(-L / 2, W / 2, L / 2, W / 2, h) },
      { key: "W", label: "Patch width W", value: W, at: span(L / 2, -W / 2, L / 2, W / 2, h) },
      { key: "h", label: "Height of the patch above the ground", value: h, at: [[-L / 2, -W / 2, 0], [-L / 2, -W / 2, h]] },
      { label: "Fringing extension ΔL (each edge)", value: q.dL },
      { key: "y0", label: "Probe distance from the radiating edge", value: y0, at: y0 > 0 ? span(-L / 2, 0, xp, 0, h) : undefined },
      { label: "Probe radius", value: a },
      { key: "G", label: "Ground plate side", value: G, at: span(-G / 2, -G / 2, G / 2, -G / 2, 0) },
      { label: "Standoff distance from the centre (on the zero-field line)", value: ys, at: span(0, 0, 0, ys, h) },
      ...(dir ? [
        { key: "D", label: "Director plate length", value: dr * L, at: span(-dr * L / 2, dr * W / 2, dr * L / 2, dr * W / 2, h + sD) },
        { label: "Director spacing above the patch", value: sD },
      ] : []),
    ];
    const high = q.XL > 0.45 * q.Redge;
    return {
      wires, plates: pcbPlates(pcb).filter((x) => x.material === "metal"), pcb, dims, tables: [],
      perf: [
        { label: "Effective permittivity εeff", value: "1 (air)" },
        { label: "Edge resistance Rin (G1 + G12)", value: `${fmt(q.Redge, 0)} Ω` },
        { label: "Resistance at the probe R0", value: `${fmt(q.R0, 0)} Ω` },
        { label: "Probe inductance X_L", value: `${fmt(q.XL, 0)} Ω (${fmt((100 * q.XL) / q.Redge, 0)} % of Rin)` },
        { label: "Patch resonance fr (cut long to cancel X_L)", value: `${fmt(q.fr / 1e6, 0)} MHz` },
        { label: "Radiation Q (Jackson–Alexopoulos)", value: fmt(q.Qrad, 1) },
        { label: "Bandwidth (VSWR < 2, model)", value: swrBw > 0 ? `≈ ${fmt(bwPct, 1)} % (${fmt(swrBw / 1e6, 0)} MHz)` : "not matched" },
        { label: "Gain (model, upper hemisphere)", value: `${fmt(gain, 1)} dBi` },
        { label: "Polarisation", value: "Linear, along L" },
      ],
      notes: [
        "Cavity model for an air substrate (εeff = 1, Hammerstad extension, Jackson–Alexopoulos Q) plus the probe inductance: expect the resonance within 2–4 %. Simulate with the FDTD and use Tune to band, then trim the plate.",
        "Build: patch and ground cut from copper, brass or aluminium sheet (or single-sided PCB laminate, copper facing out) on two nylon standoffs on the line x = 0 where the patch field is zero, plus the SMA panel jack soldered to the patch.",
        ...(dir ? ["Director (experimental): the numbers above are those of the plain patch. The in-browser FDTD of plates 0.7–1.4 × the patch at 0.1–0.25 λ showed no gain over it (about 9.4 dBi) and a worse match at this probe position: run the FDTD, use Tune to band and expect to move the probe."] : []),
        ...(high ? ["Warning: the probe inductance is large at this height (over 45 % of the edge resistance), so the match is narrow and depends on the probe: use a thinner air gap, a thicker probe or a capacitive disc / L-probe feed."] : []),
        ...(!q.matched ? ["Warning: the edge resistance is too low to cancel the probe inductance, so the probe is at the edge and the match is poor. Lower the height."] : []),
        ...((f2 - f1) / f > bwPct / 100 ? ["Warning: the band is wider than the model's VSWR < 2 bandwidth. Raise the height or add the director."] : []),
        ...(G < 0.8 * lam ? ["The ground plate is under 0.8 λ: expect a larger back lobe and pattern ripple."] : []),
      ],
      necSupported: false,
      feedZ0: Z0,
      f, sweeps,
    };
  },
};
