import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { loadManifold } from "../manifold";
import { box } from "../shapes";
import { clamshell } from "./clamshell";

let M: ManifoldToplevel;
beforeAll(async () => { M = await loadManifold(); });
const inner = { lo: [-30, -20, -10] as [number, number, number], hi: [30, 20, 15] as [number, number, number] };

describe("clamshell", () => {
  it("two halves split at splitZ, the cavity is empty, the walls are closed", () => {
    const [bot, top] = clamshell(M, { inner, wall: 2, splitZ: 0, drain: true });
    const cavity = box(M, inner.lo, inner.hi);
    expect(bot.intersect(cavity).volume()).toBeLessThan(1e-3);
    expect(top.intersect(cavity).volume()).toBeLessThan(1e-3);
    expect(bot.boundingBox().max[2]).toBeGreaterThan(0);          // the lip rises above the split
    expect(top.boundingBox().min[2]).toBeCloseTo(0, 3);
    // the lip of the bottom half fits into the recess of the top half
    expect(bot.intersect(top).volume()).toBeLessThan(1e-3);
    // walls closed: a box just outside the cavity (inside the wall) is mostly plastic, except the drain
    const wallBand = box(M, [inner.lo[0] - 1.5, inner.lo[1] - 1.5, inner.lo[2] - 1.5], [inner.hi[0] + 1.5, inner.hi[1] + 1.5, inner.hi[2] + 1.5]).subtract(cavity);
    const shell = bot.add(top);
    expect(shell.intersect(wallBand).volume() / wallBand.volume()).toBeGreaterThan(0.95);
  });
  it("applies the cuts to both halves", () => {
    const hole = M.Manifold.cylinder(40, 4, 4, 24).rotate([0, 90, 0]).translate([20, 0, 0]);
    const [bot, top] = clamshell(M, { inner, wall: 2, splitZ: 0, cuts: [hole] });
    expect(bot.add(top).intersect(M.Manifold.cylinder(10, 3.5, 3.5, 24).rotate([0, 90, 0]).translate([28, 0, 0])).volume()).toBeLessThan(1e-3);
  });

  const thin = { lo: [-20, -15, -2.3] as [number, number, number], hi: [20, 15, 2.3] as [number, number, number] };
  const cases: [string, typeof inner, number][] = [["default", inner, 2], ["thin FPV-like", thin, 1.2]];
  const frac = (m: ReturnType<typeof box>, region: ReturnType<typeof box>) => m.intersect(region).volume() / region.volume();
  for (const [name, inn, wall] of cases) {
    it(`${name}: each half is one solid, roof and floor intact`, () => {
      const [bot, top] = clamshell(M, { inner: inn, wall, splitZ: 0 });
      expect(bot.decompose().length).toBe(1);
      expect(top.decompose().length).toBe(1);
      const roof = box(M, [inn.lo[0], inn.lo[1], inn.hi[2]], [inn.hi[0], inn.hi[1], inn.hi[2] + wall]);
      const floor = box(M, [inn.lo[0], inn.lo[1], inn.lo[2] - wall], [inn.hi[0], inn.hi[1], inn.lo[2]]);
      const rf = frac(top, roof), ff = frac(bot, floor);
      expect(rf).toBeGreaterThanOrEqual(0.99);
      expect(ff).toBeGreaterThanOrEqual(0.99);
    });
  }
  it("splitZ outside the cavity throws", () => {
    expect(() => clamshell(M, { inner, wall: 2, splitZ: 15 })).toThrow();
    expect(() => clamshell(M, { inner, wall: 2, splitZ: -10 })).toThrow();
  });
  it("the drain goes through the floor only", () => {
    const [bot, top] = clamshell(M, { inner, wall: 2, splitZ: 0, drain: true });
    const probe = M.Manifold.cylinder(60, 1, 1, 16).translate([-26, -16, -20]);
    expect(bot.intersect(probe).volume()).toBeLessThan(1e-3);        // open through the floor (z -12..-10 and below)
    const roofProbe = M.Manifold.cylinder(2, 1, 1, 16).translate([-26, -16, 15]);
    expect(top.intersect(roofProbe).volume()).toBeGreaterThan(0.99 * roofProbe.volume());
    expect(bot.add(top).volume()).toBeLessThan(clamshell(M, { inner, wall: 2, splitZ: 0 }).reduce((a, m) => a + m.volume(), 0));
  });
  it("no ears: the outer size is the cavity plus two walls in every direction", () => {
    for (const [inn, wall] of [[inner, 2], [thin, 1.2], [inner, 1.6]] as const) {
      const bb = M.Manifold.union(clamshell(M, { inner: inn, wall, splitZ: 0 })).boundingBox();
      for (let i = 0; i < 3; i++) { expect(bb.min[i]).toBeCloseTo(inn.lo[i] - wall, 4); expect(bb.max[i]).toBeCloseTo(inn.hi[i] + wall, 4); }
    }
  });
  it("tongue: the bottom half's lip stands inside the top half's skin with a CLEAR fit, the halves do not touch", () => {
    for (const [inn, wall] of [[inner, 1.6], [inner, 1.2]] as const) {
      const [bot, top] = clamshell(M, { inner: inn, wall, splitZ: 0 });
      expect(bot.boundingBox().max[2], `${wall}`).toBeCloseTo(3, 3);                      // 3 mm tall
      expect(bot.intersect(top).volume(), `${wall}`).toBeLessThan(1e-3);
      // the tongue is 0.8 mm wide, ring-shaped, and the top half's skin is outside it
      const band = box(M, [inn.hi[0], -10, 0.5], [inn.hi[0] + wall, 10, 2.5]);
      expect(frac(bot, band) + frac(top, band), `${wall}`).toBeGreaterThan(0.4);
      expect(frac(top, band), `${wall}`).toBeGreaterThan(0.2);                            // the skin is there
      expect(frac(bot, band), `${wall}`).toBeGreaterThan(0.2);                            // so is the tongue
      expect(frac(bot, box(M, [inn.hi[0] + wall - 0.6, -10, 0.5], [inn.hi[0] + wall, 10, 2.5])), `${wall}`).toBeLessThan(1e-9);   // nothing of the tongue in the skin
      // the tongue never protrudes more than 0.5 mm into the cavity (the antenna is 1 mm away)
      expect(bot.intersect(box(M, [inn.lo[0] + 0.5, inn.lo[1] + 0.5, 0.05], [inn.hi[0] - 0.5, inn.hi[1] - 0.5, 4])).volume(), `${wall}`).toBeLessThan(1e-3);
    }
  });
});
