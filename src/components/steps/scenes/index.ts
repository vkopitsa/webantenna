import type { Scene } from "../kit";
import { WIRE_SCENES } from "./wire";
import { BOARD_SCENES } from "./board";
import { CUTBOARD_SCENES } from "./cutboard";

/** Every build-step scene by id; loaded lazily by StepPic (the registry of step text → id is eager). */
export const SCENES = {
  ...WIRE_SCENES,
  ...BOARD_SCENES,
  ...CUTBOARD_SCENES,
} satisfies Record<string, Scene>;
