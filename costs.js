// Cost charts: a row per thing, its price as a bar split by resource and by part (research, build,
// each Mk, ...), rows grouped by tier and sorted by price. Every resource, salvage count and tier is
// editable on the chart: drag a piece's end, a part's knob, a salvage run's end, the tier stepper,
// drop a chip from the palette, or click a name for the editor. The changes are the page's picks.
// Each `.costchart[data-src="ID"]` reads `script#ID` (README: Cost charts). Load after kit.js.
(() => {
  if (!window.Mock) throw new Error('costs: load kit.js before costs.js');
  const run = window.__mockKit;
  const sig = { signal: run.signal };
  const NS = 'http://www.w3.org/2000/svg';
  const one = (s, r = document) => r.querySelector(s);
  const all = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = n => Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 10) / 10);
  // A dragged price snaps to 5s, and to whole numbers under 20; under a half it is gone.
  const round5 = v => v <= 0.5 ? 0 : v < 20 ? Math.max(1, Math.round(v)) : Math.round(v / 5) * 5;
  const SU = 10; // px per salvage square
  const GAP = 6; // px between parts of a bar
  const BH = 14; // bar height
  const LANE = 13; // salvage lane pitch
  const STACK_W = 640; // a chart narrower than this puts each name over its bar
  const ROUND = one('.round[data-round]')?.dataset.round || '';

  function svg(tag, attrs, kids) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
    (kids || []).forEach(k => { if (k != null) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }
  function html(tag, props, kids) {
    const e = Object.assign(document.createElement(tag), props || {});
    (kids || []).forEach(k => { if (k != null) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
    return e;
  }
  const txt = (x, y, s, attrs) => svg('text', { x, y, ...attrs }, [s]);
  const fit = (s, px, cw) => { if (s.length * cw <= px) return s; let t = s; while (t.length > 2 && (t.length + 1) * cw > px) t = t.slice(0, -1); return t.length > 2 ? t + '…' : ''; };

  // A page run again (a republish into an open window) drops the last run's floating pieces.
  all('.ctip, .cghost, .cpop').forEach(e => e.remove());
  // The hover tip: lines of parts, a part a string or [text, colour].
  const tip = html('div', { className: 'ctip', hidden: true });
  document.body.appendChild(tip);
  function showTip(lines, x, y) {
    tip.replaceChildren(...lines.map((ln, i) => {
      const d = html('div', { className: i ? '' : 'h' });
      (Array.isArray(ln) ? ln : [ln]).forEach(p => {
        if (Array.isArray(p)) { const s = html('span', { textContent: p[0] }); s.style.color = p[1]; d.appendChild(s); } else d.appendChild(document.createTextNode(p));
      });
      return d;
    }));
    tip.hidden = false;
    tip.style.left = Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, x + 14)) + 'px';
    tip.style.top = Math.max(8, Math.min(innerHeight - tip.offsetHeight - 8, y + 14)) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };
  const ghost = html('div', { className: 'cghost', hidden: true }, [html('b'), html('span')]);
  document.body.appendChild(ghost);

  const charts = [];
  function chart(box) {
    const src = one(`script#${CSS.escape(box.dataset.src)}`);
    if (!src) throw new Error(`costs: no script#${box.dataset.src}`);
    const D = JSON.parse(src.textContent);
    const cid = box.id || box.dataset.src;
    const RES = D.resources, PIPS = D.pips || [], KINDS = D.kinds || {}, G = D.group || null;
    const W8 = RES.map(r => D.weights?.[r.key] ?? 1), PW8 = D.pipWeight || 0;
    const U = D.unit ? ` ${D.unit}` : '';
    const ROW = {}, SEG = {};
    D.rows.forEach(r => { ROW[r.id] = r; r.segs.forEach(s => { SEG[s.id] = { s, r }; }); });
    const editable = s => !s.fixed && !s.placeholder;
    const segName = s => s.label || KINDS[s.kind]?.name || s.kind || '';
    const kindColor = s => s.color || KINDS[s.kind]?.color || 'var(--k-chrome)';

    // Edits: key -> number. ID|RES a part's resource, ID|pip|KEY its salvage, ID|group a row's or part's tier.
    const KEY = `mock-costs:${document.title}|${cid}|${ROUND}`;
    function base(k) {
      const [id, f, p] = k.split('|');
      if (f === 'group') return ROW[id] ? ROW[id].group : SEG[id].s.group;
      const s = SEG[id].s;
      if (!editable(s)) throw new Error('fixed');
      if (f === 'pip') { if (!PIPS.some(q => q.key === p)) throw new Error('pip'); return s.pips?.[p] || 0; }
      if (!RES.some(q => q.key === f)) throw new Error('res');
      return s.costs?.[f] || 0;
    }
    let E = {};
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      // A key whose row, part or resource left the data is dropped, never applied to another.
      for (const [k, v] of Object.entries(saved)) { try { if (base(k) !== v && v >= 0) E[k] = v; } catch (e) { /* stale */ } }
    } catch (e) { /* storage blocked: edits start fresh */ }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(E)); } catch (e) { /* not kept */ } };
    const cur = k => k in E ? E[k] : base(k);
    function setE(k, v) {
      if (!(v >= 0) || !isFinite(v)) return;
      if (k.endsWith('|group') || k.includes('|pip|')) v = Math.round(v);
      if (k.endsWith('|group')) v = Math.max(G.min ?? 0, Math.min(G.max ?? 99, v));
      if (Math.abs(v - base(k)) < 1e-9) delete E[k]; else E[k] = v;
      save();
    }
    const cost = (s, i) => editable(s) ? cur(`${s.id}|${RES[i].key}`) : s.costs?.[RES[i].key] || 0;
    const pips = s => PIPS.map(p => editable(s) ? cur(`${s.id}|pip|${p.key}`) : s.pips?.[p.key] || 0);
    const segGroup = s => s.group == null ? null : cur(`${s.id}|group`);
    const rowGroup = r => r.segs.some(s => s.group != null) ? segGroup(r.segs.find(s => s.group != null)) : r.group == null ? null : cur(`${r.id}|group`);
    const segVal = s => s.placeholder ? 0 : RES.reduce((t, _, i) => t + cost(s, i) * W8[i], 0) + pips(s).reduce((t, c) => t + c, 0) * PW8;
    const rowVal = r => r.segs.reduce((t, s) => t + segVal(s), 0);
    const bag = (s, k = 1) => {
      const out = [];
      RES.forEach((q, i) => { const v = cost(s, i) * k; if (v > 0) out.push([`${fmt(v)} `, 'var(--k-ink)'], [`${q.name}  `, q.color]); });
      pips(s).forEach((c, i) => { if (c > 0) out.push([`${c} ${PIPS[i].key}  `, PIPS[i].color]); });
      return out.length ? out : ['free'];
    };

    // The chart's bar, palette and legend, then the picture.
    const bar = html('div', { className: 'cbar' });
    const read = html('output', { className: 'cread' });
    const zo = html('button', { className: 'kbtn', type: 'button', textContent: '−', ariaLabel: 'Zoom out' });
    const zi = html('button', { className: 'kbtn', type: 'button', textContent: '+', ariaLabel: 'Zoom in' });
    const zf = html('button', { className: 'kbtn', type: 'button', textContent: 'FIT ALL' });
    const count = html('span', { className: 'ccount' });
    const undo = html('button', { className: 'kbtn', type: 'button', textContent: 'UNDO ALL' });
    bar.replaceChildren(html('span', { className: 'clab', textContent: 'VIEW' }), read, zo, zi, zf, html('span', { className: 'chint', textContent: D.hint || 'Hold and drag the chart: up zooms in, down zooms out, sideways slides. Double-click fits all.' }), count, undo);
    const pal = html('div', { className: 'cpal' });
    const chip = (label, color, data, title, rarity) => {
      const b = html('button', { className: 'rchip', type: 'button', textContent: label, title: title || `Drag ${label} onto a part` });
      b.style.setProperty('--rc', color);
      Object.assign(b.dataset, data);
      if (rarity) {
        const dots = html('span', { className: 'rar', ariaLabel: `rarity ${rarity} of 5` });
        for (let i = 1; i <= 5; i++) dots.appendChild(html('i', { className: i <= rarity ? 'rd on' : 'rd' }));
        b.appendChild(dots);
      }
      return b;
    };
    if (D.palette !== false) {
      const rows = [html('div', { className: 'cprow' }, [html('span', { className: 'dim', textContent: 'Add a resource:' }), ...RES.map((q, i) => chip(q.name, q.color, { res: i })), html('span', { className: 'dim', textContent: 'drag a chip onto a part of a bar, then drag its new piece to size.' })])];
      if (PIPS.length) rows.push(html('div', { className: 'cprow' }, [html('span', { className: 'dim', textContent: `Add ${D.pipName || 'salvage'}:` }), ...PIPS.map((p, i) => chip(p.key, p.color, { pip: i }, p.where ? `${p.key}: ${p.where}` : null, p.rarity)), html('span', { className: 'dim', textContent: PIPS.some(p => p.rarity) ? 'The dots show how rare each is. Each drop adds one; drag the end of a run of squares to change the count.' : 'Each drop adds one; drag the end of a run of squares to change the count.' })]));
      pal.replaceChildren(...rows);
    }
    const legend = html('div', { className: 'clegend' });
    const sw = (color, label, line) => { const s = html('span'); const i = html('i', { className: line ? 'ln' : '' }); i.style.background = color; s.replaceChildren(i, label); return s; };
    const usedKinds = [...new Set(D.rows.flatMap(r => r.segs.map(s => s.kind)).filter(k => k && KINDS[k]))];
    legend.replaceChildren(...RES.map(q => sw(q.color, q.name)), ...usedKinds.map(k => sw(KINDS[k].color, KINDS[k].name, true)));
    const pic = html('div', { className: 'cpic' });
    box.replaceChildren(...(D.title ? [html('h3', { className: 'ctitle', textContent: D.title })] : []), ...(D.how ? [html('p', { className: 'chow', textContent: D.how })] : []), bar, pal, legend, pic);

    let view = null, frozen = null, ADD = null;
    const GEO = { rows: [] };
    const act = new WeakMap();
    let root = null;

    function order() {
      if (frozen?.order) return frozen.order.map(id => ROW[id]);
      const rs = [...D.rows];
      const g = r => rowGroup(r) ?? 0;
      rs.sort((a, b) => g(a) - g(b) || (D.sort === 'none' ? 0 : rowVal(a) - rowVal(b)));
      if (frozen) frozen.order = rs.map(r => r.id);
      return rs;
    }

    function render() {
      const W = Math.max(320, Math.round(pic.clientWidth || box.clientWidth || 960));
      // Narrow (a phone), each row's name sits on its own line over a bar as wide as the chart.
      const stack = W < STACK_W;
      const SW = G ? 72 : 0, L = stack ? 10 : Math.round(Math.min(250, Math.max(SW + 100, W * 0.28))), R = stack ? 46 : 72, PW = W - L - R;
      const rows = order();
      const full = Math.max(1, ...rows.map(rowVal)) * 1.1;
      const vw = view || frozen?.view || { lo: 0, hi: full };
      if (frozen && !frozen.view) frozen.view = vw;
      const { lo, hi } = vw, per = (hi - lo) / PW;
      const X = v => L + (v - lo) / per;
      read.textContent = view ? `${fmt(Math.max(0, lo))} to ${fmt(hi)}${U}` : 'everything';
      const grid = svg('g'), body = svg('g', { 'clip-path': `url(#clip-${cid})` }), hits = svg('g'), top = svg('g'), left = svg('g');
      GEO.rows = [];
      let y = 2, pg;
      const withLabels = D.rows.some(r => r.segs.some(s => s.label || s.placeholder));
      rows.forEach(r => {
        const g = rowGroup(r);
        if (G && g !== pg) {
          y += pg === undefined ? 16 : 22; pg = g;
          left.appendChild(txt(8, y - 7, `${G.name} ${g}`, { class: 'cgh' }));
          grid.appendChild(svg('line', { x1: 8 + (G.name.length + 3) * 8, x2: W - R, y1: y - 11, y2: y - 11, class: 'cgl' }));
        }
        const head = stack ? 26 : 0, by = y + head + 12, ny = stack ? y + 4 : by, segs = [], lanes = [], items = [], labs = [];
        let at = 0;
        r.segs.forEach((s, si) => {
          if (s.placeholder) {
            const xa = X(at); at += 40 * per; const xb = X(at);
            body.appendChild(svg('rect', { x: xa, y: by, width: Math.max(2, xb - xa - 3), height: BH, rx: 2, class: 'cph' }));
            labs.push([xa + 2, fit(s.placeholder, xb - xa + 6, 6.2), 'var(--k-dim)']);
            segs.push({ s, x0: xa, x1: xb });
            at += GAP * per;
            return;
          }
          const fixed = !editable(s), run2 = si > 0 && r.segs[si - 1].fixed && fixed && r.segs[si - 1].kind === s.kind;
          if (run2) at -= GAP * per;
          const x0 = X(at);
          // A fixed part (it follows a rule) is one block in its kind's colour; a run of them, a
          // level each, alternates in strength.
          if (fixed) {
            const xb = X(at += segVal(s) - pips(s).reduce((t, c) => t + c, 0) * PW8);
            body.appendChild(svg('rect', { x: x0, y: by, width: Math.max(1.5, xb - x0 - 1.5), height: BH, rx: 1, style: `fill:${kindColor(s)}`, opacity: si % 2 ? 1 : 0.55 }));
          }
          if (!fixed) RES.forEach((q, i) => {
            const v = cost(s, i) * W8[i];
            if (v <= 0) return;
            const xa = X(at), xb = X(at += v);
            body.appendChild(svg('rect', { x: xa, y: by, width: Math.max(1.5, xb - xa - 1.5), height: BH, rx: 2, style: `fill:${q.color}` }));
            if (xb > L && xb < W - R) {
              // Clipped to its own piece on the left, so a thin next piece's handle cannot hide this one.
              const hx = Math.max(xa + 1, xb - 5);
              const hd = svg('rect', { x: hx, y: by, width: xb + 5 - hx, height: BH, class: 'cdrag' });
              act.set(hd, { tip: () => [[r.name, ' ', segName(s)], [`${q.name}: `, [fmt(cost(s, i)), q.color]], ['drag to change this resource; drag to nothing to remove it']], drag: e => startRes(e, s, i) });
              top.appendChild(hd);
            }
          });
          const ps = pips(s), pn = ps.reduce((t, c) => t + c, 0);
          if (pn && PW8 > 0) { const xa = X(at), xb = X(at += pn * PW8); body.appendChild(svg('rect', { x: xa, y: by, width: Math.max(1.5, xb - xa - 1.5), height: BH, rx: 2, class: 'cpipv' })); }
          const x1 = X(at);
          segs.push({ s, x0, x1 });
          if (x1 > x0) {
            body.appendChild(svg('rect', { x: x0, y: by + BH + 3, width: Math.max(2, x1 - x0 - (fixed ? 0 : 3)), height: 3, rx: 1.5, style: `fill:${kindColor(s)}` }));
            if (!fixed && x1 >= L && x1 <= W - R) {
              const k = svg('g', { class: 'cknob' }, [svg('circle', { cx: x1 - 3, cy: by - 8, r: 7, fill: 'transparent' }), svg('circle', { cx: x1 - 3, cy: by - 8, r: 3.5, style: `fill:${kindColor(s)}`, class: 'ck' })]);
              act.set(k, { tip: () => [[r.name, ' ', segName(s)], bag(s), ['drag the knob to scale every resource together']], drag: e => startKnob(e, s) });
              top.appendChild(k);
            }
            if (s.label) {
              const gl = segGroup(s), t1 = gl == null ? s.label : `${s.label} · T${gl}`;
              const room = x1 - x0 + 2, short = [t1, gl == null ? s.label.replace(/\s+/g, '') : `${s.label.replace(/\s+/g, '')} T${gl}`, gl == null ? '' : `T${gl}`];
              labs.push([x0 + 1, short.find(t => t.length * 6.2 <= room) || '', kindColor(s)]);
            }
          }
          if (editable(s)) {
            let sx = Math.max(L + 2, x0);
            ps.forEach((c, i) => {
              if (!c) return;
              const t = `${c} ${PIPS[i].key}`;
              items.push({ x: sx, w: c * SU + 4 + t.length * 5.6, c, i, t, s });
              sx += c * SU + t.length * 5.6 + 16;
            });
            if (ADD && ADD.pip != null && ADD.seg === s.id) items.push({ x: sx, w: SU + 8 + PIPS[ADD.pip].key.length * 5.6 + 16, add: true, i: ADD.pip, s });
          }
          at += GAP * per;
        });
        // Salvage lanes: a run of squares per kind, wrapped to a lower lane where runs would touch.
        const lanesTop = by + BH + 9;
        items.forEach(it => {
          let k = lanes.findIndex(e => e + 6 <= it.x);
          if (k < 0) { k = lanes.length; lanes.push(0); }
          lanes[k] = it.x + it.w;
          const sy = lanesTop + k * LANE, col = PIPS[it.i].color;
          if (it.add) {
            body.appendChild(svg('rect', { x: it.x, y: sy, width: SU - 2, height: 8, rx: 1.5, style: `fill:${col}`, class: 'cpulse' }));
            body.appendChild(txt(it.x + SU + 2, sy + 7.5, `+1 ${PIPS[it.i].key}`, { class: 'cpl' }));
            return;
          }
          for (let u = 0; u < it.c; u++) body.appendChild(svg('rect', { x: it.x + u * SU, y: sy, width: SU - 2, height: 8, rx: 1.5, style: `fill:${col}`, class: 'cpip' }));
          const ex = it.x + it.c * SU;
          body.appendChild(txt(ex + 2, sy + 7.5, it.t, { class: 'cpl', style: `fill:${col}` }));
          if (ex > L && ex < W - R) {
            const hd = svg('rect', { x: ex - 6, y: sy - 3, width: 10, height: 14, class: 'cdrag' });
            act.set(hd, { tip: () => [[r.name, ' ', segName(it.s)], [`${pips(it.s)[it.i]} ${PIPS[it.i].key}`], ['drag sideways to change the count; to nothing to remove']], drag: e => startPip(e, it.s, it.i) });
            top.appendChild(hd);
          }
        });
        const nl = lanes.length, labY = lanesTop + nl * LANE + (withLabels ? 9 : 0);
        labs.forEach(([x, t, c]) => { if (t) body.appendChild(txt(x, labY, t, { class: 'cseg', style: `fill:${c}` })); });
        const y1 = Math.max(withLabels && labs.length ? labY + 8 : nl ? lanesTop + nl * LANE : by + BH + 8, y + head + (r.sub && !stack ? 40 : 34));
        const total = rowVal(r), xe = X(at - GAP * per);
        const over = at - GAP * per > hi;
        const hit = svg('rect', { x: L, y, width: Math.max(0, Math.min(xe, W - R) - L), height: y1 - y, fill: 'transparent' });
        act.set(hit, { tip: () => [[r.name], ...r.segs.map(s => s.placeholder ? [`${segName(s)}: `, s.placeholder] : [`${segName(s)}${segGroup(s) == null ? '' : ` · ${G ? G.name.toLowerCase() : 'group'} ${segGroup(s)}`}: `, ...bag(s)]), [`total ${fmt(total)}${U}`], ...(r.tip ? [[r.tip]] : [])] });
        hits.appendChild(hit);
        if (over) top.appendChild(svg('path', { d: `M${W - R + 2} ${by + 1}l7 6l-7 6z`, class: 'cover' }));
        top.appendChild(txt(Math.max(L, Math.min(xe, W - R)) + (over ? 12 : 6), by + 11, fmt(total), { class: 'ctot' }));
        if (ADD && ADD.row === r.id) {
          const sg = segs.find(q => q.s.id === ADD.seg);
          if (sg && ADD.res != null) {
            const has = cost(sg.s, ADD.res) > 0;
            body.appendChild(svg('rect', { x: sg.x0 - 4, y: by - 6, width: Math.max(30, sg.x1 - sg.x0) + 8 + (has ? 0 : 22), height: BH + 14, rx: 5, class: 'cadd', style: `stroke:${has ? 'var(--k-dim)' : RES[ADD.res].color}` }));
            if (has) body.appendChild(txt(sg.x1 + 8, by - 8, `already costs ${RES[ADD.res].name}`, { class: 'cpl' }));
            else body.appendChild(svg('rect', { x: sg.x1 + 2, y: by, width: 18, height: BH, rx: 2, style: `fill:${RES[ADD.res].color}`, class: 'cpulse' }));
          } else if (sg) body.appendChild(svg('rect', { x: sg.x0 - 4, y: by - 6, width: Math.max(30, sg.x1 - sg.x0) + 8, height: BH + 14, rx: 5, class: 'cadd', style: `stroke:${PIPS[ADD.pip].color}` }));
        }
        // The name column: tier stepper, then the name, which opens the editor.
        if (G && g != null) {
          const ch = r.segs.some(s => `${s.id}|group` in E) || `${r.id}|group` in E;
          const step = (d, x) => {
            const b = svg('g', { class: 'cstep' }, [svg('rect', { x: x - 9, y: ny - 3, width: 18, height: 20, fill: 'transparent' }), txt(x, ny + 11, d < 0 ? '−' : '+', { 'text-anchor': 'middle' })]);
            act.set(b, { tip: () => [[`${G.name.toLowerCase()} ${d < 0 ? '−' : '+'}1`]], click: () => moveGroup(r, d) });
            return b;
          };
          left.appendChild(step(-1, 15));
          left.appendChild(svg('circle', { cx: 38, cy: ny + 7, r: 10, class: 'ctier', 'stroke-dasharray': ch ? '3 2' : null }));
          left.appendChild(txt(38, ny + 11.5, String(g), { class: 'ctiern', 'text-anchor': 'middle' }));
          left.appendChild(step(1, 61));
        }
        const nm = stack ? svg('g', { class: 'cname' }, [
          svg('rect', { x: SW + 4, y: ny - 4, width: W - SW - 14, height: 22, fill: 'transparent' }),
          txt(SW + 8, ny + 11, fit(r.name, W - SW - 20 - (r.sub ? r.sub.length * 6 + 12 : 0), 6.9)),
          r.sub ? txt(W - 10, ny + 11, r.sub, { 'text-anchor': 'end', class: 'csub' }) : null,
        ]) : svg('g', { class: 'cname' }, [
          svg('rect', { x: SW + 4, y: by - 4, width: L - SW - 10, height: r.sub ? 34 : 22, fill: 'transparent' }),
          txt(L - 10, by + 11, fit(r.name, L - SW - 18, 6.9), { 'text-anchor': 'end' }),
          r.sub ? txt(L - 10, by + 25, fit(r.sub, L - SW - 18, 6), { 'text-anchor': 'end', class: 'csub' }) : null,
        ]);
        act.set(nm, { tip: () => [[r.name], ['click to edit every resource' + (G ? ` and the ${G.name.toLowerCase()}` : '')]], click: e => openPop(r, e) });
        left.appendChild(nm);
        GEO.rows.push({ r, y0: y, y1, by, ny, segs });
        y = y1;
      });
      const H = y + 26;
      const raw = (hi - lo) / Math.max(2, PW / 110), mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 5, 10].map(k => k * mag).find(v => v >= raw);
      for (let v = Math.max(0, Math.ceil(lo / step) * step); v <= hi; v += step) {
        grid.appendChild(svg('line', { x1: X(v), x2: X(v), y1: 2, y2: H - 22, class: 'cgrid' }));
        grid.appendChild(txt(X(v), H - 6, fmt(v), { 'text-anchor': 'middle', class: 'cax' }));
      }
      root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': D.title || 'Prices by resource' }, [
        svg('defs', {}, [svg('clipPath', { id: `clip-${cid}` }, [svg('rect', { x: L, y: 0, width: PW, height: H })])]),
        grid, body, hits, top, left,
      ]);
      pic.replaceChildren(root);
      Object.assign(GEO, { L, PW, W, full, lo, hi, per, stack });
      const n = Object.keys(E).length;
      count.textContent = n ? `${n} CHANGE${n > 1 ? 'S' : ''}` : 'NO CHANGES';
      undo.disabled = !n;
      if (!n) { undo.textContent = 'UNDO ALL'; delete undo.dataset.sure; }
    }

    // svg units per screen px (the picture is drawn at its box's width, so about 1).
    const scale = () => { const r = root.getBoundingClientRect(); return root.viewBox.baseVal.width / r.width; };
    const toSvg = e => { const r = root.getBoundingClientRect(), k = scale(); return [(e.clientX - r.left) * k, (e.clientY - r.top) * k]; };
    function drag(e, move) {
      e.preventDefault(); hideTip();
      frozen = {};
      const sx = e.clientX, k = scale();
      let raf = 0, ex = sx, ey = e.clientY;
      const mv = ev => { ex = ev.clientX; ey = ev.clientY; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const lines = move((ex - sx) * k); render(); Mock.refresh(); if (lines) showTip(lines, ex, ey - 70); }); };
      const up = () => { removeEventListener('pointermove', mv); frozen = null; hideTip(); render(); Mock.refresh(); };
      addEventListener('pointermove', mv, sig);
      addEventListener('pointerup', up, { once: true, signal: run.signal });
      addEventListener('pointercancel', up, { once: true, signal: run.signal });
    }
    function startRes(e, s, i) {
      const k = `${s.id}|${RES[i].key}`, v0 = cost(s, i) * W8[i], per = GEO.per;
      drag(e, dx => {
        let nv = v0 + dx * per;
        if (nv <= per * 4) nv = 0;
        setE(k, round5(nv / W8[i]));
        return [[segName(s)], [`${RES[i].name}: `, [fmt(cur(k)), RES[i].color]]];
      });
    }
    function startKnob(e, s) {
      const orig = RES.map((_, i) => cost(s, i)), v0 = segVal(s), per = GEO.per;
      if (!(v0 > 0)) return;
      drag(e, dx => {
        const f = Math.max(0, (v0 + dx * per) / v0);
        orig.forEach((v, i) => { if (v > 0) setE(`${s.id}|${RES[i].key}`, round5(v * f)); });
        return [[segName(s)], bag(s)];
      });
    }
    function startPip(e, s, i) {
      const k = `${s.id}|pip|${PIPS[i].key}`, c0 = cur(k);
      drag(e, dx => { setE(k, Math.max(0, Math.round(c0 + dx / SU))); return [[segName(s)], [`${cur(k)} ${PIPS[i].key}`]]; });
    }
    function moveGroup(r, d) {
      const clamp = v => Math.max(G.min ?? 0, Math.min(G.max ?? 99, v));
      const gs = r.segs.filter(s => s.group != null);
      if (gs.length) gs.forEach(s => setE(`${s.id}|group`, clamp(segGroup(s) + d)));
      else setE(`${r.id}|group`, clamp(rowGroup(r) + d));
      changed();
    }

    // Hold and drag on the chart: up and down zoom about the pointer, sideways slides. A finger
    // only slides, so the page still scrolls under it; the buttons zoom.
    function pan(e) {
      const [x] = toSvg(e), frac = Math.max(0, Math.min(1, (x - GEO.L) / GEO.PW));
      const p = { sx: e.clientX, sy: e.clientY, lo: GEO.lo, hi: GEO.hi, frac, anchor: GEO.lo + frac * (GEO.hi - GEO.lo), k: scale(), touch: e.pointerType === 'touch' };
      hideTip(); pic.classList.add('grab');
      let raf = 0, ex = p.sx, ey = p.sy;
      const mv = ev => { ex = ev.clientX; ey = ev.clientY; if (raf) return; raf = requestAnimationFrame(() => {
        raf = 0;
        const dx = (ex - p.sx) * p.k, dy = p.touch ? 0 : (ey - p.sy) * p.k;
        const range = Math.max(GEO.full * 1e-4, Math.min(GEO.full * 3, (p.hi - p.lo) * Math.exp(dy * 0.008)));
        const lo = Math.max(-range * 0.05, p.anchor - p.frac * range - dx * range / GEO.PW);
        view = { lo, hi: lo + range }; render();
      }); };
      const up = () => { removeEventListener('pointermove', mv); pic.classList.remove('grab'); };
      addEventListener('pointermove', mv, sig);
      addEventListener('pointerup', up, { once: true, signal: run.signal });
      addEventListener('pointercancel', up, { once: true, signal: run.signal });
    }
    const zoom = f => { const lo = GEO.lo, hi = GEO.hi, mid = (lo + hi) / 2, range = Math.max(GEO.full * 1e-4, Math.min(GEO.full * 3, (hi - lo) * f)); const nlo = Math.max(-range * 0.05, mid - range / 2); view = { lo: nlo, hi: nlo + range }; render(); };
    zo.addEventListener('click', () => zoom(1.5), sig);
    zi.addEventListener('click', () => zoom(1 / 1.5), sig);
    zf.addEventListener('click', () => { view = null; render(); }, sig);
    undo.addEventListener('click', () => {
      if (!undo.dataset.sure) { undo.dataset.sure = '1'; undo.textContent = 'CLICK AGAIN TO UNDO'; return; }
      E = {}; save(); closePop(); changed();
    }, sig);

    const actOf = t => { for (let n = t; n && n !== pic; n = n.parentNode) { const a = act.get(n); if (a) return a; } return null; };
    pic.addEventListener('pointerdown', e => {
      if (e.button > 0 || ADD) return;
      const a = actOf(e.target);
      if (a?.drag) return a.drag(e);
      if (a?.click) return;
      pan(e);
    }, sig);
    pic.addEventListener('click', e => { const a = actOf(e.target); if (a?.click) a.click(e); }, sig);
    pic.addEventListener('dblclick', e => { if (actOf(e.target)?.click) return; view = null; render(); }, sig);
    pic.addEventListener('pointermove', e => { if (frozen || ADD || e.buttons) return; const a = actOf(e.target); if (a?.tip) showTip(a.tip(), e.clientX, e.clientY); else hideTip(); }, sig);
    pic.addEventListener('pointerleave', hideTip, sig);

    // A chip dragged from the palette: the part under the pointer lights up, and the drop adds it.
    function target(e) {
      if (!root) return null;
      const r = root.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
      const [x, y] = toSvg(e);
      const row = GEO.rows.find(o => y >= o.y0 - 4 && y <= o.y1 + 4);
      const sg = row && row.segs.filter(q => editable(q.s));
      if (!sg || !sg.length) return null;
      let best = sg[0];
      for (const q of sg) if (x >= q.x0 - 6) best = q;
      return { row: row.r.id, seg: best.s.id };
    }
    pal.addEventListener('pointerdown', e => {
      const c = e.target.closest('.rchip');
      if (!c) return;
      e.preventDefault(); hideTip();
      ADD = c.dataset.res != null ? { res: +c.dataset.res } : { pip: +c.dataset.pip };
      const [b, s] = ghost.children;
      b.textContent = c.dataset.res != null ? RES[ADD.res].name : PIPS[ADD.pip].key;
      b.style.background = c.dataset.res != null ? RES[ADD.res].color : PIPS[ADD.pip].color;
      s.textContent = 'drop on a part';
      ghost.hidden = false;
      const mv = ev => {
        ghost.style.left = ev.clientX + 12 + 'px'; ghost.style.top = ev.clientY + 12 + 'px';
        const t = target(ev), was = `${ADD.row}|${ADD.seg}`;
        Object.assign(ADD, t || { row: null, seg: null });
        s.textContent = t ? `${ROW[t.row].name} · ${segName(SEG[t.seg].s)}` : 'drop on a part';
        if (`${ADD.row}|${ADD.seg}` !== was) render();
      };
      mv(e);
      addEventListener('pointermove', mv, sig);
      addEventListener('pointerup', ev => {
        removeEventListener('pointermove', mv); ghost.hidden = true;
        const a = ADD; ADD = null;
        const t = target(ev);
        if (t && a.res != null) {
          const s = SEG[t.seg].s;
          if (!(cost(s, a.res) > 0)) setE(`${s.id}|${RES[a.res].key}`, round5(Math.max(10, segVal(s) * 0.2 / W8[a.res])));
        } else if (t) {
          const k = `${t.seg}|pip|${PIPS[a.pip].key}`;
          setE(k, cur(k) + 1);
        }
        changed();
      }, { once: true, signal: run.signal });
    }, sig);

    // The editor: every resource, salvage count and tier of a row, typed.
    let pop = null;
    function closePop() { if (pop) { pop.remove(); pop = null; } }
    function input(k, label, color) {
      const v = cur(k), ch = k in E;
      const i = html('input', { className: 'ced' + (ch ? ' chg' : '') + (v ? '' : ' z'), type: 'text', inputMode: 'decimal', value: String(+(+v).toFixed(3)), title: `was ${fmt(base(k))}${ch ? `, now ${fmt(v)}` : ''}`, ariaLabel: label });
      i.dataset.key = k;
      const l = html('i', { textContent: label });
      if (color) l.style.color = color;
      return [l, i];
    }
    function openPop(r, e) {
      closePop();
      const x = html('button', { className: 'kbtn', type: 'button', textContent: '×', ariaLabel: 'Close' });
      x.addEventListener('click', closePop);
      const parts = [html('div', { className: 'cpop-h' }, [html('b', { textContent: r.name }), x])];
      if (G && !r.segs.some(s => s.group != null) && r.group != null) parts.push(html('div', { className: 'ceds' }, input(`${r.id}|group`, G.name)));
      r.segs.filter(editable).forEach(s => {
        const g = [html('div', { className: 'csec', textContent: segName(s) })];
        if (G && s.group != null) g.push(html('div', { className: 'ceds' }, input(`${s.id}|group`, G.name)));
        g.push(html('div', { className: 'ceds' }, RES.flatMap(q => input(`${s.id}|${q.key}`, q.name, q.color))));
        if (PIPS.length) g.push(html('div', { className: 'ceds' }, PIPS.flatMap(p => input(`${s.id}|pip|${p.key}`, p.key, p.color))));
        parts.push(html('div', { className: 'cgrp' }, g));
      });
      if (r.segs.some(editable)) parts.push(html('p', { className: 'dim', textContent: 'Type a number in any 0 box to add it; 0 removes it.' }));
      pop = html('div', { className: 'cpop', role: 'dialog', ariaLabel: `Edit ${r.name}` }, parts);
      pop.addEventListener('change', ev => {
        const k = ev.target.dataset.key;
        if (!k) return;
        const v = parseFloat(ev.target.value);
        if (v >= 0) setE(k, v);
        ev.target.value = String(+(+cur(k)).toFixed(3));
        ev.target.classList.toggle('chg', k in E);
        ev.target.classList.toggle('z', !cur(k));
        changed();
      });
      document.body.appendChild(pop);
      pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, e.clientX + 12)) + 'px';
      pop.style.top = Math.max(8, Math.min(innerHeight - pop.offsetHeight - 8, e.clientY - 20)) + 'px';
      one('input', pop)?.focus();
    }
    document.addEventListener('pointerdown', e => { if (pop && !pop.contains(e.target) && !actOf(e.target)?.click) closePop(); }, sig);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); }, sig);

    function changed() { render(); Mock.refresh(); }
    new ResizeObserver(() => { if (!run.signal.aborted && root && Math.abs(root.viewBox.baseVal.width - pic.clientWidth) > 2) render(); }).observe(pic);

    // One line per change: "REFINERY research ORE: 100 → 120".
    function lines() {
      return Object.keys(E).map(k => {
        const [id, f, p] = k.split('|');
        const r = ROW[id] || SEG[id].r, s = SEG[id]?.s;
        const what = f === 'group' ? G.name.toLowerCase() : f === 'pip' ? p : RES.find(q => q.key === f).name;
        const part = s && (r.segs.length > 1 || f !== 'group') ? ` ${s.label || segName(s).toLowerCase()}` : '';
        return `${r.name}${part} ${what}: ${fmt(base(k))} → ${fmt(E[k])}`;
      });
    }
    // Where a row's name, or a part's end, knob or resource piece is on screen, for a test to press.
    function at(id, what) {
      const rect = root.getBoundingClientRect(), k = 1 / scale();
      const pt = (x, y) => ({ x: rect.left + x * k, y: rect.top + y * k });
      if (ROW[id]) { const row = GEO.rows.find(o => o.r.id === id); return row && pt(GEO.stack ? (G ? 72 : 0) + 24 : GEO.L - 20, row.ny + 7); }
      const row = GEO.rows.find(o => o.segs.some(q => q.s.id === id));
      if (!row) return null;
      const sg = row.segs.find(q => q.s.id === id), by = row.by;
      if (what === 'knob') return pt(sg.x1 - 3, by - 8);
      if (what == null || what === 'end') return pt(sg.x1, by + BH / 2);
      const i = RES.findIndex(q => q.key === what);
      let v = 0;
      for (let j = 0; j <= i; j++) v += cost(sg.s, j) * W8[j];
      return pt(sg.x0 + v / GEO.per - 1, by + BH / 2);
    }
    render();
    // The chart is an item when it has data-item: its lines then sit under its label.
    const head = [box.dataset.item, box.dataset.name || D.title].filter(Boolean).join(' ');
    return { id: cid, head, item: !!box.dataset.item, lines, at, render };
  }

  all('.costchart[data-src]').forEach(b => charts.push(chart(b)));
  Mock.extras.push(() => charts.map(c => {
    const ls = c.lines();
    return ls.length ? ((charts.length > 1 || c.item) && c.head ? [c.head.toUpperCase(), ...ls] : ls).join('\n') : '';
  }).filter(Boolean).join('\n'));
  Mock.costAt = (chartId, id, what) => charts.find(c => c.id === chartId)?.at(id, what) || null;
  Mock.refresh();
})();
