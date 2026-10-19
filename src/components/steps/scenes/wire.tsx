// Wire-antenna build steps and the common measure / trim / seal steps (STEP_TEXT.wire, STEP_TEXT.common).
import {
  Analyser, Appear as In, Arrow, Check, Coax, Cutters, Draw, Drill, Fade, Hand, Iron, Label, Mark, Move, Pliers,
  Plastic, Rot, Ruler, FeedBlock, Terminals, Joint as Blob, Screen, SwrCurve, Wire, FG, type Scene,
} from "../kit";

// ------------------------------------------------------------------ cut

const cutWire: Scene = {
  dur: 4,
  still: 3.5,
  draw: (t) => <>
    <Ruler x={20} y={150} len={270} />
    <Wire d="M20 146 L230 146" />
    <Move values={[[0, 0], [0, 0], [8, 54], [8, 54]]} times={[0, 0.5, 0.68, 1]}>
      <Wire d="M232 146 L290 146" />
    </Move>
    <In a={0.08}><Mark x={230} y={146} /></In>
    <In a={0.2}><Arrow d="M208 70 L208 118" /></In>
    <Move values={[[0, -50], [0, -50], [0, 0], [0, 0]]} times={[0, 0.2, 0.45, 1]}>
      <Cutters x={231} y={128} rot={90} />
      <Label x={254} y={60} text={t("cutters")} to={[238, 70]} />
    </Move>
    <Label x={30} y={132} text={t("wire")} />
    <Label x={30} y={190} text={t("ruler")} />
    <In a={0.08}><Label x={258} y={130} text={t("mark")} to={[236, 140]} /></In>
  </>,
};

// ------------------------------------------------------------------ wind

const turns = Array.from({ length: 10 }, (_, i) => `M${122 + 12 * i} 121 L${131 + 12 * i} 95`);

const windCoil: Scene = {
  dur: 4.5,
  still: 3.9,
  draw: (t) => <>
    <rect x={60} y={100} width={202} height={16} fill="var(--bolt)" stroke={FG} strokeWidth={1.2} />
    <path d="M262 100 L280 108 L262 116 Z" fill="var(--bolt)" stroke={FG} strokeWidth={1.2} strokeLinejoin="round" />
    {Array.from({ length: 11 }, (_, i) => <line key={i} x1={118 + 13 * i} y1={100} x2={128 + 13 * i} y2={116} stroke={FG} strokeWidth={0.8} opacity={0.5} />)}
    <Wire d="M122 121 C118 150 100 176 74 190" w={4} />
    {turns.map((d, i) => <Draw key={i} d={d} times={[0.1 + 0.06 * i, 0.16 + 0.06 * i]} w={4} />)}
    <Hand x={82} y={192} rot={-25} />
    <In a={0.1}><Arrow d="M262 80 A12 30 0 1 1 262 138" /></In>
    <Label x={60} y={82} text={t("drill bit or bolt")} to={[90, 99]} />
    <Label x={140} y={168} text={t("wire")} to={[114, 152]} />
  </>,
};

// ------------------------------------------------------------------ boom

const boomStrip: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => <>
    <rect x={10} y={168} width={300} height={22} fill="var(--bolt)" stroke={FG} strokeWidth={1.2} />
    <Move values={[[0, -80], [0, -80], [0, 0], [0, 0]]} times={[0, 0.02, 0.16, 1]}>
      <rect x={40} y={171} width={240} height={16} fill="var(--panel)" stroke={FG} strokeWidth={0.8} />
      {Array.from({ length: 25 }, (_, i) => <line key={i} x1={40 + 10 * i} y1={171} x2={40 + 10 * i} y2={i % 5 ? 175 : 178} stroke={FG} strokeWidth={0.6} />)}
      <rect x={32} y={166} width={16} height={26} fill="var(--plastic)" stroke="var(--plastic-edge)" strokeWidth={1} opacity={0.85} />
      <rect x={272} y={166} width={16} height={26} fill="var(--plastic)" stroke="var(--plastic-edge)" strokeWidth={1} opacity={0.85} />
    </Move>
    <In a={0.18}><Mark x={90} y={179} /><Mark x={160} y={179} /><Mark x={230} y={179} /></In>
    <In a={0.42}><circle cx={160} cy={179} r={4} fill="var(--panel2)" stroke={FG} strokeWidth={1.2} /></In>
    <Move values={[[0, -60], [0, -60], [0, 0], [0, 0], [85, -30], [85, -30]]} times={[0, 0.22, 0.36, 0.46, 0.56, 1]}>
      <Drill x={160} y={179} rot={90} />
      <Label x={186} y={70} text={t("drill")} />
    </Move>
    <Fade values={[0, 0, 1, 1]} times={[0, 0.58, 0.6, 1]}>
      <Move values={[[0, -60], [0, -60], [0, 0], [0, 0]]} times={[0, 0.6, 0.8, 1]}>
        <Wire d="M160 60 L160 236" w={5} />
      </Move>
      <Arrow d="M144 40 L144 100" />
    </Fade>
    <Fade values={[0, 0, 1, 1, 0, 0]} times={[0, 0.22, 0.26, 0.46, 0.5, 1]}><Arrow d="M200 80 L200 140" /></Fade>
    <In a={0.8}><Label x={172} y={232} text={t("element")} to={[163, 226]} /></In>
    <Label x={20} y={218} text={t("drilling strip")} to={[60, 187]} />
    <Label x={305} y={218} text={t("boom")} anchor="end" to={[296, 190]} />
  </>,
};

// ------------------------------------------------------------------ bend

const bendAssemble: Scene = {
  dur: 4,
  still: 3.5,
  view: "0 0 320 250",
  draw: (t) => <>
    <rect x={30} y={22} width={260} height={150} rx={2} fill="var(--panel2)" stroke={FG} strokeWidth={1} />
    <path d="M60 120 L170 120 L216 40" fill="none" stroke={FG} strokeWidth={1.5} strokeDasharray="6 3" />
    <Wire d="M60 120 L170 120" />
    <Rot about={[170, 120]} values={[0, 0, -60, -60]} times={[0, 0.25, 0.7, 1]}>
      <Wire d="M170 120 L262 120" />
    </Rot>
    <Mark x={170} y={120} />
    <Move values={[[0, 60], [0, 60], [0, 0], [0, 0]]} times={[0, 0.05, 0.2, 1]}>
      <Pliers x={164} y={152} rot={-90} />
      <Label x={186} y={232} text={t("pliers")} to={[175, 222]} />
    </Move>
    <In a={0.25}><Arrow d="M269 106 A100 100 0 0 0 232 41" /></In>
    <Label x={40} y={162} text={t("template")} />
    <Label x={70} y={108} text={t("wire")} />
    <Label x={194} y={140} text={t("mark")} to={[174, 128]} />
  </>,
};

// ------------------------------------------------------------------ feed

const feedLine: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => <>
    <FeedBlock x={160} y={90} />
    <Move values={[[0, 80], [0, 80], [0, 0], [0, 0]]} times={[0, 0.05, 0.3, 1]}>
      <rect x={153} y={176} width={14} height={20} fill="var(--plastic)" stroke={FG} strokeWidth={1} />
      <path d="M160 176 C160 140 140 130 140 96" fill="none" stroke="var(--copper)" strokeWidth={3} strokeLinecap="round" />
      <path d="M168 198 C188 170 180 130 180 96" fill="none" stroke={FG} strokeWidth={7} strokeLinecap="round" />
      <path d="M168 198 C188 170 180 130 180 96" fill="none" stroke="var(--solder)" strokeWidth={5} strokeLinecap="round" strokeDasharray="2 1.5" />
      <Coax x={160} y={196} rot={-90} />
    </Move>
    <Terminals x={160} y={90} />
    <In a={0.5}><Blob x={140} y={90} /></In>
    <In a={0.68}><Blob x={180} y={90} /></In>
    <Move values={[[60, 50], [60, 50], [-40, 0], [-40, 0], [0, 0], [0, 0]]} times={[0, 0.3, 0.45, 0.55, 0.65, 1]}>
      <Iron x={180} y={90} rot={-150} />
      <Label x={290} y={130} text={t("iron")} anchor="end" />
    </Move>
    <In a={0.05}><Arrow d="M128 226 L128 186" /></In>
    <Label x={160} y={64} text={t("feed point")} anchor="middle" />
    <Label x={60} y={230} text={t("coax")} to={[152, 226]} />
    <Label x={8} y={150} text={t("centre")} to={[146, 132]} />
    <Label x={218} y={206} text={t("braid")} to={[180, 180]} />
  </>,
};

const feedMatch: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => <>
    <FeedBlock x={160} y={70} />
    <Draw d="M146 122 L140 76" times={[0.3, 0.45]} w={3} />
    <Draw d="M174 122 L180 76" times={[0.3, 0.45]} w={3} />
    <Move values={[[0, 60], [0, 60], [0, 0], [0, 0]]} times={[0, 0.05, 0.28, 1]}>
      <Coax x={160} y={162} rot={-90} />
    </Move>
    <rect x={122} y={120} width={76} height={42} rx={4} fill="var(--panel2)" stroke={FG} strokeWidth={1.5} />
    <Label x={160} y={145} text={t("balun")} anchor="middle" />
    <Terminals x={160} y={70} />
    <In a={0.6}><Blob x={140} y={70} /></In>
    <In a={0.76}><Blob x={180} y={70} /></In>
    <Move values={[[60, 50], [60, 50], [-40, 0], [-40, 0], [0, 0], [0, 0]]} times={[0, 0.45, 0.55, 0.65, 0.74, 1]}>
      <Iron x={180} y={70} rot={-150} />
    </Move>
    <In a={0.05}><Arrow d="M128 226 L128 186" /></In>
    <Label x={160} y={44} text={t("feed point")} anchor="middle" />
    <Label x={60} y={230} text={t("coax")} to={[152, 226]} />
  </>,
};

// ------------------------------------------------------------------ position

const position: Scene = {
  dur: 4.5,
  still: 3.9,
  draw: (t) => <>
    <line x1={0} y1={215} x2={320} y2={215} stroke="var(--muted)" strokeWidth={2} />
    <Fade values={[1, 1, 0.25, 0.25]} times={[0, 0.45, 0.65, 1]}>
      {[28, 56, 84, 112].map((x) => <rect key={x} x={x - 3} y={105} width={6} height={110} fill="var(--bolt)" stroke={FG} strokeWidth={1} />)}
      {[125, 190].map((y) => <rect key={y} x={20} y={y - 3} width={100} height={6} fill="var(--bolt)" stroke={FG} strokeWidth={1} />)}
    </Fade>
    <Label x={70} y={96} text={t("metal")} anchor="middle" />
    <Move values={[[0, 0], [0, 0], [110, 0], [110, 0]]} times={[0, 0.15, 0.5, 1]}>
      <rect x={146} y={100} width={6} height={115} fill="var(--bolt)" stroke={FG} strokeWidth={1} />
      <Plastic x={138} y={92} w={22} h={12} rx={3} />
      <Wire d="M149 92 L149 30" w={4} />
      <Label x={140} y={50} text={t("antenna")} anchor="end" />
    </Move>
    <In a={0.15}><Arrow d="M160 230 L240 230" /></In>
    <In a={0.6}><Check x={290} y={60} /></In>
  </>,
};

// ------------------------------------------------------------------ measure

const measure: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => <>
    <Plastic x={258} y={196} w={24} h={14} rx={3} />
    <Wire d="M270 196 L270 50" w={4} />
    <Draw d="M151 50 C151 18 205 18 205 110 C205 196 225 206 258 204" times={[0.04, 0.24]} w={10} stroke={FG} />
    <Draw d="M151 50 C151 18 205 18 205 110 C205 196 225 206 258 204" times={[0.04, 0.24]} w={8} stroke="var(--coax)" />
    <Analyser x={20} y={60} w={150} h={150}>
      <SwrCurve x0={40} x1={158} top={84} bottom={138} at={106} draw={[0.3, 0.65]} />
      <In a={0.68}>
        <line x1={106} y1={138} x2={106} y2={152} stroke="var(--mark)" strokeWidth={2} />
        <circle cx={106} cy={138} r={4} fill="var(--mark)" />
      </In>
    </Analyser>
    <In a={0.68}><Arrow d="M106 90 L106 126" /></In>
    <Label x={42} y={86} text={t("SWR")} />
    <In a={0.68}><Label x={118} y={232} text={t("best match")} anchor="middle" to={[106, 153]} /></In>
    <Label x={24} y={46} text={t("analyser")} />
  </>,
};

// ------------------------------------------------------------------ trim

const trim: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => <>
    <line x1={158} y1={20} x2={158} y2={220} stroke="var(--muted)" strokeWidth={1} strokeDasharray="4 4" />
    <Wire d="M15 130 L118 130" />
    <Move values={[[0, 0], [0, 0], [-4, 50], [-4, 50]]} times={[0, 0.55, 0.66, 1]}><Wire d="M119 130 L127 130" /></Move>
    <Move values={[[0, 0], [0, 0], [4, 56], [4, 56]]} times={[0, 0.17, 0.28, 1]}><Wire d="M128 130 L136 130" /></Move>
    <Move values={[[0, -30], [0, -30], [0, 0], [0, 0], [-9, -30], [-9, 0], [-9, 0]]} times={[0, 0.06, 0.15, 0.3, 0.4, 0.5, 1]}>
      <Cutters x={128} y={112} rot={90} />
    </Move>
    <Label x={70} y={80} text={t("trim")} anchor="middle" to={[112, 100]} />
    <Screen x={170} y={60} w={140} h={110}>
      <Move values={[[0, 0], [0, 0], [16, 0], [16, 0], [32, 0], [32, 0]]} times={[0, 0.24, 0.36, 0.62, 0.74, 1]}>
        <SwrCurve x0={100} x1={360} top={74} bottom={150} at={212} />
      </Move>
    </Screen>
    <In a={0.24}><Arrow d="M216 190 L276 190" /></In>
    <Label x={182} y={78} text={t("SWR")} />
  </>,
};

// ------------------------------------------------------------------ enclosure

const enclosure: Scene = {
  dur: 4.5,
  still: 3.9,
  draw: (t) => <>
    <Move values={[[0, -120], [0, -120], [0, 0], [0, 0]]} times={[0, 0.06, 0.4, 1]}>
      <rect x={40} y={180} width={120} height={8} fill="var(--fr4)" stroke={FG} strokeWidth={1} />
      <rect x={52} y={176} width={60} height={4} fill="var(--copper)" />
      <rect x={124} y={174} width={18} height={6} fill="var(--copper)" />
      <Label x={100} y={166} text={t("board")} anchor="middle" />
    </Move>
    <Plastic d="M20 110 L20 200 Q20 210 30 210 L170 210 Q180 210 180 200 L180 110 L170 110 L170 196 Q170 200 166 200 L34 200 Q30 200 30 196 L30 110 Z" />
    <Plastic x={36} y={188} w={10} h={12} rx={1} />
    <Plastic x={154} y={188} w={10} h={12} rx={1} />
    <In a={0.06}><Arrow d="M190 50 L190 120" /></In>
    <Label x={100} y={230} text={t("case")} anchor="middle" />
    <Screen x={204} y={70} w={108} h={90}>
      <Move values={[[0, 0], [0, 0], [-28, 0], [-28, 0]]} times={[0, 0.5, 0.68, 1]}>
        <SwrCurve x0={150} x1={360} top={82} bottom={146} at={272} />
      </Move>
    </Screen>
    <In a={0.5}><Arrow d="M290 185 L236 185" /></In>
    <Label x={216} y={88} text={t("SWR")} />
  </>,
};

// ------------------------------------------------------------------ .s1p

const loadS1p: Scene = {
  dur: 5,
  still: 4.4,
  draw: (t) => <>
    <rect x={98} y={20} width={214} height={210} rx={6} fill="var(--panel)" stroke={FG} strokeWidth={1.5} />
    <path d="M98 40 L312 40" stroke={FG} strokeWidth={1} />
    {[110, 122, 134].map((x) => <circle key={x} cx={x} cy={30} r={3.5} fill="var(--panel2)" stroke={FG} strokeWidth={0.8} />)}
    <rect x={186} y={44} width={44} height={18} rx={3} fill="var(--panel2)" stroke={FG} strokeWidth={0.8} />
    <rect x={234} y={44} width={44} height={18} rx={3} fill="var(--panel2)" stroke={FG} strokeWidth={0.8} />
    <rect x={104} y={44} width={78} height={22} rx={3} fill="var(--panel)" stroke="var(--accent)" strokeWidth={2} />
    <Label x={143} y={58} text={t("Simulation")} anchor="middle" />
    <Screen x={156} y={78} w={148} h={112}>
      <SwrCurve x0={160} x1={304} top={92} bottom={170} at={238} stroke="var(--series-1)" draw={[0.45, 0.72]} />
      <SwrCurve x0={160} x1={304} top={96} bottom={164} at={226} stroke="var(--series-2)" draw={[0.5, 0.77]} />
    </Screen>
    <In a={0.78}>
      <Label x={180} y={212} text={t("measured")} anchor="middle" to={[197, 132]} />
      <Label x={282} y={212} text={t("model")} anchor="middle" to={[267, 133]} />
    </In>
    <In a={0.08}><Arrow d="M40 168 Q70 200 110 170" /></In>
    <Move values={[[0, 0], [0, 0], [82, 6], [82, 6]]} times={[0, 0.1, 0.38, 1]}>
      <path d="M24 90 L52 90 L66 104 L66 146 L24 146 Z M52 90 L52 104 L66 104" fill="var(--panel)" stroke={FG} strokeWidth={1.5} strokeLinejoin="round" />
      <Label x={45} y={130} text={t(".s1p")} anchor="middle" />
    </Move>
  </>,
};

// ------------------------------------------------------------------ seal

const bands = Array.from({ length: 9 }, (_, i) => `M${100 + 13 * i} 148 L${114 + 13 * i} 74`);

const seal: Scene = {
  dur: 4.5,
  still: 3.9,
  draw: (t) => <>
    <FeedBlock x={160} y={110} wires={[10, 310]} />
    <Coax x={160} y={150} rot={-90} />
    <Terminals x={160} y={110} r={8} />
    {bands.map((d, i) => {
      const a: [number, number] = [0.1 + i * 0.06, 0.16 + i * 0.06];
      return <g key={i}><Draw d={d} times={a} w={17} stroke={FG} /><Draw d={d} times={a} w={14} stroke="var(--coax)" /></g>;
    })}
    <In a={0.1}><Arrow d="M232 74 A12 38 0 1 1 232 150" /></In>
    <Label x={160} y={56} text={t("feed point")} anchor="middle" to={[160, 72]} />
    <Label x={262} y={186} text={t("tape")} to={[214, 140]} />
  </>,
};

export const WIRE_SCENES = {
  "cut-wire": cutWire,
  "wind-coil": windCoil,
  "boom-strip": boomStrip,
  "bend-assemble": bendAssemble,
  "feed-line": feedLine,
  "feed-match": feedMatch,
  position,
  measure,
  trim,
  enclosure,
  "load-s1p": loadS1p,
  seal,
} satisfies Record<string, Scene>;
