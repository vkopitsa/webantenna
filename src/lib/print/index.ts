import type { ManifoldToplevel } from "manifold-3d";
import { cleanup } from "manifold-3d/lib/garbage-collector.js";
import type { AntennaDef, Design, Params } from "../types";
import { ANTENNA_BY_ID } from "../antennas";
import type { BuiltPart, PartSpec } from "./parts";
import { buildPart, PART_STRINGS } from "./parts";
import { CENTRE_HOWTO, CENTRE_STRINGS, FAN_HOWTO, FAN_STRINGS, dipoleParts, fanParts } from "./families/centre";
import { DISCONE_HOWTO, DISCONE_STRINGS, disconeParts, HUB_HOWTO, HUB_STRINGS, groundPlaneParts } from "./families/hub";
import { BOOM_HOWTO, BOOM_STRINGS, yagiParts } from "./families/boom";
import { FORMER_HOWTO, FORMER_STRINGS, helixParts } from "./families/former";
import { SPREADER_HOWTO, SPREADER_STRINGS, moxonParts, quadParts } from "./families/spreader";
import { STANDOFF_HOWTO, STANDOFF_STRINGS, biquadParts } from "./families/standoff";
import { SPACER_HOWTO, SPACER_STRINGS, collinearParts, jpoleParts } from "./families/spacer";
import { SKYCONE_HOWTO, SKYCONE_STRINGS, SKYCONE_TPL, skyconeParts } from "./families/skycone";
import { BEND_HOWTO, BEND_STRINGS, bendParts, coilParts } from "./families/bend";
import { CUTBEND_HOWTO, CUTBEND_STRINGS, cutBendParts } from "./families/cutbend";
import { printedShell, SHELL_HOWTO, SHELL_STRINGS, shellFor } from "./shells";
import { en } from "../build";

export { buildPart, USE_LABELS, type BuiltPart, type PartSpec, type Segment } from "./parts";

const FAMILIES: Record<string, (p: Params, d: Design, def: AntennaDef) => PartSpec[]> = {
  dipole: (p, d, def) => [...dipoleParts(d), ...cutBendParts(def, p, d)],
  fandipole: (p, d, def) => [...fanParts(d), ...cutBendParts(def, p, d)],
  groundplane: (p, d, def) => [...groundPlaneParts(d), ...cutBendParts(def, p, d)],
  yagi: (p, d, def) => [...yagiParts(p, d), ...bendParts(d), ...cutBendParts(def, p, d)],
  helix: (p, d, def) => [...helixParts(d), ...cutBendParts(def, p, d)],
  discone: (p, d, def) => [...disconeParts(p, d), ...cutBendParts(def, p, d)],
  moxon: (p, d, def) => [...moxonParts(p, d), ...bendParts(d), ...cutBendParts(def, p, d)],
  quad: (p, d, def) => [...quadParts(p, d), ...bendParts(d), ...cutBendParts(def, p, d)],
  biquad: (p, d, def) => [...biquadParts(d), ...bendParts(d), ...cutBendParts(def, p, d)],
  cloverleaf: (p, d, def) => [...bendParts(d), ...cutBendParts(def, p, d)],
  spring: (p, d, def) => [...coilParts(d), ...cutBendParts(def, p, d)],
  jpole: (p, d, def) => [...jpoleParts(d), ...cutBendParts(def, p, d)],
  collinear: (p, d, def) => [...collinearParts(p, d), ...cutBendParts(def, p, d)],
  pagoda: (p, d, def) => cutBendParts(def, p, d),   // printed: no wire, so [] (the shell comes from shellFor)
  skycone7: (p, d, def) => [...skyconeParts(d, 0.3, d.coax?.choke !== "none"), ...cutBendParts(def, p, d)],
  skyconecage: (p, d, def) => [...skyconeParts(d, 0, d.coax?.choke !== "none"), ...cutBendParts(def, p, d)],
  skyconecagemini: (p, d, def) => [...skyconeParts(d, 0, d.coax?.choke !== "none"), ...cutBendParts(def, p, d)],
  skyconecagetilt: (p, d, def) => [...skyconeParts(d, 0, d.coax?.choke !== "none"), ...cutBendParts(def, p, d)],
  skyconecage40: (p, d, def) => [...skyconeParts(d, 0, d.coax?.choke !== "none"), ...cutBendParts(def, p, d)],
  skycone40: (p, d, def) => [...skyconeParts(d, 0.3, d.coax?.choke !== "none"), ...cutBendParts(def, p, d)],
  skyconecage44: (p, d, def) => [...skyconeParts(d, 0, d.coax?.choke !== "none"), ...cutBendParts(def, p, d)],
  skyconecage55: (p, d, def) => [...skyconeParts(d, 0, d.coax?.choke !== "none"), ...cutBendParts(def, p, d)],
  skycone8: (p, d, def) => [...skyconeParts(d), ...cutBendParts(def, p, d)],
  skycone21: (p, d, def) => [...skyconeParts(d), ...cutBendParts(def, p, d)],
};

/** Printable parts for an antenna design (the family's parts plus its shell); empty when the type has none (yet).
 *  Cheap: nothing is built here. */
export const partsFor = (defId: string, p: Params, d: Design): PartSpec[] => {
  const def = ANTENNA_BY_ID[defId];
  const family = (def && FAMILIES[defId]?.(p, d, def)) ?? [];
  // printed antennas get the PCB enclosure: every one has a board model except the PCB loop (drawn as plates only);
  // a stacked build (pagoda) is round and gets a radome like the cloverleaf
  if (family.some((s) => s.id === "shell")) return family;          // the family brings its own (simulated) cover
  const shell = shellFor(defId, p, d, printedShell(defId, d));
  return shell ? [...family, shell] : family;
};

/** Build and check every part of a design, then free all WASM geometry (the results are plain arrays). */
export function buildParts(M: ManifoldToplevel, defId: string, p: Params, d: Design): BuiltPart[] {
  try { return partsFor(defId, p, d).map((s) => buildPart(M, s, `${defId}-${s.id}`)); } finally { cleanup(); }
}

/** Every English string the print parts can show, for the i18n coverage test. */
export const PRINT_STRINGS = [
  ...PART_STRINGS, ...CENTRE_STRINGS, ...HUB_STRINGS, ...BOOM_STRINGS, ...FORMER_STRINGS, ...DISCONE_STRINGS, ...SPREADER_STRINGS, ...STANDOFF_STRINGS, ...SPACER_STRINGS, ...FAN_STRINGS,
  ...Object.values(CENTRE_HOWTO).flat(), ...HUB_HOWTO, ...Object.values(BOOM_HOWTO).flat(), ...FORMER_HOWTO, ...DISCONE_HOWTO, ...Object.values(SPREADER_HOWTO).flat(), ...STANDOFF_HOWTO, ...Object.values(SPACER_HOWTO).flat(), ...Object.values(FAN_HOWTO).flat(),
  ...SHELL_STRINGS, ...Object.values(SHELL_HOWTO).flat(),
  ...BEND_STRINGS, ...Object.values(BEND_HOWTO).flat(),
  ...CUTBEND_STRINGS, ...Object.values(CUTBEND_HOWTO).flat(),
  ...SKYCONE_STRINGS, ...Object.values(SKYCONE_TPL), ...Object.values(SKYCONE_HOWTO).flat(),
];

/** README.txt for the parts zip: every part with its quantity, purpose and how-to steps, in English with lengths in mm. */
export function partsReadme(title: string, specs: PartSpec[]): string {
  const out = [`3D-printed parts: ${title}`, "", "STL files are in millimetres. Use PETG or ASA for parts that stay outdoors; PLA is fine for jigs.", ""];
  for (const s of specs) {
    out.push(`${s.title} (${s.qty} pc)`, en(s.purpose), ...(s.warn ? [`Warning: ${en(s.warn)}`] : []), "How to use:", ...s.howTo.map((h, i) => `  ${i + 1}. ${en(h)}`), "");
  }
  return out.join("\n");
}
