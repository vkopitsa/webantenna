import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "./antennas";
import type { Design, Params } from "./types";
import { bendPaths, type P2 } from "./print/paths";
import { bendRecipes, dieFor, type Recipe } from "./recipe";
import { buildPack } from "./build";

const build = (id: string, extra: Params = {}) => { const def = ANTENNA_BY_ID[id]; const p = { ...def.defaults, ...extra }; return { def, p, d: def.build(p) }; };
const recipes = (id: string, extra: Params = {}) => { const { def, p, d } = build(id, extra); return bendRecipes(def, p, d); };

/** Walk the recipe as a turtle from (0,0) heading +x; returns the virtual corners (intersections of the straight runs).
 *  Gentle turns (curves) are followed as chords of the recipe's path. Corners are placed as the benders make them: the
 *  wire is held in the groove on the side away from the cut start with the `mark` on the die's tangent line, and the free
 *  end (towards the cut start) is swung round the die, so the arc forms between the cut start and the mark: it ends at
 *  the mark and starts Rc·θ before it. */
function rebuild(r: Recipe): P2[] {
  const Rc = r.die!.r + r.dia * 1000 / 2, q = r.path, n = q.length, m = r.closed ? n : n - 1, v = (i: number) => q[i % n];
  let x = 0, y = 0, h = 0, s = 0, prevT = 0, k = 0;
  const go = (dist: number) => { x += Math.cos(h) * dist; y += Math.sin(h) * dist; };
  const out: P2[] = [];
  for (let i = 1; i < m; i++) {
    const a = v(i - 1), b = v(i), c = v(i + 1), u = [b[0] - a[0], b[1] - a[1]], w = [c[0] - b[0], c[1] - b[1]];
    const th = Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1]), deg = Math.abs(th) * 180 / Math.PI;
    if (deg > 20) {
      const bd = r.bends[k++], t = Rc * Math.tan(Math.abs(th) / 2);
      const arc0 = bd.mark * 1000 - Rc * Math.abs(th);               // the arc lies on the cut-start side of the mark
      go(arc0 - s + t);                                              // the virtual corner
      out.push(bd.short ? [NaN, NaN] : [x, y]);
      h += bd.dir === "L" ? Math.abs(th) : -Math.abs(th);
      go(t);                                                         // end of the arc
      s = bd.mark * 1000; prevT = t;
    } else if (deg > 1) {
      const L = Math.hypot(...u) - prevT;
      go(L); s += L; h += th; prevT = 0;
    }
  }
  return out;
}

/** Compare the rebuilt corners with the design's; returns how many were compared (short runs are skipped). */
function compare(r: Recipe): number {
  const mine = rebuild(r), want = designCorners(r);
  expect(mine).toHaveLength(want.length);
  expect(r.bends).toHaveLength(want.length);
  let n = 0;
  mine.forEach((q, i) => { if (!Number.isNaN(q[0])) { n++; expect(Math.hypot(q[0] - want[i][0], q[1] - want[i][1])).toBeLessThan(0.5); } });
  return n;
}

/** Corners (turn > 20°, not the cut ends) of the recipe's flattened path, in the recipe's frame (first point at the origin, first segment along +x). */
function designCorners(r: Recipe): P2[] {
  const q = r.path, n = q.length, o = q[0], u = [q[1][0] - o[0], q[1][1] - o[1]], l = Math.hypot(...u), c = u[0] / l, s = u[1] / l;
  const out: P2[] = [];
  for (let i = 1; i < (r.closed ? n : n - 1); i++) {
    const a = q[i - 1], b = q[i], e = q[(i + 1) % n], v1 = [b[0] - a[0], b[1] - a[1]], v2 = [e[0] - b[0], e[1] - b[1]];
    const th = Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2))) * 180 / Math.PI;
    if (th > 20) out.push([(b[0] - o[0]) * c + (b[1] - o[1]) * s, -(b[0] - o[0]) * s + (b[1] - o[1]) * c]);
  }
  return out;
}

describe("dieFor", () => {
  it("picks the smallest bolt with radius ≥ max(1.5, d)", () => {
    expect(dieFor(1)!.bolt).toBe("M3");
    expect(dieFor(1.5)!.bolt).toBe("M3");
    expect(dieFor(1.6)!.bolt).toBe("M4");
    expect(dieFor(2)!.r).toBe(2);
    expect(dieFor(3)!.bolt).toBe("M6");
    expect(dieFor(3.1)).toBeNull();
  });
});

describe("bendRecipes", () => {
  it("quad driven loop: 4 corners, B1 is the first corner from the feed", () => {
    const { def, p, d } = build("quad");
    const r = bendRecipes(def, p, d).find((x) => x.group === "driven")!;
    expect(r.closed).toBe(true);
    expect(r.bends).toHaveLength(designCorners(r).length);
    expect(r.bends).toHaveLength(4);
    for (const b of r.bends) { expect(Math.abs(b.angle - 90)).toBeLessThan(0.5); expect(b.dir).toBe(r.bends[0].dir); }
    expect(r.bends[0].at).toBeLessThan(r.length / 4);
  });

  const cases: [string, Params][] = [
    ["quad", { band: "430e6-440e6" }], ["moxon", {}], ["biquad", {}], ["cloverleaf", {}], ["yagi", { driven: "folded", d: 2e-3 }],
  ];
  it.each(cases)("marks land on the design corners: %s", (id, extra) => {
    const { def, p, d } = build(id, extra);
    const rs = bendRecipes(def, p, d).filter((r) => r.die);
    expect(rs.length).toBeGreaterThan(0);
    for (const r of rs) expect(compare(r)).toBeGreaterThan(0);
  });

  it("wire between bolt sizes uses the bolt radius", () => {
    const { def, p, d } = build("biquad", { d: 1.6e-3 });
    const rs = bendRecipes(def, p, d);
    expect(rs[0].die!.bolt).toBe("M4");
    for (const r of rs) {
      expect(r.bends.some((b) => b.short)).toBe(false);
      expect(compare(r)).toBe(r.bends.length);
    }
  });

  it("biquad: the loop is cut at the feed into two identical halves of 3 bends each", () => {
    const { def, p, d } = build("biquad");
    const rs = bendRecipes(def, p, d);
    expect(rs).toHaveLength(1);
    expect(rs[0].qty).toBe(2);
    expect(rs[0].bends).toHaveLength(3);
    expect(rs[0].closed).toBe(false);
    expect(rs[0].path).toHaveLength(5);
  });

  const FAMILIES: [string, Params][] = [
    ["biquad", {}], ["biquad", { d: 1.6e-3 }], ["quad", {}], ["moxon", {}], ["jpole", {}], ["yagi", { driven: "folded" }], ["cloverleaf", {}],
    ["groundplane", {}], ["dipole", { droop: 30 }], ["discone", {}], ["collinear", {}],
  ];
  it.each(FAMILIES)("%s %j: the cut agrees with the developed length", (id, extra) => {
    for (const r of recipes(id, extra)) {
      expect(r.cut, `${id} ${r.tag}`).toBeGreaterThan(r.length * 0.9);
      expect(r.cut, `${id} ${r.tag}`).toBeLessThan(r.length * 1.1);
    }
  });

  it("short run is flagged", () => {
    const { def, p } = build("dipole");
    const r = 1e-3, w = (a: number[], b: number[]) => ({ a, b, r, group: "driven" as const });
    const d = { wires: [w([0, 0, 0.05], [0, 0, 0]), w([0, 0, 0], [0.003, 0, 0]), w([0.003, 0, 0], [0.003, 0, 0.05])], dims: [], tables: [] } as unknown as Design;
    const [rec] = bendRecipes(def, p, d);
    expect(rec.bends).toHaveLength(2);
    expect(rec.bends.every((b) => b.short)).toBe(true);
    expect(rec.bends.every((b) => Number.isFinite(b.at) && b.at >= 0)).toBe(true);
  });

  it("thick bent pieces still get numbers; with no die the mark is the corner itself", () => {
    const rs = recipes("yagi");
    const r = rs.find((x) => x.closed)!;
    expect(r.die).toBeNull();
    expect(r.bends).toHaveLength(4);
    expect(r.bends[0].at).toBeGreaterThan(0);
    for (const b of r.bends) expect(b.mark).toBe(b.at);
  });

  it("the mark is the end of the arc: at + Rc·θ", () => {
    const r = recipes("biquad")[0], Rc = r.die!.r + r.dia * 1000 / 2;
    for (const b of r.bends) expect((b.mark - b.at) * 1000).toBeCloseTo(Rc * b.angle * Math.PI / 180, 9);
  });

  it("every recipe names its piece as the cut list does", () => {
    for (const [id, extra] of [["quad", { band: "430e6-440e6" }], ["yagi", { driven: "folded", d: 2e-3 }], ["cloverleaf", {}]] as [string, Params][]) {
      const { def, p, d } = build(id, extra), cuts = buildPack(def, p, d).cuts;
      for (const r of bendRecipes(def, p, d)) expect(cuts.find((c) => c.tag.split(/[,–]/)[0] === r.tag.split(/[,–]/)[0])!.what, `${id} ${r.tag}`).toEqual(r.what);
    }
    expect(recipes("biquad")[0].what.s).toBe("Driven element");
  });

  it("skycone gets none", () => {
    expect(recipes("skyconecage")).toEqual([]);
  });

  it("identical pieces merge", () => {
    const rs = recipes("cloverleaf");
    expect(rs).toHaveLength(1);
    expect(rs[0].qty).toBe(bendPaths(build("cloverleaf").d).length);
  });
});
