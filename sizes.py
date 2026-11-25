#!/usr/bin/env python3
"""Size lineup starter: every item at true world scale, resizable, the changes sent as picks. Make
sprites.json and s/ with your project's sprite tool (README: Size lineups), copy this beside them as
make.py, rename the title and edit the words marked EDIT."""
import sys
sys.path.insert(0, '/home/user/claude-mockup-kit')  # EDIT if the kit's clone is elsewhere
from pagekit import Page

p = Page('Size Lineup', round=1, app_css=False)
# sprites.json: {unit, ref, refName, facets: [{key, name}], sprites: {key: {src, w, h, ox, oy, ppu, design}},
# items: [{id, key, name, use, len, group, mine, type, ...a field per facet}], lines: {title, type, items}}.
p.sizes('EDIT: what is on the page and at what scale. Drag to pan, scroll or pinch to zoom, click one to '
        'resize it, shift-click to pick several.', sprites='sprites.json')
p.cli()
