// Bending plate steps (CUTBEND_HOWTO.plate[1..4], plate[7]). The plate as printed (lib/print/families/cutbend.ts, plate()):
// a flat plate printed lines up, a block with the entry groove on top, three countersunk holes from below (die at the
// origin, trap pin outside the wire upstream of it, a stop hole per bend angle on a 40 mm circle, centred on the angle's
// ray), engraved angle lines every 15° (longer at 45° steps) offset by the wire's axis from the die so the bent leg lies
// on them, and the tangent line across the wire at the die. From above: screen y = −y of the part, the wire comes in
// along +x just below the die and is bent counter-clockwise round it, so the leg rests against the stop bolt's shank on
// the die side of the line. Bolts, the wire and the gaps between them are drawn larger than to scale; positions follow
// the part (2 px/mm).
import {
  Appear, Arrow, Bolt, Check, Clip, Fade, Hand, Hotend, Label, Mark, Move, PrintBed, PrintLayers, Rot, Wire, FG, type Scene,
} from "../kit";
import { AngleLines } from "./bender";
import { DIE_R, WIRE_W, WY, f, ray } from "./benderGeom";

// ------------------------------------------------------------------ the plate from above (px, die at the origin)

/** Stop-hole circle (40 mm), hole radius drawn so the angle line through the wire's axis meets the hole's rim. */
const PR = 80, HOLE_R = WY;
/** Engraved lines: short from 36, long from 28, to 64 (the part: 18 / 14 / 30 mm, drawn a little longer). */
const L0 = 36, LL = 28, L1 = 64;
/** Trap pin: outside the wire, upstream of the die. Block with the groove, upstream of the trap pin. */
const TRAP: [number, number] = [-22, WY + WIRE_W / 2 + 1 + DIE_R];
const BX0 = -62, BX1 = -32, BY0 = 3, BY1 = 22;
const STOPS = [45, 90, 135];

/** The plate's top face: engraved lines, tangent line, holes; the block and the plate outline come from the caller. */
function plateTop(holes = STOPS) {
  return <g>
    <AngleLines o={WY} r0={L0} rLong={LL} r1={L1} />
    <line x1={0} y1={DIE_R + 2} x2={0} y2={72} stroke="var(--plastic-edge)" strokeWidth={1.3} />
    <line x1={0} y1={-DIE_R - 2} x2={0} y2={-24} stroke="var(--plastic-edge)" strokeWidth={1.3} />
    {holes.map((a) => { const [x, y] = ray(a, PR); return <circle key={a} cx={x} cy={y} r={HOLE_R} fill="var(--coax)" />; })}
    <circle cx={0} cy={0} r={HOLE_R} fill="var(--coax)" />
    <circle cx={TRAP[0]} cy={TRAP[1]} r={HOLE_R} fill="var(--coax)" />
  </g>;
}

/** The raised block with its groove along the wire. */
const block = () => <g>
  <rect x={BX0} y={BY0} width={BX1 - BX0} height={BY1 - BY0} fill="var(--plastic)" stroke="var(--plastic-edge)" strokeWidth={1.5} />
  <rect x={BX0} y={BY0} width={BX1 - BX0} height={BY1 - BY0} fill={FG} opacity={0.08} />
  <rect x={BX0} y={WY - 3} width={BX1 - BX0} height={6} fill="var(--coax)" />
</g>;

/** The whole plate from above with the die and trap pin bolts in; `stop` puts the stop bolt in that hole. */
function plateAbove(stop: number | null = 90) {
  const sp = stop == null ? null : ray(stop, PR);
  return <g>
    <rect x={-96} y={-96} width={192} height={180} rx={4} fill="var(--plastic)" stroke="var(--plastic-edge)" strokeWidth={1.5} />
    {plateTop()}
    {block()}
    <Bolt x={0} y={0} r={DIE_R} />
    <Bolt x={TRAP[0]} y={TRAP[1]} r={DIE_R} />
    {sp && <Bolt x={sp[0]} y={sp[1]} r={DIE_R} stop />}
  </g>;
}

const CX = 165, CY = 132;

// ------------------------------------------------------------------ print it flat, lines up

const platePrint: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => {
    // the plate (192 × 180 flat, 12 high) on the bed, receding by (DX, DY); the block (30 × 19, 9 high) on its top face
    const X = 94, Y = 200, W = 192, D = 180, H = 12, DX = -40, DY = -80, n = 4, t0 = 0.08, t1 = 0.46, t2 = 0.62;
    const onTop = (u: number, v: number): [number, number] => [f(X + DX + u - (DX / D) * v), f(Y - H + DY - (DY / D) * v)];
    const [bx, by] = onTop(BX0 + 96, BY1 + 96), bd = BY1 - BY0;
    const step = (t1 - t0) / n, bstep = (t2 - t1) / 3;
    // print head: to and fro across the plate a layer at a time, then short strokes over the block, then it parks
    const xv: [number, number][] = [[0, 0]], xt: number[] = [0];
    for (let i = 0; i < n; i++) { xv.push([i % 2 ? 0 : 170, -3 * i], [i % 2 ? 170 : 0, -3 * (i + 1)]); xt.push(t0 + step * i + 0.005, t0 + step * (i + 1)); }
    const bx0 = bx - (X + 10);
    for (let i = 0; i < 3; i++) { xv.push([bx0 + (i % 2 ? 26 : 0), -12 - 3 * i - 30], [bx0 + (i % 2 ? 0 : 26), -12 - 3 * (i + 1) - 30]); xt.push(t1 + bstep * i + 0.005, t1 + bstep * (i + 1)); }
    return <>
      <PrintBed x={50} y={206} w={252} dx={-48} dy={-96} />
      <PrintLayers x={X} y={Y} w={W} h={H} dx={DX} dy={DY} depth={D} n={n} times={[t0, t1]}
        top={<g transform="translate(96 96)">{plateTop()}</g>} />
      <PrintLayers x={bx} y={by} w={BX1 - BX0} h={9} dx={f(DX * bd / D)} dy={f(DY * bd / D)} depth={bd} n={3} times={[t1, t2]}
        top={<rect x={0} y={WY - 3 - BY0} width={BX1 - BX0} height={6} fill="var(--coax)" />} />
      <Move values={[...xv, [150, -110], [150, -110]]} times={[...xt, 0.7, 1]}>
        <Hotend x={X + 10} y={Y - 2} />
      </Move>
      <Appear a={t0}><Arrow d="M298 194 L298 160" /></Appear>
      <Appear a={t0}><Arrow d="M84 26 L246 26" both /></Appear>
      <Appear a={0.16}><Label x={300} y={232} text={t("plate")} anchor="end" to={[250, 195]} /></Appear>
      <Appear a={t1}><Label x={14} y={112} text={t("lines up")} to={[onTop(96 + 30, 96 - 40)[0], onTop(96 + 30, 96 - 40)[1]]} /></Appear>
    </>;
  },
};

// ------------------------------------------------------------------ bolts up from below, heads flush with the bottom

const plateBolts: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => {
    // side cut at 4.5 px/mm: plate 6 mm, M4 × 16 countersunk bolts (head Ø 9, 2.5 high), holes Ø 4.5 with the countersink
    const S = 4.5, top = 128, bot = top + 6 * S, L = 14, R = 306, hr = 2.25 * S, kr = 4.7 * S, ck = kr - hr;
    const xs = { trap: 112, die: 186, stop: 262 };
    const holes = [xs.trap, xs.die, xs.stop];
    const segs: string[] = [];
    let x0 = L, left: number | null = null;
    for (const c of holes) {
      segs.push(left == null
        ? `M${x0} ${top} L${c - hr} ${top} L${c - hr} ${bot - ck} L${c - kr} ${bot} L${x0} ${bot} Z`
        : `M${left + hr} ${top} L${c - hr} ${top} L${c - hr} ${bot - ck} L${c - kr} ${bot} L${left + kr} ${bot} L${left + hr} ${bot - ck} Z`);
      left = c; x0 = c;
    }
    segs.push(`M${left! + hr} ${top} L${R} ${top} L${R} ${bot} L${left! + kr} ${bot} L${left! + hr} ${bot - ck} Z`);
    const sw = 2 * S, hw = 9 * S, hh = 2.5 * S, len = 16 * S;
    const bolt = (x: number, stop: boolean) => {
      const fill = stop ? "var(--stop)" : "var(--bolt)", yb = bot, ys = yb - hh, yt = yb - len;
      const th = [];
      for (let y = yt + 5; y < top - 4; y += 5) th.push(<line key={y} x1={x - sw} y1={y} x2={x + sw} y2={y - 2} stroke={FG} strokeWidth={0.6} />);
      return <g>
        <rect x={x - sw} y={yt} width={2 * sw} height={ys - yt} fill={fill} stroke={FG} strokeWidth={1} />
        {th}
        <path d={`M${x - sw} ${ys} L${x + sw} ${ys} L${x + hw / 2} ${yb} L${x - hw / 2} ${yb} Z`} fill={fill} stroke={FG} strokeWidth={1.2} strokeLinejoin="round" />
      </g>;
    };
    // die first, then the trap pin beside it, then the stop
    const go = (a: number) => ({ values: [[0, 74], [0, 74], [0, 0], [0, 0]] as [number, number][], times: [0, a, a + 0.18, 1] });
    const order: [keyof typeof xs, number][] = [["die", 0.06], ["trap", 0.28], ["stop", 0.5]];
    const paint = { fill: "var(--plastic)", stroke: "var(--plastic-edge)", strokeWidth: 1.5, strokeLinejoin: "round" as const };
    return <>
      {/* the block beyond the cut, its groove open on top */}
      <path d={`M24 ${top} L24 ${top - 18} L48 ${top - 18} L48 ${top - 10} L58 ${top - 10} L58 ${top - 18} L82 ${top - 18} L82 ${top} Z`} {...paint} />
      {order.map(([k, a]) => <Move key={k} {...go(a)}>{bolt(xs[k], k === "stop")}</Move>)}
      {segs.map((d) => <path key={d} d={d} {...paint} />)}
      {order.map(([k, a]) => <Appear key={k} a={a}><Arrow d={`M${xs[k] + 32} 230 L${xs[k] + 32} 186`} /></Appear>)}
      {/* the heads end flush with the bottom */}
      <Fade values={[0, 0, 1, 0.35, 1, 1]} times={[0, 0.7, 0.73, 0.77, 0.8, 1]}>
        <line x1={L} y1={bot + 1} x2={R} y2={bot + 1} stroke="var(--accent)" strokeWidth={2} />
      </Fade>
      <Appear a={0.72}><Check x={30} y={184} /></Appear>
      <Appear a={0.24}><Label x={xs.die} y={66} text={t("die")} anchor="middle" to={[xs.die, top - len + 6 * S + hh - 6]} /></Appear>
      <Appear a={0.46}><Label x={xs.trap - 26} y={52} text={t("trap pin")} anchor="middle" to={[xs.trap - 4, top - len + 6 * S + hh - 6]} /></Appear>
      <Appear a={0.68}><Label x={xs.stop} y={66} text={t("stop")} anchor="middle" to={[xs.stop, top - len + 6 * S + hh - 6]} /></Appear>
      <Appear a={0.72}><Label x={10} y={226} text={t("countersunk head")} to={[xs.trap - 14, bot - 4]} /></Appear>
    </>;
  },
};

// ------------------------------------------------------------------ the stop holes on the engraved lines

const plateStops: Scene = {
  dur: 4.5,
  still: 3.9,
  draw: (t) => {
    const t0 = 0.05, dt = 0.045, angles = Array.from({ length: 12 }, (_, i) => 15 * (i + 1));
    const at = (a: number) => t0 + dt * (a / 15 - 1);
    return <g transform={`translate(${CX} ${CY})`}>
      {plateAbove(null)}
      {angles.map((a) => {
        const long = a % 45 === 0, p = ray(a, long ? LL : L0, WY), q = ray(a, L1, WY), s = at(a);
        const ln = <line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="var(--accent)" strokeWidth={long ? 3 : 2.5} strokeLinecap="round" />;
        return long
          ? <Appear key={a} a={s}>{ln}</Appear>
          : <Fade key={a} values={[0, 0, 1, 0, 0]} times={[0, s, s + 0.02, s + 0.07, 1]}>{ln}</Fade>;
      })}
      {STOPS.map((a) => { const [x, y] = ray(a, PR); return <Appear key={a} a={at(a) + 0.02}><circle cx={x} cy={y} r={HOLE_R + 3} fill="none" stroke="var(--accent)" strokeWidth={2.5} /></Appear>; })}
      {[45, 90, 135, 180].map((a) => { const [x, y] = ray(a, 104, WY); return <Appear key={a} a={at(a)}><Label x={x} y={y + 4} text={`${a}°`} anchor="middle" /></Appear>; })}
      <Appear a={at(45)}><Label x={150} y={30} text={t("stop holes")} anchor="end" to={[ray(45, PR)[0] + 8, ray(45, PR)[1] + 8]} /></Appear>
    </g>;
  },
};

// ------------------------------------------------------------------ lay the wire in

const plateLoad: Scene = {
  dur: 4.5,
  still: 3.9,
  view: "45 42 260 195",
  draw: (t) => <g transform={`translate(${CX} ${CY})`}>
    {plateAbove()}
    {/* the wire slides in through the groove, between the trap pin and the die, until its mark is on the line at the die */}
    <Move values={[[-110, 0], [-110, 0], [0, 0], [0, 0]]} times={[0, 0.08, 0.5, 1]}>
      <Wire d={`M-170 ${WY} L60 ${WY}`} w={WIRE_W} />
      <line x1={0} y1={WY - 4} x2={0} y2={WY + 4} stroke="var(--mark)" strokeWidth={2.5} strokeLinecap="round" />
    </Move>
    <Fade values={[0, 0, 1, 0, 1, 0, 0]} times={[0, 0.5, 0.53, 0.58, 0.62, 0.67, 1]}>
      <line x1={0} y1={WY + 6} x2={0} y2={72} stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />
    </Fade>
    <Appear a={0.08}><Arrow d="M-112 40 L-70 40" /></Appear>
    <Label x={-116} y={-12} text={t("wire")} to={[-104, WY - 3]} />
    <Label x={-76} y={86} text={t("trap pin")} to={[-26, TRAP[1] + 6]} />
    <Label x={74} y={2} text={t("die")} to={[7, -1]} />
    <Appear a={0.5}><Label x={36} y={60} text={t("mark")} to={[2, WY + 4]} /></Appear>
    <Appear a={0.5}><Label x={134} y={32} text={t("cut end")} anchor="end" to={[62, WY + 3]} /></Appear>
  </g>,
};

// ------------------------------------------------------------------ bend by hand to the stop, press past, spring back

const plateBend: Scene = {
  dur: 5,
  still: 4.0,
  draw: (t) => {
    // The leg is bent counter-clockwise until it lies on the 90° line against the stop bolt's shank. Pressing past it:
    // the stop holds the outer part, so the hand pushes the leg near the die past the line (the leg bows, drawn at BOW°,
    // more than the 2–5° it is, like the bolts and the wire are drawn larger than scale), lets go, and the copper springs
    // back straight onto the line.
    const OVER = 5, BOW = 14, LEN = 100, HR = 30, HS = 0.65;
    const swing = [0, 0, -90, -90, -90 - BOW, -90 - BOW, -90, -90, 0, 0], st = [0, 0.08, 0.4, 0.48, 0.54, 0.62, 0.66, 0.94, 0.97, 1];
    const s = Math.sin(185 * Math.PI / 180), c = Math.cos(185 * Math.PI / 180);
    const p = (a: number, r: number) => ray(a, r, WY).join(" ");
    const bowed = `M${p(90 + BOW, 0)} L${p(90 + BOW, 30)} C${p(90 + BOW, 46)} ${p(90, 50)} ${p(90, 68)} L${p(90, LEN)}`;
    const straightOn = { values: [1, 1, 0, 0, 1, 1], times: [0, 0.48, 0.54, 0.62, 0.66, 1] };
    const bowOn = { values: [0, 0, 1, 1, 0, 0], times: [0, 0.48, 0.54, 0.62, 0.66, 1] };
    const [sx, sy] = ray(90, PR), cy = sy;
    return <g transform={`translate(${CX} ${CY + 6})`}>
      {plateAbove(null)}
      <Fade values={[1, 1, 0, 0, 1]} times={[0, 0.92, 0.94, 0.98, 1]}>
        <Wire d={`M-170 ${WY} L0 ${WY}`} w={WIRE_W} />
        <Clip x={0} y={-200} w={200} h={400}>
          <Rot about={[0, 0]} values={swing} times={st}>
            <Wire d={`M${f(WY * c)} ${f(WY * s)} A${WY} ${WY} 0 0 0 0 ${WY}`} w={WIRE_W} />
          </Rot>
        </Clip>
        <Fade {...straightOn}>
          <Rot about={[0, 0]} values={[0, 0, -90, -90]} times={[0, 0.08, 0.4, 1]}><Wire d={`M0 ${WY} L${LEN} ${WY}`} w={WIRE_W} /></Rot>
        </Fade>
        <Fade {...bowOn}><Wire d={bowed} w={WIRE_W} /></Fade>
      </Fade>
      <Mark x={0} y={WY} />
      <Bolt x={0} y={0} r={DIE_R} />
      <Bolt x={sx} y={sy} r={DIE_R} stop />
      {/* the leg comes to rest against the stop bolt */}
      <Fade values={[0, 0, 1, 0, 1, 0, 0]} times={[0, 0.4, 0.42, 0.45, 0.47, 0.5, 1]}>
        <circle cx={sx + DIE_R} cy={cy} r={6} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      </Fade>
      {/* the hand: pushes the leg round to the stop, presses it past near the die, lets go */}
      <Fade values={[1, 1, 0, 0, 1]} times={[0, 0.92, 0.94, 0.98, 1]}>
        <Rot about={[0, 0]} values={[0, 0, -90, -90]} times={[0, 0.08, 0.4, 1]}>
          <Move values={[[0, 0], [0, 0], [0, -8], [0, -8], [0, 14], [0, 14]]} times={[0, 0.48, 0.54, 0.62, 0.68, 1]}>
            <g transform={`translate(${HR} ${WY + WIRE_W / 2 + 1}) scale(${HS})`}><Hand x={0} y={0} rot={-90} /></g>
          </Move>
        </Rot>
      </Fade>
      <Appear a={0.08}><Arrow d={`M${ray(-14, 112).join(" ")} A112 112 0 0 0 ${ray(80, 112).join(" ")}`} /></Appear>
      <Appear a={0.48}><Arrow d="M98 -27 L71 -27" /></Appear>
      <Appear a={0.54}><Label x={15} y={-62} text={`+${OVER}°`} /></Appear>
      <Appear a={0.64}><Arrow d="M-22 -42 L1 -42" /></Appear>
      <Appear a={0.64}><Label x={-28} y={-68} text={t("springback")} anchor="end" to={[-24, -46]} /></Appear>
      <Label x={-46} y={-96} text={t("stop bolt")} anchor="end" to={[sx - DIE_R + 1, sy - 2]} />
      <Label x={-40} y={0} text={t("die")} anchor="end" to={[-7, -2]} />
      <Appear a={0.08}><Label x={120} y={-2} text={t("hand")} to={[60, -20]} /></Appear>
    </g>;
  },
};

export const PLATE_SCENES = {
  "plate-print": platePrint,
  "plate-bolts": plateBolts,
  "plate-stops": plateStops,
  "plate-load": plateLoad,
  "plate-bend": plateBend,
} satisfies Record<string, Scene>;
