"""Tests for build.py's add-on loading: python3 -m unittest test_build (check.sh runs it)."""
import os
import tempfile
import unittest
from pathlib import Path

import build


def addon(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    return path


class Addons(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.old = os.environ.pop('MOCKUP_ADDONS', None)
        # Keep the sibling-repo scan off the real /home/user clones.
        self.kit = build.KIT
        build.KIT = self.root / 'kit'

    def tearDown(self):
        build.KIT = self.kit
        if self.old is not None:
            os.environ['MOCKUP_ADDONS'] = self.old
        self.tmp.cleanup()

    def page(self, rel, text):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
        return p

    def test_page_ancestor_addon_fills_its_placeholder(self):
        addon(self.root / 'app/.claude/mockup-addon.py', "PLACEHOLDERS = {'HELLO': lambda arg, base: 'hi ' + arg}\n")
        p = self.page('app/mock/r1/page.html', '@@HELLO:there@@')
        self.assertEqual(build.build(p), 'hi there')

    def test_sibling_repo_addon_found(self):
        addon(self.root / 'other-app/.claude/mockup-addon.py', "PLACEHOLDERS = {'X': lambda a, b: 'x'}\n")
        p = self.page('scratch/page.html', '@@X@@')
        self.assertEqual(build.build(p), 'x')

    def test_given_addon_wins_over_found(self):
        addon(self.root / 'app/.claude/mockup-addon.py', "PLACEHOLDERS = {'X': lambda a, b: 'found'}\n")
        given = addon(self.root / 'given.py', "PLACEHOLDERS = {'X': lambda a, b: 'given'}\n")
        p = self.page('app/page.html', '@@X@@')
        self.assertEqual(build.build(p, addons=[str(given)]), 'given')

    def test_env_addon(self):
        os.environ['MOCKUP_ADDONS'] = str(addon(self.root / 'env.py', "PLACEHOLDERS = {'E': lambda a, b: 'env'}\n"))
        try:
            self.assertEqual(build.build(self.page('p/page.html', '@@E@@')), 'env')
        finally:
            del os.environ['MOCKUP_ADDONS']

    def test_app_css_falls_back_to_standin(self):
        build.KIT = self.kit
        p = self.page('p/page.html', '@@APP_CSS@@')
        self.assertIn('.stage .panel', build.build(p))

    def test_unknown_placeholder_fails(self):
        with self.assertRaises(SystemExit):
            build.build(self.page('p/page.html', '@@NOPE@@'))

    def test_addon_placeholder_inside_file_is_filled(self):
        addon(self.root / 'app/.claude/mockup-addon.py', "PLACEHOLDERS = {'X': lambda a, b: 'x'}\n")
        self.page('app/part.css', 'a{@@X@@}')
        self.assertEqual(build.build(self.page('app/page.html', '@@FILE:part.css@@')), 'a{x}')


if __name__ == '__main__':
    unittest.main()
