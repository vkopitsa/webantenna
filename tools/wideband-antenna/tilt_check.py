"""Score a family-11 design (best_<tag>.json, at SIZE) with family 10's PATTERN=tilt cost: per frequency SWR, mean
30-50 deg gain, the tilt penalty and the gain at -30 / 0 / 45 / 70 / 90 deg.
  PATTERN=tilt SIZE=0.066 FLO=912e6 python tilt_check.py results/best_s66sh.json"""
import os
os.environ.setdefault("PATTERN", "tilt")
import sys, json
import numpy as np
import family10 as F10
import family11 as F11

d = json.load(open(sys.argv[1]))
q = d.get("p", d)
p = F11.to_abs(q) if "ru" in q else q
res = F10.evaluate(p)
print("H %.1f D %.1f mm  cost %.3f  swr_max %.2f" % (res["H"] * 1e3, res["D"] * 1e3, F10.cost_of(res), res["swr_main"]))
print("  f GHz   SWR  up30-50  pen   -30    0   45   70   90")
for r in res["main"]:
    g = np.array(r["pel"]); at = lambda e: g[F10.PEL.index(e)]
    up = 10 * np.log10(np.mean(10 ** (g[[F10.PEL.index(e) for e in range(30, 51, 5)]] / 10)))
    print("%6.2f %6.2f %7.1f %6.1f %5.1f %5.1f %5.1f %5.1f %5.1f" % (r["f"] / 1e9, r["swr"], up, F10.tilt_penalty(g),
          at(-30), at(0), at(45), at(70), at(90)))
