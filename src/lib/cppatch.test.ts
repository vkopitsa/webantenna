import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "./antennas";
import { axialRatio, cpDesign, cpResponse, cpSetup } from "./antennas/cppatch";
import { simulate } from "./simulate";
import { toOpenEMS } from "./openems";
import { fabZip } from "./fab";
import { setup } from "./fdtd/setup";
import { inPoly } from "./pcb";

const def = ANTENNA_BY_ID.cppatch;
const FEEDS = ["truncated", "nearsquare", "dual"] as const;
const build = (extra = {}) => def.build({ ...def.defaults, ...extra });
const circ = (p: Record<string, string | number>, f: number) => {
  const { model } = cpSetup({ ...def.defaults, ...p }, 5.8e9);
  const { ax, ay } = cpResponse(model, f);
  const R = Math.hypot(ax[0] - ay[1], ax[1] + ay[0]), L = Math.hypot(ax[0] + ay[1], ax[1] - ay[0]); // |Ax + jAy|, |Ax − jAy|
  return { R, L };
};

describe("circularly polarised patch", () => {
  it("reference: GPS L1 truncated-corner patch on FR-4 (built and measured; Y = L/7.5, L ≈ 45 mm)", () => {
    // de Vos, "Design of a GPS patch antenna" (2022): 1.574 GHz, εr 4.5, h 1.6 mm → 45 mm square, corner cut L/7.5 = 6 mm
    const lo = cpDesign(1.574e9, 4.5, 1.6e-3, 0.02), hi = cpDesign(1.574e9, 4.5, 1.6e-3, 0.025);
    expect(Math.abs(lo.a / 45e-3 - 1)).toBeLessThan(0.02);
    expect(Math.abs(lo.c / 6e-3 - 1)).toBeLessThan(0.15); // tan δ 0.02
    expect(Math.abs(hi.c / 6e-3 - 1)).toBeLessThan(0.05); // tan δ 0.025
    // the cut follows ΔS/S = 1/(2Q): two right isosceles triangles of leg c
    expect((2 * lo.c * lo.c / 2) / (lo.a * lo.a)).toBeCloseTo(1 / (2 * lo.Q), 9);
  });
  it("near-square sides follow W = L (1 + 1/Q0) and keep the area", () => {
    const d = build({ feed: "nearsquare" }), q = cpDesign(d.f, 4.4, 1.6e-3, 0.02);
    const dx = d.dims.find((x) => x.key === "L")!.value, dy = d.dims.find((x) => x.key === "W")!.value;
    expect(dy / dx).toBeCloseTo(1 + 1 / q.Q, 9);
    expect(dx * dy).toBeCloseTo(q.a * q.a, 12);
  });
  it("axial ratio < 1 dB at f0 for every feed and hand; Zin finite and matched", () => {
    for (const feed of FEEDS) for (const hand of ["rhcp", "lhcp"]) {
      const { model } = cpSetup({ ...def.defaults, feed, hand }, 5.8e9);
      const { ax, ay, z } = cpResponse(model, 5.8e9);
      expect(axialRatio(ax, ay), `${feed} ${hand}`).toBeLessThan(1);
      expect(Math.hypot(z[0] - 50, z[1])).toBeLessThan(1);
    }
  });
  it("RHCP design: RHCP >> LHCP on the boresight; the lhcp design the reverse", () => {
    for (const feed of FEEDS) {
      const r = circ({ feed, hand: "rhcp" }, 5.8e9), l = circ({ feed, hand: "lhcp" }, 5.8e9);
      expect(r.R / r.L, feed).toBeGreaterThan(30);
      expect(l.L / l.R, feed).toBeGreaterThan(30);
    }
  });
  it("axial ratio rises above 3 dB at the edges of a deliberately wide band", () => {
    for (const feed of FEEDS) {
      const { model } = cpSetup({ ...def.defaults, feed }, 5.8e9);
      for (const f of [5.8e9 * 0.9, 5.8e9 * 1.1]) { const { ax, ay } = cpResponse(model, f); expect(axialRatio(ax, ay), feed).toBeGreaterThan(3); }
    }
    const d = build({ bands: "5.2e9-6.4e9" });
    expect(d.notes.some((n) => n.startsWith("Warning: the band is wider than the 3 dB axial-ratio"))).toBe(true);
    expect(build().notes.some((n) => n.startsWith("Warning: the band is wider than the 3 dB axial-ratio"))).toBe(false);
  });
  it("simulate: co-polar gain ~ patch directivity, AR series, sense, same pattern for both hands", () => {
    for (const feed of FEEDS) {
      const run = (hand: string) => { const p = { ...def.defaults, feed, hand }; return simulate(def, p, def.build(p)); };
      const r = run("rhcp"), l = run("lhcp");
      expect(r.sense).toBe("rhcp"); expect(l.sense).toBe("lhcp");
      expect(r.ar!.length).toBeGreaterThan(50);
      expect(r.arF0!).toBeLessThan(1);
      expect(r.arBw!).toBeGreaterThan(0);
      expect(r.z.every((p) => Number.isFinite(p.r) && Number.isFinite(p.x))).toBe(true);
      expect(r.pattern!.max.dbi).toBeGreaterThan(5); expect(r.pattern!.max.dbi).toBeLessThan(9);
      expect(r.pattern!.max.theta).toBeLessThan(10);
      expect(l.pattern!.max.dbi).toBeCloseTo(r.pattern!.max.dbi, 6);
    }
  });
  it("lhcp is the mirror image (y → −y) of rhcp", () => {
    for (const feed of FEEDS) {
      const r = build({ feed }).pcb!, l = build({ feed, hand: "lhcp" }).pcb!;
      const key = (pts: number[][], s: number) => pts.map(([x, y]) => `${Math.round(x * 1e9)},${Math.round(s * y * 1e9) + 0}`).sort().join(" ");
      const box = (q: { x0: number; y0: number; x1: number; y1: number }) => [[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]];
      const shapes = (p: typeof r) => [...p.rects.map((q) => box(q)), ...(p.polys ?? []).map((q) => q.pts)];
      const mirrored = new Set(shapes(r).map((s) => key(s, -1)));
      for (const s of shapes(l)) expect(mirrored.has(key(s, 1)), feed).toBe(true);
      expect(l.port.start[1] + l.port.stop[1]).toBeCloseTo(-(r.port.start[1] + r.port.stop[1]), 12);
    }
  });
  it("truncated: cut corners on the x = −y diagonal for RHCP; probe on the axis inside the patch", () => {
    const pcb = build().pcb!, patch = pcb.polys![0];
    expect(patch.pts).toHaveLength(6);
    expect(inPoly(patch.pts, pcb.port.start[0], 0)).toBe(true);
    const a = Math.max(...patch.pts.map((p) => p[0])) * 2;
    expect(inPoly(patch.pts, a / 2 - 1e-4, -a / 2 + 1e-4)).toBe(false); // (+, −) corner is cut
    expect(inPoly(patch.pts, a / 2 - 1e-4, a / 2 - 1e-4)).toBe(true);
  });
  it("dual: T-divider with one port builds in FDTD / openEMS", () => {
    const d = build({ feed: "dual" }), pcb = d.pcb!;
    expect(d.notes.some((n) => n.includes("plain T-divider (not a hybrid)"))).toBe(true);
    expect(toOpenEMS(def, d)).toContain("AddLumpedPort");
    expect(setup(pcb, 5.7e9, 5.9e9).port.edges.length).toBeGreaterThan(0);
  });
  it("fab files and openEMS script for all feeds", () => {
    for (const feed of FEEDS) {
      const d = build({ feed });
      expect(fabZip(def, { ...def.defaults, feed }, d, "cp", "1").length).toBeGreaterThan(500);
      expect(toOpenEMS(def, d)).toContain(feed === "truncated" ? "copper_polys" : "port_start");
    }
  });
  it("trim scales the patch and detunes the model", () => {
    const a0 = build().dims.find((x) => x.key === "L")!.value, a1 = build({ trim: 5 }).dims.find((x) => x.key === "L")!.value;
    expect(a1 / a0).toBeCloseTo(1.05, 9);
  });
});
