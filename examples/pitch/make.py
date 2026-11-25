#!/usr/bin/env python3
"""A pitch page: one card per idea, each a labelled item with a Build / Later / No verdict (nothing
picked until pressed) and the asks that fit it. Two cards from an outer-system finds pitch, one with bars."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from pagekit import Page, raw

p = Page('Pitch Cards', round=1, heading='OUTER FINDS', sub='2 IDEAS · PICK BUILD, LATER OR NO ON EACH', width=1200, app_css=False, assets=HERE)
p.lede('Each card is one idea: what it is, how you find it, what you get. The open question is the call still to make.')
p.pitch('E1', 'Stray Moon', 'A moon that lost its planet, on a slow, tilted lap of the sun far out. Bring it home and it becomes a moon of the planet you give it to.',
        art=raw('<svg viewBox="0 0 360 220" role="img" aria-label="A stray moon on a tilted lap of the sun">'
                '<circle class="sun" cx="14" cy="110" r="14"/><circle class="orb" cx="14" cy="110" r="110"/>'
                '<ellipse class="path" cx="170" cy="118" rx="190" ry="84" transform="rotate(-14 170 118)"/>'
                '<circle class="world" cx="98" cy="39" r="10"/><circle class="ice" cx="318" cy="150" r="7"/>'
                '<text class="lbl" x="262" y="178">STRAY MOON</text></svg>'),
        cap='Fly it in or carry it, then let it settle into orbit.', tags=[('RECOMMENDED', 'rec'), ('70–90% OUT', '')],
        rows={'How you find it': 'Your own scan only.', 'What you get': 'One more moon in your sky, with lots and a reserve.'},
        question='May it go round a gas giant too?', asks='more clarify context')
p.pitch('E2', 'Beyond the Wall', 'Past the Oort line, something answers your scan.',
        art=raw('<svg viewBox="0 0 360 220" role="img" aria-label="The Oort line, with something beyond it">'
                '<circle class="sun" cx="14" cy="110" r="14"/><circle class="orb" cx="14" cy="110" r="300"/>'
                '<circle class="ice" cx="336" cy="60" r="5"/><text class="lbl" x="230" y="200">BEYOND THE WALL</text></svg>'),
        tags=[('BIG BUILD', 'big')], bars=[('TODAY', -46, '−46'), ('BUILT', -23, '−23', 'e2=build')],
        rows={'What you do': 'Cross the line and come back with what you find.'}, question='Does it need its own sky?')
p.picks(heading='COPY FOR THE CHAT')
p.css('''.art .sun { fill: #ffc964; } .art .orb { fill: none; stroke: #33284f; }
.art .path { fill: none; stroke: #9fd8ff; stroke-dasharray: 4 4; } .art .world { fill: #6a8cff; }
.art .ice { fill: #e8f6ff; } .art .lbl { font: 600 10px "SF Mono", Menlo, monospace; letter-spacing: 1.5px; fill: #c4b4f0; }''')
p.cli()
