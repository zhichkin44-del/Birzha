#!/bin/sh
# sh tools/final-shots.sh <демо> [вариант=c] — полные снимки 1440 и 390 в demos/<демо>/shots/
d=$1; v=${2:-c}
mkdir -p $d/shots
for w in 1440 390; do
  out=$(node tools/shot.mjs $d/variants/$v/index.html $d/shots/$d-$w.png $w 900 --wait=4500)
  case "$out" in *'"pageHeight":900'*) out=$(node tools/shot.mjs $d/variants/$v/index.html $d/shots/$d-$w.png $w 900 --wait=7000);; esac
  echo "$out"
done
