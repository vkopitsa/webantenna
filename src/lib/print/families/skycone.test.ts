import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { ANTENNA_BY_ID } from "../../antennas";
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
