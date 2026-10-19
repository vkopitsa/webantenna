import type { Scene } from "../kit";
import { WIRE_SCENES } from "./wire";
import { BOARD_SCENES } from "./board";
import { CUTBOARD_SCENES } from "./cutboard";
import { LEVER_SCENES } from "./lever";
import { PLATE_SCENES } from "./plate";

/** Every build-step scene by id; loaded lazily by StepPic (the registry of step text → id is eager). */
export const SCENES = {
  ...WIRE_SCENES,
  ...BOARD_SCENES,
  ...CUTBOARD_SCENES,
  ...LEVER_SCENES,
  ...PLATE_SCENES,
} satisfies Record<string, Scene>;
