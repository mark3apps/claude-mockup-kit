"""The document a board frames: a page's hosted content with the kit filled in. Stdlib only, so a
board serving pages imports it from its copy of this repo.

    from hosted import frame
    doc = frame(content, base='/p/CARD/SLUG/r3/')   # base: where the page's files/ folder is served

pagekit's hosted content (Page.bundle, Page.publish) is the page with every placeholder filled except
the kit's own (@@KIT_CSS@@, @@KIT_JS@@ and the perf, sizes and costs parts), and its pictures as
relative `files/<name>`. frame() puts this kit in those places, marks the page hosted
(`<meta name="mock-host" content="board">`, which turns on kit.js's hosted mode) and sets the base.

    python3 hosted.py CONTENT.html OUT.html [--base URL]
"""
import html
import re
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parent
PARTS = {'KIT_CSS': 'kit.css', 'KIT_JS': 'kit.js', 'PERF_CSS': 'perf.css', 'PERF_JS': 'perf.js',
         'SIZES_CSS': 'sizes.css', 'SIZES_JS': 'sizes.js', 'COSTS_CSS': 'costs.css', 'COSTS_JS': 'costs.js'}
MARK = re.compile(r'@@(' + '|'.join(PARTS) + r')@@')
# Dark before anything paints: the board frames pages in a dark panel, and a page's kit.css loads later in the
# body, so without these a dark-mode board flashed white on open (Mark 11-25).
HEAD = ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="mock-host" content="board"><meta name="color-scheme" content="dark">'
        '<style>html{{background:#07060f}}</style>{base}</head>\n<body>\n')


def frame(content, base=None, kit=KIT):
    """The whole frame document for hosted content; kit is the folder holding this kit's files."""
    kit = Path(kit)
    body = MARK.sub(lambda m: (kit / PARTS[m.group(1)]).read_text(), content)
    tag = f'<base href="{html.escape(base, quote=True)}">' if base else ''
    return HEAD.format(base=tag) + body + '\n</body></html>\n'


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    b = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else None
    if b:
        args.remove(b)
    if len(args) != 2:
        raise SystemExit('usage: python3 hosted.py CONTENT.html OUT.html [--base URL]')
    Path(args[1]).write_text(frame(Path(args[0]).read_text(), b))
