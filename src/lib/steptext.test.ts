import { describe, expect, it } from "vitest";
import { ANTENNAS } from "./antennas";
import { BUILD_STRINGS, STEP_TEXT, buildPack } from "./build";

const LIST = Object.values(STEP_TEXT).flatMap((g) => Object.values(g) as string[]);
const ALL = new Set<string>(LIST);

describe("STEP_TEXT", () => {
  it("every pack step of every antenna is a STEP_TEXT sentence", () => {
    for (const a of ANTENNAS) {
      for (const m of buildPack(a, a.defaults).steps) {
        if (!ALL.has(m.s)) throw new Error(`${a.id}: stray step "${m.s}"`);
      }
    }
  });
  it("BUILD_STRINGS holds every STEP_TEXT sentence", () => {
    const b = new Set<string>(BUILD_STRINGS);
    for (const s of ALL) expect(b.has(s), s).toBe(true);
  });
  it("STEP_TEXT has no duplicates", () => {
    expect(ALL.size).toBe(LIST.length);
  });
});
