// Mock-up kit runtime. Markup drives it; see README.md. Exposes window.Mock.
(() => {
  // A republish swaps the new page into an open window and runs its scripts again: drop the last
  // run's listeners and loops, or every click lands twice and a toggle flips straight back.
  if (window.__mockKit) window.__mockKit.abort();
  const run = window.__mockKit = new AbortController();
  const on = { signal: run.signal };
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = {};
  const listeners = [];
  const keymap = {};
  let fitMode = 'auto';

  function pickers() {
    const out = {};
    $$('.seg[data-pick]').forEach(seg => {
      const k = seg.dataset.pick;
      out[k] = out[k] || { key: k, kind: 'seg', values: [] };
      $$('button[data-v]', seg).forEach(b => out[k].values.includes(b.dataset.v) || out[k].values.push(b.dataset.v));
    });
    $$('.tog[data-pick]').forEach(b => { out[b.dataset.pick] = { key: b.dataset.pick, kind: 'tog', values: [true, false] }; });
    return Object.values(out);
  }

  // "layout=A,B bg!=dim hud !cheat": every space-separated term must hold.
  function holds(expr) {
    return expr.trim().split(/\s+/).every(t => {
      let m;
      if ((m = t.match(/^([\w-]+)(!?=)(.*)$/))) {
        const hit = m[3].split(',').includes(String(state[m[1]]));
        return m[2] === '=' ? hit : !hit;
      }
      return t.startsWith('!') ? !state[t.slice(1)] : !!state[t];
    });
  }

  // Every .seg[data-verdict] grouped by its pick, in button order: "Build A, B. Later C. No D."
  // data-verdict names the idea, else its .pitch h3, else the pick key.
  function verdicts() {
    const segs = $$('.seg[data-verdict]');
    const order = [];
    const by = {};
    segs.forEach(seg => {
      $$('button[data-v]', seg).forEach(b => { if (!order.includes(b.dataset.v)) { order.push(b.dataset.v); by[b.dataset.v] = { label: b.textContent.trim(), names: [] }; } });
      const h = seg.closest('.pitch')?.querySelector('h3');
      const v = by[state[seg.dataset.pick]];
      const it = seg.closest('[data-item]');
      if (v) v.names.push(it ? itemTitle(it) : seg.dataset.verdict || (h ? h.textContent.trim() : seg.dataset.pick));
    });
    return order.filter(v => by[v].names.length).map(v => `${by[v].label} ${by[v].names.join(', ')}.`).join(' ');
  }

  // An item is any [data-item="E2"] element: the kit puts its label on it and its asks in it, and
  // {items} gives one line per item, "E2 Name: its picks".
  function itemName(it) {
    if (it.dataset.name) return it.dataset.name;
    const h = it.matches('tr') ? it.firstElementChild : it.querySelector('h3, h2');
    if (!h) return '';
    const c = h.cloneNode(true);
    c.querySelectorAll('.ilabel, .tag').forEach(e => e.parentNode.removeChild(e));
    return c.textContent.trim();
  }
  function itemTitle(it) { return `${it.dataset.item} ${itemName(it)}`.trim(); }
  function itemsText() {
    return $$('[data-item]').map(it => {
      const says = pickers().filter(p => {
        const el = document.querySelector(p.kind === 'tog' ? `.tog[data-pick="${p.key}"]` : `.seg[data-pick="${p.key}"]`);
        return el && el.closest('[data-item]') === it;
      }).map(p => say(p.key)).filter(Boolean);
      return says.length ? `${itemTitle(it)}: ${says.join(', ')}` : '';
    }).filter(Boolean).join('\n');
  }

  function say(k) {
    if (k === 'verdicts' && !(k in state)) return verdicts();
    if (k === 'items' && !(k in state)) return itemsText();
    const v = state[k];
    const tog = document.querySelector(`.tog[data-pick="${k}"]`);
    if (tog) return v ? (tog.dataset.sayOn ?? tog.textContent.trim()) : (tog.dataset.sayOff ?? '');
    const b = document.querySelector(`.seg[data-pick="${k}"] button[data-v="${CSS.escape(String(v))}"]`);
    return b ? (b.dataset.say ?? b.textContent.trim()) : String(v ?? '');
  }

  // data-format="PAUSE MENU: {layout}; behind it {bg}; {hud}": items split on ";", an item whose
  // {key} says nothing is dropped, the rest join with ", ".
  function picksText() {
    const pre = document.querySelector('.picks pre');
    if (!pre) return '';
    let t = Mock.picks ? Mock.picks(state, say) : (pre.dataset.format || '{items}').split(';').map(item => {
      let empty = false;
      const s = item.replace(/\{([\w-]+)\}/g, (_, k) => { const w = say(k); if (!w) empty = true; return w; }).trim();
      return empty ? '' : s;
    }).filter(Boolean).join(', ');
    // A component's own lines (a cost chart's changes) follow the page's picks.
    const extra = Mock.extras.map(f => f()).filter(Boolean);
    if (extra.length) t = [t, ...extra].filter(Boolean).join('\n');
    const note = document.querySelector('.picks textarea');
    if (note && note.value.trim()) t += `\nNotes: ${note.value.trim()}`;
    return t;
  }

  // Every pick is written onto each .stage as data-<key>, so a pick named after one of the stage's
  // own attributes would overwrite it: a pick `size` turned data-size into a pick value, and the
  // next fit (a window resize) read "4 × undefined" and drew the stage black. The stage's own keys
  // are read once from its markup and kept on the element, so a page run again still knows them.
  const camel = k => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  function stageOwn() {
    return new Set($$('.stage').flatMap(st => (st.__kitOwn ??= ['size', ...Object.keys(st.dataset)])));
  }
  function claim(k) {
    if (!stageOwn().has(camel(k))) return;
    const msg = `mock-up kit: the pick "${k}" clashes with the stage's own data-${k}; rename the pick`;
    let e = document.querySelector('.kfail');
    if (!e) { e = document.createElement('div'); e.className = 'kfail'; document.body.prepend(e); }
    e.textContent = msg.toUpperCase();
    throw new Error(msg);
  }

  // ---- words over the world: every word on a stage sits on a dark plate, clear of
  // what Mock.keep marks (ships, the HUD) and every other word. A [data-anchor="x,y"] label takes the first free spot
  // round its anchor; Mock.overlaps() lists whatever still clashes, and shot.js fails on it.
  const keepsNow = [];
  const hudMemo = new WeakMap();
  const scaleOf = st => (st.getBoundingClientRect().width / st.offsetWidth) || 1;
  const boxIn = (st, r) => { const S = st.getBoundingClientRect(), k = scaleOf(st); return [(r.left - S.left) / k, (r.top - S.top) / k, (r.right - S.left) / k, (r.bottom - S.top) / k]; };
  const grow = (r, p) => [r[0] - p, r[1] - p, r[2] + p, r[3] + p];
  const meets = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 1 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 1;
  const alpha = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return 0; const v = m[1].split(/[\s,/]+/).filter(Boolean); return v.length > 3 ? parseFloat(v[3]) * (v[3].endsWith('%') ? .01 : 1) : 1; };
  const shown = el => el.getClientRects().length > 0 && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true, opacityProperty: true }));

  // The HUD layer's opaque 8 px cells (from img.hudl's alpha), merged into runs along each row.
  function hudRuns(st) {
    const img = st.querySelector(':scope > img.hudl');
    if (!img || !img.complete || !img.naturalWidth) return [];
    if (hudMemo.has(img)) return hudMemo.get(img);
    const W = st.offsetWidth, H = st.offsetHeight, C = 8, out = [];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    const px = g.getImageData(0, 0, W, H).data;
    for (let y = 0; y < H; y += C) {
      let run = null;
      for (let x = 0; x < W; x += C) {
        let on = false;
        for (let yy = y; yy < Math.min(H, y + C) && !on; yy += 2) for (let xx = x; xx < Math.min(W, x + C); xx += 2) if (px[(yy * W + xx) * 4 + 3] > 40) { on = true; break; }
        if (on && run) run[2] = x + C; else if (on) run = [x, y, x + C, y + C]; else if (run) { out.push(run); run = null; }
      }
      if (run) out.push(run);
    }
    hudMemo.set(img, out);
    return out;
  }

  function keeps(st) {
    const out = [];
    (st.dataset.keepout || '').split(';').map(s => s.trim()).filter(Boolean).forEach(s => out.push({ box: s.split(',').map(Number), name: `keep-out ${s}` }));
    $$('[data-keep]', st).forEach(e => { if (shown(e)) out.push({ box: boxIn(st, e.getBoundingClientRect()), name: e.dataset.keep || 'a kept ' + e.tagName.toLowerCase(), el: e }); });
    keepsNow.forEach(k => { if (!k.st || k.st === st) out.push(k); });
    hudRuns(st).forEach(b => out.push({ box: b, name: 'the HUD', hud: true }));
    return out;
  }

  // The element a run of words moves with: an svg <text>, else the nearest absolutely placed box.
  function groupOf(st, el) {
    if (el.closest('svg')) return el.closest('text') || el;
    for (let a = el; a && a !== st; a = a.parentElement) {
      const p = getComputedStyle(a).position;
      if (p === 'absolute' || p === 'fixed' || a.parentElement === st) return a;
    }
    return el;
  }

  function texts(st) {
    const out = [];
    const w = document.createTreeWalker(st, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest('style, script, .ktoast') || !shown(el)) continue;
      const grp = groupOf(st, el);
      if (el.closest('svg')) { const r = el.getBoundingClientRect(); if (r.width > .5) out.push({ box: boxIn(st, r), el, grp }); continue; }
      const rg = document.createRange(); rg.selectNodeContents(n);
      [...rg.getClientRects()].forEach(r => { if (r.width > .5 && r.height > .5) out.push({ box: boxIn(st, r), el, grp }); });
    }
    return out;
  }

  // A plate: an ancestor with a background at least 55% opaque, or for svg text a filled shape under it.
  function plated(st, el, box) {
    if (el.closest('[data-noplate]')) return true;
    const svg = el.closest('svg');
    if (svg) return [...svg.querySelectorAll('rect, path, polygon')].some(r => {
      const cs = getComputedStyle(r), b = boxIn(st, r.getBoundingClientRect());
      return cs.fill !== 'none' && alpha(cs.fill) * parseFloat(cs.fillOpacity || 1) * parseFloat(cs.opacity || 1) >= .55 && b[0] <= box[0] + 1 && b[1] <= box[1] + 1 && b[2] >= box[2] - 1 && b[3] >= box[3] - 1;
    });
    for (let a = el; a && a !== st; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (alpha(cs.backgroundColor) >= .55 || cs.backgroundImage !== 'none') return true;
    }
    return false;
  }

  function leadsOf(st) {
    let s = st.querySelector(':scope > svg.kleads');
    if (!s) { s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'kleads'); s.setAttribute('aria-hidden', 'true'); st.appendChild(s); }
    s.setAttribute('viewBox', `0 0 ${st.offsetWidth} ${st.offsetHeight}`);
    return s;
  }

  function layout() {
    $$('.stage').forEach(st => {
      const free = $$('[data-anchor]', st).filter(shown);
      const leads = st.querySelector(':scope > svg.kleads');
      if (leads) leads.replaceChildren();
      if (!free.length) return;
      const W = st.offsetWidth, H = st.offsetHeight, area = W * H;
      const taken = keeps(st);
      // Placed words claim their plate when it is small, else just their own lines.
      const seen = new Set();
      texts(st).filter(t => !t.el.closest('[data-anchor]')).forEach(t => {
        if (seen.has(t.grp)) return;
        const b = boxIn(st, t.grp.getBoundingClientRect());
        if ((b[2] - b[0]) * (b[3] - b[1]) < area * .25) { seen.add(t.grp); taken.push({ box: b }); } else taken.push({ box: t.box });
      });
      free.forEach(e => {
        const [ax, ay] = e.dataset.anchor.split(',').map(Number);
        const w = e.offsetWidth, h = e.offsetHeight, gap = Number(e.dataset.gap || 14);
        const base = { right: [ax + gap, ay - h / 2], left: [ax - gap - w, ay - h / 2], below: [ax - w / 2, ay + gap], above: [ax - w / 2, ay - gap - h] };
        const sides = (e.dataset.prefer || 'right,left,below,above').split(',').map(x => x.trim()).filter(x => base[x]);
        let best = null;
        for (let ring = 0; ring <= 10 && !best; ring++) {
          const offs = ring ? [[0, ring * 12], [0, -ring * 12], [ring * 14, 0], [-ring * 14, 0], [ring * 14, ring * 12], [-ring * 14, ring * 12], [ring * 14, -ring * 12], [-ring * 14, -ring * 12]] : [[0, 0]];
          for (const sd of sides) {
            for (const [dx, dy] of offs) {
              const r = [base[sd][0] + dx, base[sd][1] + dy, base[sd][0] + dx + w, base[sd][1] + dy + h];
              if (r[0] >= 4 && r[1] >= 4 && r[2] <= W - 4 && r[3] <= H - 4 && !taken.some(t => meets(grow(r, 4), t.box))) { best = r; break; }
            }
            if (best) break;
          }
        }
        const r = best || [base[sides[0]][0], base[sides[0]][1], base[sides[0]][0] + w, base[sides[0]][1] + h];
        e.style.left = r[0] + 'px'; e.style.top = r[1] + 'px';
        e.toggleAttribute('data-unplaced', !best);
        taken.push({ box: r });
        if (e.hasAttribute('data-leader')) {
          const x = Math.max(r[0], Math.min(r[2], ax)), y = Math.max(r[1], Math.min(r[3], ay));
          const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          [['x1', ax], ['y1', ay], ['x2', x], ['y2', y]].forEach(([k, v]) => l.setAttribute(k, v));
          l.style.stroke = getComputedStyle(e).color;
          leadsOf(st).appendChild(l);
        }
      });
    });
  }

  function overlaps() {
    const out = [];
    $$('.stage').forEach(st => {
      if (!shown(st)) return;
      const ts = texts(st), ks = keeps(st), W = st.offsetWidth, H = st.offsetHeight;
      const nm = t => `"${(t.grp.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`;
      ts.forEach((t, i) => {
        if (t.box[0] < -1 || t.box[1] < -1 || t.box[2] > W + 1 || t.box[3] > H + 1) out.push(`${nm(t)} runs off the stage`);
        if (!plated(st, t.el, t.box)) out.push(`${nm(t)} has no plate behind it`);
        if (t.el.closest('[data-unplaced]')) out.push(`${nm(t)} found no free spot near its anchor`);
        ks.forEach(k => {
          if ((k.hud && t.el.closest('[data-over-hud]')) || (k.el && k.el.contains(t.el))) return;
          if (meets(t.box, k.box)) out.push(`${nm(t)} is over ${k.name}`);
        });
        for (let j = i + 1; j < ts.length; j++) if (ts[j].grp !== t.grp && !ts[j].grp.contains(t.grp) && !t.grp.contains(ts[j].grp) && meets(t.box, ts[j].box)) out.push(`${nm(t)} is over ${nm(ts[j])}`);
      });
    });
    return [...new Set(out)];
  }

  function render(changed) {
    $$('.seg[data-pick]').forEach(seg => $$('button[data-v]', seg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(state[seg.dataset.pick])))));
    $$('.tog[data-pick]').forEach(b => b.setAttribute('aria-pressed', String(!!state[b.dataset.pick])));
    $$('.stage').forEach(st => Object.entries(state).forEach(([k, v]) => { st.dataset[camel(k)] = String(v); }));
    $$('[data-when]').forEach(el => el.classList.toggle('k-on', holds(el.dataset.when)));
    keepsNow.length = 0;
    listeners.forEach(fn => fn(state, changed));
    layout();
    const pre = document.querySelector('.picks pre');
    if (pre) pre.textContent = picksText();
    save();
    pulse();
  }

  function set(k, v) { claim(k); state[k] = v; render(k); }

  function toast(text, ms = 1600) {
    $$('.stage').forEach(st => {
      if (!st.getClientRects().length) return;
      let e = st.querySelector(':scope > .ktoast');
      if (!e) { e = document.createElement('div'); e.className = 'ktoast'; st.appendChild(e); }
      e.textContent = text; e.classList.add('on');
      clearTimeout(e.h); e.h = setTimeout(() => e.classList.remove('on'), ms);
    });
  }

  function replay(root) {
    (root ? [root] : $$('.stage')).forEach(st => st.getAnimations({ subtree: true }).forEach(a => { a.cancel(); a.play(); }));
    listeners.forEach(fn => fn(state, 'replay'));
  }

  function fit() {
    $$('.stagebox').forEach(box => {
      const st = box.querySelector('.stage');
      if (!st) return;
      const [w, h] = (st.dataset.size || '1440x900').split('x').map(Number);
      st.style.setProperty('--w', w + 'px'); st.style.setProperty('--h', h + 'px');
      $$('canvas.fx, canvas.fxtop', st).forEach(c => { if (!c.hasAttribute('width')) { c.width = w; c.height = h; } });
      const room = box.clientWidth;
      const k = fitMode === 'real' ? 1 : Math.min(1, room / w);
      st.style.setProperty('--fit', k);
      box.style.height = (h * k + (fitMode === 'real' && room < w ? 14 : 0)) + 'px';
      box.classList.toggle('scroll', fitMode === 'real' && room < w);
      const bar = box.previousElementSibling;
      if (bar && bar.classList.contains('stagebar')) {
        bar.querySelector('span').textContent = `${w} × ${h} · ` + (k < 1 ? `SHOWN AT ${Math.round(k * 100)}%` : 'SHOWN 1:1, REAL SIZE');
        const btn = bar.querySelector('button');
        btn.hidden = room >= w;
        btn.textContent = fitMode === 'real' ? 'FIT TO PAGE' : 'VIEW 1:1';
      }
    });
  }

  function wireStagebars() {
    $$('.stagebox').forEach(box => {
      if (box.hasAttribute('data-nobar') || (box.previousElementSibling && box.previousElementSibling.classList.contains('stagebar'))) return;
      const bar = document.createElement('div');
      bar.className = 'stagebar';
      bar.innerHTML = '<span></span><button class="kbtn" type="button"></button>';
      bar.querySelector('button').onclick = () => { fitMode = fitMode === 'real' ? 'auto' : 'real'; fit(); };
      box.before(bar);
    });
  }

  // .inset.live copies the stage's picture layers (img.bg, canvas.fx, img.hudl, canvas.fxtop, as
  // shown), so a moving ship can be watched up close. It redraws on a pulse (a player or Mock.frame
  // step, a pick, a data-at change), never on a loop of its own, and only while on screen.
  const lives = [];
  let livePending = false;
  function pulse() {
    if (livePending || !lives.length) return;
    livePending = true;
    requestAnimationFrame(() => { livePending = false; if (!run.signal.aborted) lives.forEach(f => f()); });
  }
  function wireLive(box) {
    const st = document.querySelector(box.dataset.stage || '.stage');
    if (!st) return;
    const [w, h] = (box.dataset.size || '720x360').split('x').map(Number);
    const [sw] = (st.dataset.size || '1440x900').split('x').map(Number);
    const cv = document.createElement('canvas');
    cv.className = 'zoom'; cv.width = w; cv.height = h; box.prepend(cv);
    const c = cv.getContext('2d');
    c.imageSmoothingQuality = 'high';
    let seen = true;
    if (window.IntersectionObserver) {
      const io = new IntersectionObserver(es => { seen = es[es.length - 1].isIntersecting; if (seen) pulse(); });
      io.observe(box); run.signal.addEventListener('abort', () => io.disconnect());
    }
    const mo = new MutationObserver(pulse);
    mo.observe(box, { attributes: true, attributeFilter: ['data-at', 'data-zoom'] });
    run.signal.addEventListener('abort', () => mo.disconnect());
    $$(':scope > img', st).forEach(i => i.addEventListener('load', pulse, on));
    lives.push(() => {
      if (!seen || !box.getClientRects().length) return;
      const [x, y] = box.dataset.at.split(',').map(Number);
      const k = Number(box.dataset.zoom || 4);
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      $$(':scope > img.bg, :scope > canvas, :scope > img.hudl', st).forEach(l => {
        if (!l.getClientRects().length || (l.tagName === 'IMG' && !l.naturalWidth)) return;
        const r = (l.tagName === 'IMG' ? l.naturalWidth : l.width) / sw;
        c.drawImage(l, (x - w / 2 / k) * r, (y - h / 2 / k) * r, w / k * r, h / k * r, 0, 0, w, h);
      });
    });
    pulse();
  }
  // .inset[data-at="x,y"][data-zoom][data-size]: the img's crop round (x, y), drawn zoom times
  // over into a canvas of data-size; a canvas.fx inside gets the same size, for drawing over it.
  function wireInsets() {
    $$('.inset.live[data-at]').forEach(box => { if (!box.querySelector('canvas.zoom')) wireLive(box); });
    $$('.inset[data-at]:not(.live)').forEach(box => {
      const img = box.querySelector('img');
      if (!img || box.querySelector('canvas.zoom')) return;
      const [w, h] = (box.dataset.size || '720x360').split('x').map(Number);
      const [x, y] = box.dataset.at.split(',').map(Number);
      const k = Number(box.dataset.zoom || 4);
      const cv = document.createElement('canvas');
      cv.className = 'zoom'; cv.width = w; cv.height = h; box.prepend(cv);
      $$('canvas.fx', box).forEach(c => { if (!c.hasAttribute('width')) { c.width = w; c.height = h; } });
      const draw = () => {
        const c = cv.getContext('2d');
        c.imageSmoothingQuality = 'high';
        c.drawImage(img, x - w / 2 / k, y - h / 2 / k, w / k, h / k, 0, 0, w, h);
      };
      if (img.complete && img.naturalWidth) draw(); else img.addEventListener('load', draw, on);
    });
  }

  function wireCompare() {
    $$('.compare').forEach(c => {
      const imgs = $$('img', c);
      if (imgs.length !== 2 || c.querySelector('.cbox')) return;
      const box = document.createElement('div'); box.className = 'cbox';
      imgs.forEach(i => box.appendChild(i));
      box.insertAdjacentHTML('beforeend', '<i class="cline"></i><input type="range" min="0" max="100" value="50">');
      const labs = document.createElement('div'); labs.className = 'clabs';
      [`◂ ${c.dataset.before || 'TODAY'}`, `${c.dataset.after || 'MOCK-UP'} ▸`].forEach(t => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = t; labs.appendChild(b);
      });
      c.append(box, labs);
      const r = box.querySelector('input');
      r.setAttribute('aria-label', `${c.dataset.before || 'TODAY'} versus ${c.dataset.after || 'MOCK-UP'}`);
      const at = v => { r.value = v; box.style.setProperty('--at', v + '%'); };
      r.oninput = () => at(r.value);
      const [b0, b1] = $$('button', labs);
      b0.onclick = () => at(100); b1.onclick = () => at(0);
    });
  }

  function wireStills() {
    let lb = null;
    $$('.stills img').forEach(img => img.addEventListener('click', () => {
      if (!lb) {
        lb = document.createElement('div'); lb.className = 'klight'; lb.innerHTML = '<img alt="">';
        lb.onclick = () => lb.classList.remove('on');
        document.body.appendChild(lb);
      }
      const big = lb.querySelector('img'); big.src = img.dataset.full || img.src; big.alt = img.alt;
      lb.classList.add('on');
    }, on));
    keymap.__escStills = () => { if (lb && lb.classList.contains('on')) { lb.classList.remove('on'); return true; } return false; };
  }

  // Sends post through the comments capability (publish with {"comments": {}}); a press wakes the
  // thread that published the page. Where it cannot send, an ask copies its text instead and SEND
  // PICKS waits, disabled, with the reason beside it: COPY always works.
  const ASKS = {
    more: ['Tell me more', 'Explain this item in chat: background, context, why it is here.'],
    clarify: ['Clarify', "I don't follow it. Break this item down on the page, step by step, and tell me in chat when it's up."],
    context: ['Show me in context', 'Show this item in context on the page: drawn into the app at real size, or animated if it moves.'],
    animate: ['Animate', 'Turn this picture into a short animation on the page, from real frames of the app where possible.'],
  };
  const WHY = {
    available: 'LINKED · SENDS REACH THE THREAD',
    writers_only: "ONLY THE PAGE'S EDITORS CAN SEND · USE COPY",
    no_session: 'NO THREAD IS LISTENING · USE COPY',
    off: 'NOT LINKED · USE COPY',
  };
  let comments = null;
  let canSend = 'off';
  const pageName = () => document.title.trim() || 'Mock-up';
  function flash(btn, t) {
    const ok = btn.parentElement.querySelector('.ok');
    if (!ok) return;
    ok.textContent = t; clearTimeout(ok.h); ok.h = setTimeout(() => ok.textContent = '', 3200);
  }
  function sendState() {
    const ok = canSend === 'available';
    $$('[data-send]').forEach(b => { b.hidden = false; b.disabled = !ok; });
    $$('.picks .kstate').forEach(s => { s.textContent = WHY[canSend] || WHY.off; s.classList.toggle('on', ok); });
    $$('.kask').forEach(b => { b.title = ok ? 'Ask the thread' : 'Copies this ask for the chat'; });
  }
  async function checkSend() {
    if (run.signal.aborted || !comments) return;
    try { canSend = await comments.canSendToClaude(); } catch (e) { canSend = 'off'; }
    if (!run.signal.aborted) sendState();
  }
  // A send that cannot go copies its own text instead, so the fallback is always the right line.
  async function fallback(btn, text, why) {
    try { await navigator.clipboard.writeText(text); flash(btn, `${why}COPIED · PASTE IT IN THE CHAT`); }
    catch (e) { flash(btn, `${why}${text}`); }
  }
  // sendToClaude refuses over 4096 bytes of UTF-8 (→ × · are three each), and every send needs its
  // own press: a longer text goes in parts on line breaks, one press each, "PART 2 OF 3" on the button.
  const SEND_MAX = 3900;
  const bytes = t => new TextEncoder().encode(t).length;
  function parts(head, body) {
    let out = [];
    let cur = [];
    const room = SEND_MAX - bytes(head) - 40;
    body.split('\n').forEach(l => {
      if (bytes(l) > room && cur.length) { out.push(cur); cur = []; }
      while (bytes(l) > room) { let n = l.length; while (bytes(l.slice(0, n)) > room) n = Math.floor(n * .9); out.push([l.slice(0, n)]); l = l.slice(n); }
      if (bytes([...cur, l].join('\n')) > room) { out.push(cur); cur = []; }
      cur.push(l);
    });
    if (cur.length) out.push(cur);
    out = out.filter(c => c.some(l => l.trim()));
    return out.length < 2 ? [`${head}\n${body}`] : out.map((c, i) => `${head} · PART ${i + 1} OF ${out.length}\n${c.join('\n')}`);
  }
  function sendParts(btn, el, head, body) {
    const all = parts(head, body);
    const key = all.join('\u0000');
    if (btn.kparts?.key !== key) btn.kparts = { key, all, i: 0, label: btn.kparts?.label || btn.textContent };
    const k = btn.kparts;
    const text = k.all[k.i];
    send(btn, el, text, () => {
      k.i = (k.i + 1) % k.all.length;
      btn.textContent = k.i ? `SEND PART ${k.i + 1} OF ${k.all.length}` : k.label;
    });
  }
  async function send(btn, el, text, done) {
    if (bytes(text) > 4096) return fallback(btn, text, 'TOO LONG TO SEND · ');
    btn.disabled = true;
    try {
      await comments.sendToClaude({ anchor: await comments.anchorFor(el), text });
      btn.classList.add('sent');
      flash(btn, 'SENT TO THE THREAD');
      if (done) done();
    } catch (e) {
      fallback(btn, text, `NOT SENT (${(e && e.code) || 'error'}) · `);
      if (e && e.code === 'claude_unavailable') checkSend();
    } finally { btn.disabled = btn.matches('[data-send]') && canSend !== 'available'; }
  }
  function ask(btn) {
    const it = btn.closest('[data-item]');
    const k = btn.dataset.ask;
    const fb = k === 'animate' && it.querySelector('.flip');
    if (fb) return flipPlay(fb, true);
    const text = `${pageName()} · ${itemTitle(it)}\n${ASKS[k][0]}: ${ASKS[k][1]}`;
    if (canSend === 'available') return send(btn, it, text);
    fallback(btn, text, '');
  }
  function sendPicks(btn) {
    const picks = picksText();
    if (!picks.trim()) return flash(btn, 'NOTHING PICKED YET');
    const v = document.querySelector('.picks [data-notes]');
    const tail = !v ? '' : v.getAttribute('aria-pressed') === 'true'
      ? '\n\nVoice notes follow in chat: wait for them before acting.'
      : '\n\nNo voice notes coming: go ahead on these picks.';
    sendParts(btn, btn.closest('.picks') || btn, `${pageName()} · PICKS`, `${picks}${tail}`.replace(/^\n+/, ''));
  }
  function wireItems() {
    $$('[data-item]').forEach(it => {
      const row = it.matches('tr');
      if (!it.querySelector('.ilabel')) {
        const l = document.createElement('b'); l.className = 'ilabel'; l.textContent = it.dataset.item;
        const h = row ? it.firstElementChild : it.querySelector('h3, h2');
        if (h) h.prepend(l, ' '); else it.prepend(l);
      }
      const keys = (it.dataset.asks ?? 'more').split(/\s+/).filter(k => ASKS[k]);
      if (keys.length && !it.querySelector('.kasks')) {
        const box = document.createElement('span'); box.className = 'kasks';
        keys.forEach(k => {
          const b = document.createElement('button');
          b.className = 'kbtn kask'; b.type = 'button'; b.dataset.ask = k; b.textContent = ASKS[k][0];
          box.append(b);
        });
        const ok = document.createElement('span'); ok.className = 'ok'; box.append(ok);
        (row ? it.lastElementChild : it.querySelector('.body') || it).append(box);
      }
    });
  }
  async function wireSend() {
    $$('.picks [data-send]').forEach(b => {
      if (b.parentElement.querySelector('.kstate')) return;
      const s = document.createElement('span'); s.className = 'kstate'; s.setAttribute('aria-live', 'polite');
      b.parentElement.append(s);
    });
    sendState();
    try { comments = await window.claude?.use?.('comments'); } catch (e) { comments = null; }
    if (!comments || run.signal.aborted) return;
    // Watching sessions are learned after load, so the first answer can be no_session.
    await checkSend();
    [4000, 12000].forEach(ms => setTimeout(checkSend, ms));
  }

  // A stat table: a cell with data-was="120" that now says 140 shows "120 → 140", marked. With
  // data-pick-rows each labelled row gets its own Keep / Change / Drop.
  function wireStats() {
    $$('table.stats').forEach(t => {
      if (t.kstats) return;
      t.kstats = true;
      if (!t.parentElement.matches('.statbox')) {
        const box = document.createElement('div'); box.className = 'statbox';
        t.before(box); box.append(t);
      }
      $$('td[data-was]', t).forEach(td => {
        const now = td.textContent.trim();
        if (now === td.dataset.was.trim()) return;
        td.classList.add('changed');
        const was = document.createElement('s'); was.textContent = td.dataset.was;
        td.prepend(was, ' → ');
      });
      if (!t.hasAttribute('data-pick-rows')) return;
      const head = t.querySelector('thead tr');
      if (head) { const th = document.createElement('th'); th.textContent = 'PICK'; head.append(th); }
      $$('tbody tr', t).forEach(tr => {
        const td = document.createElement('td');
        if (tr.dataset.item) {
          const seg = document.createElement('div'); seg.className = 'seg';
          seg.dataset.pick = `row-${tr.dataset.item.toLowerCase()}`; seg.dataset.verdict = '';
          td.append(seg);
        }
        tr.append(td);
      });
    });
  }

  // The round banner: what changed since the last round, by label. Each label scrolls to its item,
  // and the item gets a CHANGED / NEW tag.
  function wireRound() {
    $$('.round[data-round]').forEach(b => {
      if (b.kround) return;
      b.kround = true;
      const head = document.createElement('div'); head.className = 'roundhead';
      const n = document.createElement('b'); n.textContent = `ROUND ${b.dataset.round}`;
      head.append(n);
      [['changed', 'CHANGED'], ['new', 'NEW'], ['dropped', 'GONE']].forEach(([k, word]) => {
        const labels = (b.dataset[k] || '').split(/\s+/).filter(Boolean);
        if (!labels.length) return;
        const g = document.createElement('span'); g.className = `rgroup r-${k}`;
        g.append(word);
        labels.forEach(l => {
          const it = document.querySelector(`[data-item="${CSS.escape(l)}"]`);
          const chip = document.createElement(it ? 'button' : 'span');
          chip.className = 'rchip'; chip.textContent = l;
          if (it) {
            chip.type = 'button';
            chip.addEventListener('click', () => it.scrollIntoView({ behavior: 'smooth', block: 'center' }), on);
            if (k !== 'dropped' && !it.querySelector('.tag.rtag')) {
              const tag = document.createElement('span'); tag.className = `tag rtag r-${k}`; tag.textContent = word;
              const h = it.matches('tr') ? it.firstElementChild : it.querySelector('h3, h2');
              if (h && !it.matches('tr')) h.after(tag); else (h || it).append(tag);
              it.classList.add(`k-${k}`);
            }
          }
          g.append(' ', chip);
        });
        head.append(g);
      });
      b.prepend(head);
    });
  }

  // A player for a scripted animation: play once to the end, pause, speeds, a scrub bar and a
  // caption per phase. draw(t) gets the time in seconds; phases are [[t, 'caption'], ...].
  function player(host, o = {}) {
    host = typeof host === 'string' ? document.querySelector(host) : host;
    const len = o.length || 10;
    const speeds = o.speeds || [1];
    const phases = o.phases || [];
    let t = 0, speed = o.speed || speeds[0], playing = false, tok = 0;
    host.classList.add('player');
    host.innerHTML = '<button class="kbtn pplay" type="button"></button><span class="pspeeds"></span><input class="pscrub" type="range" min="0" step="any" aria-label="Time"><span class="ptime"></span><p class="pcap"></p>';
    const btn = host.querySelector('.pplay'), scrub = host.querySelector('.pscrub');
    const time = host.querySelector('.ptime'), cap = host.querySelector('.pcap'), sp = host.querySelector('.pspeeds');
    scrub.max = String(len);
    cap.hidden = !phases.length;
    const fmt = s => len >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${s.toFixed(1)} S`;
    const speedBtns = speeds.length > 1 ? speeds.map(v => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'kbtn'; b.textContent = `${v}×`;
      b.addEventListener('click', () => { speed = v; bar(); }, on);
      sp.append(b); return [v, b];
    }) : [];
    function bar() {
      btn.textContent = playing ? '❚❚ PAUSE' : t >= len ? '↻ AGAIN' : '▶ PLAY';
      speedBtns.forEach(([v, b]) => b.setAttribute('aria-pressed', String(v === speed)));
    }
    function show() {
      scrub.value = String(t);
      time.textContent = `${fmt(t)} / ${fmt(len)}`;
      const ph = phases.filter(p => p[0] <= t).pop();
      cap.textContent = ph ? ph[1] : '';
      if (o.draw) o.draw(t);
      pulse();
    }
    function play() {
      if (t >= len) t = 0;
      playing = true;
      const k = ++tok;
      let last = performance.now();
      const tick = now => {
        if (run.signal.aborted || !playing || k !== tok) return;
        t = Math.min(len, t + Math.max(0, now - last) / 1000 * speed); last = now;
        show();
        if (t >= len) { playing = false; bar(); return; }
        requestAnimationFrame(tick);
      };
      bar(); requestAnimationFrame(tick);
    }
    function pause() { playing = false; bar(); }
    function seek(v) { t = Math.max(0, Math.min(len, v)); show(); bar(); }
    btn.addEventListener('click', () => (playing ? pause() : play()), on);
    scrub.addEventListener('input', () => { playing = false; seek(Number(scrub.value)); }, on);
    seek(o.start || 0);
    // The stage's canvases are sized when the kit starts, which clears them: draw again then.
    ready(show);
    return { play, pause, seek, get t() { return t; }, get playing() { return playing; } };
  }

  // Picks and the note survive a republish (a Clarify or Show me in context answer reloads the
  // page): kept per viewer in localStorage, keyed by the title, the h1 and the round banner's round,
  // so a new round starts clean.
  const saveKey = () => `mock-picks:${pageName()}|${(document.querySelector('h1')?.textContent || '').trim()}|${document.querySelector('.round[data-round]')?.dataset.round || ''}`;
  function save() {
    try {
      const s = {};
      pickers().forEach(p => { s[p.key] = state[p.key]; });
      const n = document.querySelector('.picks textarea');
      const v = document.querySelector('.picks [data-notes]');
      localStorage.setItem(saveKey(), JSON.stringify({ s, n: n ? n.value : '', v: v ? v.getAttribute('aria-pressed') : null }));
    } catch (e) { /* storage blocked: the picks just are not kept */ }
  }
  function restore() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(saveKey()) || 'null'); } catch (e) { return; }
    if (!d || typeof d !== 'object') return;
    pickers().forEach(p => {
      if (!d.s || !(p.key in d.s)) return;
      const v = d.s[p.key];
      const open = v === '' && document.querySelector(`.seg[data-pick="${p.key}"][data-verdict]`);
      if (p.kind === 'tog' ? typeof v === 'boolean' : open || p.values.includes(v)) state[p.key] = v;
    });
    const n = document.querySelector('.picks textarea');
    if (n && typeof d.n === 'string' && !n.value) n.value = d.n;
    const v = document.querySelector('.picks [data-notes]');
    if (v && (d.v === 'true' || d.v === 'false')) v.setAttribute('aria-pressed', d.v);
  }

  // A flipbook: real frames of the app stacked in one tall picture (strip.py), played at their own rate.
  // A press plays it once and holds the last frame; Animate on its item does the same.
  function flipShow(fb, i) {
    const f = fb.kflip;
    f.i = Math.max(0, Math.min(f.n - 1, i));
    f.view.style.backgroundPosition = `0 ${f.n > 1 ? (f.i / (f.n - 1)) * 100 : 0}%`;
    f.time.textContent = `FRAME ${f.i + 1} / ${f.n} · ${(f.i / f.fps).toFixed(1)} S · ${f.fps} FPS`;
  }
  function flipBar(fb) {
    const f = fb.kflip;
    f.play.textContent = f.playing ? '❚❚ PAUSE' : '▶ PLAY';
  }
  function flipPlay(fb, fromStart) {
    const f = fb.kflip;
    if (!f) return;
    if (f.playing && !fromStart) { f.playing = false; flipBar(fb); return; }
    if (fromStart || f.i >= f.n - 1) flipShow(fb, 0);
    f.playing = true;
    const tok = ++f.tok;
    const t0 = performance.now();
    const i0 = f.i;
    const tick = now => {
      if (run.signal.aborted || !f.playing || tok !== f.tok) return;
      const i = Math.min(f.n - 1, i0 + Math.floor((now - t0) / 1000 * f.fps));
      flipShow(fb, i);
      if (i >= f.n - 1) { f.playing = false; flipBar(fb); return; }
      requestAnimationFrame(tick);
    };
    flipBar(fb);
    requestAnimationFrame(tick);
  }
  function wireFlips() {
    $$('.flip[data-src][data-frames]').forEach(fb => {
      if (fb.kflip) return;
      const n = Math.max(1, Number(fb.dataset.frames) || 1);
      const view = document.createElement('div');
      view.className = 'flipview'; view.setAttribute('role', 'img');
      view.setAttribute('aria-label', fb.dataset.alt || `${n} frames from the app`);
      view.style.backgroundImage = `url("${fb.dataset.src}")`;
      view.style.backgroundSize = `100% ${n * 100}%`;
      const bar = document.createElement('div'); bar.className = 'flipbar';
      bar.innerHTML = '<button class="kbtn" type="button" data-flip="back" aria-label="Back one frame">◀</button><button class="kbtn" type="button" data-flip="play"></button><button class="kbtn" type="button" data-flip="fwd" aria-label="Forward one frame">▶</button><span class="fliptime"></span>';
      fb.prepend(view, bar);
      fb.kflip = { n, fps: Number(fb.dataset.fps) || 10, i: 0, tok: 0, playing: false, view, play: bar.querySelector('[data-flip="play"]'), time: bar.querySelector('.fliptime') };
      const img = new Image();
      img.onload = () => { view.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight / n}`; };
      img.src = fb.dataset.src;
      flipShow(fb, 0); flipBar(fb);
    });
  }
  function flipButton(t) {
    const fb = t.closest('.flip');
    if (!fb || !fb.kflip) return;
    const f = fb.kflip;
    if (t.dataset.flip === 'play') return flipPlay(fb, false);
    f.playing = false; flipBar(fb);
    flipShow(fb, f.i + (t.dataset.flip === 'fwd' ? 1 : -1));
  }

  async function copy(btn) {
    const pre = document.querySelector('.picks pre');
    const ok = btn.parentElement.querySelector('.ok');
    const say = t => { if (ok) { ok.textContent = t; clearTimeout(ok.h); ok.h = setTimeout(() => ok.textContent = '', 2200); } };
    try { await navigator.clipboard.writeText(pre.textContent); say('COPIED'); }
    catch (e) {
      const r = document.createRange(); r.selectNodeContents(pre);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      say('SELECTED · PRESS ⌘C');
    }
  }

  function init() {
    stageOwn();
    wireStats(); wireRound();
    // A verdict starts with nothing picked, so an item the reviewer skips stays out of the picks.
    $$('.seg[data-verdict]').forEach(seg => {
      if (!seg.querySelector('button[data-v]')) seg.innerHTML = '<button data-v="keep">Keep</button><button data-v="change">Change</button><button data-v="drop">Drop</button>';
    });
    pickers().forEach(p => {
      claim(p.key);
      if (p.key in state) return;
      if (p.kind === 'tog') state[p.key] = document.querySelector(`.tog[data-pick="${p.key}"]`).getAttribute('aria-pressed') === 'true';
      else {
        const seg = document.querySelector(`.seg[data-pick="${p.key}"]`);
        const on = seg.querySelector('button[aria-pressed="true"]');
        state[p.key] = on ? on.dataset.v : seg.matches('[data-verdict]') ? '' : p.values[0];
      }
    });
    restore();
    document.addEventListener('click', e => {
      const t = e.target.closest('button, [data-set], [data-toast], [data-replay], [data-copy]');
      if (!t) return;
      if (t.matches('.seg[data-pick] button[data-v]')) {
        const seg = t.closest('.seg');
        const k = seg.dataset.pick;
        set(k, seg.matches('[data-verdict]') && state[k] === t.dataset.v ? '' : t.dataset.v);
      }
      else if (t.matches('.tog[data-pick]')) set(t.dataset.pick, !state[t.dataset.pick]);
      if (t.dataset.set) t.dataset.set.trim().split(/\s+/).forEach(kv => { const [k, v] = kv.split('='); set(k, v); });
      if (t.dataset.toast) toast(t.dataset.toast);
      if (t.hasAttribute('data-replay')) replay();
      if (t.hasAttribute('data-copy')) copy(t);
      if (t.hasAttribute('data-send') && comments) sendPicks(t);
      if (t.hasAttribute('data-ask')) ask(t);
      if (t.hasAttribute('data-flip')) flipButton(t);
      if (t.hasAttribute('data-notes')) { t.setAttribute('aria-pressed', String(t.getAttribute('aria-pressed') !== 'true')); save(); }
    }, on);
    const note = document.querySelector('.picks textarea');
    if (note) note.addEventListener('input', () => { document.querySelector('.picks pre').textContent = picksText(); save(); }, on);
    document.addEventListener('keydown', e => {
      const t = e.target;
      if (t.matches && t.matches('input, textarea, select, [contenteditable]')) { if (e.key === 'Escape') t.blur(); return; }
      if (e.key === 'Escape' && keymap.__escStills && keymap.__escStills()) return;
      const fn = keymap[e.key] || keymap[e.code];
      if (fn) { e.preventDefault(); fn(e); }
    }, on);
    wireItems(); wireFlips();
    wireStagebars(); wireCompare(); wireStills(); wireInsets(); wireSend();
    addEventListener('resize', fit, on); fit();
    $$('.stage > img.hudl').forEach(i => { if (!i.complete) i.addEventListener('load', layout, on); });
    if (document.fonts) document.fonts.ready.then(() => { if (!run.signal.aborted) layout(); });
    render(null);
    started = true;
    readyQ.splice(0).forEach(fn => fn());
  }

  // fn once the kit has started (the stage's canvases sized, the picks read), or now if it has.
  let started = false;
  const readyQ = [];
  function ready(fn) { if (started) fn(); else readyQ.push(fn); }

  // A real sprite from a project's sprite tool ({src, w, h, ox, oy, ppu, design}, nose along +x) drawn with its
  // origin at (x, y), turned `angle`, `len` canvas units long. False until its picture has loaded:
  // await Mock.sprites(list) first, or draw from a frame loop.
  const spriteImgs = {};
  function spriteImg(s) {
    if (!spriteImgs[s.src]) { const im = new Image(); im.src = s.src; spriteImgs[s.src] = im; }
    return spriteImgs[s.src];
  }
  function sprite(c, s, x, y, angle = 0, len = s.design) {
    const im = spriteImg(s);
    if (!im.complete || !im.naturalWidth) return false;
    const k = len / s.design / s.ppu;
    c.save(); c.translate(x, y); c.rotate(angle); c.scale(k, k); c.drawImage(im, -s.ox, -s.oy, s.w, s.h); c.restore();
    return true;
  }
  function sprites(list) {
    return Promise.all(list.map(s => new Promise(done => {
      const im = spriteImg(s);
      if (im.complete && im.naturalWidth) return done();
      im.addEventListener('load', done, { once: true }); im.addEventListener('error', done, { once: true });
    })));
  }

  // fn(seconds) every animation frame until the page runs again; use it, not requestAnimationFrame.
  function frame(fn) {
    const t0 = performance.now();
    // The first frame's timestamp can predate t0 (-0.07 s seen); a negative t makes arc radii throw.
    const tick = now => { if (run.signal.aborted) return; fn(Math.max(0, (now - t0) / 1000)); pulse(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  window.Mock = {
    state, set, say, toast, replay, pickers, holds, fit, frame, layout, overlaps, player, sprite, sprites, ready,
    // Redraws the copy box after a change that is not a pick (a page with its own Mock.picks).
    refresh() { const pre = document.querySelector('.picks pre'); if (pre) pre.textContent = picksText(); save(); },
    // A keep-out for this render only (call it from Mock.on): [x0, y0, x1, y1] in stage pixels.
    keep(box, name, stage) { keepsNow.push({ box, name: name || `keep-out ${box.join(',')}`, st: stage }); return this; },
    ship(x, y, len, name) { return this.keep([x - len * .6, y - len * .6, x + len * .6, y + len * .6], name || 'a ship'); },
    on(fn) { listeners.push(fn); return this; },
    keys(map) { Object.assign(keymap, map); return this; },
    text: () => picksText(),
    picks: null,
    extras: [],
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, on); else setTimeout(init, 0);
})();
