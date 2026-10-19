"""Hub radius and NEC segment length for a wire diameter (the wire-diameter study, see run_wires.sh).
  hub_for(d)       = max(3 mm, n d 1.1 / 2 pi)   n frames of Ø d fit round the hub ring with 10 % spare (n = 16)
  seg_for(d, f_hi) = max(1.5 mm, 4 r) above Ø1 mm (1.5 mm up to Ø1, the existing tables), at most lambda / 10 at f_hi   (r = d / 2: segment >= ~4 radii for the thin-wire kernel)
  python wire_variant.py 1.5e-3 7e9   ->   RWIRE=0.00075 HUB_R=0.0042 SEG=0.003   (d in m, f_hi in Hz)"""
import sys


def hub_for(d_m, n=16):
    return round(max(3e-3, n * d_m * 1.1 / (2 * 3.141592653589793)), 4)


def seg_for(d_m, f_hi):
    r = d_m / 2
    # + 1e-9: d comes from a float product (e.g. 1.0 * 1e-3), so Ø1 must not fall to the thick-wire branch by rounding
    base = 1.5e-3 if d_m <= 1.0e-3 + 1e-9 else max(1.5e-3, 4 * r)   # Ø <= 1 mm keeps the 1.5 mm of the existing tables
    return round(min(base, 3e8 / f_hi / 10), 6)


def _bad(L, rads):
    """PyNEC (c_geometry::wire) rejects a new wire whose length is between 1 and 2 radii of a wire already in the
    geometry that it joins (measured: 0.98 - 2.0 r; shorter or longer pieces pass). Only the new wire is checked
    against the earlier ones, so the same pair passes the other way round. A small margin on both sides."""
    # 0.97 / 2.05: 1-2.5 % outside the measured 0.98 / 2.0 edges (scan step 0.02 r); no Ø1 wire falls in the margin
    # (check_d1_wires.py asserts nec_order() is the identity on all six Ø1 designs)
    return any(0.97 * q <= L <= 2.05 * q for q in rads)


def nec_order(wires):
    """The order to hand the wires to NEC: indices into wires, the feed (index 0) first, then every wire NEC would
    reject where it is (see _bad: a frame piece or a ring chord 1-2 radii of a thick wire long, after that wire),
    then the rest, each group in its own order. The long wires that join a short one come after it then, and pass.
    The geometry is the same (NEC's solution does not depend on the order); a list with no such wire (every Ø1 mm
    table) keeps its order. Raises if the reordered list still has one. wires: [(kind, a xyz, b xyz, radius)]."""
    import math
    key = lambda q: tuple(round(v, 7) for v in q)
    at = {}
    for i, (_, a, b, _r) in enumerate(wires):
        for q in (a, b):
            at.setdefault(key(q), []).append(i)

    def bad(order):
        pos = {w: k for k, w in enumerate(order)}
        return [i for i in order if wires[i][0] != "feed" and _bad(math.dist(wires[i][1], wires[i][2]),
                [wires[j][3] for q in wires[i][1:3] for j in at[key(q)] if j != i and pos[j] < pos[i]])]
    order = list(range(len(wires)))
    first = bad(order)
    if not first:
        return order
    s = set(first)
    order = [0] + first + [i for i in order[1:] if i not in s]
    left = bad(order)
    if left:
        raise ValueError(f"nec_order: {len(left)} wires NEC rejects in any order, e.g. {wires[left[0]]}")
    return order

if __name__ == "__main__":
    d, f_hi = float(sys.argv[1]), float(sys.argv[2])
    print(f"RWIRE={d / 2:g} HUB_R={hub_for(d):g} SEG={seg_for(d, f_hi):g}")
