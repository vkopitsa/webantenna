"""python to_ts.py app_B.json app_A.json app_S73.json app_W16.json app_W65.json > src/lib/antennas/skycone.data.ts
(app_W16.json comes from export_cage_table.py: NEC-2 wire cage, with its `cage` block; app_W65.json from
export_shaped_table.py: the small cage with its shorting wire, `cage.short`). --entry app_X.json prints that file's
entry alone, to append to skycone.data.ts without regenerating the others.
python to_ts.py --add-wires wires ../../src/lib/antennas/skycone.data.ts adds a `wires` array (the re-solved wire diameters from
wires/app_<D>_d<mm>.json + bare_<D>_d<mm>.json, D = W16 W65 W40 B44f A55 S40) to those SKYCONE_* entries in place; the _d1.0 files are the
base entry itself and are only checked against it."""
import glob, json, os, re, sys

WIRE_NAMES = {"W16": "SKYCONE_W16", "W65": "SKYCONE_W65", "W40": "SKYCONE_W40", "B44f": "SKYCONE_B44", "A55": "SKYCONE_A55", "S40": "SKYCONE_S40"}


def add_wires(wdir, path):
    r1 = lambda a: [round(v, 1) for v in a]
    same = lambda a, b, what: (len(a) == len(b) and max(abs(x - y) for x, y in zip(a, b)) <= 1e-9) or sys.exit(f"{what}: grid differs from the base entry")
    src = open(path).read()
    for D, name in WIRE_NAMES.items():
        m = re.search(rf"^export const {name}: SkyconeTable = (\{{.*\}});$", src, re.M)
        assert m, f"{name} not found in {path}"
        obj = json.loads(m.group(1))
        wire = obj["cage"] if "cage" in obj else obj["short"]
        n, base_d = obj.get("cage", {}).get("n"), 2 * wire["r"]
        wires = []
        for fa in sorted(glob.glob(os.path.join(wdir, f"app_{D}_d*.json")), key=lambda p: float(re.search(r"_d([\d.]+)\.json$", p).group(1))):
            mm = float(re.search(r"_d([\d.]+)\.json$", fa).group(1))
            a = json.load(open(fa))
            b = json.load(open(os.path.join(wdir, f"bare_{D}_d{os.path.basename(fa)[len(f'app_{D}_d'):]}")))
            w2 = a["cage"] if "cage" in a else a["short"]
            d = 2 * w2["r"]
            assert abs(d - mm * 1e-3) < 1e-9, f"{fa}: wire r {w2['r']} is not d{mm}"
            same(a["f"], obj["f"], fa)
            same(b["f"], obj["bare"]["f"], fa.replace("app_", "bare_"))
            same(b["lensLam"], obj["bare"]["lensLam"], fa.replace("app_", "bare_"))
            if abs(d - base_d) < 1e-9:
                continue
            assert len(a["g"]) == len(obj["f"]) and len(a["els"]) == len(obj["els"]), fa
            w = dict(d=d)
            if n:  # the file's hub is rounded to 0.1 mm; the app's hubFor() formula is what is stored (when above the 3 mm floor)
                hub = max(3e-3, n * d * 1.1 / (2 * 3.141592653589793))
                assert abs(w2["hub"] - hub) < 1e-4, f"{fa}: hub"
                if hub > 3e-3:
                    w["hub"] = round(hub, 7)
            w.update(r=r1(a["r"]), x=r1(a["x"]), g=[r1(row) for row in a["g"]], bare=dict(r=[r1(row) for row in b["r"]], x=[r1(row) for row in b["x"]]))
            wires.append(w)
        obj.pop("wires", None)
        obj["wires"] = wires
        src = src[:m.start(1)] + json.dumps(obj, separators=(",", ":")) + src[m.end(1):]
        print(f"{name}: base Ø{base_d * 1e3:g} mm + {', '.join(f'Ø{w['d'] * 1e3:g}' for w in wires)}", file=sys.stderr)
    open(path, "w").write(src)


if len(sys.argv) == 4 and sys.argv[1] == "--add-wires":
    add_wires(sys.argv[2], sys.argv[3])
    sys.exit(0)
names = {"app_B.json": "SKYCONE_8", "app_A.json": "SKYCONE_21", "app_S73.json": "SKYCONE_7", "app_W16.json": "SKYCONE_W16",
         "app_W65.json": "SKYCONE_W65", "app_W40.json": "SKYCONE_W40", "app_B44f.json": "SKYCONE_B44", "app_A55.json": "SKYCONE_A55", "app_S40.json": "SKYCONE_S40"}
src = {"app_B.json": "design B_simple (family6, 800 MHz – 6.4 GHz)", "app_A.json": "design A (family4, 300 MHz – 6.4 GHz)",
       "app_S73.json": "design S73 (family8, 960 MHz – 6.4 GHz, compact)",
       "app_W16.json": "design W16 (family9, 16-frame wire cage of Ø1 mm wire, 960 MHz – 6.4 GHz; NEC-2, gain = mean over phi)",
       "app_W65.json": "design W65 (family10/11, the 16-frame cage with one shorting wire, 960 MHz – 6.4 GHz; NEC-2 at 1.5 mm segments, gain = mean over 8 azimuths)",
       "app_W40.json": "design W40 (family13, Ø39 × 40 mm cage with one shorting wire, 1.4 – 6.4 GHz: below the Chu floor for 960 MHz; NEC-2 at 1.5 mm segments, gain = mean over 8 azimuths)",
       "app_B44f.json": "design B44f (family13, Ø43 × 44 mm cage with one shorting wire, 1.36 – 7 GHz, the high-band half of the two-antenna split; NEC-2 at 1.5 mm segments, gain = mean over 8 azimuths)",
       "app_A55.json": "design A55 (family13, Ø51 × 54 mm cage with two coiled shorting wires, 3.6 pF in one and 2.2 pF in the pin, 960 MHz – 1.36 GHz, the low-band half of the split; NEC-2 at 1.5 mm segments, gain = mean over 8 azimuths)",
       "app_S40.json": "design S40 (W40's profile in sheet metal + one shorting wire, 1.4 – 6.4 GHz; NEC-2 wire grid of the sheet, sheetgrid.py: 24 frames, hoops every 2.5 mm, 1.5 mm segments, gain = mean over 8 azimuths)"}
entry_only = sys.argv[1] == "--entry"
if entry_only:
    sys.argv.pop(1)
if not entry_only:
    print("""// Tabulated body-of-revolution MoM (and NEC-2 for the wire cage) results for the sky-tilted capped bicones (docs/FPV-DETECTOR-ANTENNA.md).
// Generated by tools/wideband-antenna/export_app_table.py + to_ts.py; do not edit by hand.
// Profile polylines (rho, z) in metres for the design band starting at fLo; f is a ratio to fLo;
// r, x in ohms at the coax end; g[i][j] in dBi at elevation els[j] (deg, + = up). No cable, PEC, free space.
import type { SkyconeTable } from "./skycone";
""")
for fn in sys.argv[1:]:
    d = json.load(open(fn))
    r1 = lambda a: [round(v, 1) for v in a]
    obj = dict(fLo=d["fLo"], fHi=d["fHi"], gap=d["gap"], upper=d["upper"], lower=d["lower"], els=d["els"],
               f=d["f"], r=r1(d["r"]), x=r1(d["x"]), g=[r1(row) for row in d["g"]], cur=d["cur"])
    for k in ("cage", "short", "bare"):
        if k in d:
            obj[k] = d[k]
    print(f"/** {src[fn.split('/')[-1]]} */")
    print(f"export const {names[fn.split('/')[-1]]}: SkyconeTable = {json.dumps(obj, separators=(',', ':'))};\n")
