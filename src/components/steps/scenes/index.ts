import type { Scene } from "../kit";
import { WIRE_SCENES } from "./wire";

/** Every build-step scene by id; loaded lazily by StepPic (the registry of step text → id is eager). */
export const SCENES = {
  ...WIRE_SCENES,
} satisfies Record<string, Scene>;
