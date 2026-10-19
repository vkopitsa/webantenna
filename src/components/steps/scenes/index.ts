import type { Scene } from "../kit";

/** Every build-step scene by id; loaded lazily by StepPic (the registry of step text → id is eager). */
export const SCENES = {} satisfies Record<string, Scene>;
