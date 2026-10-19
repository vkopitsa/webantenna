import { beforeAll, describe, expect, it } from "vitest";
import type { ManifoldToplevel } from "manifold-3d";
import { ANTENNA_BY_ID } from "../../antennas";
import { loadManifold } from "../manifold";
import { buildPart } from "..";
import { skyconeParts } from "./skycone";

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
        if (!b.ok) expect(JSON.stringify(b.error), `${id} Ø${dia} ${s.id}`).toMatch(/Too large|too small|Radome|radome/i);
      }
      // the cradle's groove is cut with the wire's own diameter (2 r): that cup builds
      const cup = skyconeParts(d, 0, false).find((s) => s.id === "skycone-cup");
      if (cup) expect(buildPart(M, cup, "t").ok, `${id} Ø${dia} cup`).toBe(true);
    }
  }, 240_000);
});
