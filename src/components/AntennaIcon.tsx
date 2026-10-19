import { useEffect, useState } from "react";
import type { AntennaDef } from "../lib/types";
import { SIZE, iconGeometry, type IconPaths } from "./iconGeometry";

/** id → icon paths (null = nothing to draw or the build threw). */
const cache = new Map<string, IconPaths | null>();
const queue: { def: AntennaDef; done: () => void }[] = [];
let running = false;

/** One default build per idle slot, so the first paint and the picker stay responsive. */
function pump() {
  if (running) return;
  running = true;
  const step = () => {
    const job = queue.shift();
    if (!job) { running = false; return; }
    if (!cache.has(job.def.id)) {
      try { cache.set(job.def.id, iconGeometry(job.def.build({ ...job.def.defaults }))); } catch { cache.set(job.def.id, null); }
    }
    job.done();
    schedule(step);
  };
  schedule(step);
}
function schedule(f: () => void) {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(f, { timeout: 500 }); else setTimeout(f, 16);
}

export function AntennaIcon({ def }: { def: AntennaDef }) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (cache.has(def.id)) return;
    let live = true;
    queue.push({ def, done: () => { if (live) bump((n) => n + 1); } });
    pump();
    return () => { live = false; };
  }, [def]);
  const g = cache.get(def.id);
  return (
    <svg className="pick-icon" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
      {g && (
        <g fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round">
          {g.dielectric && <path d={g.dielectric} fill="currentColor" fillOpacity="0.06" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />}
          {g.metal && <path d={g.metal} fill="currentColor" fillOpacity="0.28" vectorEffect="non-scaling-stroke" />}
          {g.wires && <path d={g.wires} vectorEffect="non-scaling-stroke" />}
        </g>
      )}
    </svg>
  );
}
