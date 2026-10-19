import type { ManifoldToplevel } from "manifold-3d";
import type { Design, Params } from "../../types";
import { num } from "../../types";
import { msg, type PartSpec } from "../parts";
import { CLEAR, MAX_SIZE, mm } from "../rules";
import { pieceBottoms, rod, type V3 } from "../shapes";
import { helixGeometry } from "../families/former";
import { disconeGeometry, disconeHardwareBox } from "../families/hub";
import { boxFits, domeFits, envelope, feedPoint, grow, STYLE, styleOf, type Box3, type Style } from "./geometry";
import { clamshell } from "./clamshell";
import { dome, domeHeight, domeOffset, type DomeOpts } from "./dome";
import { hardwareBox } from "./hardware";
import { pcbCavity, pcbShell, pcbSplit } from "./pcbbox";

/** Shells: dome radome or clamshell box; antennas that fit neither within the printer bed get no shell. */
export const SHELL_STRINGS = [
  "Radome shell",
  "Enclosure",
  "Covers the antenna with a {0} wall, keeping {1} of air round the radiator.",
  "A plastic shell lowers the resonance by about 1–3 %: retune with Trim (printed antennas: check with the FDTD simulation).",
];

/** How-to steps, in order. */
export const SHELL_HOWTO = {
  dome: [
    "Print the pieces standing on their wide end; glue each skirt over the piece below.",
    "Build and tune the antenna first, then lower the radome over it.",
    "Screw the flange to the reflector with three M3 screws (or push the mast through the bottom plate), keeping the drain hole at the bottom.",
  ],
  box: [
    "Print each half on its flat outer face.",
    "Lay the antenna into the bottom half with the coax through the hole in its floor.",
    "Press the top half onto the lip until the halves close; outdoors, add a drop of glue or a turn of tape round the joint.",
  ],
  pcb: [
    "Print each half on its flat outer face.",
    "Solder the coax pigtail (or the SMA jack under a probe feed) to the board, then lay the board in the bottom half between its edge stops, with the coax through its hole.",
    "Press the top half onto the lip until the halves close; where there are no posts, fix the board with a drop of hot glue next to the coax. Outdoors, add a drop of glue or a turn of tape round the joint.",
  ],
  /** Cloverleaf radome, before the last step. */
  clover: ["Cloverleaf: push the connector down through the hole in the bottom piece before gluing the pieces above, and fix it there with a drop of glue."],
};

const COAX = 3.5;                     // the coax hole through the box floor (RG-174 / RG-316 class cable)
/** Hole in the cloverleaf radome's bottom plate: an SMA plug's coupling nut (8 mm hex) passes through. */
const CLOVER_JACK = 9.5;

export type ShellPlan =
  | { kind: "dome"; style: Style; inner: Box3; opts: DomeOpts; toWorld: V3; pieceZ: (i: number, n: number) => number }
  | { kind: "box"; style: Style; inner: Box3; splitZ: number; gland: V3; toWorld?: undefined; pieceZ?: undefined }
  | { kind: "none"; style: Style };

function domePlan(defId: string, p: Params, d: Design, s: Style): DomeOpts | null {
  const { wall, gap } = STYLE[s];
  if (defId === "helix") {
    const g = helixGeometry(d), fr = g.R + g.wireD / 2 + 8;
    return { r: g.R + g.wireD / 2 + gap, z0: 0, z1: Math.max(g.H, g.top + g.wireD / 2) + gap, wall, base: { kind: "flange", pocketR: fr + CLEAR, pocketH: 2 + CLEAR, ringR: fr + 10, holeR: fr + 5 }, drain: s === "outdoor" };
  }
  if (defId === "cloverleaf" || defId === "pagoda" || defId.startsWith("skycone")) {
    // the "mushroom": a round radome over the leaves (or the pagoda's boards, or the cones), the connector through the bottom plate
    const e = envelope(d), r = Math.max(...[e.lo[0], e.lo[1], e.hi[0], e.hi[1]].map(Math.abs)) + gap;
    return { r, z0: e.lo[2] - gap, z1: e.hi[2] + gap, wall, base: { kind: "mast", mastD: CLOVER_JACK }, drain: s === "outdoor" };
  }
  if (defId === "discone") {
    const g = disconeGeometry(d), e = envelope(d);
    // wide enough for the printed hub (its disc support and cone sockets) as well as the rods
    const r = Math.max(...[e.lo[0], e.lo[1], e.hi[0], e.hi[1]].map(Math.abs), disconeHardwareBox(p, d).hi[0]) + gap;
    return { r, z0: e.lo[2] - gap, z1: Math.max(g.top, e.hi[2]) + gap, wall, base: { kind: "mast", mastD: mm(num(p, "mast", 25e-3)) }, drain: s === "outdoor" };
  }
  return null;
}

/** Radius of the dome's footprint on the bed: its wall, or the flange ring when that is wider. */
const footprint = (o: DomeOpts) => Math.max(o.r + o.wall, o.base.kind === "flange" ? o.base.ringR : 0);

/** A mast or connector hole leaves a ring of at least a wall in the bottom plate. */
const boreFits = (o: DomeOpts) => o.base.kind !== "mast" || (o.base.mastD + CLEAR) / 2 + o.wall <= o.r;

/** Printed antennas (a board model, or the PCB loop's plain box) get the PCB enclosure. */
export const printedShell = (defId: string, d: Design) => (!!d.pcb && !d.pcb.levels?.length) || defId === "pcbloop";

/** Pure choice of the shell (no building): a dome where one fits, else the tight clamshell if it fits the bed in every
 *  extent (round the wires and the family's printed hardware), else none. */
export function shellPlan(defId: string, p: Params, d: Design): ShellPlan {
  const style = styleOf(d), { wall, gap } = STYLE[style];
  if (printedShell(defId, d)) {
    const inner = d.pcb ? pcbCavity(d) : grow(envelope(d), gap);
    return boxFits(inner, wall) ? { kind: "box", style, inner, splitZ: d.pcb ? pcbSplit(d) : (inner.lo[2] + inner.hi[2]) / 2, gland: [0, 0, 0] } : { kind: "none", style };
  }
  const dp = domePlan(defId, p, d, style);
  // the sky-tilted bicones bring their own cover (families/skycone.ts): the plan only describes it as a dome
  if (dp && ((2 * footprint(dp) <= MAX_SIZE && domeFits(dp.r, domeHeight(dp), wall) && boreFits(dp)) || defId.startsWith("skycone"))) {
    const H = domeHeight(dp);
    return { kind: "dome", style, inner: { lo: [-dp.r, -dp.r, dp.z0], hi: [dp.r, dp.r, dp.z1] }, opts: dp, toWorld: [0, 0, domeOffset(dp)], pieceZ: (i, n) => (n > 1 ? pieceBottoms(H)[i] : 0) };
  }
  // full box: the coax goes down through the floor at the feed (kept inside the outer footprint)
  // the cavity holds the wires and the family's printed hardware (centre insulator, hub, spreaders ...)
  const hw = hardwareBox(defId, p, d), e = envelope(d);
  const inner = grow(hw ? { lo: [0, 1, 2].map((i) => Math.min(e.lo[i], hw.lo[i])) as V3, hi: [0, 1, 2].map((i) => Math.max(e.hi[i], hw.hi[i])) as V3 } : e, gap);
  if (!boxFits(inner, wall)) return { kind: "none", style };
  const fp = feedPoint(d), o = grow(inner, wall), m = COAX / 2 + 0.6, gland: V3 = [...fp];
  for (const i of [0, 1]) gland[i] = o.hi[i] - o.lo[i] < 2 * m ? (o.lo[i] + o.hi[i]) / 2 : Math.min(Math.max(fp[i], o.lo[i] + m), o.hi[i] - m);
  return { kind: "box", style, inner, splitZ: Math.min(Math.max(fp[2], inner.lo[2] + 1), inner.hi[2] - 1), gland };
}

/** What the case will be, known before anything is built: its style and outer extent in mm (world frame), or that there
 *  is none. A dome also gives its round silhouette. null: the family brings its own cover (sky-cone). */
export type ShellOutline =
  | { kind: "box" | "dome"; style: Style; wall: number; gap: number; lo: V3; hi: V3; round?: { r: number; z0: number; z1: number; apex: number } }
  | { none: "too large" };
export function shellOutline(defId: string, p: Params, d: Design): ShellOutline | null {
  if (defId.startsWith("skycone")) return null;
  const plan = shellPlan(defId, p, d);
  if (plan.kind === "none") return { none: "too large" };
  const { wall, gap } = STYLE[plan.style];
  if (plan.kind === "box") { const o = grow(plan.inner, wall); return { kind: "box", style: plan.style, wall, gap, lo: o.lo, hi: o.hi }; }
  const o = plan.opts, off = plan.toWorld[2], H = domeHeight(o), f = footprint(o), top = o.z1 - off;
  return {
    kind: "dome", style: plan.style, wall, gap, lo: [-f, -f, off], hi: [f, f, off + H],
    round: { r: o.r + wall, z0: off, z1: off + top + (Math.SQRT2 - 1) * wall, apex: off + H },
  };
}

/** How-to steps. */
function howTo(defId: string, kind: "dome" | "box", printed: boolean): string[] {
  if (printed) return SHELL_HOWTO.pcb;
  if (kind === "dome" && defId === "cloverleaf") return [...SHELL_HOWTO.dome.slice(0, -1), ...SHELL_HOWTO.clover, SHELL_HOWTO.dome[SHELL_HOWTO.dome.length - 1]];
  return SHELL_HOWTO[kind];
}

export function shellFor(defId: string, p: Params, d: Design, printed: boolean): PartSpec | null {
  const plan = shellPlan(defId, p, d);
  if (plan.kind === "none") return null;
  const { wall, gap } = STYLE[plan.style];
  const L = (x: number) => ({ len: x / 1000 });
  return {
    id: "shell", title: SHELL_STRINGS[plan.kind === "dome" ? 0 : 1], use: "holder", qty: 1,
    purpose: msg(SHELL_STRINGS[2], L(wall), L(gap)), warn: msg(SHELL_STRINGS[3]),
    howTo: howTo(defId, plan.kind, printed).map((s) => msg(s)),   // the PCB loop has no board model: a plain box
    build: (M: ManifoldToplevel) => {
      if (plan.kind === "dome") return dome(M, plan.opts);
      if (printed) return pcbShell(M, d);
      const g = plan.gland, cuts = [rod(M, [g[0], g[1], plan.inner.lo[2] - wall - 2], [g[0], g[1], plan.inner.lo[2] + 1], COAX)];
      return clamshell(M, { inner: plan.inner, wall, splitZ: plan.splitZ, cuts, drain: plan.style === "outdoor" });
    },
  };
}
