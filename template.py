#!/usr/bin/env python3
"""Starter page. Copy it next to your captures as make.py, rename the title, then replace every part
marked EDIT. `python3 make.py` writes page.html (build and check it with build.py and shot.js);
`python3 make.py --hosted DIR` writes what the board gets; README: Steps."""
import sys
sys.path.insert(0, '/home/user/claude-mockup-kit')  # EDIT if the kit's clone is elsewhere
from pagekit import Page

p = Page('Thing Mock-ups', round=1,
         sub="ROUND 1 · 2 LAYOUTS · DRAWN AT THE APP'S REAL SIZE (1440 × 900) OVER A REAL CAPTURE")
p.lede('EDIT: one paragraph on what changes and what stays. Say what can be clicked, which keys work, and which numbers are examples.')

# Pickers: a choice holds one value (its key, then (value, button words, words in the picks)); a toggle is
# on or off. The first value, or start=, starts picked.
c = p.controls()
c.choice('layout', 'LAYOUT', [('A', 'A · Corner card', 'layout A'), ('B', 'B · Side card', 'layout B'), ('today', 'Today', 'keep today')])
c.choice('sit', 'SITUATION', [('plain', 'Plain', ''), ('busy', 'Busy', '')])
c.toggle('motion', 'MOTION', 'Slide in', say_on='motion on', say_off='no motion', replay=True)

# The stage: the app's window at 1:1. when= shows a thing only while the picks match ("layout=A",
# "layout=A,B", "layout!=today", "motion", "!motion"; terms joined by spaces must all hold). The stage
# also carries every pick as data-<key>, for CSS like .stage[data-sit="busy"] .x { ... }.
st = p.stage('1440x900')
st.bg('shots/01-today.png', when='layout!=today')
st.bg('shots/01-today.png', when='layout=today', alt='Today, captured from the app')
# EDIT: the mocks, drawn from the app's own classes (the project's add-on gives them).
st.mock('<h2>CORNER CARD</h2><p class="small" data-when="sit=busy">Three things are waiting.</p>',
        st.action('OPEN', toast='OPENS THE THING', cls='menubtn primary'), cls='panel mk mkA', when='layout=A', id='mkA')
# A word over the world sits on a plate beside its anchor, clear of the HUD, Mock.ship things and other words.
st.word('EDIT A THING', at=(720, 450), sub='WHAT IT IS', color='#7fe0ff')
st.mock('<h2>SIDE CARD</h2>', st.action('SWITCH TO A', set='layout=A', cls='menubtn'), cls='panel mk mkB', when='layout=B', id='mkB')

# Every item the reviewer picks on has a short label; the kit draws it and the asks that fit.
p.item('A', 'CORNER CARD', ['EDIT: what this option does, one point per line.'], asks='more clarify context', when='layout=A')
p.item('B', 'SIDE CARD', ['EDIT: what this option does.'], when='layout=B')
p.item('T', 'TODAY', ['The app as it draws this now.'], today=True, when='layout=today')
# The picks: format items split on ";", {key} is the pick's words; {items} (the default) gives one line
# per item holding picks.
p.picks(format='THING: {layout}; {motion}', heading='COPY FOR THE CHAT')

# Optional: today against the mock-up as a drag slider, and every still on one page.
p.h2('TODAY AGAINST THE MOCK-UP')
p.compare('shots/01-today.png', 'shots/01-today.png', labels=('TODAY', 'LAYOUT A'))
p.h2('STILLS')
p.stills([('shots/01-today.png', 'TODAY', 'The backdrop, as captured.')])

# EDIT: the mocks' own rules. Everything else is the kit and the app's CSS.
p.css('''.stage .mk { position: absolute; z-index: 5; top: auto; left: auto; transform: none; min-width: 0; }
.stage .mkA { left: 40px; bottom: 40px; width: 360px; padding: 18px 20px; }
.stage .mkB { right: 40px; top: 40px; width: 300px; padding: 16px 18px; }
.stage .mk h2 { margin: 0 0 10px; }
.stage .mk .menubtn { width: 100%; margin-top: 8px; }
.stage .mk.motion { animation: mkIn .32s cubic-bezier(.2, .8, .2, 1) both; }
@keyframes mkIn { from { opacity: 0; transform: translateY(14px); } }
@media (prefers-reduced-motion: reduce) { .stage .mk.motion { animation: none; } }''')

# EDIT: behaviour beyond the markup. Mock.on runs after every pick (key: the pick that changed, null at
# start, 'replay' on replay). Animate with Mock.frame(t => ...), never requestAnimationFrame.
p.js('''Mock.on((s, key) => {
  Mock.ship(720, 450, 40, 'the thing'); // EDIT: everything on the stage no word may cover
  document.querySelectorAll('.stage .mk').forEach(el => el.classList.toggle('motion', !!s.motion));
  if (key === 'layout' || key === 'motion') Mock.replay();
});
Mock.keys({ Escape: () => Mock.set('layout', Mock.state.layout === 'A' ? 'B' : 'A') });''')

p.cli()
