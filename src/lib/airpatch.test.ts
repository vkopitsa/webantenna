import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "./antennas";
import { airDesign, airHeightShift, airQrad, airScan, airSetup, probeR, probeX } from "./antennas/airpatch";
import { patchDesign } from "./antennas/patch";
import { simulate, s11 } from "./simulate";
import { idealCurrents } from "./idealcurrents";
import { toOpenEMS } from "./openems";
import { fabZip } from "./fab";
import { buildPack, en, tuning } from "./build";
import { setup } from "./fdtd/setup";
import { isProbe } from "./pcb";
import { synthesize } from "./synth";

const def = ANTENNA_BY_ID.airpatch;
const build = (extra = {}) => def.build({ ...def.defaults, ...extra });
const FB = (f: number, extra = {}) => ({ ...def.defaults, bands: `${f * 0.98}-${f * 1.02}`, ...extra });

describe("air patch", () => {
  it("reference: 2.4 GHz air patch, h 6–8 mm: cavity length 50–55 mm (the usual hobby/Balanis figure); probe-fed design a little longer", () => {
    // εeff = 1, Hammerstad ΔL (Balanis ch. 14): the pure cavity resonance; the design is cut longer to cancel the probe inductance
    for (const h of [6e-3, 7e-3, 8e-3]) {
      const q = patchDesign(2.44e9, 1, h, 50);
      expect(q.eeff).toBe(1);
      expect(q.L).toBeGreaterThan(50e-3); expect(q.L).toBeLessThan(55e-3);
      expect(q.W).toBeCloseTo(3e8 / 2 / 2.44e9, 3);
      const a = airDesign(2.44e9, h);
      expect(a.L).toBeGreaterThan(q.L); expect(a.L).toBeLessThan(1.15 * q.L);
      expect(a.Lc).toBeCloseTo(a.L, 12);
    }
  });
  it("Jackson–Alexopoulos Q: c1 = 0.4 for air; Q ≈ 8–12 at h = 0.06 λ, falls as 1/h; bandwidth ≈ 1/(√2 Q) within 15 %", () => {
    const lam = 3e8 / 2.44e9, L = 0.43 * lam, W = 0.5 * lam;
    // hand value: p = 0.739, Q = 3/16 · (1/(0.739·0.4)) · (L/W) · (λ/h)
    const q6 = airQrad(2.44e9, L, W, 0.06 * lam), q3 = airQrad(2.44e9, L, W, 0.03 * lam);
    expect(q6).toBeGreaterThan(8); expect(q6).toBeLessThan(12);
    expect(q3 / q6).toBeCloseTo(2, 6);
    expect(airQrad(2.44e9, L, W, 0.06 * lam, 2) / q6).toBeCloseTo((2 / 0.6) / (1 / 0.4), 9); // εr 2: c1 = 1 − 1/2 + 2/20 = 0.6, εr in the numerator
    const d = airDesign(2.44e9, 0.06 * lam), bw = airScan(d.model).swrBw / 2.44e9;
    expect(bw).toBeGreaterThan(0.05); expect(bw).toBeLessThan(0.12);
    expect(Math.abs(bw / (1 / (Math.SQRT2 * d.Q)) - 1)).toBeLessThan(0.15);
  });
  it("probe inductance: (η0 k h / 2π)(ln(2/ka) − γ), ∝ h; ≈ 80 Ω at h = 7.4 mm, a = 0.65 mm, 2.44 GHz", () => {
    const x = probeX(2.44e9, 7.4e-3, 0.65e-3);
    expect(x).toBeGreaterThan(70); expect(x).toBeLessThan(90);
    expect(probeX(2.44e9, 3.7e-3, 0.65e-3) / x).toBeCloseTo(0.5, 9);
    expect(probeR(0.1, 0.1)).toBeLessThanOrEqual(0.01);
  });
  it("matched at f0 (|S11| < −10 dB) and 5–12 % bandwidth at default h, from 1 to 5.8 GHz (the director is not in the analytic model)", () => {
    for (const f of [1e9, 1.5e9, 2.44e9, 3e9, 5.8e9]) for (const director of ["none", "director"]) {
      const p = FB(f, { director }), d = def.build(p), r = simulate(def, p, d);
      const f0 = d.f, near = r.z.reduce((a, b) => (Math.abs(b.f - f0) < Math.abs(a.f - f0) ? b : a));
      expect(s11(near, 50).db, `${f} ${director}`).toBeLessThan(-10);
      const { q } = airSetup(p, f0), bw = airScan(q.model).swrBw / f0;
      expect(bw, `${f} ${director}`).toBeGreaterThan(0.05); expect(bw).toBeLessThan(0.12);
      expect(r.method).toBe("analytic");
    }
  });
  it("gain 8–10 dBi (in-browser FDTD, 1 λ ground: 9.4 dBi), beam on the boresight; z finite", () => {
    const p = { ...def.defaults }, a = simulate(def, p, def.build(p));
    expect(a.pattern!.max.dbi).toBeGreaterThan(8); expect(a.pattern!.max.dbi).toBeLessThan(10);
    expect(a.pattern!.max.theta).toBeLessThan(5);
    expect(a.pattern!.hpbw).toBeGreaterThan(45); expect(a.pattern!.hpbw).toBeLessThan(70);
    expect(a.z.every((p) => Number.isFinite(p.r) && Number.isFinite(p.x))).toBe(true);
  });
  it("too tall a patch cannot be matched by a plain probe: warned, bandwidth not matched", () => {
    const d = build({ hf: 0.12 }), bw = d.perf.find((x) => x.label.startsWith("Bandwidth"))!.value;
    expect(bw).toBe("not matched");
    expect(d.notes.some((n) => n.startsWith("Warning: the edge resistance is too low"))).toBe(true);
    expect(d.notes.some((n) => n.startsWith("Warning: the probe inductance is large"))).toBe(true);
    expect(build().notes.some((n) => n.startsWith("Warning: the probe inductance"))).toBe(false);
  });
  it("Pcb model: air, probe port, ground + patch, director as a second level; FDTD and openEMS accept it", () => {
    for (const director of ["none", "director"]) {
      const d = build({ director }), pcb = d.pcb!;
      expect(pcb.er).toBe(1); expect(pcb.tanD).toBe(0);
      expect(isProbe(pcb)).toBe(true);
      expect(pcb.rects.map((q) => q.label)).toEqual(["Ground", "Patch"]);
      expect(pcb.levels?.length ?? 0).toBe(director === "director" ? 1 : 0);
      expect(d.plates.every((x) => x.material === "metal")).toBe(true);
      const px = pcb.port.start[0], patch = pcb.rects[1];
      expect(px).toBeGreaterThan(patch.x0); expect(px).toBeLessThan(0);
      expect(toOpenEMS(def, d)).toContain("AddLumpedPort");
      expect(setup(pcb, 2.2e9, 2.7e9).port.edges.length).toBeGreaterThan(0);
    }
    const dd = build({ director: "director" }), L = dd.dims.find((x) => x.key === "L")!.value;
    expect(dd.dims.find((x) => x.key === "D")!.value).toBeCloseTo(0.95 * L, 9);
    expect(dd.pcb!.levels![0].z0).toBeCloseTo(0.1 * dd.dims[0].value, 9);
  });
  it("trim scales the patch and moves the model resonance", () => {
    const a = build(), b = build({ trim: -5 });
    expect(b.dims.find((x) => x.key === "L")!.value / a.dims.find((x) => x.key === "L")!.value).toBeCloseTo(0.95, 6);
    expect(airSetup({ ...def.defaults, trim: -5 }, a.f).q.model.fr / airSetup(def.defaults, a.f).q.model.fr).toBeCloseTo(1 / 0.95, 6);
  });
  it("build pack: one tuning row, plates and standoffs in the BOM, no laminate notes, steps for the air build", () => {
    for (const director of ["none", "director"]) {
      const p = { ...def.defaults, director }, d = def.build(p), pack = buildPack(def, p, d);
      expect(tuning(def, p, d).rows).toHaveLength(1);
      const bom = pack.bom.map((r) => en(r.item)).join("\n");
      expect(bom).toContain("Metal plate"); expect(bom).toContain("Nylon standoff"); expect(bom).toContain("SMA panel jack");
      expect(bom).not.toContain("εr");
      expect(pack.bom.filter((r) => en(r.item).startsWith("Metal plate"))).toHaveLength(director === "director" ? 3 : 2);
      const sub = pack.substrate.map(en).join("\n");
      expect(sub).toContain("gap between the plates"); expect(sub).not.toContain("FR-4");
      expect(pack.steps.map(en).join("\n")).toContain("nylon standoffs");
      expect(airHeightShift(d.f, airSetup(p, d.f).q.h, 0, airSetup(p, d.f).q.h + 1e-3)).toBeLessThan(d.f);
    }
  });
  it("fab zip names the plates, and has the director set", () => {
    for (const director of ["none", "director"]) {
      const p = { ...def.defaults, director }, d = def.build(p), z = fabZip(def, p, d, "air", "1");
      const txt = new TextDecoder().decode(z);
      expect(txt).toContain("Air patch, not a laminate");
      expect(txt.includes("air_part2.GTL")).toBe(director === "director");
    }
  });
  it("Radiation view: TM10 current on the patch", () => {
    expect(idealCurrents("airpatch", build())!.els.length).toBe(5 * 16);
  });
  it("synthesis scores it with its model gain", () => {
    const r = synthesize({ bands: [[2.4e9, 2.4835e9]], goal: "gain", family: "printed", pol: "any", pattern: "beam", d: 2e-3, er: 4.4, h: 1.6e-3 });
    const c = r.find((x) => x.id === "airpatch")!;
    expect(c).toBeDefined();
    expect(Number.isFinite(c.score)).toBe(true);
    expect(c.gain).toBeGreaterThan(9); expect(c.params.director).toBe("none");
    expect(Math.max(...c.swr)).toBeLessThan(2);
  });
  it("parameter extremes and band extremes build with finite numbers", () => {
    for (const bands of ["100e3-100e3", "100e9-100e9", "1e9-1.1e9"]) for (const director of ["none", "director"]) for (const hf of [0.02, 0.12]) for (const gs of [0.6, 3]) for (const ds of [0.05, 0.2]) {
      const d = build({ bands, director, hf, gs, ds, t: 3e-3, trim: 25 });
      expect(d.dims.every((x) => Number.isFinite(x.value) && x.value >= 0), `${bands} ${director} ${hf}`).toBe(true);
      expect(Object.values(d.pcb!.board).every(Number.isFinite)).toBe(true);
    }
  });
});
