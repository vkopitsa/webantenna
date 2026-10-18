import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { Params } from "../../types";
import { loadManifold } from "../manifold";
import { buildPart } from "../parts";
import { bendPaths, flatten, type Flat } from "../paths";
import { MAX_SIZE } from "../rules";
import { bendParts, plateGroove } from "./bend";
import { ball, inside, setup } from "./testkit";

let M: ManifoldToplevel;
beforeAll(async () => { M = await loadManifold(); });

const plates = (id: string, extra: Params = {}) => bendParts(setup(id, extra).d).filter((s) => s.id.startsWith("bend-plate"));
const flats = (id: string, extra: Params = {}) => bendPaths(setup(id, extra).d).map(flatten).filter((f): f is Flat => !!f);

/** The wire lies clear in the groove and has plastic under it, all along the filleted centre line. */
function probe(plate: Manifold, f: Flat, tag: string) {
  const g = plateGroove(f).path;
  if (!f.closed) {   // the wire end butts against the stop: its centre line starts a ball radius in
    const [a, b] = g, l = Math.hypot(b[0] - a[0], b[1] - a[1]), s = 0.4 * f.d + 0.05;
    g[0] = [a[0] + (b[0] - a[0]) / l * s, a[1] + (b[1] - a[1]) / l * s];
  }
  for (const [x, y] of g) {
    expect(inside(plate, ball(M, [x, y, 0], 0.8 * f.d)), `${tag} clear at ${x},${y}`).toBeLessThan(1e-3);
    const b = ball(M, [x, y, -f.d / 2 - 1.5], 1);
    expect(inside(plate, b), `${tag} held at ${x},${y}`).toBeGreaterThan(0.9 * b.volume());
  }
}

describe("bend plate", () => {
  it("biquad defaults: one plate, builds, fits the bed, holds the wire", () => {
    const ps = plates("biquad");
    expect(ps).toHaveLength(1);
    expect(ps[0].id).toBe("bend-plate-1");
    expect(ps[0].qty).toBe(1);
    expect(ps[0].use).toBe("jig");
    const b = buildPart(M, ps[0], "t");
    expect(b.ok).toBe(true);
    if (b.ok) for (const s of b.segments) expect(Math.max(...s.size)).toBeLessThanOrEqual(MAX_SIZE);
    const [f] = flats("biquad"), segs = ps[0].build(M);
    expect(segs).toHaveLength(1);
    probe(segs[0], f, "biquad");
  });
  it.each([["3", 3], ["4", 4]])("cloverleaf %s leaves: one plate for all leaves, both hands", (leaves, n) => {
    const ps = plates("cloverleaf", { leaves });
    expect(ps).toHaveLength(1);
    expect(ps[0].qty).toBe(1);
    expect(ps[0].purpose.a).toHaveLength(3);
    expect(ps[0].purpose.a![0]).toBe(n);
    const plate = ps[0].build(M)[0];
    for (const hand of ["rhcp", "lhcp"]) {
      const fs = flats("cloverleaf", { leaves, hand });
      // the left-hand leaf is the mirror image: the same plate holds it (flatten lays it out the same way up to mirror)
      expect(plates("cloverleaf", { leaves, hand })[0].title).toBe(ps[0].title);
      probe(plate, fs[0], `${leaves} ${hand}`);
    }
  }, 60_000);
  it("cloverleaf: the open groove starts with a flat stop (no overrun before the first point)", () => {
    const [f] = flats("cloverleaf"), plate = plates("cloverleaf")[0].build(M)[0];
    const g = plateGroove(f).path, [a, b] = g, l = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    // 0.6 mm back from the start along the first segment's line, just below the top face: plastic (the stop)
    const p = [a[0] - u[0] * 0.6, a[1] - u[1] * 0.6, -0.2] as [number, number, number];
    expect(inside(plate, M.Manifold.cube([0.2, 0.2, 0.2], true).translate(p))).toBeGreaterThan(0.9 * 0.008);
  });
  it("quad at 1.27 GHz: one plate per loop size", () => {
    expect(flats("quad", { bands: "1240e6-1300e6" })).toHaveLength(2);
    const ps = plates("quad", { bands: "1240e6-1300e6" });
    expect(ps.map((s) => s.id)).toEqual(["bend-plate-1", "bend-plate-2"]);
    for (const s of ps) expect(buildPart(M, s, "t").ok).toBe(true);
  }, 60_000);
  it("quad at the 180 mm boundary: a plate only for the loop that fits, never \"too large\"", () => {
    // 445 MHz: driven loop 172.1 mm (+ 2 × 4 mm margin = 180.1, just over), reflector 176 mm; 450 MHz: driven fits
    for (const [bands, n] of [["430e6-440e6", 0], ["440e6-450e6", 0], ["445e6-455e6", 1], ["460e6-470e6", 2]] as const) {
      const ps = plates("quad", { bands });
      expect(ps, bands).toHaveLength(n);
      for (const s of ps) expect(buildPart(M, s, "t").ok, bands).toBe(true);
    }
  }, 60_000);
  it("quad at 145 MHz: loops too large for a plate", () => {
    expect(plates("quad")).toHaveLength(0);
  });
  it("wire up to 3 mm only", () => {
    expect(plates("biquad", { d: 0.003 })).toHaveLength(1);
    expect(bendParts(setup("biquad", { d: 0.0031 }).d)).toHaveLength(0);
  });
  it("closed loop: a start notch across the groove at the feed point", () => {
    const [f] = flats("biquad"), plate = plates("biquad")[0].build(M)[0], { path: g, start } = plateGroove(f);
    const q = g[start], q1 = g[(start + 1) % g.length], l = Math.hypot(q1[0] - q[0], q1[1] - q[1]), nx = -(q1[1] - q[1]) / l, ny = (q1[0] - q[0]) / l;
    const cube = (s: number, x: number, y: number, z: number) => M.Manifold.cube([s, s, s], true).translate([x, y, z]);
    // beside the groove (outside its width), just under the top face: cut away at the notch, plastic elsewhere
    const w = (f.d + 0.3) / 2 + 0.6;
    expect(inside(plate, cube(0.2, q[0] + nx * w, q[1] + ny * w, -0.15))).toBeLessThan(1e-4);
    const m = g[(start + 3) % g.length], m1 = g[(start + 4) % g.length], lm = Math.hypot(m1[0] - m[0], m1[1] - m[1]);
    expect(inside(plate, cube(0.2, m[0] - (m1[1] - m[1]) / lm * w, m[1] + (m1[0] - m[0]) / lm * w, -0.15))).toBeGreaterThan(0.9 * 0.008);
  });
});
