"""Append extension rows (export scripts run with EXT_TOP, results/run_ext.sh) to the app tables in skycone.data.ts:
  python extend_tables.py ../../src/lib/antennas/skycone.data.ts ext
<dir> holds app_<D>_d<mm>.json + bare_<D>_d<mm>.json per wire design and diameter (run_wires.sh with WDIR=<dir>) and
app_<S>.json + bare_<S>.json for the solid ones. Each file starts with the anchor, the committed grid's last point
solved again: it must reproduce the committed row (R, X, gains within TOL, default 0.15) or nothing is written; it
is then dropped and the rest appended to f/r/x/g, bare.f/r/x and every wires[] variant. An entry whose grid
already reaches past the anchor is skipped (run twice = no change)."""
import json
import os
import re
import sys

WIRE = {"W16": "SKYCONE_W16", "W65": "SKYCONE_W65", "W40": "SKYCONE_W40", "B44f": "SKYCONE_B44", "A55": "SKYCONE_A55", "S40": "SKYCONE_S40"}
SOLID = {"S73": "SKYCONE_7", "B": "SKYCONE_8"}
TOL = float(os.environ.get("TOL", "0.15"))
r1 = lambda a: [round(v, 1) for v in a]
worst = {}


def check(what, got, want):
    """Anchor row vs committed row (flat lists of numbers)."""
    d = max(abs(a - b) for a, b in zip(got, want))
    worst[what] = d
    if len(got) != len(want) or d > TOL:
        sys.exit(f"{what}: anchor differs from the committed row by {d:.3f} (> {TOL}); nothing written")


def app_rows(what, a, f, r, x, g):
    """Check a's anchor against the committed last row; return the rows to append."""
    if abs(a["f"][0] - f[-1]) > 1e-9:
        sys.exit(f"{what}: anchor f {a['f'][0]} is not the committed last f {f[-1]}")
    check(what, [a["r"][0], a["x"][0], *a["g"][0]], [r[-1], x[-1], *g[-1]])
    return a["f"][1:], r1(a["r"][1:]), r1(a["x"][1:]), [r1(row) for row in a["g"][1:]]


def bare_rows(what, b, bare_f, r, x):
    if abs(b["f"][0] - bare_f[-1]) > 1e-9:
        sys.exit(f"{what}: anchor f {b['f'][0]} is not the committed last f {bare_f[-1]}")
    check(what, [row[0] for row in b["r"]] + [row[0] for row in b["x"]], [row[-1] for row in r] + [row[-1] for row in x])
    return b["f"][1:], [r1(row[1:]) for row in b["r"]], [r1(row[1:]) for row in b["x"]]


def extend(obj, app, bare, variants):
    """variants: {d: (app, bare)} for obj['wires']."""
    f, rr, xx, gg = app_rows("app", app, obj["f"], obj["r"], obj["x"], obj["g"])
    bf, br, bx = bare_rows("bare", bare, obj["bare"]["f"], obj["bare"]["r"], obj["bare"]["x"])
    for w in obj.get("wires", []):
        key = round(w["d"] * 1e3, 3)
        if key not in variants:
            sys.exit(f"no extension files for wire Ø{key} mm")
        va, vb = variants[key]
        vf, vr, vx, vg = app_rows(f"Ø{key} app", va, obj["f"], w["r"], w["x"], w["g"])
        assert vf == f, f"Ø{key}: extension grid differs from the base"
        vbf, vbr, vbx = bare_rows(f"Ø{key} bare", vb, obj["bare"]["f"], w["bare"]["r"], w["bare"]["x"])
        assert vbf == bf, f"Ø{key}: bare extension grid differs from the base"
        w["r"] += vr; w["x"] += vx; w["g"] += vg
        for k in range(len(vbr)):
            w["bare"]["r"][k] += vbr[k]; w["bare"]["x"][k] += vbx[k]
    obj["f"] += f; obj["r"] += rr; obj["x"] += xx; obj["g"] += gg
    obj["bare"]["f"] += bf
    for k in range(len(br)):
        obj["bare"]["r"][k] += br[k]; obj["bare"]["x"][k] += bx[k]
    return len(f), len(bf)


def main(path, d):
    src = open(path).read()
    load = lambda name: json.load(open(os.path.join(d, name)))
    jobs = [(name, f"app_{D}.json", f"bare_{D}.json", None) for D, name in SOLID.items()] + \
           [(name, None, None, D) for D, name in WIRE.items()]
    for name, fa, fb, D in jobs:
        m = re.search(rf"^export const {name}: SkyconeTable = (\{{.*\}});$", src, re.M)
        assert m, f"{name} not found in {path}"
        obj = json.loads(m.group(1))
        if D:
            wire = obj["cage"] if "cage" in obj else obj["short"]
            base = round(2 * wire["r"] * 1e3, 3)
            files = {}
            for fn in os.listdir(d):
                mm = re.fullmatch(rf"app_{D}_d([\d.]+)\.json", fn)
                if mm and os.path.exists(os.path.join(d, f"bare_{D}_d{mm.group(1)}.json")):
                    files[round(float(mm.group(1)), 3)] = (load(fn), load(f"bare_{D}_d{mm.group(1)}.json"))
            if base not in files:
                print(f"{name}: no Ø{base} files in {d}, skipped", file=sys.stderr)
                continue
            app, bare = files.pop(base)
        else:
            if not os.path.exists(os.path.join(d, fa)):
                print(f"{name}: no {fa} in {d}, skipped", file=sys.stderr)
                continue
            app, bare, files = load(fa), load(fb), {}
        if obj["f"][-1] > app["f"][0] + 1e-9:
            print(f"{name}: already extended, skipped", file=sys.stderr)
            continue
        worst.clear()
        na, nb = extend(obj, app, bare, files)
        src = src[:m.start(1)] + json.dumps(obj, separators=(",", ":")) + src[m.end(1):]
        print(f"{name}: +{na} rows (to {obj['f'][-1]:g} f_lo), bare +{nb}, {len(obj.get('wires', []))} wire variants; "
              f"anchor max diff {max(worst.values()):.3f}", file=sys.stderr)
    open(path, "w").write(src)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
