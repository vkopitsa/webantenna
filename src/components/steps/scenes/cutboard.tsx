// Cut board steps (CUTBEND_HOWTO.board) and the "B1 is the mark nearest the cut end" line of both benders.
// The board as printed (lib/print/families/cutbend.ts): a flat bar, one blind hole per cut length running along it,
// open at one short edge (here the left), numbered from the longest, numbers engraved on top by the open edge,
// slits across each hole at its bend marks.
import {
  Appear, Arrow, Cutters, Fade, Hotend, Label, Mark, Move, Pen, Plastic, PrintBed, PrintLayers, Wire, FG, type Scene,
} from "../kit";

// ------------------------------------------------------------------ the board from above

const BX = 110, BX1 = 300, BY = 60, BY1 = 170;
/** Holes: axis y, blind end x, slits x (the bend marks). Hole 1 is the longest. */
const HOLES = [
  { y: 85, end: 290, slits: [160, 235] },
  { y: 115, end: 270, slits: [145, 205] },
  { y: 145, end: 250, slits: [150, 190, 225] },
];

/** The printed cut board from above: hidden holes dashed, slits open down to the hole, numbers engraved by the open edge. */
function cutBoard() {
  return <g>
    <Plastic x={BX} y={BY} w={BX1 - BX} h={BY1 - BY} rx={3} />
    {HOLES.map((h, i) => <g key={i}>
      <path d={`M${BX} ${h.y - 3.5} L${h.end} ${h.y - 3.5} L${h.end} ${h.y + 3.5} L${BX} ${h.y + 3.5}`} fill="none" stroke="var(--plastic-edge)" strokeWidth={1} strokeDasharray="4 3" />
      {h.slits.map((x) => <rect key={x} x={x - 2} y={h.y - 6} width={4} height={12} fill="var(--coax)" />)}
      <text x={BX + 8} y={h.y - 7} fontSize={12} fontWeight={700} fill="var(--plastic-edge)" fontFamily="system-ui, sans-serif">{i + 1}</text>
    </g>)}
  </g>;
}

// ------------------------------------------------------------------ print it

const printFlatBoard: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => {
    // board: front face 190 × 24 from (74, 184), receding (-14, -34); 6 layers between 0.08 and 0.6
    const n = 6, t0 = 0.08, t1 = 0.6, step = (t1 - t0) / n;
    const xs = [73, 251];
    const z: [number, number][] = [], zt: number[] = [], xv: [number, number][] = [[xs[0], 0]], xt: number[] = [t0];
    for (let i = 0; i < n; i++) {
      z.push([0, -4 * i], [0, -4 * i]); zt.push(t0 + step * i, t0 + step * (i + 1) - 0.01);
      xv.push([xs[1 - (i % 2)], 0]); xt.push(t0 + step * (i + 1));
    }
    const top = <>
      {[8, 17, 26].map((v, i) => <g key={v}>
        <text x={5} y={v + 3} fontSize={8} fontWeight={700} fill="var(--plastic-edge)" fontFamily="system-ui, sans-serif">{i + 1}</text>
        {[[62, 128], [52, 104], [44, 80, 112]][i].map((u) => <rect key={u} x={u - 1.2} y={v - 3} width={2.4} height={6} fill="var(--coax)" />)}
      </g>)}
    </>;
    return <>
      <rect x={6} y={20} width={8} height={176} fill="var(--coax)" stroke={FG} strokeWidth={1} />
      <rect x={306} y={20} width={8} height={176} fill="var(--coax)" stroke={FG} strokeWidth={1} />
      <PrintBed x={24} y={196} w={272} />
      <PrintLayers x={74} y={184} w={190} h={24} dx={-14} dy={-34} depth={34} n={n} times={[t0, t1]} top={top} />
      {/* hole openings on the open (left) end, at mid-thickness: they appear with the layer that closes over them */}
      <Appear a={t0 + step * 4 - 0.04}>
        {[8, 17, 26].map((v) => <circle key={v} cx={60 + (v * 14) / 34} cy={138 + v} r={2.4} fill="var(--coax)" />)}
      </Appear>
      {/* gantry: steps up a layer at a time, then lifts clear; the head runs to and fro along it */}
      <Move values={[[0, 0], ...z, [0, -80], [0, -80]]} times={[0, ...zt, 0.7, 1]}>
        <rect x={14} y={116} width={292} height={6} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
        <Move values={[[xs[0], 0], [xs[0], 0], ...xv, [262, 0], [262, 0]]} times={[0, t0 - 0.01, ...xt, 0.7, 1]}>
          <Hotend x={0} y={163} />
        </Move>
        <Appear a={t0}><Arrow d="M86 97 L240 97" both /></Appear>
      </Move>
      <Appear a={t0}><Arrow d="M284 182 L284 136" /></Appear>
      <Appear a={0.66}><Label x={18} y={98} text={t("numbers up")} to={[64, 130]} /></Appear>
      <Label x={300} y={228} text={t("print bed")} anchor="end" to={[250, 206]} />
    </>;
  },
};

// ------------------------------------------------------------------ push the wire in and cut it flush

const cutboardCut: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => {
    const y = HOLES[2].y, end = HOLES[2].end;
    return <>
      {cutBoard()}
      {/* the wire, pushed in until it stops at the bottom of hole 3; the off-cut drops away after the cut */}
      <Move values={[[-140, 0], [-140, 0], [0, 0], [0, 0]]} times={[0, 0.05, 0.38, 1]}>
        <Wire d={`M${BX} ${y} L${end} ${y}`} w={4} />
        <Move values={[[0, 0], [0, 0], [-12, 46], [-12, 46]]} times={[0, 0.62, 0.72, 1]}>
          <Fade values={[1, 1, 0, 0]} times={[0, 0.66, 0.74, 1]}><Wire d={`M14 ${y} L${BX} ${y}`} w={4} /></Fade>
        </Move>
        <Label x={176} y={204} text={t("wire")} to={[180, 149]} />
      </Move>
      <Appear a={0.05}><Arrow d="M20 166 L82 166" /></Appear>
      {/* the stop at the bottom of the hole flashes */}
      <Fade values={[0, 0, 1, 0, 1, 0, 0]} times={[0, 0.37, 0.4, 0.44, 0.48, 0.52, 1]}>
        <circle cx={end} cy={y} r={10} fill="none" stroke="var(--accent)" strokeWidth={3} />
        {[[16, 0], [12, -12], [12, 12], [0, -16], [0, 16]].map(([dx, dy]) => <line key={`${dx} ${dy}`} x1={end + dx * 0.8} y1={y + dy * 0.8} x2={end + dx * 1.2} y2={y + dy * 1.2} stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" />)}
      </Fade>
      <Label x={296} y={204} text={t("hole")} anchor="end" to={[end + 2, y + 6]} />
      {/* cutters come down on the wire flat against the board edge */}
      <Move values={[[-30, -40], [-30, -40], [0, 0], [0, 0]]} times={[0, 0.48, 0.6, 1]}>
        <Fade values={[0, 0, 1, 1]} times={[0, 0.46, 0.5, 1]}><Cutters x={97} y={136} rot={70} /></Fade>
      </Move>
      <Appear a={0.48}><Arrow d="M34 92 L56 122" /></Appear>
      <Appear a={0.6}><Label x={112} y={36} text={t("cutters")} to={[82, 52]} /></Appear>
      <Appear a={0.7}><Label x={56} y={214} text={t("flush")} to={[108, y + 4]} /></Appear>
    </>;
  },
};

// ------------------------------------------------------------------ mark through the slits

const cutboardMark: Scene = {
  dur: 4.5,
  still: 3.9,
  draw: (t) => {
    const h = HOLES[2], y = h.y;
    const at = h.slits.map((x) => x - h.slits[0]);
    return <>
      {cutBoard()}
      <Wire d={`M${BX} ${y} L${h.end} ${y}`} w={4} />
      {h.slits.map((x, i) => <Appear key={x} a={0.14 + 0.2 * i}><Mark x={x} y={y} /></Appear>)}
      <Move
        values={[[-34, 34], [-34, 34], [at[0], 0], [at[0], 0], [at[1], 0], [at[1], 0], [at[2], 0], [at[2], 0], [at[2] + 40, -10], [at[2] + 40, -10]]}
        times={[0, 0.02, 0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 1]}>
        <Pen x={h.slits[0]} y={y} rot={-120} />
      </Move>
      <Appear a={0.02}><Arrow d="M140 131 L244 131" /></Appear>
      <Label x={224} y={226} text={t("pen")} to={[279, 176]} />
      <Label x={150} y={40} text={t("slit")} to={[160, 78]} />
      <Appear a={0.18}><Label x={92} y={210} text={t("mark")} to={[148, 154]} /></Appear>
    </>;
  },
};

// ------------------------------------------------------------------ bend order from the cut end

const bendOrder: Scene = {
  dur: 4.5,
  still: 3.9,
  view: "10 35 300 225",
  draw: (t) => {
    const y = 110, marks = [100, 170, 240];
    return <>
      <Wire d={`M30 ${y} L292 ${y}`} />
      {marks.map((x, i) => <g key={x}>
        <Mark x={x} y={y} />
        <Label x={x} y={y - 16} text={`B${i + 1}`} anchor="middle" />
        <Fade values={[0, 0, 1, 0, 1, 0, 0]} times={[0, 0.1 + 0.2 * i, 0.14 + 0.2 * i, 0.19 + 0.2 * i, 0.23 + 0.2 * i, 0.28 + 0.2 * i, 1]}>
          <circle cx={x} cy={y} r={14} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        </Fade>
        <Appear a={0.1 + 0.2 * i}><Arrow d={`M${i ? marks[i - 1] + 6 : 32} ${y + 30} L${x - 6} ${y + 30}`} /></Appear>
      </g>)}
      <Label x={14} y={74} text={t("cut end")} to={[30, y - 5]} />
    </>;
  },
};

export const CUTBOARD_SCENES = {
  "print-flat-board": printFlatBoard,
  "cutboard-cut": cutboardCut,
  "cutboard-mark": cutboardMark,
  "bend-order": bendOrder,
} satisfies Record<string, Scene>;
