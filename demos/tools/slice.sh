#!/bin/sh
# sh tools/slice.sh <демо> <вариант...> — снимки 1280/375 с нарезкой на куски (для проверяющих). Пустой снимок (высота 800) — повтор с большим ожиданием.
d=$1; shift
for v in "$@"; do for w in 1280 375; do
  H=1500; [ $w = 375 ] && H=1600
  rm -f $d/variants/$v/$w-s*.png
  out=$(node tools/shot.mjs $d/variants/$v/index.html $d/variants/$v/$w.png $w 800 --slices=$H)
  case "$out" in *'"pageHeight":800'*) out=$(node tools/shot.mjs $d/variants/$v/index.html $d/variants/$v/$w.png $w 800 --slices=$H --wait=5000);; esac
  echo "$d/$v/$w $out"
done; done
