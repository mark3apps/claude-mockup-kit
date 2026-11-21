// Perf comparison runtime: reads script#perf (JSON) and the script.perflog / script.perfpasses
// text blocks, draws the summary tiles, the scene table, one scene's runs in detail and the pass
// bars, and writes the copy box. Load it after kit.js; it adds the `scene` and `metric` picks
// before the kit reads them.
(() => {
  if (window.__perfKit) window.__perfKit.abort();
  const run = window.__perfKit = new AbortController();
  const sig = { signal: run.signal };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const put = (p, ...k) => { k.forEach(n => p.appendChild(n)); return p; };
  const src = $('script#perf');
  if (!src) return;
  const D = JSON.parse(src.textContent);
  const T = { floor: 90, aim: 120, ...D.targets };
  const BUDGET = { aim: 1000 / T.aim, floor: 1000 / T.floor };
  const pairs = D.pairs || [];
  const METRIC = { work: 'CPU WORK', gpu: 'GPU WAIT', total: 'CPU + GPU' };
  const SMOOTH = 15;

  // A perf log: "# <summary line>" then one frame a line, "cpu_ms [gpu_ms]".
  function readLog(id) {
    const e = document.getElementById(id);
    if (!e) throw new Error(`perf: no script.perflog with id "${id}"`);
    const head = (e.textContent.match(/^#\s*(.*)$/m) || [])[1] || '';
    const work = [], gpu = [];
    e.textContent.split('\n').forEach(l => {
      if (!l.trim() || l.startsWith('#')) return;
      const [a, b] = l.trim().split(/\s+/).map(Number);
      if (Number.isFinite(a)) { work.push(a); if (Number.isFinite(b)) gpu.push(b); }
    });
    const iv = head.match(/present interval ms median ([\d.]+) p95 ([\d.]+)/);
    return { head, work, gpu: gpu.length && gpu.length === work.length ? gpu : null, interval: iv ? { median: +iv[1], p95: +iv[2] } : null };
  }

  function series(log, metric) {
    if (metric === 'gpu') return log.gpu;
    if (metric === 'total') return log.gpu && log.work.map((w, i) => w + log.gpu[i]);
    return log.work;
  }

  // Nearest rank, the usual way to take a percentile from a frame log.
  function stats(v) {
    if (!v || !v.length) return null;
    const s = [...v].sort((a, b) => a - b);
    const at = q => s[Math.floor((s.length - 1) * q)];
    const n = v.length;
    const mean = v.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / n);
    let jit = 0;
    for (let i = 1; i < n; i++) jit += Math.abs(v[i] - v[i - 1]);
    const share = (lo, hi) => 100 * v.filter(x => x > lo && x <= hi).length / n;
    return {
      n, mean, sd, jitter: n > 1 ? jit / (n - 1) : 0, sorted: s,
      min: s[0], p50: at(.5), median: at(.5), p90: at(.9), p95: at(.95), p99: at(.99), p999: at(.999), max: s[n - 1],
      inAim: share(-Infinity, BUDGET.aim), inFloor: share(BUDGET.aim, BUDGET.floor), miss: share(BUDGET.floor, Infinity),
      overAim: 100 - share(-Infinity, BUDGET.aim), overFloor: share(BUDGET.floor, Infinity),
    };
  }

  pairs.forEach((p, i) => {
    p.id = p.id || 'pair' + i;
    p.item = p.item || 'S' + (i + 1);
    p.runs = (p.runs || []).map(r => ({ ...r, log: readLog(r.log) }));
    p.hasGpu = p.runs.length > 0 && p.runs.every(r => r.log.gpu);
  });
  const detailed = pairs.filter(p => p.runs.length);
  const metricOf = (p, m) => p.hasGpu ? m : 'work';

  function pooled(p, side, metric) {
    return stats(p.runs.filter(r => r.side === side).flatMap(r => series(r.log, metric) || []));
  }

  // The headline pair: given numbers win; otherwise the pooled median of each side's runs.
  function headline(p, metric) {
    if (p.before !== undefined || p.after !== undefined) return { unit: p.unit || 'ms', before: p.before ?? null, after: p.after ?? null };
    const m = metricOf(p, metric);
    const b = pooled(p, 'before', m), a = pooled(p, 'after', m);
    return { unit: 'ms', before: b ? b.median : null, after: a ? a.median : null };
  }

  const fmt = (v, unit) => v == null || !Number.isFinite(v) ? '—' : (unit === 'fps' ? String(Math.round(v)) : (v >= 20 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)));
  const pct = v => v == null ? '—' : (v < 0.05 ? '0' : v < 10 ? v.toFixed(1) : v.toFixed(0)) + '%';
  const runName = r => `${r.side.toUpperCase()}${r.label ? ' · ' + r.label : ''}`;

  // { text, good } : good is true when the change helps, false when it hurts, null when there is none.
  function change(h) {
    if (h.before == null || h.after == null) return { text: h.before == null ? 'STILL OPEN' : '', good: null };
    if (h.unit === 'fps') { const d = 100 * (h.after - h.before) / h.before; return { text: `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`, good: d > 0 ? true : d < 0 ? false : null }; }
    const k = h.before / h.after;
    if (Math.abs(k - 1) < 0.005) return { text: 'NO CHANGE', good: null };
    return k > 1 ? { text: `${k.toFixed(k >= 10 ? 0 : 2)}× FASTER`, good: true } : { text: `${(1 / k).toFixed(2)}× SLOWER`, good: false };
  }

  function verdict(h, part) {
    const v = h.after ?? h.before;
    if (v == null) return { cls: '', text: '' };
    if (part) return { cls: 'part', text: 'PART OF A FRAME' };
    if (h.unit === 'fps') return v >= T.aim ? { cls: 'good', text: `MEETS ${T.aim}` } : v >= T.floor ? { cls: 'ok', text: `ABOVE ${T.floor}` } : { cls: 'bad', text: `BELOW ${T.floor}` };
    return v <= BUDGET.aim ? { cls: 'good', text: `MEETS ${T.aim}` } : v <= BUDGET.floor ? { cls: 'ok', text: `ABOVE ${T.floor}` } : { cls: 'bad', text: `BELOW ${T.floor}` };
  }

  function el(tag, attrs = {}, text) {
    const e = tag.startsWith('svg:') ? document.createElementNS(NS, tag.slice(4)) : document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => v != null && v !== false && e.setAttribute(k, v));
    if (text != null) e.textContent = text;
    return e;
  }
  const delta = (b, a, unit, cls = '', f = v => fmt(v, unit)) => {
    const d = el('span', { class: 'pdelta ' + cls });
    put(d, el('s', {}, f(b)), el('i', { class: 'arr' }, '→'), el('b', {}, f(a)));
    if (unit) put(d, el('i', { class: 'u' }, unit.toUpperCase()));
    return d;
  };

  function drawTargets() {
    const box = $('.ptargets');
    if (!box) return;
    box.replaceChildren();
    [['aim', `AIM ${T.aim} FPS`, `${BUDGET.aim.toFixed(1)} MS A FRAME`], ['floor', `FLOOR ${T.floor} FPS`, `${BUDGET.floor.toFixed(1)} MS A FRAME`]].forEach(([c, a, b]) => {
      const s = el('span', { class: 't ' + c }); put(s, el('b', {}, a), el('small', {}, b)); put(box, s);
    });
    const key = el('span', { class: 'key' });
    put(key, el('span', { class: 'b' }, 'BEFORE'), el('span', { class: 'a' }, 'AFTER'));
    put(box, key);
  }

  // ---- the tiles: how every scene stands against the lines, and the biggest win.
  function drawTiles(metric) {
    const box = $('#perfTiles');
    if (!box) return;
    box.replaceChildren();
    const hs = pairs.map(p => ({ p, h: headline(p, metric), v: verdict(headline(p, metric), p.part) }));
    const n = c => hs.filter(x => x.v.cls === c).length;
    const open = hs.filter(x => x.h.before == null && x.h.after != null).length;
    const gain = hs.filter(x => x.h.before != null && x.h.after != null)
      .map(x => ({ x, k: x.h.unit === 'fps' ? x.h.after / x.h.before : x.h.before / x.h.after })).sort((a, b) => b.k - a.k)[0];
    const tile = (cls, big, lab, sub) => {
      const t = el('div', { class: 'ptile ' + cls });
      put(t, el('b', {}, big), el('span', {}, lab));
      if (sub) put(t, el('small', {}, sub));
      put(box, t);
    };
    tile('good', String(n('good')), `MEET ${T.aim}`, `${BUDGET.aim.toFixed(1)} ms or less`);
    tile('ok', String(n('ok')), `ABOVE ${T.floor} ONLY`, `under ${T.aim}, over ${T.floor}`);
    tile('bad', String(n('bad')), `BELOW ${T.floor}`, `slower than ${BUDGET.floor.toFixed(1)} ms`);
    tile('open', String(open), 'STILL OPEN', 'no before yet');
    if (gain) tile('win', gain.x.h.unit === 'fps' ? `+${Math.round(100 * (gain.k - 1))}%` : `${gain.k.toFixed(gain.k >= 10 ? 0 : 1)}×`, 'BIGGEST WIN', gain.x.p.scene);
  }

  // ---- the scene table: a dumbbell per pair on a shared axis, fps (linear) and ms (log) apart.
  let filter = 'all';
  const FILTERS = [['all', 'ALL'], ['fps', 'FRAME RATE'], ['ms', 'FRAME TIME'], ['short', `SHORT OF ${T.aim}`], ['open', 'STILL OPEN']];

  function axis(unit, vals) {
    if (unit === 'fps') {
      const hi = Math.max(T.aim * 1.25, ...vals) * 1.05;
      return { f: v => v / hi, ticks: [0, 30, 60, T.floor, T.aim, 150, 180, 240].filter((t, i, a) => a.indexOf(t) === i && t < hi), lines: { aim: T.aim, floor: T.floor } };
    }
    const lo = Math.min(1, ...vals), hi = Math.max(BUDGET.floor * 2, ...vals) * 1.15;
    const L = Math.log(lo), R = Math.log(hi);
    return { f: v => (Math.log(Math.max(v, lo)) - L) / (R - L), ticks: [1, 2, 5, 10, 20, 50, 100, 200].filter(t => t >= lo && t <= hi), lines: { aim: BUDGET.aim, floor: BUDGET.floor } };
  }

  function drawTable(metric) {
    const box = $('#perfTable');
    if (!box) return;
    box.replaceChildren();
    const bar = el('div', { class: 'pfilter', role: 'group', 'aria-label': 'Show scenes' });
    FILTERS.forEach(([k, t]) => put(bar, el('button', { type: 'button', 'data-filter': k, 'aria-pressed': String(k === filter) }, t)));
    put(box, bar);
    let shown = 0;
    ['fps', 'ms'].forEach(unit => {
      const all = pairs.map(p => ({ p, h: headline(p, metric) })).filter(x => x.h.unit === unit);
      const rows = all.filter(({ p, h }) => filter === 'all' || filter === unit ||
        (filter === 'short' && ['ok', 'bad'].includes(verdict(h, p.part).cls)) || (filter === 'open' && h.before == null));
      if (!rows.length) return;
      shown += rows.length;
      const ax = axis(unit, all.flatMap(x => [x.h.before, x.h.after]).filter(v => v != null));
      const g = el('div', { class: 'pgroup' });
      const hd = el('header');
      put(hd, el('h3', {}, unit === 'fps' ? 'FRAME RATE' : 'FRAME TIME'), el('span', {}, unit === 'fps' ? 'HIGHER IS BETTER' : 'LOWER IS BETTER · LOG SCALE'));
      put(g, hd);
      const scale = el('div', { class: 'prow pscale' });
      put(scale, el('span'), dumb(ax, null, unit, true), el('span'), el('span'));
      put(g, scale);
      rows.forEach(({ p, h }) => {
        const v = verdict(h, p.part), ch = change(h);
        const r = el('div', { class: 'prow v-' + (v.cls || 'none') + (p.runs.length ? ' pick' : ''), 'data-id': p.id, 'data-item': p.item, 'data-name': p.scene, tabindex: p.runs.length ? '0' : null });
        const name = el('span', { class: 'pname' });
        // The row is a grid, so its label and Tell me more are built here, where kit.js would append a fifth cell.
        const nb = el('b');
        put(nb, el('span', { class: 'ilabel' }, p.item), document.createTextNode(' ' + p.scene));
        put(name, nb);
        const meta = el('small');
        [p.fix, p.measured, p.when].filter(Boolean).forEach((t, i) => { if (i) put(meta, el('i', {}, ' · ')); put(meta, document.createTextNode(t)); });
        put(name, meta);
        if (p.runs.length) put(name, el('em', {}, `${p.runs.length} RUNS · OPEN FRAME BY FRAME ▸`));
        const more = el('span', { class: 'kasks' });
        put(more, el('button', { class: 'kbtn kask', type: 'button', 'data-ask': 'more' }, 'Tell me more'), el('span', { class: 'ok' }));
        put(name, more);
        const chg = el('span', { class: 'pchg' });
        put(chg, el('b', { class: ch.good === true ? 'up' : ch.good === false ? 'down' : '' }, ch.text), el('span', { class: 'chip ' + v.cls }, v.text));
        put(r, name, dumb(ax, h, unit), delta(h.before, h.after, unit), chg);
        put(g, r);
      });
      put(box, g);
    });
    if (!shown) put(box, el('p', { class: 'pempty' }, 'No scene matches.'));
  }

  function dumb(ax, h, unit, labels) {
    const W = 400, H = labels ? 18 : 26, y = labels ? 12 : 13;
    const s = el('svg:svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'pdumb', 'aria-hidden': 'true' });
    const X = v => 6 + ax.f(v) * (W - 12);
    if (labels) {
      ax.ticks.forEach(t => put(s, el('svg:text', { x: X(t), y, class: 'tk' + (t === ax.lines.aim ? ' aim' : t === ax.lines.floor ? ' floor' : '') }, unit === 'fps' ? t : t + (t === ax.ticks[ax.ticks.length - 1] ? ' ms' : ''))));
      return s;
    }
    const lo = Math.min(X(ax.lines.aim), X(ax.lines.floor)), hi = Math.max(X(ax.lines.aim), X(ax.lines.floor));
    put(s, el('svg:rect', { x: lo, y: 0, width: hi - lo, height: H, class: 'band' }));
    Object.entries(ax.lines).forEach(([c, l]) => put(s, el('svg:line', { x1: X(l), x2: X(l), y1: 0, y2: H, class: 'tl ' + c })));
    put(s, el('svg:line', { x1: 6, x2: W - 6, y1: y, y2: y, class: 'trk' }));
    if (h.before != null && h.after != null) put(s, el('svg:line', { x1: X(h.before), x2: X(h.after), y1: y, y2: y, class: 'span' + (change(h).good === false ? ' worse' : '') }));
    if (h.before != null) put(s, el('svg:circle', { cx: X(h.before), cy: y, r: 4.5, class: 'dot b' }));
    if (h.after != null) put(s, el('svg:circle', { cx: X(h.after), cy: y, r: 6, class: 'dot a' }));
    return s;
  }

  // ---- one scene: cards, budget bands, the CPU/GPU split, three charts, the stats, the worst frames.
  function buildPicks() {
    const ctl = $('#perfPicks');
    if (!ctl) return;
    ctl.replaceChildren();
    if (!detailed.length) { ctl.hidden = true; return; }
    const one = (label, key, opts) => {
      const c = el('div', { class: 'ctl' });
      const seg = el('div', { class: 'seg', 'data-pick': key });
      opts.forEach(([v, t, say]) => put(seg, el('button', { 'data-v': v, 'data-say': say ?? t }, t)));
      put(c, el('span', {}, label), seg);
      put(ctl, c);
    };
    one('SCENE', 'scene', detailed.map(p => [p.id, `${p.item} ${p.scene}`, p.scene]));
    if (detailed.some(p => p.hasGpu)) one('METRIC', 'metric', Object.entries(METRIC).map(([k, t]) => [k, t, t.toLowerCase()]));
    const c = el('div', { class: 'ctl' });
    const seg = el('div', { class: 'seg' });
    put(seg, el('button', { class: 'tog', 'data-pick': 'smooth', 'aria-pressed': 'true', 'data-say-on': '', 'data-say-off': '' }, `${SMOOTH}-FRAME MEDIAN`));
    put(c, el('span', {}, 'TRACE'), seg);
    put(ctl, c);
  }

  const hidden = new Set();
  let mark = null;

  function drawDetail(p, metric, smooth) {
    const box = $('#perfDetail');
    if (!box) return;
    box.replaceChildren();
    if (!p) return;
    const m = metricOf(p, metric);
    const runs = p.runs.map((r, k) => { const vals = series(r.log, m) || []; return { ...r, k, vals, s: stats(vals) }; });
    const head = el('div', { class: 'phead' });
    put(head, el('h3', {}, `${p.scene} · ${METRIC[m]} PER FRAME`));
    const meta = el('p');
    [p.fix, p.measured, p.when, `${runs.length} runs`].filter(Boolean).forEach((t, i) => { if (i) put(meta, el('i', {}, ' · ')); put(meta, document.createTextNode(t)); });
    put(head, meta);
    if (p.note) put(head, el('p', { class: 'pnote' }, p.note));
    if (m !== metric) put(head, el('p', { class: 'pnote' }, 'These runs carry no GPU column (a run with the GPU on adds it), so this is CPU work.'));
    put(box, head);

    const sides = { before: pooled(p, 'before', m), after: pooled(p, 'after', m) };
    const cards = el('div', { class: 'pcards' });
    [['MEDIAN FRAME', 'median'], ['P95 FRAME', 'p95'], ['P99 FRAME', 'p99'], ['WORST FRAME', 'max']].forEach(([lab, k]) => {
      const b = sides.before && sides.before[k], a = sides.after && sides.after[k];
      const ch = (b && a) ? change({ unit: 'ms', before: b, after: a }) : { text: '', good: null };
      const c = el('div', { class: 'pcard' });
      put(c, el('span', {}, lab), delta(b, a, 'ms', 'big'), el('em', { class: ch.good === false ? 'down' : ch.good ? 'up' : '' }, ch.text));
      if (b && a) put(c, el('small', {}, `${a - b <= 0 ? '−' : '+'}${fmt(Math.abs(a - b))} ms`));
      put(cards, c);
    });
    const c = el('div', { class: 'pcard' });
    put(c, el('span', {}, `FRAMES MEETING ${T.aim}`), delta(sides.before && sides.before.inAim, sides.after && sides.after.inAim, null, 'big', pct));
    put(c, el('em', {}, `${BUDGET.aim.toFixed(1)} MS OR LESS`));
    put(cards, c);
    put(box, cards);

    put(box, bands(runs, sides));
    if (p.hasGpu) put(box, split(p));

    const charts = el('div', { class: 'pcharts' });
    put(box, charts);
    const keyBar = el('div', { class: 'pkey', role: 'group', 'aria-label': 'Runs shown' });
    runs.forEach(r => {
      const b = el('button', { type: 'button', class: `${r.side} r${r.k % 4}`, 'data-run': String(r.k), 'aria-pressed': String(!hidden.has(r.k)) });
      put(b, el('i'), document.createTextNode(runName(r)));
      put(keyBar, b);
    });
    put(charts, keyBar);
    const [f1, f2, f3] = [0, 1, 2].map(i => charts.appendChild(el('figure', { class: 'pchart' + (i === 0 ? ' wide' : '') })));
    const shown = runs.filter(r => !hidden.has(r.k));
    trace(f1, shown, smooth);
    curve(f2, shown);
    hist(f3, shown);

    put(box, table(runs));
    put(box, worst(runs));
  }

  function bands(runs, sides) {
    const sec = el('div', { class: 'pbands' });
    put(sec, el('h4', {}, 'WHERE THE FRAMES LAND'));
    const row = (name, s, cls) => {
      const r = el('div', { class: 'pband ' + cls });
      put(r, el('span', {}, name));
      const bar = el('div', { class: 'bar' });
      [['in', s.inAim, `${T.aim}+`], ['mid', s.inFloor, `${T.floor}–${T.aim}`], ['miss', s.miss, `<${T.floor}`]].forEach(([c, v, t]) => {
        if (v <= 0) return;
        const seg = el('i', { class: c, style: `flex-grow:${v.toFixed(3)}`, title: `${t} fps: ${pct(v)}` });
        if (v >= 9) seg.textContent = pct(v);
        put(bar, seg);
      });
      put(r, bar);
      put(sec, r);
    };
    if (sides.before) row('BEFORE, ALL RUNS', sides.before, 'pool before');
    if (sides.after) row('AFTER, ALL RUNS', sides.after, 'pool after');
    runs.forEach(r => r.s && row(runName(r), r.s, r.side));
    const lg = el('div', { class: 'plegend' });
    [['in', `MEETS ${T.aim} (≤ ${BUDGET.aim.toFixed(1)} MS)`], ['mid', `${T.floor}–${T.aim} FPS`], ['miss', `BELOW ${T.floor} (> ${BUDGET.floor.toFixed(1)} MS)`]].forEach(([c, t]) => {
      const s = el('span', { class: c }); put(s, el('i'), document.createTextNode(t)); put(lg, s);
    });
    put(sec, lg);
    return sec;
  }

  // Median CPU work and median GPU wait per run, stacked, on one scale.
  function split(p) {
    const sec = el('div', { class: 'pbands psplit' });
    put(sec, el('h4', {}, 'CPU WORK AND GPU WAIT · MEDIAN FRAME'));
    const rows = p.runs.map(r => ({ r, c: stats(r.log.work).median, g: stats(r.log.gpu).median }));
    const hi = Math.max(...rows.map(x => x.c + x.g), BUDGET.floor);
    rows.forEach(({ r, c, g }) => {
      const row = el('div', { class: 'pband ' + r.side });
      put(row, el('span', {}, runName(r)));
      const bar = el('div', { class: 'bar' });
      put(bar, el('i', { class: 'cpu', style: `flex-grow:${c}` }, c / hi > .12 ? `CPU ${fmt(c)}` : ''), el('i', { class: 'gpu', style: `flex-grow:${g}` }, g / hi > .12 ? `GPU ${fmt(g)}` : ''), el('i', { class: 'rest', style: `flex-grow:${Math.max(0, hi - c - g)}` }));
      put(row, bar, el('b', {}, `${fmt(c + g)} ms`));
      put(sec, row);
    });
    return sec;
  }

  function table(runs) {
    const wrap = el('div', { class: 'ptablewrap' });
    const t = el('table', { class: 'ptable' });
    const tr = el('tr');
    put(tr, el('th', {}, 'PER RUN'));
    runs.forEach(r => put(tr, el('th', { class: r.side }, runName(r))));
    put(t, tr);
    const ms = k => s => fmt(s[k]) + ' ms';
    [
      ['FRAMES', s => String(s.n)], ['BEST', ms('min')], ['MEDIAN', ms('median')], ['MEAN', ms('mean')], ['P90', ms('p90')],
      ['P95', ms('p95')], ['P99', ms('p99')], ['P99.9', ms('p999')], ['WORST', ms('max')], ['SPREAD (SD)', ms('sd')],
      ['FRAME TO FRAME', ms('jitter')], [`MEET ${T.aim}`, s => pct(s.inAim)], [`BELOW ${T.floor}`, s => pct(s.miss)],
      ['FPS THE MEDIAN ALLOWS', s => fmt(1000 / s.median, 'fps')],
    ].forEach(([lab, f], i) => {
      const row = el('tr', { class: i === 2 || i === 6 ? 'hi' : null });
      put(row, el('th', {}, lab));
      runs.forEach(r => put(row, el('td', { class: r.side }, r.s ? f(r.s) : '—')));
      put(t, row);
    });
    if (runs.some(r => r.log.interval)) {
      const row = el('tr', { class: 'hi' });
      put(row, el('th', {}, 'FPS, PRESENT MEDIAN'));
      runs.forEach(r => put(row, el('td', { class: r.side }, r.log.interval ? String(Math.round(1000 / r.log.interval.median)) : '—')));
      put(t, row);
    }
    put(wrap, t);
    return wrap;
  }

  // The slowest frames on each side; click one to mark it on the trace.
  function worst(runs) {
    const sec = el('div', { class: 'pworst' });
    ['before', 'after'].forEach(side => {
      const all = runs.filter(r => r.side === side).flatMap(r => r.vals.map((v, i) => ({ r, i, v })));
      if (!all.length) return;
      const top = all.sort((a, b) => b.v - a.v).slice(0, 8);
      const col = el('div', { class: 'pw ' + side });
      put(col, el('h4', {}, `SLOWEST FRAMES · ${side.toUpperCase()}`));
      const ol = el('ol');
      top.forEach(x => {
        const li = el('li');
        const b = el('button', { type: 'button', 'data-mark': `${x.r.k}:${x.i}`, 'aria-pressed': String(mark === `${x.r.k}:${x.i}`) });
        put(b, el('b', {}, `${fmt(x.v)} ms`), el('span', {}, `frame ${x.i + 1}${x.r.label ? ' · ' + x.r.label : ''}`));
        put(li, b);
        put(ol, li);
      });
      put(col, ol);
      put(sec, col);
    });
    return sec;
  }

  function yScale(runs) {
    const s = runs.flatMap(r => r.s ? r.s.sorted : []).sort((a, b) => a - b);
    const top = s.length ? s[Math.floor((s.length - 1) * 0.995)] : BUDGET.floor;
    return Math.max(BUDGET.floor * 1.3, top * 1.15);
  }

  // Drawn at the figure's own width, so the labels keep their size on a phone; a resize redraws.
  function frame(f, title, hint) {
    const cap = el('figcaption', {}, title);
    if (hint) put(cap, el('small', {}, hint));
    put(f, cap);
    const W = Math.max(280, Math.round(f.clientWidth - 26) || 760);
    const H = Math.round(Math.max(210, Math.min(f.classList.contains('wide') ? 320 : 280, W * 0.42)));
    const s = el('svg:svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': title });
    put(f, s);
    return { f, s, W, H };
  }

  function yGrid(s, W, H, pad, ymax, Y) {
    const lo = Y(BUDGET.aim), hi = Y(BUDGET.floor);
    put(s, el('svg:rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: Math.max(0, hi - pad.t), class: 'zone miss' }));
    put(s, el('svg:rect', { x: pad.l, y: hi, width: W - pad.l - pad.r, height: lo - hi, class: 'zone mid' }));
    put(s, el('svg:rect', { x: pad.l, y: lo, width: W - pad.l - pad.r, height: H - pad.b - lo, class: 'zone in' }));
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(k => ymax / k <= 6) || 1000;
    for (let v = 0; v <= ymax; v += step) {
      put(s, el('svg:line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'gl' }));
      put(s, el('svg:text', { x: pad.l - 6, y: Y(v) + 3.5, class: 'yl' }, v));
    }
    // The aim's label sits at the right end and the floor's at the left, so close lines never collide.
    [[BUDGET.aim, `${T.aim} FPS`, 'aim', W - pad.r - 4], [BUDGET.floor, `${T.floor} FPS`, 'floor', pad.l + 4]].forEach(([v, t, c, x]) => {
      put(s, el('svg:line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'tl ' + c }));
      put(s, el('svg:text', { x, y: Y(v) - 4, class: 'tlab ' + c }, t));
    });
  }

  function rolling(v, k) {
    const h = k >> 1, out = [];
    for (let i = 0; i < v.length; i++) {
      const w = v.slice(Math.max(0, i - h), i + h + 1).sort((a, b) => a - b);
      out.push(w[w.length >> 1]);
    }
    return out;
  }

  const pts = (vals, X, Y) => vals.map((x, i) => `${X(i).toFixed(1)},${Y(x).toFixed(1)}`).join(' ');

  function trace(f, runs, smooth) {
    const pad = { l: 36, r: 12, t: 12, b: 24 };
    const { s, W, H } = frame(f, 'FRAME TIME, FRAME BY FRAME', smooth ? `thin: every frame · thick: ${SMOOTH}-frame median · ▲ off the top` : 'every frame · ▲ off the top');
    const ymax = yScale(runs);
    const n = Math.max(1, ...runs.map(r => r.vals.length));
    const X = i => pad.l + (W - pad.l - pad.r) * i / Math.max(1, n - 1);
    const Y = v => pad.t + (H - pad.t - pad.b) * (1 - Math.min(v, ymax) / ymax);
    yGrid(s, W, H, pad, ymax, Y);
    runs.forEach(r => {
      if (!r.vals.length) return;
      put(s, el('svg:polyline', { points: pts(r.vals, X, Y), class: `ln ${r.side} r${r.k % 4}${smooth ? ' raw' : ''}` }));
      if (smooth) put(s, el('svg:polyline', { points: pts(rolling(r.vals, SMOOTH), X, Y), class: `ln ${r.side} r${r.k % 4} sm` }));
      r.vals.forEach((x, i) => { if (x > ymax) put(s, el('svg:path', { d: `M${X(i) - 3.5},${pad.t + 7}l3.5,-7l3.5,7z`, class: 'spike ' + r.side })); });
    });
    [0, .25, .5, .75, 1].forEach(q => {
      const i = Math.round(q * (n - 1));
      put(s, el('svg:text', { x: X(i), y: H - 7, class: 'xl' + (q === 0 ? '' : q === 1 ? ' end' : ' mid') }, q === 0 ? 'FRAME 1' : String(i + 1)));
    });
    if (mark) {
      const [k, i] = mark.split(':').map(Number);
      const r = runs.find(x => x.k === k);
      if (r && r.vals[i] != null) {
        put(s, el('svg:line', { x1: X(i), x2: X(i), y1: pad.t, y2: H - pad.b, class: 'mk' }));
        put(s, el('svg:circle', { cx: X(i), cy: Y(r.vals[i]), r: 5, class: 'mkdot ' + r.side }));
      }
    }
    const cur = el('svg:line', { y1: pad.t, y2: H - pad.b, class: 'cur', visibility: 'hidden' });
    put(s, cur);
    const out = el('div', { class: 'pread' }, 'Point at the chart to read a frame.');
    put(f, out);
    const read = e => {
      const b = s.getBoundingClientRect();
      const x = (e.clientX - b.left) * W / b.width;
      const i = Math.max(0, Math.min(n - 1, Math.round((x - pad.l) / (W - pad.l - pad.r) * (n - 1))));
      cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i)); cur.setAttribute('visibility', 'visible');
      out.replaceChildren(el('b', {}, `FRAME ${i + 1}`));
      runs.forEach(r => { const v = r.vals[i]; const sp = el('span', { class: r.side }, `${runName(r)} ${v == null ? '—' : fmt(v) + ' ms'}`); put(out, sp); });
    };
    s.addEventListener('pointermove', read, sig);
    s.addEventListener('pointerdown', read, sig);
    s.addEventListener('pointerleave', () => cur.setAttribute('visibility', 'hidden'), sig);
  }

  // The tail gets the room: p0–p90 takes 55% of the width, p90–p99 30%, p99–max 15%.
  function curve(f, runs) {
    const pad = { l: 36, r: 12, t: 12, b: 24 };
    const { s, W, H } = frame(f, 'FRAME TIME BY PERCENTILE', 'the right edge is the worst frames');
    const ymax = yScale(runs);
    const P = q => q <= .9 ? q / .9 * .55 : q <= .99 ? .55 + (q - .9) / .09 * .30 : .85 + (q - .99) / .01 * .15;
    const X = q => pad.l + (W - pad.l - pad.r) * P(q);
    const Y = v => pad.t + (H - pad.t - pad.b) * (1 - Math.min(v, ymax) / ymax);
    yGrid(s, W, H, pad, ymax, Y);
    [[0, 'BEST'], [.5, 'P50'], [.9, 'P90'], [.95, W < 480 ? '' : 'P95'], [.99, 'P99'], [1, W < 480 ? 'MAX' : 'WORST']].forEach(([q, t]) => {
      put(s, el('svg:line', { x1: X(q), x2: X(q), y1: pad.t, y2: H - pad.b, class: 'gl v' }));
      put(s, el('svg:text', { x: X(q), y: H - 7, class: 'xl ' + (q === 0 ? '' : q === 1 ? 'end' : 'mid') }, t));
    });
    runs.forEach(r => {
      if (!r.s) return;
      const v = r.s.sorted, m = v.length, p = [];
      const step = Math.max(1, Math.floor(m / 600));
      for (let i = 0; i < m; i += step) p.push([i / Math.max(1, m - 1), v[i]]);
      p.push([1, v[m - 1]]);
      put(s, el('svg:polyline', { points: p.map(([q, x]) => `${X(q).toFixed(1)},${Y(x).toFixed(1)}`).join(' '), class: `ln ${r.side} r${r.k % 4} sm` }));
    });
  }

  // How many frames land in each slice of time, before and after pooled, as a share of frames.
  function hist(f, runs) {
    const pad = { l: 36, r: 12, t: 12, b: 24 };
    const { s, W, H } = frame(f, 'HOW LONG FRAMES TAKE', 'share of frames in each slice of time');
    const xmax = yScale(runs);
    const bins = Math.max(12, Math.min(48, Math.round((W - pad.l - pad.r) / 12)));
    const w = xmax / bins;
    const count = side => {
      const v = runs.filter(r => r.side === side).flatMap(r => r.vals);
      const c = new Array(bins).fill(0);
      v.forEach(x => { c[Math.min(bins - 1, Math.floor(x / w))]++; });
      return v.length ? c.map(x => 100 * x / v.length) : null;
    };
    const cb = count('before'), ca = count('after');
    const top = Math.max(1, ...(cb || []), ...(ca || [])) * 1.1;
    const X = v => pad.l + (W - pad.l - pad.r) * v / xmax;
    const Y = v => pad.t + (H - pad.t - pad.b) * (1 - v / top);
    const lo = X(BUDGET.aim), hi = X(BUDGET.floor);
    put(s, el('svg:rect', { x: pad.l, y: pad.t, width: lo - pad.l, height: H - pad.t - pad.b, class: 'zone in' }));
    put(s, el('svg:rect', { x: lo, y: pad.t, width: hi - lo, height: H - pad.t - pad.b, class: 'zone mid' }));
    put(s, el('svg:rect', { x: hi, y: pad.t, width: W - pad.r - hi, height: H - pad.t - pad.b, class: 'zone miss' }));
    const step = [1, 2, 5, 10, 20, 25, 50].find(k => top / k <= 5) || 100;
    for (let v = 0; v <= top; v += step) {
      put(s, el('svg:line', { x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v), class: 'gl' }));
      put(s, el('svg:text', { x: pad.l - 6, y: Y(v) + 3.5, class: 'yl' }, v + '%'));
    }
    const bw = (W - pad.l - pad.r) / bins;
    [[cb, 'before', 0], [ca, 'after', 1]].forEach(([c, side, k]) => {
      if (!c) return;
      c.forEach((v, i) => { if (v > 0) put(s, el('svg:rect', { x: pad.l + i * bw + 1 + k * (bw - 2) / 2, y: Y(v), width: Math.max(1, (bw - 2) / 2), height: Y(0) - Y(v), class: 'hb ' + side })); });
    });
    [[BUDGET.aim, `${T.aim}`, 'aim'], [BUDGET.floor, `${T.floor}`, 'floor']].forEach(([v, t, c]) => {
      put(s, el('svg:line', { x1: X(v), x2: X(v), y1: pad.t, y2: H - pad.b, class: 'tl ' + c }));
      put(s, el('svg:text', { x: X(v) + (c === 'aim' ? -4 : 4), y: pad.t + 10, class: 'tlab ' + c + (c === 'aim' ? ' r' : '') }, t + ' FPS'));
    });
    const xstep = [1, 2, 5, 10, 20, 25, 50, 100].find(k => xmax / k <= 6) || 200;
    for (let v = 0; v <= xmax; v += xstep) put(s, el('svg:text', { x: X(v), y: H - 7, class: 'xl mid' }, v + (v + xstep > xmax ? ' ms' : '')));
  }

  // ---- where the time goes: ms each pass costs, from runs with one pass skipped at a time.
  // A block is "<name>: frames N | CPU work ms median a ... | GPU wait ms median b ..." per line;
  // the line named by data-base (default "none") is the full frame.
  function drawPasses() {
    const box = $('#perfPasses');
    if (!box) return;
    box.replaceChildren();
    $$('script.perfpasses').forEach(blk => {
      const base = blk.dataset.base || 'none';
      const rows = blk.textContent.split('\n').map(l => {
        const m = l.match(/^\s*([\w-]+):\s.*?CPU work ms median ([\d.]+)(?:.*?GPU wait ms median ([\d.]+))?/);
        return m && { name: m[1], cpu: +m[2], gpu: m[3] == null ? null : +m[3] };
      }).filter(Boolean);
      const b = rows.find(r => r.name === base);
      if (!b) throw new Error(`perf: script.perfpasses has no "${base}" line to measure against`);
      const key = blk.dataset.metric || (b.gpu != null ? 'total' : 'work');
      const cost = r => key === 'gpu' ? r.gpu : key === 'work' ? r.cpu : r.cpu + (r.gpu || 0);
      const full = cost(b);
      const saved = rows.filter(r => r !== b).map(r => ({ name: r.name, ms: full - cost(r) })).sort((x, y) => y.ms - x.ms);
      const hi = Math.max(...saved.map(x => Math.abs(x.ms)), 0.001);
      const sec = el('div', { class: 'ppass' });
      const hd = el('header');
      put(hd, el('h3', {}, blk.dataset.scene || 'SCENE'), el('span', {}, `${METRIC[key]} MEDIAN · FULL FRAME ${fmt(full)} MS`));
      put(sec, hd);
      if (blk.dataset.measured) put(sec, el('p', {}, blk.dataset.measured));
      const bars = el('div', { class: 'bars' });
      saved.forEach(x => {
        const r = el('div', { class: 'row' + (x.ms < 0 ? ' neg' : '') });
        const bar = el('div', { class: 'bar' });
        put(bar, el('i', { style: `--v:${(100 * Math.abs(x.ms) / hi).toFixed(1)}%` }));
        put(r, el('span', {}, x.name.toUpperCase()), bar, el('b', {}, `${x.ms >= 0 ? '' : '+'}${fmt(Math.abs(x.ms))} ms`), el('small', {}, x.ms >= 0 ? `${(100 * x.ms / full).toFixed(0)}% OF THE FRAME` : 'COSTS MORE SKIPPED'));
        put(bars, r);
      });
      put(sec, bars);
      put(box, sec);
    });
  }

  function summary(state) {
    const lines = [];
    const m = state.metric || 'work';
    const counts = { good: 0, ok: 0, bad: 0 };
    pairs.forEach(p => { const v = verdict(headline(p, m), p.part).cls; if (v in counts) counts[v]++; });
    const p = detailed.find(x => x.id === state.scene);
    if (p) {
      const pm = metricOf(p, m);
      const [b, a] = ['before', 'after'].map(sd => pooled(p, sd, pm));
      if (b && a) lines.push(`${p.item} PERF ${p.scene} (${METRIC[pm].toLowerCase()}, ${p.measured || 'where measured not given'}): median ${fmt(b.median)} → ${fmt(a.median)} ms (${change({ unit: 'ms', before: b.median, after: a.median }).text.toLowerCase()}), p99 ${fmt(b.p99)} → ${fmt(a.p99)} ms, frames meeting ${T.aim} ${pct(b.inAim)} → ${pct(a.inAim)}`);
    }
    lines.push(`All scenes: ${counts.good} meet ${T.aim}, ${counts.ok} above ${T.floor} only, ${counts.bad} below ${T.floor}`);
    return lines.join('\n');
  }

  drawTargets();
  buildPicks();
  if (!window.Mock) throw new Error('perf: load kit.js before perf.js');
  Mock.picks = state => summary(state);
  let last = null;
  const redraw = () => { if (last) drawDetail(last.p, last.m, last.smooth); };
  Mock.on((state, key) => {
    const m = state.metric || 'work';
    if (key === null || key === 'metric') { drawTiles(m); drawTable(m); }
    const p = detailed.find(x => x.id === state.scene);
    if (key === 'scene') { hidden.clear(); mark = null; }
    last = { p, m, smooth: state.smooth !== false };
    if (key === null || key === 'scene' || key === 'metric' || key === 'smooth') redraw();
    if (key === null) drawPasses();
    $$('#perfTable .prow.pick').forEach(r => r.classList.toggle('on', r.dataset.id === state.scene));
  });
  let wide = innerWidth, queued = false;
  addEventListener('resize', () => {
    if (queued || !last || innerWidth === wide) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; wide = innerWidth; if (!run.signal.aborted) redraw(); });
  }, sig);
  document.addEventListener('click', e => {
    const t = e.target;
    const f = t.closest('#perfTable [data-filter]');
    if (f) { filter = f.dataset.filter; drawTable(Mock.state.metric || 'work'); $$('#perfTable .prow.pick').forEach(r => r.classList.toggle('on', r.dataset.id === Mock.state.scene)); return; }
    const k = t.closest('#perfDetail .pkey [data-run]');
    if (k) { const i = +k.dataset.run; if (hidden.has(i)) hidden.delete(i); else if (hidden.size < (last && last.p ? last.p.runs.length - 1 : 0)) hidden.add(i); redraw(); return; }
    const w = t.closest('#perfDetail [data-mark]');
    if (w) { mark = mark === w.dataset.mark ? null : w.dataset.mark; hidden.delete(+mark?.split(':')[0]); redraw(); $('#perfDetail .pchart.wide')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const r = !t.closest('[data-ask]') && t.closest('#perfTable .prow.pick');
    if (r) { Mock.set('scene', r.dataset.id); $('#perfDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }, sig);
  document.addEventListener('keydown', e => {
    const r = e.target.closest && !e.target.closest('[data-ask]') && e.target.closest('#perfTable .prow.pick');
    if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); Mock.set('scene', r.dataset.id); }
  }, sig);
})();
