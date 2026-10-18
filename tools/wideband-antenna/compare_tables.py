"""Max |dR|, |dX| (ohm) and |dg| (dB) of two app tables over the common grid; exit 0 when within the tolerances.
  python compare_tables.py a.json b.json [--tol-z 0.5] [--tol-g 0.1] [--rel-z 0.02] [--g-floor 10]
--rel-z: Z by |Za - Zb| / |Za| instead of ohms (the convergence rule: 2 %); --g-floor: gain only at elevations within
that many dB of the frequency's peak (deep nulls move most with the mesh and matter least).
A file is app_*.json / bare_*.json, or `skycone.data.ts:SKYCONE_W16` (an entry of the app's table; `bare` files and the
`bare` block of an entry are compared when both are bare: pass `--bare` with an entry to read its bare block)."""
import sys, re, json, argparse
import numpy as np


def load(spec, bare=False):
    if ".ts:" in spec:
        path, name = spec.split(":", 1)
        m = re.search(r"export const " + re.escape(name) + r"\b[^=]*=\s*(\{.*\});?\s*$", open(path).read(), re.M)
        if not m:
            sys.exit(f"{name} not found in {path}")
        d = json.loads(m.group(1))
    else:
        d = json.load(open(spec))
    if bare:
        d = d["bare"]
    return d


def common(a, b):
    """indices of b's frequencies (ratio to f_lo) that a also has"""
    fa = {round(v, 4): i for i, v in enumerate(a["f"])}
    return [(fa[round(v, 4)], j) for j, v in enumerate(b["f"]) if round(v, 4) in fa]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("a")
    ap.add_argument("b")
    ap.add_argument("--tol-z", type=float, default=0.5)
    ap.add_argument("--tol-g", type=float, default=0.1)
    ap.add_argument("--rel-z", type=float, default=None, help="relative |dZ| / |Z| instead of --tol-z")
    ap.add_argument("--g-floor", type=float, default=None, help="dB below the peak: gain compared above it only")
    ap.add_argument("--bare", action="store_true", help="compare the `bare` block of a .ts entry (files are bare already)")
    a = ap.parse_args()
    A = load(a.a, a.bare and ".ts:" in a.a)
    B = load(a.b, a.bare and ".ts:" in a.b)
    idx = common(A, B)
    if not idx:
        sys.exit("no common frequencies")
    ia, ib = zip(*idx)
    ia, ib = list(ia), list(ib)
    rows = ("r", "x")
    worst = {}
    for k in rows:
        va, vb = np.array(A[k], float), np.array(B[k], float)
        worst[k] = float(np.max(np.abs(va[..., ia] - vb[..., ib])))
    za = np.array(A["r"], float)[..., ia] + 1j * np.array(A["x"], float)[..., ia]
    zb = np.array(B["r"], float)[..., ib] + 1j * np.array(B["x"], float)[..., ib]
    worst["rel"] = float(np.max(np.abs(za - zb) / np.abs(za)))
    if "g" in A and "g" in B:
        ga, gb = np.array(A["g"], float)[ia], np.array(B["g"], float)[ib]
        dg = np.abs(ga - gb)
        if a.g_floor is not None:
            dg = np.where(ga >= ga.max(axis=-1, keepdims=True) - a.g_floor, dg, 0.0)
        worst["g"] = float(np.max(dg))
    print(f"{len(idx)} common frequencies (of {len(A['f'])} / {len(B['f'])})  max |dR| {worst['r']:.3f} ohm  "
          f"max |dX| {worst['x']:.3f} ohm  max |dZ|/|Z| {100 * worst['rel']:.2f} %"
          + (f"  max |dg| {worst['g']:.3f} dB" + ("" if a.g_floor is None else f" (within {a.g_floor:g} dB of the peak)")
             if "g" in worst else ""))
    zok = worst["rel"] <= a.rel_z if a.rel_z is not None else worst["r"] <= a.tol_z and worst["x"] <= a.tol_z
    ok = zok and worst.get("g", 0) <= a.tol_g
    print("OK" if ok else "FAIL")
    sys.exit(0 if ok else 1)


main()
