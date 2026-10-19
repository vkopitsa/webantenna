import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { ANTENNA_BY_ID } from "../../antennas";
import { buildPack, en } from "../../build";
import { loadManifold } from "../manifold";
import { buildPart } from "..";
import { FAIL } from "../parts";
import { CLEAR } from "../rules";
import { frameGrooves, skyconeParts, skyconeProfile } from "./skycone";

let M: ManifoldToplevel;
beforeAll(async () => { M = await loadManifold(); });

describe("skycone cage jigs", () => {
  it.each(["skyconecage", "skyconecage44"])("%s: cage jigs build watertight or report too large at Ø0.2 and Ø5 mm", (id) => {
    const def = ANTENNA_BY_ID[id];
    for (const dia of [0.2e-3, 2e-3, 5e-3]) {
      const d = def.build({ ...def.defaults, d: dia });
      const wireD = 2000 * d.wires[1].r;
      expect(wireD).toBeCloseTo(dia * 1000, 6);
      for (const s of skyconeParts(d, 0, false)) {
        const b = buildPart(M, s, "t");
        if (!b.ok) expect([FAIL.radome, "Too large to print in one piece: {0}"], `${id} Ø${dia} ${s.id}`).toContain(b.error.s);
      }
      // the groove is one wire plus clearance wide (its y-extent in the XZ plane), whatever the wire
      const path = skyconeProfile(d).ground, ph = path.slice(0, 2);
      const bb = frameGrooves(M, ph, 1, wireD).boundingBox();
      expect((bb.max[1] - bb.min[1]) / (wireD + CLEAR), `${id} Ø${dia} groove width`).toBeGreaterThan(0.98);
      expect((bb.max[1] - bb.min[1]) / (wireD + CLEAR)).toBeLessThan(1.02);
    }
  }, 240_000);
});

describe("thick-wire hot washer", () => {
  it("W40 at Ø1.5 mm: a dished washer, centre at the pin gap, rim at the hub ring; the cradle still builds", () => {
    const def = ANTENNA_BY_ID.skyconecage40;
    const d = def.build({ ...def.defaults, d: 1.5e-3 });
    const g = d.dims.find((x) => x.key === "g")!.value, ring = d.frames!.hot[0];
    expect(ring[1] - g).toBeGreaterThan(1e-3);                         // the hub ring sits well above the washer plane
    const t = d.tables.find((x) => x.title.startsWith("Hub washers"))!;
    const row = t.rows.find((r) => String(r[0]).startsWith("Hot washer"))!;
    expect(t.columns.map((c) => c.label)).toEqual(["Part", "Outer diameter", "Hole diameter", "Height above the coax end", "Flat centre diameter", "Rim height above the coax end"]);
    expect(Math.abs(+row[3] - g)).toBeLessThan(1e-5);                  // centre at g (±0.01 mm)
    expect(Math.abs(+row[5] - ring[1])).toBeLessThan(1e-5);            // rim at the hub ring's z
    expect(+row[1]).toBeCloseTo(2 * ring[0], 9);
    expect(+row[4]).toBeLessThan(+row[1]);
    expect(d.frames!.dish).toEqual({ r: +row[4] / 2, z: g });
    // the BOM row gives both diameters and heights
    const bomRow = buildPack(def, { ...def.defaults, d: 1.5e-3 }, d).bom.find((r) => r.note?.s.startsWith("Brass or copper, 0.3–0.5 mm, pressed"))!;
    expect(bomRow.note!.a).toEqual([{ len: +row[4] }, { len: g }, { len: +row[1] }, { len: ring[1] }]);
    expect(en(bomRow.item)).toMatch(/^Hot washer, dished/);
    const cradle = skyconeParts(d, 0, false).find((s) => s.id === "skycone-cradle")!;
    expect(buildPart(M, cradle, "t").ok).toBe(true);
  }, 120_000);

  it("Ø1 mm: the flat washer, as before", () => {
    for (const id of ["skyconecage", "skyconecagemini", "skyconecage40", "skyconecage44", "skyconecage55"]) {
      const d = ANTENNA_BY_ID[id].build({ ...ANTENNA_BY_ID[id].defaults, d: 1e-3 });
      expect(d.frames!.dish, id).toBeUndefined();
      expect(d.tables.find((x) => x.title.startsWith("Hub washers"))!.columns.length, id).toBe(4);
    }
  });
});
