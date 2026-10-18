import type { AntennaDef, Design, Params } from "../types";
import { num } from "../types";
import { fmt } from "../rf";
import { pcbPlates, PCB_PARAMS, PRINTED_TRIM, r as pr, type Pcb } from "../pcb";
import { band, BANDS } from "./common";
import { span } from "./pcbcommon";
import { arrayLayout } from "./arraylayout";
import { arBoresight, arrayMetrics, arrayScan } from "./arraymodel";

/**
 * Microstrip patch array 2 × 2 … 8 × 8 with a corporate (parallel) feed to one 50 Ω edge port. Geometry and the feed tree:
 * arraylayout.ts; circuit, pattern and loss model: arraymodel.ts. Linear (all elements in phase) or circularly polarised (truncated-corner
 * elements, sequential rotation 0/90/180/270° with the same feed phases in every 2 × 2 cell).
 */
export const SIZE_OPTIONS: [string, string][] = [
  ["2x2", "2 × 2 (4 elements)"], ["4x2", "4 × 2 (8 elements)"], ["2x4", "2 × 4 (8 elements)"], ["4x4", "4 × 4 (16 elements)"],
  ["8x4", "8 × 4 (32 elements)"], ["4x8", "4 × 8 (32 elements)"], ["8x8", "8 × 8 (64 elements)"],
];

export const patcharray: AntennaDef = {
  id: "patcharray",
  name: "Microstrip patch array",
  category: "Printed",
  traits: { pol: "linear", pattern: "beam" },
  summary: "2 × 2 to 8 × 8 PCB patch array with a corporate microstrip feed (λ/4 transformers) and one 50 Ω edge port, linear or sequentially rotated circular polarisation: 12 to 25 dBi.",
  params: [
    BANDS, PCB_PARAMS.er, PCB_PARAMS.h,
    { key: "t", label: "Copper thickness", kind: "length", min: 5e-6, max: 0.5e-3 },
    PCB_PARAMS.tanD,
    { key: "size", label: "Array size (columns × rows)", kind: "select", options: SIZE_OPTIONS },
    { key: "dsp", label: "Element spacing (× λ)", kind: "number", min: 0.4, max: 1.3, step: 0.01, hint: "0.7–0.8 λ: more gain per element without a grating lobe; the feed lines need room" },
    { key: "elem", label: "Element", kind: "select", options: [["linear", "Linear patch (inset feed)"], ["cp", "Circular: truncated corners, sequentially rotated"]] },
    { key: "hand", label: "Polarisation", kind: "select", options: [["rhcp", "RHCP (right hand)"], ["lhcp", "LHCP (left hand)"]] },
    PRINTED_TRIM,
  ],
  defaults: { bands: "5.725e9-5.875e9", er: 3.38, h: 1.524e-3, t: 35e-6, tanD: 0.0027, size: "2x2", dsp: 0.75, elem: "linear", hand: "rhcp", trim: 0 },
  build(p: Params): Design {
    const { f, sweeps, f1, f2 } = band(p);
    const t = num(p, "t", 35e-6), L = arrayLayout(p, f), { nx, ny, e, cp, lhcp, lam, h, d } = L;
    const board = L.board, n = nx * ny;
    const pcb: Pcb = {
      board, h, er: L.er, tanD: L.tanD, t,
      rects: [pr("bottom", board.x0, board.y0, board.x1, board.y1, "Ground"), ...L.rects], polys: L.polys.length ? L.polys : undefined,
      port: { start: L.port.start, stop: L.port.stop, dir: "z", R: 50 },
    };
    const m = arrayMetrics(L, f, 2), scan = arrayScan(L);
    const e0 = L.elems[0], e1 = L.elems[1], px = L.port.start[0];
    const ftop = Math.max(...sweeps.map((s) => s.stop)), dTop = (d * ftop) / (lam * f);
    const bwPct = (100 * scan.swrBw) / f, arPct = (100 * scan.arBw) / f;
    const pct = (hz: number, v: number) => (hz > 0 ? `≈ ${fmt(v, 1)} % (${fmt(hz / 1e6, 0)} MHz)` : "not matched");
    const dims: Design["dims"] = [
      { label: "Free-space wavelength λ", value: lam },
      { key: "L", label: cp ? "Patch side (square, resonant)" : "Patch length L (resonant, along y)", value: L.py, at: span(e0.x + L.px / 2, e0.y - L.py / 2, e0.x + L.px / 2, e0.y + L.py / 2, h) },
      ...(cp ? [{ label: "Corner cut (leg of each cut triangle)", value: e.c }] : [{ key: "W", label: "Patch width W", value: L.px, at: span(e0.x - L.px / 2, e0.y + L.py / 2, e0.x + L.px / 2, e0.y + L.py / 2, h) }]),
      { label: "Inset depth y0 (100 Ω input)", value: L.y0 },
      { key: "d", label: "Element spacing (centre to centre)", value: d, at: span(e0.x, e0.y, e1.x, e1.y, h) },
      { key: "wf", label: "Trunk line width (50 Ω)", value: L.lineW.w50, at: span(px, L.portY - L.lineW.w50 / 2, px, L.portY + L.lineW.w50 / 2, h) },
      { label: "Branch line width (100 Ω)", value: L.lineW.w100 },
      { label: "Transformer line width (70.7 Ω)", value: L.lineW.w70 },
      { label: "Transformer length (λg/4)", value: L.q },
      { label: "Guided wavelength on the 100 Ω lines λg", value: L.lg100 },
      { label: "Ground / substrate length", value: board.x1 - board.x0, at: span(board.x0, board.y0, board.x1, board.y0, h) },
      { label: "Ground / substrate width", value: board.y1 - board.y0, at: span(board.x0, board.y0, board.x0, board.y1, h) },
    ];
    return {
      wires: [], plates: pcbPlates(pcb), pcb, dims, tables: [], sense: cp ? (lhcp ? "lhcp" : "rhcp") : undefined,
      elements: L.elems.map((q) => ({ x: q.x, y: q.y, psi: q.psi, lag: q.lag, hx: q.hx, hy: q.hy })),
      perf: [
        { label: "Elements (columns × rows)", value: `${nx} × ${ny} = ${n}` },
        { label: "Element spacing", value: `${fmt(d / lam, 2)} λ (${fmt(d * 1e3, 1)} mm)` },
        { label: "Directivity (model, upper hemisphere)", value: `${fmt(m.d0, 1)} dBi` },
        { label: "Feed network loss (conductor + dielectric)", value: `${fmt(m.lossNet, 1)} dB` },
        { label: "Element efficiency (dielectric loss of the patches)", value: `${fmt(m.lossEl, 1)} dB` },
        { label: "Mismatch loss at the design frequency", value: `${fmt(m.lossMis, 2)} dB` },
        { label: "Gain estimate (model)", value: `${fmt(m.gain, 1)} dBi` },
        { label: "Half-power beamwidth E-plane / H-plane", value: `${fmt(m.hpbwE, 1)}° / ${fmt(m.hpbwH, 1)}°` },
        { label: "Bandwidth (VSWR < 2, model)", value: pct(scan.swrBw, bwPct) },
        ...(cp ? [
          { label: "Axial ratio at the design frequency", value: `${fmt(arBoresight(L, f), 2)} dB` },
          { label: "Axial-ratio bandwidth (AR < 3 dB, model)", value: pct(scan.arBw, arPct) },
        ] : []),
        { label: "Polarisation", value: cp ? (lhcp ? "LHCP (left hand)" : "RHCP (right hand)") : "Linear, along the patch length (y)" },
      ],
      notes: [
        "Corporate feed: every patch is fed at the middle of an edge by a 100 Ω line; two 100 Ω lines meet at a T (50 Ω) and a λg/4 70.7 Ω transformer steps it back to 100 Ω for the next level, up to the 50 Ω trunk at the board edge. All elements get the same amplitude and (linear case) the same path length.",
        "Model: lossy-line circuit of the whole network (ideal T-junctions, no mutual coupling or surface waves) times the element and array factor. The gain includes the line, dielectric and mismatch losses; real arrays usually come out 1–2 dB lower. Simulate with the FDTD or openEMS for the final design.",
        ...(cp ? ["Circular polarisation: truncated-corner patches rotated 0/90/180/270° in every 2 × 2 cell, each fed with the matching 0/90/180/270° extra line length (meander bumps), so the elements' axial-ratio errors cancel and the axial-ratio bandwidth is wider than a single patch's."] : []),
        ...(L.raised ? ["Warning: the spacing was raised above the requested value so that the feed lines fit between the patches."] : []),
        ...(dTop >= 1 ? ["Warning: at the top of the band the spacing is a wavelength or more, so a grating lobe enters real space. Lower the element spacing."] : []),
        ...(L.dReq / lam < 0.5 ? ["Warning: spacing below half a wavelength: strong mutual coupling between the patches (not modelled) and the feed lines hardly fit."] : []),
        ...(m.lossNet > 3 ? ["Warning: the feed network loses over 3 dB at this frequency. Use a low-loss laminate (small tan δ), a smaller array or a lower frequency."] : []),
        ...(L.lineW.w100 < 0.15e-3 ? ["Warning: the 100 Ω lines are thinner than 0.15 mm, which most PCB fabs cannot etch. Use a thinner substrate or a lower εr."] : []),
        ...(f2 - f1 > scan.swrBw && scan.swrBw > 0 ? ["Warning: the band is wider than the model's VSWR < 2 bandwidth. Use a thicker or lower-εr substrate."] : []),
        ...(cp && f2 - f1 > scan.arBw ? ["Warning: the band is wider than the 3 dB axial-ratio bandwidth. The polarisation turns elliptical toward the band edges: narrow the band."] : []),
        ...(n > 4 ? ["The in-browser FDTD is impractical for a board this large (it stops with a message above 30 million cells); use the analytic model above or the openEMS export."] : []),
        "FR-4 is lossy above a few GHz: at 5.8 GHz an 8 × 8 corporate feed on FR-4 loses several dB in its lines; use RO4003C or similar for large arrays.",
      ],
      necSupported: false,
      feedZ0: 50,
      f, sweeps,
    };
  },
};
