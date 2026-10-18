import { describe, expect, it } from "vitest";
import { setup } from "./families/testkit";
import { bendPaths } from "./paths";
import { mm } from "./rules";

describe("bendPaths", () => {
  it("biquad: one closed figure-8 of 8 points starting at U", () => {
    const { d } = setup("biquad"), P = bendPaths(d);
    expect(P).toHaveLength(1);
    expect(P[0].closed).toBe(true);
    expect(P[0].pts).toHaveLength(8);
    const u = d.wires.find((w) => w.group === "feed")!.b;
    P[0].pts[0].forEach((c, i) => expect(c).toBeCloseTo(mm(u[i]), 3));
    expect(P[0].d).toBeCloseTo(1.5, 6);
  });
  it("biquad: start is the feed's b end whatever the wire order", () => {
    const { d } = setup("biquad"), u = d.wires.find((w) => w.group === "feed")!.b;
    for (const wires of [[...d.wires].reverse(), [...d.wires.slice(3), ...d.wires.slice(0, 3)]]) {
      const P = bendPaths({ ...d, wires });
      expect(P).toHaveLength(1);
      P[0].pts[0].forEach((c, i) => expect(c).toBeCloseTo(mm(u[i]), 3));
    }
  });
  it("quad: two closed paths of 4 points", () => {
    const P = bendPaths(setup("quad").d);
    expect(P.map((p) => [p.closed, p.pts.length])).toEqual([[true, 4], [true, 4]]);
  });
  it.each([["3", 3], ["4", 4]])("cloverleaf %s leaves: open leaves of 19 points from hub to hub", (leaves, n) => {
    const P = bendPaths(setup("cloverleaf", { leaves }).d);
    expect(P).toHaveLength(n);
    for (const p of P) {
      expect(p.closed).toBe(false);
      expect(p.pts).toHaveLength(19);
      for (const e of [p.pts[0], p.pts[18]]) { expect(e[0]).toBeCloseTo(0, 6); expect(e[1]).toBeCloseTo(0, 6); }   // both ends on the hub axis (feed ends)
    }
  });
  it("yagi folded: one closed path of 4 points, straight elements dropped", () => {
    const P = bendPaths(setup("yagi", { driven: "folded", d: 0.002 }).d);
    expect(P).toHaveLength(1);
    expect(P[0].closed).toBe(true);
    expect(P[0].pts).toHaveLength(4);
  });
  it("dipole: no bends", () => expect(bendPaths(setup("dipole").d)).toEqual([]));
});
