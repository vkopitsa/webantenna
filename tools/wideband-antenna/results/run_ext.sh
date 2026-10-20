#!/bin/sh
# Extend every sky-cone app table above its grid to EXT_TOP x f_lo (default 10), for "Simulate up to" past the
# design band. Only the new points are solved (export scripts in EXT_TOP mode, designs.table_freqs), each file
# starting with the anchor (the committed last point again), into $WDIR (default ext):
#   PY=<venv python> nohup sh results/run_ext.sh &        then wait for ext/all_done and run
#   python extend_tables.py ../../src/lib/antennas/skycone.data.ts ext
# Design A (SKYCONE_21) already reaches 23.5 f_lo and is not extended.
PY=${PY:-python}
cd "$(dirname "$0")/.." || exit 1
export EXT_TOP=${EXT_TOP:-10}
export WDIR=${WDIR:-ext}
mkdir -p "$WDIR"
# solid shapes (body of revolution): S73 and B, free space then bare coax
$PY export_app_table.py family8 designs/S73.json 960e6 6.4e9 64 $WDIR/app_S73.json > $WDIR/app_S73.log 2>&1
$PY export_app_table.py family6 designs/B_simple.json 800e6 6.4e9 64 $WDIR/app_B.json > $WDIR/app_B.log 2>&1
$PY export_bare_table.py solid family8 designs/S73.json 960e6 6.4e9 64 $WDIR/bare_S73.json > $WDIR/bare_S73.log 2>&1
$PY export_bare_table.py solid family6 designs/B_simple.json 800e6 6.4e9 64 $WDIR/bare_B.json > $WDIR/bare_B.log 2>&1
# wire designs: the base Ø1.0 and the tabulated diameters, same command lines as run_wires.sh
DS="1.0 0.5 0.8 1.5" PY=$PY sh results/run_wires.sh
