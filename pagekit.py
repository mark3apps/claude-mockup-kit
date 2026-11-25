"""pagekit: build a review page from function calls, never hand-written HTML.

    import sys; sys.path.insert(0, '/home/user/claude-mockup-kit')   # the kit's clone
    from pagekit import Page
    p = Page('Tether Looks', round=3, sub='3 LOOKS · PICK KEEP, CHANGE OR DROP')
    p.lede('What changes and what stays.')
    p.pitch('E1', 'Vine braid', one='A green-gold braid.', art='shots/vine.png', rows={'What you see': '...'})
    p.picks()
    p.cli()          # page.html (the source build.py inlines), or --hosted DIR, or --publish

Every component in the README's Components table is a method here. Each returns the element it
made, so a caller can nest into it (`with p.into(el):`) or set attributes (`el.attrs[...]`). Text is
escaped. The one place a page writes markup is the drawn mock itself: `stage.mock(markup)` (and
`raw()` for a picture's SVG). Pictures are `img(path, w=...)`: build.py inlines them for a
standalone page; publish() uploads them to the board beside the page.
"""
import argparse
import hashlib
import html
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path

KIT = Path(__file__).resolve().parent
PAGE_MAX = 2 * 1024 * 1024  # the board's body limit for a page's html (handoff: about 2 MB)


class raw(str):
    """HTML passed through as written: the drawn mock, or a picture's SVG."""


def esc(v):
    return v if isinstance(v, raw) else html.escape(str(v), quote=True)


class El:
    VOID = {'img', 'input', 'meta', 'link', 'br', 'hr'}

    def __init__(self, tag, *kids, cls=None, **attrs):
        self.tag, self.kids = tag, [k for k in kids if k is not None]
        self.attrs = dict(attrs)
        if cls:
            self.attrs['class'] = cls

    def add(self, *kids):
        kids = [k for k in kids if k is not None]
        self.kids.extend(kids)
        return kids[0] if len(kids) == 1 else self

    def walk(self):
        yield self
        for k in self.kids:
            if isinstance(k, El):
                yield from k.walk()

    def tail(self):
        """Kids drawn after the ones added (an item's pick row stays last)."""
        return []

    def render(self):
        a = ''
        for k, v in self.attrs.items():
            if v is None or v is False:
                continue
            k = k.rstrip('_').replace('_', '-')
            a += f' {k}' if v is True else f' {k}="{esc(v)}"'
        if self.tag in self.VOID:
            return f'<{self.tag}{a}>'
        inner = ''.join(k.render() if isinstance(k, El) else esc(k) for k in self.kids + self.tail())
        return f'<{self.tag}{a}>{inner}</{self.tag}>'


def el(tag, *kids, cls=None, **attrs):
    """Any element, for layout the components do not cover: el('p', 'words', cls='hint')."""
    return El(tag, *kids, cls=cls, **attrs)


def img(path, alt='', w=None, q=None, png=False, webp=False, crop=None, **attrs):
    """A picture from the page's folder: build.py inlines it; on the board it is uploaded beside the page."""
    return el('img', alt=alt, src=raw(f'@@IMG:{imgspec(path, w, q, png, webp, crop)}@@'), **attrs)


def imgspec(path, w=None, q=None, png=False, webp=False, crop=None):
    return (str(path) + (f'|w={w}' if w else '') + (f'|q={q}' if q else '') + ('|png' if png else '')
            + ('|webp' if webp else '') + (f'|crop={",".join(map(str, crop))}' if crop else ''))


def _verdict_seg(key, verdict):
    seg = el('div', cls='seg', data_pick=key, data_verdict=True)
    if verdict not in (True, ('Keep', 'Change', 'Drop')):
        seg.add(*[el('button', v, data_v=v.lower()) for v in verdict])
    return seg


class Item(El):
    """A note card the reviewer picks on; its Keep / Change / Drop row always draws last."""

    def __init__(self, *a, pickrow=None, **k):
        super().__init__(*a, **k)
        self.pickrow = pickrow

    def tail(self):
        return [self.pickrow] if self.pickrow is not None else []


class Controls(El):
    def choice(self, key, label, options, start=None, when=None):
        """Pick one of several. options: (value, button words[, words in the picks]); start: the value
        picked at first (else the first)."""
        seg = el('div', cls='seg', data_pick=key)
        for o in options:
            v, words, say = (list(o) + [None])[:3]
            seg.add(el('button', words, data_v=v, data_say=words if say is None else say,
                       aria_pressed='true' if v == start else None))
        self.add(el('div', el('span', label), seg, cls='ctl', data_when=when))
        return seg

    def toggle(self, key, label, words, on=True, say_on=None, say_off=None, replay=False, when=None):
        """An on/off pick; replay adds the ↻ Replay button that restarts the stage's animations."""
        seg = el('div', el('button', words, cls='tog', data_pick=key, aria_pressed='true' if on else 'false',
                           data_say_on=say_on, data_say_off=say_off), cls='seg')
        if replay:
            seg.add(el('button', '↻ Replay', cls='kbtn', data_replay=True))
        self.add(el('div', el('span', label), seg, cls='ctl', data_when=when))
        return seg


class Stage(El):
    def bg(self, path, when=None, alt='', **kw):
        """The capture under everything (a world effect's bare frame)."""
        return self.add(img(path, alt=alt, cls='bg', data_when=when, **kw))

    def layer(self, kind='fx', id=None):
        """A canvas: fx draws under the HUD, fxtop over it."""
        return self.add(el('canvas', cls=kind, id=id))

    def hud(self, path):
        """The HUD alone over transparency (hudsplit.py), over the fx layer; words keep off it."""
        return self.add(img(path, png=True, cls='hudl', alt=''))

    def word(self, text, at, sub=None, color=None, leader=True, prefer=None, gap=None, when=None):
        """A word over the world on a dark plate, placed clear of the HUD, kept things and other words."""
        return self.add(el('div', text, *([el('small', sub)] if sub else []), cls='wtag', data_anchor=f'{at[0]},{at[1]}',
                           data_leader=leader, data_prefer=prefer, data_gap=gap, data_when=when,
                           style=f'--c:{color}' if color else None))

    def mock(self, *markup, when=None, cls=None, **attrs):
        """The drawn mock: the one place a page writes its own markup (raw HTML strings, or els,
        such as action() buttons)."""
        body = [m if isinstance(m, El) else raw(m) for m in markup]
        return self.add(el('div', *body, cls=cls, data_when=when, **attrs))

    def action(self, words, set=None, toast=None, replay=False, cls='kbtn', when=None):
        """A button inside the stage that sets picks ("sit=report rpt=feature"), flashes a line, or replays."""
        return el('button', words, cls=cls, data_set=set, data_toast=toast, data_replay=replay, data_when=when)


class Page:
    def __init__(self, title, round=None, sub=None, heading=None, width=None, app_css=True, assets='.'):
        """title: the browser title and the page's name in every send; round: the review round (a new
        one starts the saved picks afresh); sub: the line under the heading; app_css: the project's
        @@APP_CSS@@ (its add-on) for mocks drawn from the app's own classes; assets: the folder
        pictures and files are read from."""
        self.title, self.round_n, self.assets = title, round, Path(assets)
        self.css_, self.js_, self.late_, self.head_, self.parts, self.app_css = [], [], [], [], [], app_css
        self.lineup = None
        self.root = el('div', cls='page', style=f'max-width:{width}px' if width else None)
        self.root.add(el('h1', heading or title.upper(), *([el('small', sub)] if sub else [])))
        self.at = [self.root]
        self.items_ = []

    # ---- where things go
    @property
    def here(self):
        return self.at[-1]

    def add(self, *kids):
        """Anything built with el(), at the current place."""
        return self.here.add(*kids)

    @contextmanager
    def into(self, box):
        """Components called inside the block go into box (a column, an item, a box of your own)."""
        self.at.append(box)
        try:
            yield box
        finally:
            self.at.pop()

    def columns(self, template='minmax(0, 1fr) 360px'):
        """Side-by-side columns (one under another on a narrow page). Returns the row; row.cells holds
        one box per column, for `with p.into(row.cells[0]):`."""
        n = len(re.findall(r'(?:[\w.%-]+\([^)]*\)|[^\s()]+)', template))
        row = self.add(el('div', cls='kcols', style=f'--cols:{template}'))
        row.cells = [row.add(el('div')) for _ in range(n)]
        return row

    def part(self, name):
        if name not in self.parts:
            self.parts.append(name)

    # ---- words
    def lede(self, text):
        """The intro paragraph: what changes, what can be clicked, which numbers are examples."""
        return self.add(el('p', text, cls='lede'))

    def h2(self, text):
        """A section head."""
        return self.add(el('h2', text))

    def hint(self, text):
        return self.add(el('p', text, cls='hint'))

    def round(self, changed='', new='', dropped='', words=None):
        """The round banner: what changed since the last round, by label; each label jumps to its item."""
        return self.add(el('div', *([el('p', words)] if words else []), cls='round', data_round=self.round_n,
                           data_changed=changed, data_new=new, data_dropped=dropped))

    # ---- pickers and the stage
    def controls(self, sticky=False):
        """A row of pickers: .choice() and .toggle() on what it returns."""
        return self.add(Controls('div', cls='controls sticky' if sticky else 'controls'))

    def stage(self, size='1440x900', keepout=None, bar=True, cls=None, **attrs):
        """The app's window at 1:1 (size "WxH"), fit to narrow pages. Draw into it with .bg, .layer,
        .hud, .word and .mock. keepout: "x0,y0,x1,y1;..." boxes no word may cover."""
        st = Stage('div', cls='stage' + (f' {cls}' if cls else ''), data_size=size, data_keepout=keepout, **attrs)
        self.add(el('div', st, cls='stagebox', data_nobar=not bar))
        return st

    def player(self, id='player', length=10, speeds=(1,), speed=None, phases=(), draw=None):
        """Play once, pause, speeds, a scrub bar and a caption per phase. draw: the JS of a function
        that draws the stage at t seconds, e.g. "t => window.draw(t)"; it runs after the page's js()."""
        box = self.add(el('div', id=id))
        opts = {'length': length, 'speeds': list(speeds), 'speed': speed or speeds[0], 'phases': [list(p) for p in phases]}
        js = json.dumps(opts)[:-1] + (f', "draw": {draw}' if draw else '') + '}'
        self.late_.append(f"Mock.player('#{id}', {js});")
        return box

    # ---- items
    def item(self, label, name, points=(), asks='more', when=None, today=False, verdict=False, words=None):
        """A note card the reviewer picks on: its label, what it is, the asks that fit (more clarify
        context animate, or ''), and verdict=True for Keep / Change / Drop (or your own words)."""
        host = self.here
        last = host.kids[-1] if host.kids else None
        notes = last if isinstance(last, El) and last.attrs.get('class') == 'notes' else host.add(el('div', cls='notes'))
        pickrow = el('div', _verdict_seg(label.lower(), verdict), cls='pickrow') if verdict else None
        n = Item('div', el('h3', name), cls='note today' if today else 'note', data_item=label, data_asks=asks,
                 data_when=when, pickrow=pickrow)
        if words:
            n.add(el('p', words))
        if points:
            n.add(el('ul', *[el('li', p) for p in points]))
        self.items_.append((label, name))
        return notes.add(n)

    def pitch(self, label, name, one, rows=None, art=None, cap=None, tags=(), question=None, asks='more',
              verdict=('Build', 'Later', 'No'), bars=None, when=None):
        """One idea per card: a picture (a path, img(), or raw SVG) beside What/How/Get rows, an open
        question and a verdict (Build / Later / No by default; True for Keep / Change / Drop).
        tags: (words, 'rec' | 'big' | '') chips by the name."""
        host = self.here
        last = host.kids[-1] if host.kids else None
        box = last if isinstance(last, El) and last.attrs.get('class') == 'pitches' else host.add(el('div', cls='pitches'))
        body = el('div', el('header', el('h3', name), *[el('span', t, cls='tag ' + c if c else 'tag') for t, c in tags]),
                  el('p', one, cls='one'), cls='body')
        if bars:
            body.add(self._bars(bars))
        if rows or question:
            dl = body.add(el('dl'))
            for k, v in (rows or {}).items():
                dl.add(el('dt', k), el('dd', v))
            if question:
                dl.add(el('dt', 'Open question', cls='q'), el('dd', question))
        if verdict:
            body.add(el('div', el('span', name.upper()), _verdict_seg(label.lower(), verdict), cls='pickrow'))
        a = el('div', cls='art')
        if art is not None:
            a.add(art if isinstance(art, (El, raw)) else img(art, alt=name, w=680))
        if cap:
            a.add(el('p', cap, cls='cap'))
        self.items_.append((label, name))
        return box.add(el('article', a, body, cls='pitch', data_item=label, data_asks=asks, data_when=when))

    def answer(self, item, title, steps, tag='CLARIFIED'):
        """Under an item, after a Clarify (steps) or Show me in context (tag='IN CONTEXT ADDED') press.
        A step is words, or (words, picture path)."""
        lis = [el('li', s[0], img(s[1], w=640)) if isinstance(s, tuple) else el('li', s) for s in steps]
        return item.add(el('section', el('h4', title, ' ', el('span', tag, cls='tag done')),
                           el('ol', *lis, cls='steps'), cls='answer'))

    # ---- numbers
    def _bars(self, rows, good=False):
        top = max(abs(float(r[1])) for r in rows) or 1
        out = el('div', cls='bars good' if good else 'bars')
        for r in rows:
            n, v = r[0], float(r[1])
            shown = r[2] if len(r) > 2 and r[2] is not None else r[1]
            out.add(el('div', el('span', n), el('div', el('i', style=f'--v:{round(100 * abs(v) / top)}%'), cls='bar'),
                       el('b', shown), cls='row', data_when=r[3] if len(r) > 3 else None))
        return out

    def bars(self, rows, good=False):
        """One number across options, a row each: (name, value[, words shown[, when]])."""
        return self.add(self._bars(rows, good))

    def stats(self, head, rows, pick_rows=True):
        """A stat table. rows: (label, name, [value or (value, was), ...][, asks]); a value differing
        from its was shows "was → now", marked; pick_rows gives each labelled row Keep / Change / Drop."""
        body = el('tbody')
        for r in rows:
            label, name, vals = r[:3]
            tr = body.add(el('tr', el('th', name), data_item=label, data_asks=r[3] if len(r) > 3 else None))
            for v in vals:
                tr.add(el('td', v[0], data_was=v[1]) if isinstance(v, tuple) else el('td', v))
            if label:
                self.items_.append((label, name))
        return self.add(el('table', el('thead', el('tr', *[el('th', h) for h in head])), body, cls='stats',
                           data_pick_rows=pick_rows))

    # ---- pictures and motion
    def compare(self, before, after, labels=('TODAY', 'MOCK-UP'), w=1440):
        """A drag slider between two captures."""
        return self.add(el('div', img(before, alt=labels[0], w=w), img(after, alt=labels[1], w=w), cls='compare',
                           data_before=labels[0], data_after=labels[1]))

    def stills(self, shots):
        """A gallery that opens each still at 1:1. shots: (path, NAME, caption)."""
        return self.add(el('div', *[el('figure', el('img', alt=n, src=raw(f'@@IMG:{p}|w=720@@'), data_full=raw(f'@@IMG:{p}@@')),
                                       el('figcaption', el('b', n), c)) for p, n, c in shots], cls='stills'))

    def flip(self, strip, frames, fps, alt=''):
        """Real frames of the app (strip.py) played once at their own rate; Animate on its item plays it."""
        return self.add(el('div', cls='flip', data_src=raw(f'@@IMG:{strip}|q=82@@'), data_frames=frames, data_fps=fps, data_alt=alt))

    def inset(self, shot=None, at=(0, 0), zoom=4, size='720x360', cap=None, live=False, stage=None, id=None):
        """A close-up of a capture round one stage spot; live=True follows the first stage (or stage="#id")
        every frame instead. A canvas.fx inside takes drawing over it."""
        box = el('div', cls='inset live' if live else 'inset', data_at=f'{at[0]},{at[1]}', data_zoom=zoom,
                 data_size=size, data_stage=stage, id=id)
        if not live:
            box.add(img(shot, png=True), el('canvas', cls='fx'))
        if cap:
            box.add(el('span', cap, cls='cap'))
        return self.add(box)

    # ---- the starters' components
    def sprites(self, path='sprites.json', id='sprites'):
        """A project's baked sprites (sprites.json) for Mock.sprites / Mock.sprite on any canvas."""
        return self.add(el('script', raw(f'@@FILE:{path}@@'), type='application/json', id=id))

    def costs(self, data, id='chart', src='costs', item=None, name=None):
        """A cost chart: data is the chart's JSON (a dict, or a path to a .json file); item labels it."""
        self.part('COSTS')
        body = raw(f'@@FILE:{data}@@') if isinstance(data, (str, Path)) else raw(json.dumps(data).replace('</', '<\\/'))
        box = self.add(el('div', cls='costchart', id=id, data_src=src, data_item=item, data_name=name))
        self.add(el('script', body, type='application/json', id=src))
        if item:
            self.items_.append((item, name or (data.get('title', '') if isinstance(data, dict) else '')))
        return box

    def perf(self, data, logs=None, passes=()):
        """A perf comparison: data is the JSON (targets, pairs); logs {script id: log path} for the
        pairs' runs; passes: (log path, scene name, where measured) pass-skip sweeps. Scene rows are
        items S1, S2... in data order."""
        self.part('PERF')
        self.add(el('div', cls='ptargets'), el('div', id='perfTiles'))
        self.h2('EVERY SCENE')
        self.add(el('div', id='perfTable'))
        self.h2('ONE SCENE, FRAME BY FRAME')
        self.add(el('div', cls='controls', id='perfPicks'), el('div', id='perfDetail'))
        if passes:
            self.h2('WHERE THE TIME GOES')
            self.add(el('div', id='perfPasses'))
        self.add(el('script', raw(json.dumps(data, indent=1).replace('</', '<\\/')), type='application/json', id='perf'))
        for sid, path in (logs or {}).items():
            self.add(el('script', raw(f'@@FILE:{path}@@'), type='text/plain', cls='perflog', id=sid))
        for path, scene, measured in passes:
            self.add(el('script', raw(f'@@FILE:{path}@@'), type='text/plain', cls='perfpasses', data_scene=scene, data_measured=measured))
        for i, pr in enumerate(data.get('pairs', [])):
            self.items_.append((pr.get('item') or f'S{i + 1}', pr.get('scene', '')))

    def sizes(self, words, sprites='sprites.json', heading='SIZE LINEUP', send='SEND SIZES'):
        """A size lineup: the whole page is every item at true scale (README: Size lineups). It takes
        the place of every other component; words is the line under the heading."""
        self.part('SIZES')
        self.lineup = (words, sprites, heading, send)
        try:
            d = json.loads((self.assets / sprites).read_text())
            self.items_ += [(i['id'], ' · '.join(x for x in (i.get('name'), i.get('use')) if x)) for i in d.get('items', [])]
        except (OSError, ValueError, KeyError):
            pass  # bundle() reads the file again and fails there with the reason

    def _lineup(self):
        words, sprites, heading, send = self.lineup
        zoom = el('div', el('button', '−', cls='kbtn', id='zout', type='button', aria_label='Zoom out'), el('output', id='zread'),
                  el('button', '+', cls='kbtn', id='zin', type='button', aria_label='Zoom in'),
                  el('button', 'FIT ALL', cls='kbtn', id='zfit', type='button'),
                  el('button', 'Names', cls='tog', id='znames', type='button', aria_pressed='true'), cls='szoom', role='group', aria_label='View')
        dock = el('section', el('div', el('b', cls='ilabel'), el('div', el('h2', id='sname'), el('div', cls='suse', id='suse')), cls='shead'),
                  el('div', el('input', id='sk', type='range', min='-200', max='200', step='1', value='0', aria_label='Size, ×¼ to ×4'),
                     el('input', id='slen', type='number', min='0.1', step='0.1', aria_label='Length in world units'), cls='srow'),
                  el('div', id='snums'),
                  el('div', el('button', cls='kbtn', id='ssame', type='button', hidden=True), el('button', cls='kbtn', id='smatch', type='button', hidden=True),
                     el('button', 'Add on tap', cls='tog', id='smulti', type='button', aria_pressed='false'), cls='srow', id='smrow'),
                  el('div', el('button', 'RESET', cls='kbtn', id='sreset', type='button'), el('button', 'HIDE ITEM', cls='kbtn', id='shideit', type='button'),
                     el('span', el('button', 'Tell me more', cls='kbtn kask', type='button', data_ask='more'), el('span', cls='ok'), cls='kasks'),
                     el('button', 'CLOSE', cls='kbtn', id='sclose', type='button', style='margin-left:auto'), cls='srow'),
                  cls='sfloat', id='sdock', data_item='', data_name='', data_asks='more', hidden=True, aria_live='polite')
        picks = el('div', el('div', el('h3', 'SIZE CHANGES'), el('button', 'HIDE', cls='kbtn shide', id='sfold', type='button', aria_expanded='true'), cls='srow'),
                   el('pre'), el('div', el('button', send, cls='kbtn send', data_send=True),
                                  el('button', 'Voice notes follow in chat', cls='tog', data_notes=True, aria_pressed='true'),
                                  el('button', 'COPY', cls='kbtn gold', data_copy=True), el('button', 'UNDO ALL', cls='kbtn', id='sundo', type='button'),
                                  el('span', cls='ok'), cls='row'), cls='picks sfloat')
        return (el('canvas', id='sky', aria_label='Every item at true scale. Drag to pan, scroll or pinch to zoom, click one to resize it.').render()
                + el('div', el('div', el('h1', heading), el('p', words), cls='sbrand'), zoom, cls='stop').render()
                + dock.render() + picks.render()
                + el('script', raw(f'@@FILE:{sprites}@@'), type='application/json', id='sizes').render())

    # ---- the send box, and the page's own extras
    def picks(self, format=None, heading='YOUR PICKS', send='SEND PICKS'):
        """The picks. Standalone it is the copy box with SEND PICKS and COPY; on the board the board's
        own send bar takes its place. format: "THING: {layout}; {motion}" ({items} by default)."""
        box = el('div', el('h3', heading), el('pre', data_format=format),
                 el('div', el('button', send, cls='kbtn send', data_send=True),
                    el('button', 'Voice notes follow in chat', cls='tog', data_notes=True, aria_pressed='true'),
                    el('button', 'COPY', cls='kbtn gold', data_copy=True), el('span', cls='ok'), cls='row'),
                 cls='picks')
        host = self.here
        last = host.kids[-1] if host.kids else None
        if isinstance(last, El) and last.attrs.get('class') == 'notes':
            host.kids.pop()
            return host.add(el('div', last, box, cls='below')).kids[-1]
        return host.add(box)

    def css(self, text):
        """The page's own CSS, after the kit's (new rules only: mocks use the app's classes)."""
        self.css_.append(text)

    def js(self, text):
        """The page's own script, run after the kit, inside its own (() => { ... })()."""
        self.js_.append(text)

    def head(self, markup):
        """Markup for the head, such as a font link."""
        self.head_.append(markup)

    def items(self):
        """[(label, name)] of every item, in page order."""
        return list(self.items_)

    # ---- output
    def render(self, hosted=False):
        """The page source with placeholders. hosted=True leaves out the head a framing board writes."""
        parts = [p for p in ('PERF', 'SIZES', 'COSTS') if p in self.parts]
        css = '\n'.join(['@@APP_CSS@@'] * bool(self.app_css) + ['@@KIT_CSS@@'] + [f'@@{p}_CSS@@' for p in parts] + self.css_)
        page_js = ''.join(f'\n<script>\n(() => {{\n{j}\n}})();\n</script>' for j in self.js_ + self.late_)
        body = self._lineup() if self.lineup else self.root.render()
        top = '' if hosted else '<meta charset="utf-8">\n'
        return (f'{top}<title>{esc(self.title)}</title>\n'
                + ('' if hosted else '<meta name="claude:viewport-fit-sides" content="cover">\n')
                + (f'<meta name="mock-round" content="{esc(self.round_n)}">\n' if self.round_n is not None else '')
                + ''.join(self.head_) + f'<style>\n{css}\n</style>\n\n' + body + '\n\n<script>\n@@KIT_JS@@\n</script>'
                + ''.join(f'\n<script>\n@@{p}_JS@@\n</script>' for p in parts) + page_js + '\n')

    def save(self, path='page.html'):
        """The standalone source: `python3 $KIT/build.py page.html` inlines it for shot.js."""
        Path(path).write_text(self.render())
        return path

    def bundle(self, out=None, addons=()):
        """The hosted content and its pictures: (html, {name: bytes}). With out, also written there as
        content.html, files/ and page.json (what publish() sends)."""
        sys.path.insert(0, str(KIT))
        import build
        files = {}

        def picture(spec, base):
            path, *opts = spec.split('|')
            kw = {'png': 'png' in opts, 'webp': 'webp' in opts}
            for o in opts:
                k, _, v = o.partition('=')
                if k in ('w', 'q'):
                    kw[k] = int(v)
                elif k == 'crop':
                    kw['crop'] = tuple(int(n) for n in v.split(','))
            data, ext = picture_bytes(base / path, **kw)
            stem = re.sub(r'[^a-z0-9]+', '-', Path(path).stem.lower()).strip('-')[:60] or 'pic'
            name = f'{stem}-{hashlib.sha1(data).hexdigest()[:8]}.{ext}'
            files[name] = data
            return f'files/{name}'

        text = build.expand(self.render(hosted=True), self.assets / 'page.html', self.assets, addons, img=picture,
                            keep=build.KIT_PARTS)
        if len(text.encode()) > PAGE_MAX:
            raise SystemExit(f'the hosted page is {len(text.encode()) // 1024} KB, over the board\'s {PAGE_MAX // 1024} KB: '
                             'move big data into pictures or trim it')
        if out:
            out = Path(out)
            (out / 'files').mkdir(parents=True, exist_ok=True)
            (out / 'content.html').write_text(text)
            for n, b in files.items():
                (out / 'files' / n).write_bytes(b)
            (out / 'page.json').write_text(json.dumps(self.meta(), indent=1))
        return text, files

    def meta(self, ask='', by=''):
        return {'title': self.title, 'round': self.round_n,
                'items': [{'label': lab, 'name': n} for lab, n in self.items_], 'ask': ask, 'by': by}

    def publish(self, slug, ask, card=None, by=None, board=None, token=None, addons=()):
        """Uploads the page to the board for review: its pictures, then the page. The board is
        $KANBAN_URL (its API base) with $KANBAN_TOKEN; card is the calling thread's card (else
        $KANBAN_CARD); slug names the page across rounds; ask is the one line the card shows
        ("Pick on the page: <ask>"). Returns the board's answer."""
        board = (board or os.environ.get('KANBAN_URL', '')).rstrip('/')
        token = token or os.environ.get('KANBAN_TOKEN', '').strip()
        card = card or os.environ.get('KANBAN_CARD', '').strip()
        if not board or not token or not card:
            raise SystemExit('publish needs the board (KANBAN_URL), its token (KANBAN_TOKEN) and the card (card= or KANBAN_CARD)')
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,59}', slug):
            raise SystemExit(f'slug {slug!r}: lower-case letters, digits and dashes')
        if self.round_n is None:
            raise SystemExit('publish needs Page(round=N)')
        bad = [lab for lab, _ in self.items_ if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]{0,11}', lab)]
        if bad or not 1 <= len(self.items_) <= 40:
            raise SystemExit(f'the board takes 1 to 40 items with short labels (E1, S2, A): {bad or len(self.items_)}')
        text, files = self.bundle(addons=addons)
        base = f'{board}/pages/{card}/{slug}'
        for name, data in files.items():
            _call('PUT', f'{base}/files/{name}?r={self.round_n}', token, data, CTYPE[name.rsplit('.', 1)[1]])
        body = dict(self.meta(ask, by or os.environ.get('KANBAN_BY', '') or card), html=text)
        return _call('PUT', base, token, json.dumps(body).encode(), 'application/json')

    def cli(self, argv=None):
        """The end of a make.py: no arguments writes page.html beside it; --out FILE writes the source
        there; --hosted DIR writes what publish sends; --publish SLUG --ask WORDS [--card ID] uploads."""
        ap = argparse.ArgumentParser()
        ap.add_argument('--out', default='page.html')
        ap.add_argument('--hosted')
        ap.add_argument('--publish', metavar='SLUG')
        ap.add_argument('--ask', default='')
        ap.add_argument('--card')
        a = ap.parse_args(argv)
        if a.publish:
            print(json.dumps(self.publish(a.publish, a.ask, card=a.card)))
        elif a.hosted:
            self.bundle(a.hosted)
            print(a.hosted)
        else:
            print(self.save(a.out))


CTYPE = {'png': 'image/png', 'jpg': 'image/jpeg', 'webp': 'image/webp', 'json': 'application/json', 'txt': 'text/plain'}


def picture_bytes(path, w=None, q=84, crop=None, png=False, webp=False):
    """A picture as build.py would inline it, as (bytes, extension)."""
    from PIL import Image
    im = Image.open(path)
    if crop:
        x, y, cw, ch = crop
        im = im.crop((x, y, x + cw, y + ch))
    if w and im.width != w:
        im = im.resize((w, round(w * im.height / im.width)), Image.LANCZOS)
    b = io.BytesIO()
    if webp:
        im.save(b, 'WEBP', quality=q or 84, method=4)
    elif png:
        im.save(b, 'PNG', optimize=True)
    else:
        im.convert('RGB').save(b, 'JPEG', quality=q or 84)
    return b.getvalue(), 'webp' if webp else 'png' if png else 'jpg'


def _call(method, url, token, data, ctype):
    req = urllib.request.Request(url, method=method, data=data,
                                 headers={'Authorization': 'Bearer ' + token, 'Content-Type': ctype})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        said = e.read()[:400].decode('utf-8', 'replace')
        raise SystemExit(f'{method} {url.split("/pages/", 1)[-1]}: the board answered {e.code}: {said}')
