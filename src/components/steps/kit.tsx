import { createContext, useContext, useId, type ReactNode } from "react";

/** Translator, same shape as useT(). */
export type T = (s: string, ...a: (string | number)[]) => string;

/** One build-step picture: a looping SVG drawn with the primitives below. */
export interface Scene {
  /** loop length in seconds, 3–5 */
  dur: number;
  /** seconds into the loop that show the finished state (0 < still ≤ dur) */
  still: number;
  /** viewBox, default "0 0 320 240" */
  view?: string;
  /** SVG children; animate only through Rot / Move / Fade / Draw / ScaleY so every <animate*> shares the scene's dur */
  draw: (t: T) => ReactNode;
}

/** The scene's loop length; SceneSvg provides it through <Timed>, the animated helpers read it. */
const DurContext = createContext(4);

/** Gives every animated helper below the scene's loop length. */
export function Timed({ dur, children }: { dur: number; children?: ReactNode }) {
  return <DurContext.Provider value={dur}>{children}</DurContext.Provider>;
}

/** Outline / text colour of every part (the theme's foreground). */
export const FG = "var(--fg)";

/** Common SMIL timing attributes from the scene's dur. */
function useAnim(times: number[]) {
  const dur = useContext(DurContext);
  return { dur: `${dur}s`, repeatCount: "indefinite", begin: "0s", keyTimes: times.join(";") };
}

/** Unique, marker-safe SVG id ("sp-" prefix) per rendered instance. */
function useSvgId(name: string) {
  return `sp-${name}-${useId().replace(/[^A-Za-z0-9]/g, "")}`;
}

const tf = (x: number, y: number, rot = 0) => `translate(${x} ${y})${rot ? ` rotate(${rot})` : ""}`;

// ---------- static parts ----------

/** A copper wire along `d`; `w` is the stroke width. */
export function Wire({ d, w = 5 }: { d: string; w?: number }) {
  return <g><path d={d} fill="none" stroke="var(--copper)" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" /></g>;
}

/** A red tick (bend / cut mark), across a horizontal wire at (x, y) unless rotated. */
export function Mark({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return <g transform={tf(x, y, rot)}><line x1={0} y1={-8} x2={0} y2={8} stroke="var(--mark)" strokeWidth={2.5} strokeLinecap="round" /></g>;
}

/** A bolt seen end-on: grey, or yellow when it is a stop bolt. */
export function Bolt({ x, y, r = 8, head = "round", stop = false }: { x: number; y: number; r?: number; head?: "hex" | "round" | "csk"; stop?: boolean }) {
  const fill = stop ? "var(--stop)" : "var(--bolt)";
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <g transform={tf(x, y)}>
      {head === "hex"
        ? <polygon points={hex} fill={fill} stroke={FG} strokeWidth={1.5} strokeLinejoin="round" />
        : <circle r={r} fill={fill} stroke={FG} strokeWidth={1.5} />}
      {head === "csk"
        ? <line x1={-r * 0.6} y1={0} x2={r * 0.6} y2={0} stroke={FG} strokeWidth={1.5} />
        : <circle r={Math.max(1.5, r * 0.3)} fill="none" stroke={FG} strokeWidth={1.2} />}
    </g>
  );
}

/** A 3D-printed part: an outline path or a rounded rectangle. */
export function Plastic(p: { d: string } | { x: number; y: number; w: number; h: number; rx?: number }) {
  const paint = { fill: "var(--plastic)", stroke: "var(--plastic-edge)", strokeWidth: 1.5, strokeLinejoin: "round" as const };
  return <g>{"d" in p ? <path d={p.d} {...paint} /> : <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx ?? 8} {...paint} />}</g>;
}

/** An 11 px label, with a leader line to `to` when given (the text has a halo so the line never crosses it). */
export function Label({ x, y, text, to, anchor = "start" }: { x: number; y: number; text: string; to?: [number, number]; anchor?: "start" | "middle" | "end" }) {
  return (
    <g>
      {to && <line x1={x} y1={y - 4} x2={to[0]} y2={to[1]} stroke={FG} strokeWidth={0.8} />}
      <text x={x} y={y} fontSize={11} fill={FG} textAnchor={anchor} fontFamily="system-ui, sans-serif"
        stroke="var(--panel)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">{text}</text>
    </g>
  );
}

/** A dashed accent arrow along `d` (the motion to make); `both` puts a head on each end (to and fro). */
export function Arrow({ d, both = false }: { d: string; both?: boolean }) {
  const id = useSvgId("arr");
  return (
    <g>
      <defs>
        <marker id={id} markerWidth={10} markerHeight={10} refX={5} refY={5} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M0 0 L10 5 L0 10z" fill="var(--accent)" />
        </marker>
      </defs>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={3} strokeDasharray="7 4" markerStart={both ? `url(#${id})` : undefined} markerEnd={`url(#${id})`} />
    </g>
  );
}

/** Round-nose pliers seen from above, jaws pointing along +x from (x, y). */
export function Pliers({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={tf(x, y, rot)}>
      <path d="M-95 -16 Q-50 -12 -12 -3" fill="none" stroke={FG} strokeWidth={9} strokeLinecap="round" />
      <path d="M-95 -16 Q-50 -12 -12 -3" fill="none" stroke="var(--coax)" strokeWidth={7} strokeLinecap="round" />
      <path d="M-95 16 Q-50 12 -12 3" fill="none" stroke={FG} strokeWidth={9} strokeLinecap="round" />
      <path d="M-95 16 Q-50 12 -12 3" fill="none" stroke="var(--coax)" strokeWidth={7} strokeLinecap="round" />
      <circle cx={-10} cy={0} r={5} fill="var(--bolt)" stroke={FG} strokeWidth={1.2} />
      <path d="M-6 -4 L34 -1.5 L34 0 L-6 0 Z" fill="var(--bolt)" stroke={FG} strokeWidth={1} strokeLinejoin="round" />
      <path d="M-6 4 L34 1.5 L34 0 L-6 0 Z" fill="var(--bolt)" stroke={FG} strokeWidth={1} strokeLinejoin="round" />
    </g>
  );
}

/** Side cutters seen from above, short bevelled jaws along +x from (x, y). */
export function Cutters({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={tf(x, y, rot)}>
      <path d="M-90 -16 Q-45 -12 -10 -4" fill="none" stroke={FG} strokeWidth={9} strokeLinecap="round" />
      <path d="M-90 -16 Q-45 -12 -10 -4" fill="none" stroke="var(--coax)" strokeWidth={7} strokeLinecap="round" />
      <path d="M-90 16 Q-45 12 -10 4" fill="none" stroke={FG} strokeWidth={9} strokeLinecap="round" />
      <path d="M-90 16 Q-45 12 -10 4" fill="none" stroke="var(--coax)" strokeWidth={7} strokeLinecap="round" />
      <path d="M-10 -8 Q8 -12 18 0 L-10 0 Z" fill="var(--bolt)" stroke={FG} strokeWidth={1} strokeLinejoin="round" />
      <path d="M-10 8 Q8 12 18 0 L-10 0 Z" fill="var(--bolt)" stroke={FG} strokeWidth={1} strokeLinejoin="round" />
      <circle cx={-6} cy={0} r={4} fill="var(--bolt)" stroke={FG} strokeWidth={1.2} />
    </g>
  );
}

/** A soldering iron, tip at (x, y), handle along −x. */
export function Iron({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={tf(x, y, rot)}>
      <rect x={-120} y={-8} width={62} height={16} rx={7} fill="var(--coax)" stroke={FG} strokeWidth={1} />
      <rect x={-58} y={-4} width={44} height={8} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
      <path d="M-14 -4 L0 0 L-14 4 Z" fill="var(--solder)" stroke={FG} strokeWidth={1} strokeLinejoin="round" />
    </g>
  );
}

/** A hand (outline, from above), fingertips along +x from (x, y). */
export function Hand({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={tf(x, y, rot)}>
      <path
        d="M-60 -22 L-22 -22 Q-4 -22 -2 -14 Q0 -8 -6 -8 L-22 -8 L-4 -6 Q4 -4 2 2 Q0 6 -6 6 L-22 6 L-8 8 Q0 10 -2 15 Q-4 20 -10 20 L-26 20 Q-36 26 -50 24 L-60 22 Z M-30 -22 Q-26 -36 -14 -36 Q-6 -34 -12 -26 L-22 -22"
        fill="var(--panel)" stroke={FG} strokeWidth={1.5} strokeLinejoin="round" />
    </g>
  );
}

/** A coax cable end at (x, y), cable running along −x; `stripped` shows centre, dielectric and braid. */
export function Coax({ x, y, rot = 0, stripped = false }: { x: number; y: number; rot?: number; stripped?: boolean }) {
  const cut = stripped ? -36 : 0;
  return (
    <g transform={tf(x, y, rot)}>
      <rect x={-130} y={-8} width={130 + cut} height={16} rx={stripped ? 0 : 3} fill="var(--coax)" stroke={FG} strokeWidth={1} />
      {stripped && <>
        <rect x={-36} y={-7} width={12} height={14} fill="var(--solder)" stroke={FG} strokeWidth={1} />
        <rect x={-24} y={-5} width={12} height={10} fill="var(--plastic)" stroke={FG} strokeWidth={1} />
        <line x1={-12} y1={0} x2={0} y2={0} stroke="var(--copper)" strokeWidth={3} strokeLinecap="round" />
      </>}
    </g>
  );
}

/** A piece of FR-4 board with a copper trace and pad. */
export function Board({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const ty = y + h / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="var(--fr4)" stroke={FG} strokeWidth={1} />
      <rect x={x} y={ty - 3} width={w * 0.6} height={6} fill="var(--copper)" />
      <rect x={x + w * 0.6} y={ty - 8} width={16} height={16} rx={2} fill="var(--copper)" />
    </g>
  );
}

/** A steel ruler from (x, y), `len` user units long, ticks every 10 and long ticks every 50. */
export function Ruler({ x, y, len }: { x: number; y: number; len: number }) {
  const ticks = [];
  for (let i = 0; i <= len; i += 10) ticks.push(<line key={i} x1={x + i} y1={y} x2={x + i} y2={y + (i % 50 === 0 ? 9 : 5)} stroke={FG} strokeWidth={0.8} />);
  return (
    <g>
      <rect x={x - 4} y={y} width={len + 8} height={18} rx={2} fill="var(--sheet)" stroke={FG} strokeWidth={1} />
      {ticks}
    </g>
  );
}

/** A cordless drill seen from the side, bit tip at (x, y), bit along +x, handle below the body. */
export function Drill({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={tf(x, y, rot)}>
      <rect x={-112} y={4} width={24} height={54} rx={6} fill="var(--coax)" stroke={FG} strokeWidth={1.2} />
      <rect x={-126} y={-17} width={78} height={30} rx={8} fill="var(--coax)" stroke={FG} strokeWidth={1.2} />
      <rect x={-50} y={-9} width={16} height={18} rx={2} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
      <path d="M-34 -2.5 L-4 -2.5 L0 0 L-4 2.5 L-34 2.5 Z" fill="var(--bolt)" stroke={FG} strokeWidth={1} strokeLinejoin="round" />
    </g>
  );
}

/** A green check mark (the result is right) centred at (x, y). */
export function Check({ x, y }: { x: number; y: number }) {
  return (
    <g transform={tf(x, y)}>
      <circle r={13} fill="var(--panel)" stroke="var(--ok)" strokeWidth={2} />
      <path d="M-6 0 L-1.5 5 L7 -5" fill="none" stroke="var(--ok)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/** Children clipped to a rectangle (a curve that slides inside a screen). */
export function Clip({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: ReactNode }) {
  const id = useSvgId("clip");
  return (
    <g>
      <defs><clipPath id={id}><rect x={x} y={y} width={w} height={h} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </g>
  );
}

/** A centre insulator seen from above: printed block, antenna wires out to both sides (terminals: see Terminals). */
export function FeedBlock({ x, y, wires = [20, 300] }: { x: number; y: number; wires?: [number, number] }) {
  return (
    <g>
      <Plastic x={x - 38} y={y - 15} w={76} h={30} rx={6} />
      <Wire d={`M${wires[0]} ${y} L${x - 20} ${y}`} />
      <Wire d={`M${x + 20} ${y} L${wires[1]} ${y}`} />
    </g>
  );
}

/** The two screw terminals of a FeedBlock at (x ∓ 20, y); draw them after the leads so the leads go under the heads. */
export function Terminals({ x, y, r = 6 }: { x: number; y: number; r?: number }) {
  return <g><Bolt x={x - 20} y={y} r={r} head="hex" /><Bolt x={x + 20} y={y} r={r} head="hex" /></g>;
}

/** A solder joint (blob) at (x, y). */
export function Joint({ x, y }: { x: number; y: number }) {
  return <g><circle cx={x} cy={y} r={6} fill="var(--solder)" stroke={FG} strokeWidth={1} /></g>;
}

/** A small chart screen: frame and axes; children (curves) are clipped to it. */
export function Screen({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="var(--panel)" stroke={FG} strokeWidth={1.2} />
      <path d={`M${x + 8} ${y + 6} L${x + 8} ${y + h - 8} L${x + w - 6} ${y + h - 8}`} fill="none" stroke="var(--muted)" strokeWidth={1} />
      <Clip x={x + 1} y={y + 1} w={w - 2} h={h - 2}>{children}</Clip>
    </g>
  );
}

/**
 * An SWR-style curve from x0 to x1: high at the edges (`top`), one smooth dip down to `bottom` at x = `at`.
 * With `draw` it is revealed left to right between those loop fractions (see Draw).
 */
export function SwrCurve({ x0, x1, top, bottom, at, stroke = "var(--series-1)", draw }: { x0: number; x1: number; top: number; bottom: number; at: number; stroke?: string; draw?: [number, number] }) {
  const d = `M${x0} ${top} C${at - 40} ${top} ${at - 16} ${bottom} ${at} ${bottom} C${at + 16} ${bottom} ${at + 40} ${top} ${x1} ${top}`;
  if (draw) return <Draw d={d} times={draw} w={2} stroke={stroke} />;
  return <g><path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" /></g>;
}

/** An antenna analyser / VNA: case with a screen (children go on the screen, clipped) and an RF port at the top right. */
export function Analyser({ x, y, w = 130, h = 140, children }: { x: number; y: number; w?: number; h?: number; children?: ReactNode }) {
  return (
    <g>
      <rect x={x + w - 26} y={y - 10} width={14} height={12} fill="var(--solder)" stroke={FG} strokeWidth={1} />
      <rect x={x} y={y} width={w} height={h} rx={10} fill="var(--coax)" stroke={FG} strokeWidth={1.5} />
      <Screen x={x + 10} y={y + 12} w={w - 20} h={h * 0.55}>{children}</Screen>
      {[0, 1, 2].map((i) => <circle key={i} cx={x + w * (0.3 + 0.2 * i)} cy={y + h * 0.83} r={6} fill="var(--bolt)" stroke={FG} strokeWidth={1} />)}
    </g>
  );
}

/** A flat metal plate or sheet (side view: a thin rectangle; from above: its outline). */
export function Plate({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <g><rect x={x} y={y} width={w} height={h} fill="var(--sheet)" stroke={FG} strokeWidth={1.2} /></g>;
}

/** A nylon standoff seen from the side, from y0 (top) to y1 (bottom), centred on x. */
export function Standoff({ x, y0, y1, w = 12 }: { x: number; y0: number; y1: number; w?: number }) {
  return (
    <g>
      <rect x={x - w / 2} y={y0} width={w} height={y1 - y0} fill="var(--panel)" stroke={FG} strokeWidth={1.2} />
      <line x1={x - w / 2 + 3} y1={y0 + 3} x2={x - w / 2 + 3} y2={y1 - 3} stroke="var(--muted)" strokeWidth={1} />
    </g>
  );
}

/** A dimension line between two points, with arrowheads at both ends. */
export function Dim({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const id = useSvgId("dim");
  return (
    <g>
      <defs>
        <marker id={id} markerWidth={8} markerHeight={8} refX={8} refY={4} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
          <path d="M0 0 L8 4 L0 8z" fill={FG} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={FG} strokeWidth={1.2} markerStart={`url(#${id})`} markerEnd={`url(#${id})`} />
    </g>
  );
}

/** A plated via from above: tinned ring with the drilled hole. */
export function Via({ x, y }: { x: number; y: number }) {
  return <g><circle cx={x} cy={y} r={4.5} fill="var(--solder)" stroke={FG} strokeWidth={0.8} /><circle cx={x} cy={y} r={1.8} fill="var(--coax)" /></g>;
}

/** An SMD capacitor from above, centred at (x, y), terminals at both ends along x unless rotated. */
export function Cap({ x, y, w = 20, h = 10, rot = 0 }: { x: number; y: number; w?: number; h?: number; rot?: number }) {
  const e = w * 0.22;
  return (
    <g transform={tf(x, y, rot)}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1.5} fill="var(--panel2)" stroke={FG} strokeWidth={1} />
      <rect x={-w / 2} y={-h / 2} width={e} height={h} fill="var(--solder)" stroke={FG} strokeWidth={1} />
      <rect x={w / 2 - e} y={-h / 2} width={e} height={h} fill="var(--solder)" stroke={FG} strokeWidth={1} />
    </g>
  );
}

/**
 * A trimmer capacitor from above, centred at (x, y), `s` = body size: square body, round rotor with a screwdriver slot;
 * `turn` = [degrees, loop fractions] turns the slot (see Rot).
 */
export function Trimmer({ x, y, s = 24, turn }: { x: number; y: number; s?: number; turn?: [number[], number[]] }) {
  const r = s * 0.32;
  const slot = <line x1={x - r * 0.8} y1={y} x2={x + r * 0.8} y2={y} stroke={FG} strokeWidth={Math.max(1.5, s * 0.06)} strokeLinecap="round" />;
  return (
    <g>
      <rect x={x - s / 2} y={y - s / 2} width={s} height={s} rx={2} fill="var(--panel)" stroke={FG} strokeWidth={1.2} />
      <rect x={x - s / 2 - 2} y={y - s / 2 + s * 0.3} width={4} height={s * 0.4} fill="var(--solder)" stroke={FG} strokeWidth={0.8} />
      <rect x={x + s / 2 - 2} y={y - s / 2 + s * 0.3} width={4} height={s * 0.4} fill="var(--solder)" stroke={FG} strokeWidth={0.8} />
      <circle cx={x} cy={y} r={r} fill="var(--bolt)" stroke={FG} strokeWidth={1.2} />
      {turn ? <Rot about={[x, y]} values={turn[0]} times={turn[1]}>{slot}</Rot> : slot}
    </g>
  );
}

/** A flat-blade screwdriver, tip at (x, y), handle along −x. */
export function Screwdriver({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={tf(x, y, rot)}>
      <rect x={-118} y={-9} width={62} height={18} rx={8} fill="var(--coax)" stroke={FG} strokeWidth={1.2} />
      <rect x={-56} y={-2.5} width={52} height={5} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
      <path d="M-4 -3.5 L0 -3.5 L0 3.5 L-4 3.5 Z" fill="var(--bolt)" stroke={FG} strokeWidth={1} strokeLinejoin="round" />
    </g>
  );
}

/** Tin snips seen from above, long straight blades along +x from (x, y). */
export function Snips({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={tf(x, y, rot)}>
      <path d="M-100 -18 Q-55 -14 -14 -5" fill="none" stroke={FG} strokeWidth={11} strokeLinecap="round" />
      <path d="M-100 -18 Q-55 -14 -14 -5" fill="none" stroke="var(--coax)" strokeWidth={9} strokeLinecap="round" />
      <path d="M-100 18 Q-55 14 -14 5" fill="none" stroke={FG} strokeWidth={11} strokeLinecap="round" />
      <path d="M-100 18 Q-55 14 -14 5" fill="none" stroke="var(--coax)" strokeWidth={9} strokeLinecap="round" />
      <path d="M-12 -9 L36 -3 Q42 -1 42 0 L-12 0 Z" fill="var(--bolt)" stroke={FG} strokeWidth={1} strokeLinejoin="round" />
      <path d="M-12 9 L36 3 Q42 1 42 0 L-12 0 Z" fill="var(--bolt)" stroke={FG} strokeWidth={1} strokeLinejoin="round" />
      <circle cx={-8} cy={0} r={5} fill="var(--bolt)" stroke={FG} strokeWidth={1.2} />
    </g>
  );
}

/** A flat hand file, tip at (x, y), toothed blade `len` long along −x, then the handle. */
export function FlatFile({ x, y, rot = 0, len = 80 }: { x: number; y: number; rot?: number; len?: number }) {
  const teeth = [];
  for (let i = 6; i < len - 4; i += 6) teeth.push(<line key={i} x1={-i} y1={-5} x2={-i - 4} y2={5} stroke={FG} strokeWidth={0.7} />);
  return (
    <g transform={tf(x, y, rot)}>
      <rect x={-len - 40} y={-7} width={40} height={14} rx={6} fill="var(--coax)" stroke={FG} strokeWidth={1.2} />
      <rect x={-len} y={-6} width={len} height={12} rx={1.5} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
      {teeth}
    </g>
  );
}

/** An SMA edge connector from above: flange on the board edge at (x, y), barrel along +x, centre pin and ground legs along −x. */
export function SmaEdge({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  const gold = { fill: "var(--solder)", stroke: FG, strokeWidth: 1 };
  return (
    <g transform={tf(x, y, rot)}>
      <rect x={-22} y={-24} width={22} height={8} {...gold} />
      <rect x={-22} y={16} width={22} height={8} {...gold} />
      <rect x={-20} y={-1.8} width={20} height={3.6} {...gold} />
      <rect x={0} y={-25} width={12} height={50} rx={1} {...gold} />
      <rect x={12} y={-10} width={34} height={20} {...gold} />
      {[18, 24, 30, 36, 42].map((i) => <line key={i} x1={i} y1={-10} x2={i - 3} y2={10} stroke={FG} strokeWidth={0.7} />)}
    </g>
  );
}

/**
 * An SMA panel jack seen from the side: the flange's top face centred at (x, y) (the underside of the panel), threaded body below,
 * the insulator and a centre pin `pin` long standing up from it.
 */
export function SmaJack({ x, y, pin = 60 }: { x: number; y: number; pin?: number }) {
  const gold = { fill: "var(--solder)", stroke: FG, strokeWidth: 1 };
  return (
    <g>
      <rect x={x - 1.6} y={y - 8 - pin} width={3.2} height={pin} {...gold} />
      <rect x={x - 4} y={y - 8} width={8} height={8} fill="var(--panel)" stroke={FG} strokeWidth={1} />
      <rect x={x - 22} y={y} width={44} height={6} {...gold} />
      <rect x={x - 10} y={y + 6} width={20} height={40} {...gold} />
      {[12, 18, 24, 30, 36, 42].map((i) => <line key={i} x1={x - 10} y1={y + i} x2={x + 10} y2={y + i - 3} stroke={FG} strokeWidth={0.7} />)}
    </g>
  );
}

/** A felt-tip marker pen, red tip at (x, y), body along −x. */
export function Pen({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g transform={tf(x, y, rot)}>
      <path d="M0 0 L-8 -3 L-8 3 Z" fill="var(--mark)" stroke={FG} strokeWidth={0.8} strokeLinejoin="round" />
      <rect x={-15} y={-4} width={7} height={8} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
      <rect x={-75} y={-6} width={60} height={12} rx={3} fill="var(--panel)" stroke={FG} strokeWidth={1.2} />
      <rect x={-90} y={-6.5} width={18} height={13} rx={3} fill="var(--mark)" stroke={FG} strokeWidth={1.2} />
    </g>
  );
}

/**
 * A 3D printer's bed seen from the front and a little from above: the front edge runs from (x, y) to (x + w, y)
 * and the top face recedes by (dx, dy) to the back (dx < 0 shows the left end).
 */
export function PrintBed({ x, y, w, dx = -20, dy = -50 }: { x: number; y: number; w: number; dx?: number; dy?: number }) {
  const sx = dx < 0 ? x : x + w;
  return (
    <g>
      <path d={`M${x} ${y} L${x + w} ${y} L${x + w + dx} ${y + dy} L${x + dx} ${y + dy} Z`} fill="var(--bolt)" stroke={FG} strokeWidth={1.2} strokeLinejoin="round" />
      <path d={`M${sx} ${y} L${sx + dx} ${y + dy} L${sx + dx} ${y + dy + 10} L${sx} ${y + 10} Z`} fill="var(--coax)" stroke={FG} strokeWidth={1.2} strokeLinejoin="round" />
      <rect x={x} y={y} width={w} height={10} fill="var(--coax)" stroke={FG} strokeWidth={1.2} />
    </g>
  );
}

/** A 3D printer's print head from the front: nozzle tip at (x, y), heater block and fan-cooled heat sink above it. */
export function Hotend({ x, y }: { x: number; y: number }) {
  return (
    <g transform={tf(x, y)}>
      <rect x={-18} y={-58} width={36} height={34} rx={3} fill="var(--coax)" stroke={FG} strokeWidth={1.2} />
      <circle cx={0} cy={-41} r={12} fill="none" stroke="var(--bolt)" strokeWidth={1.5} />
      <circle cx={0} cy={-41} r={3} fill="var(--bolt)" />
      <rect x={-12} y={-24} width={24} height={12} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
      <path d="M-6 -12 L6 -12 L1.5 -2 L0 0 L-1.5 -2 Z" fill="var(--solder)" stroke={FG} strokeWidth={1} strokeLinejoin="round" />
    </g>
  );
}

/**
 * A part printed on a PrintBed, built up layer by layer: a box seen like the bed, front face w × h with its bottom-left
 * corner at (x, y), receding by (dx, dy). Its `n` layers appear from the bottom up between loop fractions `times`.
 * `top` is drawn on the top face once the part is finished, in flat coordinates: u 0…w left to right, v 0…depth back to front.
 */
export function PrintLayers({ x, y, w, h, dx, dy, depth, n, times, top }: {
  x: number; y: number; w: number; h: number; dx: number; dy: number; depth: number; n: number; times: [number, number]; top?: ReactNode;
}) {
  const lh = h / n, step = (times[1] - times[0]) / n, sx = dx < 0 ? x : x + w;
  const edge = { stroke: "var(--plastic-edge)", strokeWidth: 1, strokeLinejoin: "round" as const };
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const yb = y - i * lh, yt = yb - lh;
        const end = `M${sx} ${yb} L${sx} ${yt} L${sx + dx} ${yt + dy} L${sx + dx} ${yb + dy} Z`;
        return (
          <Appear key={i} a={times[0] + step * (i + 1) - 0.04}>
            <path d={`M${x} ${yt} L${x + w} ${yt} L${x + w + dx} ${yt + dy} L${x + dx} ${yt + dy} Z`} fill="var(--plastic)" {...edge} />
            <path d={end} fill="var(--plastic)" {...edge} />
            <path d={end} fill={FG} opacity={0.12} />
            <rect x={x} y={yt} width={w} height={lh} fill="var(--plastic)" {...edge} />
          </Appear>
        );
      })}
      {top && <Appear a={times[1]}><g transform={`matrix(1 0 ${-dx / depth} ${-dy / depth} ${x + dx} ${y - h + dy})`}>{top}</g></Appear>}
    </g>
  );
}

// ---------- animated helpers (all read the scene's dur) ----------

/** Fade the children in at loop fraction `a` and keep them to the end of the loop. */
export function Appear({ a, children }: { a: number; children?: ReactNode }) {
  return <Fade values={[0, 0, 1, 1]} times={[0, a, a + 0.04, 1]}>{children}</Fade>;
}

/** Rotate the children about a point: `values` in degrees at `times` (fractions 0…1 of the loop). */
export function Rot({ about, values, times, children }: { about: [number, number]; values: number[]; times: number[]; children?: ReactNode }) {
  const a = useAnim(times);
  return (
    <g>
      <animateTransform attributeName="transform" type="rotate" values={values.map((v) => `${v} ${about[0]} ${about[1]}`).join(";")} {...a} />
      {children}
    </g>
  );
}

/** Scale the children vertically about the line y = `axis` through `values` at `times` (−1 = flipped over that line, as a
 *  wire turned half a turn about its own axis looks from above). */
export function ScaleY({ axis, values, times, children }: { axis: number; values: number[]; times: number[]; children?: ReactNode }) {
  const a = useAnim(times);
  return (
    <g transform={`translate(0 ${axis})`}>
      <g>
        <animateTransform attributeName="transform" type="scale" values={values.map((v) => `1 ${v}`).join(";")} {...a} />
        <g transform={`translate(0 ${-axis})`}>{children}</g>
      </g>
    </g>
  );
}

/** Translate the children through `values` at `times`. */
export function Move({ values, times, children }: { values: [number, number][]; times: number[]; children?: ReactNode }) {
  const a = useAnim(times);
  return (
    <g>
      <animateTransform attributeName="transform" type="translate" values={values.map(([x, y]) => `${x} ${y}`).join(";")} {...a} />
      {children}
    </g>
  );
}

/** Opacity of the children through `values` at `times`. */
export function Fade({ values, times, children }: { values: number[]; times: number[]; children?: ReactNode }) {
  const a = useAnim(times);
  return (
    <g>
      <animate attributeName="opacity" values={values.join(";")} {...a} />
      {children}
    </g>
  );
}

/**
 * Reveal a stroke along `d` (wire being wound, tape being wrapped): hidden until times[0], drawn by times[1],
 * then held to the end of the loop. Copper by default; `w` is the stroke width.
 */
export function Draw({ d, times, w = 5, stroke = "var(--copper)" }: { d: string; times: [number, number]; w?: number; stroke?: string }) {
  const a = useAnim([0, times[0], times[1], 1]);
  return (
    <g>
      <path d={d} pathLength={1} strokeDasharray="1 2" fill="none" stroke={stroke} strokeWidth={w} strokeLinejoin="round">
        <animate attributeName="stroke-dashoffset" values="1;1;0;0" {...a} />
      </path>
    </g>
  );
}
