import type { Design, Vec3 } from "../../types";
import { copperBoxes, stackBox, stackZ } from "../../pcb";
import { MAX_SIZE, mm } from "../rules";
import { add, pieceBottoms, scale, sub, type V3 } from "../shapes";

/** Geometry helpers for shells, in mm. */
export type Box3 = { lo: V3; hi: V3 };
export type Style = "fpv" | "outdoor";
export const STYLE: Record<Style, { wall: number; gap: number }> = { fpv: { wall: 1.2, gap: 1 }, outdoor: { wall: 1.6, gap: 1 } };
export const FPV_HZ = 2e9;
const FOOT = 170;                          // largest dome diameter

const mmv = (p: Vec3): V3 => [mm(p[0]), mm(p[1]), mm(p[2])];
export const grow = (b: Box3, k: number): Box3 => ({ lo: [b.lo[0] - k, b.lo[1] - k, b.lo[2] - k], hi: [b.hi[0] + k, b.hi[1] + k, b.hi[2] + k] });
export const size = (b: Box3): V3 => [b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]];
export const inside = (b: Box3, p: V3) => p.every((v, i) => v >= b.lo[i] - 1e-9 && v <= b.hi[i] + 1e-9);
export const styleOf = (d: Design): Style => (d.f >= FPV_HZ ? "fpv" : "outdoor");

function bounds(pts: V3[]): Box3 {
  const lo = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i]))) as V3, hi = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i]))) as V3;
  return { lo, hi };
}

/** The antenna itself: live wires (with their radius), plates and the PCB board (z 0..h). */
export function envelope(d: Design): Box3 {
  const pts: V3[] = [];
  for (const w of d.wires) {
    if (w.drawOnly || w.necOnly) continue;
    const r = mm(w.r);
    for (const p of [mmv(w.a), mmv(w.b)]) pts.push(sub(p, [r, r, r]), add(p, [r, r, r]));
  }
  // PCB copper plates (the arm can overrun the board): the board united with every copper rectangle in x/y, z -t .. h+t
  if (d.pcb) {
    const b = stackBox(d.pcb), [z0, z1] = stackZ(d.pcb), t = mm(d.pcb.t), xs = [b.x0, b.x1], ys = [b.y0, b.y1];
    for (const q of copperBoxes(d.pcb)) { xs.push(q.x0, q.x1); ys.push(q.y0, q.y1); }
    pts.push([mm(Math.min(...xs)), mm(Math.min(...ys)), mm(z0) - t], [mm(Math.max(...xs)), mm(Math.max(...ys)), mm(z1) + t]);
  } else for (const pl of d.plates ?? []) for (const p of pl.pts) pts.push(mmv(p));
  return bounds(pts);
}

/** Feed point from the design's feed wire; antennas without one (collinear) feed at the origin. */
export function feedPoint(d: Design): V3 {
  if (!d.feed) return [0, 0, 0];
  const w = d.wires[d.feed.wire], a = mmv(w.a), b = mmv(w.b);
  return d.feed.at === "start" ? a : d.feed.at === "end" ? b : scale(add(a, b), 0.5);
}

/** A clamshell round `inner` with this wall fits the bed in every extent. */
export const boxFits = (inner: Box3, wall: number) => Math.max(...size(grow(inner, wall))) <= MAX_SIZE;
/** A dome of inner radius r whose body is H tall (`domeHeight`, base to cone apex) fits: diameter within FOOT, at most
 *  3 stacked pieces. */
export const domeFits = (r: number, H: number, wall: number) => 2 * (r + wall) <= FOOT && pieceBottoms(H).length <= 3;
