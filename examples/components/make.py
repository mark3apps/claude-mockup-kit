#!/usr/bin/env python3
"""The newer components on one page, with no captures: a round banner, a player driving a drawn stage
with a scrolling log, a live close-up following the ship, and a stat table with a pick per row."""
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from pagekit import Page, el

p = Page('Kit Components', round=2, sub='ROUND 2 · A WORKED EXAMPLE OF EACH', width=1200, app_css=False, assets=HERE)
p.round(changed='D2', new='M1', words="The Barge's hull is up and the drift move is new. Press a label to jump to it.")

p.h2('A MOVE, PLAYED')
row = p.columns('minmax(0, 1fr) 360px')
with p.into(row.cells[0]):
    st = p.stage('1440x900')
    st.layer('fx', id='fx')
    st.add(el('ol', cls='log', id='log'))
with p.into(row.cells[1]):
    m1 = p.item('M1', 'DRIFT TURN', asks='more context', verdict=True)
    with p.into(m1):
        p.hint('The ship swings wide round the sun and settles into a lap. Play it, or drag the bar.')
        p.inset(at=(720, 450), zoom=5, size='720x420', cap='5× CLOSER, LIVE', live=True, id='close')
p.player('player', length=12, speeds=(0.25, 1, 4), speed=1, draw='t => window.draw(t)',
         phases=[(0, 'It leaves the lane wide and fast.'), (4, 'The sun bends it round.'), (8, 'It settles into a lap.')])

p.h2('THE NUMBERS')
p.stats(['SHIP', 'HULL', 'SHIELD', 'RAM DAMAGE'], [
    ('D1', 'Hauler', [('120', '120'), ('40', '40'), ('8', '8')], ''),
    ('D2', 'Barge', [('200', '160'), ('60', '60'), ('18', '14')]),
])
p.picks()

p.css('''.stage { background: radial-gradient(80% 80% at 30% 40%, #120c24, #05040b 70%); }
.log { position: absolute; right: 24px; bottom: 40px; width: 260px; height: 200px; overflow: auto; margin: 0; padding: 8px 12px; list-style: none; background: rgba(8, 6, 18, .85); border: 1px solid var(--k-line); border-radius: 6px; font: 500 13px/22px var(--k-data); color: #cfe6ff; }''')
# The player's draw runs once the kit has started, so the stage's canvas is sized by then.
p.js('''const fx = document.getElementById('fx');
const close = document.getElementById('close');
// More lines than the log shows: the ones scrolled out of it must not read as off the stage.
document.getElementById('log').replaceChildren(...Array.from({ length: 24 }, (_, i) => Object.assign(document.createElement('li'), { textContent: `T+${(i * 0.5).toFixed(1).padStart(4, '0')}s  lap ${i + 1} logged` })));
const SUN = [720, 450];
// Where the ship is t seconds in: a wide swing that settles onto a 260 px lap.
function at(t) {
  const r = 260 + 340 * Math.exp(-t / 2.2), a = t * 0.9;
  return [SUN[0] + r * Math.cos(a), SUN[1] + r * 0.62 * Math.sin(a), a + Math.PI / 2];
}
window.draw = t => {
  const c = fx.getContext('2d');
  c.clearRect(0, 0, fx.width, fx.height);
  c.fillStyle = '#ffc964'; c.beginPath(); c.arc(SUN[0], SUN[1], 34, 0, 7); c.fill();
  c.strokeStyle = 'rgba(159, 216, 255, .35)'; c.setLineDash([6, 6]); c.beginPath();
  for (let s = 0; s <= t; s += 0.05) { const [x, y] = at(s); s ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke(); c.setLineDash([]);
  const [x, y, h] = at(t);
  c.save(); c.translate(x, y); c.rotate(h);
  c.fillStyle = '#e8f6ff'; c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, -5); c.lineTo(-3, 0); c.lineTo(-6, 5); c.closePath(); c.fill();
  c.restore();
  close.dataset.at = `${Math.round(x)},${Math.round(y)}`;
};''')
p.cli()
