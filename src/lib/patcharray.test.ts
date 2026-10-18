import { describe, expect, it } from "vitest";
import { ANTENNA_BY_ID } from "./antennas";
import { arrayLayout, arraySize, leafLengths } from "./antennas/arraylayout";
import { arBoresight, arrayMetrics, arrayPattern, arrayScan, cutWidth, netSolve } from "./antennas/arraymodel";
import { cpScan, cpSetup } from "./antennas/cppatch";
import { simulate } from "./simulate";
import { idealCurrents } from "./idealcurrents";
import { fabZip } from "./fab";
import { buildPack, tuning } from "./build";
import { synthesize } from "./synth";
import { setup } from "./fdtd/setup";
import { inPoly } from "./pcb";

const def = ANTENNA_BY_ID.patcharray;
const P = (extra: Record<string, number | string> = {}) => ({ ...def.defaults, ...extra });
const L = (extra: Record<string, number | string> = {}) => arrayLayout(P(extra), def.build(P(extra)).f);
const M = (extra: Record<string, number | string> = {}, step = 2) => arrayMetrics(L(extra), def.build(P(extra)).f, step);
const DEG = Math.PI / 180;
type Pt = [number, number];

describe("patch array", () => {
  it("reference: D ≈ 4π N d²/λ² for broadside planar arrays at d = λ/2 (Balanis, Antenna Theory, planar array directivity D0 ≈ π Dx Dy, Dx = 2 Nx d/λ)", () => {
    for (const size of ["2x2", "4x4"]) {
      const n = arraySize({ size })[0], bound = 10 * Math.log10(4 * Math.PI * (n * 0.5) ** 2);
      expect(Math.abs(M({ size, dsp: 0.5 }).d0 - bound), size).toBeLessThan(1);
    }
  });
  it("published-range check: corporate-fed 2×2 / 4×4 / 8×8 on a low-loss laminate (5.8 GHz RO4003C, 10 GHz RT/duroid 5880) give about 13 / 19 / 24 dBi", () => {
    const ro = (size: string) => M({ size }, 1).gain;
    expect(ro("2x2")).toBeGreaterThan(12); expect(ro("2x2")).toBeLessThan(14);
    expect(ro("4x4")).toBeGreaterThan(18); expect(ro("4x4")).toBeLessThan(20.5);
    expect(ro("8x8")).toBeGreaterThan(23); expect(ro("8x8")).toBeLessThan(25.5);
    const rt = (size: string) => M({ size, bands: "10e9-10e9", er: 2.2, h: 0.787e-3, tanD: 0.0009 }, 1).gain;
    expect(rt("4x4")).toBeGreaterThan(18.5); expect(rt("4x4")).toBeLessThan(21);
  });
  it("directivity grows by about 6 dB per doubling of each axis", () => {
    const d = (size: string) => M({ size }).d0;
    expect(d("4x4") - d("2x2")).toBeGreaterThan(5.5); expect(d("4x4") - d("2x2")).toBeLessThan(7);
    expect(d("8x8") - d("4x4")).toBeGreaterThan(5.5); expect(d("8x8") - d("4x4")).toBeLessThan(7);
    expect(d("4x2") - d("2x2")).toBeGreaterThan(2.5); expect(d("4x2") - d("2x2")).toBeLessThan(3.5);
    expect(Math.abs(d("2x4") - d("4x2"))).toBeLessThan(1); // E- and H-plane element patterns differ a little
  });
  it("the feed loss shows: 8×8 on FR-4 at 5.8 GHz loses several dB more than on RO4003C; loss grows with the array and with frequency", () => {
    const fr4 = M({ size: "8x8", er: 4.4, h: 1.6e-3, tanD: 0.02 }), ro = M({ size: "8x8" });
    expect(fr4.lossNet).toBeGreaterThan(5); expect(ro.lossNet).toBeLessThan(3);
    expect(M({ size: "2x2" }).lossNet).toBeLessThan(M({ size: "4x4" }).lossNet);
    expect(M({ size: "4x4", tanD: 0.01 }).lossNet).toBeGreaterThan(2 * M({ size: "4x4" }).lossNet);
    expect(fr4.gain).toBeLessThan(fr4.d0 - 6);
    const d = def.build(P({ size: "8x8", er: 4.4, h: 1.6e-3, tanD: 0.02 }));
    expect(d.notes.some((n) => n.startsWith("Warning: the feed network loses over 3 dB"))).toBe(true);
  });
  it("no grating lobe at 0.75 λ; at 1.1 λ one appears and the design warns", () => {
    const side = (dsp: number) => {
      const lay = L({ size: "4x4", dsp }), { dir, d0 } = arrayPattern(lay, lay.f, 2);
      const hp = Math.max(cutWidth(dir, d0, 0), cutWidth(dir, d0, Math.PI / 2));
      let worst = -Infinity;
      for (const ph of [0, Math.PI / 2]) for (let t = 1.7 * hp; t < 89; t += 0.5) worst = Math.max(worst, dir(t * DEG, ph) - d0);
      return worst;
    };
    expect(side(0.75)).toBeLessThan(-10);
    expect(side(1.1)).toBeGreaterThan(-10);
    const warn = (dsp: number, extra = {}) => def.build(P({ dsp, ...extra })).notes.some((n) => n.startsWith("Warning: at the top of the band the spacing is a wavelength"));
    expect(warn(0.75)).toBe(false);
    expect(warn(1.1)).toBe(true);
    expect(warn(0.9, { bands: "5.5e9-6.1e9" })).toBe(false); // top of the band 1.05 × the centre: 0.95 λ
    expect(warn(0.97, { bands: "5e9-7e9" })).toBe(true); // top 7 GHz, centre 6 GHz: 1.13 λ
    expect(def.build(P({ dsp: 0.45 })).notes.some((n) => n.startsWith("Warning: spacing below half a wavelength"))).toBe(true);
  });
  it("the feed network is symmetric: the path from the port to every element has the same length (linear), and 0/90/180/270° longer in the CP cells", () => {
    for (const size of ["2x2", "4x4", "8x4", "4x8", "8x8"]) {
      const lens = leafLengths(L({ size }).root);
      expect(lens.length).toBe(arraySize({ size })[0] * arraySize({ size })[1]);
      for (const l of lens) expect(Math.abs(l - lens[0]), size).toBeLessThan(1e-9);
    }
    for (const hand of ["rhcp", "lhcp"]) for (const size of ["2x2", "4x4", "8x8"]) {
      const lay = L({ size, elem: "cp", hand }), lens = leafLengths(lay.root), ref = lens[0];
      lay.elems.forEach((el, i) => {
        const dphi = ((((lens[i] - ref) / lay.lg100) * 360) % 360 + 360) % 360; // extra electrical degrees
        expect(Math.abs(dphi - el.k * 90) < 1e-5 || Math.abs(dphi - el.k * 90 - 360) < 1e-5, `${size} ${hand} #${i} k=${el.k} ${dphi}`).toBe(true);
      });
      // every cell has all four phases once
      for (let c = 0; c < lay.elems.length; c += 4) expect(new Set(lay.elems.slice(c, c + 4).map((q) => q.k)).size).toBeLessThanOrEqual(4);
      expect(new Set(lay.elems.map((q) => q.k))).toEqual(new Set([0, 1, 2, 3]));
    }
  });
  it("junctions: 100 Ω arms in parallel (50 Ω) and a λg/4 70.7 Ω section back to 100 Ω; Zin = 50 Ω at f0 on a low-loss laminate; the element impedance is 100 Ω", () => {
    for (const extra of [{}, { size: "4x4" }, { size: "8x8" }, { elem: "cp" }, { elem: "cp", size: "4x4", hand: "lhcp" }] as Record<string, string | number>[]) {
      const lay = L(extra), n = netSolve(lay, lay.f);
      expect(n.gamma, JSON.stringify(extra)).toBeLessThan(0.12);
      expect(Math.abs(n.ze[0] - 100), JSON.stringify(extra)).toBeLessThan(3);
      expect(Math.abs(n.ze[1])).toBeLessThan(3);
    }
    const lay = L(), { w50, w70, w100 } = lay.lineW;
    expect(w100).toBeLessThan(w70); expect(w70).toBeLessThan(w50);
    expect(lay.q).toBeCloseTo(lay.lg(w70) / 4, 12);
  });
  it("lossless limit: without loss every amplitude is equal and the whole power reaches the elements", () => {
    const lay = L({ size: "4x4", tanD: 0 }), lay0 = { ...lay, tanD: 0 };
    const n = netSolve(lay0, lay.f);
    expect(n.etaNet).toBeGreaterThan(0.88); // only copper loss left (0.4 dB)
    const a = n.v.map((v) => Math.hypot(v[0], v[1]));
    for (const x of a) expect(Math.abs(x / a[0] - 1)).toBeLessThan(1e-6);
    const ph = n.v.map((v) => Math.atan2(v[1], v[0]));
    for (const x of ph) expect(Math.abs(x - ph[0])).toBeLessThan(1e-6);
  });
  it("CP: boresight AR < 1 dB at f0, and an AR bandwidth wider than the single truncated-corner patch (sequential rotation)", () => {
    for (const hand of ["rhcp", "lhcp"]) for (const size of ["2x2", "4x4"]) {
      const p = P({ elem: "cp", size, hand }), d = def.build(p), r = simulate(def, p, d);
      expect(r.arF0!, `${hand} ${size}`).toBeLessThan(1);
      expect(r.sense).toBe(hand);
      const { model } = cpSetup({ ...p, feed: "truncated" }, d.f), single = cpScan(model);
      expect(r.arBw!).toBeGreaterThan(1.5 * single.arBw);
      // off band the array's AR is better than the single patch's
      const lay = arrayLayout(p, d.f), f = 1.02 * d.f;
      expect(arBoresight(lay, f)).toBeLessThan(single.ar(f));
      expect(arrayScan(lay).arBw).toBeCloseTo(r.arBw!, 6);
    }
    const lin = simulate(def, P(), def.build(P()));
    expect(lin.ar).toBeUndefined();
  });
  it("CP hand: the left-hand array is the mirror image of the right-hand one; co-polar gain equal; RHCP design radiates RHCP", () => {
    const r = def.build(P({ elem: "cp", size: "4x4" })).pcb!, l = def.build(P({ elem: "cp", size: "4x4", hand: "lhcp" })).pcb!;
    const key = (pts: Pt[]) => pts.map(([x, y]) => `${Math.round(x * 1e9)},${Math.round(y * 1e9) + 0}`).sort().join(" ");
    const box = (q: { x0: number; y0: number; x1: number; y1: number }): Pt[] => [[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]];
    const shapes = (p: typeof r) => [...p.rects.filter((q) => q.layer === "top").map(box), ...(p.polys ?? []).map((q) => q.pts)];
    const mir = new Set(shapes(r).map((s) => key(s.map(([x, y]) => [-x, y] as Pt))));
    // polygons keep their vertices, rectangles are compared by their corners
    expect(shapes(l).every((s) => mir.has(key(s)))).toBe(true);
    const gr = M({ elem: "cp", size: "4x4" }).gain, gl = M({ elem: "cp", size: "4x4", hand: "lhcp" }).gain;
    expect(gl).toBeCloseTo(gr, 4);
    expect(r.port.start[0]).toBeGreaterThan(0); expect(l.port.start[0]).toBeLessThan(0);
    // the hand is the one asked for: the opposite-hand component on the boresight is > 30 dB down
    for (const hand of ["rhcp", "lhcp"]) {
      const lay = L({ elem: "cp", size: "4x4", hand }), f = lay.f;
      expect(arrayPattern(lay, f, 4).d0 - arrayPattern({ ...lay, lhcp: !lay.lhcp }, f, 4).d0, hand).toBeGreaterThan(30);
    }
  });
  it("copper: the feed lines never overlap a patch (except at the feed point), nor each other, and everything is on the board", () => {
    const segs = (st: { pts: Pt[]; w: number }) => st.pts.slice(1).map((b, i) => ({ a: st.pts[i], b, w: st.w }));
    const box = (s: { a: Pt; b: Pt; w: number }) => ({ x0: Math.min(s.a[0], s.b[0]) - s.w / 2, x1: Math.max(s.a[0], s.b[0]) + s.w / 2, y0: Math.min(s.a[1], s.b[1]) - s.w / 2, y1: Math.max(s.a[1], s.b[1]) + s.w / 2 });
    const ov = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9;
    const onLine = (p: Pt, s: { a: Pt; b: Pt }) => Math.abs((s.b[0] - s.a[0]) * (p[1] - s.a[1]) - (s.b[1] - s.a[1]) * (p[0] - s.a[0])) < 1e-9 * (1 + Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1])) && p[0] >= Math.min(s.a[0], s.b[0]) - 1e-9 && p[0] <= Math.max(s.a[0], s.b[0]) + 1e-9 && p[1] >= Math.min(s.a[1], s.b[1]) - 1e-9 && p[1] <= Math.max(s.a[1], s.b[1]) + 1e-9;
    for (const elem of ["linear", "cp"]) for (const hand of ["rhcp", "lhcp"]) for (const size of ["2x2", "4x4", "8x4", "8x8"]) {
      const lay = L({ elem, hand, size }), tag = `${elem} ${hand} ${size}`;
      // strips against strips: only touching at junction points (an end of one on the line of the other)
      for (let i = 0; i < lay.strips.length; i++) for (let j = i + 1; j < lay.strips.length; j++) {
        const A = lay.strips[i], B = lay.strips[j], eA = [A.pts[0], A.pts[A.pts.length - 1]], eB = [B.pts[0], B.pts[B.pts.length - 1]];
        for (const sa of segs(A)) for (const sb of segs(B)) {
          if (!ov(box(sa), box(sb))) continue;
          const joined = eA.some((q) => eB.some((r) => Math.hypot(q[0] - r[0], q[1] - r[1]) < 1e-9)) || eA.some((q) => onLine(q, sb)) || eB.some((q) => onLine(q, sa));
          expect(joined, `${tag}: strips ${i}/${j} overlap`).toBe(true);
        }
      }
      // strips against patches (rectangles and polygons), sampled along the centre lines and the edges
      const patchR = lay.rects.filter((q) => q.label === "Patch"), patchP = lay.polys.filter((q) => q.label === "Patch");
      let inside = 0;
      for (const st of lay.strips) for (const s of segs(st)) for (const off of [-st.w / 2 + 1e-7, 0, st.w / 2 - 1e-7]) for (let u = 0; u < 1; u += 0.05) {
        const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], l = Math.hypot(dx, dy), x = s.a[0] + dx * u - (dy / l) * off, y = s.a[1] + dy * u + (dx / l) * off;
        if (patchR.some((q) => x > q.x0 + 1e-9 && x < q.x1 - 1e-9 && y > q.y0 + 1e-9 && y < q.y1 - 1e-9) || patchP.some((q) => inPoly(q.pts, x, y))) inside++;
      }
      expect(inside, tag).toBe(0);
      // the built copper is inside the board; the port is on its edge and on the 50 Ω trunk
      const d = def.build(P({ elem, hand, size })), b = d.pcb!.board;
      for (const r of d.pcb!.rects) { expect(r.x0).toBeGreaterThanOrEqual(b.x0 - 1e-12); expect(r.x1).toBeLessThanOrEqual(b.x1 + 1e-12); expect(r.y0).toBeGreaterThanOrEqual(b.y0 - 1e-12); expect(r.y1).toBeLessThanOrEqual(b.y1 + 1e-12); }
      for (const q of d.pcb!.polys ?? []) for (const [x, y] of q.pts) { expect(x).toBeGreaterThanOrEqual(b.x0 - 1e-12); expect(x).toBeLessThanOrEqual(b.x1 + 1e-12); expect(y).toBeGreaterThanOrEqual(b.y0 - 1e-12); expect(y).toBeLessThanOrEqual(b.y1 + 1e-12); }
      expect(Math.abs(d.pcb!.port.start[0]) === Math.abs(elem === "cp" && hand === "lhcp" ? b.x0 : b.x1)).toBe(true);
      // patches never overlap each other
      const pts = d.elements!;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) expect(Math.abs(pts[i].x - pts[j].x) >= lay.d * 0.999 || Math.abs(pts[i].y - pts[j].y) >= lay.d * 0.999).toBe(true);
    }
  });
  it("the spacing is raised when the lines would not fit, and the design says so; the board stays finite at the extremes", () => {
    const lay = L({ dsp: 0.4, elem: "cp", size: "8x8" });
    expect(lay.raised).toBe(true);
    expect(lay.d).toBeGreaterThan(0.4 * lay.lam);
    expect(def.build(P({ dsp: 0.4, elem: "cp", size: "8x8" })).notes.some((n) => n.startsWith("Warning: the spacing was raised"))).toBe(true);
    for (const bands of ["100e3-100e3", "100e9-100e9"]) for (const elem of ["linear", "cp"]) {
      const d = def.build(P({ bands, size: "8x8", elem }));
      expect(d.dims.every((x) => Number.isFinite(x.value))).toBe(true);
      expect(d.pcb!.rects.every((r) => [r.x0, r.x1, r.y0, r.y1].every(Number.isFinite))).toBe(true);
      expect(JSON.stringify(d.perf)).not.toMatch(/NaN|Infinity/);
    }
  }, 60000);
  it("simulate: gain pattern matches the design page, impedance finite, one-port S11 near 50 Ω at f0, AR only for CP", () => {
    for (const extra of [{}, { size: "4x4" }, { elem: "cp" }] as Record<string, string | number>[]) {
      const p = P(extra), d = def.build(p), r = simulate(def, p, d), g = Number(d.perf.find((x) => x.label === "Gain estimate (model)")!.value.replace(/[^0-9.-]/g, ""));
      expect(r.method).toBe("analytic");
      expect(r.z.every((q) => Number.isFinite(q.r) && Number.isFinite(q.x))).toBe(true);
      expect(Math.abs(r.pattern!.max.dbi - g), JSON.stringify(extra)).toBeLessThan(0.15);
      expect(r.pattern!.max.theta).toBeLessThan(6);
      const near = r.z.reduce((a, b) => (Math.abs(b.f - d.f) < Math.abs(a.f - d.f) ? b : a));
      expect(Math.hypot(near.r - 50, near.x)).toBeLessThan(10);
    }
  });
  it("tuning and bill of materials: one tuning row on the patch length, a connector and the board", () => {
    for (const extra of [{}, { elem: "cp", size: "4x4" }] as Record<string, string | number>[]) {
      const rows = tuning(def, P(extra)).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].dLdf).toBeLessThan(0);
      const pack = buildPack(def, P(extra), def.build(P(extra)));
      expect(pack.bom.length).toBeGreaterThanOrEqual(2);
    }
  });
  it("Radiation view: one current sheet per patch (CP: both modes, with the feed phase)", () => {
    const n = (extra: Record<string, number | string>) => idealCurrents("patcharray", def.build(P(extra)))!.els.length;
    expect(n({})).toBe(4 * 5 * 16);
    expect(n({ elem: "cp" })).toBe(4 * 5 * 16 * 2);
    expect(n({ size: "4x4" })).toBe(16 * 3 * 8);
    // element 3 of the CP cell carries the −270° phase: ir/ii of a mode line are rotated by it
    const c = idealCurrents("patcharray", def.build(P({ elem: "cp" })))!;
    expect(c.ir.some((x) => Math.abs(x) > 0.1) && c.ii.some((x) => Math.abs(x) > 0.1)).toBe(true);
  });
  it("exports: Gerber / drill / DXF zip, FDTD setup on the default 2×2 (8×8 refuses with a message)", () => {
    const p = P({ size: "2x4" }), d = def.build(p);
    const z = fabZip(def, p, d, "arr", "1");
    expect(z.length).toBeGreaterThan(1000);
    const s = setup(d.pcb!, 0.9 * d.f, 1.1 * d.f);
    expect(s.nx * s.ny * s.nz).toBeLessThan(30e6);
    expect(() => setup(def.build(P({ size: "8x8" })).pcb!, 0.7 * 5.8e9, 1.3 * 5.8e9)).toThrow(/too large/);
  }, 120000);
  it("synthesis lists the array for a 5.8 GHz gain goal, scored with its gain", () => {
    const r = synthesize({ bands: [[5.725e9, 5.875e9]], goal: "gain", family: "printed", pol: "any", pattern: "beam", d: 2e-3, er: 3.38, h: 1.524e-3 });
    const a = r.find((c) => c.id === "patcharray")!;
    expect(a).toBeDefined();
    expect(a.gain).toBeGreaterThan(15);
    expect(Number.isFinite(a.score)).toBe(true);
  }, 120000);
});
