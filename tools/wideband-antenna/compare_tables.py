"""Max |dR|, |dX| (ohm) and |dg| (dB) of two app tables over the common grid; exit 0 when within the tolerances.
  python compare_tables.py a.json b.json [--tol-z 0.5] [--tol-g 0.1] [--rel-z 0.02] [--g-floor 10]
  python compare_tables.py --summary wires/     SWR <= 2 range and gain per design per wire Ø (app_<D>_d<mm>.json),
                                               gain jumps > 1 dB between neighbouring Ø flagged
--rel-z: Z by |Za - Zb| / |Za| instead of ohms (the convergence rule: 2 %); --g-floor: gain only at elevations within
that many dB of the frequency's peak (deep nulls move most with the mesh and matter least).
A file is app_*.json / bare_*.json, or `skycone.data.ts:SKYCONE_W16` (an entry of the app's table; `bare` files and the
`bare` block of an entry are compared when both are bare: pass `--bare` with an entry to read its bare block)."""
import sys, re, json, argparse
import numpy as np

_trapz = getattr(np, "trapezoid", None) or np.trapz      # numpy 2 renamed it


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


def summary(folder, jump=1.0):
    """Per design and Ø: the band, the widest SWR <= 2 range (50 ohm) on the table's grid, the in-band worst SWR,
    the share of the band with SWR <= 2, the mean in-band gain at +30 deg elevation and peak gain; then the largest
    change of the +30 deg and the peak gain between neighbouring diameters at any in-band frequency, plain and
    allowing a one-grid-step shift (a narrow suck-out that moves with the wire Ø gives a pointwise jump of several dB
    while the curves agree; > jump dB with the shift allowed: flagged). Returns the flag count."""
    import glob, os
    rows = {}
    for path in sorted(glob.glob(os.path.join(folder, "app_*_d*.json"))):
        m = re.match(r"app_(.+)_d([0-9.]+)\.json$", os.path.basename(path))
        rows.setdefault(m.group(1), []).append((float(m.group(2)), json.load(open(path))))
    flags = 0
    print("| Design | Ø mm | band GHz | widest SWR <= 2 GHz | band with SWR <= 2 | in-band SWR max | g(+30°) mean dBi | peak g mean dBi | Prad/Pin dB |")
    print("|---|---|---|---|---|---|---|---|---|")
    jumps = []
    for name, tabs in rows.items():
        tabs.sort(key=lambda t: t[0])
        prev = None
        for d, T in tabs:
            f = np.array(T["f"]) * T["fLo"]
            z = np.array(T["r"]) + 1j * np.array(T["x"])
            gam = np.abs((z - 50) / (z + 50))
            swr = (1 + gam) / (1 - gam)
            band = (f >= T["fLo"] * (1 - 1e-6)) & (f <= T["fHi"] * (1 + 1e-6))
            ok = swr <= 2
            best, run = (0, -1), None          # widest contiguous SWR <= 2 run (indices)
            for i, o in enumerate(ok):
                if o and run is None:
                    run = i
                if (not o or i == len(ok) - 1) and run is not None:
                    j = i if o else i - 1
                    if f[j] / f[run] > (f[best[1]] / f[best[0]] if best[1] >= 0 else 0):
                        best = (run, j)
                    run = None
            g = np.array(T["g"])
            e30 = T["els"].index(30.0)
            g30, gpk = g[:, e30], g.max(axis=1)
            el = np.radians(np.array(T["els"], float))         # sphere mean of the (phi-averaged) gain = Prad / Pin:
            wt = np.cos(el) / _trapz(np.cos(el), el)       # 0 dB in a lossless model, NEC's power balance error
            ppin = 10 * np.log10(_trapz(10 ** (g / 10) * wt, el, axis=1)[band].mean())
            rng = f"{f[best[0]] / 1e9:.2f}-{f[best[1]] / 1e9:.2f}" if best[1] >= 0 else "none"
            print(f"| {name} | {d:g} | {T['fLo'] / 1e9:.2f}-{T['fHi'] / 1e9:.2f} | {rng} | {100 * ok[band].mean():.0f} % | {swr[band].max():.2f} | "
                  f"{g30[band].mean():+.2f} | {gpk[band].mean():+.2f} | {ppin:+.2f} |")
            if prev is not None:
                pd, pg30, pgpk, pf = prev
                fa = {round(v, 4): i for i, v in enumerate(pf)}
                ij = [(fa[round(v, 4)], j) for j, v in enumerate(T["f"]) if round(v, 4) in fa and band[j]]
                ia, ib = map(list, zip(*ij))
                def dmax(ga, gb, shift):
                    out = 0.0
                    for i, j in zip(ia, ib):
                        out = max(out, min(abs(ga[i] - gb[j + s]) for s in range(-shift, shift + 1) if 0 <= j + s < len(gb)))
                    return out
                d30, dpk = dmax(pg30, g30, 0), dmax(pgpk, gpk, 0)
                s30, spk = dmax(pg30, g30, 1), dmax(pgpk, gpk, 1)
                bad = max(s30, spk) > jump
                flags += bad
                jumps.append(f"{name} {pd:g} -> {d:g} mm: max |dg(+30°)| {d30:.2f} dB, max |d peak g| {dpk:.2f} dB; "
                             f"one-step shift allowed {s30:.2f} / {spk:.2f} dB" + ("  RED FLAG" if bad else ""))
            prev = (d, g30, gpk, T["f"])
    print()
    for j in jumps:
        print(j)
    print(f"\n{flags} gain jump(s) > {jump:g} dB between neighbouring diameters")
    return flags


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--summary":
        sys.exit(1 if summary(sys.argv[2] if len(sys.argv) > 2 else "wires") else 0)
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
