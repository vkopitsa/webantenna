// Lever bender and bending plate parts for the step scenes (lever.tsx, the bending plate's scenes), drawn after
// lib/print/families/cutbend.ts (leverSolids, plate()). Top view: die centre at the origin, screen y = −y of the part,
// the wire comes in along +x just below the die through the groove of the block, stop holes on a circle at the bend
// angles counter-clockwise from +x, engraved lines every 15° beside them. Bolts, the wire and the gaps between them are
// drawn larger than to scale so they stay readable; positions follow the part.
import { Bolt, Clip, Rot, Wire, FG } from "../kit";
import { DEG, DIE_R, f, FLOOR_Z, HD, HEAD_R, HH, HOLE, K, NUT_H, NUT_W, ray, ROLL_R, ROLL_Y, RY, SH, SK, SR, SX, sx, sz, WIRE_W, WY, BASE_R0, BASE_RL, BASE_R1, ARM_E, STOP_O } from "./benderGeom";

// ------------------------------------------------------------------ top view

/** Engraved angle lines every 15° up to 180°, longer at multiples of 45°: from radius r0 (rLong for the long ones) to r1, offset o. */
export function AngleLines({ o, r0, rLong, r1, stroke = "var(--plastic-edge)", w = 1.3 }: { o: number; r0: number; rLong: number; r1: number; stroke?: string; w?: number }) {
  const ls = [];
  for (let a = 15; a <= 180; a += 15) {
    const p = ray(a, a % 45 === 0 ? rLong : r0, o), q = ray(a, r1, o);
    ls.push(<line key={a} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={stroke} strokeWidth={a % 45 === 0 ? w + 0.4 : w} strokeLinecap="round" />);
  }
  return <g>{ls}</g>;
}

/** The engraved lines of the lever bender's base (outside the stop circle). */
const baseLines = (stroke?: string, w?: number) => <AngleLines o={WY} r0={BASE_R0} rLong={BASE_RL} r1={BASE_R1} stroke={stroke} w={w} />;

/** Lever bender base from above: plate, mounting holes, engraved lines, tangent line, stop holes, the block with its groove. */
export function LeverBase({ holes = [45, 90, 135] }: { holes?: number[] }) {
  return <g>
    <rect x={-92 * K} y={-58 * K} width={150 * K} height={90 * K} rx={4} fill="var(--plastic)" stroke="var(--plastic-edge)" strokeWidth={1.5} />
    {[45, 10].map((y) => <circle key={y} cx={-80 * K} cy={-y * K} r={3.6} fill="var(--coax)" />)}
    {baseLines()}
    <line x1={0} y1={-14 * K} x2={0} y2={-(SR - 6)} stroke="var(--plastic-edge)" strokeWidth={1.3} />
    {holes.map((a) => { const [x, y] = ray(a, SR, STOP_O); return <circle key={a} cx={x} cy={y} r={4} fill="var(--coax)" />; })}
    {/* the block (raised), its groove open on top along the wire */}
    <rect x={-30 * K} y={1} width={15 * K} height={32 * K - 1} fill="var(--plastic)" stroke="var(--plastic-edge)" strokeWidth={1.5} />
    <rect x={-30 * K} y={1} width={15 * K} height={32 * K - 1} fill={FG} opacity={0.08} />
    <rect x={-30 * K} y={WY - 3.5} width={15 * K} height={7} fill="var(--coax)" />
  </g>;
}

/** Lever outline at rest (hub r 12 mm, handle shortened to 60 mm, arm whose upper edge meets the stop bolt head). */
const LEVER_D = (() => {
  const hub = 12 * K, hw = 10 * K, end = 60 * K, ax = 44 * K, ay = ARM_E + 14 * K, hy = 40 * K;
  const xs = f(Math.sqrt(hub * hub - ARM_E * ARM_E)), ys = f(Math.sqrt(hub * hub - hw * hw));
  return `M${-hw} ${ys} L${-hw} ${end - 8} Q${-hw} ${end} ${-hw + 8} ${end} L${hw - 8} ${end} Q${hw} ${end} ${hw} ${end - 8} L${hw} ${hy} L${ax} ${f(ay)} L${ax} ${ARM_E} L${xs} ${ARM_E} A${hub} ${hub} 0 1 0 ${-hw} ${ys} Z`;
})();

/** The lever from above at rest: printed part, engraved line across it at the die's tangent, the roller bolt head. */
export function Lever({ roller = true }: { roller?: boolean }) {
  return <g>
    <path d={LEVER_D} fill="var(--plastic)" stroke="var(--plastic-edge)" strokeWidth={1.5} strokeLinejoin="round" />
    <path d={LEVER_D} fill={FG} opacity={0.12} />
    <line x1={0} y1={-DIE_R - 2} x2={0} y2={-10 * K - 1} stroke="var(--plastic-edge)" strokeWidth={1.5} />
    <line x1={0} y1={ROLL_Y + ROLL_R + 2} x2={0} y2={ROLL_Y + ROLL_R + 12} stroke="var(--plastic-edge)" strokeWidth={1.5} />
    {roller ? <Bolt x={0} y={ROLL_Y} r={ROLL_R} /> : <circle cx={0} cy={ROLL_Y} r={4} fill="var(--coax)" />}
  </g>;
}

/** The lever's engraved line across it (both pieces), e.g. flashed in accent. */
export const LeverLine = ({ stroke, w }: { stroke: string; w: number }) => <g>
  <line x1={0} y1={-DIE_R - 2} x2={0} y2={-10 * K - 1} stroke={stroke} strokeWidth={w} strokeLinecap="round" />
  <line x1={0} y1={ROLL_Y + ROLL_R + 2} x2={0} y2={ROLL_Y + ROLL_R + 12} stroke={stroke} strokeWidth={w} strokeLinecap="round" />
</g>;

/** The die: the bolt's threaded end sticking up through the lever hub. */
export const DieEnd = () => <Bolt x={0} y={0} r={DIE_R} />;

/** The bending plate from above (lib cutbend.ts plate()): die, trap pin outside the wire upstream, block with the groove,
 *  engraved lines inside the stop circle, tangent line across the wire at the die, stop holes; `stop` puts the stop bolt in. */
export function PlateTop({ holes = [45, 90, 135], stop = 90 }: { holes?: number[]; stop?: number | null }) {
  const sp = stop == null ? null : ray(stop, SR);
  return <g>
    <rect x={-48 * K} y={-48 * K} width={96 * K} height={90 * K} rx={4} fill="var(--plastic)" stroke="var(--plastic-edge)" strokeWidth={1.5} />
    <AngleLines o={WY} r0={18 * K} rLong={14 * K} r1={30 * K} />
    <line x1={0} y1={DIE_R + 2} x2={0} y2={36 * K} stroke="var(--plastic-edge)" strokeWidth={1.3} />
    <line x1={0} y1={-DIE_R - 2} x2={0} y2={-12 * K} stroke="var(--plastic-edge)" strokeWidth={1.3} />
    {holes.map((a) => { const [x, y] = ray(a, SR); return <circle key={a} cx={x} cy={y} r={4} fill="var(--coax)" />; })}
    <rect x={-54} y={WY - 6} width={24} height={WY + 12} fill="var(--plastic)" stroke="var(--plastic-edge)" strokeWidth={1.5} />
    <rect x={-54} y={WY - 6} width={24} height={WY + 12} fill={FG} opacity={0.08} />
    <rect x={-54} y={WY - 3.5} width={24} height={7} fill="var(--coax)" />
    <Bolt x={0} y={0} r={DIE_R} head="csk" />
    <Bolt x={-20} y={24} r={DIE_R} head="csk" />
    {sp && <Bolt x={sp[0]} y={sp[1]} r={HEAD_R} stop />}
  </g>;
}

/** Wire on the bender: the held part up to the die's tangent (x = 0) and the part past the die rotated by `swing`
 *  (degrees counter-clockwise at `times`, see Rot), wrapped round the die by an arc that shows only past the tangent. */
export function BenderWire({ from, len, swing }: { from: number; len: number; swing: [number[], number[]] }) {
  const s = Math.sin(185 * DEG), c = Math.cos(185 * DEG), vals = swing[0].map((v) => -v);
  return <g>
    <Wire d={`M${from} ${WY} L0 ${WY}`} w={WIRE_W} />
    <Clip x={0} y={-200} w={200} h={400}>
      <Rot about={[0, 0]} values={vals} times={swing[1]}>
        <Wire d={`M${f(WY * c)} ${f(WY * s)} A${WY} ${WY} 0 0 0 0 ${WY}`} w={WIRE_W} />
      </Rot>
    </Clip>
    <Rot about={[0, 0]} values={vals} times={swing[1]}><Wire d={`M0 ${WY} L${len} ${WY}`} w={WIRE_W} /></Rot>
  </g>;
}

// ------------------------------------------------------------------ side cut (from +x: screen right = +y of the part, up = z)


/** A bolt seen from the side: shank `x` centred from y0 (top) to y1 (bottom), socket head at the top or the bottom. */
export function SideBolt({ x, y0, y1, head }: { x: number; y0: number; y1: number; head: "top" | "bottom" }) {
  const w = SH * SK, hw = HD * SK, hh = HH * SK;
  const hy = head === "top" ? y0 - hh : y1;
  const threads = [];
  for (let y = (head === "top" ? y1 - 4 : y0 + 4); head === "top" ? y > y0 + 6 : y < y1 - 6; y += head === "top" ? -5 : 5) {
    threads.push(<line key={y} x1={x - w / 2} y1={y} x2={x + w / 2} y2={y - 2} stroke={FG} strokeWidth={0.6} />);
  }
  return <g>
    <rect x={x - w / 2} y={y0} width={w} height={y1 - y0} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
    {threads}
    <rect x={x - hw / 2} y={hy} width={hw} height={hh} rx={1.5} fill="var(--bolt)" stroke={FG} strokeWidth={1.2} />
  </g>;
}

/** Base cut through the die: plate with the tab under its front edge, die hole and the hexagon nut pocket on top. */
export function SideBase() {
  const pl = sx(-NUT_W / 2 - 0.2), pr = sx(NUT_W / 2 + 0.2), hl = sx(-HOLE / 2), hr = sx(HOLE / 2), pz = sz(8 - NUT_H - 0.3);
  const paint = { fill: "var(--plastic)", stroke: "var(--plastic-edge)", strokeWidth: 1.5, strokeLinejoin: "round" as const };
  return <g>
    {/* the block, beyond the cut: its top with the groove shows above the lever */}
    <path d={`M${sx(-32)} ${sz(8)} L${sx(-32)} ${sz(20)} L${sx(-4.2)} ${sz(20)} L${sx(-4.2)} ${sz(16)} L${sx(-1.8)} ${sz(16)} L${sx(-1.8)} ${sz(20)} L${sx(0)} ${sz(20)} L${sx(0)} ${sz(8)} Z`} {...paint} />
    <path d={`M${sx(-32)} ${sz(8)} L${pl} ${sz(8)} L${pl} ${pz} L${hl} ${pz} L${hl} ${sz(0)} L${sx(-20)} ${sz(0)} L${sx(-20)} ${sz(-25)} L${sx(-32)} ${sz(-25)} Z`} {...paint} />
    <path d={`M${pr} ${sz(8)} L${sx(58)} ${sz(8)} L${sx(58)} ${sz(0)} L${hr} ${sz(0)} L${hr} ${pz} L${pr} ${pz} Z`} {...paint} />
  </g>;
}

/** The hex nut from the side (across corners), its bottom at y. */
export function SideNut({ y }: { y: number }) {
  const w = NUT_W * SK, h = NUT_H * SK;
  return <g>
    <rect x={SX - w / 2} y={y - h} width={w} height={h} fill="var(--bolt)" stroke={FG} strokeWidth={1.2} />
    <line x1={SX - w / 4} y1={y - h} x2={SX - w / 4} y2={y} stroke={FG} strokeWidth={0.8} />
    <line x1={SX + w / 4} y1={y - h} x2={SX + w / 4} y2={y} stroke={FG} strokeWidth={0.8} />
  </g>;
}

/** The lever cut through the die and the roller: handle to the left (front), hub to the right, die hole and the
 *  roller hole with its floor. */
export function SideLever() {
  const z0 = sz(8), z1 = sz(16), dl = sx(-HOLE / 2), dr = sx(HOLE / 2), rl = sx(RY - HOLE / 2), rr = sx(RY + HOLE / 2), fl = sz(FLOOR_Z);
  const paint = { fill: "var(--plastic)", stroke: "var(--plastic-edge)", strokeWidth: 1.5, strokeLinejoin: "round" as const };
  const a = `M${sx(-60)} ${z1} L${rl} ${z1} L${rl} ${fl} L${rr} ${fl} L${rr} ${z1} L${dl} ${z1} L${dl} ${z0} L${sx(-60)} ${z0} Z`;
  const b = `M${dr} ${z1} L${sx(12)} ${z1} L${sx(12)} ${z0} L${dr} ${z0} Z`;
  return <g>
    <path d={a} {...paint} /><path d={a} fill={FG} opacity={0.12} />
    <path d={b} {...paint} /><path d={b} fill={FG} opacity={0.12} />
  </g>;
}

/** Die bolt in place: head under the base, shank up through the nut and the lever hub. */
export const DieBoltSide = () => <SideBolt x={SX} y0={sz(30)} y1={sz(0)} head="bottom" />;

