"""Builds a mock-up page into one self-contained HTML file (for shot.js and a standalone page).

    python3 $KIT/build.py PAGE.html [--assets DIR] [--out OUT.html] [--addon FILE ...]

Placeholders in PAGE.html (see README.md):
    @@KIT_CSS@@ @@KIT_JS@@              the kit itself
    @@PERF_CSS@@ @@PERF_JS@@            the perf comparison page (perf.py)
    @@SIZES_CSS@@ @@SIZES_JS@@          the size lineup page (sizes.py)
    @@COSTS_CSS@@ @@COSTS_JS@@          cost charts (costs.py, or any page with a .costchart)
    @@APP_CSS@@ / @@APP_CSS:REGEX@@     the app's own CSS on the stage, from the project's add-on
                                        (standin.css when no add-on gives one)
    @@IMG:path|w=960|q=84|crop=x,y,w,h|png|webp@@  a picture as a data: URI (JPEG unless png or webp;
                                        both keep transparency, webp is smaller)
    @@FILE:path@@                       a text file inlined, its own placeholders filled (CSS, HTML, JSON)
Paths are relative to --assets (default: the page's folder). Any placeholder left over fails.
A project adds its own placeholders (its app's CSS, icons, fonts) in an add-on: a Python file
defining PLACEHOLDERS = {NAME: fn(arg, base)} that returns the text (README: Project add-ons).
Add-ons are --addon (repeatable) plus $MOCKUP_ADDONS (path-separated); with neither, build.py
looks for `.claude/mockup-addon.py` in the page's folder and every folder above it, then in every
repo beside this kit's clone.
Import it for custom steps: `from build import uri`; `stage_css.scoped` scopes an app's CSS.
"""
import argparse
import base64
import importlib.util
import io
import os
import re
import sys
from pathlib import Path

from PIL import Image

KIT = Path(__file__).resolve().parent
sys.path.insert(0, str(KIT))
ADDON = Path('.claude/mockup-addon.py')

LIMIT = 16 * 1024 * 1024
PH = r'@@([A-Z_]+(?::[^@]*)?)@@'


def uri(path, w=None, q=84, crop=None, png=False, webp=False):
    im = Image.open(path)
    if crop:
        x, y, cw, ch = crop
        im = im.crop((x, y, x + cw, y + ch))
    if w and im.width != w:
        im = im.resize((w, round(w * im.height / im.width)), Image.LANCZOS)
    b = io.BytesIO()
    if webp:
        im.save(b, 'WEBP', quality=q, method=4)
    elif png:
        im.save(b, 'PNG', optimize=True)
    else:
        im.convert('RGB').save(b, 'JPEG', quality=q)
    kind = 'webp' if webp else 'png' if png else 'jpeg'
    return f'data:image/{kind};base64,' + base64.b64encode(b.getvalue()).decode()


def _img(spec, base):
    path, *opts = spec.split('|')
    kw = {}
    for o in opts:
        k, _, v = o.partition('=')
        if k == 'w':
            kw['w'] = int(v)
        elif k == 'q':
            kw['q'] = int(v)
        elif k == 'crop':
            kw['crop'] = tuple(int(n) for n in v.split(','))
        elif k == 'png':
            kw['png'] = True
        elif k == 'webp':
            kw['webp'] = True
        else:
            raise SystemExit(f'unknown image option {o!r} in @@IMG:{spec}@@')
    return uri(base / path, **kw)


def addon_paths(page, given=()):
    """Every add-on file for PAGE, in the order its placeholders win. --addon or a set
    $MOCKUP_ADDONS (even empty) is the whole list; only without both are add-ons looked for."""
    env = os.environ.get('MOCKUP_ADDONS')
    if given or env is not None:
        found = [Path(p) for p in given] + [Path(p) for p in (env or '').split(os.pathsep) if p]
    else:
        found = [d / ADDON for d in [page.resolve().parent, *page.resolve().parents] if (d / ADDON).is_file()]
        found += sorted(p for p in KIT.parent.glob(f'*/{ADDON}') if p.is_file())
    out = []
    for p in found:
        if p.resolve() not in [q.resolve() for q in out]:
            out.append(p)
    return out


def load_addons(paths):
    """{NAME: (fn, path)}; a name two add-ons define is kept from the first, the later one noted."""
    table = {}
    for i, p in enumerate(paths):
        if not p.is_file():
            raise SystemExit(f'no add-on at {p}')
        spec = importlib.util.spec_from_file_location(f'mockup_addon_{i}', p)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        for name, fn in getattr(mod, 'PLACEHOLDERS', {}).items():
            if name in table:
                print(f'WARNING: two add-ons define @@{name}@@: using {table[name][1]}, not {p}'
                      ' (pass --addon to choose)', file=sys.stderr)
                continue
            table[name] = (fn, p)
    return table


KIT_PARTS = ('KIT_CSS', 'KIT_JS', 'PERF_CSS', 'PERF_JS', 'SIZES_CSS', 'SIZES_JS', 'COSTS_CSS', 'COSTS_JS')


def kit_part(name):
    """The kit file a KIT_PARTS placeholder stands for: PERF_JS is perf.js."""
    stem, _, ext = name.rpartition('_')
    return KIT / f'{stem.lower()}.{ext.lower()}'


def expand(t, page, base, addons=(), img=None, keep=()):
    """Fills every placeholder in t. img(spec, base) replaces @@IMG@@ (default: a data: URI); names in keep
    stay as written (pagekit's hosted content leaves the kit's own for the board)."""
    table = None
    img = img or _img

    def one(m):
        name, _, arg = m.group(1).partition(':')
        if name in keep:
            return m.group(0)
        if name in KIT_PARTS:
            return kit_part(name).read_text()
        if name == 'IMG':
            return img(arg, base)
        if name == 'FILE':
            return re.sub(PH, one, (base / arg).read_text())
        nonlocal table
        if table is None:
            table = load_addons(addon_paths(Path(page), addons))
        if name in table:
            return table[name][0](arg, base)
        if name == 'APP_CSS':
            return (KIT / 'standin.css').read_text()
        return m.group(0)

    t = re.sub(PH, one, t)
    left = [x for x in re.findall(r'@@[^@\s]{1,80}@@', t) if x.strip('@').partition(':')[0] not in keep]
    if left:
        raise SystemExit(f'unfilled placeholders: {sorted(set(left))} (a project\'s own come from its add-on: README, Project add-ons)')
    return t


def build(page, assets=None, addons=()):
    page = Path(page)
    return expand(page.read_text(), page, Path(assets) if assets else page.parent, addons)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('page')
    ap.add_argument('--assets')
    ap.add_argument('--out')
    ap.add_argument('--addon', action='append', default=[], help='a project add-on file (repeatable)')
    a = ap.parse_args()
    html = build(a.page, a.assets, a.addon)
    out = Path(a.out) if a.out else Path(a.page).with_name(Path(a.page).stem + '.built.html')
    out.write_text(html)
    n = len(html.encode())
    print(f'{out}  {n // 1024} KB')
    if n > LIMIT:
        raise SystemExit('over the 16 MB page limit: shrink pictures with |w= or |q=')
