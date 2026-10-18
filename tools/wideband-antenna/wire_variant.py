"""Hub radius and NEC segment length for a wire diameter (the wire-diameter study, see run_wires.sh).
  hub_for(d)       = max(3 mm, n d 1.1 / 2 pi)   n frames of Ø d fit round the hub ring with 10 % spare (n = 16)
  seg_for(d, f_hi) = max(1.5 mm, 4 r) above Ø1 mm (1.5 mm up to Ø1, the existing tables), at most lambda / 10 at f_hi   (r = d / 2: segment >= ~4 radii for the thin-wire kernel)
  python wire_variant.py 1.5e-3 7e9   ->   RWIRE=0.00075 HUB_R=0.0042 SEG=0.003   (d in m, f_hi in Hz)"""
import sys


def hub_for(d_m, n=16):
    return round(max(3e-3, n * d_m * 1.1 / (2 * 3.141592653589793)), 4)


def seg_for(d_m, f_hi):
    r = d_m / 2
    base = 1.5e-3 if d_m <= 1.0e-3 + 1e-9 else max(1.5e-3, 4 * r)   # Ø <= 1 mm keeps the 1.5 mm of the existing tables
    return round(min(base, 3e8 / f_hi / 10), 6)


if __name__ == "__main__":
    d, f_hi = float(sys.argv[1]), float(sys.argv[2])
    print(f"RWIRE={d / 2:g} HUB_R={hub_for(d):g} SEG={seg_for(d, f_hi):g}")
