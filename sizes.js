// The size lineup: every item at true world scale on one full-screen canvas, in labelled group rows.
// Drag to pan, wheel or pinch to zoom about the pointer, click an item to resize it in
// the dock. FILTER narrows it to some types (any of D.facets) and lays the rest out side by side.
// The sky is a world grid: its small square's size is in the view bar.
// The changes are the page's picks: COPY carries them standalone, the board's send bar hosted. Reads script#sizes
// (README: Size lineups). Load after kit.js.
(() => {
  if (!window.Mock) throw new Error('sizes: load kit.js before sizes.js');
  const run = window.__mockKit;
  const sig = { signal: run.signal };
  const one = s => document.querySelector(s);
  const all = (s, r = document) => [...r.querySelectorAll(s)];
  const D = JSON.parse(one('script#sizes').textContent);
  const U = D.unit || 'u';
  const KMAX = 4;
  const ZMIN = 0.0005, ZMAX = 80, WRAP_TRIES = 24, PAN_SCREENS = 3, ART_SHARE = 0.35, HEADS_DOWN = 0.6;
  const GRID_PX = 28;
  const cv = one('#sky');
  const cx = cv.getContext('2d');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const C = { gold: css('--k-gold'), cyan: css('--k-cyan'), ember: css('--k-ember'), dim: '#8a80a8', ink: '#e2d9ff', page: css('--k-page') };
  const items = D.items.map(it => ({ ...it, k: 1 }));
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  // Saved by sprite, use and length, not by label: a new bake renumbers the labels, and a size must never
  // move onto another ship. The round banner's round starts them afresh.
  const KEY = `mock-sizes:${document.title}|${one('.round[data-round]')?.dataset.round || ''}`;
  const sid = it => `${it.key}|${it.use || ''}|${it.len}`;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    items.forEach(it => { const k = saved[sid(it)]; if (k > 0) it.k = Math.max(1 / KMAX, Math.min(KMAX, k)); });
  } catch (e) { /* storage blocked: sizes start fresh */ }
  // The filter. A facet is an item field (type, people, ...); its chips are the values the items
  // hold, in their order. A facet only narrows the items that have a value for it, and `type`
  // falls back to the item's group, so any sprites.json gets at least a type filter.
  const val = (it, k) => it[k] ?? (k === 'type' ? it.group : undefined);
  const LINES = D.lines && D.lines.items && D.lines.items.length ? D.lines.title || 'Reference' : null;
  const FACETS = (D.facets || [{ key: 'type', name: 'Type' }]).map(f => {
    const vs = items.map(it => val(it, f.key)).filter(v => v != null && v !== '');
    const count = {};
    vs.forEach(v => { count[v] = (count[v] || 0) + 1; });
    return { ...f, values: Object.keys(count).sort((a, b) => vs.indexOf(a) - vs.indexOf(b)), count };
  }).filter(f => f.values.length > 1);
  const ARRANGE = [['group', 'As set'], ...FACETS.map(f => [f.key, `By ${f.name.toLowerCase()}`]), ['one', 'One row']];
  const filt = Object.fromEntries(FACETS.map(f => [f.key, new Set()]));
  let rowsBy = 'group';
  const hidden = new Set();
  // Keyed by the start view and the types on offer too, so a re-bake that changes either starts
  // every viewer afresh; saved only once the viewer changes something, never on first paint.
  const VKEY = `mock-sizes-view:${document.title}|${JSON.stringify([D.view || null, [...new Set(items.map(it => val(it, 'type')))].sort()])}`;
  let touched = false;
  // D.view ({filt: {facet: [values]}, rowsBy}) is where a viewer with nothing saved starts, and
  // where RESET goes back to. The first chip picked from there starts a fresh pick.
  const START = D.view || {};
  function load(v) {
    FACETS.forEach(f => { filt[f.key].clear(); (v.filt?.[f.key] || []).forEach(x => { if (f.values.includes(x)) filt[f.key].add(x); }); });
    rowsBy = ARRANGE.some(([k]) => k === v.rowsBy) ? v.rowsBy : 'group';
    hidden.clear();
    (v.hidden || []).forEach(h => { if (items.some(it => sid(it) === h)) hidden.add(h); });
  }
  const atStart = () => !hidden.size && FACETS.every(f => {
    const want = (START.filt?.[f.key] || []).filter(x => f.values.includes(x));
    return want.length === filt[f.key].size && want.every(x => filt[f.key].has(x));
  });
  load(START);
  try {
    const v = JSON.parse(localStorage.getItem(VKEY) || 'null');
    if (v) load(v);
  } catch (e) { /* storage blocked: the filter starts at D.view */ }
  const shows = it => !hidden.has(sid(it)) && FACETS.every(f => !filt[f.key].size || filt[f.key].has(val(it, f.key)));
  const narrowed = () => hidden.size || FACETS.some(f => filt[f.key].size);

  const imgs = {};
  Object.entries(D.sprites).forEach(([key, s]) => {
    const im = new Image();
    im.onload = () => { if (!run.signal.aborted) draw(); };
    im.src = s.src;
    imgs[key] = im;
  });

  // World units per sprite pixel at k = 1: the sprite shows `design` units at `ppu` px a unit.
  const wpp = it => { const s = D.sprites[it.key]; return it.len / (s.design || it.len) / s.ppu; };
  let view = { s: 2, x: 0, y: 0 };
  // The spacing between items and rows is screen pixels at the fit's scale, fixed in world units
  // until the next fit, so zooming scales the items, the gaps and the grid alike.
  let ls = view.s, wrapW = Infinity;
  let layout = [], rows = [], world = { w: 1, h: 1 };
  let names = true, sel = null;

  function relayout() {
    const groups = [], shown = items.filter(shows), by = rowsBy === 'one' ? null : rowsBy;
    const rowOf = it => by === 'group' ? it.group : by ? val(it, by) ?? '—' : `${shown.length} of ${items.length}, smallest first`;
    if (by && by !== 'group') { const f = FACETS.find(x => x.key === by); shown.sort((a, b) => f.values.indexOf(val(a, by)) - f.values.indexOf(val(b, by))); }
    shown.forEach(it => { const n = rowOf(it); let g = groups.find(x => x.name === n); if (!g) groups.push(g = { name: n, items: [] }); g.items.push(it); });
    // Arranged rows put like sizes next to each other; the authored rows keep their own order.
    if (rowsBy !== 'group') groups.forEach(g => g.items.sort((a, b) => a.len - b.len));
    if (LINES) groups.push({ name: LINES, items: [], lines: D.lines.items });
    layout = []; rows = []; world = { w: 1, h: 1, art: 0 };
    let y = 0;
    groups.forEach(g => {
      rows.push({ name: g.name, y });
      let x = 0, line = [];
      // A row wraps at wrapW, and each line stands its items on one floor, so a pod beside a
      // planet sits at the planet's foot with its label in line with the planet's.
      const close = () => {
        const tall = Math.max(4, ...line.map(p => p.h || 0)), floor = y + 22 / ls + tall;
        line.forEach((p, i) => {
          p.cy = p.line ? floor - 4 : floor - p.h + p.oy;
          p.room = i + 1 < line.length ? line[i + 1].x - p.x : 1e9;
          layout.push(p);
        });
        world.w = Math.max(world.w, ...line.map(p => p.x + p.foot)); world.art += tall;
        y = floor + 72 / ls;
        x = 0; line = [];
      };
      (g.lines || []).forEach(l => {
        const room = Math.max(l.len, 100 / ls);
        if (line.length && x + room > wrapW) close();
        line.push({ line: l, x, w: l.len, foot: room }); x += l.len + Math.max(20, 120 / ls);
      });
      g.items.forEach(it => {
        const sp = D.sprites[it.key], u = wpp(it) * it.k;
        const w = sp.w * u, h = sp.h * u, tag = (it.id.length * 8 + 16) / ls;
        if (line.length && x + Math.max(w, tag) > wrapW) close();
        line.push({ it, x, w, h, oy: sp.oy * u, foot: Math.max(w, tag) });
        x += Math.max(w + Math.max(w * 0.12, 30 / ls), tag);
      });
      if (line.length) close();
    });
    world.h = y;
  }

  function size() {
    const d = devicePixelRatio || 1;
    cv.width = innerWidth * d; cv.height = innerHeight * d;
    cx.setTransform(d, 0, 0, d, 0, 0);
  }
  // The gaps and row heads are screen pixels, so the fit is searched for, not solved: for each
  // wrap width, the largest scale that fits; then the wrap width whose fit is largest, so ships
  // and worlds share the screen's shape instead of one long row. The open size changes panel
  // takes either its height or its width off the screen, whichever leaves the larger fit. When
  // the art gets under ART_SHARE of that fit's height (many rows' heads, a phone), the rows wrap
  // at the screen's edge and run PAN_SCREENS screens down instead, or as far down as they need.
  function fit() {
    const top = (one('.stop')?.getBoundingClientRect().bottom || 0) + 16;
    const aw = innerWidth - 48, ah = innerHeight - top - 24;
    const pk = one('.picks')?.getBoundingClientRect();
    const areas = pk && pk.width && innerWidth > 860 ? [[aw, pk.top - 16 - top], [pk.left - 16 - 24, ah]] : [[aw, ah]];
    // W null: wrap at the screen's edge.
    const fits = (s, W, w, h) => { view.s = ls = s; wrapW = W ?? w / s; relayout(); return world.w * s <= w && world.h * s <= h; };
    const best = (W, w, h) => {
      let lo = ZMIN, hi = ZMAX;
      for (let i = 0; i < 24; i++) { const m = Math.sqrt(lo * hi); if (fits(m, W, w, h)) lo = m; else hi = m; }
      return lo;
    };
    const ws = items.filter(shows).map(it => { const sp = D.sprites[it.key]; return sp.w * wpp(it) * it.k; });
    const widest = Math.max(1, ...ws), all = ws.reduce((t, w) => t + w * 1.2, 0) || 1;
    let pick = [Infinity, aw, ah], top_s = 0;
    areas.filter(([w, h]) => w > 120 && h > 120).forEach(([w, h]) => {
      for (let i = -1; i <= WRAP_TRIES; i++) {
        const W = i < 0 ? Infinity : widest * Math.pow(Math.max(1, all / widest), i / WRAP_TRIES), s0 = best(W, w, h);
        if (s0 > top_s * 1.0001) { top_s = s0; pick = [W, w, h]; }
      }
    });
    // No area clear of the panel (a short window): the whole screen, under the panel.
    if (!top_s) top_s = best(...pick);
    fits(top_s, ...pick);
    if (world.art * top_s < pick[2] * ART_SHARE) {
      let ph = ah * PAN_SCREENS, pan = best(null, aw, ph);
      if (pan <= ZMIN * 1.01) pan = best(null, aw, ph = Infinity);
      if (pan > top_s) { top_s = pan; pick = [null, aw, ph]; }
    }
    fits(top_s, ...pick); view.x = 24; view.y = top;
    draw();
  }
  const scr = (wx, wy) => [view.x + wx * view.s, view.y + wy * view.s];
  function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 5, 10].map(m => m * p).find(m => m >= v); }
  function clip(t, w) { if (cx.measureText(t).width <= w) return t; while (t.length > 4 && cx.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; }

  function caption(it, sx, ly, room) {
    cx.textBaseline = 'top';
    cx.fillStyle = C.ink; cx.font = '600 12px ' + css('--k-ui');
    cx.fillText(clip(it.use ? `${it.name} · ${it.use}` : it.name, room), sx, ly + 19);
    cx.fillStyle = C.dim; cx.font = '11px ' + css('--k-data');
    cx.fillText(clip(`${(it.len * it.k).toFixed(1)} ${U}${it.k !== 1 ? `  (was ${it.len.toFixed(1)})` : ''}`, room), sx, ly + 35);
  }
  function draw() {
    const W = innerWidth, H = innerHeight;
    let selAt = null;
    cx.fillStyle = C.page; cx.fillRect(0, 0, W, H);
    const step = niceStep(GRID_PX / view.s), major = step * (String(step)[0] === '2' ? 5 : String(step)[0] === '5' ? 2 : 10);
    const lines = (st, color, width) => {
      cx.strokeStyle = color; cx.lineWidth = width; cx.beginPath();
      for (let wx = Math.floor(-view.x / view.s / st) * st; wx < (W - view.x) / view.s; wx += st) { const sx = Math.round(scr(wx, 0)[0]) + .5; cx.moveTo(sx, 0); cx.lineTo(sx, H); }
      for (let wy = Math.floor(-view.y / view.s / st) * st; wy < (H - view.y) / view.s; wy += st) { const sy = Math.round(scr(0, wy)[1]) + .5; cx.moveTo(0, sy); cx.lineTo(W, sy); }
      cx.stroke();
    };
    lines(step, 'rgba(120, 100, 190, .09)', 1);
    lines(major, 'rgba(140, 115, 220, .2)', 1);
    cx.font = '600 11px ' + css('--k-data'); cx.textBaseline = 'bottom'; cx.fillStyle = C.dim;
    // Zoomed well out past the fit, the heads, tags and words would stack on each other.
    const heads = view.s >= ls * HEADS_DOWN;
    if (heads) rows.forEach(r => { const [sx, sy] = scr(0, r.y); cx.fillText(r.name.toUpperCase(), Math.max(8, sx), sy + 16); });
    layout.forEach(p => {
      if (p.line) {
        const [sx, sy] = scr(p.x, p.cy);
        cx.strokeStyle = C.ember; cx.setLineDash([6, 4]); cx.lineWidth = 2;
        cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(sx + p.w * view.s, sy); cx.stroke(); cx.setLineDash([]);
        cx.fillStyle = C.ember; cx.textBaseline = 'top'; cx.font = '11px ' + css('--k-data');
        if (heads) cx.fillText(`${p.line.name} ${p.line.len.toFixed(1)} ${U}`, sx, sy + 6);
        return;
      }
      const it = p.it, im = imgs[it.key];
      const [sx, sy] = scr(p.x, p.cy - p.oy);
      const sw = p.w * view.s, sh = p.h * view.s;
      if (sx > W || sx + sw < -240 || sy > H || sy + sh + 60 < 0) return;
      if (im.complete && im.naturalWidth) { cx.imageSmoothingQuality = 'high'; cx.drawImage(im, sx, sy, sw, sh); }
      // Under a pixel, a dot keeps the item findable.
      if (sw < 2) { cx.fillStyle = it.mine ? C.cyan : C.gold; cx.fillRect(sx + sw / 2 - 1, sy + sh / 2 - 1, 2, 2); }
      if (sels.includes(it)) { cx.strokeStyle = C.gold; cx.lineWidth = 1.5; cx.strokeRect(sx - 4, sy - 4, sw + 8, sh + 8); }
      const ly = sy + sh + 4;
      cx.font = '700 12px ' + css('--k-data'); cx.textBaseline = 'top';
      const tw = cx.measureText(it.id).width;
      if ((!heads || p.room * view.s < tw + 10) && !sels.includes(it)) return;
      cx.fillStyle = it.mine ? C.cyan : it.k !== 1 ? '#ffe3a8' : C.gold;
      cx.fillRect(sx, ly, tw + 8, 16);
      cx.fillStyle = '#120c1f'; cx.fillText(it.id, sx + 4, ly + 2);
      const room = Math.min(p.room * view.s - 8, 230);
      if (it === sel) selAt = [sx, ly];
      else if (names && room > 90) caption(it, sx, ly, room);
    });
    if (!layout.length) {
      cx.fillStyle = C.dim; cx.font = '600 13px ' + css('--k-ui'); cx.textBaseline = 'middle';
      cx.fillText('Nothing matches the filter. Clear it, or pick another type.', 24, H / 2);
    }
    // The picked item's words go last, on a plate, so its neighbours' words never cover them.
    if (sel && selAt) {
      cx.fillStyle = 'rgba(7, 6, 15, .88)'; cx.fillRect(selAt[0] - 4, selAt[1] + 17, 268, 34);
      caption(sel, selAt[0], selAt[1], 260);
    }
    one('#zread').textContent = `□ ${step >= 1 ? step : step.toPrecision(1)} ${U.toUpperCase()}`;
    one('#zread').title = `Each small square is ${step} ${U} across, each bright one ${major} ${U}`;
  }

  function zoomAt(sx, sy, f) {
    const ns = Math.max(ZMIN, Math.min(ZMAX, view.s * f));
    const wx = (sx - view.x) / view.s, wy = (sy - view.y) / view.s;
    view.s = ns; view.x = sx - wx * ns; view.y = sy - wy * ns;
    draw();
  }
  function pick(sx, sy, add) {
    const wx = (sx - view.x) / view.s, wy = (sy - view.y) / view.s, pad = 6 / view.s;
    let best = null;
    layout.forEach(p => {
      if (!p.it) return;
      const top = p.cy - p.oy;
      if (wx >= p.x - pad && wx <= p.x + p.w + pad && wy >= top - pad && wy <= top + p.h + 40 / view.s && (!best || p.w < best.w)) best = p;
    });
    select(best ? best.it : null, add);
  }

  const pts = new Map();
  let moved = 0, pinch0 = null;
  const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; cv.classList.add('drag');
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: dist(a, b), s: view.s }; }
  }, sig);
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    const [px, py] = pts.get(e.pointerId), dx = e.clientX - px, dy = e.clientY - py;
    pts.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinch0.s * dist(a, b) / pinch0.d / view.s); return; }
    view.x += dx; view.y += dy; draw();
  }, sig);
  const up = e => {
    const was = pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = null;
    cv.classList.remove('drag');
    if (was && moved < 6 && !pts.size && e.type === 'pointerup') pick(e.clientX, e.clientY, e.shiftKey || e.ctrlKey || e.metaKey || one('#smulti')?.getAttribute('aria-pressed') === 'true');
  };
  cv.addEventListener('pointerup', up, sig);
  cv.addEventListener('pointercancel', up, sig);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false, signal: run.signal });

  // The dock is the picked item: it carries data-item, so its Tell me more names the item.
  const dock = one('#sdock');
  function fold(m) {
    one('.picks').classList.toggle('min', m);
    one('#sfold').textContent = m ? 'SHOW' : 'HIDE';
    one('#sfold').setAttribute('aria-expanded', String(!m));
  }
  // Shift-, Ctrl- or Cmd-click (or Add on tap) picks several. sel is the first picked: SAME SIZE
  // matches the rest to it. The slider scales them together from where they stood when picked.
  let sels = [], base = new Map();
  const rebase = () => { base = new Map(sels.map(i => [i, i.k])); };
  function select(it, add) {
    if (add && !it) return;
    choose(add ? sels.includes(it) ? sels.filter(i => i !== it) : [...sels, it] : it ? [it] : []);
  }
  function choose(list) {
    sels = list;
    sel = sels[0] || null; dock.hidden = !sel;
    rebase();
    if (sel && innerWidth <= 860) { fold(true); if (panel && !panel.hidden) { panel.hidden = true; showFilter(); } }
    if (sel) {
      dock.dataset.item = sels.map(i => i.id).join(', ');
      dock.dataset.name = sels.length > 1 ? `${sels.length} items` : sel.use ? `${sel.name} · ${sel.use}` : sel.name;
      fill();
    }
    draw();
  }
  const clampK = k => { k = Math.max(1 / KMAX, Math.min(KMAX, k)); return Math.abs(k - 1) < 0.005 ? 1 : k; };
  function fill() {
    const it = sel, ref = byId[D.ref], many = sels.length > 1;
    const same = items.filter(i => i.key === sel.key && shows(i));
    one('#sdock .ilabel').textContent = many ? `×${sels.length}` : it.id;
    one('#sdock .ilabel').classList.toggle('you', !many && !!it.mine);
    one('#sname').textContent = many ? sels.map(i => i.id).join(' ') : it.name;
    one('#suse').textContent = many ? 'Slider: scale together · length: set all to it' : it.use || '';
    const g = many ? it.k / (base.get(it) || 1) : it.k;
    one('#sk').value = String(Math.round(Math.log2(g) * 100));
    one('#slen').value = (it.len * it.k).toFixed(1);
    const lens = sels.map(i => i.len * i.k), lo = Math.min(...lens), hi = Math.max(...lens);
    const nums = many
      ? [['TOGETHER ', `×${g.toFixed(2)}`, ''], ['NOW ', lo === hi ? `${lo.toFixed(1)} ${U}` : `${lo.toFixed(1)}–${hi.toFixed(1)} ${U}`, '']]
      : [['SIZE ', `×${it.k.toFixed(2)}`, ''], ['WAS ', `${it.len.toFixed(1)} ${U}`, '']];
    if (!many && ref && ref !== it) nums.push(['', `${(it.len * it.k / (ref.len * ref.k)).toFixed(2)}×`, ` ${D.refName || ref.name}`]);
    one('#snums').replaceChildren(...nums.map(([pre, bold, post]) => {
      const sp = document.createElement('span'), b = document.createElement('b');
      b.textContent = bold; sp.append(pre, b, post);
      return sp;
    }));
    one('#smatch').hidden = !many;
    one('#smatch').textContent = `SAME SIZE AS ${it.id}`;
    one('#ssame').hidden = same.length < 2 || same.every(i => sels.includes(i));
    one('#ssame').textContent = `ALL ${same.length} OF THESE`;
    one('#smrow').hidden = one('#smatch').hidden && one('#ssame').hidden && !matchMedia('(pointer: coarse)').matches;
  }
  function apply(f) { sels.forEach(i => { i.k = clampK(f(i)); }); relayout(); fill(); save(); draw(); Mock.refresh(); }
  const setK = k => apply(() => k);
  function save() {
    try {
      const o = {};
      items.forEach(i => { if (i.k !== 1) o[sid(i)] = i.k; });
      localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) { /* storage blocked: sizes are not kept */ }
  }
  const el = (tag, id, cls, text) => { const e = one(`#${id}`) || Object.assign(document.createElement(tag), { id, className: cls, textContent: text }); if (tag === 'button') e.type = 'button'; return e; };
  const hideBtn = el('button', 'shideit', 'kbtn', 'HIDE ITEM');
  // Only the FILTER menu can bring a hidden item back.
  hideBtn.hidden = !FACETS.length;
  if (!hideBtn.isConnected) one('#sreset').after(hideBtn);
  const mrow = el('div', 'smrow', 'srow'), sameBtn = el('button', 'ssame', 'kbtn', ''), matchBtn = el('button', 'smatch', 'kbtn', '');
  const addTap = el('button', 'smulti', 'tog', 'Add on tap');
  addTap.setAttribute('aria-pressed', addTap.getAttribute('aria-pressed') || 'false');
  if (!mrow.isConnected) { mrow.append(sameBtn, matchBtn, addTap); one('#snums').after(mrow); }
  one('#sk').addEventListener('input', e => {
    const g = Math.pow(2, e.target.value / 100);
    if (sels.length > 1) apply(i => (base.get(i) || 1) * g); else setK(g);
  }, sig);
  one('#slen').addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    if (v > 0) { apply(i => v / i.len); rebase(); fill(); }
  }, sig);
  one('#sreset').addEventListener('click', () => { setK(1); rebase(); fill(); }, sig);
  matchBtn.addEventListener('click', () => { const L = sel.len * sel.k; apply(i => L / i.len); rebase(); fill(); }, sig);
  sameBtn.addEventListener('click', () => {
    const add = items.filter(i => i.key === sel.key && shows(i) && !sels.includes(i));
    choose([...sels, ...add]);
  }, sig);
  addTap.addEventListener('click', () => addTap.setAttribute('aria-pressed', String(addTap.getAttribute('aria-pressed') !== 'true')), sig);
  hideBtn.addEventListener('click', () => { sels.forEach(i => hidden.add(sid(i))); select(null); changed(); }, sig);
  one('#sclose').addEventListener('click', () => select(null), sig);
  one('#sundo').addEventListener('click', () => { items.forEach(i => { i.k = 1; }); rebase(); save(); relayout(); if (sel) fill(); draw(); Mock.refresh(); }, sig);
  one('#zin').addEventListener('click', () => zoomAt(innerWidth / 2, innerHeight / 2, 1.5), sig);
  one('#zout').addEventListener('click', () => zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.5), sig);
  one('#zfit').addEventListener('click', fit, sig);
  one('#znames').addEventListener('click', e => { names = !names; e.currentTarget.setAttribute('aria-pressed', String(names)); draw(); }, sig);
  one('#sfold').addEventListener('click', () => {
    const m = !one('.picks').classList.contains('min');
    fold(m);
    if (!m && innerWidth <= 860) select(null);
  }, sig);
  if (!FACETS.length) Mock.keys({ Escape: () => select(null) });

  // The filter is one button and a small menu under it, built here so a page from an older starter
  // gets it on its next build. The menu shows one facet's chips at a time and floats over the sky.
  let panel = null, ftog = one('#sftog'), tab = FACETS[0]?.key;
  if (FACETS.length && one('.szoom')) {
    if (!ftog) {
      ftog = document.createElement('button'); ftog.id = 'sftog'; ftog.className = 'kbtn'; ftog.type = 'button';
      one('.szoom').prepend(ftog);
    }
    panel = document.createElement('div');
    panel.id = 'sfilter'; panel.className = 'sfpop'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Filter');
    document.body.appendChild(panel);
    ftog.setAttribute('aria-controls', 'sfilter');
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const tabs = el('div', 'sftabs'), chips = el('div', 'sfchips'), foot = el('div', 'sffoot'), gone = el('div', 'sfchips sfgone');
    const rowsSel = el('select'), clear = el('button', 'kbtn', 'RESET'), count = el('output');
    rowsSel.id = 'sfrows'; rowsSel.setAttribute('aria-label', 'Rows');
    ARRANGE.forEach(([k, t]) => { const o = el('option', null, t === 'As set' ? 'Rows as set' : t); o.value = k; rowsSel.append(o); });
    clear.type = 'button'; clear.id = 'sfclear'; count.id = 'sfcount';
    if (FACETS.length > 1) FACETS.forEach(f => { const t = el('button', null, f.name); t.type = 'button'; t.dataset.tab = f.key; tabs.append(t); });
    foot.append(rowsSel, count, clear);
    panel.append(tabs, chips, gone, foot);
    const fillChips = () => {
      const f = FACETS.find(x => x.key === tab);
      chips.replaceChildren(...f.values.map(v => {
        const c = el('button', null, v); c.type = 'button'; c.dataset.f = f.key; c.dataset.v = v;
        c.append(el('small', null, f.count[v]));
        return c;
      }));
    };
    panel.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.tab) { tab = t.dataset.tab; fillChips(); showFilter(); return; }
      if (t.dataset.f) {
        const st = filt[t.dataset.f], first = atStart();
        if (first) FACETS.forEach(f => filt[f.key].clear());
        if (st.has(t.dataset.v)) st.delete(t.dataset.v); else st.add(t.dataset.v);
        // Picked types go side by side: the first pick leaves the authored rows for One row.
        if (first && rowsBy === 'group') rowsBy = 'one';
      } else if (t.dataset.unhide) hidden.delete(t.dataset.unhide);
      else if (t === clear) load(START);
      else return;
      changed();
    }, sig);
    rowsSel.addEventListener('change', () => { rowsBy = rowsSel.value; changed(); }, sig);
    const place = () => {
      const r = one('.szoom').getBoundingClientRect();
      panel.style.top = `${r.bottom + 6}px`;
      panel.style.right = `${Math.max(16, Math.min(innerWidth - r.right, innerWidth - 16 - panel.offsetWidth))}px`;
    };
    const open = o => {
      panel.hidden = !o;
      if (o) { place(); if (innerWidth <= 860) { fold(true); select(null); } }
      showFilter();
    };
    ftog.addEventListener('click', () => open(panel.hidden), sig);
    document.addEventListener('pointerdown', e => { if (!panel.hidden && !panel.contains(e.target) && !ftog.contains(e.target)) open(false); }, sig);
    addEventListener('resize', () => { if (!panel.hidden) place(); }, sig);
    Mock.keys({ Escape: () => { if (!panel.hidden) open(false); else select(null); } });
    fillChips();
  }
  function changed() {
    touched = true;
    if (sels.some(i => !shows(i))) choose(sels.filter(shows));
    showFilter(); fit();
  }
  function showFilter() {
    if (!panel || !ftog) return;
    all('button[data-f]', panel).forEach(b => b.setAttribute('aria-pressed', String(filt[b.dataset.f].has(b.dataset.v))));
    all('button[data-tab]', panel).forEach(b => {
      const n = filt[b.dataset.tab].size;
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
      b.textContent = FACETS.find(f => f.key === b.dataset.tab).name + (n ? ` · ${n}` : '');
    });
    one('#sfrows').value = rowsBy;
    const gone = one('.sfgone', panel), out = items.filter(it => hidden.has(sid(it)));
    gone.replaceChildren(...out.map(it => {
      const c = document.createElement('button');
      c.type = 'button'; c.dataset.unhide = sid(it); c.textContent = `${it.id} ✕`; c.title = `Show ${it.name} again`;
      return c;
    }));
    gone.hidden = !out.length;
    if (out.length) gone.prepend(Object.assign(document.createElement('span'), { textContent: 'HIDDEN' }));
    const n = items.filter(shows).length, on = FACETS.reduce((a, f) => a + filt[f.key].size, 0);
    one('#sfcount').textContent = narrowed() ? `${n} of ${items.length}` : `All ${items.length}`;
    one('#sfclear').disabled = atStart() && rowsBy === (START.rowsBy || 'group');
    ftog.textContent = !atStart() && on ? `FILTER · ${on}` : 'FILTER';
    ftog.setAttribute('aria-expanded', String(!panel.hidden));
    if (touched) try { localStorage.setItem(VKEY, JSON.stringify({ filt: Object.fromEntries(FACETS.map(f => [f.key, [...filt[f.key]]])), rowsBy, hidden: [...hidden] })); } catch (e) { /* storage blocked: the filter is not kept */ }
  }

  // Where an item sits on screen, for a test or shot.js to click it.
  Mock.sizeAt = id => { const p = layout.find(q => q.it && q.it.id === id); return p && { x: view.x + (p.x + p.w / 2) * view.s, y: view.y + p.cy * view.s }; };

  // One compact line per change, so the whole list fits in as few sends as it can.
  Mock.picks = () => items.filter(i => i.k !== 1)
    .map(i => `${i.id} ${i.name}${i.use ? ` · ${i.use}` : ''}: ${i.len.toFixed(1)} → ${(i.len * i.k).toFixed(1)} ${U} (×${i.k.toFixed(2)})`)
    .join('\n');

  // On the board the sizes travel with the draft and the sent round (README: Hosted pages).
  Mock.hostPart('sizes', {
    label: 'SIZES',
    get: () => Object.fromEntries(items.filter(i => i.k !== 1).map(i => [sid(i), i.k])),
    set: o => { items.forEach(i => { const k = Number(o && o[sid(i)]); i.k = k > 0 ? clampK(k) : 1; }); rebase(); save(); relayout(); if (sel) fill(); draw(); Mock.refresh(); },
    said: () => { const n = items.filter(i => i.k !== 1).length; return n ? `${n} size change${n > 1 ? 's' : ''}` : ''; },
  });
  addEventListener('resize', () => { size(); draw(); }, sig);
  showFilter(); size(); relayout(); fit();
  Mock.refresh();
})();
