#!/usr/bin/env python3
"""Perf comparison starter. Copy it next to your logs as make.py, rename the title, then replace every
part marked EDIT. The numbers below are made up: a page that ships them is wrong. README: Perf pages."""
import sys
sys.path.insert(0, '/home/user/claude-mockup-kit')  # EDIT if the kit's clone is elsewhere
from pagekit import Page

p = Page('Thing Perf', round=1, heading='THING PERF', sub='EDIT: N SCENES · BEFORE AND AFTER #PR · WHERE AND WHEN MEASURED', app_css=False)
p.lede('EDIT: one paragraph. What was slow, what changed, and how it was measured: which machine and display, '
       'window or offscreen, release build, how many runs each side, alternated in one session. Numbers from '
       'different sessions are not comparable, so say which pairs share one.')

# EDIT: the data. targets defaults to 90 / 120. Each pair is one scene, before against after:
# - given numbers: "unit": "fps" or "ms", "before", "after" (before None = still open); "part": True marks
#   an ms number that is one piece of a frame, so it gets no budget chip.
# - or "runs": per-frame logs (logs= below), each {"side": "before"|"after", "label", "log": "<id>"}; the
#   headline is the pooled median. Alternate them: before, after, before, after, in one session.
# "fix", "measured" and "when" print under the scene name; "note" prints above its detail.
p.perf({
    'targets': {'floor': 90, 'aim': 120},
    'pairs': [
        {'scene': 'EDIT Zoomed out near planets', 'unit': 'fps', 'before': 91, 'after': 118,
         'fix': '#0000 what changed', 'measured': 'Mac window, Samsung 5120x1440', 'when': '2026-11-04'},
        {'scene': 'EDIT Debris after a crash', 'unit': 'fps', 'before': None, 'after': 57,
         'fix': 'Still being fixed', 'measured': 'Mac full screen, Samsung 5120x1440', 'when': '2026-11-04'},
        {'scene': 'EDIT Drawing the scrap cloud', 'unit': 'ms', 'before': 14.8, 'after': 1.3, 'part': True,
         'fix': '#0000', 'measured': 'Mac window', 'when': '2026-11-04'},
        {'id': 'busy', 'scene': 'EDIT Busy rock field', 'measured': 'cloud, headless with GPU, 1440x900, one session',
         'fix': '#0000', 'when': '2026-11-04', 'runs': [
             {'side': 'before', 'label': 'main 1', 'log': 'busy-b1'}, {'side': 'after', 'label': 'fix 1', 'log': 'busy-a1'},
             {'side': 'before', 'label': 'main 2', 'log': 'busy-b2'}, {'side': 'after', 'label': 'fix 2', 'log': 'busy-a2'}]},
    ]},
    # One frame log each, as is (README: Perf pages has the format).
    logs={'busy-b1': 'logs/busy-main-1.txt', 'busy-a1': 'logs/busy-fix-1.txt',
          'busy-b2': 'logs/busy-main-2.txt', 'busy-a2': 'logs/busy-fix-2.txt'},
    # Optional pass-skip sweeps: (log, scene, where measured); "<pass>: <summary line>" a line, the "none"
    # line the full frame, each bar the ms saved with that pass skipped.
    passes=[('logs/passes.txt', 'EDIT Planet crash', 'EDIT Mac offscreen 2560x720 @2x, one run each')])
p.picks(heading='COPY FOR THE CHAT')
p.cli()
