import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { Params } from "../../types";
import { loadManifold } from "../manifold";
import { buildPart } from "../parts";
import { bendPaths, flatten, signature, type Flat } from "../paths";
import { MAX_SIZE } from "../rules";
import { bendParts, cornerJigs, plateGroove } from "./bend";
import { ball, inside, setup } from "./testkit";

let M: ManifoldToplevel;
beforeAll(async () => { M = await loadManifold(); });

const plates = (id: string, extra: Params = {}) => bendParts(setup(id, extra).d).filter((s) => s.id.startsWith("bend-plate"));
const flats = (id: string, extra: Params = {}) => bendPaths(setup(id, extra).d).map(flatten).filter((f): f is Flat => !!f);

/** The wire lies clear in the groove and has plastic under it, all along the filleted centre line. */
function probe(plate: Manifold, f: Flat, tag: string) {
  let { path: g } = plateGroove(f);
  if (!f.closed) {
    // the wire end butts against the stop (square to start → lead): its centre line starts a ball radius in; a lead
    // kink shorter than that (0.1 mm on the skycone cage frames) is cut off by the stop
    const { lead } = plateGroove(f), a = g[0], b = g[lead], l = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], s = 0.4 * f.d + 0.05;
    g = [[a[0] + u[0] * s, a[1] + u[1] * s], ...g.filter((q, i) => i >= lead || (q[0] - a[0]) * u[0] + (q[1] - a[1]) * u[1] >= s)];
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
      // the left-hand leaf is the mirror image of the right-hand one (y → −y): the same shape, so the same plate holds it
      const q = bendPaths(setup("cloverleaf", { leaves, hand }).d)[0].pts, r = bendPaths(setup("cloverleaf", { leaves }).d)[0].pts;
      if (hand === "lhcp") expect(q.some((x, i) => Math.abs(x[1] - r[i][1]) > 1)).toBe(true);
      expect(signature(fs[0])).toBe(signature(flats("cloverleaf", { leaves })[0]));
      probe(plate, fs[0], `${leaves} ${hand}`);
    }
  }, 60_000);
  it.each(["cloverleaf", "skyconecage"])("%s: every open groove starts with a flat stop, even after a short lead", (id) => {
    const seen = new Set<string>(), fs = flats(id).filter((f) => !seen.has(signature(f)) && !!seen.add(signature(f)) && Math.max(...f.size) + 8 <= MAX_SIZE);
    const ps = plates(id);
    expect(ps).toHaveLength(fs.length);
    let open = 0;
    ps.forEach((s, k) => {
      const f = fs[k];
      if (f.closed) return;
      open++;
      const plate = s.build(M)[0], { path: g, lead } = plateGroove(f), a = g[0], b = g[lead];
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeGreaterThan(1);
      probe(plate, f, s.id);
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      // behind the start along the piece's first direction, just below the top face: plastic (the stop)
      for (const t of [0.3, 0.6, 1]) {
        const c = M.Manifold.cube([0.2, 0.2, 0.2], true).translate([a[0] - u[0] * t, a[1] - u[1] * t, -0.2]);
        expect(inside(plate, c), `${s.id} ${t} mm`).toBeGreaterThan(0.9 * 0.008);
      }
    });
    expect(open).toBeGreaterThan(0);
  }, 60_000);
  it("biquad: pegs inside the corners, up to d + 1 above the top face", () => {
    const [f] = flats("biquad"), plate = plates("biquad")[0].build(M)[0], { pegs } = plateGroove(f);
    expect(pegs.length).toBeGreaterThan(0);
    expect(pegs.length).toBeLessThanOrEqual(f.corners.length);
    const cube = (z: number, c: [number, number]) => M.Manifold.cube([0.2, 0.2, 0.2], true).translate([c[0], c[1], z]);
    const n = f.pts.length, at = (i: number) => [f.pts[(i + n) % n][0] + 4, f.pts[(i + n) % n][1] + 4];
    for (const p of pegs) {
      expect(p.r).toBeCloseTo(Math.max(1.5, f.d), 6);
      expect(inside(plate, cube(f.d + 0.8, p.c))).toBeGreaterThan(0.9 * 0.008);
      expect(inside(plate, cube(f.d + 1.2, p.c))).toBeLessThan(1e-6);
      // inner side: within the angle of the nearest corner (on the side of the sum of its two edge directions)
      const k = f.corners.reduce((m, i) => (Math.hypot(at(i)[0] - p.c[0], at(i)[1] - p.c[1]) < Math.hypot(at(m)[0] - p.c[0], at(m)[1] - p.c[1]) ? i : m));
      const V = at(k), A = at(k - 1), B = at(k + 1), e = (Q: number[]) => { const l = Math.hypot(Q[0] - V[0], Q[1] - V[1]); return [(Q[0] - V[0]) / l, (Q[1] - V[1]) / l]; };
      const bis = [e(A)[0] + e(B)[0], e(A)[1] + e(B)[1]];
      expect((p.c[0] - V[0]) * bis[0] + (p.c[1] - V[1]) * bis[1]).toBeGreaterThan(0);
    }
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

const corners = (id: string, extra: Params = {}) => bendParts(setup(id, extra).d).filter((s) => s.id.startsWith("bend-corner"));
/** Clear at z = 0 (ball 0.8 d) and plastic under the groove. */
const clearAndHeld = (jig: Manifold, [x, y]: [number, number], d: number, tag: string) => {
  expect(inside(jig, ball(M, [x, y, 0], 0.8 * d)), `${tag} clear at ${x},${y}`).toBeLessThan(1e-3);
  const b = ball(M, [x, y, -d / 2 - 1.5], 1);
  expect(inside(jig, b), `${tag} held at ${x},${y}`).toBeGreaterThan(0.9 * b.volume());
};

describe("corner jigs", () => {
  it("quad 145 MHz: exactly one 90° corner jig for all 8 corners, builds, holds the wire, open at both ends", () => {
    const cs = corners("quad");
    expect(cs.map((s) => s.id)).toEqual(["bend-corner-1"]);
    expect(cs[0].qty).toBe(1);
    expect(cs[0].use).toBe("jig");
    expect(cs[0].purpose.a![0]).toBe(8);
    expect(cs[0].purpose.a![2]).toBe(90);
    expect(cs[0].howTo.length).toBeGreaterThan(0);
    const b = buildPart(M, cs[0], "t");
    expect(b.ok).toBe(true);
    if (b.ok) for (const s of b.segments) expect(Math.max(...s.size)).toBeLessThanOrEqual(MAX_SIZE);
    const f = flats("quad")[0], [j] = cornerJigs(f), jig = cs[0].build(M)[0];
    expect(j.corners).toBe(1);
    expect(j.pegs).toHaveLength(1);
    for (const q of [...j.path, ...j.mids]) clearAndHeld(jig, q, f.d, "quad");
    // arms 40 mm past the fillet, and the groove runs out through the plate edge at both ends
    const bb = jig.boundingBox();
    for (const [e, o] of [[0, 1], [j.path.length - 1, j.path.length - 2]]) {
      const a = j.path[e], c = j.path[o], l = Math.hypot(a[0] - c[0], a[1] - c[1]), u = [(a[0] - c[0]) / l, (a[1] - c[1]) / l];
      const out: [number, number] = [a[0] + u[0] * 3.9, a[1] + u[1] * 3.9];
      expect(out[0] > bb.min[0] && out[0] < bb.max[0] && out[1] > bb.min[1] && out[1] < bb.max[1]).toBe(true);
      expect(inside(jig, ball(M, [out[0], out[1], 0], 0.8 * f.d))).toBeLessThan(1e-3);
    }
  });
  it("yagi folded dipole (d 2 mm) at 145 MHz: one linked U-fold jig, fs apart", () => {
    const { d } = setup("yagi", { driven: "folded", d: 0.002 }), cs = corners("yagi", { driven: "folded", d: 0.002 });
    expect(cs.map((s) => s.id)).toEqual(["bend-corner-1"]);
    expect(cs[0].purpose.a).toHaveLength(4);
    expect(cs[0].purpose.a![0]).toBe(2);
    expect(cs[0].purpose.a![2]).toBe(90);
    const fs = d.dims.find((x) => x.label === "Folded dipole conductor spacing")!.value as number;
    expect((cs[0].purpose.a![3] as { len: number }).len).toBeCloseTo(fs, 4);
    expect(buildPart(M, cs[0], "t").ok).toBe(true);
    const f = flats("yagi", { driven: "folded", d: 0.002 })[0], js = cornerJigs(f), jig = cs[0].build(M)[0];
    expect(js).toHaveLength(2);
    const j = js[0];
    expect(j.corners).toBe(2);
    expect(j.pegs).toHaveLength(2);
    expect(j.mids).toHaveLength(2);
    for (const q of j.mids) clearAndHeld(jig, q, f.d, "fold mid");
    // the two parallel straight arms: probe each end, then their distance across the fold = fs
    const p0 = j.path[0], p1 = j.path[1], pn = j.path[j.path.length - 1], l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), u = [(p1[0] - p0[0]) / l, (p1[1] - p0[1]) / l];
    clearAndHeld(jig, [p0[0] + u[0] * 10, p0[1] + u[1] * 10], f.d, "arm 1");
    const pm = j.path[j.path.length - 2], lm = Math.hypot(pm[0] - pn[0], pm[1] - pn[1]);
    clearAndHeld(jig, [pn[0] + (pm[0] - pn[0]) / lm * 10, pn[1] + (pm[1] - pn[1]) / lm * 10], f.d, "arm 2");
    expect(Math.abs(Math.abs((pn[0] - p0[0]) * u[1] - (pn[1] - p0[1]) * u[0]) - fs * 1000)).toBeLessThan(0.05);
  });
  it("moxon defaults: corner jigs only, all build within 180 mm", () => {
    const all = bendParts(setup("moxon").d);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((s) => s.id.startsWith("bend-corner"))).toBe(true);
    expect(all.reduce((s, x) => s + (x.purpose.a![0] as number), 0)).toBe(4);
    for (const s of all) {
      const b = buildPart(M, s, "t");
      expect(b.ok, s.id).toBe(true);
      if (b.ok) for (const g of b.segments) expect(Math.max(...g.size)).toBeLessThanOrEqual(MAX_SIZE);
    }
  });
  it("plate lead: the first untrimmed ball stays in front of the stop for d = 3 mm", () => {
    // a 1.2 mm lead kinked by 90°: the old 1 mm lead ended on the fillet, whose ball (r 1.65) reached behind the stop
    const f: Flat = { pts: [[0, 0], [1.2, 0], [1.2, 50], [60, 50]], closed: false, d: 3, corners: [1, 2], size: [60, 50] };
    const { path: g, lead } = plateGroove(f);
    expect(Math.hypot(g[lead][0] - g[0][0], g[lead][1] - g[0][1])).toBeGreaterThan((3 + 0.3) / 2 + 0.5);
  });
});
