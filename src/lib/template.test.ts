import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "./antennas";
import type { Params } from "./types";
import { buildSheetPages, buildPackPDF, recipeDrawings, templateKind, templatePages, templateSVG } from "./template";
import { bendRecipes } from "./recipe";
import type { Page } from "./drawing";

const build = (id: string, extra: Params = {}) => { const def = ANTENNA_BY_ID[id]; const p = { ...def.defaults, ...extra }; return { def, p, d: def.build(p) }; };
const texts = (pages: Page[]) => pages.flatMap((pg) => pg.prims.flatMap((q) => (q.k === "text" ? [q.s] : [])));

describe("bend recipe in the templates", () => {
  it("biquad: kind unchanged, recipe strip with B1..B3 appended", () => {
    const { def, p, d } = build("biquad");
    expect(templateKind(def, d, p)).toBe(templateKind(def, d));
    const without = templatePages(def, d, false);
    const withR = templatePages(def, d, false, p);
    expect(withR.length).toBeGreaterThan(without.length);
    const s = texts(withR.slice(without.length));
    for (let i = 1; i <= 3; i++) expect(s).toContain(`B${i}`);
    expect(s).not.toContain("B4");
    expect(s.some((x) => x.includes("M3 bolt"))).toBe(true);
    expect(s.some((x) => /^90° [LR]$/.test(x))).toBe(true);
    expect(templateSVG(def, d, false, p)).toContain("B1");
  });
  it("dipole: straight, no recipe pages, kind none", () => {
    const { def, p, d } = build("dipole");
    expect(templateKind(def, d, p)).toBe("none");
    expect(templatePages(def, d, false, p)).toEqual([]);
    expect(templateSVG(def, d, false, p)).toBeNull();
  });
  it("quad on HF: too long for a strip, but the build sheet has the recipe table", () => {
    const { def, p, d } = build("quad", { bands: "14e6-14.35e6" });
    expect(templatePages(def, d, false, p).flatMap((pg) => texts([pg]))).not.toContain("B1");
    const rs = bendRecipes(def, p, d);
    expect(rs.length).toBeGreaterThan(0);
    expect(rs[0].bends).toHaveLength(4);
    expect(texts(buildSheetPages(def, p, d, "t")).some((x) => x.startsWith("B1 "))).toBe(true);
  });
  it("the B marks sit at the recipe positions and every primitive stays inside its drawing", () => {
    for (const [id, extra] of [["biquad", {}], ["quad", { bands: "430e6-440e6" }], ["moxon", {}], ["cloverleaf", {}]] as [string, Params][]) {
      const { def, p, d } = build(id, extra);
      const rs = bendRecipes(def, p, d).filter((r) => r.bends.length), ds = recipeDrawings(rs);
      expect(ds.length, id).toBeGreaterThan(0);
      for (const dr of ds) {
        const r = rs[ds.indexOf(dr)];
        const ticks = dr.prims.filter((q) => q.k === "line" && q.w === 0.5 && q.x1 === q.x2).map((q) => (q as { x1: number }).x1 - 10);
        expect(ticks.length).toBe(r.bends.length);
        r.bends.forEach((b, i) => expect(ticks[i]).toBeCloseTo(b.at * 1e3, 6));
        for (const q of dr.prims) {
          const xs = q.k === "line" ? [q.x1, q.x2] : q.k === "poly" ? q.pts.map((x) => x[0]) : q.k === "text" ? [q.x] : [];
          const ys = q.k === "line" ? [q.y1, q.y2] : q.k === "poly" ? q.pts.map((x) => x[1]) : q.k === "text" ? [q.y] : [];
          for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(dr.w); }
          for (const y of ys) { expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(dr.h); }
        }
      }
    }
  });
  it("biquad PDF builds", () => {
    const { def, p, d } = build("biquad");
    expect(buildPackPDF(def, p, d, "t", false).length).toBeGreaterThan(1000);
  });
});
