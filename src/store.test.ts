import { describe, expect, it, vi } from "vitest";
import { ANTENNAS } from "./lib/antennas";
import { get, set, setParam, shareHash } from "./store";

describe("store: frequency bands", () => {
  it("a band edit applies to every antenna type", () => {
    set({ type: "yagi" });
    setParam("bands", "430e6-440e6");
    for (const a of ANTENNAS) expect(get().params[a.id].bands, a.id).toBe("430e6-440e6");
    set({ type: "biquad" });
    expect(get().params.biquad.bands).toBe("430e6-440e6");
  });

  it("other params stay per type", () => {
    set({ type: "yagi" });
    const before = get().params.dipole;
    setParam("d", 0.004);
    expect(get().params.yagi.d).toBe(0.004);
    expect(get().params.dipole).toBe(before);
  });
});

describe("store: share link in the address bar", () => {
  it("follows every state change (debounced) and round-trips", () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const g = globalThis as unknown as { history?: unknown; location?: unknown };
    const old = { history: g.history, location: g.location };
    const loc = { pathname: "/x", search: "?a", hash: "" };
    g.history = { state: null, replaceState: (_a: unknown, _b: unknown, u: string) => { calls.push(u); loc.hash = u.slice(u.indexOf("#")); } };
    g.location = loc;
    try {
      set({ type: "yagi" });
      setParam("d", 0.003);
      setParam("bands", "430e6-440e6");
      expect(calls).toEqual([]);
      vi.advanceTimersByTime(400);
      expect(calls.length).toBe(1);
      expect(calls[0].startsWith("/x?a#t=yagi&")).toBe(true);
      const q = new URLSearchParams(loc.hash.slice(1));
      expect(q.get("d")).toBe("0.003");
      expect(q.get("bands")).toBe("430e6-440e6");
      expect(calls[0].slice(calls[0].indexOf("#"))).toBe(shareHash(get()));
      vi.advanceTimersByTime(400);
      expect(calls.length).toBe(1);   // unchanged: no extra replaceState
    } finally { vi.useRealTimers(); g.history = old.history; g.location = old.location; }
  });
});
