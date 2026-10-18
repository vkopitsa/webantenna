import type { AntennaDef, Design } from "../types";
import { num, str } from "../types";
import { cpwGap, cpwZ0, fmt, microstripEeff, microstripWidth, wavelength } from "../rf";
import { pcbPlates, PRINTED_TRIM, r, type Pcb, type PcbBox, type PcbPoly, type PcbRect } from "../pcb";
import { band, BANDS } from "./common";
import { span } from "./pcbcommon";

/**
 * Lower band edge of a planar monopole from its equivalent cylindrical monopole (Agrawal, Lo, Lee, Zhang, "Wide-band
 * planar monopole antennas", IEEE TAP 46(2), 1998; Liang, Chiau, Chen, Parini, "Study of a printed circular disc monopole
 * antenna for UWB systems", IEEE TAP 53(11), 2005): fL = 7.2 / ((l + r + p)·k) GHz with l, r, p in cm. l = height of the
 * monopole (2b), r = radius of the cylinder of equal area (2π r l = π a b → r = a/4), p = gap to the ground, k = substrate factor.
 */
export const UWB_C = 7.2;
/** k of Liang et al. 2005 for FR-4 (εr 4.4, 1.6 mm). */
export const UWB_K_FR4 = 1.15;
/**
 * k for other laminates (UNCALIBRATED, anchored on 1.15 for FR-4 1.6 mm): k = √(1 + q (εr − 1)) with the share q of the
 * field in the substrate scaled by √h (a thin film leaves the field in air; q = 0.0949 gives 1.15 for FR-4 1.6 mm).
 */
export const uwbK = (er: number, h: number) => Math.sqrt(1 + 0.0949 * Math.sqrt(h / 1.6e-3) * (er - 1));

export const lowEdge = (a: number, ar: number, p: number, k: number) => (UWB_C * 1e9) / (((a * (2 * ar + 0.25) + p) * 100) * k);
/** Disc half-width a (m) for the lower edge fL: the inverse of lowEdge. */
export const discHalfWidth = (fL: number, ar: number, p: number, k: number) => ((UWB_C * 1e9) / (fL * k) / 100 - p) / (2 * ar + 0.25);

/** Substrates: [εr, h, tan δ]. */
export const UWB_SUBSTRATES: Record<string, [number, number, number]> = { fr4: [4.4, 1.6e-3, 0.02], flex: [3.5, 0.1e-3, 0.008] };
/** Widest ratio fHigh/fLow the model honestly covers: printed discs with a plain truncated ground give ≈ 3.7–5:1 (docs/ANTENNAS.md). */
export const UWB_MAX_RATIO = 4.5;

const NV = 96;
const ellipse = (a: number, b: number, cy: number): [number, number][] => Array.from({ length: NV }, (_, i) => [a * Math.cos((2 * Math.PI * i) / NV), cy + b * Math.sin((2 * Math.PI * i) / NV)]);

export const uwbdisc: AntennaDef = {
  id: "uwbdisc",
  name: "UWB disc monopole",
  category: "Printed",
  traits: { pol: "linear", pattern: "omni" },
  summary: "Planar circular or elliptical disc over a truncated ground, fed by a microstrip or a coplanar line. About 4:1 bandwidth, e.g. 3–11 GHz, on FR-4 or flexible film.",
  multiband: "broadband",
  maxRatio: UWB_MAX_RATIO,
  params: [
    { ...BANDS, label: "Frequency bands (the lowest edge sets the disc size)" },
    { key: "shape", label: "Disc shape", kind: "select", options: [["circle", "Circle"], ["ellipse", "Ellipse"]] },
    { key: "ar", label: "Ellipse height / width", kind: "number", min: 0.5, max: 2.5, step: 0.05, hint: "Used for the ellipse only; > 1 is taller than wide" },
    { key: "feed", label: "Feed line", kind: "select", options: [["microstrip", "Microstrip (ground on the back)"], ["cpw", "Coplanar waveguide (no back copper)"]] },
    { key: "g", label: "Gap between disc and ground", kind: "length", min: 0.1e-3, max: 10e-3, hint: "Key to the matching; 0.3 mm in Liang et al. 2005" },
    { key: "gl", label: "Ground length", kind: "length", min: 5e-3, max: 0.5, hint: "Truncated ground under (or beside) the feed line" },
    { key: "sub", label: "Substrate", kind: "select", options: [["fr4", "FR-4 1.6 mm (εr 4.4)"], ["flex", "Flexible polyimide 0.1 mm (εr 3.5)"], ["custom", "Custom (εr, thickness, tan δ below)"]] },
    { key: "er", label: "Custom substrate εr", kind: "number", min: 1, max: 15, step: 0.05, hint: "Used when the substrate is Custom" },
    { key: "h", label: "Custom substrate thickness", kind: "length", min: 0.05e-3, max: 5e-3 },
    { key: "tanD", label: "Custom loss tangent tan δ", kind: "number", min: 0, max: 0.1, step: 0.001 },
    { ...PRINTED_TRIM, label: "Disc size trim (%)", hint: "Scales the disc; set by FDTD tuning (lower edge)" },
  ],
  defaults: { bands: "3.1e9-10.6e9", shape: "circle", ar: 1.2, feed: "microstrip", g: 0.3e-3, gl: 25e-3, sub: "fr4", er: 4.4, h: 1.6e-3, tanD: 0.02, trim: 0 },
  build(p): Design {
    const { bands } = band(p);
    const fLow = Math.min(...bands.map((b) => b[0])), fHigh = Math.max(...bands.map((b) => b[1]));
    const sub = str(p, "sub", "fr4");
    const [er, h, tanD] = sub === "custom" ? [num(p, "er", 4.4), num(p, "h", 1.6e-3), num(p, "tanD", 0.02)] : (UWB_SUBSTRATES[sub] ?? UWB_SUBSTRATES.fr4);
    const ellip = str(p, "shape", "circle") === "ellipse", ar = ellip ? num(p, "ar", 1.2) : 1;
    const cpw = str(p, "feed", "microstrip") === "cpw", g = num(p, "g", 0.3e-3), gl = num(p, "gl", 25e-3);
    const k = uwbK(er, h), trimK = 1 + num(p, "trim", 0) / 100;
    const aRaw = discHalfWidth(fLow, ar, g, k) * trimK, a = Math.max(aRaw, 0.5e-3), b = a * ar;
    const tooBig = aRaw < 0.5e-3;
    const fL = lowEdge(a, ar, g, k);
    const lam = wavelength(fLow);
    // feed line: 50 Ω microstrip, or CPW with centre strip ≈ 1.2 h (0.3–3 mm) and the gap solved for 50 Ω
    const s = cpw ? Math.min(3e-3, Math.max(0.3e-3, 1.2 * h)) : microstripWidth(50, er, h);
    const cg = cpw ? cpwGap(50, s, er, h) : 0;
    const ee = cpw ? cpwZ0(s, cg, er, h).eeff : microstripEeff(er, s / h);
    const m = Math.max(3e-3, 0.1 * a), cy = g + b;
    const bw = Math.max(2 * a + 2 * m, s + 2 * cg + 6e-3), top = g + 2 * b + m;
    const y0 = -gl;
    const lineEnd = g + 0.3 * b;
    const rects: PcbRect[] = [], pec: PcbBox[] = [], drills: NonNullable<Pcb["drills"]> = [];
    const polys: PcbPoly[] = [{ layer: "top", pts: ellipse(a, b, cy), label: "Disc", w: 2 * Math.min(a, b) }];
    let port: Pcb["port"];
    if (!cpw) {
      rects.push(r("bottom", -bw / 2, y0, bw / 2, 0, "Ground"), r("top", -s / 2, y0, s / 2, lineEnd, "Feed line"));
      port = { start: [-s / 2, y0, 0], stop: [s / 2, y0, h], dir: "z", R: 50 };
    } else {
      const xi = s / 2 + cg, vx = (xi + bw / 2) / 2, vd = 0.4e-3, bridge = Math.min(1e-3, gl / 2);
      rects.push(r("top", -s / 2, y0, s / 2, lineEnd, "Feed line"), r("top", -bw / 2, y0, -xi, 0, "Ground"), r("top", xi, y0, bw / 2, 0, "Ground"));
      // the two grounds are tied together on the back by a strip and two vias next to the port, so the lumped port across one gap drives the even mode
      rects.push(r("bottom", -vx - 0.5e-3, y0, vx + 0.5e-3, y0 + bridge + 0.4e-3, "Ground bridge"));
      for (const sx of [-1, 1]) {
        pec.push({ x0: sx * vx - vd / 2, y0: y0 + bridge - vd / 2 + 0.2e-3, z0: 0, x1: sx * vx + vd / 2, y1: y0 + bridge + vd / 2 + 0.2e-3, z1: h, label: "Via" });
        drills.push({ x: sx * vx, y: y0 + bridge + 0.2e-3, d: 0.3e-3 });
      }
      port = { start: [-xi, y0, h], stop: [-s / 2, y0, h], dir: "x", R: 50 };
    }
    const pcb: Pcb = { board: { x0: -bw / 2, y0, x1: bw / 2, y1: top }, h, er, tanD, t: 35e-6, rects, polys, port, ...(cpw ? { pec, drills } : {}) };
    const ratio = fHigh / fLow;
    return {
      wires: [], plates: pcbPlates(pcb), pcb,
      dims: [
        { label: "Free-space wavelength λ at the lowest edge", value: lam },
        { key: "a", label: ellip ? "Disc half-width a" : "Disc radius a", value: a, at: span(0, cy, a, cy, h) },
        ...(ellip ? [{ label: "Disc half-height b", value: b, at: span(0, cy, 0, cy + b, h) }] : []),
        { key: "g", label: "Gap between disc and ground", value: g, at: span(0, 0, 0, g, h) },
        { key: "gl", label: "Ground length", value: gl, at: span(bw / 2, y0, bw / 2, 0, h) },
        { label: cpw ? "Centre strip width" : "Feed line width (50 Ω)", value: s, at: span(-s / 2, y0 / 2, s / 2, y0 / 2, h) },
        ...(cpw ? [{ label: "CPW gap (each side, 50 Ω)", value: cg, at: span(s / 2, y0 / 2, s / 2 + cg, y0 / 2, h) }] : []),
        { label: "Board width", value: bw, at: span(-bw / 2, top, bw / 2, top, h) },
        { label: "Board length", value: top - y0, at: span(-bw / 2, y0, -bw / 2, top, h) },
      ],
      tables: [],
      perf: [
        { label: "Lower band edge, SWR 2 (GHz)", value: fmt(fL / 1e9, 3) },
        { label: "Substrate factor k (uncalibrated off FR-4)", value: fmt(k, 3) },
        { label: "Effective permittivity of the feed line", value: fmt(ee, 2) },
        { label: "Gain", value: "≈ 2–5 dBi, dipole-like omnidirectional pattern, rising with frequency" },
        { label: "Feed impedance", value: "50 Ω line; the match comes from the gap between disc and ground" },
      ],
      notes: [
        ...(tooBig ? ["Warning: the lowest frequency is too high for this gap; the disc was kept at 0.5 mm radius. Reduce the gap."] : []),
        ...(ratio > UWB_MAX_RATIO * 1.001 ? ["Warning: published printed disc monopoles with a plain truncated ground cover about 4:1 (2.7 to over 10 GHz). Wider ranges need a larger ground, a beveled or tapered feed and measurement; here only the lower edge is designed."] : []),
        ...(ellip ? ["Ellipse: taller than wide lowers the lower edge for the same width; the equivalent-cylinder rule is fitted to circles."] : []),
        ...(cpw ? ["CPW: the two coplanar grounds are tied together on the back with a strip and two vias next to the feed. The 50 Ω gap is from a conformal-mapping formula."] : []),
        ...(sub === "flex" ? ["Flexible film: the substrate factor k for thin polyimide is a guess (uncalibrated); the film also bends and detunes. Check with the FDTD or a measurement."] : []),
        "The ground edge and the gap to the disc set the matching: tune the gap in 0.1 mm steps after the first board.",
        "The lower edge comes from the equivalent cylindrical monopole (Liang et al. 2005, k = 1.15 on FR-4); the upper edge is not designed and reaches about 3–4 times the lower one.",
      ],
      necSupported: false,
      f: fLow,
      sweeps: [{ start: fLow * 0.8, stop: Math.max(fHigh * 1.05, fLow * 1.5), steps: 61 }],
    };
  },
};
