// Lever bender steps (CUTBEND_HOWTO.lever) and the two lines it shares with the bending plate (which one to print, R / L).
// The bender as printed (lib/print/families/cutbend.ts, leverSolids / benderPlate), seen from above with the die at the
// origin: the wire comes in along +x just below the die (screen +y) through the groove of the block, the vise tab hangs
// under the front (−y, screen bottom) edge, stop holes sit on a circle at the bend angles measured counter-clockwise
// from +x, engraved lines every 15° just outside them. The lever's hub turns on the die, its handle points at the front at
// rest, the roller sits in the handle on the far side of the wire and the arm's edge meets the stop bolt head. Swinging
// the lever counter-clockwise wraps the cut end round the die (an R bend). Bolts, the wire and the gap between them are
// drawn larger than to scale so they stay readable; positions follow the part.
import type { ReactNode } from "react";
import {
  Appear, Arrow, Bolt, Check, Clip, Fade, Hotend, Label, Mark, Move, PrintBed, PrintLayers, Rot, Wire, FG, type Scene,
} from "../kit";
import { AngleLines, BenderWire, DieBoltSide, DieEnd, Lever, LeverBase, LeverLine, PlateTop, SideBase, SideBolt, SideLever, SideNut } from "./bender";
import { BASE_R0, BASE_R1, BASE_RL, HD, HEAD_R, HH, NUT_Y, ROLL_R, ROLL_Y, RY, FLOOR_Z, SR, SX, WIRE_W, WY, SK, ray, sx, sz } from "./benderGeom";

// ------------------------------------------------------------------ print either one

const benderChoice: Scene = {
  dur: 4,
  still: 1.6,
  draw: (t) => {
    const lv = [0.04, 0.46], pl = [0.54, 0.96];
    const on = (w: number[]) => ({ values: [0, 0, 1, 1, 0, 0], times: [0, w[0], w[0] + 0.04, w[1] - 0.04, w[1], 1] });
    const dim = (w: number[]) => ({ values: [1, 1, 0.4, 0.4, 1, 1], times: [0, w[0], w[0] + 0.04, w[1] - 0.04, w[1], 1] });
    return <>
      <Fade {...dim(pl)}>
        <g transform="translate(100 82) scale(0.62)">
          <LeverBase />
          <Lever />
          <DieEnd />
          <Bolt x={0} y={-SR} r={HEAD_R} stop />
        </g>
      </Fade>
      <Fade {...dim(lv)}>
        <g transform="translate(250 92) scale(0.7)"><PlateTop /></g>
      </Fade>
      <Label x={177} y={100} text={t("or")} anchor="middle" />
      <Fade {...on(lv)}><Check x={158} y={24} /></Fade>
      <Fade {...on(pl)}><Check x={300} y={24} /></Fade>
      <Label x={100} y={180} text={t("lever bender")} anchor="middle" to={[100, 150]} />
      <Label x={250} y={180} text={t("bending plate")} anchor="middle" to={[250, 141]} />
    </>;
  },
};

// ------------------------------------------------------------------ print: base on its long edge, lever flat

const leverPrint: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => {
    // oblique view: lateral u → x, height → up, length (depth) recedes up-right by (A, −B) per mm
    const OX = 64, OY = 196, A = 0.55, B = 0.33, t0 = 0.08, t1 = 0.62, n = 9, step = (t1 - t0) / n;
    const box = (u0: number, u1: number, h: number, d0: number, d: number, layers: number, top?: ReactNode) => (
      <PrintLayers x={OX + u0 + A * d0} y={OY - B * d0} w={u1 - u0} h={h} dx={A * d} dy={-B * d} depth={d} n={layers} times={[t0, t0 + step * layers]} top={top} />
    );
    const leverTop = <>
      <circle cx={14} cy={12} r={3} fill="var(--coax)" />
      <circle cx={26} cy={12} r={3} fill="var(--coax)" />
    </>;
    // print head: runs to and fro along the current layer, steps up with the base
    const xv: [number, number][] = [[0, 0]], xt: number[] = [0];
    for (let i = 0; i < n; i++) {
      xv.push([i % 2 ? 0 : 150, -10 * i], [i % 2 ? 150 : 0, -10 * (i + 1)]);
      xt.push(t0 + step * i + 0.005, t0 + step * (i + 1));
    }
    return <>
      <PrintBed x={20} y={204} w={250} dx={46} dy={-28} />
      {box(-25, 0, 12, 2, 40, 1)}
      {box(0, 8, 90, 0, 150, n)}
      {box(8, 20, 32, 62, 15, 3)}
      {box(64, 168, 8, 8, 24, 1, leverTop)}
      <Move values={[...xv, [190, -100], [190, -100]]} times={[...xt, 0.7, 1]}>
        <Hotend x={OX + 4} y={OY - 8} />
      </Move>
      <Appear a={t0}><Arrow d="M28 190 L28 124" /></Appear>
      <Appear a={t0}><Arrow d="M110 20 L228 20" both /></Appear>
      <Appear a={0.3}><Label x={20} y={60} text={t("base")} to={[96, 90]} /></Appear>
      <Appear a={0.14}><Label x={262} y={232} text={t("lever")} to={[224, 196]} /></Appear>
    </>;
  },
};

const leverAssemble: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => {
    const hb = sz(0) + HH * SK;
    return <>
      <SideBase />
      {/* die bolt: comes up from below, turning (knurl lines run across the head) */}
      <Move values={[[0, 64], [0, 64], [0, 0], [0, 0]]} times={[0, 0.28, 0.52, 1]}>
        <DieBoltSide />
        <Clip x={SX - HD * SK / 2} y={sz(0)} w={HD * SK} h={HH * SK}>
          {[0, 1 / 3, 2 / 3].map((p) => {
            const w = HD * SK, xs = (k: number) => SX - w / 2 + ((k + p) % 1) * w;
            const vals: [number, number][] = [], tm: number[] = [];
            for (let i = 0; i <= 6; i++) { const tt = 0.28 + (0.24 * i) / 6; vals.push([xs(i * 0.5) - SX, 0]); tm.push(tt); }
            return <Move key={p} values={[[vals[0][0], 0], ...vals, [vals[6][0], 0]]} times={[0, ...tm, 1]}>
              <line x1={SX} y1={sz(0)} x2={SX} y2={hb} stroke={FG} strokeWidth={0.8} />
            </Move>;
          })}
        </Clip>
      </Move>
      {/* nut drops into the hexagon pocket on top of the base */}
      <Move values={[[0, -70], [0, -70], [0, 0], [0, 0]]} times={[0, 0.06, 0.22, 1]}>
        <SideNut y={NUT_Y} />
      </Move>
      {/* lever slides down onto the die */}
      <Fade values={[0, 0, 1, 1]} times={[0, 0.54, 0.58, 1]}>
        <Move values={[[0, -86], [0, -86], [0, 0], [0, 0]]} times={[0, 0.58, 0.74, 1]}>
          <SideLever />
        </Move>
      </Fade>
      <Appear a={0.06}><Arrow d={`M${SX + 30} 46 L${SX + 30} 92`} /></Appear>
      <Appear a={0.28}><Arrow d={`M${SX + 30} 230 L${SX + 30} 176`} /></Appear>
      <Appear a={0.28}><Arrow d={`M${SX - 16} 226 Q${SX} 236 ${SX + 16} 226`} /></Appear>
      <Appear a={0.58}><Arrow d={`M${sx(-40)} 50 L${sx(-40)} 96`} /></Appear>
      <Label x={226} y={92} text={t("nut")} to={[SX + 9, NUT_Y - 4]} />
      <Label x={222} y={204} text={t("die bolt")} to={[SX + 8, sz(0) + 6]} />
      <Appear a={0.74}><Label x={20} y={164} text={t("lever")} to={[40, sz(8)]} /></Appear>
    </>;
  },
};

const leverRoller: Scene = {
  dur: 4.5,
  still: 3.9,
  draw: (t) => {
    const rx = sx(RY), tip = sz(FLOOR_Z);
    return <>
      <SideBase />
      <DieBoltSide />
      <SideNut y={NUT_Y} />
      <SideLever />
      {/* roller bolt dropped head up into the lever: the tip stops on the floor of the hole */}
      <Move values={[[0, -56], [0, -56], [0, 0], [0, 0]]} times={[0, 0.1, 0.42, 1]}>
        <Fade values={[0, 0, 1, 1]} times={[0, 0.06, 0.1, 1]}>
          <SideBolt x={rx} y0={sz(FLOOR_Z + 30)} y1={tip} head="top" />
        </Fade>
      </Move>
      <Fade values={[0, 0, 1, 0, 1, 0, 0]} times={[0, 0.42, 0.45, 0.49, 0.53, 0.57, 1]}>
        <circle cx={rx} cy={tip} r={9} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      </Fade>
      <Appear a={0.1}><Arrow d={`M${rx - 26} 26 L${rx - 26} 76`} /></Appear>
      <Appear a={0.42}><Label x={40} y={40} text={t("roller bolt")} to={[rx - 8, 66]} /></Appear>
      <Label x={40} y={168} text={t("lever")} to={[sx(-40), sz(12)]} />
      <Label x={270} y={176} text={t("base")} anchor="end" to={[sx(30), sz(4)]} />
    </>;
  },
};

const leverVise: Scene = {
  dur: 4.5,
  still: 3.9,
  draw: (t) => {
    const jt = sz(0) + 2, jb = sz(-25) + 8, tf = sx(-32), tb = sx(-20);
    const jaw = (x0: number, x1: number) => <g>
      <rect x={x0} y={jt} width={x1 - x0} height={jb - jt} fill="var(--bolt)" stroke={FG} strokeWidth={1.2} />
    </g>;
    return <>
      {/* fixed rear jaw and the vise body */}
      <rect x={tf - 50} y={jb} width={tb - tf + 92} height={18} rx={2} fill="var(--sheet)" stroke={FG} strokeWidth={1.2} />
      {jaw(tb, tb + 22)}
      <SideBase />
      <DieBoltSide />
      <SideNut y={NUT_Y} />
      <SideLever />
      <SideBolt x={sx(RY)} y0={sz(FLOOR_Z + 30)} y1={sz(FLOOR_Z)} head="top" />
      {/* the front jaw and its screw close on the tab */}
      <Move values={[[-18, 0], [-18, 0], [0, 0], [0, 0]]} times={[0, 0.14, 0.5, 1]}>
        {jaw(tf - 24, tf)}
        <rect x={tf - 48} y={jb - 22} width={24} height={6} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
        <rect x={tf - 54} y={jb - 40} width={6} height={42} rx={2} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
      </Move>
      <Appear a={0.14}><Arrow d={`M${tf - 56} ${jt - 10} L${tf - 28} ${jt - 10}`} /></Appear>
      <Label x={14} y={232} text={t("vise")} to={[tf - 40, jb + 4]} />
      <Label x={176} y={234} text={t("tab")} to={[tb - 4, jb - 12]} />
      <Label x={300} y={190} text={t("die bolt head")} anchor="end" to={[SX + 6, sz(0) + HH * SK]} />
    </>;
  },
};

// ------------------------------------------------------------------ the whole bender from above

const CX = 190, CY = 110;

const leverStop: Scene = {
  dur: 4.5,
  still: 3.9,
  draw: (t) => {
    const [hx, hy] = ray(90, SR);
    return <g transform={`translate(${CX} ${CY})`}>
      <LeverBase />
      <Fade values={[0, 0, 1, 0, 1, 0, 0]} times={[0, 0.06, 0.14, 0.24, 0.32, 0.42, 1]}><AngleLines o={WY} r0={BASE_R0} rLong={BASE_RL} r1={BASE_R1} stroke="var(--accent)" w={2} /></Fade>
      <Lever />
      <DieEnd />
      <Move values={[[56, -16], [56, -16], [0, 0], [0, 0]]} times={[0, 0.44, 0.66, 1]}>
        <Fade values={[0, 0, 1, 1]} times={[0, 0.42, 0.46, 1]}><Bolt x={hx} y={hy} r={HEAD_R} stop /></Fade>
      </Move>
      <Appear a={0.44}><Arrow d={`M${hx + 60} ${hy - 30} L${hx + 16} ${hy - 16}`} /></Appear>
      <Label x={-185} y={-40} text={t("engraved lines")} to={ray(150, 82, WY)} />
      <Appear a={0.66}><Label x={-28} y={-24} text={t("stop bolt")} anchor="end" to={[hx - 4, hy + 7]} /></Appear>
      <Label x={WY} y={-96} text="90°" anchor="middle" />
    </g>;
  },
};

const leverLoad: Scene = {
  dur: 4.5,
  still: 3.9,
  view: "70 25 256 192",
  draw: (t) => <g transform={`translate(${CX} ${CY})`}>
    <LeverBase />
    <Lever roller={false} />
    {/* wire slides in through the groove until its mark reaches the lever's line */}
    <Move values={[[-110, 0], [-110, 0], [0, 0], [0, 0]]} times={[0, 0.08, 0.5, 1]}>
      <Wire d={`M-150 ${WY} L56 ${WY}`} w={WIRE_W} />
    </Move>
    <DieEnd />
    <Bolt x={0} y={ROLL_Y} r={ROLL_R} />
    <Move values={[[-110, 0], [-110, 0], [0, 0], [0, 0]]} times={[0, 0.08, 0.5, 1]}><Mark x={0} y={WY} /></Move>
    <Fade values={[0, 0, 1, 0, 1, 0, 0]} times={[0, 0.5, 0.53, 0.58, 0.62, 0.67, 1]}><LeverLine stroke="var(--accent)" w={3} /></Fade>
    <Appear a={0.08}><Arrow d="M-80 -14 L-28 -14" /></Appear>
    <Label x={-112} y={-24} text={t("wire")} to={[-100, WY - 3]} />
    <Label x={-24} y={-30} text={t("die")} anchor="end" to={[-5, -5]} />
    <Label x={-34} y={70} text={t("roller")} anchor="end" to={[-5, ROLL_Y + 4]} />
    <Appear a={0.5}><Label x={132} y={78} text={t("cut end")} anchor="end" to={[56, WY + 3]} /></Appear>
    <Appear a={0.5}><Label x={-52} y={36} text={t("mark")} anchor="end" to={[-3, WY + 6]} /></Appear>
  </g>,
};

// ------------------------------------------------------------------ R as drawn, L turned over

const bendRL: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => {
    // walking from the cut end: right, right, left (as seen on the drawing)
    const ring = (x: number, y: number, a: number) => <Fade values={[0, 0, 1, 0, 1, 0, 0]} times={[0, a, a + 0.03, a + 0.07, a + 0.1, a + 0.14, 1]}>
      <circle cx={x} cy={y} r={14} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
    </Fade>;
    const ix = 250, iy = 110;
    return <>
      <Wire d="M24 60 L132 60 Q150 60 150 78 L150 112 Q150 130 132 130 L78 130 Q60 130 60 148 L60 220" />
      <Label x={14} y={48} text={t("cut end")} to={[24, 56]} />
      <Label x={166} y={52} text="R" />
      <Label x={166} y={148} text="R" />
      <Label x={40} y={124} text="L" />
      {ring(150, 60, 0.06)}
      {ring(150, 130, 0.24)}
      {ring(60, 130, 0.72)}
      {/* inset: the wire seen along its axis, the bent part flips to the other side before the L bend */}
      <rect x={ix - 52} y={iy - 70} width={104} height={140} rx={8} fill="var(--panel)" stroke="var(--muted)" strokeWidth={1.2} />
      <Rot about={[ix, iy]} values={[0, 0, 180, 180]} times={[0, 0.42, 0.62, 1]}>
        <Wire d={`M${ix} ${iy} L${ix} ${iy - 50}`} />
      </Rot>
      <circle cx={ix} cy={iy} r={6} fill="var(--copper)" stroke={FG} strokeWidth={1} />
      <Appear a={0.42}><Arrow d={`M${ix + 26} ${iy - 26} A37 37 0 0 1 ${ix + 26} ${iy + 26}`} /></Appear>
      <Appear a={0.42}><line x1={ix - 52} y1={iy} x2={84} y2={130} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" /></Appear>
      <Label x={ix} y={iy + 92} text={t("turn over")} anchor="middle" to={[ix + 30, iy + 34]} />
    </>;
  },
};

// ------------------------------------------------------------------ swing to the stop, press past it, spring back

const leverSwing: Scene = {
  dur: 5,
  still: 4.1,
  draw: (t) => {
    const OVER = 5, sw: [number[], number[]] = [[0, 0, 90, 90 + OVER, 90 + OVER, 90, 90, 0, 0], [0, 0.1, 0.4, 0.48, 0.54, 0.62, 0.94, 0.97, 1]];
    const wire: [number[], number[]] = [[0, 0, 90, 90 + OVER, 90 + OVER, 90, 90, 0, 0], [0, 0.1, 0.4, 0.48, 0.56, 0.62, 0.94, 0.97, 1]];
    const [hx, hy] = ray(90, SR), tk0 = ray(90 + OVER, BASE_RL, WY), tk1 = ray(90 + OVER, BASE_R1, WY);
    return <g transform={`translate(${CX} ${CY})`}>
      <LeverBase />
      {/* the reset to the start fades out and back in rather than un-bending the wire */}
      <Fade values={[1, 1, 0, 0, 1]} times={[0, 0.92, 0.94, 0.98, 1]}>
        <Rot about={[0, 0]} values={sw[0].map((v) => -v)} times={sw[1]}><Lever /></Rot>
        <BenderWire from={-150} len={90} swing={wire} />
      </Fade>
      <Mark x={0} y={WY} />
      <DieEnd />
      <Bolt x={hx} y={hy} r={HEAD_R} stop />
      {/* swing arrow round the handle's end, past the stop */}
      <Appear a={0.1}><Arrow d={`M${ray(-70, 108)[0]} ${ray(-70, 108)[1]} A108 108 0 0 0 ${ray(-6, 108)[0]} ${ray(-6, 108)[1]}`} /></Appear>
      <Appear a={0.48}>
        <line x1={tk0[0]} y1={tk0[1]} x2={tk1[0]} y2={tk1[1]} stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" />
        <Label x={tk1[0] - 4} y={-95} text={`+${OVER}°`} anchor="end" />
      </Appear>
      <Appear a={0.56}><Arrow d={`M-34 -78 L2 -78`} /></Appear>
      <Appear a={0.56}><Label x={-38} y={-74} text={t("springback")} anchor="end" /></Appear>
      <Label x={-28} y={-24} text={t("stop bolt")} anchor="end" to={[hx - 4, hy + 7]} />
      <Appear a={0.4}><Label x={120} y={60} text={t("lever")} anchor="end" to={[80, 12]} /></Appear>
    </g>;
  },
};

export const LEVER_SCENES = {
  "bender-choice": benderChoice,
  "lever-print": leverPrint,
  "lever-assemble": leverAssemble,
  "lever-roller": leverRoller,
  "lever-vise": leverVise,
  "lever-stop": leverStop,
  "lever-load": leverLoad,
  "bend-rl": bendRL,
  "lever-swing": leverSwing,
} satisfies Record<string, Scene>;
