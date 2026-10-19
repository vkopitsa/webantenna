import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { CLEAR } from "../rules";
import { box, rod } from "../shapes";
import { grow, type Box3 } from "./geometry";

/** Two-half box round an inner cavity; the outer size is the cavity plus two walls, nothing sticks out. The halves press
 *  together on a tongue: a LIP-wide, up to LIP_H-tall ring on the bottom half that stands inside the outer skin (SKIN) of
 *  the top half's wall with a CLEAR fit, its inner face flush with or a little proud of the cavity face (the gap to the
 *  antenna is 1 mm, so that is always clear). The caller's cuts (coax, connector holes) go through both halves. */
export type ClamOpts = { inner: Box3; wall: number; splitZ: number; cuts?: Manifold[]; drain?: boolean; adds?: { bottom?: Manifold[]; top?: Manifold[] } };

const LIP_H = 3;      // tongue height above the split
const LIP = 0.8;      // tongue width
const SKIN = 0.5;     // outer skin of the top half's wall beside the tongue

/** The drain hole (outdoor): a Ø3 hole through the floor near the low corner, reaching 1 mm into the cavity. */
export const DRAIN = 3;
export function drainAt(inner: Box3): [number, number] {
  const off = Math.min(4, Math.min(inner.hi[0] - inner.lo[0], inner.hi[1] - inner.lo[1]) / 2 - 1.5);
  return [inner.lo[0] + off, inner.lo[1] + off];
}

export function clamshell(M: ManifoldToplevel, o: ClamOpts): [Manifold, Manifold] {
  if (!(o.splitZ > o.inner.lo[2] && o.splitZ < o.inner.hi[2])) throw new Error("clamshell: splitZ must lie strictly inside the cavity");
  const out = grow(o.inner, o.wall);
  // tongue height: it must not reach into the roof; with too little room (or a wall too thin for a skin) the joint is flat
  const lipH = Math.min(LIP_H, o.inner.hi[2] - o.splitZ - CLEAR);
  const uo = o.wall - SKIN - CLEAR, ui = uo - LIP;      // tongue faces, measured outwards from the cavity face
  const lipped = lipH >= 1 && uo > 0.2;
  const z0 = out.lo[2];
  const body = box(M, out.lo, out.hi).subtract(box(M, o.inner.lo, o.inner.hi));
  const cuts: Manifold[] = [...(o.cuts ?? [])];
  if (o.drain) { const [x, y] = drainAt(o.inner); cuts.push(rod(M, [x, y, z0 - 1], [x, y, o.inner.lo[2] + 1], DRAIN)); }
  let bottom = body.trimByPlane([0, 0, -1], -o.splitZ);
  let top = body.trimByPlane([0, 0, 1], o.splitZ);
  if (lipped) {
    const band = (a: number, b: number, h: number) => box(M, [o.inner.lo[0] - a, o.inner.lo[1] - a, o.splitZ - 0.01], [o.inner.hi[0] + a, o.inner.hi[1] + a, o.splitZ + h]).subtract(box(M, [o.inner.lo[0] - b, o.inner.lo[1] - b, o.splitZ - 1], [o.inner.hi[0] + b, o.inner.hi[1] + b, o.splitZ + h + 1]));
    bottom = bottom.add(band(uo, ui, lipH));
    // the top half keeps only its outer skin beside the tongue (and CLEAR above it)
    top = top.subtract(box(M, [o.inner.lo[0] - (o.wall - SKIN), o.inner.lo[1] - (o.wall - SKIN), o.splitZ - 1], [o.inner.hi[0] + (o.wall - SKIN), o.inner.hi[1] + (o.wall - SKIN), o.splitZ + lipH + CLEAR]));
  }
  for (const a of o.adds?.bottom ?? []) bottom = bottom.add(a);
  for (const a of o.adds?.top ?? []) top = top.add(a);
  for (const c of cuts) { bottom = bottom.subtract(c); top = top.subtract(c); }    // one at a time (manifold batch-union defect)
  return [bottom, top];
}
