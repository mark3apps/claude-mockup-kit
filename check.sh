#!/usr/bin/env bash
# Builds every starter and example into a temp folder and runs shot.js on each, then the add-on
# tests. Run it before a kit PR. Needs Python 3 with Pillow, Node and Playwright with Chromium.
#   ./check.sh [OUTDIR]     screenshots land in OUTDIR (default: a temp folder, kept and printed)
set -euo pipefail
KIT=$(cd "$(dirname "$0")" && pwd)
OUT=${1:-$(mktemp -d)}
mkdir -p "$OUT"
cd "$KIT"
# The kit's own pages build without any project's add-on, wherever this clone sits.
export MOCKUP_ADDONS=
python3 -m unittest -q test_build

# The template needs a capture: a plain stand-in picture.
mkdir -p "$OUT/template/shots"
cp template.html "$OUT/template/page.html"
python3 -c "from PIL import Image; Image.new('RGB', (1440, 900), (10, 12, 30)).save('$OUT/template/shots/01-today.png')"

pages=("$OUT/template/page.html" costs.html examples/*/page.html)
fail=0
for p in "${pages[@]}"; do
  name=$(echo "${p#"$OUT"/}" | sed 's#/page.html##; s#\.html##; s#/#-#g')
  python3 build.py "$p" --out "$OUT/$name.built.html" >/dev/null
  if node shot.js "$OUT/$name.built.html" "$OUT/$name" >"$OUT/$name.log" 2>&1 && tail -1 "$OUT/$name.log" | grep -q '^no errors'; then
    echo "ok    $name"
  else
    echo "FAIL  $name"; tail -5 "$OUT/$name.log"; fail=1
  fi
done
echo "shots in $OUT"
exit $fail
