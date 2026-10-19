"""Ø1.0 invariance guard for the wire-diameter work: the NEC wire lists of the six committed sky-cone wire designs at
Ø1 mm (RWIRE 0.5 mm, HUB_R 3 mm) must stay exactly as they were before the thick-wire changes (hub cut at HUB_R, lid
trim, nec_order), so the committed tables stay reproducible. No NEC solve.
  python check_d1_wires.py            checks every design: nec_order() is the identity and the wire-list hash matches
  python check_d1_wires.py --print    prints the hashes (REF was made with the code of commit 61caeb7, before the change)
Hash: sha256 of the (a xyz, b xyz, radius) of every wire in model order, rounded to 1e-9 m; kinds are left out
(wirecage now labels frame 0 "frame0"). S40 is hashed twice: the plain family-10 list and the sheetgrid list the
app table uses (NGRID 32, DR 1.8 mm).
Also checks that no design draws the same wire twice (same end points) at its thickest table: Ø1.5 mm (A55: Ø0.8 mm,
it has no Ø1.5 table). At Ø1.5 the W16 hub ring (4.2 mm) once came out twice, as the hub and as a path ring."""
import os
import sys
import json
import hashlib
import subprocess

REF = {   # from 61caeb7 (pre-change family10.py / wirecage.py), see the module docstring
    "W16": "5743e37ce938bad3", "W65": "c3b9be0cf27592c4", "W40": "c035c0d375664c33", "B44f": "4c86ac0f45642390",
    "A55": "9ad84df752940900", "S40": "d05337302a6992b5", "S40grid": "c19eceae0d0be987",
}
ENV = {   # per design: the env the app-table command lines use (results/run_wires.sh)
    "W16": {}, "W65": {}, "W40": {"SIZE": "0.040"}, "B44f": {"SIZE": "0.044"}, "A55": {"SIZE": "0.055"},
    "S40": {"SIZE": "0.040", "FLO": "1.4e9"},
    "S40grid": {"SIZE": "0.040", "FLO": "1.4e9", "NGRID": "32", "NCAGE": "32", "DR": "1.8e-3"},
}


def digest(wires):
    rows = [[round(v, 9) for v in (*a, *b, r)] for _, a, b, r in wires]
    return hashlib.sha256(json.dumps(rows).encode()).hexdigest()[:16], len(rows)


DUP_D = {"W16": 1.5e-3, "W65": 1.5e-3, "W40": 1.5e-3, "B44f": 1.5e-3, "A55": 0.8e-3, "S40": 1.5e-3, "S40grid": 1.5e-3}


def duplicates(wires):
    """number of wires drawn twice: the same two end points (either direction, rounded to 1e-7 m)"""
    key = lambda w: tuple(sorted(tuple(round(v, 7) for v in q) for q in w[1:3]))
    seen, dups = set(), 0
    for w in wires:
        k = key(w)
        dups += k in seen
        seen.add(k)
    return dups


def one(name):
    """wire list of one design in this process (the env is set by the caller): (hash, count, order is identity,
    duplicate wires)"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    if name == "W16":
        import wirecage as W
        import family6
        p = json.load(open("designs/W16.json"))
        p = p.get("p", p)
        if hasattr(W, "wire_list"):
            wires = W.wire_list(family6, p, 16, float(os.environ.get("RWIRE", "0.5e-3")))
        else:                                   # pre-change wirecage: the list only comes out of a NEC run
            info = {}
            W.model(family6, p, 3e9, 16, 0.5e-3, per=30, info=info)
            wires = [("feed", (0, 0, 0), (0, 0, p["g"]), 0.46e-3)] + info["wires"]
    else:
        import designs  # noqa: F401
        import family2  # noqa: F401
        import family13  # noqa: F401  (family 12 patches family10.build / wire_list, as in export_shaped_table.py)
        if name == "S40grid":
            import sheetgrid
            sheetgrid.patch()
            F10 = sheetgrid.F
        else:
            import family10 as F10
        d = json.load(open(f"designs/{name.replace('grid', '')}.json"))
        p = d.get("p", d)
        if "ru" in p:
            import family11 as F11
            p = F11.to_abs(p)
        p = F10.full(p)
        wires = F10.wire_list(F10.build(p))
    try:
        from wire_variant import nec_order
        ident = nec_order(wires) == list(range(len(wires)))
    except ImportError:                         # pre-change code: no reordering at all
        ident = True
    h, n = digest(wires)
    return h, n, ident, duplicates(wires)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--one":
        print(json.dumps(one(sys.argv[2])))
        return
    show = "--print" in sys.argv
    here = os.path.dirname(os.path.abspath(__file__))
    bad = 0
    for name, extra in ENV.items():
        env = {k: v for k, v in os.environ.items() if k not in ("SIZE", "FLO", "NGRID", "NCAGE", "DR", "SEG", "RGRID")}
        env.update(RWIRE="0.0005", HUB_R="0.003", **extra)       # the Ø1.0 settings (wire_variant.py 1e-3 ...)
        out = subprocess.run([sys.executable, os.path.abspath(__file__), "--one", name], cwd=here, env=env,
                             capture_output=True, text=True)
        if out.returncode:
            print(f"{name}: failed\n{out.stderr}")
            bad += 1
            continue
        h, n, ident, dups = json.loads(out.stdout.strip().splitlines()[-1])
        ok = ident and not dups and (show or REF[name] == h)
        bad += not ok
        print(f"{name:8s} {n:4d} wires  hash {h}  nec_order identity {ident}  duplicates {dups}"
              + ("" if show else f"  ref {REF[name]}  {'OK' if ok else 'FAIL'}"))
    from wire_variant import hub_for
    for name, extra in ENV.items():                               # no wire drawn twice at the thickest table
        d = DUP_D[name]
        env = {k: v for k, v in os.environ.items() if k not in ("SIZE", "FLO", "NGRID", "NCAGE", "DR", "SEG", "RGRID")}
        env.update(RWIRE=f"{d / 2:g}", HUB_R=f"{hub_for(d):g}", **extra)
        out = subprocess.run([sys.executable, os.path.abspath(__file__), "--one", name], cwd=here, env=env,
                             capture_output=True, text=True)
        if out.returncode:
            print(f"{name} at {d * 1e3:g} mm: failed\n{out.stderr}")
            bad += 1
            continue
        _, n, _, dups = json.loads(out.stdout.strip().splitlines()[-1])
        bad += dups > 0
        print(f"{name:8s} at {d * 1e3:g} mm {n:4d} wires  duplicates {dups}  {'OK' if not dups else 'FAIL'}")
    if not show:
        print("OK" if not bad else f"{bad} FAIL")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
