import type { AntennaDef, Design, Params, Wire } from "../types";
import { num, str } from "../types";
import { fmt, microstripEeff, microstripWidth, wavelength } from "../rf";
import { v } from "../geom";
import { pcbPlates, PCB_PARAMS, PRINTED_TRIM, r as pr, type Pcb, type PcbRect } from "../pcb";
import { band, BANDS } from "./common";
import { span } from "./pcbcommon";
import { patchDesign } from "./patch";

/**
 * Single-feed circularly polarised patch (Balanis 14.6, Garg et al. "Microstrip Antenna Design Handbook" ch. 9, Sharma & Gupta 1983):
 * a square patch is a pair of degenerate modes. A perturbation of area ΔS (two cut corners, ΔS/S = 1/(2Q0)) or unequal sides
 * (L2 = L1 (1 + 1/Q0)) splits them so that at f0 they have equal amplitude and ±45°, i.e. 90° apart. The dual-fed type drives
 * the two modes through a T-divider with a λg/4 delay line instead. IEEE sense, e^{jωt}: RHCP is Ey = −j Ex on the boresight.
 */
export type CpFeed = "truncated" | "nearsquare" | "dual";
const Z0 = 50;

export type C = [number, number];
export const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const div = (a: C, b: C): C => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
export const sc = (a: C, k: number): C => [a[0] * k, a[1] * k];
export const abs = (a: C) => Math.hypot(a[0], a[1]);

/** Square-patch design: side a (the resonant length with W = L), loaded Q (radiation + dielectric loss) and the cut size. */
export function cpDesign(f: number, er: number, h: number, tanD: number, trim = 0) {
  const lam = wavelength(f);
  const floor = 0.1 * lam / Math.sqrt(er);
  const fix = (L: number) => (Number.isFinite(L) ? Math.max(floor, L) : floor);
  let a = fix(patchDesign(f, er, h, Z0).L);
  // L and εeff/ΔL depend on W; for a square patch W = L (a fixed point, 3–4 passes). The floor keeps a 100 GHz / 5 mm board finite.
  for (let i = 0; i < 8; i++) a = fix(patchDesign(f, er, h, Z0, a).L);
  const q = patchDesign(f, er, h, Z0, a);
  const Qr = 1 / (Math.SQRT2 * q.bw), Q = 1 / (1 / Qr + tanD);
  const k = 1 + trim / 100, aT = a * k;
  const Qg = Math.max(Q, 4); // geometry: a very low Q (thick, lossy) would cut away the patch
  return { ...q, a, aT, Qr, Q, fr: f / k, c: aT / Math.sqrt(2 * Qg), ratio: 1 + 1 / Qg };
}

export interface CpModel { feed: CpFeed; lhcp: boolean; f0: number; fr: number; Q: number }

/** Input impedance and the complex amplitudes (Ax, Ay) of the x and y modes' radiation at frequency f. */
export function cpResponse(m: CpModel, f: number): { z: C; ax: C; ay: C } {
  const mode = (fi: number): C => div([1, 0], [1, m.Q * (f / fi - fi / f)]);
  let z: C, ax: C, ay: C;
  if (m.feed === "dual") {
    // T-divider: two 2·Z0 branches from the input; each ends in an inset edge feed showing 2·Z0 at resonance. The y branch is
    // λg/4 longer (90° lag at f0, ∝ f). No isolation: a patch mismatch is seen by the input.
    const Zc = 2 * Z0, u = m.Q * (f / m.fr - m.fr / f), Zp: C = div([Zc, 0], [1, u]);
    const G = div(sub(Zp, [Zc, 0]), add(Zp, [Zc, 0])), k = add([1, 0], G);
    const branch = (th: number) => {
      const e: C = [Math.cos(th), -Math.sin(th)], e2 = mul(e, e); // e^{−jθ}, e^{−2jθ}
      const GT = mul(G, e2); // reflection seen at the T (Zc line)
      return { zb: div(add([1, 0], GT), sub([1, 0], GT)), amp: div(mul(e, k), add([1, 0], GT)) }; // zb in units of Zc
    };
    const bx = branch(0), by = branch((Math.PI / 2) * (f / m.f0));
    const yb = (b: C) => div([1, 0], b); // normalised admittances add
    z = sc(div([1, 0], add(yb(bx.zb), yb(by.zb))), Zc);
    ax = bx.amp; ay = by.amp;
  } else {
    const r = (1 / m.Q + Math.sqrt(1 / (m.Q * m.Q) + 4)) / 2;
    const lo = mode(m.fr / r), hi = mode(m.fr * r); // the two split modes, equal at f0 with ±45°
    z = sc(add(lo, hi), Z0);
    if (m.feed === "truncated") { ax = sc(add(lo, hi), 0.5); ay = sc(sub(lo, hi), 0.5); } // diagonal modes seen from the axis
    else { ax = hi; ay = lo; } // x short (above f0), y long (below)
  }
  return { z, ax, ay: m.lhcp ? sc(ay, -1) : ay };
}

/** Boresight axial ratio (dB) of mode amplitudes (Ax, Ay): circular components |Ax ± jAy|. */
export function axialRatio(ax: C, ay: C): number {
  const R = abs(add(ax, mul([0, 1], ay))), L = abs(sub(ax, mul([0, 1], ay)));
  return 20 * Math.log10(Math.min(1e6, (R + L) / Math.max(Math.abs(R - L), 1e-12)));
}

/** Axial ratio (dB) at f, and the width (Hz) of the contiguous AR < 3 dB and VSWR < 2 ranges nearest f0 (0: none within ±25 %). */
export function cpScan(m: CpModel): { ar: (f: number) => number; arBw: number; swrBw: number } {
  const ar = (f: number) => { const q = cpResponse(m, f); return axialRatio(q.ax, q.ay); };
  const swr = (f: number) => { const z = cpResponse(m, f).z; const g = abs(div(sub(z, [Z0, 0]), add(z, [Z0, 0]))); return g >= 1 ? 99 : (1 + g) / (1 - g); };
  const n = 800, f0 = 0.75 * m.f0, df = (0.5 * m.f0) / n, mid = Math.round((m.f0 - f0) / df);
  const width = (ok: (f: number) => boolean) => {
    const at = (i: number) => i >= 0 && i <= n && ok(f0 + i * df);
    let c = -1;
    for (let k = 0; k <= n && c < 0; k++) c = at(mid + k) ? mid + k : at(mid - k) ? mid - k : -1;
    if (c < 0) return 0;
    let lo = c, hi = c;
    while (at(lo - 1)) lo--;
    while (at(hi + 1)) hi++;
    return (hi - lo + 1) * df;
  };
  return { ar, arBw: width((f) => ar(f) < 3), swrBw: width((f) => swr(f) < 2) };
}

/** The design and the response model for a parameter set (shared by the builder and the simulation). */
export function cpSetup(p: Params, f: number) {
  const er = num(p, "er", 4.4), h = num(p, "h", 1.6e-3), tanD = num(p, "tanD", 0.02);
  const fd = str(p, "feed", "truncated"), feed: CpFeed = fd === "dual" ? "dual" : fd === "nearsquare" ? "nearsquare" : "truncated";
  const lhcp = str(p, "hand", "rhcp") === "lhcp", q = cpDesign(f, er, h, tanD, num(p, "trim", 0));
  return { feed, lhcp, q, model: { feed, lhcp, f0: f, fr: q.fr, Q: q.Q } as CpModel };
}

export const cppatch: AntennaDef = {
  id: "cppatch",
  name: "Circularly polarised patch",
  category: "Printed",
  traits: { pol: "circular", pattern: "beam" },
  summary: "Square PCB patch with a single probe (cut corners or unequal sides) or a T-divider with a λ/4 delay for right- or left-hand circular polarisation.",
  params: [
    BANDS, PCB_PARAMS.er, PCB_PARAMS.h,
    { key: "t", label: "Copper thickness", kind: "length", min: 5e-6, max: 0.5e-3 },
    PCB_PARAMS.tanD,
    { key: "feed", label: "Feed type", kind: "select", options: [["truncated", "Truncated corners, coax probe"], ["nearsquare", "Nearly square, diagonal coax probe"], ["dual", "Dual feed, T-divider with λ/4 delay"]] },
    { key: "hand", label: "Polarisation", kind: "select", options: [["rhcp", "RHCP (right hand)"], ["lhcp", "LHCP (left hand)"]] },
    PRINTED_TRIM,
  ],
  defaults: { bands: "5.76e9-5.84e9", er: 4.4, h: 1.6e-3, t: 35e-6, tanD: 0.02, feed: "truncated", hand: "rhcp", trim: 0 },
  build(p): Design {
    const { f, sweeps, f1, f2 } = band(p);
    const er = num(p, "er", 4.4), h = num(p, "h", 1.6e-3), t = num(p, "t", 35e-6), tanD = num(p, "tanD", 0.02);
    const { feed, lhcp, q, model } = cpSetup(p, f), s = lhcp ? -1 : 1; // the mirror image (y → −y) is the other hand
    const { aT: a, c, Q } = q;
    const lam = q.lam, m = 3 * h;
    const Y = (y: number) => s * y;
    const R = (layer: PcbRect["layer"], x0: number, y0: number, x1: number, y1: number, label: string) => pr(layer, x0, Y(y0), x1, Y(y1), label);
    const dims: Design["dims"] = [{ label: "Free-space wavelength λ", value: lam }];
    const rects: PcbRect[] = [];
    const polys: NonNullable<Pcb["polys"]> = [];
    const wires: Wire[] = [];
    const notes: string[] = [];
    let board: Pcb["board"], port: Pcb["port"];
    // Rin at the edge for the square patch; the probe sits where the mode's resistance is the share each mode must show
    const probeAt = (L: number, target: number) => (q.Rin > target ? (L / Math.PI) * Math.acos(Math.sqrt(target / q.Rin)) : 0);

    if (feed === "truncated") {
      const y0 = probeAt(a, 2 * Z0); // the two split modes are in series: R0/2 each → R0 = 2 Z0 for a Z0 input at f0
      const xp = -a / 2 + y0;
      board = { x0: -a / 2 - m, y0: -a / 2 - m, x1: a / 2 + m, y1: a / 2 + m };
      // RHCP: corners cut on the x = −y diagonal, ((+, −) and (−, +)); LHCP the other pair
      polys.push({ layer: "top", label: "Patch", pts: ([[-a / 2, -a / 2], [a / 2 - c, -a / 2], [a / 2, -a / 2 + c], [a / 2, a / 2], [-a / 2 + c, a / 2], [-a / 2, a / 2 - c]] as [number, number][]).map(([x, y]) => [x, Y(y)]) });
      port = { start: [xp, 0, 0], stop: [xp, 0, h], dir: "z", R: Z0 };
      wires.push({ a: v(xp, 0, -t), b: v(xp, 0, h), r: 0.65e-3, group: "feed", tag: "P", drawOnly: true });
      dims.push(
        { key: "L", label: "Patch side L (square, resonant)", value: a, at: span(-a / 2, Y(a / 2), a / 2, Y(a / 2), h) },
        { key: "c", label: "Corner cut (leg of each cut triangle)", value: c, at: span(a / 2 - c, Y(-a / 2), a / 2, Y(-a / 2), h) },
        { label: "Fringing extension ΔL (each edge)", value: q.dL },
        { key: "y0", label: "Probe distance from the radiating edge", value: y0, at: y0 > 0 ? span(-a / 2, 0, xp, 0, h) : undefined },
      );
      if (q.Rin <= 2 * Z0) notes.push("Edge resistance is below twice the feed impedance: the probe is at the edge and the match will be poor. Use a thinner substrate or a lower εr.");
    } else if (feed === "nearsquare") {
      const Lx = a / Math.sqrt(q.ratio), Ly = Lx * q.ratio; // L·W = a², W = L (1 + 1/Q0): the geometric mean keeps f0 between the two resonances
      const px = probeAt(Lx, Z0), py = probeAt(Ly, Z0); // each mode shows Z0 at f0 (u = ∓1: the two terms sum to R)
      const xp = -Lx / 2 + px, yp = -Ly / 2 + py;
      board = { x0: -Lx / 2 - m, y0: -Ly / 2 - m, x1: Lx / 2 + m, y1: Ly / 2 + m };
      rects.push(R("top", -Lx / 2, -Ly / 2, Lx / 2, Ly / 2, "Patch"));
      port = { start: [xp, Y(yp), 0], stop: [xp, Y(yp), h], dir: "z", R: Z0 };
      wires.push({ a: v(xp, Y(yp), -t), b: v(xp, Y(yp), h), r: 0.65e-3, group: "feed", tag: "P", drawOnly: true });
      dims.push(
        { key: "L", label: "Patch width L along x (short side)", value: Lx, at: span(-Lx / 2, Y(Ly / 2), Lx / 2, Y(Ly / 2), h) },
        { key: "W", label: "Patch length W along y (long side, W = L (1 + 1/Q0))", value: Ly, at: span(Lx / 2, Y(-Ly / 2), Lx / 2, Y(Ly / 2), h) },
        { label: "Fringing extension ΔL (each edge)", value: q.dL },
        { key: "y0", label: "Probe distance from the radiating edge", value: px, at: px > 0 ? span(-Lx / 2, Y(yp), xp, Y(yp), h) : undefined },
      );
      if (q.Rin <= Z0) notes.push("Edge resistance is below the feed impedance: the probe is at the edge and the match will be poor. Use a thinner substrate or a lower εr.");
    } else {
      // dual: inset-fed square patch (a notch at the left edge for the x mode, at the bottom edge for the y mode) behind a T-divider
      const wf = microstripWidth(Z0, er, h), w1 = microstripWidth(2 * Z0, er, h);
      const lg1 = lam / Math.sqrt(microstripEeff(er, w1 / h)); // guided wavelength on the 2·Z0 branches
      const gap = Math.max(w1 / 2, 0.3e-3), gx = w1 / 2 + gap;
      const y0 = Math.max(0, Math.min(probeAt(a, 2 * Z0), a / 2 - 2 * gx)), xi = -a / 2 + y0, yi = xi;
      const pit = 3 * w1, xT = -(a / 2 + 6 * pit), x1 = xT + 2 * pit, x2 = x1 + pit;
      const D = a / 2 + 3 * w1; // the y branch drops D below the input line, runs to x = 0 and climbs to the bottom notch
      const hb = Math.max(0, D - lg1 / 8); // bump height on the x branch: y path − x path = 2D − 2 hb = λg/4
      const xg0 = xT - 4 * wf, y3 = -D, hw = w1 / 2;
      board = { x0: xg0, y0: y3 - hw - m, x1: a / 2 + m, y1: Math.max(a / 2, hb + hw) + m };
      if (y0 > 0) rects.push(
        R("top", xi, -a / 2, -gx, a / 2, "Patch"), R("top", gx, -a / 2, a / 2, a / 2, "Patch"), R("top", -gx, yi, gx, a / 2, "Patch"),
        R("top", -a / 2, gx, xi, a / 2, "Patch"), R("top", -a / 2, -a / 2, xi, -gx, "Patch"),
      );
      else rects.push(R("top", -a / 2, -a / 2, a / 2, a / 2, "Patch"));
      const xEnd = y0 > 0 ? xi : -a / 2, yEnd = y0 > 0 ? yi : -a / 2;
      rects.push(
        R("top", xg0, -wf / 2, xT, wf / 2, "Feed line"), // 50 Ω input
        R("top", xT - hw, -hw, x1 + hw, hw, "Feed line"), R("top", x2 - hw, -hw, xEnd, hw, "Feed line"), // x branch
        ...(hb > 0 ? [R("top", x1 - hw, -hw, x1 + hw, hb + hw, "Feed line"), R("top", x1 - hw, hb - hw, x2 + hw, hb + hw, "Feed line"), R("top", x2 - hw, -hw, x2 + hw, hb + hw, "Feed line")] : [R("top", x1 - hw, -hw, x2 + hw, hw, "Feed line")]),
        R("top", xT - hw, y3 - hw, xT + hw, hw, "Feed line"), R("top", xT - hw, y3 - hw, hw, y3 + hw, "Feed line"), R("top", -hw, y3 - hw, hw, yEnd, "Feed line"), // y branch
      );
      const yp = [Y(-wf / 2), Y(wf / 2)];
      port = { start: [xg0, Math.min(...yp), 0], stop: [xg0, Math.max(...yp), h], dir: "z", R: Z0 };
      dims.push(
        { key: "L", label: "Patch side L (square, resonant)", value: a, at: span(-a / 2, Y(a / 2), a / 2, Y(a / 2), h) },
        { label: "Fringing extension ΔL (each edge)", value: q.dL },
        { key: "y0", label: "Inset depth y0 (both feeds)", value: y0, at: y0 > 0 ? span(-a / 2, Y(gx), xi, Y(gx), h) : undefined },
        { key: "wf", label: "Feed line width", value: wf, at: span(xg0 + wf, Y(-wf / 2), xg0 + wf, Y(wf / 2), h) },
        { label: "Branch line width (2 Z0)", value: w1, at: span(xT + pit, Y(-hw), xT + pit, Y(hw), h) },
        { label: "Delay line extra length (λg/4)", value: lg1 / 4 },
        { label: "Meander height on the x branch", value: hb, at: hb > 0 ? span(x1 + pit / 2, Y(0), x1 + pit / 2, Y(hb), h) : undefined },
      );
      notes.push(
        "Dual feed with a plain T-divider (not a hybrid): the two branches are 100 Ω lines to inset edge feeds, and the left-edge (x) branch is meandered so the bottom-edge (y) branch is exactly λg/4 longer. There is no isolation, so a mismatch of either patch feed shows at the input; the axial ratio is good only where the λg/4 delay is 90°.",
      );
      if (w1 < 0.15e-3) notes.push("Warning: the 100 Ω branch lines are thinner than 0.15 mm, which most PCB fabs cannot etch. Use a thinner substrate.");
      if (a / 2 - 2 * gx < probeAt(a, 2 * Z0)) notes.push("Warning: the inset notches do not fit this patch, so the feeds sit closer to the edge than the matching point. Use a thinner substrate.");
    }

    board = { x0: board.x0, x1: board.x1, y0: Math.min(Y(board.y0), Y(board.y1)), y1: Math.max(Y(board.y0), Y(board.y1)) };
    const Lg = board.x1 - board.x0, Wg = board.y1 - board.y0;
    rects.unshift(pr("bottom", board.x0, board.y0, board.x1, board.y1, "Ground"));
    const pcb: Pcb = { board, h, er, tanD, t, rects, polys: polys.length ? polys : undefined, port };
    dims.push(
      { label: "Ground / substrate length", value: Lg, at: span(board.x0, board.y0, board.x1, board.y0, h) },
      { label: "Ground / substrate width", value: Wg, at: span(board.x0, board.y0, board.x0, board.y1, h) },
    );
    const scan = cpScan(model), ar0 = scan.ar(f);
    const pct = (hz: number) => (hz >= 0.49 * f ? "> 50 %" : `≈ ${fmt((100 * hz) / f, 1)} % (${fmt(hz / 1e6, 0)} MHz)`); // the scan stops at ±25 %
    const wide = f2 - f1 > scan.arBw;
    return {
      wires,
      plates: pcbPlates(pcb),
      pcb,
      sense: lhcp ? "lhcp" : "rhcp",
      dims,
      tables: [],
      perf: [
        { label: "Effective permittivity εeff", value: fmt(q.eeff, 3) },
        { label: "Edge resistance Rin (G1 + G12)", value: `${fmt(q.Rin, 0)} Ω` },
        { label: "Loaded Q (radiation + dielectric loss)", value: fmt(Q, 1) },
        { label: "Radiation efficiency (dielectric loss only)", value: `${fmt((100 * Q) / q.Qr, 0)} %` },
        { label: "Bandwidth (VSWR < 2, model)", value: pct(scan.swrBw) },
        { label: "Axial-ratio bandwidth (AR < 3 dB, model)", value: pct(scan.arBw) },
        { label: "Axial ratio at the design frequency", value: `${fmt(ar0, 2)} dB` },
        { label: "Gain", value: "≈ 5–7 dBic (lower on lossy FR-4)" },
        { label: "Polarisation", value: lhcp ? "LHCP (left hand)" : "RHCP (right hand)" },
      ],
      notes: [
        ...(feed === "dual"
          ? ["Dual feed: the λg/4 delay line sets the 90° phase instead of a perturbation of the patch. The T-divider has no isolation, so a feed mismatch also degrades the axial ratio."]
          : ["Single feed: the axial ratio is below 3 dB over only about a third to a half of the impedance bandwidth, and only on the boresight. For a wider band use the dual-feed type."]),
        "The cut-corner or unequal-side perturbation follows the standard rule ΔS/S = 1/(2Q0) (Q0 from the cavity model, with the dielectric loss); real boards need a check: simulate, then tune with the length trim.",
        "FR-4 εr varies between boards and with frequency; above 3 GHz use a low-loss laminate.",
        ...(wide ? ["Warning: the band is wider than the 3 dB axial-ratio bandwidth. The polarisation turns elliptical toward the band edges: narrow the band, use a thicker or lower-εr substrate, or the dual-feed type."] : []),
        ...notes,
      ],
      necSupported: false,
      feedZ0: Z0,
      f, sweeps,
    };
  },
};
