#!/bin/sh
# App tables of design T66 (the sky-tilted W65, runT.sh / t66a): base grid + the EXT_TOP=10 extension, for the
# base Ø1.0 and the tabulated wire diameters, into wires/ and ext/ (same command lines as run_wires.sh / run_ext.sh).
# Resumable: a table whose .json already exists is not solved again.
# Then: to_ts.py --entry wires/app_T66_d1.0.json, add_bare.py, to_ts.py --add-wires wires, extend_tables.py ext.
PY=${PY:-python}
cd "$(dirname "$0")/.." || exit 1
mkdir -p wires ext
DS="1.0 0.5 0.8 1.5"
for d in $DS; do
  dm=$($PY -c "print($d*1e-3)")
  E=$($PY wire_variant.py "$dm" 6.4e9) && [ -n "$E" ] || { echo "wire_variant.py failed for $d" >&2; exit 1; }
  [ -s wires/app_T66_d$d.json ] || ( export $E; $PY export_shaped_table.py designs/T66.json 960e6 6.4e9 64 wires/app_T66_d$d.json > wires/app_T66_d$d.log 2>&1 ) &
  [ -s ext/app_T66_d$d.json ] || ( export $E EXT_TOP=10; $PY export_shaped_table.py designs/T66.json 960e6 6.4e9 64 ext/app_T66_d$d.json > ext/app_T66_d$d.log 2>&1 ) &
done
wait
for d in $DS; do
  dm=$($PY -c "print($d*1e-3)")
  E=$($PY wire_variant.py "$dm" 6.4e9)
  [ -s wires/bare_T66_d$d.json ] || ( export $E; $PY export_bare_table.py cage - designs/T66.json 960e6 6.4e9 64 wires/bare_T66_d$d.json > wires/bare_T66_d$d.log 2>&1 )
  [ -s ext/bare_T66_d$d.json ] || ( export $E EXT_TOP=10; $PY export_bare_table.py cage - designs/T66.json 960e6 6.4e9 64 ext/bare_T66_d$d.json > ext/bare_T66_d$d.log 2>&1 )
done
echo done > wires/done_T66
