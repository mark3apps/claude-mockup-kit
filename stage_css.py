"""An app's own CSS, scoped to a mock-up stage, so a mock built from its classes looks like it.

    python3 $KIT/stage_css.py APP.css [--keep REGEX] [--size 1440x900] > stage.css

`scoped(css)` prefixes every rule with `.stage`, turns `:root` / `html` / `body` into the stage
itself, keeps `@keyframes` and `@media`, drops `@font-face`, and rewrites vw / vh against the stage
size (the stage is the app's window, not the browser's). The stage keeps its own height: a page's
`html, body { height: 100% }` made it the scaled box's height, cropping the capture (report #77).
A project add-on calls it for its own placeholder (README: Project add-ons).
"""
import argparse
import re
import sys
from pathlib import Path


def _block_end(s, j):
    d = 0
    while j < len(s):
        if s[j] == '{':
            d += 1
        elif s[j] == '}':
            d -= 1
            if d == 0:
                return j + 1
        j += 1
    return j


_ROOT = re.compile(r'^(?::root|html|body)(?=[\s.:#\[>+~]|$)((?:[.#:\[][^\s>+~]*)?)\s*(?:(?:html|body)\b)?')


def _scope_sel(sel, scope):
    sel = sel.strip()
    m = _ROOT.match(sel)
    if m:
        rest = sel[m.end():].strip()
        return f'{scope}{m.group(1)}' + (f' {rest}' if rest else '')
    return f'{scope} {sel}'


_HEIGHT = re.compile(r'(?:(?<=;)|^)\s*(?:min-)?height\s*:[^;]*(?:;|$)', re.I)


def _is_stage(sel):
    m = _ROOT.match(sel.strip())
    return bool(m) and not sel.strip()[m.end():].strip()


def _units(body, w, h):
    def px(m):
        n, u = float(m.group(1)), m.group(2)
        k = {'vw': w, 'vh': h, 'vmin': min(w, h), 'vmax': max(w, h)}[u] / 100
        return f'{n * k:.6g}px'
    return re.sub(r'(?<![\w-])(\d*\.?\d+)(vw|vh|vmin|vmax)\b', px, body)


def scoped(src, scope='.stage', size=(1440, 900), keep=None):
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    keep_re = re.compile(keep) if keep else None
    out = []
    i = 0
    while True:
        j = src.find('{', i)
        if j < 0:
            break
        head = src[i:j].strip()
        e = _block_end(src, j)
        body = src[j + 1:e - 1]
        i = e
        if head.startswith('@keyframes') or head.startswith('@-webkit-keyframes'):
            out.append(f'{head}{{{body}}}')
        elif head.startswith('@media') or head.startswith('@supports') or head.startswith('@container'):
            inner = scoped(body, scope, size, keep)
            if inner.strip():
                out.append(f'{_units(head, *size)}{{\n{inner}\n}}')
        elif head.startswith('@'):
            continue
        else:
            parts = [p for p in head.split(',') if p.strip()]
            if keep_re and head != ':root' and not head.startswith(('html', 'body')):
                parts = [p for p in parts if keep_re.search(p.strip())]
            roots = [p for p in parts if _is_stage(p)]
            rest = [p for p in parts if p not in roots]
            if roots:
                rb = _HEIGHT.sub('', body)
                if rb.strip():
                    out.append(','.join(_scope_sel(p, scope) for p in roots) + f'{{{_units(rb, *size)}}}')
            if rest:
                out.append(','.join(_scope_sel(p, scope) for p in rest) + f'{{{_units(body, *size)}}}')
    return '\n'.join(out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('css')
    ap.add_argument('--keep', help='keep only selectors matching this regex')
    ap.add_argument('--size', default='1440x900')
    a = ap.parse_args()
    w, h = map(int, a.size.split('x'))
    sys.stdout.write(scoped(Path(a.css).read_text(), size=(w, h), keep=a.keep) + '\n')
