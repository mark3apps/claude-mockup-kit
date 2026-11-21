# Mock-up kit

The kit Claude builds review pages from in any project: `README.md` is the guide for building a
page; this file is for changing the kit itself.

- Nothing here names one project, its people or its app. A project's capture tool, sprite baker,
  CSS and examples live in its own repo, reached through its `.claude/mockup-addon.py` (README:
  Project add-ons). A placeholder only one project needs belongs in that add-on, not in `build.py`.
- Pages run as published Artifacts and may run their scripts twice (a republish into an open
  window): keep page code inside `(() => { ... })()`, animate with `Mock.frame`, and build DOM with
  `createElement`/`replaceChildren`, never `innerHTML` with data.
- Before a PR, run `./check.sh`: the add-on tests, then every starter and example built and checked
  by `shot.js`. Look at the screenshots it prints the folder of for anything you changed.
- A new component goes in the README's Components table and in a starter or an example, so
  `check.sh` covers it.
- Projects run `main` straight from their clone, so a merge is a release: keep `main` building.
