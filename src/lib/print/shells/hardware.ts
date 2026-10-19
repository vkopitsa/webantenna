import type { Design, Params } from "../../types";
import { dipoleHardwareBox } from "../families/centre";
import { yagiHardwareBox } from "../families/boom";
import { disconeHardwareBox, gpHardwareBox } from "../families/hub";
import { moxonHardwareBox, quadHardwareBox } from "../families/spreader";
import { collinearHardwareBox, jpoleHardwareBox } from "../families/spacer";
import type { Ext } from "../families/extent";
import { feedPoint, type Box3 } from "./geometry";

/** The printed hardware that stands in or next to the antenna (centre insulator, hub plate, element blocks and clips,
 *  spreader hubs and caps, stub and radome spacers), as one extent in mm, world frame; null when the family has none
 *  outside its wire envelope. A case has to enclose it. Pure: no geometry engine. */
export function hardwareBox(defId: string, p: Params, d: Design): Box3 | null {
  const e: Ext | null =
    defId === "dipole" ? dipoleHardwareBox(d, false)
    : defId === "fandipole" ? dipoleHardwareBox(d, true)
    : defId === "groundplane" ? gpHardwareBox(d)
    : defId === "yagi" ? yagiHardwareBox(p, d, feedPoint(d))
    : defId === "moxon" ? moxonHardwareBox(p, d)
    : defId === "quad" ? quadHardwareBox(p, d)
    : defId === "discone" ? disconeHardwareBox(p, d)
    : defId === "jpole" ? jpoleHardwareBox(d)
    : defId === "collinear" ? collinearHardwareBox(p, d)
    : null;
  return e;
}
