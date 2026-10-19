import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { ANTENNAS } from "../../antennas";
import type { Params } from "../../types";
import { loadManifold } from "../manifold";
import { buildPart, partsFor } from "..";
import { FAIL } from "../parts";
import { CLEAR, MAX_SIZE } from "../rules";
import { box, rod, type V3 } from "../shapes";
import { feedPoint, envelope, STYLE, styleOf } from "./geometry";
import { SHELL_HOWTO, shellOutline, shellPlan } from "./index";
import { hardwareBox } from "./hardware";
import { quadGeometry } from "../families/spreader";
import { setup } from "../families/testkit";

let M: ManifoldToplevel;
beforeAll(async () => { M = await loadManifold(); });
const wireIds = ANTENNAS.filter((a) => a.category !== "Printed").map((a) => a.id);
const shellOf = (id: string, extra: Params = {}) => { const { p, d } = setup(id, extra); return partsFor(id, p, d).find((s) => s.id === "shell"); };
const sizeOf = (ms: Manifold[]): V3 => {
  const bb = M.Manifold.union(ms).boundingBox();
  return [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
};

describe("shells for wire antennas", () => {
  it("every wire antenna has at most one shell; it exists exactly when the case fits (sky-cones bring their own), and builds at defaults", () => {
    for (const id of wireIds) {
      const { p, d } = setup(id);
      const sh = partsFor(id, p, d).filter((s) => s.id === "shell"), out = shellOutline(id, p, d);
      expect(sh.length, id).toBeLessThanOrEqual(1);
      if (out && "none" in out) expect(sh.length, id).toBe(0);
      else if (out) expect(sh.length, id).toBe(1);
      for (const s of sh) expect(buildPart(M, s, id).ok, id).toBe(true);
    }
  }, 120_000);
  it("kind by size: a 2.4 GHz J-pole is boxed, GPS helix gets a dome; a 7 MHz dipole, a 2 m helix and a Yagi get no case", () => {
    const plan = (id: string, extra = {}) => { const { p, d } = setup(id, extra); return shellPlan(id, p, d).kind; };
    expect(plan("jpole", { bands: "2400e6-2483e6" })).toBe("box");
    expect(plan("helix")).toBe("dome");
    expect(plan("dipole", { bands: "7e6-7.2e6" })).toBe("none");
    expect(plan("helix", { bands: "144e6-146e6" })).toBe("none");
    expect(plan("yagi")).toBe("none");
    expect(shellOf("yagi")).toBeUndefined();
    expect(shellOf("dipole", { bands: "7e6-7.2e6" })).toBeUndefined();
  });
  it("a dome that is too large falls back to the box, else nothing", () => {
    // a cloverleaf at 2.4 GHz is a dome; at 1.2 GHz its radome is wider than the bed
    const { p, d } = setup("cloverleaf", { bands: "432e6-438e6" });
    expect(shellPlan("cloverleaf", p, d).kind).toBe("none");
    const c = setup("cloverleaf", { bands: "5725e6-5875e6" });
    expect(shellPlan("cloverleaf", c.p, c.d).kind).toBe("dome");
  });
  const union = (id: string, p: Params, d: ReturnType<typeof setup>["d"]) => {
    const e = envelope(d), h = hardwareBox(id, p, d);
    return h ? { lo: e.lo.map((v, i) => Math.min(v, h.lo[i])), hi: e.hi.map((v, i) => Math.max(v, h.hi[i])) } : e;
  };
  const SMALL: [string, Params][] = [
    ["jpole", { bands: "2400e6-2483e6" }], ["biquad", {}], ["dipole", { bands: "2400e6-2483e6" }], ["dipole", { bands: "5725e6-5875e6" }],
    ["groundplane", { bands: "2400e6-2483e6" }], ["groundplane", { bands: "5725e6-5875e6" }], ["fandipole", { bands: "2400e6-2483e6;5725e6-5875e6" }],
    ["moxon", { bands: "2400e6-2483e6" }], ["quad", { bands: "2400e6-2483e6" }],
    ["collinear", { bands: "5742e6-5858e6" }], ["discone", { bands: "2000e6-6000e6" }],
  ];
  it("small antennas get a box: outer size = (wires ∪ printed hardware) + 2·(gap + wall) in every axis", () => {
    for (const [id, extra] of SMALL) {
      const { p, d } = setup(id, extra), plan = shellPlan(id, p, d), tag = `${id} ${JSON.stringify(extra)}`;
      const u = union(id, p, d), { gap, wall } = STYLE[styleOf(d)];
      if (plan.kind === "dome") continue;                                   // a dome encloses the hub itself
      expect(plan.kind, tag).toBe("box");
      const spec = partsFor(id, p, d).find((q) => q.id === "shell")!, s = sizeOf(spec.build(M));
      for (let i = 0; i < 3; i++) expect(Math.abs(s[i] - (u.hi[i] - u.lo[i] + 2 * (gap + wall))), `${tag} axis ${i}`).toBeLessThan(0.5);
      const out = shellOutline(id, p, d)!;
      if ("none" in out) throw new Error(tag);
      for (let i = 0; i < 3; i++) expect(Math.abs(out.hi[i] - out.lo[i] - s[i]), `${tag} outline ${i}`).toBeLessThan(0.5);
    }
  });
  it("the 2.4 GHz dipole and the 5.8 GHz ground plane get a case; the hardware stays in the cavity, clear of the walls", () => {
    for (const [id, extra] of [["dipole", { bands: "2400e6-2483e6" }], ["groundplane", { bands: "5725e6-5875e6" }]] as const) {
      const { p, d } = setup(id, extra), plan = shellPlan(id, p, d), hw = hardwareBox(id, p, d)!;
      expect(plan.kind, id).toBe("box");
      if (plan.kind !== "box") continue;
      for (let i = 0; i < 3; i++) { expect(hw.lo[i] - plan.inner.lo[i], id).toBeGreaterThanOrEqual(1 - 1e-9); expect(plan.inner.hi[i] - hw.hi[i], id).toBeGreaterThanOrEqual(1 - 1e-9); }
    }
  });
  it("the discone radome is wide enough for its hub", () => {
    const { p, d } = setup("discone", { bands: "2000e6-6000e6" }), pl = shellPlan("discone", p, d);
    expect(pl.kind).toBe("dome");
    if (pl.kind === "dome") expect(pl.opts.r).toBeGreaterThanOrEqual(hardwareBox("discone", p, d)!.hi[0] + 1 - 1e-9);
  });
  it("hardware beyond the bed (a 145 MHz dipole, GP, Moxon, quad; a Yagi at any band) gets no case", () => {
    for (const [id, bands] of [["dipole", "144e6-146e6"], ["groundplane", "144e6-146e6"], ["yagi", "144e6-146e6"], ["yagi", "2400e6-2483e6"], ["yagi", "5725e6-5875e6"], ["moxon", "144e6-146e6"], ["quad", "144e6-146e6"]] as const) {
      const { p, d } = setup(id, { bands });
      expect(shellPlan(id, p, d).kind, `${id} ${bands}`).toBe("none");
      expect(partsFor(id, p, d).some((q) => q.id === "shell"), `${id} ${bands}`).toBe(false);
    }
  });
  it("the case is tight: 1 mm gap, 1.2 mm (FPV) / 1.6 mm (outdoor) wall; no screw ears", () => {
    const fpv = setup("jpole", { bands: "2400e6-2483e6" }).d, out = setup("jpole", { bands: "430e6-440e6" }).d;
    expect(STYLE[styleOf(fpv)]).toEqual({ wall: 1.2, gap: 1 });
    expect(STYLE[styleOf(out)]).toEqual({ wall: 1.6, gap: 1 });
    for (const st of Object.values(SHELL_HOWTO).flat()) expect(st).not.toMatch(/screws and nuts|M3 screws and nuts/);
    expect(SHELL_HOWTO.box.join(" ")).toMatch(/Press the top half/);
  });
  it("full shells keep the gap from every live wire", () => {
    for (const [id, extra] of [["jpole", { bands: "2400e6-2483e6" }], ["helix", {}], ["helix", { bands: "5725e6-5875e6", d: 1e-3, turns: 5 }], ["collinear", { bands: "5742e6-5858e6" }], ["biquad", {}] ] as const) {
      const { p, d } = setup(id, extra);
      const plan = shellPlan(id, p, d);
      if (plan.kind === "none") continue;
      const shell = M.Manifold.union(partsFor(id, p, d).find((s) => s.id === "shell")!.build(M).map((s, i, all) => s.translate([0, 0, plan.pieceZ?.(i, all.length) ?? 0])).map((s) => s.translate(plan.toWorld ?? [0, 0, 0])));
      // the 1 mm gap, less the tongue that stands up to 0.5 mm inside the wall: at least CLEAR of air round every wire
      for (const w of d.wires.filter((x) => !x.drawOnly && !x.necOnly)) {
        const a = w.a.map((v) => v * 1000) as V3, b = w.b.map((v) => v * 1000) as V3;
        expect(shell.intersect(rod(M, a, b, 2 * w.r * 1000 + 2 * (CLEAR - 0.02))).volume(), `${id} wire`).toBeLessThan(1e-2);
      }
    }
  }, 120_000);
  it("full boxes: the coax hole goes through the floor only, the walls stay closed", () => {
    for (const [id, extra] of [["jpole", { bands: "2400e6-2483e6" }], ["biquad", {}], ["collinear", { bands: "5742e6-5858e6" }]] as const) {
      const { p, d } = setup(id, extra);
      const plan = shellPlan(id, p, d);
      expect(plan.kind, id).toBe("box");
      if (plan.kind !== "box") continue;
      const wall = STYLE[styleOf(d)].wall, i = plan.inner, g = plan.gland;
      const shell = M.Manifold.union(partsFor(id, p, d).find((s) => s.id === "shell")!.build(M));
      const o = { lo: i.lo.map((v) => v - wall) as V3, hi: i.hi.map((v) => v + wall) as V3 };
      expect(g[0] - 1.75, id).toBeGreaterThanOrEqual(o.lo[0] - 1e-9); expect(g[0] + 1.75, id).toBeLessThanOrEqual(o.hi[0] + 1e-9);
      expect(g[1] - 1.75, id).toBeGreaterThanOrEqual(o.lo[1] - 1e-9); expect(g[1] + 1.75, id).toBeLessThanOrEqual(o.hi[1] + 1e-9);
      expect(shell.intersect(rod(M, [g[0], g[1], o.lo[2] - 5], [g[0], g[1], i.lo[2] + 0.5], 3.4)).volume(), id).toBeLessThan(1e-2);
      // side walls: the outer 0.4 mm skin is solid all round
      const skin = box(M, [o.lo[0], o.lo[1], i.lo[2]], [o.hi[0], o.hi[1], i.hi[2]]).subtract(box(M, [o.lo[0] + 0.4, o.lo[1] + 0.4, i.lo[2] - 1], [o.hi[0] - 0.4, o.hi[1] - 0.4, i.hi[2] + 1]));
      expect(shell.intersect(skin).volume() / skin.volume(), id).toBeGreaterThan(0.99);
    }
  });
});

describe("shellOutline", () => {
  it("agrees with the built shell within 0.5 mm for every def that has one, at defaults and across the bands", () => {
    const FREQS = [undefined, 145e6, 435e6, 868e6, 1.2e9, 2.4e9, 5.8e9];
    for (const def of ANTENNAS) for (const f of FREQS) {
      const extra: Params = f ? { bands: `${f * 0.99}-${f * 1.01}` } : {};
      if (f && !def.params.some((q) => q.key === "bands")) continue;
      const { p, d } = setup(def.id, extra), out = shellOutline(def.id, p, d), tag = `${def.id} ${f ?? "default"}`;
      const spec = partsFor(def.id, p, d).find((s) => s.id === "shell");
      if (out === null) continue;                                             // the family's own cover
      if ("none" in out) { expect(spec, tag).toBeUndefined(); continue; }
      expect(spec, tag).toBeDefined();
      const r = buildPart(M, spec!, def.id);
      if (!r.ok) continue;                                                    // reported cleanly (checked elsewhere)
      const segs = spec!.build(M), s = sizeOf(segs);
      const w: V3 = [out.hi[0] - out.lo[0], out.hi[1] - out.lo[1], out.hi[2] - out.lo[2]];
      if (out.kind === "box") for (let i = 0; i < 3; i++) expect(Math.abs(s[i] - w[i]), `${tag} axis ${i}: ${s[i]} vs ${w[i]}`).toBeLessThan(0.5);
      else {
        // stacked pieces: the skirts of the upper pieces reach (wall + CLEAR) past the wall; heights add up with the overlap
        const slack = segs.length > 1 ? 2 * (out.wall + 0.3) + 0.5 : 0.5;
        expect(Math.abs(s[0] - w[0]), `${tag} x`).toBeLessThan(slack); expect(Math.abs(s[1] - w[1]), `${tag} y`).toBeLessThan(slack);
        if (segs.length === 1) expect(Math.abs(s[2] - w[2]), `${tag} z`).toBeLessThan(0.5);
        expect(out.round!.r, tag).toBeGreaterThan(0);
        expect(out.round!.apex, tag).toBeCloseTo(out.hi[2], 6);
      }
      for (const v of w) expect(v, tag).toBeLessThanOrEqual(segs.length > 1 && out.kind === "dome" ? 3 * MAX_SIZE : MAX_SIZE + 1e-6);
    }
  }, 300_000);
  it("is pure: no manifold needed, and `none` carries the reason", () => {
    const { p, d } = setup("yagi");
    expect(shellOutline("yagi", p, d)).toEqual({ none: "too large" });
    const j = setup("jpole", { bands: "2400e6-2483e6" });
    const o = shellOutline("jpole", j.p, j.d);
    expect(o && !("none" in o) && o.kind).toBe("box");
    expect(shellOutline("skycone8", ...(() => { const s = setup("skycone8"); return [s.p, s.d] as const; })())).toBeNull();
  });
});

/** World-frame family parts that sit inside or next to the antenna, moved from their own build frame: a full box must
 *  keep them outside its walls. */
const WORLD: Record<string, (q: Manifold, d: ReturnType<typeof setup>["d"]) => Manifold[]> = {
  "dipole-centre": (q) => [q], "fan-centre": (q) => [q], "fan-spreader-1": (q) => [q, q.mirror([0, 1, 0])], "fan-spreader-2": (q) => [q, q.mirror([0, 1, 0])], "gp-hub": (q) => [q], "discone-hub": (q) => [q], "helix-tube": (q) => [q], "helix-frame": (q) => [q],
  "yagi-driven": (q, d) => [q.translate(feedPoint(d))],
  "biquad-standoff": (q) => [q.transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1])],   // its print frame (z up from the reflector) back to x up
  "moxon-hub": (q) => [q],
  "quad-hub": (q, d) => quadGeometry(d).loops.map((l) => q.translate([l.x, 0, 0])),   // one per loop
};
const FREQS = [50e6, 145e6, 435e6, 868e6, 1.2e9, 2.4e9, 5.8e9];
const ALLOWED = ["Too large to print in one piece: {0}", FAIL.thick, FAIL.radome];

describe("shells across the frequency range", () => {
  it("every wire antenna × 50 MHz … 5.8 GHz: no shell, or one that builds within 180 mm and clear of world-frame family parts", () => {
    for (const id of wireIds) for (const f of FREQS) {
      const { p, d } = setup(id, { bands: `${f * 0.99}-${f * 1.01}` });
      const tag = `${id} ${f / 1e6} MHz`, plan = shellPlan(id, p, d), specs = partsFor(id, p, d), spec = specs.find((s) => s.id === "shell");
      if (!spec) { if (!id.startsWith("skycone")) expect(plan.kind, tag).toBe("none"); continue; }
      const r = buildPart(M, spec, id);
      if (!r.ok) { expect(ALLOWED, `${tag} ${r.error.s} ${JSON.stringify(r.error.a)}`).toContain(r.error.s); continue; }
      for (const g of r.segments) expect(Math.max(...g.size), tag).toBeLessThanOrEqual(MAX_SIZE + 1e-6);
      const shell = spec.build(M);
      if (plan.kind === "box") {
        for (const s of specs.filter((q) => WORLD[q.id])) {
          let parts: Manifold[];
          try { parts = s.build(M); } catch { continue; }                     // a family part that cannot be built here
          for (const q of parts.flatMap((x) => WORLD[s.id](x, d))) expect(shell.reduce((a, h) => a + h.intersect(q).volume(), 0), `${tag} ${s.id}`).toBeLessThan(1e-2);
        }
      }
    }
  }, 300_000);
});
