#!/usr/bin/env bash
# Builds every starter and example through pagekit, checks each standalone (shot.js) and as the board
# frames it (shot.js --hosted), checks the generated .html starters are current, then the add-on tests.
# Run it before a kit PR. Needs Python 3 with Pillow, Node and Playwright with Chromium.
#   ./check.sh [OUTDIR]     screenshots land in OUTDIR (default: a temp folder, kept and printed)
set -euo pipefail
KIT=$(cd "$(dirname "$0")" && pwd)
OUT=${1:-$(mktemp -d)}
mkdir -p "$OUT"
cd "$KIT"
# The kit's own pages build without any project's add-on, wherever this clone sits.
export MOCKUP_ADDONS=
python3 -m unittest -q test_build test_pagekit

# The template needs a capture: a plain stand-in picture.
mkdir -p "$OUT/template-assets/shots"
python3 -c "from PIL import Image; Image.new('RGB', (1440, 900), (10, 12, 30)).save('$OUT/template-assets/shots/01-today.png')"

# name, make script, the folder its pictures and files are read from
pages=(
  "template template.py $OUT/template-assets"
  "costs costs.py $KIT"
  "perf perf.py $KIT/examples/perf"
  "sizes sizes.py $KIT/examples/sizes"
  "pitch examples/pitch/make.py $KIT/examples/pitch"
  "components examples/components/make.py $KIT/examples/components"
)
fail=0
for row in "${pages[@]}"; do
  read -r name make assets <<<"$row"
  src="$OUT/$name.html"
  (cd "$assets" && python3 "$KIT/$make" --out "$src" >/dev/null && python3 "$KIT/$make" --hosted "$OUT/$name-hosted" >/dev/null)
  python3 build.py "$src" --assets "$assets" --out "$OUT/$name.built.html" >/dev/null
  python3 hosted.py "$OUT/$name-hosted/content.html" "$OUT/$name-hosted/frame.html"
  for mode in standalone hosted; do
    if [ $mode = standalone ]; then args=("$OUT/$name.built.html" "$OUT/$name"); else args=(--hosted "$OUT/$name-hosted/frame.html" "$OUT/$name-hosted"); fi
    if node shot.js "${args[@]}" >"$OUT/$name-$mode.log" 2>&1 && tail -1 "$OUT/$name-$mode.log" | grep -q '^no errors'; then
      echo "ok    $name ($mode)"
    else
      echo "FAIL  $name ($mode)"; tail -5 "$OUT/$name-$mode.log"; fail=1
    fi
  done
done

# The .html starters are generated from the .py ones (python3 template.py --out template.html, ...).
for s in template perf sizes costs; do
  if ! (python3 "$s.py" --out "$OUT/$s.fresh.html" >/dev/null && cmp -s "$OUT/$s.fresh.html" "$s.html"); then
    echo "FAIL  $s.html is not what $s.py writes: python3 $s.py --out $s.html"; fail=1
  fi
done
echo "shots in $OUT"
exit $fail
