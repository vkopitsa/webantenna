// Printed-board, PCB-loop and air-patch build steps (STEP_TEXT.pcb, STEP_TEXT.loop, STEP_TEXT.air).
import {
  Appear, Arrow, Cap, Cutters, Dim, Draw, Drill, Fade, FlatFile, Iron, Joint, Label, Mark, Move, Plastic, Plate,
  Ruler, Screen, Screwdriver, SmaEdge, SmaJack, Snips, Standoff, SwrCurve, Trimmer, Via, FG, type Scene,
} from "../kit";

// ------------------------------------------------------------------ make the board

/**
 * A generic etched pattern (an L trace and a round pad) on a board whose top-left corner is (x, y), drawn in `c`
 * (copper on the board, toner, or printer ink on the paper); `m` mirrors it left-right.
 */
function pattern(x: number, y: number, c: string, m = false) {
  const px = (u: number) => (m ? x + 80 - u : x + u);
  const d = `M${px(10)} ${y + 15} L${px(54)} ${y + 15} L${px(54)} ${y + 40} L${px(70)} ${y + 40}`;
  return <g><path d={d} fill="none" stroke={c} strokeWidth={6} strokeLinejoin="round" /><circle cx={px(20)} cy={y + 38} r={6} fill={c} /></g>;
}

const makeBoard: Scene = {
  dur: 5,
  still: 4.3,
  draw: (t) => <>
    {/* the etch tray */}
    <rect x={116} y={112} width={100} height={78} rx={8} fill="var(--panel2)" stroke={FG} strokeWidth={1.5} />
    <rect x={122} y={118} width={88} height={66} rx={5} fill="var(--muted)" opacity={0.25} />
    {/* the board: copper over FR-4, toner after the transfer, copper traces after the etch */}
    <Move values={[[0, 0], [0, 0], [98, 28], [98, 28], [202, 54], [202, 54]]} times={[0, 0.3, 0.4, 0.58, 0.7, 1]}>
      <rect x={28} y={96} width={80} height={55} rx={2} fill="var(--fr4)" stroke={FG} strokeWidth={1} />
      {pattern(28, 96, "var(--copper)")}
      <Fade values={[1, 1, 0, 0]} times={[0, 0.44, 0.54, 1]}>
        <rect x={28} y={96} width={80} height={55} rx={2} fill="var(--copper)" stroke={FG} strokeWidth={1} />
      </Fade>
      <Fade values={[0, 0, 1, 1, 0, 0]} times={[0, 0.2, 0.24, 0.6, 0.66, 1]}>{pattern(28, 96, "var(--coax)")}</Fade>
      <Fade values={[1, 1, 0, 0, 1, 1]} times={[0, 0.28, 0.3, 0.68, 0.72, 1]}><Label x={68} y={170} text={t("copper")} anchor="middle" to={[82, 128]} /></Fade>
    </Move>
    <rect x={122} y={118} width={88} height={66} rx={5} fill="var(--muted)" opacity={0.2} />
    {/* the paper template, printed mirrored, laid face down on the copper and lifted off */}
    <Move values={[[0, 0], [0, 0], [0, 82], [0, 82], [0, 0], [0, 0]]} times={[0, 0.05, 0.14, 0.2, 0.28, 1]}>
      <rect x={28} y={14} width={80} height={55} fill="var(--panel)" stroke={FG} strokeWidth={1.2} />
      {pattern(28, 14, FG, true)}
    </Move>
    {/* the "mirrored" icon: a shape and its mirror image about a dashed axis */}
    <g>
      <line x1={130} y1={62} x2={130} y2={86} stroke={FG} strokeWidth={1} strokeDasharray="3 2" />
      <path d="M126 65 L117 74 L126 83 Z" fill={FG} />
      <path d="M134 65 L143 74 L134 83 Z" fill="none" stroke={FG} strokeWidth={1.2} strokeLinejoin="round" />
    </g>
    <Label x={116} y={52} text={t("template")} />
    <Fade values={[0, 0, 1, 1, 0, 0]} times={[0, 0.05, 0.08, 0.26, 0.3, 1]}><Arrow d="M16 30 L16 104" /></Fade>
    {/* or order it */}
    <Appear a={0.05}><Arrow d="M112 26 L226 26" /></Appear>
    <Label x={170} y={18} text={t("order")} anchor="middle" />
    <g>
      <path d="M236 64 L236 30 L254 40 L254 30 L272 40 L272 30 L290 40 L290 18 L300 18 L300 64 Z" fill="var(--panel2)" stroke={FG} strokeWidth={1.5} strokeLinejoin="round" />
      {[244, 262, 280].map((x) => <rect key={x} x={x} y={48} width={8} height={8} fill="var(--panel)" stroke={FG} strokeWidth={1} />)}
    </g>
    {/* the etch and out */}
    <Appear a={0.3}><Arrow d="M86 178 Q96 206 124 196" /></Appear>
    <Appear a={0.58}><Arrow d="M214 110 Q246 104 260 140" /></Appear>
    <Label x={166} y={208} text={t("etch")} anchor="middle" />
  </>,
};

// ------------------------------------------------------------------ connector on the board edge

const boardConnector: Scene = {
  dur: 4.5,
  still: 4,
  draw: (t) => <>
    <rect x={14} y={30} width={186} height={180} rx={3} fill="var(--fr4)" stroke={FG} strokeWidth={1} />
    <rect x={40} y={117} width={160} height={6} fill="var(--copper)" />
    <rect x={140} y={30} width={60} height={77} fill="var(--copper)" />
    <rect x={140} y={133} width={60} height={77} fill="var(--copper)" />
    <Move values={[[70, 0], [70, 0], [0, 0], [0, 0]]} times={[0, 0.05, 0.3, 1]}>
      <SmaEdge x={200} y={120} />
    </Move>
    <Appear a={0.05}><Arrow d="M300 166 L250 166" /></Appear>
    <Appear a={0.5}><Joint x={190} y={100} /></Appear>
    <Appear a={0.66}><Joint x={190} y={140} /></Appear>
    <Appear a={0.82}><Joint x={190} y={120} /></Appear>
    <Move values={[[-40, -50], [-40, -50], [0, -20], [0, -20], [0, 20], [0, 20], [0, 0], [0, 0]]} times={[0, 0.34, 0.46, 0.54, 0.62, 0.7, 0.78, 1]}>
      <Iron x={190} y={120} rot={30} />
      <Label x={64} y={100} text={t("iron")} anchor="end" />
    </Move>
    <Appear a={0.34}><Arrow d="M126 58 L168 82" /></Appear>
    <Appear a={0.3}><Label x={300} y={60} text={t("connector")} anchor="end" to={[236, 96]} /></Appear>
    <Label x={24} y={176} text={t("centre pin")} to={[186, 122]} />
    <Label x={300} y={224} text={t("ground")} anchor="end" to={[196, 200]} />
  </>,
};

// ------------------------------------------------------------------ stack the boards on the coax

/** One board seen edge-on, top face at y, with its copper on top. */
function edgeBoard(y: number) {
  return <g><rect x={80} y={y} width={160} height={6} fill="var(--fr4)" stroke={FG} strokeWidth={1} /><rect x={80} y={y - 2} width={160} height={2.5} fill="var(--copper)" /></g>;
}

const stackBoards: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => {
    const parts: { y: number; spacer?: number; a: number }[] = [
      { y: 200, a: 0.12 }, { y: 160, spacer: 160, a: 0.24 }, { y: 152, a: 0.34 },
      { y: 112, spacer: 112, a: 0.46 }, { y: 104, a: 0.56 },
    ];
    return <>
      <Move values={[[0, 200], [0, 200], [0, 0], [0, 0]]} times={[0, 0.01, 0.11, 1]}>
        <rect x={152} y={40} width={16} height={220} rx={3} fill="var(--coax)" stroke={FG} strokeWidth={1} />
      </Move>
      {parts.map((p, i) => (
        <Move key={i} values={[[0, -240], [0, -240], [0, 0], [0, 0]]} times={[0, p.a, p.a + 0.1, 1]}>
          {p.spacer ? <><Plastic x={96} y={p.spacer} w={18} h={40} rx={2} /><Plastic x={206} y={p.spacer} w={18} h={40} rx={2} /></> : edgeBoard(p.y)}
        </Move>
      ))}
      {[206, 158, 110].map((y, i) => <Appear key={y} a={0.7 + 0.04 * i}><Joint x={148} y={y - 7} /><Joint x={172} y={y - 7} /></Appear>)}
      <Appear a={0.11}><Arrow d="M272 34 L272 104" /></Appear>
      <Label x={60} y={60} text={t("coax")} to={[150, 64]} />
      <Appear a={0.22}><Label x={250} y={228} text={t("board")} to={[232, 210]} /></Appear>
      <Appear a={0.34}><Label x={30} y={140} text={t("spacer")} to={[94, 134]} /></Appear>
    </>;
  },
};

// ------------------------------------------------------------------ stitching vias

const viaAt: [number, number][] = [
  ...Array.from({ length: 7 }, (_, i): [number, number] => [32, 30 + 20 * i]),
  ...Array.from({ length: 9 }, (_, i): [number, number] => [52 + 20 * i, 148]),
];

const stitchVias: Scene = {
  dur: 4.5,
  still: 4,
  draw: (t) => <>
    <rect x={20} y={15} width={210} height={210} rx={3} fill="var(--fr4)" stroke={FG} strokeWidth={1} />
    <path d="M20 18 Q20 15 23 15 L230 15 L230 160 L20 160 Z" fill="var(--copper)" />
    {viaAt.map(([x, y], i) => <Appear key={i} a={0.05 + 0.04 * i}><Via x={x} y={y} /></Appear>)}
    <Appear a={0.05}><Arrow d="M10 30 L10 174 L212 174" /></Appear>
    {/* inset: a cut through one via, top and bottom copper joined by the plated barrel */}
    <line x1={212} y1={148} x2={244} y2={150} stroke={FG} strokeWidth={0.8} strokeDasharray="3 2" />
    <rect x={240} y={60} width={74} height={96} rx={4} fill="var(--panel)" stroke={FG} strokeWidth={1.2} />
    <rect x={246} y={92} width={62} height={30} fill="var(--fr4)" />
    <rect x={246} y={86} width={62} height={6} fill="var(--copper)" stroke={FG} strokeWidth={0.6} />
    <rect x={246} y={122} width={62} height={6} fill="var(--copper)" stroke={FG} strokeWidth={0.6} />
    <rect x={270} y={86} width={14} height={42} fill="var(--panel)" />
    <Appear a={0.1}>
      <rect x={270} y={86} width={3.5} height={42} fill="var(--copper)" stroke={FG} strokeWidth={0.6} />
      <rect x={280.5} y={86} width={3.5} height={42} fill="var(--copper)" stroke={FG} strokeWidth={0.6} />
    </Appear>
    <Label x={125} y={90} text={t("ground pour")} anchor="middle" />
    <Label x={316} y={176} text={t("via")} anchor="end" to={[277, 130]} />
  </>,
};

// ------------------------------------------------------------------ loop capacitors

const R = 74, CY = 128, GY = Math.sqrt(R * R - 64);

const loopCaps: Scene = {
  dur: 4.5,
  still: 4,
  draw: (t) => <>
    <rect x={56} y={12} width={208} height={226} rx={4} fill="var(--fr4)" stroke={FG} strokeWidth={1} />
    <path d={`M168 ${CY - GY} A${R} ${R} 0 0 1 168 ${CY + GY}`} fill="none" stroke="var(--copper)" strokeWidth={9} />
    <path d={`M152 ${CY + GY} A${R} ${R} 0 0 1 152 ${CY - GY}`} fill="none" stroke="var(--copper)" strokeWidth={9} />
    <path d={`M152 ${CY + GY} L152 238 M168 ${CY + GY} L168 238`} fill="none" stroke="var(--copper)" strokeWidth={6} />
    <Move values={[[0, -50], [0, -50], [0, 0], [0, 0]]} times={[0, 0.06, 0.24, 1]}>
      <Cap x={160} y={CY - GY} w={24} h={11} />
    </Move>
    <Appear a={0.06}><Arrow d="M124 6 L124 44" /></Appear>
    <Move values={[[0, -60], [0, -60], [0, 0], [0, 0]]} times={[0, 0.32, 0.5, 1]}>
      <Fade values={[0, 0, 1, 1]} times={[0, 0.32, 0.34, 1]}><Cap x={160} y={CY + GY} w={24} h={11} /></Fade>
    </Move>
    <Appear a={0.32}><Arrow d="M124 148 L124 194" /></Appear>
    <Appear a={0.6}>
      <path d="M150 50 L150 36 M170 50 L170 36" fill="none" stroke="var(--copper)" strokeWidth={4} />
      <Trimmer x={160} y={30} s={22} />
    </Appear>
    <Appear a={0.24}><Label x={196} y={74} text={t("Cs")} to={[172, 60]} /></Appear>
    <Appear a={0.5}><Label x={196} y={192} text={t("Cp")} to={[173, 200]} /></Appear>
    <Appear a={0.6}><Label x={196} y={26} text={t("trimmer")} to={[173, 30]} /></Appear>
  </>,
};

// ------------------------------------------------------------------ tune with the trimmer, fit the fixed capacitor

const loopTrim: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => <>
    <rect x={8} y={126} width={150} height={80} rx={3} fill="var(--fr4)" stroke={FG} strokeWidth={1} />
    <path d="M8 166 L62 166 M98 166 L158 166" fill="none" stroke="var(--copper)" strokeWidth={9} />
    <Appear a={0.64}><Cap x={80} y={166} w={40} h={18} /></Appear>
    <Move values={[[0, 0], [0, 0], [0, -64], [0, -64]]} times={[0, 0.52, 0.62, 1]}>
      <Fade values={[1, 1, 0.4, 0.4]} times={[0, 0.52, 0.62, 1]}>
        <Trimmer x={80} y={166} s={40} turn={[[0, 0, 70, 70], [0, 0.1, 0.45, 1]]} />
      </Fade>
      <Label x={112} y={146} text={t("trimmer")} to={[100, 156]} />
    </Move>
    <Fade values={[1, 1, 0, 0]} times={[0, 0.48, 0.52, 1]}>
      <Screwdriver x={80} y={166} rot={60} />
      <Arrow d="M110 146 A28 28 0 0 1 106 190" />
    </Fade>
    <Appear a={0.52}><Arrow d="M40 154 L40 100" /></Appear>
    <Appear a={0.64}><Label x={80} y={230} text={t("fixed capacitor")} anchor="middle" to={[80, 176]} /></Appear>
    <Screen x={172} y={60} w={140} h={110}>
      <Move values={[[0, 0], [0, 0], [-40, 0], [-40, 0]]} times={[0, 0.1, 0.45, 1]}>
        <SwrCurve x0={150} x1={380} top={76} bottom={150} at={282} />
      </Move>
      <line x1={242} y1={64} x2={242} y2={162} stroke="var(--mark)" strokeWidth={2} strokeDasharray="5 3" />
    </Screen>
    <Appear a={0.1}><Arrow d="M290 188 L250 188" /></Appear>
    <Label x={184} y={78} text={t("SWR")} />
  </>,
};

// ------------------------------------------------------------------ cut the plates

const cutPlates: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => <>
    <rect x={150} y={104} width={150} height={110} fill="var(--sheet)" stroke={FG} strokeWidth={1.2} />
    <Move values={[[0, 0], [0, 0], [-34, 0], [-34, 0]]} times={[0, 0.44, 0.52, 1]}>
      <rect x={50} y={104} width={100} height={110} fill="var(--sheet)" stroke={FG} strokeWidth={1.2} />
    </Move>
    <line x1={150} y1={104} x2={150} y2={214} stroke="var(--mark)" strokeWidth={2} strokeDasharray="6 4" />
    <Draw d="M150 104 L150 214" times={[0.08, 0.4]} w={2.5} stroke={FG} />
    <Move values={[[0, 0], [0, 0], [0, 110], [0, 110]]} times={[0, 0.08, 0.4, 1]}>
      <Snips x={150} y={62} rot={90} />
    </Move>
    <Appear a={0.08}><Arrow d="M300 30 L300 120" /></Appear>
    <Appear a={0.44}><Arrow d="M96 228 L50 228" /></Appear>
    <Fade values={[0, 0, 1, 1]} times={[0, 0.54, 0.58, 1]}>
      <Move values={[[0, 0], [0, 0], [0, 24], [0, 0], [0, 24], [0, 0], [0, 24], [0, 24]]} times={[0, 0.58, 0.64, 0.7, 0.76, 0.82, 0.88, 1]}>
        <FlatFile x={116} y={182} rot={90} len={70} />
      </Move>
      <Arrow d="M98 120 L98 190" />
    </Fade>
    <Label x={250} y={190} text={t("sheet")} anchor="middle" />
    <Label x={240} y={60} text={t("snips")} anchor="middle" to={[166, 110]} />
    <Fade values={[0, 0, 1, 1]} times={[0, 0.54, 0.58, 1]}><Label x={40} y={70} text={t("file")} to={[110, 112]} /></Fade>
  </>,
};

// ------------------------------------------------------------------ drill the plates

/** Probe and standoff holes of a plate centred at (cx, 178): probe on the left of the centre, standoffs on the centre line. */
const holes = (cx: number) => ({ probe: [cx - 26, 178] as const, s1: [cx, 148] as const, s2: [cx, 208] as const });
const G = holes(82), P = holes(232);
const visits = [G.probe, P.probe, G.s1, G.s2, P.s2, P.s1];

const drillPlates: Scene = {
  dur: 5,
  still: 4.4,
  view: "0 0 320 260",
  draw: (t) => <>
    <rect x={14} y={118} width={136} height={120} fill="var(--sheet)" stroke={FG} strokeWidth={1.2} />
    <rect x={180} y={133} width={104} height={90} fill="var(--sheet)" stroke={FG} strokeWidth={1.2} />
    {[82, 232].map((x) => <line key={x} x1={x} y1={110} x2={x} y2={246} stroke={FG} strokeWidth={0.8} strokeDasharray="6 3 2 3" />)}
    {visits.map(([x, y], i) => <g key={i}><Mark x={x} y={y} /><Mark x={x} y={y} rot={90} /></g>)}
    {visits.map(([x, y], i) => (
      <Appear key={`h${i}`} a={0.14 + 0.1 * i}><circle cx={x} cy={y} r={i === 0 ? 6 : 3.5} fill="var(--panel)" stroke={FG} strokeWidth={1.2} /></Appear>
    ))}
    <Move values={[[58, 70], ...visits.flatMap(([x, y]): [number, number][] => [[x, y], [x, y]]), [232, 148]]}
      times={[0, ...visits.flatMap((_, i) => [0.08 + 0.1 * i, 0.14 + 0.1 * i]), 1]}>
      <Drill x={0} y={0} rot={90} />
      <Arrow d="M-26 -64 L-26 -20" />
    </Move>
    <Label x={82} y={254} text={t("ground plate")} anchor="middle" />
    <Label x={232} y={254} text={t("patch plate")} anchor="middle" />
    <Label x={8} y={104} text={t("probe hole")} to={[54, 172]} />
    <Label x={314} y={127} text={t("standoff holes")} anchor="end" to={[236, 202]} />
  </>,
};

// ------------------------------------------------------------------ fit the SMA jack

const fitJack: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => <>
    <Move values={[[0, 100], [0, 100], [0, 0], [0, 0]]} times={[0, 0.05, 0.3, 1]}>
      <SmaJack x={160} y={156} pin={52} />
      <Fade values={[1, 1, 0, 0]} times={[0, 0.66, 0.72, 1]}>
        <rect x={158.4} y={46} width={3.2} height={50} fill="var(--solder)" stroke={FG} strokeWidth={1} />
      </Fade>
    </Move>
    <Plate x={30} y={150} w={122} h={6} />
    <Plate x={168} y={150} w={122} h={6} />
    <Appear a={0.05}><Arrow d="M214 236 L214 186" /></Appear>
    <Appear a={0.34}>
      <g transform="translate(116 150) rotate(-90)"><Ruler x={0} y={0} len={70} /></g>
      <line x1={90} y1={96} x2={240} y2={96} stroke="var(--muted)" strokeWidth={1} strokeDasharray="5 3" />
      <Mark x={160} y={96} rot={90} />
      <Dim x1={100} y1={150} x2={100} y2={96} />
      <Label x={94} y={128} text={t("height")} anchor="end" />
    </Appear>
    <Move values={[[70, 0], [70, 0], [0, 0], [0, 0]]} times={[0, 0.5, 0.62, 1]}>
      <Fade values={[0, 0, 1, 1]} times={[0, 0.48, 0.5, 1]}>
        <Cutters x={164} y={96} rot={180} />
        <Label x={300} y={128} text={t("cutters")} anchor="end" />
      </Fade>
    </Move>
    <Appear a={0.5}><Arrow d="M300 54 L240 54" /></Appear>
    <Label x={24} y={176} text={t("ground plate")} to={[50, 157]} />
    <Label x={192} y={140} text={t("pin")} to={[163, 130]} />
    <Appear a={0.3}><Label x={250} y={222} text={t("SMA jack")} to={[172, 196]} /></Appear>
  </>,
};

// ------------------------------------------------------------------ mount the patch

const mountPatch: Scene = {
  dur: 4.5,
  still: 4,
  draw: (t) => <>
    <SmaJack x={160} y={182} pin={62} />
    <Plate x={30} y={176} w={122} h={6} />
    <Plate x={168} y={176} w={122} h={6} />
    <Standoff x={90} y0={118} y1={176} />
    <Standoff x={230} y0={118} y1={176} />
    <Move values={[[0, -90], [0, -90], [0, 0], [0, 0]]} times={[0, 0.05, 0.35, 1]}>
      <Plate x={60} y={112} w={96} h={6} />
      <Plate x={164} y={112} w={96} h={6} />
    </Move>
    <Appear a={0.05}><Arrow d="M286 20 L286 90" /></Appear>
    <Appear a={0.6}><Joint x={160} y={110} /></Appear>
    <Appear a={0.42}>
      <Move values={[[60, -40], [60, -40], [0, 0], [0, 0]]} times={[0, 0.44, 0.56, 1]}>
        <Iron x={163} y={106} rot={150} />
        <Label x={240} y={34} text={t("iron")} />
      </Move>
    </Appear>
    <Appear a={0.44}><Arrow d="M256 78 L206 104" /></Appear>
    <Appear a={0.35}><Label x={20} y={100} text={t("patch plate")} to={[70, 112]} /></Appear>
    <Label x={20} y={214} text={t("standoff")} to={[86, 170]} />
    <Label x={300} y={150} text={t("pin")} anchor="end" to={[164, 150]} />
  </>,
};

// ------------------------------------------------------------------ fit the director

const fitDirector: Scene = {
  dur: 4.5,
  still: 4,
  draw: (t) => <>
    <SmaJack x={160} y={214} pin={42} />
    <Plate x={30} y={208} w={122} h={6} />
    <Plate x={168} y={208} w={122} h={6} />
    <Standoff x={90} y0={166} y1={208} />
    <Standoff x={230} y0={166} y1={208} />
    <Plate x={60} y={160} w={96} h={6} />
    <Plate x={164} y={160} w={96} h={6} />
    <Joint x={160} y={158} />
    <Standoff x={120} y0={80} y1={160} />
    <Standoff x={200} y0={80} y1={160} />
    <line x1={160} y1={40} x2={160} y2={150} stroke={FG} strokeWidth={0.8} strokeDasharray="6 3 2 3" />
    <Move values={[[0, -80], [0, -80], [0, 0], [0, 0]]} times={[0, 0.05, 0.4, 1]}>
      <Plate x={96} y={74} w={128} h={6} />
    </Move>
    <Appear a={0.05}><Arrow d="M252 14 L252 64" /></Appear>
    <Appear a={0.5}><Dim x1={276} y1={80} x2={276} y2={160} /></Appear>
    <Appear a={0.4}><Label x={20} y={70} text={t("director")} to={[98, 76]} /></Appear>
    <Label x={300} y={186} text={t("patch")} anchor="end" to={[254, 166]} />
    <Label x={20} y={120} text={t("standoff")} to={[114, 118]} />
  </>,
};

export const BOARD_SCENES = {
  "make-board": makeBoard,
  "board-connector": boardConnector,
  "stack-boards": stackBoards,
  "stitch-vias": stitchVias,
  "loop-caps": loopCaps,
  "loop-trim": loopTrim,
  "cut-plates": cutPlates,
  "drill-plates": drillPlates,
  "fit-jack": fitJack,
  "mount-patch": mountPatch,
  "fit-director": fitDirector,
} satisfies Record<string, Scene>;
