"""Sheet-metal version of a family-10 cage with its shorting wire, in NEC-2: the solid cones as a wire grid.

BoR (bor.py) cannot hold one shorting wire (m = 0 only), so the sheet + wire antenna is modelled as a dense NEC
wire grid: NGRID frames (default 32) with hoops every DR (default 1.8 mm; 32 frames + 1.8 mm is converged, 24 + 2.5 mm is 0.1-0.2 off at the bottom of the band) of radius along every frame, plus the
design's shorting wire. Check the grid against BoR with the wire removed (`sh=0`) before trusting it:
  SIZE=0.040 FLO=1.4e9 python sheetgrid.py designs/W40.json 24 1.33e9 6.6e9 [sh=0] [NGRID=24 DR=3e-3 ...]
(prints Z, SWR and the 15-50 deg gain; `bor=1` adds the BoR solid (no wire) at the same points.)
`--run <script> <args>` runs another family-10 script on the grid: `python sheetgrid.py --run cage_cable.py designs/S40.json`.
`patch()` makes family10.model() / evaluate() build the grid, so export_shaped_table.py, cage_cable.py and
export_bare_table.py work on it unchanged when they import this module first (see export_sheet_table.py)."""
import math
import os
import sys
import json
import numpy as np
import family13  # noqa: F401  (family 12 patches family10.build / wire_list first: capture the patched ones)
import family10 as F

NGRID = int(os.environ.get("NGRID", "32"))
DR = float(os.environ.get("DR", "1.8e-3"))
RGRID = float(os.environ.get("RGRID", "0.4e-3"))      # grid wire radius (equal-area rule: spacing / 2 pi)
_build = F.build


def _dense(path, rmin):
    """(rho, z, phi) path with extra vertices every DR of radius (sloped spans only) and the new hoop points."""
    out, hoops = [path[0]], []
    for a, b in zip(path, path[1:]):
        lo, hi = sorted((a[0], b[0]))
        if hi - lo > 1.2 * DR:
            k = int(math.ceil((hi - lo) / DR))
            for i in range(1, k):
                t = i / k
                q = tuple(a[j] + t * (b[j] - a[j]) for j in range(3))
                out.append(q)
                if q[0] >= rmin:
                    hoops.append(q)
        out.append(b)
    hoops += [pt for pt in out if pt[0] >= rmin]
    return out, hoops


def build(p):
    b = _build(p)
    hoops = list(b["hoops"])
    for key in ("hot", "gnd"):
        new = []
        for pl in b[key]:
            d, h = _dense(pl, 2 * F.HUB_R)
            new.append(d)
            hoops += h
        b[key] = new
    b["hoops"] = hoops
    return b


_wire_list = F.wire_list


def wire_list(b, n=NGRID, r=RGRID):
    """family10.wire_list() with the equal-area radius on the frames: rho / n (the grid spacing / 2 pi), at most r,
    so the frames do not overlap where they crowd towards the hub. The shorting wire keeps family 10's RWIRE (Ø1 mm)."""
    out = []
    for kind, a, c, rad in _wire_list(b, n, r):
        if kind.startswith("shunt"):
            rad = F.RWIRE
        elif kind in ("frame0", "frame"):
            rho = min(math.hypot(a[0], a[1]), math.hypot(c[0], c[1]))
            rad = min(rad, max(0.05e-3, rho / n))
        out.append((kind, a, c, rad))
    return out


def patch():
    """Route family10.model() through the grid (NGRID frames, RGRID wires)."""
    F.build = build
    F.wire_list = wire_list
    m = F.model
    if getattr(m, "_sheet", False):
        return

    def model(p, f, n=None, r=None, **kw):
        return m(p, f, n=NGRID, r=RGRID, **kw)
    model._sheet = True
    F.model = model


def _one(a):
    patch()
    p, f, seg = a
    z, gg = F.model(p, f, seg=seg)
    return z, float(10 * np.log10(np.mean(10 ** (gg / 10))))


if __name__ == "__main__" and sys.argv[1] == "--run":       # another family-10 script on the grid model:
    import runpy                                              # python sheetgrid.py --run cage_cable.py designs/S40.json
    patch()
    sys.argv = sys.argv[2:]
    runpy.run_path(sys.argv[0], run_name="__main__")
elif __name__ == "__main__":
    patch()
    p = json.load(open(sys.argv[1]))
    p = F.full(p.get("p", p))
    args = [a for a in sys.argv[2:] if "=" not in a]
    with_bor = False
    for a in sys.argv[2:]:
        if "=" in a:
            k, v = a.split("=")
            if k == "bor":
                with_bor = v == "1"
            else:
                p[k] = float(v)
    nf = int(args[0]) if args else 24
    f_lo = float(args[1]) if len(args) > 1 else 1.33e9
    f_hi = float(args[2]) if len(args) > 2 else 6.6e9
    fs = np.geomspace(f_lo, f_hi, nf)
    seg = float(os.environ.get("SEG", "2e-3"))
    if with_bor:
        import designs as D, family2 as F2
        q = dict(p)
        q["Sl"] = max(0.0, q.get("Sg", 0.0))
        brows = D.evaluate(F2.geometry(q), fs, per_lambda=20, els=F.ELS)
    from concurrent.futures import ProcessPoolExecutor

    with ProcessPoolExecutor(8) as ex:
        rows = list(ex.map(_one, [(p, f, seg) for f in fs]))
    worst = 0
    for i, (f, (z, g)) in enumerate(zip(fs, rows)):
        s = F.swr(z)
        worst = max(worst, s)
        extra = ""
        if with_bor:
            zb = brows[i]["Z"]
            extra = f"   BoR {zb.real:6.1f}{zb.imag:+6.1f}j SWR {brows[i]['swr']:5.2f}"
        print(f"{f/1e6:7.0f} MHz  Z {z.real:6.1f}{z.imag:+6.1f}j  SWR {s:5.2f}  gain 15-50 {g:+.1f} dBi{extra}", flush=True)
    print(f"worst SWR {worst:.2f}")

