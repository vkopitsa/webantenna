import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "./antennas";
import { PCO_KR, PCO_KH, pcoMetrics, pcoSetup } from "./antennas/pcbcollinear";
import { printedEeff } from "./antennas/pcbmonopole";
import { simulate, sweepFreqs } from "./simulate";
import { idealCurrents } from "./idealcurrents";
import { tuning } from "./build";
import { C0 } from "./rf";
import { setup } from "./fdtd/setup";
import { toOpenEMS } from "./openems";
import { synthesize } from "./synth";

const def = ANTENNA_BY_ID.pcbcollinear;
const P = (o = {}) => ({ ...def.defaults, ...o });
const build = (o = {}) => def.build(P(o));
const m = (o = {}, f?: number) => { const d = build(o); return pcoMetrics(pcoSetup(P(o), d.f), f ?? d.f); };

describe("pcbcollinear geometry", () => {
  const touch = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) => a.x0 <= b.x1 + 1e-9 && b.x0 <= a.x1 + 1e-9 && a.y0 <= b.y1 + 1e-9 && b.y0 <= a.y1 + 1e-9;
  it("radiators are K_R λ/(2 √εeff), the meander path K_H λ/2, trim scales both", () => {
    for (const bands of ["2.4e9-2.4835e9", "5.725e9-5.875e9"]) {
      const d = build({ bands }), L = d.dims.find((x) => x.key === "L")!.value, ee = printedEeff(4.4, 1.6e-3, 1e-3), lam = C0 / d.f;
      expect(L).toBeCloseTo((PCO_KR * lam) / (2 * Math.sqrt(ee)), 6);
      expect(d.dims.find((x) => x.label.startsWith("Phasing line path"))!.value).toBeCloseTo((PCO_KH * lam) / 2, 6);
    }
    const a = build().dims.find((x) => x.key === "L")!.value, b = build({ trim: 5 }).dims.find((x) => x.key === "L")!.value;
    expect(b / a).toBeCloseTo(1.05, 6);
  });
  it("the chain is one piece of copper from the feed gap to the open end; the meander path matches the design", () => {
    const d = build({ n: 5 }), rs = d.pcb!.rects.filter((q) => q.label === "Feed radiator" || q.label === "Radiator" || q.label === "Phasing line");
    const seen = new Set([0]), todo = [0];
    while (todo.length) { const i = todo.pop()!; rs.forEach((q, j) => { if (!seen.has(j) && touch(rs[i], q)) { seen.add(j); todo.push(j); } }); }
    expect(seen.size).toBe(rs.length);
    expect(rs.filter((q) => q.label === "Radiator")).toHaveLength(4);
    // centre-line length of one meander: 4d + 2u + w
    const S = pcoSetup(P({ n: 5 }), d.f);
    expect(4 * S.d + 2 * (S.w + S.s) + S.w).toBeCloseTo(S.path, 9);
    const r1 = d.pcb!.rects.filter((q) => q.label === "Radiator");
    expect(r1[1].y0 - r1[0].y0).toBeCloseTo(S.pitch, 9);
  });
  it("copper never overlaps on a layer (shapes only touch at the joints)", () => {
    const rs = build({ n: 9 }).pcb!.rects;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.layer !== b.layer) continue;
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      expect(ox > 1e-9 && oy > 1e-9, `${a.label} ${i} ${b.label} ${j}`).toBe(false);
    }
  });
  it("port: 50 Ω gap between the ground pour edge and the first radiator", () => {
    const d = build(), pt = d.pcb!.port, fr = d.pcb!.rects.find((q) => q.label === "Feed radiator")!;
    expect(pt.dir).toBe("y"); expect(pt.R).toBe(50); expect(pt.start[1]).toBe(0); expect(pt.stop[1]).toBeCloseTo(fr.y0, 12);
  });
  it("has one tuning row (the radiator length)", () => { expect(tuning(def, P()).rows).toHaveLength(1); });
});

describe("pcbcollinear pattern model", () => {
  it("directivity grows about 10 log N (more slowly than the ideal for a dense chain)", () => {
    const d = (n: number) => m({ n }).d0;
    expect(d(4) - d(2)).toBeGreaterThan(2); expect(d(4) - d(2)).toBeLessThan(3.2);
    expect(d(16) - d(4)).toBeGreaterThan(5); expect(d(16) - d(4)).toBeLessThan(6.5);
    expect(m({ n: 16 }).gain).toBeGreaterThan(9); expect(m({ n: 16 }).gain).toBeLessThan(2.15 + 10 * Math.log10(16));
  });
  it("full-sphere normalisation: the integral of the directivity is 4π", () => {
    const g = m({ n: 8 });
    let s = 0;
    for (let t = 0.5; t < 180; t++) for (let p = 0.5; p < 360; p++) s += 10 ** (g.dir((t * Math.PI) / 180, (p * Math.PI) / 180) / 10) * Math.sin((t * Math.PI) / 180) * (Math.PI / 180) ** 2;
    expect(s / (4 * Math.PI)).toBeCloseTo(1, 1);
  });
  it("maximum on the horizon at f0; omni about the board axis", () => {
    const d = build({ n: 8 }), r = simulate(def, P({ n: 8 }), d);
    expect(r.method).toBe("pattern-only"); expect(r.z).toEqual([]);
    const pt = r.pattern!, c = Math.sin((pt.max.theta * Math.PI) / 180) * Math.sin((pt.max.phi * Math.PI) / 180);
    expect(Math.abs(c)).toBeLessThan(0.05);
    // the ring round the axis (ψ = 90°) is the xz plane: θ over 0…360° with φ = 0 / π
    const mm = pcoMetrics(pcoSetup(P({ n: 8 }), d.f), d.f);
    const ring = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => mm.dir(Math.acos(Math.cos((a * Math.PI) / 180)), Math.sin((a * Math.PI) / 180) >= 0 ? 0 : Math.PI));
    expect(Math.max(...ring) - Math.min(...ring)).toBeLessThan(1);
    expect(pt.max.dbi).toBeCloseTo(pcoMetrics(pcoSetup(P({ n: 8 }), d.f), d.f).gain, 0);
  });
  it("beam tilt: toward the open end above f0, toward the feed below, about 3 times the meander-only drift (FDTD fit)", () => {
    const d = build({ n: 4 }), S = pcoSetup(P({ n: 4 }), d.f);
    expect(pcoMetrics(S, d.f).tilt).toBeGreaterThan(1); expect(pcoMetrics(S, d.f).tilt).toBeLessThan(5); // FDTD: +3° at 5.8 GHz
    const t = (e: number) => pcoMetrics(S, d.f * (1 + e)).tilt;
    expect(t(-0.086)).toBeLessThan(-8); expect(t(-0.086)).toBeGreaterThan(-18); // FDTD −13.6° at 5.3 GHz
    expect(t(0.086)).toBeGreaterThan(14); expect(t(0.086)).toBeLessThan(24);    // FDTD +18° at 6.3 GHz
    expect(t(0.012)).toBeGreaterThan(t(-0.012));
  });
  it("trim lengthens the meander and tilts the beam up", () => {
    expect(m({ n: 4, trim: 5 }).tilt).toBeGreaterThan(m({ n: 4 }).tilt);
  });
  it("warns about the tilt only when the gain at the horizon falls by more than 1.5 dB at a band edge", () => {
    const w = (o: object) => build(o).notes.some((n) => n.startsWith("Warning: at a band edge the beam tilts"));
    expect(w({})).toBe(false);
    expect(w({ bands: "5e9-7e9", n: 16 })).toBe(true);
    expect(w({ n: 16 })).toBe(true);
  });
  it("sweeps without an impedance (pattern-only) and the line loss is positive", () => {
    const d = build(); expect(sweepFreqs(d).length).toBeGreaterThan(1);
    expect(m().loss).toBeGreaterThan(0);
    expect(m({ tanD: 0.0027, er: 3.38 }).loss).toBeLessThan(m().loss);
  });
});

describe("pcbcollinear extremes and Radiation view", () => {
  it("builds and simulates at the extremes of the radiators, bands, widths and spacing", () => {
    for (const o of [{ n: 2 }, { n: 16 }, { bands: "100e3-100e3" }, { bands: "100e9-100e9", n: 16 }, { w: 0.1e-3 }, { w: 10e-3 }, { s: 0.3e-3 }, { s: 10e-3 }, { gl: 5e-3, bw: 5e-3 }, { tanD: 0 }, { er: 1 }, { er: 15, h: 0.1e-3 }, { trim: 25 }, { trim: -25 }]) {
      const d = build(o), r = simulate(def, P(o), d);
      expect(d.pcb!.rects.length).toBeGreaterThan(3);
      expect(r.pattern!.max.dbi, JSON.stringify(o)).toSatisfy(Number.isFinite);
      for (const x of d.dims) expect(Number.isFinite(x.value)).toBe(true);
    }
  });
  it("Radiation view: half-sine currents per radiator, not blank", () => {
    const c = idealCurrents("pcbcollinear", build({ n: 5 }))!;
    expect(c.els).toHaveLength(60);
    expect(Math.max(...c.ir)).toBeGreaterThan(0.9);
  });
  it("FDTD mesh of a 16-radiator board at 2.4 GHz stays small (graded), and a grid over the limit would be refused with a message", () => {
    const d = build({ n: 16, bands: "2.4e9-2.4835e9" });
    const t0 = Date.now();
    try { const s = setup(d.pcb!, 0.7 * d.f, 1.3 * d.f); expect(s.nx * s.ny * s.nz).toBeLessThan(30e6); } catch (e) { expect(String(e)).toContain("too large"); }
    expect(Date.now() - t0).toBeLessThan(20000);
  });
  it("exports to openEMS through the Pcb pipeline", () => {
    const x = toOpenEMS(def, build({ n: 4 }));
    expect(x).toContain("AddLumpedPort"); expect(x).toContain("Feed radiator");
  });
  it("synthesis lists it for an omni vertical printed design, unscored", () => {
    const r = synthesize({ bands: [[5.725e9, 5.875e9]], goal: "gain", pol: "vertical", pattern: "omni", family: "printed", er: 4.4, h: 1.6e-3, d: 1e-3 });
    const c = r.filter((x) => x.id === "pcbcollinear");
    expect(c.length).toBeGreaterThan(0); expect(c.every((x) => Number.isNaN(x.score))).toBe(true);
  });
});
