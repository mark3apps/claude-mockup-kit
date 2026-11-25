# Mock-up kit

Use this to build interactive mock-up pages that a thread uploads to its project's review board for
review. A mock-up is one page. It draws the app's window at its real size over a capture from the
real app, and has clickable options and toggles. It shows every still on the same page; on the board
every item gets a pick row and a note line, and the board sends the picks and notes back to the
thread (Hosted pages). Labels on the page must match the words the picks use, so a sent pick maps
straight onto the build. The kit also has starters for pages with no stage: a size lineup, a cost chart and a perf
comparison.

Pages are built with `pagekit.py`: one function per component, so a page is a short Python script
(`make.py`) and never hand-written HTML. The drawn mock inside a stage is the one place a page writes
markup (`stage.mock`). The same script writes the hosted content a review board frames (Hosted
pages), and a standalone page that `build.py` and `shot.js` check locally. Only the board version is
ever shown to a reviewer: pages are never published as claude.ai Artifacts.

## Using it in a Claude project

Attach this repo to the Claude project as a second repo, beside the app's own. Every thread then has
a clone (here `KIT=/home/user/claude-mockup-kit`), and pages build straight from it: never copy the
kit into a project or a shared folder, so every project runs the same kit. A fix or a new component
comes back here as a PR.

What belongs to one project stays in that project's repo: how to capture the app, its sprite baker,
its examples, and an add-on that gives pages the app's own look (below). Work on a page in a scratch
folder, such as the project's shared folder, and keep the page source and its captures there.

## Project add-ons

A project gives pages its app's CSS, icons and fonts through placeholders of its own, defined in
`.claude/mockup-addon.py` in its repo:

```python
# .claude/mockup-addon.py: placeholders this project's pages can use
from pathlib import Path
import stage_css  # the kit's; build.py puts the kit on the path

REPO = Path(__file__).resolve().parents[1]

def app_css(arg, base):  # @@APP_CSS@@ or @@APP_CSS:REGEX@@ (only selectors matching REGEX)
    return stage_css.scoped((REPO / 'ui/app.css').read_text(), keep=arg or None)

PLACEHOLDERS = {'APP_CSS': app_css}
```

Each function takes the text after the colon (`''` for none) and the page's asset folder, and
returns the text to put in. `--addon FILE` (repeatable) and `$MOCKUP_ADDONS` (path-separated;
set but empty means none) name the add-ons outright. With neither, `build.py` takes
`.claude/mockup-addon.py` from the page's folder and every folder above it, then from every repo
beside the kit's clone (`/home/user/*/`); the first to define a name wins, and a clash prints a
warning (pass `--addon` to choose). An add-on is Python and runs at build time: only clone repos
you trust beside the kit. `@@APP_CSS@@` is the one name the kit's own pages use; without an add-on it
gives `standin.css`, so the template builds anywhere. `stage_css.scoped(css)` prefixes every rule
with `.stage`, turns `:root`/`html`/`body` into the stage, keeps `@keyframes` and `@media`, drops
`@font-face`, and rewrites `vw`/`vh` against the stage size. The page palette is `kit.css`'s
`--k-*` variables; an add-on can return a `:root { --k-... }` block to restyle it.

## Files

| File | What it is |
|---|---|
| `pagekit.py` | The builder: `Page` and one method per component (Components), `save`, `bundle`, `publish`, `cli` |
| `template.py` | The starter page. Copy it as `make.py`, then fill in every part marked EDIT |
| `perf.py` + `perf.css` + `perf.js` | The starter page for a perf comparison: fps and frame times before and after a fix, against a frame-rate floor and aim (see Perf pages) |
| `sizes.py` + `sizes.css` + `sizes.js` | The starter page for a size lineup: every item at true world scale, resizable, the changes sent as picks (see Size lineups) |
| `costs.py` + `costs.css` + `costs.js` | The starter page for a cost chart: prices as bars split by resource and part, every number editable on the chart (see Cost charts) |
| `template.html`, `perf.html`, `sizes.html`, `costs.html` | What each starter writes (`python3 template.py --out template.html`); `check.sh` fails when one is stale |
| `hosted.py` | Stdlib only: `frame(content, base)` turns hosted content into the document a board frames |
| `kit.css` | The page around the stage (pickers, notes, copy box, compare slider, stills, pitch cards) |
| `kit.js` | Reads the markup and runs the pickers, `data-when`, the copy box and the stage fit. Exposes `window.Mock` |
| `build.py` | Inlines the kit, the add-ons' placeholders and the pictures into one HTML file |
| `stage_css.py` | Scopes an app's CSS to `.stage`, for an add-on |
| `standin.css` | What `@@APP_CSS@@` gives without an add-on |
| `hudsplit.py` | Lifts the HUD off a capture into its own transparent picture, from a capture with the HUD and one without |
| `strip.py` | Stacks recorded frames into one tall picture for a flipbook |
| `check.sh` | Builds every starter and example through pagekit and runs `shot.js` on each, standalone and hosted, plus the tests: run it before a kit PR |
| `shot.js` | Checks a built page in Playwright: clicks every pick, shoots the stage, flags errors, sideways scroll and a page missing the review standard; `--hosted` checks a framed page's messages |
| `examples/pitch/make.py` | Two pitch cards with Build / Later / No verdicts; needs no captures |
| `examples/components/make.py` | A round banner, columns, a player driving a drawn stage, a live close-up and a stat table; needs no captures |
| `examples/sizes/` | Four made-up sprites the `sizes.py` starter is checked over |
| `examples/perf/` | Made-up frame logs the `perf.py` starter is checked over |

## Components

Build from these before writing anything new. Markup and script details are under Markup below.

| Component | pagekit | Hook | What it gives you |
|---|---|---|---|
| Page chrome | `Page(title, round, sub)`, `lede`, `h2`, `hint` | `.page`, `h1 small`, `h2`, `.lede`, `kbd` | Title, section heads and the intro paragraph in the kit's palette |
| Picker row | `controls(sticky)` | `.controls` (`.sticky`), `.ctl > span` | A labelled row of pickers; sticky keeps it on screen while scrolling |
| Choice | `controls().choice(key, label, options)` | `.seg[data-pick]` + `button[data-v]` | Pick one of several; each value lands in the copy box as its `data-say` |
| Toggle | `controls().toggle(key, label, words)` | `.tog[data-pick]` | An on/off pick with `data-say-on` / `data-say-off` |
| Stage | `stage(size)`, `.bg(path)` | `.stagebox > .stage[data-size]` + `img.bg` | The app's window at 1:1 over a capture, fit to narrow pages, with a VIEW 1:1 bar (on a phone: ZOOM 2×, VIEW 1:1, FIT, centred on what is drawn) |
| Phone layout | (automatic) | automatic under 700 px wide | The first stage moves above the `.controls` and stays at the top of the screen until the copy box has scrolled past, so a pick and its result show together; typing lets it go. Controls are 44 px high on touch screens, and text fields are 16 px so focusing one does not zoom the page |
| Conditional | `when=` on every function | `data-when="k=a,b !t"` | Shows any element only while the picks match |
| Stage actions | `stage.action(words, set, toast, replay)` | `data-set`, `data-toast`, `data-replay` | In-stage buttons that change picks, flash a line, or restart animations |
| App look | `Page(app_css=True)`, `stage.mock(markup)` | `@@APP_CSS@@` and the add-on's other placeholders | The app's own classes (`.panel`, `.menubtn`, ...) and icons inside the stage |
| Notes | `item(label, name, points)` | `.below > .notes > .note` (`.today`) | One card per option saying what changes; `.today` marks the app as it is |
| Item | `item`, `pitch`, `stats` rows | `[data-item="E2"]` (`data-name`) + `{items}` | Every thing the reviewer picks on: a gold label on its heading and a line in the copy box that starts with the label |
| Asks | `asks=` on `item`, `pitch`, `stats` rows | `data-asks="more clarify context animate"` on an item | The asks that fit the item: Tell me more, Clarify, Show me in context, Animate. Default `more`; `""` for none |
| Picks | `picks(format)` | `.picks pre[data-format]`, `.picks .row` | Hosted: nothing on the page (the board's send bar holds the picks and sends them). In the standalone check build: the picks as text with a COPY row, which `shot.js` checks |
| Answer box | `answer(item, title, steps, tag)` | `section.answer > h4` + `ol.steps`, `.tag.done` | Where a thread answers Clarify (steps) or Show me in context on the item, marked CLARIFIED / IN CONTEXT ADDED |
| Before/after | `compare(before, after, labels)` | `.compare[data-before][data-after]` with two `img` | A drag slider between two captures |
| Stills | `stills(shots)` | `.stills > figure > img[data-full]` | A gallery that opens each still at 1:1 |
| World effect layers | `stage.bg`, `stage.layer(kind)`, `stage.hud(path)` | `.bg` bare, `canvas.fx`, `img.hudl`, `canvas.fxtop` | An effect drawn into the world under the real HUD, and anything over it; see World effects |
| Pitch card | `pitch(label, name, one, rows, art, tags, question)` | `.pitches > article.pitch` (`.art`, `.body`, `.tag.rec/.big`, `.one`, `dl`, `dt.q`, `.pickrow`) | One idea per card for a feature pitch: a picture beside What/How/Get rows and an open question |
| Verdict | `verdict=` on `item`, `pitch` | `.seg[data-verdict]` (empty: Keep / Change / Drop; or your own buttons, as Build / Later / No) | A pick per item that starts unpicked; pressing the picked one again clears it. `{verdicts}` groups them as "Build A, B. Later C." |
| Inset | `inset(shot, at, zoom, size, cap)` | `.inset[data-at="x,y"][data-zoom]` + `img`, optional `canvas.fx`, `.cap` | A close-up of a capture round one spot (a small thing is a few pixels at 1:1), with a caption and room to draw over it |
| Live close-up | `inset(at=..., live=True)` | `.inset.live[data-at][data-zoom]` (`data-stage`) | The same close-up of an animated stage, redrawn every frame; move `data-at` to follow something |
| Player | `player(id, length, speeds, phases, draw)` | `Mock.player(el, { length, speeds, phases, draw })` | Play once to the end, pause, speeds, a scrub bar and a caption per phase for a scripted animation |
| Flipbook | `flip(strip, frames, fps)` | `.flip[data-src][data-frames][data-fps]` | Real frames of the app (`strip.py`) played once at their own rate, with pause and step; Animate on its item plays it |
| Stat table | `stats(head, rows, pick_rows)` | `table.stats` (`data-pick-rows`), `tr[data-item]`, `td[data-was]` | Numbers with yours beside the new values, changed cells marked, a label, pick and asks per row |
| Round banner | `round(changed, new, dropped, words)` | `.round[data-round][data-changed][data-new][data-dropped]` | What changed since the last round by label; each label jumps to its item, which gets a CHANGED / NEW tag |
| Bars | `bars(rows, good)`, `bars=` on `pitch` | `.bars > .row` (`span`, `.bar > i[style="--v:50%"]`, `b`) | One number compared across options, a row each; `.bars.good` turns the bars green |
| Perf comparison | `perf(data, logs, passes)` | `perf.html`: `script#perf` JSON, `script.perflog`, `script.perfpasses` | Every scene's before → after on one axis, one scene's runs frame by frame, and the ms each pass costs; see Perf pages |
| Size lineup | `sizes(words, sprites)` | `sizes.html`: `script#sizes` JSON from the project's sprite baker | Every item at true scale in group rows, pan and zoom, a dock to resize one, reference lines, and the changes as picks; see Size lineups |
| Cost chart | `costs(data, item)` | `.costchart[data-src=ID]` (`data-item`) + `script#ID` JSON | A price per row as a bar split by resource and part, grouped by tier, with drag handles, a chip palette, salvage squares, zoom and an editor; the changes are the picks; see Cost charts |
| Real sprites | `sprites(path)` | `Mock.sprite(ctx, sprite, x, y, angle, len)`, `Mock.sprites(list)` | The app's own pictures drawn on any canvas from `sprites.json`, instead of copied drawing code that drifts from the app |
| Words over the world | `stage.word(text, at, sub, color)` | `.wtag[data-anchor="x,y"]` (`data-leader`, `data-prefer`, `data-gap`, `--c`), `Mock.ship`, `Mock.keep`, `data-keepout`, `[data-keep]` | A name or note on a dark plate, placed clear of moving things, the HUD and other words; see Readable words |
| Keys and hooks | `js(text)`, `css(text)` | `Mock.on/set/keys/toast/replay/text/picks/extras/frame/layout/overlaps/player` | Script for behaviour the markup cannot express |
| Hosted note line | (automatic on the board) | `.knline > .ninp > textarea[data-note] + button.mic` | A note line under every item, with a mic and ⌘D; see Hosted pages |
| Columns | `columns(template)`, `into(box)` | `.kcols` (`--cols`) | Side-by-side boxes, one under another on a narrow page |

### Adding a component

When a mock-up needs something the kit lacks, build it inside your own page first, so the round is
not blocked. Once a second page wants it, generalise it into the kit in a PR to this repo: add it to
this table and to a starter or an example, and run `./check.sh`.

## Steps

1. **Capture.** Take stills (and, for motion, recorded frames) from the real app with the
   project's own capture tool; its repo says how. Capture the scene without the element being
   replaced where the tool can hide it, and a HUD-on and HUD-off pair for a world effect (World
   effects).
2. **Write the page.** Copy `$KIT/template.py` (or `perf.py`, `sizes.py`, `costs.py`) next to the
   captures as `make.py` and build the page from its calls; `python3 make.py` writes `page.html`.
   Draw the mock-ups in `stage.mock()` from the app's own classes (from the project's add-on), so
   they look like the app without extra CSS, and add only the rules that are new with `p.css()`.
3. **Build.** Run `python3 $KIT/build.py page.html`, which writes `page.built.html` and prints its
   size. The page must stay under 16 MB, so shrink stills with `|w=720`.
4. **Check.** Run `node $KIT/shot.js page.built.html out/`, then look at `out/*.png`. The run fails
   on a script error, when the page scrolls sideways at phone width, or when a page with a copy box
   has no `[data-item]`, an item without its label or asks, or no SEND PICKS and voice-notes toggle.
5. **Upload.** End `make.py` with `p.cli()` and upload it with the project's page command (in a
   project with the workflow kit: `slinger_hooks.py page cmsg_THREAD make.py SLUG "the ask"`, or
   `card.py page make.py SLUG "the ask"` in a personal session). It runs `make.py --publish`
   (Hosted pages), puts the card in Needs Mark and prints the page's board link for the thread's
   **Picks:** or **Question:** line. The next round is the same command with `Page(round=N+1)`.
6. **Answer.** The reviewer's picks, notes and asks come back as notes on the thread's board card,
   which its hooks show it at its next step. Tell me more: answer in chat, label first. Clarify and
   Show me in context: add an `answer()` to the item, tagged CLARIFIED / IN CONTEXT ADDED, and upload
   the next round. Animate: give the item a flipbook in the next round.

## The builder (`pagekit.py`)

```python
import sys; sys.path.insert(0, '/home/user/claude-mockup-kit')
from pagekit import Page, el, img, raw
p = Page('Tether Looks', round=3, sub='3 LOOKS · PICK KEEP, CHANGE OR DROP')
p.lede('What changes and what stays.')
c = p.controls(); c.choice('look', 'LOOK', [('A', 'A · Braid', 'look A'), ('B', 'B · Arc', 'look B')])
st = p.stage('1440x900'); st.bg('shots/01.png'); st.mock('<div class="panel">…</div>', when='look=A')
p.pitch('E1', 'Vine braid', 'A green-gold braid.', art='shots/vine.png', verdict=True, asks='more context')
p.picks()
p.cli()
```

- Every method returns what it made. Components called inside `with p.into(box):` go into that
  box (an item, a column from `p.columns('minmax(0, 1fr) 360px').cells[0]`); `el(tag, ...)` makes
  any other element. Text is escaped; `raw()` passes markup through (a picture's SVG).
- Pictures are `img(path, w=...)` or a path argument; `Page(assets=DIR)` is where they are read
  from (default: the folder `make.py` runs in).
- `p.cli()` ends a `make.py`: no arguments writes `page.html` (`--out FILE` elsewhere); `--hosted
  DIR` writes what a board gets (`content.html`, `files/`, `page.json`); `--publish SLUG --ask
  WORDS [--card ID]` uploads it.

## Hosted pages

A review board hosts every page: the thread uploads it, the board frames
it beside its own send bar, and the board sends the picks and notes back to the thread.

- `p.publish(slug, ask, card=None, by=None)` uploads to `$KANBAN_URL` (the board's API base) with
  `$KANBAN_TOKEN`: each picture to `PUT pages/<card>/<slug>/files/<name>?r=<round>`, then
  `PUT pages/<card>/<slug>` with `{title, round, html, items: [{label, name}], ask, by}`. `card`
  defaults to `$KANBAN_CARD`; `slug` (lower case, digits, dashes) names the page across rounds;
  `ask` is the one line the card shows. The board takes 1 to 40 items with short labels.
- The `html` is the page with every placeholder filled except the kit's own (`@@KIT_CSS@@`,
  `@@KIT_JS@@` and the perf, sizes and costs parts), and pictures as relative `files/<name>`. No
  pictures inlined, so no 16 MB limit; the page itself stays under 2 MB.
- The board serves the kit from this repo's main: The round is in `<meta name="mock-round">`. `hosted.frame(content, base)` fills those
  placeholders, adds `<meta name="mock-host" content="board">` and a `<base>` where `files/` is
  served. The board frames that document sandboxed (scripts, no same origin), so page script never
  reaches the board, and has no storage.
- A component whose changes are not picks registers `Mock.hostPart(name, {label, get, set, said})`
  (sizes.js and costs.js do), so its state travels in `parts` and comes back on `restore`.
- Hosted, kit.js shows no copy box or SEND PICKS (a size lineup keeps its list and UNDO ALL), puts
  the asks on each item's pick row, and gives every labelled item a note line with a mic (⌘D on a
  desktop). It talks to its parent only by `postMessage`:

| Way | Message | When |
|---|---|---|
| page → board | `{mockkit: 1, type: 'ready', v: 1, title, round, items: [{label, name}]}` | once the kit has started |
| page → board | `{type: 'state', picks, state, notes: {label: words}, parts, summary, picked, total, focus}` | after every pick, note and component change; `summary` reads `E1 Keep · E2 Change · E3 not picked yet`; `parts` is each component's own state (a size lineup's sizes, a cost chart's edits), which the board keeps with the draft and the sent round; `picked`/`total` count items with pickers plus one per such component; `focus` is the item dictation would write into |
| page → board | `{type: 'ask', item, name, ask, words, text}` | an ask pressed (Animate on an item with a flipbook plays it instead) |
| page → board | `{type: 'mic', item, key}` | the mic pressed, or ⌘D anywhere in the page (`key: true`) |
| page → board | `{type: 'key', key: 'Escape'}` | Esc the page itself does not use |
| board → page | `{mockshell: 1, type: 'restore', state, notes, parts}` | a draft or a sent round's picks, notes and component state |
| board → page | `{type: 'note', item, text}` | dictated words: the note's whole text so far |
| board → page | `{type: 'listen', item}` | that note box shows listening (red); `item: null` stops |
| board → page | `{type: 'mic', why}` | why dictation cannot work here (the mics dim and say it); `why: ''` clears it |
| board → page | `{type: 'asked', item, ask}` | the ask reached the thread: its button gets a ✓ |

`node $KIT/shot.js --hosted FRAME.html OUT/` frames a page this way over a local server that closes
when it ends, sends each of these, and fails when one does not go through.

## Markup

What pagekit writes, for reading a built page or adding a component.

```html
<div class="seg" data-pick="layout">                    <!-- one choice; first button (or aria-pressed="true") starts picked -->
  <button data-v="A" data-say="layout A">A · Corner card</button>
</div>
<button class="tog" data-pick="motion" aria-pressed="true" data-say-on="motion on" data-say-off="no motion">Slide in</button>

<div class="stagebox"><div class="stage" data-size="1440x900">   <!-- 1:1, fits narrow pages; VIEW 1:1 scrolls -->
  <img class="bg" data-when="layout!=today" src="@@IMG:shots/01-today.png@@" alt="">
  <div class="panel mk" data-when="layout=A,B motion">...</div>
</div></div>

<div class="picks"><h3>COPY FOR THE CHAT</h3>
  <pre data-format="THING: {layout}; {motion}"></pre>
  <div class="row"><button class="kbtn send" data-send>SEND PICKS</button><button class="tog" data-notes aria-pressed="true">Voice notes follow in chat</button><button class="kbtn gold" data-copy>COPY</button><span class="ok"></span></div></div>

<div class="note" data-item="A" data-asks="more clarify" data-when="layout=A"><h3>CORNER CARD</h3>   <!-- gets "A" and two asks -->
  <div class="pickrow"><div class="seg" data-pick="a" data-verdict></div></div></div>      <!-- Keep / Change / Drop, none picked -->
```

- An item is any element with `data-item="E2"`: a pitch card, a note, a table row, a scene row.
  The kit puts the label in a gold chip before its `h3`/`h2` (a row: its first cell) and its asks at
  the end of its `.body` or itself (a row: its last cell). Its name is `data-name`, else that
  heading. Keep labels short and unique on the page (E1, E2; A, B; S1...), since the reviewer names
  them in the chat. A page that draws items after load builds its own `.ilabel` and `.kasks`, as `perf.js`
  does for scene rows.
- Asks: offer only those that fit (a number gets Tell me more, a new look Show me in context, a
  dense idea Clarify, a still Animate). Each sends `Title · E2 Name` and what the ask means. Animate
  on an item holding a `.flip` plays it on the page with no send. Where the page cannot send, an ask
  copies its text for the chat instead.
- `{items}` is the default `data-format`: one line per item that holds picks, `E2 Name: Later`.
  Only `{items}` and `{verdicts}` add labels for you; a custom `data-format` or `Mock.picks` names
  them itself, as in `data-say="layout A"`.
- The standalone build's `.picks` row (COPY, and the older SEND PICKS markup `shot.js` still
  checks) exists for local checks only; a hosted page hides it and the board's send bar sends.
- `{verdicts}` in a `data-format` (or `say('verdicts')` in a custom `Mock.picks`) groups every
  `.seg[data-verdict]` by its pick in button order. Each is named by its item's label and name,
  else `data-verdict="..."`, else its card's `h3`.
- `data-when="layout=A,B bg!=dim motion !cheat"`: every space-separated term must hold. Notes,
  backdrops and mock panels all use it. Use it for anything that depends on a pick.
- Every `.stage` carries each pick as `data-<key>`, so CSS can target picks, as in
  `.stage[data-bg="blur"] .bg { filter: blur(6px) }`. A pick (or `data-set` key) cannot share a name
  with the stage's own attributes: `size`, and any `data-*` written on the `.stage` in the markup.
  The page stops with a red bar naming the pick, so rename it (`scale`, `panel-size`).
- In the copy box, `data-format` splits into items on `;`. Each `{key}` becomes that pick's
  `data-say` (or its label). An item whose key gives no words is dropped.
- Inside the stage, `data-set="sit=report rpt=feature"` sets state, which is useful for tabs
  inside the mock. `data-toast="OPENS SETTINGS"` flashes a line, and `data-replay` restarts the stage's
  animations.
- `<div class="compare" data-before="TODAY" data-after="LAYOUT A">` with two `<img>` gives a
  before/after slider. `<div class="stills">` with `<figure><img data-full="...">` builds a gallery
  that opens each still at 1:1.
- In script, `Mock.state` holds the picks, `Mock.set(k, v)` changes one, and
  `Mock.on((state, key) => ...)` runs after every change. `Mock.keys({ Escape: fn })` skips keys
  pressed while typing. `Mock.frame(t => ...)` animates, `Mock.toast(t)`, `Mock.replay()` and `Mock.text()` (the copy text) are also
  available. `Mock.picks = (state, say) => '...'` replaces the format. To keep state that is not a
  pick, set it on `Mock.state` before the page loads, as in `Mock.state.open = false`.

### Insets

```html
<div class="inset" data-at="725.8,459.8" data-zoom="4" data-size="720x360">
  <img alt="" src="@@IMG:shots/04-close.png|png@@">   <!-- the full capture; kit.js draws the crop -->
  <canvas class="fx"></canvas>                        <!-- optional: draw over the close-up -->
  <span class="cap">THE DOCK AT 4 ×</span>
</div>
```

`data-at` is the stage spot to centre on. A stage point lands in the
inset's canvas at `(x - at.x) * zoom + w/2`, `(y - at.y) * zoom + h/2`.

`.inset.live` (no `img`) copies the stage's `img.bg`, canvases and `img.hudl` every frame, so an
animation drawn on `canvas.fx` can be watched up close. It redraws when a player or `Mock.frame`
step, a pick or `data-at` changes, and only while on screen, so draw through those. Set `data-at` from your draw function to
follow something; `data-stage="#id"` picks a stage other than the first. DOM mock panels and
`.wtag` plates are not copied.

### Motion

Every animation stops on its own: it plays once per press and holds its last frame.

```js
Mock.player('#player', {           // an empty <div id="player"> under the stage
  length: 12, speeds: [0.25, 1, 4], speed: 1,
  phases: [[0, 'It leaves the lane.'], [4, 'The sun bends it round.']],
  draw: t => { /* draw the stage at t seconds */ },
});                                 // returns { play, pause, seek(t), t, playing }
```

A flipbook plays real frames of the app. Record them with the project's capture tool, stack them, and
point a `.flip` at the strip:

```sh
python3 $KIT/strip.py pics/fling.jpg out/frames/*.png --record 6 --w 640 [--crop x,y,w,h]   # every 6th of 60 frames: 10 a second
```

```html
<div class="flip" data-src="@@IMG:pics/fling.jpg|q=82@@" data-frames="84" data-fps="10" data-alt="The Fling plate"></div>
```

`strip.py` prints the `data-frames` and `data-fps` to use. JPEG stops at 65,500 px tall, so lower
`--w` or raise `--every` for long clips.

### Tables and rounds

```html
<div class="round" data-round="7" data-changed="E2 E5" data-new="E8" data-dropped="E4"><p>Optional words.</p></div>

<table class="stats" data-pick-rows>
  <thead><tr><th>CRAFT</th><th>HULL</th></tr></thead>
  <tbody><tr data-item="D2"><th>Barge</th><td data-was="160">200</td></tr></tbody>
</table>
```

A cell whose text differs from its `data-was` shows `160 → 200` and is marked. `data-pick-rows`
adds a PICK column with Keep / Change / Drop on every labelled row; the pick key is `row-` and the
label in lower case. A wide table scrolls inside its box, never the page. A new `data-round` also
starts the saved picks afresh.

### World effects

A storm, a fog or a field drawn into the world has to sit under the HUD. Capture each shot twice,
with the HUD shown and with it hidden, and `python3 $KIT/hudsplit.py BARE FULL OUT` turns each pair into the bare world (`NAME-bare.png`) and the HUD alone over transparency
(`NAME-hud.png`). Laid back over the bare frame, the HUD reproduces `NAME.png` to within a level.
Then stack the layers:

```html
<div class="stage" data-size="1440x900">
  <img class="bg" alt="" src="@@IMG:shots/front-bare.png@@">
  <canvas class="fx"></canvas>                                   <!-- the effect, under the HUD -->
  <img class="hudl" alt="" src="@@IMG:shots/front-hud.png|png@@">  <!-- |png keeps the alpha -->
  <canvas class="fxtop"></canvas>                                <!-- warnings, labels over the HUD -->
</div>
```

A canvas with no `width`/`height` gets the stage's size. To line the effect up with the world, have
the capture tool report the camera and where things sit on screen, and map world points to the stage
with it.

### Readable words

Every word over the app's world must stay readable: on a dark plate, and never over a moving thing,
the HUD or another word. The kit enforces it.

```html
<div class="wtag" data-anchor="812,430" data-leader style="--c:#7fe0ff">ORLA<small>CARGO BARGE</small></div>
```

```js
Mock.on(() => { Mock.ship(812, 430, 40, 'Orla'); Mock.ship(640, 520, 30, 'the patrol'); });
```

- `data-anchor` is the stage spot the word belongs to. After every pick the kit puts the plate in
  the nearest free spot round it: `data-prefer` orders the sides (default `right,left,below,above`),
  `data-gap` is the distance from the anchor (default 14), and `data-leader` draws a line back in
  the plate's `--c` colour.
- The HUD keeps itself clear: every opaque pixel of `img.hudl` (World effects) is out of bounds.
  Without a split capture, list the HUD's boxes on the stage as `data-keepout="x0,y0,x1,y1;..."`.
- `Mock.ship(x, y, len, name)` keeps a thing of that length round (x, y) clear for one render; `Mock.keep([x0,y0,x1,y1], name)`
  does the same for any box; `[data-keep]` keeps an element's own box. Call them from `Mock.on`, so
  they move with the picks.
- `Mock.overlaps()` lists every word that runs off the stage, has no plate (a background, or a
  filled SVG shape, at least .55 opaque), found no free spot, or sits over a kept box, the HUD or
  another word. `shot.js` runs it at start and after every pick, and fails with the list.
  `data-over-hud` lets a word sit on the HUD (a HUD mock-up's own text); `data-noplate` excuses one
  word from the plate rule.

## Size lineups

Getting sizes right is hard on a still, so a lineup puts every thing side by side at true world
scale.

A project bakes its sprites with its own tool, writing
`s/*.png` and `sprites.json` into a page folder; copy `$KIT/sizes.py` there as `make.py`, retitle
it, edit the EDIT words and build. `examples/sizes/` is a small made-up one.

- `sprites.json` holds `sprites` (`{src, w, h, ox, oy, ppu, design}`: picture size, the sprite's
  origin in it, px per unit, and the length it shows) and `items` (`{id, key, name, use, len, group,
  mine}`, one per use of a sprite, with a short unique label; `mine` marks the player's own). `ref` names
  the item the dock compares to; `lines` adds a row of dashed reference lengths. Add or relabel
  items there by hand for anything else with a size, giving each a `type`.
- FILTER opens a small menu: one tab per facet (`facets`, `[{key, name}]`, the item fields it
  offers), each value an item holds a chip. Chips in one facet widen (Pods or Haulers), facets
  narrow (and Stations), and a narrowed facet drops items without that field; the first pick switches ROWS from
  the `group` rows (Rows as set) to One row, smallest first; a row per facet value is the third
  choice. HIDE ITEM in the dock takes items off, listed in the menu to bring back. With no `facets`,
  `type` (or the group) is the filter; the reference `lines` always show. `view` (`{filt, rowsBy}`) is where a viewer
  with nothing saved starts and where RESET returns; the first chip picked from it starts afresh. The filter and hidden items are kept per viewer; the baker chooses the facets.
- The sky is a world grid; the bar shows its small square's size. FIT ALL wraps long rows and stands
  each line's items on one floor (a small craft sits at a moon's foot), picking the wrap that shows
  everything largest beside the open changes panel; with many rows or on a phone it fits the width
  and pans down. Zoom runs from whole skies to close-ups; far out, the tags and heads hide.
- Click an item for the dock: a slider ×¼ to ×4, the exact length, what it was and its ratio to
  `ref`, Reset, Hide item and Tell me more. Shift-, Ctrl- or Cmd-click (Add on tap on a touch screen)
  picks several: the slider scales them together, a length sets them all to it, SAME SIZE AS
  matches the rest to the first, and ALL N OF THESE picks every use of one sprite. SIZE
  CHANGES lists `N12 Name · use: 14.5 → 18.0 u (×1.24)` per
  change; SEND SIZES and COPY carry it like any picks, and the sizes stay in the viewer's browser
  until Undo all, kept by sprite, use and length (so a new bake that renumbers labels cannot move them) and
  started afresh by a new `data-round`.
  `Mock.sizeAt(id)` gives an item's screen point, for a test to click it.
- The sprites draw nose along +x. On any other page, put `sprites.json` in a `script` tag
  (`@@FILE:sprites.json@@`), then `Mock.sprites(list).then(() => Mock.ready(draw))`, where draw
  calls `Mock.sprite(ctx, sprites.KEY, x, y, angle, len)` for each: origin at (x, y), `len`
  canvas units long. Use it in place of a hand copy of the app's drawing code. `Mock.ready(fn)` runs fn once
  the kit has sized the stage's canvases (which clears them), or at once if it has.

## Cost charts

A cost chart lays every price out as bars, so a dear tier or a cheap outlier shows at a glance,
and the reviewer tunes the numbers on the chart itself. Copy `$KIT/costs.py`, or call `p.costs(data)` on any kit
page. Each `.costchart[data-src="ID"]` reads
`script#ID` (give the chart and the script different ids); several charts share one page and one
copy box.

- The JSON: `resources` (`{key, name, color}`, the pieces' order), `pips` (`{key, color, rarity,
  where}`, salvage drawn as squares under a part), `group` (`{name, min, max}`, the tier rows sort
  into), `kinds` (`{name, color}` per part kind, the line under each part and the legend), and
  `rows`: `{id, name, sub, group, segs}`, each part `{id, kind, label, group, costs, pips}`. A part
  with its own `group` is an Mk with its own tier (the row sorts by its first). A `fixed` part
  follows a rule (upgrade levels) and draws as one block in its kind's colour with no handles; a
  `placeholder` part is a dashed box with that word (found, never bought). `weights` counts a
  resource as that many of the first in totals; `pipWeight` gives salvage a length on the bar.
- On the chart: drag a piece's end to change that resource (to nothing removes it), the knob above
  a part to scale all of it, a run of squares' end to change the count; − and + move a row (every
  Mk) a tier; drop a palette chip on a part to add a resource or one salvage; click a name to type
  every number. Hold and drag the empty chart to zoom (up and down) and slide; a finger only
  slides, and − + FIT ALL zoom. Narrower than STACK_W, each name sits over its bar.
- Each change is a line, `REFINERY research ORE: 100 → 120`, under the chart's label when it is an
  item; SEND and COPY carry them. Edits stay per viewer until UNDO ALL, keyed by the chart and
  the round banner's round, and an edit whose row or part left the data is dropped.
  The lines follow the page's own picks (`Mock.extras`), so a chart sits beside pickers and verdicts.
  `Mock.costAt(chart, id, what)` gives a row's name, or a part's `end`, `knob` or resource piece, on
  screen, for a test to press.

## Perf pages

A perf comparison starts from `perf.py`, not `template.py`. It has no stage: the numbers are
the page. Copy it next to your logs as `make.py`, fill in the EDIT parts, build and check it the
same way. `examples/perf/` is filled with made-up logs.

- `script#perf` holds the data as JSON. `targets` (`{ "floor": 90, "aim": 120 }` unless set) is the
  frame-rate floor and aim; the ms budgets follow from them.
- Each entry in `pairs` is one scene, before against after. Give the numbers (`"unit": "fps"` or
  `"ms"`, `before`, `after`; `before: null` is a fix still open), or give `runs`: per-frame logs,
  each `{ "side": "before" | "after", "label", "log": "<script id>" }`, whose pooled median is the
  headline. `"part": true` marks an ms number that is one piece of a frame (one pass, one draw), so
  it gets no budget chip. `fix`, `measured` and `when` print under the name; `note` above the detail.
  Every pair says where it was measured: numbers from different sessions are not comparable.
- `script.perflog` holds one frame log as is (`@@FILE:logs/x.txt@@`): a `# frames N | CPU work ms
  median ... | GPU wait ms median ...` summary line, then `cpu_ms [gpu_ms]` a frame. With the GPU
  column the page offers CPU WORK, GPU WAIT and CPU + GPU. A summary line that carries the present
  interval shows it in the run table as fps.
- Runs give the frame-time trace (point at it to read a frame), the percentile curve with the tail
  stretched, and a table per run, so the spread between runs shows beside the change. Take them
  from release builds in one session, before and after alternated.
- `script.perfpasses` holds a pass-skip sweep, one `<pass>: <summary line>` a line,
  and draws the ms saved with each pass skipped. The `none` line (or `data-base`) is the full
  frame; `data-metric` is `work`, `gpu` or `total`.
- Each scene row is an item, `S1`, `S2`... in data order (or the pair's `item`). The copy box gives
  the picked scene's change, its label first, and how many scenes meet each line.

## Placeholders (`build.py`)

`@@KIT_CSS@@` `@@KIT_JS@@`, `@@PERF_CSS@@` `@@PERF_JS@@`, `@@SIZES_CSS@@` `@@SIZES_JS@@`,
`@@COSTS_CSS@@` `@@COSTS_JS@@`, `@@APP_CSS@@` (see Project add-ons), any placeholder an add-on
defines, `@@IMG:path|w=960|q=84|crop=x,y,w,h|png|webp@@`, and `@@FILE:path@@` (a text file inlined,
its own placeholders filled). Paths resolve from the page's folder, or from `--assets DIR`. A
placeholder left unfilled fails the build. For custom picture work, such as a composite, run
`from build import uri` in your own script.

## Gotchas

- Check a page as a phone, not only at a narrow width: a local check of `page.built.html` in a phone emulator needs `<meta name="viewport" content="width=device-width,initial-scale=1">` added first, or it lays the page out 980 px wide. `shot.js`'s phone shot (390 px wide) covers the layout but not touch sizes.
- The board can load a page into a frame the reviewer already has open and run its scripts again. Keep the page's own script inside the template's `(() => { ... })()`, since a
  top-level `const` or `let` throws "already declared" there and the page goes dead. Animate with
  `Mock.frame(t => ...)` rather than `requestAnimationFrame`, so the old round's loop stops.
  `shot.js` runs the scripts a second time and fails if they throw.

- Inside the stage, `position: fixed` means fixed to the stage, because the stage always carries a
  transform. An app panel that is fixed and centred needs `top`, `left` and `transform` reset to sit
  somewhere else.
- `vw` and `vh` in an add-on's scoped CSS are rewritten against the stage size, not the browser's.
- The kit's fonts are a system stack (Avenir Next and SF Mono on a Mac); a cloud container
  substitutes its own, so text widths in a cloud check run slightly off.
