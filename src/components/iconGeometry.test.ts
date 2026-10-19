import { describe, expect, it } from "vitest";
import { ANTENNAS } from "../lib/antennas";
import { SIZE, iconGeometry } from "./iconGeometry";

describe("picker icons", () => {
  it("every default design gives non-empty paths inside the viewBox", () => {
    let total = 0;
    const rows: string[] = [];
    for (const a of ANTENNAS) {
      const t0 = performance.now();
      const g = iconGeometry(a.build({ ...a.defaults }));
      const ms = performance.now() - t0;
      total += ms;
      rows.push(`${a.id}: ${ms.toFixed(0)} ms`);
      expect(g, a.id).not.toBeNull();
      const all = [g!.wires, g!.metal, g!.dielectric].join(" ");
      expect(all.trim().length, a.id).toBeGreaterThan(0);
      const nums = (all.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      expect(nums.length, a.id).toBeGreaterThan(3);
      for (const n of nums) { expect(n, a.id).toBeGreaterThanOrEqual(0); expect(n, a.id).toBeLessThanOrEqual(SIZE); }
      expect(g!.wires.length + g!.metal.length + g!.dielectric.length, a.id).toBeLessThan(12000);
    }
    process.stdout.write(`icon build+geometry total ${total.toFixed(0)} ms for ${ANTENNAS.length} defs\n` + rows.join("\n") + "\n");
  });
});
