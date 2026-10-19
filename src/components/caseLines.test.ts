import { describe, expect, it } from "vitest";
import { caseLines } from "./caseLines";

describe("caseLines", () => {
  it("a box is twelve edges: two loops of four and four verticals, in metres", () => {
    const l = caseLines({ kind: "box", style: "fpv", wall: 1.2, gap: 1, lo: [-10, -20, -5], hi: [10, 20, 5] });
    expect(l.length).toBe(6);
    expect(l[0][0]).toEqual([-0.01, -0.02, -0.005]);
    expect(l[1][2]).toEqual([0.01, 0.02, 0.005]);
    expect(l.slice(2).every((v) => v.length === 2 && v[0][2] === -0.005 && v[1][2] === 0.005)).toBe(true);
  });
  it("a dome is two circles, and four verticals that end at the apex", () => {
    const l = caseLines({ kind: "dome", style: "outdoor", wall: 1.6, gap: 1, lo: [-30, -30, 0], hi: [30, 30, 100], round: { r: 30, z0: 0, z1: 70, apex: 100 } }, 24);
    expect(l.length).toBe(6);
    expect(l[0].length).toBe(25);
    for (const q of l[0]) expect(Math.hypot(q[0], q[1])).toBeCloseTo(0.03, 9);
    expect(l[1][0][2]).toBeCloseTo(0.07, 9);
    for (const c of l.slice(2)) { expect(c[0][2]).toBe(0); expect(c[1][2]).toBeCloseTo(0.07, 9); expect(c[2]).toEqual([0, 0, 0.1]); }
  });
});
