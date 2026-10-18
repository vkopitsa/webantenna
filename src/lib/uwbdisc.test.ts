import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "./antennas";
import { discHalfWidth, lowEdge, uwbK, UWB_K_FR4, UWB_MAX_RATIO } from "./antennas/uwbdisc";
import { cpwGap, cpwZ0, ellipKpK } from "./rf";
import { copperBoxes } from "./pcb";
import { lowerEdge } from "./simulate";
import { pcbStandIn } from "./pcbwires";
import { buildMesh, solve } from "./mom";
import { C0 } from "./rf";

const def = ANTENNA_BY_ID.uwbdisc;
const build = (o = {}) => def.build({ ...def.defaults, ...o });

describe("uwbdisc", () => {
  it("reproduces Liang et al. 2005 (R = 10 mm, gap 0.3 mm, FR-4 1.6 mm): lower edge 2.69 GHz measured", () => {
    expect(uwbK(4.4, 1.6e-3)).toBeCloseTo(UWB_K_FR4, 3);
    const f = lowEdge(10e-3, 1, 0.3e-3, UWB_K_FR4);
    expect(Math.abs(f / 2.69e9 - 1)).toBeLessThan(0.03);
  });
  it("round-trips the disc size", () => {
    for (const ar of [1, 1.5]) expect(lowEdge(discHalfWidth(3.1e9, ar, 0.3e-3, 1.15), ar, 0.3e-3, 1.15)).toBeCloseTo(3.1e9, -3);
    const d = build({ bands: "2.69e9-10.7e9" }), a = d.dims.find((x) => x.key === "a")!.value;
    expect(a).toBeGreaterThan(9.5e-3); expect(a).toBeLessThan(10.5e-3);
  });
  it("is a Printed broadband type with an honest ratio and a warning beyond it", () => {
    expect(def.multiband).toBe("broadband"); expect(def.maxRatio).toBe(UWB_MAX_RATIO);
    expect(build().notes.some((n) => n.startsWith("Warning: published"))).toBe(false);
    expect(build({ bands: "300e6-8e9" }).notes.some((n) => n.startsWith("Warning: published"))).toBe(true);
  });
  it("microstrip: ground on the back, 50 Ω line; CPW: no bottom copper but the bridge, port across one gap", () => {
    const m = build().pcb!;
    expect(m.rects.filter((q) => q.layer === "bottom")).toHaveLength(1);
    const c = build({ feed: "cpw" }).pcb!;
    expect(c.rects.filter((q) => q.layer === "top").length).toBe(3);
    expect(c.port.dir).toBe("x"); expect(c.pec).toHaveLength(2);
  });
  it("ellipse is taller and the flex variant is thin", () => {
    const e = build({ shape: "ellipse", ar: 1.5 }).pcb!, bx = copperBoxes(e).find((q) => q.label === "Disc")!;
    expect((bx.y1 - bx.y0) / (bx.x1 - bx.x0)).toBeCloseTo(1.5, 1);
    expect(build({ sub: "flex" }).pcb!.h).toBeCloseTo(0.1e-3, 9);
  });
  it("trim scales the disc", () => {
    const w = (t: number) => { const b = copperBoxes(build({ trim: t }).pcb!).find((q) => q.label === "Disc")!; return b.x1 - b.x0; };
    expect(w(10) / w(0)).toBeCloseTo(1.1, 2);
  });
});

describe("uwbdisc Radiation view stand-in", () => {
  it("is joined to the feed and solvable (microstrip and CPW)", () => {
    for (const o of [{}, { feed: "cpw" }, { shape: "ellipse" }]) {
      const st = pcbStandIn(build(o))!;
      expect(st, JSON.stringify(o)).not.toBeNull();
      const key = (p: number[]) => p.map((c) => c.toFixed(9)).join(",");
      const adj = new Map<string, number[]>();
      st.design.wires.forEach((w, i) => { for (const e of [w.a, w.b]) adj.set(key(e), [...(adj.get(key(e)) ?? []), i]); });
      const seen = new Set([0]), todo = [0];
      while (todo.length) { const w = st.design.wires[todo.pop()!]; for (const e of [w.a, w.b]) for (const j of adj.get(key(e)) ?? []) if (!seen.has(j)) { seen.add(j); todo.push(j); } }
      expect(seen.size, JSON.stringify(o)).toBe(st.design.wires.length);
      const m = buildMesh(st.design, C0 / st.fs, 60, 450)!, z = solve(m, st.fs)!.z;
      expect(Number.isFinite(z[0]) && Number.isFinite(z[1])).toBe(true);
    }
  });
});

describe("FDTD tuning target", () => {
  it("lowerEdge finds the first −10 dB crossing, interpolated", () => {
    // matched (50 Ω) from 3 GHz up, mismatched (R = 150 Ω → −6 dB) below
    const z = Array.from({ length: 11 }, (_, i) => ({ f: (2 + i * 0.2) * 1e9, r: i < 5 ? 150 : 50, x: 0 }));
    expect(lowerEdge(z, 50)! / 1e9).toBeGreaterThan(2.7);
    expect(lowerEdge(z, 50)! / 1e9).toBeLessThanOrEqual(3);
    expect(lowerEdge(z.map((p) => ({ ...p, r: 150 })), 50)).toBeNull();
  });
});

describe("CPW impedance", () => {
  it("K'/K of Hilberg's form matches tabulated K (Abramowitz & Stegun 17.3): k = 0.5", () => {
    expect(ellipKpK(0.5)).toBeCloseTo(2.156516 / 1.685750, 4);
    expect(ellipKpK(Math.SQRT1_2)).toBeCloseTo(1, 5);
  });
  it("air-suspended CPW with k = 1/√2 is 30π Ω; a thick substrate gives εeff = (εr + 1)/2", () => {
    const a = 1e-3, b = a * Math.SQRT2, s = 2 * a, g = b - a;
    expect(cpwZ0(s, g, 1, 1.6e-3).z0).toBeCloseTo(30 * Math.PI, 3);
    expect(cpwZ0(s, g, 4.4, 1).eeff).toBeCloseTo(2.7, 2);
  });
  it("gap synthesis round-trips (FR-4 1.6 mm, 50 Ω)", () => {
    const g = cpwGap(50, 2e-3, 4.4, 1.6e-3);
    expect(cpwZ0(2e-3, g, 4.4, 1.6e-3).z0).toBeCloseTo(50, 2);
    expect(g).toBeGreaterThan(0.1e-3); expect(g).toBeLessThan(1e-3);
  });
});
