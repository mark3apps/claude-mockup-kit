# Mock-up kit

The kit Claude builds review pages from in any project: `README.md` is the guide for building a
page; this file is for changing the kit itself.

- Nothing here names one project, its people or its app. A project's capture tool, sprite baker,
  CSS and examples live in its own repo, reached through its `.claude/mockup-addon.py` (README:
  Project add-ons). A placeholder only one project needs belongs in that add-on, not in `build.py`.
- Pages run framed by a review board and may run their scripts
  twice: keep page code inside `(() => { ... })()`, animate with `Mock.frame`, and build DOM with
  `createElement`/`replaceChildren`, never `innerHTML` with data.
- Before a PR, run `./check.sh`: the add-on tests, then every starter and example built through pagekit and
  checked by `shot.js`, standalone and hosted. Look at the screenshots it prints the folder of for anything you changed.
- A new component is a `pagekit.py` method, a row in the README's Components table naming it, and a
  use in a starter or an example, so `check.sh` covers it standalone and hosted.
- Hosted (framed by a board, README: Hosted pages) the page has no storage and no same origin; its
  messages to the board are a contract the board's viewer relies on, so change them with that viewer.
- The `.html` starters are written by the `.py` ones: change the `.py`, then `python3 X.py --out X.html`.
- Projects run `main` straight from their clone, so a merge is a release: keep `main` building.
