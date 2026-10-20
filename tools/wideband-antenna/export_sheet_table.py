"""App table for a sheet-metal sky-tilted bicone with one shorting wire (the app's `short` field, type skycone40):
export_shaped_table.py run on the sheetgrid.py model (NGRID frames + dense hoops = the sheet, plus the wire):
  SIZE=0.040 FLO=1.4e9 NGRID=32 DR=1.8e-3 python export_sheet_table.py designs/S40.json 1.4e9 6.4e9 64 app_S40.json
then `python to_ts.py --entry app_S40.json` (one entry for skycone.data.ts). The `cage` block of the shaped-cage
table becomes `short` = {rho, zHot, zGnd, r, k}: the app draws the profile as sheet and the wire at phi = 0; the
Radiation-view currents are frame 0 x NGRID per profile segment (the sheet's total axial current), then the wire's."""
import os
import sys
import json
import runpy
os.environ["NCAGE"] = os.environ.get("NGRID", "32")
from multiprocessing import Pool
import numpy as np
import designs as D
import sheetgrid
sheetgrid.patch()
F10 = sheetgrid.F
out = sys.argv[5]
p = F10.full(json.load(open(sys.argv[1])))
f_lo, f_hi, nf = float(sys.argv[2]), float(sys.argv[3]), int(sys.argv[4])
ELS = np.arange(-90, 91, 5.0)


def _row(f):
    return f, F10.model(p, f, seg=float(os.environ.get("SEG", "1.5e-3")), els=ELS, nphi=8)


# the free-space rows (export_shaped_table.py's first loop) in 8 processes, then served from this cache
with Pool(int(os.environ.get("POOL", "8"))) as pool:
    cache = dict(pool.map(_row, list(D.table_freqs(nf, f_lo, f_hi))))
_model = F10.model


def model(q, f, **kw):
    if kw.get("info") is None and kw.get("nphi") == 8 and f in cache:
        return cache[f]
    return _model(q, f, **kw)
F10.model = model
try:
    runpy.run_path("export_shaped_table.py", run_name="__main__")
except SystemExit as e:                         # extension mode ends there before the currents
    if e.code:
        raise
d = json.load(open(out))
sh = d.pop("cage")["short"]
d["short"] = dict(rho=sh["rho"], zHot=sh["zHot"], zGnd=sh["zGnd"], r=sheetgrid.F.RWIRE, k=sh.get("k"))
json.dump(d, open(out, "w"))
print("short", d["short"])
