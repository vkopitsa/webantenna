import { beforeAll, describe, expect, it } from "vitest";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { Params } from "../../types";
import { loadManifold } from "../manifold";
import { buildPart, msg } from "../parts";
import { CLEAR, MAX_SIZE, WALL } from "../rules";
import { ANTENNA_BY_ID } from "../../antennas";
import { buildPack } from "../../build";
import { bendRecipes } from "../../recipe";
import { boardHoles, cutBoards, CUTBEND_HOWTO, CUTBEND_STRINGS, type Hole } from "./cutbend";
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
