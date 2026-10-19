import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "./antennas";
import type { Design, Params } from "./types";
import { bendPaths, type P2 } from "./print/paths";
import { bendRecipes, dieFor, type Recipe } from "./recipe";

const build = (id: string, extra: Params = {}) => { const def = ANTENNA_BY_ID[id]; const p = { ...def.defaults, ...extra }; return { def, p, d: def.build(p) }; };
const recipes = (id: string, extra: Params = {}) => { const { def, p, d } = build(id, extra); return bendRecipes(def, p, d); };

/** Walk the recipe as a turtle from (0,0) heading +x; returns the virtual corners (intersections of the straight runs). */
function rebuild(r: Recipe): P2[] {
  const Rc = r.die!.r + r.dia * 1000 / 2;
  let x = 0, y = 0, h = 0, s = 0;
  const out: P2[] = [];
  // gentle curves are not in the recipe's turtle: compare only the bends before the first one
  const cut = r.curves.length ? r.curves[0].from : Infinity;
  for (const b of r.bends.filter((x) => x.at < cut)) {
    const run = b.at * 1000 - s, th = b.angle * Math.PI / 180, t = Rc * Math.tan(th / 2);
    x += Math.cos(h) * (run + t); y += Math.sin(h) * (run + t);   // the virtual corner
    out.push(b.short ? [NaN, NaN] : [x, y]);
    h += b.dir === "L" ? th : -th;
    x += Math.cos(h) * t; y += Math.sin(h) * t;                   // end of the arc
    s = b.at * 1000 + Rc * th;
  }
  return out;
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
    for (const r of rs) {
      const mine = rebuild(r), want = designCorners(r);
      if (!r.curves.length) expect(mine).toHaveLength(want.length);
      mine.forEach((q, i) => { if (!Number.isNaN(q[0])) expect(Math.hypot(q[0] - want[i][0], q[1] - want[i][1])).toBeLessThan(0.5); });
    }
  });

  it("wire between bolt sizes uses the bolt radius", () => {
    const { def, p, d } = build("biquad", { d: 1.6e-3 });
    const rs = bendRecipes(def, p, d);
    expect(rs[0].die!.bolt).toBe("M4");
    for (const r of rs) {
      const mine = rebuild(r), want = designCorners(r);
      mine.forEach((q, i) => { if (!Number.isNaN(q[0])) expect(Math.hypot(q[0] - want[i][0], q[1] - want[i][1])).toBeLessThan(0.5); });
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

  it("thick bent pieces still get numbers", () => {
    const rs = recipes("yagi");
    const r = rs.find((x) => x.closed)!;
    expect(r.die).toBeNull();
    expect(r.bends).toHaveLength(4);
    expect(r.bends[0].at).toBeGreaterThan(0);
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
