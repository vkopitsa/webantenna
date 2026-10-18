import type { AntennaDef, Design, Params } from "../types";
import { num } from "../types";
import { C0, fmt, wavelength } from "../rf";
import { PCB_PARAMS, PRINTED_TRIM, pcbPlates, r, type PcbRect } from "../pcb";
import { band, BANDS } from "./common";
import { printedEeff } from "./pcbmonopole";
import { gapPort, groundedBoard, span } from "./pcbcommon";

/**
 * Printed collinear (Franklin type): N half-wave strip radiators in a line, joined by meandered λg/2 phasing lines (the line inverts the
 * voltage, so the standing-wave currents of all radiators have the same sign). The first radiator sits above a small ground pour at
 * the board edge (the pour and the cable shield act as its image/lower half); the top end is open. The copper is on one layer; the 50 Ω gap port is
 * the one of the PCB monopole. Radiator length: K_R λ0 / (2 √εeff), εeff of the printed-trace fit (pcbmonopole.ts); meander path: K_H λ0 / 2 (the folded line has hardly any field in the substrate: εeff ≈ 1 in the FDTD fit).
 *
 * Tried first and dropped: the transposed-microstrip "COCO" (narrow strip over a wide strip, layers swapped every λg/2). openEMS-style FDTD of
 * that board (FR-4 1.6 mm, 5.8 GHz, 4 sections, CPU engine) gave a broadside maximum of 1.2 dBi at 51 % radiation efficiency and 7 Ω at the
 * series resonance: the two layers carry opposite currents, so nothing radiates in the collinear mode (docs/ANTENNAS.md).
 */
export const PCO_KR = 0.855;
export const PCO_KH = 0.92;
/**
 * Phase step between radiators (units of π) as fitted to the FDTD beam directions of a 4-radiator board (FR-4 1.6 mm, w = 1 mm, f0 = 5.8 GHz,
 * pattern at 5.3 / 5.8 / 6.3 GHz, meander K_H 0.92 and 0.95): D0S (K_H,eff − 0.894) + DISP (f/f0 − 1). The ideal chain has 0 + 1: the radiators'
 * own current phase is dispersive too, so the beam tilts about 3 times faster with frequency than the meander delay alone gives.
 */
export const PCO_DISP = 3.1, PCO_D0S = 1.95, PCO_KH0 = 0.894;
/** First radiator (above the feed gap) as a fraction of L_R, from the FDTD match: a λ/4 strip (0.5) left the resonance 15 % high, 0.95 puts it on the design frequency. */
export const PCO_K0 = 0.95;
/** Copper conductivity (S/m) and µ0, for the strip loss. */
const SIGMA = 5.8e7, MU0 = 4e-7 * Math.PI;
const DEG = Math.PI / 180;

export interface PcoSetup {
  n: number; er: number; h: number; tanD: number; w: number; s: number; ee: number; lam: number; f0: number;
  /** Radiator length, meander path (centre line), meander half-width and height, pitch of the radiators. */
  Lr: number; path: number; d: number; mh: number; pitch: number; g: number; tooShort: boolean;
}

export function pcoSetup(p: Params, f0: number): PcoSetup {
  const er = num(p, "er", 4.4), h = num(p, "h", 1.6e-3), tanD = num(p, "tanD", 0.02), w = num(p, "w", 1e-3), s = Math.max(num(p, "s", 2e-3), 0.2e-3);
  const n = Math.max(2, Math.min(16, Math.round(num(p, "n", 5)))), ee = printedEeff(er, h, w), lam = wavelength(f0), k = 1 + num(p, "trim", 0) / 100;
  const g = Math.max(0.5e-3, w), u = w + s;
  const Lr = Math.max((PCO_KR * lam * k) / (2 * Math.sqrt(ee)), 2 * w + g), path = (PCO_KH * lam * k) / 2;
  const dRaw = (path - 2 * u - w) / 4, d = Math.max(dRaw, w);
  const mh = 2 * u + w; // from the radiator end to the start of the next one
  return { n, er, h, tanD, w, s, ee, lam, f0, Lr, path, d, mh, pitch: Lr + mh, g, tooShort: dRaw < w };
}

/**
 * Loss of the chain as a power factor in dB: the radiator's dielectric loss (Q ≈ 10 times the loss tangent weighted by the field share in the
 * substrate) and the conductor loss of the strips against the 73 Ω radiation resistance.
 */
export function pcoLoss(S: PcoSetup, f: number): number {
  const tdEff = S.er > 1 ? (S.tanD * S.er * (S.ee - 1)) / (S.ee * (S.er - 1)) : 0; // loss tangent weighted by the field share in the substrate
  const rs = Math.sqrt((Math.PI * f * MU0) / SIGMA), rl = (rs / S.w) * (S.Lr + S.path) / 2;
  return 10 * Math.log10(1 + 10 * tdEff) + 10 * Math.log10(1 + rl / 73);
}

/**
 * Pattern of the chain about its axis (ψ from the axis, y on the board). Each radiator carries a half-sine current of length L_R,
 * radiator j is centred at j · pitch (the ground pour is not modelled). The phase step between radiators is
 * −δ (PCO_D0S, PCO_DISP): the meander delay βℓ plus the inversion π, relative to in phase, fitted to the FDTD. Returns the power pattern vs cos ψ.
 */
export function pcoRaw(S: PcoSetup, f: number): (c: number) => number {
  const k = (2 * Math.PI * f) / C0, delta = Math.PI * (PCO_D0S * (S.path / (S.lam / 2) - PCO_KH0) + PCO_DISP * (f / S.f0 - 1));
  return (c) => {
    const x = k * S.Lr * c, u = 1 - (x / Math.PI) ** 2, fe = Math.abs(u) < 1e-6 ? Math.PI / 4 : Math.cos(x / 2) / u;
    let re = 0, im = 0;
    for (let i = 0; i < S.n; i++) { const ph = i * (k * S.pitch * c - delta); re += Math.cos(ph); im += Math.sin(ph); }
    return (1 - c * c) * fe * fe * (re * re + im * im);
  };
}

export interface PcoMetrics {
  /** Directivity (dBi) over the full sphere, the loss and the gain (dBi). */
  d0: number; loss: number; gain: number;
  /** Direction of the maximum above the broadside plane (deg, + toward the open end of the board). */
  tilt: number;
  /** Directivity (dBi) at (θ, φ) in the model frame (axis y). */
  dir: (th: number, ph: number) => number;
  /** Half-power beamwidth in the plane through the axis (deg). */
  hpbw: number;
}

export function pcoMetrics(S: PcoSetup, f: number): PcoMetrics {
  const raw = pcoRaw(S, f);
  let P = 0;
  const st = 0.25;
  for (let a = st / 2; a < 180; a += st) P += raw(Math.cos(a * DEG)) * Math.sin(a * DEG) * st * DEG;
  const dd = (c: number) => (2 * raw(c)) / P;
  let best = 0, tilt = 0;
  for (let a = 60; a <= 120; a += 0.05) { const v = raw(Math.cos(a * DEG)); if (v > best) { best = v; tilt = 90 - a; } }
  const d0 = 10 * Math.log10(Math.max(dd(Math.cos((90 - tilt) * DEG)), 1e-6));
  let lo = 0, hi = 0;
  for (let a = 0; a <= 90; a += 0.05) if (dd(Math.cos((90 - tilt + a) * DEG)) < 10 ** ((d0 - 3) / 10)) { hi = a; break; }
  for (let a = 0; a <= 90; a += 0.05) if (dd(Math.cos((90 - tilt - a) * DEG)) < 10 ** ((d0 - 3) / 10)) { lo = a; break; }
  const loss = pcoLoss(S, f);
  const dir = (th: number, ph: number) => 10 * Math.log10(Math.max(dd(Math.sin(th) * Math.sin(ph)), 1e-6));
  return { d0, loss, gain: d0 - loss, tilt, dir, hpbw: hi + lo };
}

export const pcbcollinear: AntennaDef = {
  id: "pcbcollinear",
  name: "Printed collinear (Franklin)",
  category: "Printed",
  traits: { pol: "vertical", pattern: "omni" },
  summary: "Series-fed printed collinear: half-wave strip radiators in a line, joined by meandered λg/2 phasing lines, over a small ground pour with a 50 Ω edge feed. Omni, vertical along the board, about 6 to 10 dBi for 4 to 12 radiators.",
  params: [
    BANDS, PCB_PARAMS.er, PCB_PARAMS.h, PCB_PARAMS.tanD, PCB_PARAMS.w,
    { key: "n", label: "Number of half-wave radiators", kind: "int", min: 2, max: 16, step: 1, hint: "Including the first one, at the ground pour; gain grows about 3 dB per doubling" },
    { key: "s", label: "Meander spacing", kind: "length", min: 0.3e-3, max: 10e-3, hint: "Gap between the runs of the phasing meander: 2 mm at 5.8 GHz" },
    PCB_PARAMS.gl, PCB_PARAMS.bw, PRINTED_TRIM,
  ],
  defaults: { bands: "5.725e9-5.875e9", er: 4.4, h: 1.6e-3, tanD: 0.02, w: 1e-3, n: 5, s: 2e-3, gl: 20e-3, bw: 20e-3, trim: 0 },
  build(p): Design {
    const { f, sweeps, bands } = band(p);
    const S = pcoSetup(p, f), { n, h, w, s, Lr, d, mh, pitch, g, ee, lam } = S;
    const u = w + s, rects: PcbRect[] = [];
    let y = g;
    const L0 = Math.max(PCO_K0 * Lr - g / 2, w);
    rects.push(r("top", -w / 2, y, w / 2, y + L0, "Feed radiator"));
    y += L0;
    for (let i = 1; i < n; i++) {
      // phasing meander: right d, up, left 2d, up, right d (back to the axis): path 4d + 2u + w along the centre line
      const y1 = y + w / 2, y2 = y1 + u, y3 = y2 + u;
      rects.push(
        r("top", -w / 2, y, d + w / 2, y + w, "Phasing line"), r("top", d - w / 2, y + w, d + w / 2, y2 - w / 2, "Phasing line"),
        r("top", -d - w / 2, y2 - w / 2, d + w / 2, y2 + w / 2, "Phasing line"), r("top", -d - w / 2, y2 + w / 2, -d + w / 2, y3 - w / 2, "Phasing line"),
        r("top", -d - w / 2, y3 - w / 2, w / 2, y3 + w / 2, "Phasing line"),
      );
      y = y3 + w / 2;
      rects.push(r("top", -w / 2, y, w / 2, y + Lr, "Radiator"));
      y += Lr;
    }
    const top = y, m = 2e-3;
    const pcb = groundedBoard({ ...p, bw: Math.max(num(p, "bw", 0.02), 2 * d + w + 2 * m) }, top + m, rects, gapPort(0, w, g, h));
    const mt = pcoMetrics(S, f);
    const edges = [...new Set(bands[0])];
    const tilts = edges.map((fe) => pcoMetrics(S, fe).tilt);
    const drops = edges.map((fe) => { const q = pcoMetrics(S, fe); return q.d0 - q.dir(Math.PI / 2, 0); }); // dB down at the horizon
    const y1r = rects.find((q) => q.label === "Radiator")!;
    const ph1 = rects.find((q) => q.label === "Phasing line")!;
    return {
      wires: [], plates: pcbPlates(pcb), pcb, feedZ0: 50,
      dims: [
        { label: "Free-space wavelength λ", value: lam },
        { key: "L", label: "Radiator length (λg/2)", value: Lr, at: span(0, y1r.y0, 0, y1r.y1, h) },
        { label: "First radiator above the feed gap", value: L0, at: span(0, g, 0, g + L0, h) },
        { key: "mh", label: "Phasing meander height", value: mh, at: span(w / 2 + 1e-3, ph1.y0, w / 2 + 1e-3, ph1.y0 + mh, h) },
        { label: "Phasing meander half-width", value: d, at: span(0, ph1.y0 + w / 2, d, ph1.y0 + w / 2, h) },
        { label: "Phasing line path (λg/2)", value: S.path },
        { label: "Radiator pitch", value: pitch },
        { label: "Trace width", value: w, at: span(-w / 2, y1r.y0 + Lr / 2, w / 2, y1r.y0 + Lr / 2, h) },
        { label: "Feed gap to the ground pour", value: g, at: span(0, 0, 0, g, h) },
        { label: "Board length", value: pcb.board.y1 - pcb.board.y0, at: span(pcb.board.x0, pcb.board.y0, pcb.board.x0, pcb.board.y1, h) },
        { label: "Board width", value: pcb.board.x1 - pcb.board.x0, at: span(pcb.board.x0, pcb.board.y1, pcb.board.x1, pcb.board.y1, h) },
      ],
      tables: [],
      perf: [
        { label: "Effective permittivity εeff", value: fmt(ee, 2) },
        { label: "Ideal gain 2.15 dBi + 10 log N", value: `${fmt(2.15 + 10 * Math.log10(n), 1)} dBi` },
        { label: "Directivity (model, full sphere)", value: `${fmt(mt.d0, 1)} dBi` },
        { label: "Dielectric and conductor loss", value: `${fmt(mt.loss, 1)} dB` },
        { label: "Gain estimate (model)", value: `${fmt(mt.gain, 1)} dBi` },
        { label: "Expected gain range", value: `${fmt(mt.gain - 2.5, 1)} to ${fmt(mt.gain, 1)} dBi` },
        { label: "Half-power beamwidth (elevation)", value: `${fmt(mt.hpbw, 0)}°` },
        { label: "Beam tilt at the band edges", value: edges.map((_, i) => `${tilts[i] > 0 ? "+" : ""}${fmt(tilts[i], 1)}°`).join(" / ") },
        { label: "Feed impedance", value: "Not modelled: about 50 to 100 Ω at resonance in the FDTD" },
        { label: "Polarisation", value: "Vertical, with the board's long side upright" },
      ],
      notes: [
        "Every radiator is a half-wave strip; between two of them a meandered line of electrical length λg/2 inverts the voltage, so the standing-wave currents of all radiators have the same sign and add in phase at the design frequency. The meander folds the line so that its fields cancel.",
        "The first radiator stands on a small ground pour like the PCB monopole, fed across a gap at the edge of the pour. Keep the cable straight away from the board and add a ferrite bead or a λ/4 choke, since the pour and the cable shield take part in the radiation.",
        "Model: half-sine currents on every radiator, in phase at the design frequency (the meander delay drifts off it linearly with frequency), times the dipole-like element pattern, normalised over the whole sphere, minus the estimated losses. The phase drift is fitted to the FDTD of one FR-4 board, so other laminates and trace widths may tilt differently. No impedance model: run the FDTD or the openEMS export for the match.",
        "A thin plastic tube (PVC or polycarbonate) works as a radome but lowers the resonance by 1–3 %.",
        ...(S.tooShort ? ["Warning: the phasing meander does not fit at this frequency; it was kept at its smallest size. Use a narrower trace or a smaller spacing."] : []),
        ...(Math.max(...drops) > 1.5 ? ["Warning: at a band edge the beam tilts so far off the horizon that the gain there falls by more than 1.5 dB: the radiators drift out of phase with frequency. Use fewer radiators or a narrower band."] : []),
        ...(top > 3 * lam ? ["The board is longer than three wavelengths: the in-browser FDTD takes very long; use the analytic model above or the openEMS export."] : []),
        ...(w < 0.15e-3 ? ["Warning: the trace is thinner than 0.15 mm, which most PCB fabs cannot etch."] : []),
        ...(S.tanD > 0.01 && f > 3e9 ? ["Warning: FR-4 loses a lot above 3 GHz; a low-loss laminate (RO4003C, tan δ 0.0027) gains a dB or two on a long string."] : []),
        "Dimensions come from an FDTD-calibrated εeff; run the in-browser FDTD or the exported openEMS script for your exact board.",
      ],
      necSupported: false,
      f, sweeps,
    };
  },
};
