"""Max |dR|, |dX| (ohm) and |dg| (dB) of two app tables over the common grid; exit 0 when within the tolerances.
  python compare_tables.py a.json b.json [--tol-z 0.5] [--tol-g 0.1]
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
    if "g" in A and "g" in B:
        worst["g"] = float(np.max(np.abs(np.array(A["g"], float)[ia] - np.array(B["g"], float)[ib])))
    print(f"{len(idx)} common frequencies (of {len(A['f'])} / {len(B['f'])})  max |dR| {worst['r']:.3f} ohm  "
          f"max |dX| {worst['x']:.3f} ohm" + (f"  max |dg| {worst['g']:.3f} dB" if "g" in worst else ""))
    ok = worst["r"] <= a.tol_z and worst["x"] <= a.tol_z and worst.get("g", 0) <= a.tol_g
    print("OK" if ok else "FAIL")
    sys.exit(0 if ok else 1)


main()
