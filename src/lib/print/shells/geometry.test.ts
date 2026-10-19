import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "../../antennas";
import type { Design, Params } from "../../types";
import { boxFits, domeFits, envelope, feedPoint, size, styleOf, STYLE } from "./geometry";

const build = (id: string, extra: Params = {}): Design => { const def = ANTENNA_BY_ID[id]; return def.build({ ...def.defaults, ...extra }); };

describe("shell geometry", () => {
  it("tight shells: 1 mm gap, 1.2 mm (FPV) or 1.6 mm (outdoor) wall", () => {
    expect(STYLE).toEqual({ fpv: { wall: 1.2, gap: 1 }, outdoor: { wall: 1.6, gap: 1 } });
  });
  it("style: FPV at and above 2 GHz, outdoor below", () => {
    expect(styleOf(build("helix"))).toBe("outdoor");                                    // GPS
    expect(styleOf(build("helix", { bands: "5725e6-5875e6", d: 1e-3 }))).toBe("fpv");
    expect(styleOf(build("biquad"))).toBe("fpv");                                       // 2.4 GHz
  });
  it("envelope of a PCB antenna is its board plus copper", () => {
    const d = build("ifa"), e = envelope(d), b = d.pcb!.board, t = d.pcb!.t * 1000;
    expect(e.lo[0]).toBeLessThanOrEqual(b.x0 * 1000 + 1e-6); expect(e.hi[0]).toBeGreaterThanOrEqual(b.x1 * 1000 - 1e-6);
    expect(e.lo[1]).toBeLessThanOrEqual(b.y0 * 1000 + 1e-6); expect(e.hi[1]).toBeGreaterThanOrEqual(b.y1 * 1000 - 1e-6);
    expect(Math.abs(e.lo[2] + t)).toBeLessThan(0.01); expect(Math.abs(e.hi[2] - (d.pcb!.h * 1000 + t))).toBeLessThan(0.01);
  });
  it("envelope contains an IFA arm that overruns the board", () => {
    const d = build("ifa", { bw: 16e-3 });
    expect(d.notes.join(" ")).toMatch(/arm is longer/);
    const e = envelope(d), arm = d.pcb!.rects.find((q) => q.label === "Radiating arm")!;
    expect(arm.x1 * 1000).toBeGreaterThan(d.pcb!.board.x1 * 1000);
    expect(e.hi[0]).toBeGreaterThanOrEqual(arm.x1 * 1000 - 1e-6);
  });
  it("envelope ignores NEC-only grids and drawn-only parts", () => {
    const e = envelope(build("helix"));            // the ground disc is a plate: included; the NEC grid is not double-counted
    expect(size(e)[0]).toBeGreaterThan(100);
    const y = build("yagi"), ey = envelope(y);
    const boom = y.wires.find((w) => w.drawOnly)!;
    expect(Math.max(Math.abs(boom.a[0]), Math.abs(boom.b[0])) * 1000).toBeGreaterThanOrEqual(ey.hi[0] - 1e-6);
  });
  it("feed point: dipole at the origin, quad at the bottom of the driven loop, collinear at the origin", () => {
    expect(feedPoint(build("dipole")).map((v) => Math.round(v))).toEqual([0, 0, 0]);
    const q = feedPoint(build("quad"));
    expect(q[2]).toBeLessThan(-100);
    expect(feedPoint(build("collinear"))).toEqual([0, 0, 0]);
    expect(feedPoint(build("helix"))).toEqual([0, 0, 0]);                       // at "start"
    const qd = build("quad"), S = 0.15 * (299792458 / qd.f) * 1000;             // default spacing 0.15 λ
    expect(q[0]).toBeCloseTo(S / 2, 1); expect(q[1]).toBeCloseTo(0, 6);
    const side = qd.wires[0].a[2] * -2000;                                      // driven loop side, mm
    expect(q[2]).toBeCloseTo(-side / 2, 6);
    const syn: Design = { ...qd, wires: [{ a: [0, 0, 0], b: [0.01, 0.02, 0.03], r: 1e-3 }], feed: { wire: 0, at: "end" } };
    expect(feedPoint(syn)).toEqual([10, 20, 30]);
  });
  it("fits", () => {
    expect(boxFits({ lo: [0, 0, 0], hi: [176, 50, 50] }, 2)).toBe(true);    // 176 + 2·2 = 180
    expect(boxFits({ lo: [0, 0, 0], hi: [177, 50, 50] }, 2)).toBe(false);
    // domes: the body height (to the cone apex) splits into at most 3 pieces of SEG_H
    expect(domeFits(80, 500, 2)).toBe(true);
    expect(domeFits(84, 100, 2)).toBe(false);
    expect(domeFits(30, 3 * 170, 2)).toBe(true);
    expect(domeFits(30, 3 * 170 + 1, 2)).toBe(false);
  });
});
