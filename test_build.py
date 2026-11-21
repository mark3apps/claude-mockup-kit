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
        # Keep the sibling-repo scan off the real clones: a stand-in kit beside the test's repos.
        self.kit = build.KIT
        build.KIT = self.root / 'kit'
        build.KIT.mkdir()
        (build.KIT / 'standin.css').write_text((self.kit / 'standin.css').read_text())

    def tearDown(self):
        build.KIT = self.kit
        os.environ.pop('MOCKUP_ADDONS', None)
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

    def test_given_addon_replaces_the_search(self):
        addon(self.root / 'app/.claude/mockup-addon.py', "PLACEHOLDERS = {'X': lambda a, b: 'found', 'Y': lambda a, b: 'y'}\n")
        given = addon(self.root / 'given.py', "PLACEHOLDERS = {'X': lambda a, b: 'given'}\n")
        self.assertEqual(build.build(self.page('app/page.html', '@@X@@'), addons=[str(given)]), 'given')
        with self.assertRaises(SystemExit):
            build.build(self.page('app/page2.html', '@@Y@@'), addons=[str(given)])

    def test_first_sorted_sibling_wins_a_clash(self):
        addon(self.root / 'a-app/.claude/mockup-addon.py', "PLACEHOLDERS = {'X': lambda a, b: 'a'}\n")
        addon(self.root / 'b-app/.claude/mockup-addon.py', "PLACEHOLDERS = {'X': lambda a, b: 'b'}\n")
        self.assertEqual(build.build(self.page('scratch/page.html', '@@X@@')), 'a')

    def test_empty_env_means_no_addons(self):
        addon(self.root / 'app/.claude/mockup-addon.py', "PLACEHOLDERS = {'APP_CSS': lambda a, b: 'game'}\n")
        os.environ['MOCKUP_ADDONS'] = ''
        self.assertIn('.stage .panel', build.build(self.page('app/page.html', '@@APP_CSS@@')))

    def test_env_addon(self):
        os.environ['MOCKUP_ADDONS'] = str(addon(self.root / 'env.py', "PLACEHOLDERS = {'E': lambda a, b: 'env'}\n"))
        self.assertEqual(build.build(self.page('p/page.html', '@@E@@')), 'env')

    def test_app_css_falls_back_to_standin(self):
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
