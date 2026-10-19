import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "./index";
import { SKYCONE_8, SKYCONE_W16, SKYCONE_A55, SKYCONE_B44, SKYCONE_S40, SKYCONE_W40, SKYCONE_W65 } from "./skycone.data";
import { SKYCONE_TABLES, baseWire, cageFrames, coilLimit, hubFor, skyconeCurrents, skyconeGain, skyconeZ, tableAt } from "./skycone";
import { buildPack } from "../build";
import { radiationEligible, s11, simulate } from "../simulate";
import { partsFor } from "../print";
import { templatePages } from "../template";

// Reference: docs/FPV-DETECTOR-ANTENNA.md (design B_simple and design A, body-of-revolution MoM, no cable).
const dim = (id: string, bands: string, label: string) => ANTENNA_BY_ID[id].build({ bands }).dims.find((d) => d.label === label)!.value;

describe("sky-tilted capped bicones", () => {
  it("8:1 at 800 MHz is design B: Ø113 × 110 mm, the doc's cut list", () => {
    const d = ANTENNA_BY_ID.skycone8.build({ bands: "800e6-6400e6" });
    expect(dim("skycone8", "800e6-6400e6", "Overall height") * 1e3).toBeCloseTo(110.2, 1);
    expect(dim("skycone8", "800e6-6400e6", "Ground cone diameter") * 1e3).toBeCloseTo(113, 1);
    const sectors = d.sheets!.filter((s) => s.kind === "sector").map((s) => (s.kind === "sector" ? +s.angle.toFixed(1) : 0));
    expect(sectors).toEqual([285.6, 203.9, 336.1]);
  });

  it("21:1 at 300 MHz is design A: Ø275 × 294 mm", () => {
    expect(dim("skycone21", "300e6-6400e6", "Overall height") * 1e3).toBeCloseTo(294.2, 1);
    expect(dim("skycone21", "300e6-6400e6", "Hot element diameter") * 1e3).toBeCloseTo(274.7, 1);
  });

  it("compact 6.7:1 at 960 MHz is design S73: Ø73 × 71 mm, SWR < 2, a ferrite sleeve", () => {
    const def = ANTENNA_BY_ID.skycone7, p = { bands: "960e6-6400e6" }, d = def.build(p);
    expect(dim("skycone7", "960e6-6400e6", "Overall height") * 1e3).toBeCloseTo(71.0, 0);
    expect(dim("skycone7", "960e6-6400e6", "Hot element diameter") * 1e3).toBeCloseTo(73.1, 0);
    const r = simulate(def, p, d);
    expect(Math.max(...r.z.filter((q) => q.f >= 960e6 && q.f <= 6.4e9).map((q) => s11(q, 50).swr))).toBeLessThan(2);
    expect(d.notes.some((n) => n.startsWith("Ferrite sleeve required"))).toBe(true);
    const parts = partsFor("skycone7", def.defaults, d);
    expect(parts.map((q) => q.id)).toEqual(expect.arrayContaining(["shell", "skycone-cup", "skycone-handle", "skycone-former", "skycone-tpl-1"]));
    expect(parts.find((q) => q.id === "skycone-handle")!.purpose.s).toContain("ferrite sleeve");
  });

  it("wire cage at 960 MHz is design W16: the NEC-2 model's 280 wires, Ø71.5 × 74.7 mm, SWR < 2, frames and jigs", () => {
    const def = ANTENNA_BY_ID.skyconecage, p = { bands: "960e6-6400e6" }, d = def.build(p);
    // tools/wideband-antenna/wirecage.py at 16 frames of Ø1 mm: 128 frame wires, 144 hoop chords, 8 hub spokes (+ the pin gap)
    const live = d.wires.filter((w) => !w.drawOnly);
    expect(live.length).toBe(281);
    expect(live.reduce((a, w) => a + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1], w.b[2] - w.a[2]), 0) * 1e3).toBeCloseTo(3146.0, 0);
    expect(dim("skyconecage", "960e6-6400e6", "Overall height") * 1e3).toBeCloseTo(74.7, 1);
    expect(dim("skyconecage", "960e6-6400e6", "Hot element diameter") * 1e3).toBeCloseTo(71.5, 1);
    expect(d.necSupported).toBe(true);
    const r = simulate(def, p, d);
    expect(r.method).toBe("analytic");
    expect(Math.max(...r.z.filter((q) => q.f >= 960e6 && q.f <= 6.4e9).map((q) => s11(q, 50).swr))).toBeLessThan(2);
    expect(d.cuts!.find((c) => c.what.startsWith("Hot frame"))).toMatchObject({ qty: 16 });
    expect(d.cuts!.find((c) => c.what.startsWith("Hot frame"))!.length * 1e3).toBeCloseTo(86.4, 0);
    const parts = partsFor("skyconecage", def.defaults, d).map((q) => q.id);
    expect(parts).toEqual(expect.arrayContaining(["shell", "skycone-cup", "skycone-handle", "skycone-bend", "skycone-cradle", "skycone-hoops"]));
    expect(parts).not.toContain("skycone-former");
    // the hoops sit against the frames on the outside: centre one wire diameter (1 mm) from the frame's centre line
    const dist = (q: [number, number], p: [number, number][]) => Math.min(...p.slice(1).map((b, i) => {
      const a = p[i], ab = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)));
      return Math.hypot(q[0] - a[0] - t * ab[0], q[1] - a[1] - t * ab[1]);
    }));
    const fr = d.frames!;
    expect([...fr.hoops.hot.map((q) => dist(q, fr.hot)), ...fr.hoops.ground.map((q) => dist(q, fr.ground))].map((x) => +(x * 1e3).toFixed(3))).toEqual(Array(7).fill(1));
    expect(fr.hoops.hot.every((q) => q[0] > 0 && q[1] < 0.0624)).toBe(true);
    expect(partsFor("skyconecage", def.defaults, d).find((q) => q.id === "skycone-hoops")!.purpose.a).toEqual([7]);   // every hoop has its own size                  // trapped inside the cage by the lid hoops
    expect(templatePages(def, d, false).length).toBe(1);
    // Radiation view: the current sits on the 16 frames
    expect(skyconeCurrents("skyconecage", d)!.els.length).toBe(16 * SKYCONE_W16.cur.seg.length);
  });

  it("small wire cage at 960 MHz is design W65: the NEC-2 model's 314 wires with one shorting wire, Ø65 × 65 mm, SWR < 2", () => {
    const def = ANTENNA_BY_ID.skyconecagemini, p = { bands: "960e6-6400e6" }, d = def.build(p);
    // tools/wideband-antenna/family10.py wire_list(): 160 frame wires (every frame has the shorting wire's nodes),
    // 144 hoop chords, 8 hub spokes, the shorting wire and the pin gap
    const live = d.wires.filter((w) => !w.drawOnly);
    expect(live.length).toBe(314);
    expect(live.reduce((a, w) => a + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1], w.b[2] - w.a[2]), 0) * 1e3).toBeCloseTo(2972.2, 0);
    expect(dim("skyconecagemini", "960e6-6400e6", "Overall height") * 1e3).toBeCloseTo(64.9, 1);
    expect(dim("skyconecagemini", "960e6-6400e6", "Ground cone diameter") * 1e3).toBeCloseTo(65.1, 1);
    expect(dim("skyconecagemini", "960e6-6400e6", "Shorting wire length") * 1e3).toBeCloseTo(9.8, 1);
    // one shorting wire, vertical, on frame 8, from the hot frame's node down to the ground frame's node
    const sh = live.filter((w) => w.tag === "S");
    expect(sh.length).toBe(1);
    expect(Math.hypot(sh[0].a[0], sh[0].a[1]) * 1e3).toBeCloseTo(11.12, 2);
    expect(Math.atan2(sh[0].a[1], sh[0].a[0])).toBeCloseTo(Math.PI, 6);
    const ends = [sh[0].a, sh[0].b];
    expect(ends.every((e) => live.some((w) => w !== sh[0] && w.group !== "feed" && [w.a, w.b].some((q) => Math.hypot(q[0] - e[0], q[1] - e[1], q[2] - e[2]) < 1e-9)))).toBe(true);
    const r = simulate(def, p, d);
    expect(r.method).toBe("analytic");
    expect(Math.max(...r.z.filter((q) => q.f >= 960e6 && q.f <= 6.4e9).map((q) => s11(q, 50).swr))).toBeLessThan(1.9);
    expect(d.cuts!.find((c) => c.what.startsWith("Shorting wire"))).toMatchObject({ qty: 1 });
    expect(d.frames!.short![0].hot[0] * 1e3).toBeCloseTo(11.12, 2);
    expect(d.frames!.hoops.hot.length + d.frames!.hoops.ground.length).toBe(7);   // no hoop at the shorting wire's nodes
    expect(d.notes.some((n) => n.startsWith("The shorting wire is a DC short"))).toBe(true);
    expect(templatePages(def, d, false).length).toBe(1);
    const parts = partsFor("skyconecagemini", def.defaults, d).map((q) => q.id);
    expect(parts).toEqual(expect.arrayContaining(["shell", "skycone-cup", "skycone-bend", "skycone-cradle", "skycone-hoops"]));
    // Radiation view: rings on the 16 frames, plus the shorting wire's own segments
    const k = SKYCONE_W65.cage!.short!.k;
    expect(k).toBeGreaterThan(0);
    expect(skyconeCurrents("skyconecagemini", d)!.els.length).toBe(16 * (SKYCONE_W65.cur.seg.length - k) + k);
  });

  it("mini wire cage at 1.4 GHz is design W40: the same 314-wire topology at Ø39 × 40 mm, SWR ≤ 2.1 over 1.4–6.4 GHz", () => {
    const def = ANTENNA_BY_ID.skyconecage40, p = { bands: "1400e6-6400e6" }, d = def.build(p);
    // tools/wideband-antenna/family13.py (designs/W40.json): wire_list() gives 314 wires, 1806.9 mm
    const live = d.wires.filter((w) => !w.drawOnly);
    expect(live.length).toBe(314);
    expect(live.reduce((a, w) => a + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1], w.b[2] - w.a[2]), 0) * 1e3).toBeCloseTo(1806.9, 0);
    expect(dim("skyconecage40", "1400e6-6400e6", "Overall height") * 1e3).toBeCloseTo(39.8, 1);
    expect(dim("skyconecage40", "1400e6-6400e6", "Hot element diameter") * 1e3).toBeCloseTo(36.5, 1);
    expect(dim("skyconecage40", "1400e6-6400e6", "Ground cone diameter") * 1e3).toBeCloseTo(39.3, 1);
    expect(dim("skyconecage40", "1400e6-6400e6", "Shorting wire length") * 1e3).toBeCloseTo(10.39, 1);
    const sh = live.filter((w) => w.tag === "S");
    expect(sh.length).toBe(1);
    expect(Math.hypot(sh[0].a[0], sh[0].a[1]) * 1e3).toBeCloseTo(6.92, 2);
    const r = simulate(def, p, d);
    expect(r.method).toBe("analytic");
    expect(Math.max(...r.z.filter((q) => q.f >= 1.4e9 && q.f <= 6.4e9).map((q) => s11(q, 50).swr))).toBeLessThan(2.15);
    expect(d.frames!.hoops.hot.length + d.frames!.hoops.ground.length).toBe(7);
    expect(d.notes.some((n) => n.includes("sphere of radius 28 mm"))).toBe(true);
    expect(templatePages(def, d, false).length).toBe(1);
    const parts = partsFor("skyconecage40", def.defaults, d).map((q) => q.id);
    expect(parts).toEqual(expect.arrayContaining(["shell", "skycone-cup", "skycone-bend", "skycone-cradle", "skycone-hoops"]));
    const k = SKYCONE_W40.cage!.short!.k;
    expect(skyconeCurrents("skyconecage40", d)!.els.length).toBe(16 * (SKYCONE_W40.cur.seg.length - k) + k);
  });

  it("mini sheet metal at 1.4 GHz is design S40: W40's profile in sheet + one Ø1 mm shorting wire, SWR < 2 over 1.4–6.4 GHz", () => {
    const def = ANTENNA_BY_ID.skycone40, p = { bands: "1400e6-6400e6" }, d = def.build(p);
    // tools/wideband-antenna/designs/S40.json (W40 with shr 0.27): the wire 8.0 mm from the axis, z −0.6 → 12.6 mm
    expect(dim("skycone40", "1400e6-6400e6", "Overall height") * 1e3).toBeCloseTo(39.8, 1);
    expect(dim("skycone40", "1400e6-6400e6", "Ground cone diameter") * 1e3).toBeCloseTo(39.3, 1);
    expect(dim("skycone40", "1400e6-6400e6", "Shorting wire length") * 1e3).toBeCloseTo(13.19, 1);
    const sh = d.wires.filter((w) => w.tag === "S");
    expect(sh.length).toBe(1);
    expect(Math.hypot(sh[0].a[0], sh[0].a[1]) * 1e3).toBeCloseTo(8.04, 2);
    expect(sh[0].r * 2e3).toBeCloseTo(1, 6);
    expect(d.sheets!.length).toBeGreaterThan(3);
    expect(d.cuts).toHaveLength(1);
    const r = simulate(def, p, d);
    expect(r.notes.some((n) => n.includes("sheet metal with a shorting wire"))).toBe(true);
    expect(Math.max(...r.z.filter((q) => q.f >= 1.4e9 && q.f <= 6.4e9).map((q) => s11(q, 50).swr))).toBeLessThan(2.0);
    // half the size at 2.8 GHz: the wire Ø is a param now (absolute); half of it is the reference wire again
    const hd = def.build({ bands: "2800e6-12800e6", d: 0.5e-3 }), h = hd.wires.find((w) => w.tag === "S")!;
    expect(h.r).toBeCloseTo(sh[0].r / 2, 9);
    expect(hd.skyconeWire!.dRef).toBe(1e-3);
    const pack = buildPack(def, def.defaults);
    expect(pack.steps.some((x) => x.s.startsWith("Last, with the hot element on the centre pin"))).toBe(true);
    expect(pack.bom.some((x) => x.item.s.startsWith("Brass or copper sheet"))).toBe(true);
    const parts = partsFor("skycone40", def.defaults, d).map((q) => q.id);
    expect(parts).toEqual(expect.arrayContaining(["shell", "skycone-cup"]));
    const c = skyconeCurrents("skycone40", d)!, k = SKYCONE_S40.short!.k;
    expect(c.els.length).toBe(12 * (SKYCONE_S40.cur.seg.length - k) + k);
  });

  it("mini wire cage for 1.36–7 GHz is design B44f: the same 314-wire topology at Ø43 × 44 mm, SWR ≤ 1.75", () => {
    const def = ANTENNA_BY_ID.skyconecage44, p = { bands: "1360e6-7000e6" }, d = def.build(p);
    // tools/wideband-antenna/family13.py (designs/B44f.json): wire_list() gives 314 wires, 2018.4 mm
    const live = d.wires.filter((w) => !w.drawOnly);
    expect(live.length).toBe(314);
    expect(live.reduce((a, w) => a + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1], w.b[2] - w.a[2]), 0) * 1e3).toBeCloseTo(2018.4, 0);
    expect(dim("skyconecage44", "1360e6-7000e6", "Overall height") * 1e3).toBeCloseTo(43.8, 1);
    expect(dim("skyconecage44", "1360e6-7000e6", "Hot element diameter") * 1e3).toBeCloseTo(43.1, 1);
    expect(dim("skyconecage44", "1360e6-7000e6", "Ground cone diameter") * 1e3).toBeCloseTo(42.4, 1);
    expect(dim("skyconecage44", "1360e6-7000e6", "Shorting wire length") * 1e3).toBeCloseTo(8.85, 1);
    const sh = live.filter((w) => w.tag === "S");
    expect(sh.length).toBe(1);
    expect(Math.hypot(sh[0].a[0], sh[0].a[1]) * 1e3).toBeCloseTo(8.04, 2);
    const r = simulate(def, p, d);
    expect(r.method).toBe("analytic");
    expect(Math.max(...r.z.filter((q) => q.f >= 1.36e9 && q.f <= 7.0e9).map((q) => s11(q, 50).swr))).toBeLessThan(1.8);
    expect(d.frames!.hoops.hot.length + d.frames!.hoops.ground.length).toBe(7);
    expect(d.notes.some((n) => n.includes("choke sleeve"))).toBe(true);
    expect(d.notes.some((n) => n.includes("Ferrite sleeve required"))).toBe(false);
    expect(templatePages(def, d, false).length).toBe(1);
    const parts = partsFor("skyconecage44", def.defaults, d).map((q) => q.id);
    expect(parts).toEqual(expect.arrayContaining(["shell", "skycone-cup", "skycone-bend", "skycone-cradle", "skycone-hoops"]));
    const kb = SKYCONE_B44.cage!.short!.k;
    expect(skyconeCurrents("skyconecage44", d)!.els.length).toBe(16 * (SKYCONE_B44.cur.seg.length - kb) + kb);
  });

  it("low-band wire cage is design A55: two coiled shorting wires, two capacitors, Ø51 × 54 mm, SWR ≤ 1.9 over 0.96–1.36 GHz", () => {
    const def = ANTENNA_BY_ID.skyconecage55, p = { bands: "960e6-1360e6" }, d = def.build(p);
    // tools/wideband-antenna/family13.py (designs/A55.json): wire_list() gives 333 wires, 2238.3 mm; the coil 37.39 mm
    const live = d.wires.filter((w) => !w.drawOnly);
    expect(live.length).toBe(333);
    expect(live.reduce((a, w) => a + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1], w.b[2] - w.a[2]), 0) * 1e3).toBeCloseTo(2238.3, 0);
    expect(dim("skyconecage55", "960e6-1360e6", "Overall height") * 1e3).toBeCloseTo(54.1, 1);
    expect(dim("skyconecage55", "960e6-1360e6", "Hot element diameter") * 1e3).toBeCloseTo(51.0, 1);
    expect(dim("skyconecage55", "960e6-1360e6", "Ground cone diameter") * 1e3).toBeCloseTo(51.3, 1);
    expect(d.cuts!.find((c) => c.what.startsWith("Shorting wire"))!.length * 1e3).toBeCloseTo(37.39, 1);   // the coil's wire (no dimension line: it is not a span)
    const sh = live.filter((w) => w.tag === "S");
    expect(sh.length).toBe(1);
    expect(Math.hypot(sh[0].a[0], sh[0].a[1]) * 1e3).toBeCloseTo(10.17, 2);
    const r = simulate(def, p, d);
    expect(r.method).toBe("analytic");
    expect(Math.max(...r.z.filter((q) => q.f >= 0.96e9 && q.f <= 1.36e9).map((q) => s11(q, 50).swr))).toBeLessThan(1.95);
    expect(d.frames!.hoops.hot.length + d.frames!.hoops.ground.length).toBe(7);
    const caps = d.tables.find((tb) => tb.title.startsWith("Capacitors"))!;
    expect(caps.rows.map((row) => row[2])).toEqual([2.2, 3.6]);
    expect(d.cuts!.find((c) => c.what.startsWith("Shorting wire"))!.qty).toBe(2);
    expect(d.notes.some((n) => n.includes("two metal tubes"))).toBe(true);
    expect(templatePages(def, d, false).length).toBe(1);
    const parts = partsFor("skyconecage55", def.defaults, d).map((q) => q.id);
    expect(parts).toEqual(expect.arrayContaining(["shell", "skycone-cup", "skycone-bend", "skycone-cradle", "skycone-hoops"]));
    expect(skyconeCurrents("skyconecage55", d)!.els.length).toBe(16 * SKYCONE_A55.cur.seg.length);
  });

  it("the tabulated sweep: SWR ≤ 1.4 over 800 MHz – 6.4 GHz, beam above the horizon", () => {
    const def = ANTENNA_BY_ID.skycone8, p = { bands: "800e6-6400e6" };
    const r = simulate(def, p, def.build(p));
    expect(r.method).toBe("analytic");
    expect(r.z.length).toBeGreaterThan(40);
    expect(Math.max(...r.z.map((q) => s11(q, 50).swr))).toBeLessThan(1.4);
    expect(r.pattern!.max.theta).toBeLessThan(90);   // peak above the horizon
  });

  it("scales exactly: twice the frequency, half the size, the same SWR", () => {
    expect(dim("skycone8", "1600e6-12800e6", "Overall height") * 2).toBeCloseTo(dim("skycone8", "800e6-6400e6", "Overall height"), 9);
    for (const f of [900e6, 2.4e9, 5.8e9]) {
      const a = skyconeZ(SKYCONE_8, 800e6, f)!, b = skyconeZ(SKYCONE_8, 1600e6, 2 * f)!;
      expect(b.r).toBeCloseTo(a.r, 9);
      expect(b.x).toBeCloseTo(a.x, 9);
    }
  });

  it("interpolation returns the table rows at the table frequencies", () => {
    const i = 20, f = SKYCONE_8.f[i] * 800e6;
    expect(skyconeZ(SKYCONE_8, 800e6, f)!.r).toBeCloseTo(SKYCONE_8.r[i], 6);
    const el = 30, j = SKYCONE_8.els.indexOf(el);
    expect(skyconeGain(SKYCONE_8, 800e6, f)(((90 - el) * Math.PI) / 180)).toBeCloseTo(SKYCONE_8.g[i][j], 6);
    expect(skyconeZ(SKYCONE_8, 800e6, 100e6)).toBeNull();
  });

  it("the build sheet carries the 1:1 flat patterns", () => {
    const def = ANTENNA_BY_ID.skycone8, d = def.build(def.defaults);
    expect(templatePages(def, d, false).length).toBeGreaterThan(1);
  });

  it("Radiation view: rings of the solved surface current, scaled with the size", () => {
    const def = ANTENNA_BY_ID.skycone8, d = def.build(def.defaults);
    expect(radiationEligible("skycone8", d)).toBe(true);
    const c = skyconeCurrents("skycone8", d)!;
    expect(c.els.length).toBe(12 * SKYCONE_8.cur.seg.length);
    expect(c.els.every((e) => Number.isFinite(e.cr) && Number.isFinite(e.ci))).toBe(true);
    const zmax = Math.max(...c.els.map((e) => e.mid[2]));
    expect(zmax).toBeCloseTo(0.089, 2);                                 // up to the lid at 89 mm
    const half = skyconeCurrents("skycone8", def.build({ bands: "1600e6-12800e6" }))!;
    expect(Math.max(...half.els.map((e) => e.mid[2]))).toBeCloseTo(zmax / 2, 6);
  });

  it("print kit: B gets every part in one piece each; A's cover comes in glued pieces", () => {
    const ids = (id: string) => { const def = ANTENNA_BY_ID[id]; return partsFor(id, def.defaults, def.build(def.defaults)).map((p) => p.id); };
    expect(ids("skycone8")).toEqual(expect.arrayContaining(["shell", "skycone-cup", "skycone-handle", "skycone-stand", "skycone-former", "skycone-wedge", "skycone-fork", "skycone-tpl-1"]));
    expect(ids("skycone21")).toContain("shell");
    expect(ids("skycone21")).not.toContain("skycone-cup");               // Ø279 mm: larger than the bed
  });
});

describe("coax below the antenna: ferrite, choke tubes or a bare cable", () => {
  const worst = (id: string, coax: string) => {
    const def = ANTENNA_BY_ID[id], p = { ...def.defaults, coax }, d = def.build(p), r = simulate(def, p, d);
    const [a, b] = [d.sweeps[0].start, d.sweeps[0].stop];
    return { d, r, swr: Math.max(...r.z.filter((q) => q.f >= a && q.f <= b).map((q) => s11(q, 50).swr)) };
  };

  it("every type has a bare-cable table: 0.5, 0.8 and 1.1 λ at fLo on its own grid from 0.9 fLo", () => {
    for (const [id, t] of Object.entries(SKYCONE_TABLES)) {
      expect(t.bare, id).toBeDefined();
      expect(t.bare!.lensLam, id).toEqual([0.5, 0.8, 1.1]);
      for (const row of [...t.bare!.r, ...t.bare!.x]) expect(row, id).toHaveLength(t.bare!.f.length);
      expect(t.bare!.f[0], id).toBeCloseTo(0.9, 3);
    }
  });

  it("as designed by default: the free-space table, the study's ferrite or choke in the parts list", () => {
    for (const id of Object.keys(SKYCONE_TABLES)) {
      const def = ANTENNA_BY_ID[id], d = def.build(def.defaults);
      expect(d.coax!.choke, id).not.toBe("none");
      expect(simulate(def, def.defaults, d).notes.some((n) => n.startsWith("Bare coax")), id).toBe(false);
    }
    const items = (id: string, coax?: string) => buildPack(ANTENNA_BY_ID[id], { ...ANTENNA_BY_ID[id].defaults, ...(coax ? { coax } : {}) }).bom.map((r) => r.item.s);
    expect(items("skycone7")).toContain("Ferrite beads for the coax (material 43 or 61, inner Ø ≥ 3.7 mm)");
    expect(items("skycone8")).toContain("Clip-on ferrite for the coax (about 150 Ω at the lowest band)");
    // the choke-tube cages list their tubes, not ferrite
    const b44 = buildPack(ANTENNA_BY_ID.skyconecage44, ANTENNA_BY_ID.skyconecage44.defaults).bom.filter((r) => r.item.s.startsWith("Brass or copper tube"));
    expect(b44.map((r) => (r.item.a ?? []).map((x) => +((x as { len: number }).len * 1e3).toFixed(1)))).toEqual([[10, 50]]);
    expect(items("skyconecage55").filter((s) => s.startsWith("Brass or copper tube"))).toHaveLength(2);
    for (const id of ["skyconecage44", "skyconecage55"]) expect(items(id).some((s) => s.includes("errite")), id).toBe(false);
    // without: nothing on the coax, the short handle
    for (const id of Object.keys(SKYCONE_TABLES)) expect(items(id, "bare2").some((s) => s.includes("errite") || s.startsWith("Brass or copper tube")), id).toBe(false);
    const d7 = ANTENNA_BY_ID.skycone7.build({ ...ANTENNA_BY_ID.skycone7.defaults, coax: "bare1" });
    expect(partsFor("skycone7", d7 && { ...ANTENNA_BY_ID.skycone7.defaults, coax: "bare1" }, d7).find((q) => q.id === "skycone-handle")!.purpose.s).not.toContain("ferrite sleeve");
  });

  it("bare cable: its length in Dimensions scales with the band, the Simulation uses the bare rows", () => {
    const { d, r } = worst("skycone7", "bare1");
    expect(d.dims.find((x) => x.label === "Bare cable length (Simulation)")!.value).toBeCloseTo(0.5 * 3e8 / 960e6, 6);
    expect(d.notes.some((n) => n.startsWith("No ferrite or choke"))).toBe(true);
    expect(r.notes.some((n) => n.startsWith("Bare coax"))).toBe(true);
    const t = SKYCONE_TABLES.skycone7, k = 5;
    expect(skyconeZ(t, 960e6, t.bare!.f[k] * 960e6, 0)!.r).toBeCloseTo(t.bare!.r[0][k], 6);
    // reference: tools/wideband-antenna README, A55 with a bare 35 cm cable worst SWR 3.9 over the band (cage_sleeve.py)
    const a55 = worst("skyconecage55", "bare3");
    expect(a55.d.dims.find((x) => x.label === "Bare cable length (Simulation)")!.value).toBeCloseTo(0.344, 2);
    expect(a55.swr).toBeGreaterThan(3.4);
    expect(a55.swr).toBeLessThan(4.4);
    expect(worst("skyconecage55", "").swr).toBeLessThan(2.3);
    const half = ANTENNA_BY_ID.skycone7.build({ bands: "1920e6-12800e6", coax: "bare1" });
    expect(half.dims.find((x) => x.label === "Bare cable length (Simulation)")!.value).toBeCloseTo(0.5 * 3e8 / 1920e6, 6);
  });
});

describe("wire diameter tables", () => {
  const IDS = ["skyconecage", "skyconecagemini", "skyconecage40", "skyconecage44", "skyconecage55", "skycone40"];
  const tabs = IDS.map((id) => [id, SKYCONE_TABLES[id]] as const);

  it("every wire cage and S40 has variants on the base grid", () => {
    for (const [id, t] of tabs) {
      expect(t.wires!.length, id).toBeGreaterThanOrEqual(id === "skyconecage55" ? 2 : 3);
      for (const w of t.wires!) {
        expect(w.r, id).toHaveLength(t.f.length);
        expect(w.x, id).toHaveLength(t.f.length);
        expect(w.g, id).toHaveLength(t.f.length);
        for (const row of w.g) expect(row, id).toHaveLength(t.els.length);
        expect(w.bare!.r, id).toHaveLength(3);
        for (const row of [...w.bare!.r, ...w.bare!.x]) expect(row, id).toHaveLength(t.bare!.f.length);
      }
    }
  });

  it("tableAt reproduces each tabulated diameter exactly", () => {
    for (const [id, t] of tabs) for (const w of t.wires!) {
      const a = tableAt(t, w.d);
      expect(a.clamped, id).toBe(false);
      expect(a.t.r, id).toEqual(w.r);
      expect(a.t.x, id).toEqual(w.x);
      expect(a.t.g[10], id).toEqual(w.g[10]);
      expect(a.t.bare!.r[1], id).toEqual(w.bare!.r[1]);
    }
  });

  it("tableAt at the base wire is the base table", () => {
    for (const [id, t] of tabs) {
      expect(baseWire(t), id).toBeCloseTo(1e-3, 9);
      expect(tableAt(t, baseWire(t)).t, id).toBe(t);
    }
  });

  it("halfway in log Ø lies between its neighbours", () => {
    for (const [id, t] of tabs) {
      const d = Math.sqrt(0.8e-3 * 1e-3), m = tableAt(t, d).t;
      const lo = t.wires!.find((w) => Math.abs(w.d - 0.8e-3) < 1e-9)!;
      expect(m, id).not.toBe(t);
      for (let i = 0; i < t.f.length; i++) {
        const a = Math.min(lo.r[i], t.r[i]), b = Math.max(lo.r[i], t.r[i]);
        expect(m.r[i], id).toBeGreaterThanOrEqual(a - 1e-9);
        expect(m.r[i], id).toBeLessThanOrEqual(b + 1e-9);
      }
    }
  });

  it("outside the range clamps", () => {
    for (const [id, t] of tabs) {
      const all = [{ d: baseWire(t), r: t.r }, ...t.wires!], top = all.reduce((a, b) => (b.d > a.d ? b : a));
      const c = tableAt(t, 10e-3);
      expect(c.clamped, id).toBe(true);
      expect(c.t.r, id).toEqual(top.r);
      expect(tableAt(t, 0.01e-3).clamped, id).toBe(true);
    }
  });

  it("bare rows follow the diameter", () => {
    const t = SKYCONE_TABLES.skyconecage, a = skyconeZ(t, t.fLo, 1.2e9, 1)!, b = skyconeZ(tableAt(t, 0.5e-3).t, t.fLo, 1.2e9, 1)!;
    expect(Math.abs(a.r - b.r) + Math.abs(a.x - b.x)).toBeGreaterThan(0.1);
  });

  it("the variant hub follows hubFor", () => {
    for (const [id, t] of tabs) for (const w of t.wires!) {
      if (w.hub != null) expect(Math.abs(w.hub - hubFor(16, w.d)), id).toBeLessThan(1e-6);
      if (t.cage) expect(tableAt(t, w.d).t.cage!.hub, id).toBeCloseTo(hubFor(16, w.d), 9);
    }
    expect(hubFor(16, 1e-3)).toBeCloseTo(3e-3, 12);
  });
});

describe("wire diameter param", () => {
  const IDS = ["skyconecage", "skyconecagemini", "skyconecage40", "skyconecage44", "skyconecage55", "skycone40"];
  const hubRadii = (d: ReturnType<typeof ANTENNA_BY_ID.skyconecage.build>) => d.wires
    .filter((w) => !w.drawOnly && Math.hypot(w.a[0], w.a[1]) < 1e-12 && Math.hypot(w.b[0], w.b[1]) > 1e-9)
    .map((w) => Math.hypot(w.b[0], w.b[1]));

  it("default Ø1 mm at the reference band is the old design", () => {
    for (const id of IDS) {
      const def = ANTENNA_BY_ID[id], d = def.build({ bands: def.defaults.bands });
      expect(def.params.find((p) => p.key === "d"), id).toMatchObject({ kind: "length", min: 0.2e-3, max: 5e-3, label: id === "skycone40" ? "Shorting wire diameter" : "Wire diameter" });
      expect(def.defaults.d, id).toBe(1e-3);
      expect(d.skyconeWire, id).toMatchObject({ dRef: 1e-3, clamped: false });
    }
  });

  it("thicker wire: BOM, Dimensions and hub follow", () => {
    const d = ANTENNA_BY_ID.skyconecage.build({ bands: "960e6-6400e6", d: 2e-3 });
    const frames = d.cuts!.filter((c) => c.what.includes("frame"));
    expect(frames.length).toBe(2);
    for (const c of frames) expect(c.dia).toBeCloseTo(2e-3, 12);
    expect(d.dims.find((x) => x.label === "Wire diameter")!.value).toBeCloseTo(2e-3, 12);
    const hubs = hubRadii(d);
    expect(hubs.length).toBeGreaterThan(0);
    for (const h of hubs) expect(h * 1e3).toBeCloseTo(hubFor(16, 2e-3) * 1e3, 2);
    expect(hubFor(16, 2e-3) * 1e3).toBeCloseTo(5.60, 2);
    expect(d.skyconeWire).toMatchObject({ dRef: 1.5e-3, clamped: true });
  });

  it("the hub ring of a thick wire sits where the frame crosses its radius (the NEC tables' hub cut)", () => {
    const t = SKYCONE_TABLES.skyconecage, R = hubFor(16, 1.5e-3);
    const fr = cageFrames(t, 1, R);
    for (const [, ring] of fr.hubs) expect(ring[0]).toBeCloseTo(R, 12);
    expect(fr.hot[0][0]).toBeCloseTo(R, 12);
    expect(fr.ground[0][0]).toBeCloseTo(R, 12);
    // the base hub: exactly the old frames
    expect(cageFrames(t, 1)).toEqual(cageFrames(t, 1, t.cage!.hub));
    // a hub ring at ≥ 4 mm is one ring, not a hoop on top of it (no coincident wires in the NEC export)
    const d = ANTENNA_BY_ID.skyconecage.build({ bands: "960e6-6400e6", d: 1.5e-3 });
    const keys = d.wires.map((w) => [...w.a, ...w.b].map((x) => x.toFixed(9)).join());
    expect(new Set(keys).size).toBe(keys.length);
    expect(d.frames!.hoops.hot.every((q) => q[0] > R + 1e-4)).toBe(true);
  });

  it("S40: the shorting wire Ø changes, the sheet doesn't", () => {
    const def = ANTENNA_BY_ID.skycone40, a = def.build({ bands: "1400e6-6400e6" }), b = def.build({ bands: "1400e6-6400e6", d: 0.5e-3 });
    expect(b.wires.find((w) => w.tag === "S")!.r).toBeCloseTo(0.25e-3, 12);
    expect(b.sheets).toEqual(a.sheets);
    expect(b.skyconeWire).toMatchObject({ dRef: 0.5e-3, clamped: false });
  });

  it("A55 caps the wire at the coil", () => {
    const t = SKYCONE_TABLES.skyconecage55;
    expect(coilLimit(t)).toBeCloseTo(1.21e-3, 4);
    expect(Math.abs(coilLimit(t) - 1.21e-3)).toBeLessThan(0.02e-3);
    const d = ANTENNA_BY_ID.skyconecage55.build({ bands: "960e6-1360e6", d: 3e-3 });
    expect(d.skyconeWire!.capped).toBe(true);
    expect(d.skyconeWire!.clamped).toBe(true);
    expect(d.cuts!.find((c) => c.what.startsWith("Shorting wire"))!.dia).toBeLessThanOrEqual(coilLimit(t) + 1e-12);
    expect(d.notes).toContain("The coiled shorting wires can't be wound from wire this thick: the wire diameter is capped at what fits the coil.");
    expect(ANTENNA_BY_ID.skyconecage55.build({ bands: "960e6-1360e6" }).skyconeWire!.capped).toBeFalsy();
  });

  it("an old saved design without d still builds", () => {
    for (const id of IDS) {
      const def = ANTENNA_BY_ID[id];
      const d = def.build({ bands: String(def.defaults.bands), coax: String(def.defaults.coax) });
      expect(d.skyconeWire!.dRef, id).toBe(1e-3);
    }
    expect(ANTENNA_BY_ID.skyconecage.build({ bands: "960e6-6400e6", coax: "ferrite" }).skyconeWire!.dRef).toBe(1e-3);
  });

  it("a cage moved far up the band clamps but builds", () => {
    for (const id of IDS) {
      const d = ANTENNA_BY_ID[id].build({ bands: "5e9-33e9", d: 1e-3 });
      expect(d.skyconeWire!.clamped, id).toBe(true);
      for (const w of d.wires) expect([...w.a, ...w.b, w.r].every(Number.isFinite), id).toBe(true);
    }
  });

  it("a thick wire on a cage with a shorting wire keeps the hub inside it", () => {
    for (const id of ["skyconecagemini", "skyconecage40", "skyconecage44"]) {
      const t = SKYCONE_TABLES[id], d = ANTENNA_BY_ID[id].build({ bands: ANTENNA_BY_ID[id].defaults.bands, d: 2e-3 });
      for (const h of hubRadii(d)) expect(h, id).toBeLessThanOrEqual(t.cage!.short!.rho - 2e-3 + 1e-12);
    }
  });

  it("Radiation view: the elements carry the design's wire radius", () => {
    const d = ANTENNA_BY_ID.skyconecage.build({ bands: "960e6-6400e6", d: 2e-3 });
    const c = skyconeCurrents("skyconecage", d)!;
    expect(c.els.every((e) => Math.abs(e.r - 1e-3) < 1e-12)).toBe(true);
  });
});
