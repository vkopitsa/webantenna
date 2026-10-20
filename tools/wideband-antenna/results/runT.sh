#!/bin/bash
# Sky-tilted W65 (beam peak near 30-50 deg elevation, null overhead, PATTERN=tilt in family10.py), seeded from
# best_s66sh.json (W65), Ø66 box. t66a: W65's free set + brim, SWR floor 1.85; t66b: everything free, more pattern weight.
cd "$(dirname "$0")"
PY=${PY:-/tmp/claude-1000/-home-vkopytsia-Projects-antenna-generator/5ef02d81-4f02-4d42-a761-e7e65e0dd628/scratchpad/venv/bin/python}
export OMP_NUM_THREADS=1 NUMBA_NUM_THREADS=1 FAMILY=family11 SIZE=0.066 FLO=912e6 X0=best_s66sh.json PATTERN=tilt POP=16 WORKERS=4
( WPAT=0.15 SWRFLOOR=1.85 SIGMA=0.08 FREE=g,r0u,ru,kx,ky,ht,hc,capu,gd,rl,gkx,gky,gs,shr,hf,ah $PY ../opt_cma.py t66a 150 3 > t66a.log 2>&1 ) &
( WPAT=0.3 SWRFLOOR=2.0 SIGMA=0.12 $PY ../opt_cma.py t66b 150 4 > t66b.log 2>&1 ) &
wait
touch runT.done
