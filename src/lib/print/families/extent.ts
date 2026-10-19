import type { V3 } from "../shapes";

/** Axis-aligned extent in mm. Families describe the printed hardware that stands in or next to the antenna with one of
 *  these (pure arithmetic from the same constants the parts are built from), so a case can enclose it. */
export type Ext = { lo: V3; hi: V3 };
/** The extent of points, each grown by r in every direction. */
export const around = (pts: V3[], r: number): Ext => ({
  lo: [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])) - r) as V3,
  hi: [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])) + r) as V3,
});
export const merge = (...es: Ext[]): Ext => ({
  lo: [0, 1, 2].map((i) => Math.min(...es.map((e) => e.lo[i]))) as V3,
  hi: [0, 1, 2].map((i) => Math.max(...es.map((e) => e.hi[i]))) as V3,
});
export const shift = (e: Ext, d: V3): Ext => ({ lo: [e.lo[0] + d[0], e.lo[1] + d[1], e.lo[2] + d[2]], hi: [e.hi[0] + d[0], e.hi[1] + d[1], e.hi[2] + d[2]] });
