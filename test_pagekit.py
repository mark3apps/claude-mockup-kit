"""Tests for pagekit and hosted.py: python3 -m unittest test_pagekit (check.sh runs it)."""
import contextlib
import io
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from PIL import Image

import hosted
import pagekit
from pagekit import Page, raw


class Builder(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        Image.new('RGB', (64, 40), (200, 30, 30)).save(self.dir / 'shot.png')
        self.old = os.environ.get('MOCKUP_ADDONS')
        os.environ['MOCKUP_ADDONS'] = ''

    def tearDown(self):
        if self.old is None:
            os.environ.pop('MOCKUP_ADDONS', None)
        else:
            os.environ['MOCKUP_ADDONS'] = self.old
        self.tmp.cleanup()

    def test_asks_twice(self):
        # Mark 11-25: the choices up top are his picks; an item picking on the same thing again is refused
        p = Page('Looks', round=1, assets=self.dir)
        p.controls().choice('look', 'LOOK', [('A', 'Look A'), ('B', 'Look B')])
        p.item('A', 'Look A', verdict=True)
        with self.assertRaises(SystemExit) as e:
            p.render()
        self.assertIn('asks again what the LOOK choice picks', str(e.exception))
        p = Page('Looks', round=1, assets=self.dir)
        p.controls().choice('look', 'LOOK', [('A', 'Look A'), ('B', 'Look B')])
        p.item('A', 'Look A')
        p.item('E1', 'Ring glow', verdict=True)
        self.assertIn('Ring glow', p.render())

    def page(self):
        p = Page('Looks <&>', round=2, sub='ROUND 2', assets=self.dir)
        p.lede('A & B')
        c = p.controls()
        c.choice('layout', 'LAYOUT', [('A', 'A · Card', 'layout A'), ('B', 'B', '')])
        st = p.stage('1440x900')
        st.bg('shot.png')
        st.mock('<div class="panel">drawn</div>', st.action('GO', set='layout=B'), when='layout=A')
        p.pitch('E1', 'Vine', 'One line.', art='shot.png', verdict=True, asks='more context')
        p.item('E2', 'Arc', ['a point'], verdict=('Build', 'No'))
        p.stats(['SHIP', 'HULL'], [('D1', 'Barge', [('200', '160')])])
        p.picks()
        return p

    def test_text_is_escaped_and_mock_is_not(self):
        h = self.page().render()
        self.assertIn('<title>Looks &lt;&amp;&gt;</title>', h)
        self.assertIn('A &amp; B', h)
        self.assertIn('<div class="panel">drawn</div>', h)
        self.assertIn('data-set="layout=B"', h)

    def test_items_in_page_order(self):
        self.assertEqual(self.page().items(), [('E1', 'Vine'), ('E2', 'Arc'), ('D1', 'Barge')])

    def test_item_pickrow_stays_last(self):
        p = Page('T', assets=self.dir)
        it = p.item('M1', 'Move', verdict=True)
        with p.into(it):
            p.hint('after the pick row was asked for')
        h = it.render()
        self.assertLess(h.index('class="hint"'), h.index('class="pickrow"'))

    def test_notes_and_picks_share_a_row(self):
        p = Page('T', assets=self.dir)
        p.item('A', 'A')
        p.picks()
        self.assertIn('<div class="below"><div class="notes">', p.render())

    def test_columns_count_top_level_tracks(self):
        p = Page('T', assets=self.dir)
        self.assertEqual(len(p.columns('minmax(0, 1fr) 360px').cells), 2)
        self.assertEqual(len(p.columns('1fr repeat(2, 1fr) 2fr').cells), 3)

    def test_player_runs_after_page_js(self):
        p = Page('T', assets=self.dir)
        p.player('pl', length=3, draw='t => window.draw(t)')
        p.js('window.draw = t => t;')
        h = p.render()
        self.assertLess(h.index('window.draw = t'), h.index("Mock.player('#pl'"))

    def test_standalone_source_has_the_kit_and_copy(self):
        h = self.page().render()
        for x in ('<meta charset="utf-8">', '@@KIT_CSS@@', '@@KIT_JS@@', '@@APP_CSS@@', 'data-copy'):
            self.assertIn(x, h)

    def test_bundle_keeps_kit_markers_and_uploads_pictures(self):
        out = self.dir / 'hosted'
        text, files = self.page().bundle(out)
        self.assertIn('@@KIT_CSS@@', text)
        self.assertIn('@@KIT_JS@@', text)
        self.assertNotIn('<meta charset', text)
        self.assertNotIn('data:image', text)
        self.assertEqual(len(files), 2)  # the backdrop as it is, the pitch art at w=680: one file each
        for name in files:
            self.assertRegex(name, r'^shot-[0-9a-f]{8}\.(png|jpg)$')
            self.assertIn(f'files/{name}', text)
            self.assertTrue((out / 'files' / name).is_file())
        meta = json.loads((out / 'page.json').read_text())
        self.assertEqual(meta['round'], 2)
        self.assertEqual([i['label'] for i in meta['items']], ['E1', 'E2', 'D1'])
        self.assertNotRegex(text.lower(), r'<(!doctype|html|head|body)[\s>/]')  # the board refuses a whole document

    def test_frame_fills_the_kit_and_marks_it_hosted(self):
        text, _ = self.page().bundle()
        doc = hosted.frame(text, base='/p/c/s/r2/')
        self.assertIn('<meta name="mock-host" content="board">', doc)
        self.assertIn('<base href="/p/c/s/r2/">', doc)
        self.assertNotIn('@@KIT_', doc)
        self.assertIn('window.Mock', doc)
        self.assertLess(doc.index('--k-page'), doc.index('max-width'))  # the kit's CSS before the page's

    def test_lineup_page_parts(self):
        (self.dir / 'sprites.json').write_text(json.dumps({'items': [{'id': 'D1', 'name': 'Dart', 'use': 'scout'}]}))
        p = Page('Sizes', round=1, assets=self.dir, app_css=False)
        p.sizes('words')
        h = p.render()
        self.assertIn('@@SIZES_CSS@@', h)
        self.assertIn('@@SIZES_JS@@', h)
        self.assertIn('id="sdock"', h)
        self.assertEqual(p.items(), [('D1', 'Dart · scout')])

    def test_publish_gives_the_full_link(self):
        # report #50: the bare relative view ended up on the board's API host, which 404s for the reviewer
        answer = {}

        class H(BaseHTTPRequestHandler):
            def do_PUT(self):
                self.rfile.read(int(self.headers['Content-Length']))
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(answer).encode())

            def log_message(self, *a):
                pass

        srv = HTTPServer(('127.0.0.1', 0), H)
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        old = {k: os.environ.pop(k, None) for k in ('KANBAN_VIEW', 'KANBAN_URL', 'KANBAN_TOKEN')}
        pub = lambda: self.page().publish('looks', 'pick', card='c', board=f'http://127.0.0.1:{srv.server_port}/api', token='t')
        try:
            answer.update(ok=True, view='/p/c/looks?r=2')
            self.assertNotIn('link', pub(), 'no url and no KANBAN_VIEW: no link on the API host')
            os.environ.update(KANBAN_URL=f'http://127.0.0.1:{srv.server_port}/api', KANBAN_TOKEN='t')
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                self.page().cli(['--publish', 'looks', '--ask', 'pick', '--card', 'c'])
            self.assertEqual(len(out.getvalue().splitlines()), 1, 'only the JSON answer')
            self.assertIn('KANBAN_VIEW', err.getvalue())
            answer.update(ok=True, view='/p/c/looks?r=2', url='https://board.example:8443/p/c/looks?r=2')
            self.assertEqual(pub()['link'], 'https://board.example:8443/p/c/looks?r=2')
            answer.pop('url')
            os.environ['KANBAN_VIEW'] = 'https://view.example:8443/'
            self.assertEqual(pub()['link'], 'https://view.example:8443/p/c/looks?r=2')
            os.environ.update(KANBAN_URL=f'http://127.0.0.1:{srv.server_port}/api', KANBAN_TOKEN='t')
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.page().cli(['--publish', 'looks', '--ask', 'pick', '--card', 'c'])
        finally:
            for k, v in old.items():
                os.environ.pop(k, None)
                if v is not None:
                    os.environ[k] = v
            srv.shutdown()
            srv.server_close()
            t.join(5)
        lines = out.getvalue().splitlines()
        self.assertEqual(lines[0], 'https://view.example:8443/p/c/looks?r=2')
        self.assertEqual(json.loads(lines[-1])['link'], lines[0])

    def test_publish_needs_board_token_and_card(self):
        for k in ('KANBAN_URL', 'KANBAN_TOKEN', 'KANBAN_CARD'):
            os.environ.pop(k, None)
        with self.assertRaises(SystemExit):
            self.page().publish('looks', 'pick one')

    def test_publish_refuses_a_bad_slug(self):
        with self.assertRaises(SystemExit):
            self.page().publish('Bad Slug', 'x', card='c', board='http://127.0.0.1:9', token='t')

    def test_publish_sends_pictures_then_the_page(self):
        seen = []

        class H(BaseHTTPRequestHandler):
            def do_PUT(self):
                body = self.rfile.read(int(self.headers['Content-Length']))
                seen.append((self.path, self.headers['Authorization'], self.headers['Content-Type'], body))
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"ok": true, "view": "/p/cmsg_1/looks?r=2"}')

            def log_message(self, *a):
                pass

        srv = HTTPServer(('127.0.0.1', 0), H)
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        try:
            got = self.page().publish('looks', 'Round 2: pick a braid', card='cmsg_1', by='cmsg_1',
                                      board=f'http://127.0.0.1:{srv.server_port}/api', token='tok')
        finally:
            srv.shutdown()
            srv.server_close()
            t.join(5)
        self.assertEqual(got['view'], '/p/cmsg_1/looks?r=2')
        self.assertEqual(len(seen), 3)
        for path, auth, ctype, _ in seen[:2]:
            self.assertRegex(path, r'^/api/pages/cmsg_1/looks/files/shot-[0-9a-f]{8}\.(png|jpg)\?r=2$')
            self.assertEqual(auth, 'Bearer tok')
        path, _, ctype, body = seen[2]
        self.assertEqual(path, '/api/pages/cmsg_1/looks')
        self.assertEqual(ctype, 'application/json')
        b = json.loads(body)
        self.assertEqual((b['title'], b['round'], b['ask'], b['by']), ('Looks <&>', 2, 'Round 2: pick a braid', 'cmsg_1'))
        self.assertEqual(b['items'][0], {'label': 'E1', 'name': 'Vine'})
        self.assertIn('@@KIT_JS@@', b['html'])

    def test_raw_svg_art_is_kept(self):
        p = Page('T', assets=self.dir)
        p.pitch('E1', 'V', 'one', art=raw('<svg viewBox="0 0 1 1"></svg>'))
        self.assertIn('<svg viewBox="0 0 1 1"></svg>', p.render())


if __name__ == '__main__':
    unittest.main()
