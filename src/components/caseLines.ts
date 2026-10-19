import type { Vec3 } from "../lib/types";
import type { ShellOutline } from "../lib/print/shells";

/** The case outline for the Preview as 3D polylines in metres: the twelve edges of a box, or a dome's footprint circle,
 *  the circle where its cone starts, four vertical lines and the four cone lines to the apex. */
export function caseLines(o: Extract<ShellOutline, { kind: "box" | "dome" }>, circleSteps = 48): Vec3[][] {
  const m = (v: number) => v / 1000;
  if (o.kind === "box" || !o.round) {
    const [x0, y0, z0] = o.lo.map(m), [x1, y1, z1] = o.hi.map(m);
    const loop = (z: number): Vec3[] => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [x0, y0, z]];
    return [loop(z0), loop(z1), ...([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const).map(([x, y]): Vec3[] => [[x, y, z0], [x, y, z1]])];
  }
  const { r, z0, z1, apex } = o.round, R = m(r);
  const ring = (z: number): Vec3[] => Array.from({ length: circleSteps + 1 }, (_, i) => [R * Math.cos((2 * Math.PI * i) / circleSteps), R * Math.sin((2 * Math.PI * i) / circleSteps), m(z)]);
  const sides = ([[R, 0], [0, R], [-R, 0], [0, -R]] as const).map(([x, y]): Vec3[] => [[x, y, m(z0)], [x, y, m(z1)], [0, 0, m(apex)]]);
  return [ring(z0), ring(z1), ...sides];
}
