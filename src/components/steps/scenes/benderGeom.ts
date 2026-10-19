// Bender drawing geometry shared by bender.tsx and the scenes (no JSX here, so those files export components only).
// Top view: px, die centre at the origin, screen y = −y of the part.
export const K = 1.6;                  // px per mm: base, stop circle, lever outline
/** Die bolt end, roller head, stop bolt head radius; wire width and its axis below the die; roller centre below the die. */
export const DIE_R = 7, ROLL_R = 6, HEAD_R = 8, WIRE_W = 4, WY = 9, ROLL_Y = 20;
/** Stop-hole circle (40 mm). */
export const SR = 40 * K;
/** Engraved lines on the lever bender's base: short ones from BASE_R0, long ones (45° steps) from BASE_RL, all to BASE_R1
 *  (the part: 49 / 46 / 55 mm; drawn a little longer so the 15° steps read). */
export const BASE_R0 = 75, BASE_RL = 70, BASE_R1 = 90;
export const DEG = Math.PI / 180;
export const f = (v: number) => +v.toFixed(2);
/** Screen point at angle a (degrees, counter-clockwise from +x as on the part), radius t, offset o to the right of the ray. */
export const ray = (a: number, t: number, o = 0): [number, number] => {
  const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
  return [f(o * s + t * c), f(o * c - t * s)];
};

// Side cut (from +x): screen right = +y of the part, up = z; SX = the die axis on screen, SZ = the base bottom.
export const SK = 2.2, SX = 150, SZ = 150;
export const sx = (y: number) => f(SX + SK * y), sz = (z: number) => f(SZ - SK * z);
/** M4 sizes in mm: shank Ø, socket head Ø × height, nut across corners × height, hole Ø. */
export const SH = 4, HD = 7, HH = 4, NUT_W = 8.1, NUT_H = 3.2, HOLE = 4.5, RY = -6.6, FLOOR_Z = 10;
/** Bottom of the nut in its pocket (screen y). */
export const NUT_Y = sz(8 - NUT_H - 0.3);
