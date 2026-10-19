import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { Params } from "../../types";
import { loadManifold } from "../manifold";
import { buildPart, msg } from "../parts";
import { CLEAR, MAX_SIZE, WALL } from "../rules";
import { ANTENNA_BY_ID } from "../../antennas";
import { buildPack } from "../../build";
import { bendRecipes, dieFor } from "../../recipe";
import { benderGeometry, benderLever, benderPlate, boardHoles, cutBendParts, cutBoards, CUTBEND_HOWTO, CUTBEND_STRINGS, leverSolids, type Hole } from "./cutbend";
import { partsFor } from "..";
import { along, ball, inside, setup } from "./testkit";

let M: ManifoldToplevel;
beforeAll(async () => { M = await loadManifold(); });

const holesOf = (id: string, extra: Params = {}) => {
  const { p, d } = setup(id, extra), def = ANTENNA_BY_ID[id];
  return boardHoles(buildPack(def, p, d).cuts, bendRecipes(def, p, d));
};
const hole = (n: number, cut: number, marks: number[] = [], dia = 0.001): Hole => ({ n, cut, dia, qty: 1, what: msg("Wire"), marks });

describe("boardHoles", () => {
  it("biquad: one hole for the driven wire with its seven bends marked", () => {
    const hs = holesOf("biquad");
    expect(hs).toHaveLength(1);
    expect(hs[0].n).toBe(1);
    expect(hs[0].marks).toHaveLength(7);
  });
  it("ground plane at 1.3 GHz: the radials share one hole", () => {
    const hs = holesOf("groundplane", { bands: "1.25e9-1.35e9" });
    expect(hs.some((h) => h.qty === 4)).toBe(true);
    expect(hs.map((h) => h.n)).toEqual(hs.map((_, i) => i + 1));
    for (let i = 1; i < hs.length; i++) expect(hs[i].cut).toBeLessThanOrEqual(hs[i - 1].cut);
  });
  it("dipole at 14 MHz: too long for a board", () => {
    expect(holesOf("dipole", { bands: "14e6-14.35e6" })).toEqual([]);
  });
});

describe("cut board", () => {
  const h = hole(1, 0.1, [0.03, 0.07]), spec = cutBoards([h])[0];
  let solid: Manifold;
  beforeAll(() => { solid = spec.build(M)[0]; });
  const T = Math.max(5, Math.max(2, 1 + CLEAR) + 2 * WALL), zc = T / 2;
  it("wire goes in to the cut length and no further", () => {
    expect(spec.id).toBe("cut-board");
    expect(spec.use).toBe("jig");
    const bb = solid.boundingBox(), y = (bb.min[1] + bb.max[1]) / 2;
    expect(inside(solid, along(M, [0, y, zc], [1, 0, 0], 1, 99, 0.8))).toBeLessThan(1e-3);
    const b = ball(M, [101.5, y, zc], 1);
    expect(inside(solid, b)).toBeGreaterThan(0.9 * b.volume());
  });
  it("slits open at the marks", () => {
    const bb = solid.boundingBox(), y = (bb.min[1] + bb.max[1]) / 2;
    for (const at of [30, 70]) {
      expect(inside(solid, along(M, [at, y, zc], [0, 0, 1], 0, zc + 0.5, 0.4)), `slit at ${at}`).toBeLessThan(1e-3);
      const b = ball(M, [at + 4, y, zc + 2.5], 0.6);   // beside the slit the roof is plastic
      expect(inside(solid, b)).toBeGreaterThan(0.9 * b.volume());
    }
  });
  it("many holes split into boards within MAX_SIZE", () => {
    const hs = Array.from({ length: 40 }, (_, i) => hole(i + 1, 0.16 - i * 0.002, [0.02]));
    const ps = cutBoards(hs);
    expect(ps.length).toBeGreaterThanOrEqual(2);
    expect(ps.map((s) => s.id)).toEqual(ps.map((_, i) => `cut-board-${i + 1}`));
    for (const s of ps) {
      const b = buildPart(M, s, "t");
      expect(b.ok).toBe(true);
      if (b.ok) for (const g of b.segments) expect(Math.max(...g.size)).toBeLessThanOrEqual(MAX_SIZE);
    }
  });
  it("describes every hole in the how-to", () => {
    expect(spec.howTo.some((m) => m.s === CUTBEND_STRINGS.find((s) => s.startsWith("Hole {0}")))).toBe(true);
    expect(CUTBEND_HOWTO.board.length).toBeGreaterThan(0);
  });
});

describe("benders", () => {
  it("geometry: stops at each distinct angle plus 90° on a 40 mm circle, roller beside the wire", () => {
    const die = dieFor(2)!, g = benderGeometry(die, 2, [90, 45, 90.1]);
    expect(g.stops.map((s) => s.angle)).toEqual([45, 90]);
    for (const s of g.stops) {
      expect(Math.hypot(...s.c)).toBeCloseTo(40, 2);
      expect((Math.atan2(s.c[1], s.c[0]) * 180) / Math.PI).toBeCloseTo(s.angle, 6);
    }
    expect(Math.hypot(...g.roller)).toBeCloseTo(die.r + 2 + CLEAR + die.r, 6);
    expect(g.tangentX).toBe(0);
    expect(benderGeometry(die, 2, [135]).stops.map((s) => s.angle)).toEqual([90, 135]);
  });
  it("lever bender: wire clears between die and roller and through the block", () => {
    for (const dMm of [0.5, 2]) {
      const g = benderGeometry(dieFor(dMm)!, dMm, [90]), { base, lever, wireZ } = leverSolids(M, g), yw = -(g.die.r + dMm / 2);
      const b = ball(M, [0, yw, wireZ], 0.8 * dMm);
      expect(inside(base, b), `base d=${dMm}`).toBeLessThan(1e-6);
      expect(inside(lever, b), `lever d=${dMm}`).toBeLessThan(1e-6);
      expect(inside(base, along(M, [-60, yw, wireZ], [1, 0, 0], 0, 55, 0.8 * dMm)), `groove d=${dMm}`).toBeLessThan(1e-6);
      const solid = ball(M, [-22, yw + dMm / 2 + CLEAR + 1.2, wireZ], 0.6);   // the groove wall beside the wire
      expect(inside(base, solid)).toBeGreaterThan(0.9 * solid.volume());
    }
  });
  it("lever bender: the lever swings 0–180° clear of the base and block; its edge meets a stop bolt head at the angle", () => {
    for (const dMm of [0.5, 3]) {
      const g = benderGeometry(dieFor(dMm)!, dMm, [90]), { base, lever } = leverSolids(M, g);
      for (let a = 0; a <= 180; a += 10) expect(inside(base, lever.rotate([0, 0, a])), `d=${dMm} ${a}°`).toBeLessThan(1e-6);
      // stop at 90°: the lever turned to 89° misses a head-sized post in the 90° hole, at 91° it overlaps it
      const s = g.stops.find((x) => x.angle === 90)!, head = { M3: 5.5, M4: 7, M5: 8.5, M6: 10 }[g.die.bolt];
      const post = M.Manifold.cylinder(4, head / 2 - 0.01, head / 2 - 0.01, 64).translate([s.c[0], s.c[1], 9]);
      expect(inside(post, lever.rotate([0, 0, 89]))).toBeLessThan(1e-6);
      expect(inside(post, lever.rotate([0, 0, 91]))).toBeGreaterThan(0);
    }
  });
  it("plate: wire clears between die and trap bolt and through the groove", () => {
    const dMm = 1, g = benderGeometry(dieFor(dMm)!, dMm, [90]), solid = benderPlate(g).build(M)[0], yw = -(g.die.r + dMm / 2);
    expect(inside(solid, along(M, [-45, yw, 6 + dMm / 2], [1, 0, 0], 0, 45, 0.8 * dMm))).toBeLessThan(1e-6);
  });
  it("benders build at Ø0.5, 1, 2, 3 mm", () => {
    for (const dMm of [0.5, 1, 2, 3]) {
      const g = benderGeometry(dieFor(dMm)!, dMm, [45, 90, 135, 180]);
      for (const s of [benderLever(g), benderPlate(g)]) {
        const b = buildPart(M, s, s.id);
        expect(b.ok, `${s.id} d=${dMm}`).toBe(true);
        if (b.ok) for (const seg of b.segments) expect(Math.max(...seg.size)).toBeLessThanOrEqual(MAX_SIZE);
      }
      expect(benderLever(g).id).toBe(`bender-lever-${g.die.bolt.toLowerCase()}`);
      expect(benderLever(g).howTo[0].s).toBe("Print either this lever bender or the bending plate, not both");
      expect(benderPlate(g).howTo[0].s).toBe("Print either this lever bender or the bending plate, not both");
    }
  });
  it("which designs get parts", () => {
    const ids = (id: string, extra: Params = {}) => { const { p, d } = setup(id, extra); return cutBendParts(ANTENNA_BY_ID[id], p, d).map((s) => s.id); };
    const quad = ids("quad", { bands: "2.4e9-2.5e9" });   // UHF: the loops fit the board (2 m defaults are > 170 mm)
    expect(quad.some((s) => s.startsWith("cut-board"))).toBe(true);
    expect(quad.some((s) => s.startsWith("bender-lever-"))).toBe(true);
    expect(quad.some((s) => s.startsWith("bender-plate-"))).toBe(true);
    expect(ids("yagi")).toEqual([]);
    expect(ids("dipole", { bands: "2.4e9-2.5e9" })).toEqual(["cut-board"]);
    expect(ids("skyconecage")).toEqual([]);
    expect(ids("quad").some((s) => s.startsWith("cut-board"))).toBe(false);
    const { p, d } = setup("quad", { bands: "2.4e9-2.5e9" });
    expect(partsFor("quad", p, d).map((s) => s.id)).toEqual(expect.arrayContaining(quad));
  });
  it("hole how-to: number, length and count, then what the piece is", () => {
    const spec = cutBoards([hole(3, 0.1)])[0], k = spec.howTo.findIndex((m) => m.s === "Hole {0}: cut {1} × {2}");
    expect(k).toBeGreaterThan(0);
    expect(spec.howTo[k].a).toEqual([3, { len: 0.1 }, 1]);
    expect(spec.howTo[k + 1]).toEqual(msg("Wire"));
  });
});
