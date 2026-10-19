import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "./antennas";
import type { Params } from "./types";
import { buildSheetPages, buildPackPDF, templateKind, templatePages, templateSVG } from "./template";
import type { Page } from "./drawing";

const build = (id: string, extra: Params = {}) => { const def = ANTENNA_BY_ID[id]; const p = { ...def.defaults, ...extra }; return { def, p, d: def.build(p) }; };
const texts = (pages: Page[]) => pages.flatMap((pg) => pg.prims.flatMap((q) => (q.k === "text" ? [q.s] : [])));

describe("bend recipe in the templates", () => {
  it("biquad: kind unchanged, recipe strip with B1..B7 appended", () => {
    const { def, p, d } = build("biquad");
    expect(templateKind(def, d, p)).toBe(templateKind(def, d));
    const without = templatePages(def, d, false);
    const withR = templatePages(def, d, false, p);
    expect(withR.length).toBeGreaterThan(without.length);
    const s = texts(withR.slice(without.length));
    for (let i = 1; i <= 7; i++) expect(s).toContain(`B${i}`);
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
    expect(texts(buildSheetPages(def, p, d, "t")).some((x) => x.startsWith("B1 "))).toBe(true);
  });
  it("biquad PDF builds", () => {
    const { def, p, d } = build("biquad");
    expect(buildPackPDF(def, p, d, "t", false).length).toBeGreaterThan(1000);
  });
});
