// Build-step text → picture id. Eager and tiny: the scenes themselves load lazily (StepPic, Gallery).
import type * as S from "./scenes/index";

/** Every scene id; extended by adding a scene to SCENES. */
export type SceneId = keyof typeof S.SCENES;

/** English step text (STEP_TEXT / *_HOWTO key) → the scene drawn beside it. */
export const STEP_PICS: Record<string, SceneId> = {};

/** Key lists claimed complete: the tests require a picture for every key in them. */
export const DONE_GROUPS: string[][] = [];
