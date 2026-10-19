// Build-step text → picture id. Eager and tiny: the scenes themselves load lazily (StepPic, Gallery).
import type * as S from "./scenes/index";
import { STEP_TEXT } from "../../lib/build";

/** Every scene id; extended by adding a scene to SCENES. */
export type SceneId = keyof typeof S.SCENES;

/** English step text (STEP_TEXT / *_HOWTO key) → the scene drawn beside it. */
export const STEP_PICS: Record<string, SceneId> = {
  [STEP_TEXT.wire.cutLong]: "cut-wire",
  [STEP_TEXT.wire.cut]: "cut-wire",
  [STEP_TEXT.wire.wind]: "wind-coil",
  [STEP_TEXT.wire.boom]: "boom-strip",
  [STEP_TEXT.wire.bend]: "bend-assemble",
  [STEP_TEXT.wire.feed]: "feed-line",
  [STEP_TEXT.wire.feedMatch]: "feed-match",
  [STEP_TEXT.pcb.balun]: "feed-match",
  [STEP_TEXT.common.position]: "position",
  [STEP_TEXT.common.measure]: "measure",
  [STEP_TEXT.common.trim]: "trim",
  [STEP_TEXT.common.enclosure]: "enclosure",
  [STEP_TEXT.common.s1p]: "load-s1p",
  [STEP_TEXT.common.seal]: "seal",
  [STEP_TEXT.pcb.make]: "make-board",
  [STEP_TEXT.loop.etch]: "make-board",
  [STEP_TEXT.pcb.connector]: "board-connector",
  [STEP_TEXT.loop.connector]: "board-connector",
  [STEP_TEXT.pcb.stack]: "stack-boards",
  [STEP_TEXT.pcb.stitch]: "stitch-vias",
  [STEP_TEXT.loop.caps]: "loop-caps",
  [STEP_TEXT.loop.trimmer]: "loop-trim",
  [STEP_TEXT.air.cut]: "cut-plates",
  [STEP_TEXT.air.drill]: "drill-plates",
  [STEP_TEXT.air.jack]: "fit-jack",
  [STEP_TEXT.air.mount]: "mount-patch",
  [STEP_TEXT.air.director]: "fit-director",
};

/** Key lists claimed complete: the tests require a picture for every key in them. */
export const DONE_GROUPS: string[][] = [
  Object.values(STEP_TEXT.wire),
  Object.values(STEP_TEXT.common),
  Object.values(STEP_TEXT.pcb),
  Object.values(STEP_TEXT.loop),
  Object.values(STEP_TEXT.air),
];
