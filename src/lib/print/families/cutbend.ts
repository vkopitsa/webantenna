import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { en, type CutRow, type Msg } from "../../build";
import type { Recipe } from "../../recipe";
import { msg, type PartSpec } from "../parts";
import { CLEAR, MAX_SIZE, WALL, mm } from "../rules";
import { box, digits } from "../shapes";
import { D_MAX } from "./bend";

// Cut board (wire cut and bend aids): a printed board with one blind hole per wire cut length. Push the wire to the
// bottom of its hole and cut it flush at the board edge; slits across the hole mark where each bend goes.

export const CUTBEND_STRINGS = [
  "Cut board",
  "Cut board: push the wire to the bottom of a hole and cut flush; {0} holes",
  "Hole {0}: {1}, cut {2} × {3}",
];

/** How-to steps per part, in order (lever and plate: the benders). */
export const CUTBEND_HOWTO: { board: string[]; lever: string[]; plate: string[] } = {
  board: [
    "Print it flat, with the numbers up.",
    "Straighten the wire, push it into the hole with the number from the how-to list until it stops at the bottom, and cut it flush with the board edge.",
    "Mark the wire with a pen through each slit across the hole: those are the bends.",
  ],
  lever: [],
  plate: [],
};

export interface Hole { n: number; cut: number; dia: number; qty: number; what: Msg; marks: number[] }   // m; marks = recipe bend `at`s

const MAX_CUT = 0.170;   // m: longest wire a board takes
const SAME = 0.5e-3;     // m: lengths this close share one hole
const NUM_H = 5;         // mm: engraved number height
const NUM_DEPTH = 0.6;
const MIN_PITCH = 9;     // mm between holes: room for the number
const SLIT = 1;          // mm wide

const tags = (t: string) => t.split(/[,–]/).map((x) => x.trim()).filter(Boolean);

/** Holes for the wires of the cut list that fit a board: ≤ 170 mm and ≤ D_MAX thick, equal lengths and diameters (±0.5 mm)
 *  share one hole; numbered from 1, longest first; marks = the bends of the matching recipe. */
export function boardHoles(rows: CutRow[], recipes: Recipe[]): Hole[] {
  const out: Hole[] = [];
  for (const r of rows) {
    if (r.cut > MAX_CUT + 1e-9 || mm(r.dia) > D_MAX + 1e-9) continue;
    const e = out.find((h) => Math.abs(h.cut - r.cut) <= SAME && Math.abs(h.dia - r.dia) <= SAME);
    if (e) { e.qty += r.qty; continue; }
    const ts = tags(r.tag), rc = recipes.find((q) => Math.abs(q.cut - r.cut) <= SAME && tags(q.tag).some((x) => ts.includes(x)));
    out.push({ n: 0, cut: r.cut, dia: r.dia, qty: r.qty, what: r.what, marks: rc ? rc.bends.map((b) => b.at) : [] });
  }
  out.sort((a, b) => b.cut - a.cut);
  return out.map((h, i) => ({ ...h, n: i + 1 }));
}

const holeD = (h: Hole) => Math.max(2, mm(h.dia) + CLEAR);
const pitch = (h: Hole) => Math.max(holeD(h) + 2 * WALL, MIN_PITCH);

/** One board: holes side by side along y, open at x = 0, blind at x = cut, axis at mid-thickness. */
function board(M: ManifoldToplevel, hs: Hole[]): Manifold {
  const T = Math.max(5, ...hs.map((h) => holeD(h) + 2 * WALL)), L = Math.max(...hs.map((h) => mm(h.cut))) + WALL, zc = T / 2;
  const W = hs.reduce((s, h) => s + pitch(h), 0), cuts: Manifold[] = [];
  let y0 = 0;
  for (const h of hs) {
    const d = holeD(h), r = d / 2, c = mm(h.cut), y = y0 + pitch(h) / 2;
    y0 += pitch(h);
    // round hole with a 45° roof (a square on its corner) so it prints without supports
    const bore = M.Manifold.cylinder(c + 1, r, r, 32).rotate([0, 90, 0]).translate([-1, y, zc]);
    const roof = M.Manifold.cube([c + 1, 2 * r, 2 * r], false).translate([-1, -r, -r]).rotate([45, 0, 0]).translate([0, y, zc]);
    cuts.push(bore, roof.intersect(box(M, [-1, y - r, zc], [c, y + r, zc + r * Math.SQRT2 + 1])));
    for (const a of h.marks) {
      const x = mm(a);
      if (x > 0 && x < c) cuts.push(box(M, [x - SLIT / 2, y - r, zc], [x + SLIT / 2, y + r, T + 1]));
    }
    cuts.push(digits(M, String(h.n), 1, y - NUM_H / 2, NUM_H, NUM_DEPTH, T));
  }
  return M.Manifold.cube([L, W, T], false).subtract(M.Manifold.union(cuts));
}

/** Cut boards: the holes in order, a new board whenever the next one would not fit MAX_SIZE across. */
export function cutBoards(holes: Hole[]): PartSpec[] {
  const groups: Hole[][] = [];
  let w = 0;
  for (const h of holes) {
    if (!groups.length || w + pitch(h) > MAX_SIZE) { groups.push([]); w = 0; }
    groups[groups.length - 1].push(h);
    w += pitch(h);
  }
  return groups.map((hs, i) => ({
    id: groups.length > 1 ? `cut-board-${i + 1}` : "cut-board", title: CUTBEND_STRINGS[0], use: "jig" as const, qty: 1,
    purpose: msg(CUTBEND_STRINGS[1], hs.length),
    howTo: [...CUTBEND_HOWTO.board.map((s) => msg(s)), ...hs.map((h) => msg(CUTBEND_STRINGS[2], h.n, en(h.what), { len: h.cut }, h.qty))],
    build: (M: ManifoldToplevel) => [board(M, hs)],
  }));
}
