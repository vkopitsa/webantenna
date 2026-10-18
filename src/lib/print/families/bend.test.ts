import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { Params } from "../../types";
import { loadManifold } from "../manifold";
import { buildPart } from "../parts";
import { bendPaths, flatten, signature, type Flat } from "../paths";
import { CLEAR, MAX_SIZE } from "../rules";
import { ANTENNA_BY_ID } from "../../antennas";
import { buildPack, en } from "../../build";
import { pieceBottoms } from "../shapes";
import { BEND_HOWTO, BEND_STRINGS, bendParts, coilParts, cornerJigs, MANDREL_HANDLE, plateGroove, springGeometry } from "./bend";
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
  it.each(["1240e6-1300e6", "863e6-873e6"])("cloverleaf at %s: a bend part that builds", (bands) => {
    const ps = bendParts(setup("cloverleaf", { bands }).d);
    expect(ps.length).toBeGreaterThan(0);
    for (const s of ps) expect(buildPart(M, s, "t").ok, s.id).toBe(true);
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
  it("closed loop: a start notch across the groove halfway along the first straight run after the feed point", () => {
    const [f] = flats("biquad"), plate = plates("biquad")[0].build(M)[0], { notch } = plateGroove(f);
    const [q, u] = notch!, nx = -u[1], ny = u[0], sh = (P: [number, number]) => [P[0] + 4, P[1] + 4];
    // the first run is pts[0] → pts[1] (both corners on the biquad): the notch sits at its middle, along it
    const a = sh(f.pts[0]), b = sh(f.pts[1]);
    expect(Math.hypot(q[0] - (a[0] + b[0]) / 2, q[1] - (a[1] + b[1]) / 2)).toBeLessThan(0.05);
    expect(Math.abs(u[0] * (b[1] - a[1]) - u[1] * (b[0] - a[0]))).toBeLessThan(1e-6);
    const cube = (s: number, x: number, y: number, z: number) => M.Manifold.cube([s, s, s], true).translate([x, y, z]);
    // beside the groove (outside its width), just under the top face: cut away at the notch, plastic 3 mm further on
    const w = (f.d + 0.3) / 2 + 0.6;
    for (const k of [1, -1]) {
      expect(inside(plate, cube(0.2, q[0] + k * nx * w, q[1] + k * ny * w, -0.15))).toBeLessThan(1e-4);
      expect(inside(plate, cube(0.2, q[0] + u[0] * 3 + k * nx * w, q[1] + u[1] * 3 + k * ny * w, -0.15))).toBeGreaterThan(0.9 * 0.008);
    }
  });
  it.each([["defaults", {}], ["d 0.5", { d: 0.0005 }], ["d 3", { d: 0.003 }], ["5.8 GHz", { bands: "5725e6-5875e6" }]] as [string, Params][])(
    "biquad %s: every peg is whole (the start notch does not slit the feed-corner peg)", (_t, extra) => {
      const [f] = flats("biquad", extra), ps = plates("biquad", extra), { pegs } = plateGroove(f);
      expect(ps).toHaveLength(1);
      expect(pegs.length).toBeGreaterThan(0);
      const plate = ps[0].build(M)[0];
      for (const p of pegs) {
        const b = ball(M, [p.c[0], p.c[1], 0], 1.8 * p.r);
        expect(inside(plate, b), `peg ${p.i}`).toBeGreaterThan(0.99 * b.volume());
      }
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
  it("biquad at 433 MHz: corners within 2° share one jig at their mean angle", () => {
    const extra = { bands: "433.05e6-434.79e6" }, cs = corners("biquad", extra);
    expect(cs.map((s) => s.id)).toEqual(["bend-corner-1"]);
    expect(cs[0].purpose.s).toBe(BEND_STRINGS[3]);
    expect(cs[0].purpose.a![0]).toBe(8);
    const js = cornerJigs(flats("biquad", extra)[0]), mean = js.reduce((x, j) => x + Math.abs(j.angles[0]), 0) / js.length;
    expect(cs[0].purpose.a![2]).toBe(Math.round(mean * 2) / 2);
    const b = buildPart(M, cs[0], "t");
    expect(b.ok).toBe(true);
    if (b.ok) for (const s of b.segments) expect(Math.max(...s.size)).toBeLessThanOrEqual(MAX_SIZE);
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
  it("open zig-zag: every jig's groove turns only by its own corners (arms stop at the neighbouring fillets)", () => {
    // three 150° turns, 65 mm runs (≥ LINK, so single-corner jigs), d = 3
    let h = 0, q: [number, number] = [0, 0];
    const raw: [number, number][] = [q];
    for (const t of [150, -150, 150, 0]) { q = [q[0] + 65 * Math.cos(h * Math.PI / 180), q[1] + 65 * Math.sin(h * Math.PI / 180)]; raw.push(q); h += t; }
    const x0 = Math.min(...raw.map((a) => a[0])), y0 = Math.min(...raw.map((a) => a[1])), pts = raw.map((a) => [a[0] - x0, a[1] - y0] as [number, number]);
    const f: Flat = { pts, closed: false, d: 3, corners: [1, 2, 3], size: [Math.max(...pts.map((a) => a[0])), Math.max(...pts.map((a) => a[1]))] };
    const js = cornerJigs(f);
    expect(js).toHaveLength(3);
    for (const j of js) {
      expect(j.corners).toBe(1);
      expect(j.pegs).toHaveLength(1);
      let tot = 0;
      for (let i = 1; i < j.path.length - 1; i++) {
        const [a, b, c] = [j.path[i - 1], j.path[i], j.path[i + 1]], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
        if (Math.hypot(...u) > 1e-6 && Math.hypot(...v) > 1e-6) tot += Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180 / Math.PI;
      }
      expect(Math.abs(Math.abs(tot) - 150)).toBeLessThan(1);
    }
  });
  it("plate lead: the first untrimmed ball stays in front of the stop for d = 3 mm", () => {
    // a 1.2 mm lead kinked by 90°: the old 1 mm lead ended on the fillet, whose ball (r 1.65) reached behind the stop
    const f: Flat = { pts: [[0, 0], [1.2, 0], [1.2, 50], [60, 50]], closed: false, d: 3, corners: [1, 2], size: [60, 50] };
    const { path: g, lead } = plateGroove(f);
    expect(Math.hypot(g[lead][0] - g[0][0], g[lead][1] - g[0][1])).toBeGreaterThan((3 + 0.3) / 2 + 0.5);
  });
});

describe("coil mandrel", () => {
  /** Design point → mandrel coordinates (axis on z, handle from z = 0). */
  const local = (g: ReturnType<typeof springGeometry>, q: [number, number, number]): [number, number, number] =>
    [q[0] * 1000 - g.c[0], q[1] * 1000 - g.c[1], q[2] * 1000 - g.z0 + g.zs];
  const restack = (segs: Manifold[], g: ReturnType<typeof springGeometry>) => { const zs = pieceBottoms(g.L, g.seg); return M.Manifold.union(segs.map((s, i) => s.translate([0, 0, segs.length > 1 ? zs[i] : 0]))); };
  const area = (m: Manifold, z: number) => m.slice(z).area();

  it("reads the design: diameter, pitch, turns, hand, coil length", () => {
    const { d } = setup("spring", { D: 0.02, pitch: 0.005, d: 0.0015 });
    const g = springGeometry(d), dim = (k: string) => d.dims.find((x) => x.label === k)!.value * 1000;
    expect(2 * g.R).toBeCloseTo(dim("Coil diameter (wire centre)"), 6);
    expect(g.S).toBeCloseTo(dim("Turn spacing (pitch)"), 6);
    expect(g.H).toBeCloseTo(dim("Coil length (axial)"), 6);
    expect(g.wireD).toBeCloseTo(1.5, 9);
    expect(g.hand).toBe(1);
    expect(g.n * g.S).toBeCloseTo(g.H, 6);
  });
  it("close-wound spring (D 6.5 mm): plain mandrel: lower ring, length notch H above the first turn, slides off the top", () => {
    const { d } = setup("spring", { D: 0.0065 });
    const ps = coilParts(d), g = springGeometry(d);
    expect(ps.map((s) => s.id)).toEqual(["coil-mandrel"]);
    expect(ps[0].use).toBe("former");
    expect(ps[0].howTo.map((m) => m.s)).toEqual(BEND_HOWTO.mandrelPlain);
    const segs = ps[0].build(M);
    expect(segs).toHaveLength(1);
    // find the ring's top face and the notch from slices of the part (0.05 mm steps above the handle)
    const core = 2 * g.R - g.wireD - CLEAR, disc = Math.PI * (core / 2) ** 2, at = (z: number) => area(segs[0], z);
    let z = MANDREL_HANDLE + 0.025;
    expect(at(z)).toBeGreaterThan(disc * 1.2);
    while (at(z) > disc * 1.2) z += 0.05;
    const ringTop = z;
    expect(at(ringTop + 0.2)).toBeCloseTo(disc, 0);
    while (at(z) > disc * 0.9) z += 0.05;
    const n0 = z;
    while (at(z) < disc * 0.9) z += 0.05;
    const notch = (n0 + z) / 2;
    // the stretched coil: first turn on the ring, last in the notch, centre to centre = H
    expect(notch - ringTop - g.wireD / 2).toBeGreaterThan(g.H - 0.2);
    expect(notch - ringTop - g.wireD / 2).toBeLessThan(g.H + 0.2);
    expect(z - n0).toBeCloseTo(g.wireD + CLEAR, 0);
    // nothing above the ring is wider than the core: the coil slides off over the top
    const bb = segs[0].trimByPlane([0, 0, 1], ringTop + 0.1).boundingBox();
    for (const k of [0, 1]) { expect(bb.min[k]).toBeGreaterThan(-core / 2 - 1e-6); expect(bb.max[k]).toBeLessThan(core / 2 + 1e-6); }
    expect(bb.max[2]).toBeGreaterThan(notch + 2.5);
    // every design coil point is clear of the core, ring and notch edges, and the straight lead passes the ring's slot
    const pts = d.wires.filter((x) => x.group === "driven").slice(1).map((w) => local(g, w.b));
    for (const q of pts) expect(inside(segs[0], ball(M, q, g.wireD)), `${q}`).toBeLessThan(1e-3);
    const [x0, y0] = local(g, d.wires[0].b);   // wire 0: the lead, straight down from the first turn
    for (const zl of [MANDREL_HANDLE - 1, MANDREL_HANDLE + 1, g.zs - g.wireD]) expect(inside(segs[0], ball(M, [x0, y0, zl], g.wireD)), `lead ${zl}`).toBeLessThan(1e-3);
    expect(buildPart(M, ps[0], "t").ok).toBe(true);
  });
  it("open-pitch spring: grooved mandrel holds every design coil point", () => {
    const { d } = setup("spring", { D: 0.02, pitch: 0.005, d: 0.0015 });
    const [s] = coilParts(d), g = springGeometry(d);
    expect(s.howTo.map((m) => m.s)).toEqual(BEND_HOWTO.mandrel);
    const whole = restack(s.build(M), g);
    const pts = d.wires.filter((x) => x.group === "driven").slice(1).map((w) => local(g, w.b));
    for (const q of pts) {
      expect(inside(whole, ball(M, q, g.wireD)), `clear ${q}`).toBeLessThan(1e-3);
      expect(inside(whole, ball(M, q, g.wireD + 2)), `held ${q}`).toBeGreaterThan(0.01);
    }
    expect(buildPart(M, s, "t").ok).toBe(true);
  }, 60_000);
  it("spring defaults (core 3.4 mm): no mandrel, the build steps name a drill bit", () => {
    const def = ANTENNA_BY_ID.spring, { d } = setup("spring"), W = "Wind the coil on a drill bit or bolt of {0}.";
    expect(coilParts(d)).toEqual([]);
    const w = buildPack(def, def.defaults).steps.find((m) => m.s === W)!;
    expect((w.a![0] as { len: number }).len).toBeCloseTo(0.0045 - 0.0008 - 0.0003, 9);
    // D is found by the dimension's key, not its label
    const relabelled = { ...d, dims: d.dims.map((x) => ({ ...x, label: "?" })) }, w2 = buildPack(def, def.defaults, relabelled).steps.find((m) => m.s === W)!;
    expect((w2.a![0] as { len: number }).len).toBeCloseTo(0.0045 - 0.0008 - 0.0003, 9);
  });
  it("a thin core is cut into pieces no taller than 12 × its diameter", () => {
    const { d } = setup("spring", { D: 0.0065, bands: "144e6-146e6" }), g = springGeometry(d), core = 2 * g.R - g.wireD - CLEAR;
    expect(g.seg).toBeCloseTo(12 * core, 9);
    expect(g.L).toBeGreaterThan(g.seg);
    const [s] = coilParts(d), r = buildPart(M, s, "t");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.segments).toHaveLength(Math.ceil(g.L / g.seg));
      r.segments.forEach((x) => expect(x.size[2]).toBeLessThanOrEqual(g.seg + 8 + 1e-6));
    }
    const whole = restack(s.build(M), g), pts = d.wires.filter((x) => x.group === "driven").slice(1).map((w) => local(g, w.b));
    for (const q of pts) expect(inside(whole, ball(M, q, g.wireD)), `${q}`).toBeLessThan(1e-3);
  }, 60_000);
  it("no mandrel for wire over 3 mm or a core under 5 mm; the build steps then name a drill bit", () => {
    // d = 4 mm needs a pitch above 4.4 mm (spring.build clamps d to 0.9·pitch) and D ≥ 2d
    expect(coilParts(setup("spring", { d: 0.004, pitch: 0.006, D: 0.012 }).d)).toEqual([]);
    const { d } = setup("spring", { D: 0.003 });
    expect(coilParts(d)).toEqual([]);
    const def = ANTENNA_BY_ID.spring, p = { ...def.defaults, D: 0.003 };
    const st = buildPack(def, p, def.build(p)).steps;
    const W = "Wind the coil on a drill bit or bolt of {0}.", w = st.find((m) => m.s === W)!;
    expect((w.a![0] as { len: number }).len).toBeCloseTo(0.003 - 0.0008 - 0.0003, 9);
    expect(en(w)).toBe("Wind the coil on a drill bit or bolt of 1.90 mm.");
    const big = { ...def.defaults, D: 0.0065 };
    expect(coilParts(def.build(big))).toHaveLength(1);
    expect(buildPack(def, big).steps.some((m) => m.s === W)).toBe(false);
    // wire over 3 mm: no mandrel either, so the step is there too
    const q = { ...def.defaults, d: 0.004, pitch: 0.006, D: 0.012 }, t = buildPack(def, q, def.build(q)).steps.find((m) => m.s === W)!;
    expect((t.a![0] as { len: number }).len).toBeCloseTo(0.012 - 0.004, 9);   // a drill bit needs no print clearance
  });
  it("a spring at the turn cap is stacked: several pieces, each within the bed", () => {
    const { d } = setup("spring", { bands: "27e6-27.5e6", D: 0.02, pitch: 0.005, d: 0.0015 });
    const g = springGeometry(d);
    expect(g.n).toBeCloseTo(100, 6);
    const [s] = coilParts(d), r = buildPart(M, s, "t");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.segments.length).toBeGreaterThan(1);
      r.segments.forEach((x) => expect(Math.max(...x.size)).toBeLessThanOrEqual(MAX_SIZE));
    }
    // the groove runs on across the cuts: design points near them are clear once the pieces are put back together
    const whole = restack(s.build(M), g), cuts = pieceBottoms(g.L, g.seg).slice(1);
    const near = d.wires.filter((x) => x.group === "driven").slice(1).map((w) => local(g, w.b)).filter((q) => cuts.some((z) => Math.abs(q[2] - z) < 6));
    expect(near.length).toBeGreaterThan(8);
    for (const q of near) expect(inside(whole, ball(M, q, g.wireD)), `${q}`).toBeLessThan(1e-3);
  }, 120_000);
});
