import { describe, expect, it } from "vitest";
import { setup } from "./families/testkit";
import { bendPaths, type BendPath, filleted, flatten, signature, type P2 } from "./paths";
import { CLEAR, mm } from "./rules";

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

const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const segDist = (p: P2, a: P2, b: P2) => {
  const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2)) : 0;
  return dist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
};

describe("flatten / filleted / signature", () => {
  it("quad loop flattens: 4 corners, each 90°, size ≈ side × side", () => {
    const p = bendPaths(setup("quad").d)[0], f = flatten(p)!;
    expect(f).not.toBeNull();
    expect(f.corners).toEqual([0, 1, 2, 3]);
    const side = Math.hypot(p.pts[1][0] - p.pts[0][0], p.pts[1][1] - p.pts[0][1], p.pts[1][2] - p.pts[0][2]);
    expect(Math.max(...f.size)).toBeCloseTo(side, 3);
    expect(Math.min(...f.size)).toBeCloseTo(side, 3);
    expect(Math.min(...f.pts.flat())).toBeCloseTo(0, 6);
  });
  it("spring path is not planar", () => {
    const P = bendPaths(setup("spring").d);
    for (const p of P) expect(flatten(p)).toBeNull();
  });
  it("cloverleaf leaf: no corner inside the arc", () => {
    const f = flatten(bendPaths(setup("cloverleaf").d)[0])!;
    expect(f).not.toBeNull();
    expect(f.corners.length).toBe(2);
    expect(f.corners.every((c) => c > 0 && c < f.pts.length - 1)).toBe(true);
    const n = f.pts.length - 1;
    expect(f.corners.every((c) => c <= 2 || c >= n - 2)).toBe(true);
  });
  it("filleted: clear of pegs and close to the polyline", () => {
    const f = flatten(bendPaths(setup("quad").d)[0])!, g = filleted(f), rp = Math.max(1.5, f.d), Rf = rp + (f.d + CLEAR) / 2;
    expect(g.pegs).toHaveLength(4);
    for (const q of g.path) for (const pg of g.pegs) expect(dist(q, pg.c)).toBeGreaterThanOrEqual(Rf - 0.01);
    for (const pg of g.pegs) expect(pg.r).toBeCloseTo(rp, 6);
    const n = f.pts.length;
    for (const q of g.path) expect(Math.min(...f.pts.map((a, i) => segDist(q, a, f.pts[(i + 1) % n])))).toBeLessThanOrEqual(0.5 * f.d + Rf);
  });
  it("fillet clamp: short middle run gives no NaN and tangents inside the run", () => {
    const f = { pts: [[0, 0], [30, 0], [30, 2], [60, 2]] as P2[], closed: false, d: 1.5, corners: [1, 2], size: [60, 2] as P2 };
    const g = filleted(f);
    expect(g.path.flat().every(Number.isFinite)).toBe(true);
    // middle run (30,0)-(30,2): the clamp is 0.45 × 2 = 0.9 mm, so both arcs start/end on it and the pegs are omitted (Rf 0.9 < rp + d/2)
    expect(g.pegs).toHaveLength(0);
    const has = (x: number, y: number) => g.path.some((q) => Math.hypot(q[0] - x, q[1] - y) < 1e-6);
    expect(has(29.1, 0)).toBe(true); expect(has(30, 0.9)).toBe(true); expect(has(30, 1.1)).toBe(true); expect(has(30.9, 2)).toBe(true);
    for (const q of g.path) { expect(q[0]).toBeGreaterThanOrEqual(-1e-9); expect(q[0]).toBeLessThanOrEqual(60 + 1e-9); expect(q[1]).toBeGreaterThanOrEqual(-1e-9); expect(q[1]).toBeLessThanOrEqual(2 + 1e-9); }
  });
  it("open paths: a 4-point Z flattens; an end lifted 5 mm off the plane does not", () => {
    const z = (h: number): BendPath => ({ pts: [[0, 0, 0], [30, 0, 0], [30, 20, 0], [60, 20, h]], closed: false, d: 1.5, group: "" });
    const f = flatten(z(0))!;
    expect(f).not.toBeNull();
    expect(f.corners).toEqual([1, 2]);
    expect(flatten(z(5))).toBeNull();
    const u: BendPath = { pts: [[0, 20, 0], [0, 0, 0], [30, 0, 0], [30, 20, 0]], closed: false, d: 1.5, group: "" };
    expect(flatten(u)!.corners).toEqual([1, 2]);
    const five: BendPath = { pts: [[0, 0, 0], [10, 0, 0], [10, 10, 0], [20, 10, 0], [20, 10, 5]], closed: false, d: 1.5, group: "" };
    expect(flatten(five)).toBeNull();   // free end 5 mm off the plane of the interior
  });
  it("signature includes d and the closed flag", () => {
    const f = flatten(bendPaths(setup("quad").d)[0])!;
    expect(signature({ ...f, d: f.d + 0.5 })).not.toBe(signature(f));
    expect(signature({ ...f, closed: false })).not.toBe(signature(f));
  });
  it("cloverleaf: leaves share one signature, either hand", () => {
    const sig = (extra = {}) => bendPaths(setup("cloverleaf", extra).d).map((p) => signature(flatten(p)!));
    const a = sig(), b = sig({ hand: "lhcp" });
    expect(new Set([...a, ...b]).size).toBe(1);
    expect(new Set(sig({ leaves: "4" })).size).toBe(1);
  });
  it("signature differs for different shapes", () => {
    const [a, b] = bendPaths(setup("quad").d).map((p) => signature(flatten(p)!));
    expect(a).not.toBe(b);
  });
});
