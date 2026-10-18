#!/bin/sh
# Wire-diameter study: app table and bare-coax table of every sky-cone wire design for each wire diameter in $DS (mm).
#   DS="0.5 0.8 1.0 1.5 2.0" PY=python ./results/run_wires.sh        (default DS=1.0: the regression gate against the app)
# Writes wires/app_<D>_d<mm>.json, wires/bare_<D>_d<mm>.json and wires/done_<D>_d<mm> per design (D = W16 W65 W40 B44f A55 S40).
# Phase 1: the six app tables at once (5 single processes + the S40 row pool of 3 = 8 cores).
# Phase 2: the bare tables one after another (each runs a Pool of 8). Same command lines, bands and nf as the README
# pipeline and run_bare.sh; the wire env (RWIRE, HUB_R, SEG) comes from wire_variant.py. At Ø1.0 the W16 table keeps its
# own lambda / 30 segments (export_cage_table.py without SEG) so that it reproduces the committed one.
PY=${PY:-python}
DS=${DS:-1.0}
cd "$(dirname "$0")/.."
mkdir -p wires
for d in $DS; do
  dm=$($PY -c "print($d*1e-3)")
  # wire_env <f_hi>: RWIRE HUB_R SEG for this diameter
  we() { $PY wire_variant.py "$dm" "$1"; }
  rm -f wires/done_*_d$d
  # --- phase 1: app tables ---
  # W16 (NEC-2 cage via wirecage.py; r in mm on the command line)
  ( export $(we 6.4e9); [ "$d" = "1.0" ] && unset SEG
    $PY export_cage_table.py family6 designs/W16.json 16 $($PY -c "print($d/2)") 960e6 6.4e9 64 wires/app_W16_d$d.json > wires/app_W16_d$d.log 2>&1 ) &
  ( export $(we 6.4e9); $PY export_shaped_table.py designs/W65.json 960e6 6.4e9 64 wires/app_W65_d$d.json > wires/app_W65_d$d.log 2>&1 ) &
  ( export $(we 6.4e9); SIZE=0.040 $PY export_shaped_table.py designs/W40.json 1.4e9 6.4e9 64 wires/app_W40_d$d.json > wires/app_W40_d$d.log 2>&1 ) &
  ( export $(we 7.0e9); SIZE=0.044 $PY export_shaped_table.py designs/B44f.json 1.36e9 7.0e9 64 wires/app_B44f_d$d.json > wires/app_B44f_d$d.log 2>&1 ) &
  ( export $(we 1.36e9); SIZE=0.055 $PY export_shaped_table.py designs/A55.json 0.96e9 1.36e9 64 wires/app_A55_d$d.json > wires/app_A55_d$d.log 2>&1 ) &
  ( export $(we 6.4e9); SIZE=0.040 FLO=1.4e9 NGRID=32 DR=1.8e-3 POOL=3 $PY export_sheet_table.py designs/S40.json 1.4e9 6.4e9 64 wires/app_S40_d$d.json > wires/app_S40_d$d.log 2>&1 ) &
  wait
  # --- phase 2: bare tables, one design after another ---
  ( export $(we 6.4e9); $PY export_bare_table.py cage - designs/W16.json 960e6 6.4e9 64 wires/bare_W16_d$d.json > wires/bare_W16_d$d.log 2>&1 && echo done > wires/done_W16_d$d )
  ( export $(we 6.4e9); $PY export_bare_table.py cage - designs/W65.json 960e6 6.4e9 64 wires/bare_W65_d$d.json > wires/bare_W65_d$d.log 2>&1 && echo done > wires/done_W65_d$d )
  ( export $(we 6.4e9); SIZE=0.040 $PY export_bare_table.py cage - designs/W40.json 1.4e9 6.4e9 64 wires/bare_W40_d$d.json > wires/bare_W40_d$d.log 2>&1 && echo done > wires/done_W40_d$d )
  ( export $(we 7.0e9); SIZE=0.044 $PY export_bare_table.py cage - designs/B44f.json 1.36e9 7.0e9 64 wires/bare_B44f_d$d.json > wires/bare_B44f_d$d.log 2>&1 && echo done > wires/done_B44f_d$d )
  ( export $(we 1.36e9); SIZE=0.055 $PY export_bare_table.py cage - designs/A55.json 0.96e9 1.36e9 64 wires/bare_A55_d$d.json > wires/bare_A55_d$d.log 2>&1 && echo done > wires/done_A55_d$d )
  ( export $(we 6.4e9); SIZE=0.040 FLO=1.4e9 NGRID=32 DR=1.8e-3 $PY sheetgrid.py --run export_bare_table.py cage - designs/S40.json 1.4e9 6.4e9 48 wires/bare_S40_d$d.json > wires/bare_S40_d$d.log 2>&1 && echo done > wires/done_S40_d$d )
done
echo done > wires/all_done
