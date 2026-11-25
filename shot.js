// Checks a built mock-up page: clicks every pick, shoots the stage for each, then the whole page
// at desktop and phone width. Fails on a script error, an unlabelled item, a copy box
// without COPY, a page that breaks when its scripts run again (a republish into an open
// window), a page that scrolls sideways, or a word on the stage that cannot be read in any pick
// (Mock.overlaps: off the stage, no plate, over a marked thing, the HUD or another word).
//
//   node $KIT/shot.js PAGE.built.html OUTDIR [--wait MS]
//   node $KIT/shot.js --hosted FRAME.html OUTDIR      the page as the board frames it (below)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const url = require('url');

// --hosted: FRAME is a frame document (hosted.py over pagekit's bundle) beside its files/. It is served
// over a local http server that closes at the end and framed as the board frames it (sandboxed scripts,
// no same origin). Fails unless the page says ready with its items, every item has a note line, no
// send box of its own shows, and a pick, a note, an ask, Cmd-D and the shell's restore, note and
// listen messages all go through. Shoots the frame at the board's panel size and at phone size.
async function hosted(frameDoc, out, settle) {
  const http = require('http');
  const dir = path.dirname(path.resolve(frameDoc));
  const types = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain' };
  const shell = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#07060f}iframe{border:0;width:100%;height:100%;display:block}</style>'
    + '<iframe sandbox="allow-scripts" src="/frame"></iframe><script>window.got=[];addEventListener("message",e=>{if(e.data&&e.data.mockkit===1)window.got.push(e.data)});'
    + 'window.tell=m=>document.querySelector("iframe").contentWindow.postMessage(Object.assign({mockshell:1},m),"*");</script>';
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(shell); }
    if (u === '/frame') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(path.resolve(frameDoc))); }
    const f = path.join(dir, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(dir + path.sep) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const errs = [];
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const run = async (vw, vh, name, steps) => {
      const p = await b.newPage({ viewport: { width: vw, height: vh } });
      p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
      p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${name}: ${m.text()}`); });
      await p.goto(base);
      await p.waitForFunction(() => window.got.some(m => m.type === 'ready'), null, { timeout: 8000 }).catch(() => errs.push(`${name}: no ready message from the page`));
      const f = p.frames().find(x => x !== p.mainFrame());
      await p.waitForTimeout(settle);
      if (steps) await steps(p, f);
      await p.screenshot({ path: path.join(out, `hosted-${name}.png`) });
      await p.close();
    };
    await run(1220, 960, 'panel', async (p, f) => {
      const got = () => p.evaluate(() => window.got);
      const ready = (await got()).find(m => m.type === 'ready');
      const dom = await f.evaluate(() => ({
        labels: [...document.querySelectorAll('[data-item]')].map(i => i.dataset.item).filter(Boolean),
        bare: [...document.querySelectorAll('[data-item]')].filter(i => i.dataset.item && !(i.matches('tr') ? i.nextElementSibling?.matches('.knrow') : i.querySelector('.knline'))).map(i => i.dataset.item),
        send: [...document.querySelectorAll('.picks [data-copy], .picks:not(.sfloat) pre')].some(e => e.getClientRects().length),
        hosted: document.documentElement.classList.contains('khosted'),
      }));
      if (!dom.hosted) errs.push('the page did not turn hosted (meta mock-host)');
      if (ready && ready.items.map(i => i.label).join(' ') !== dom.labels.join(' ')) errs.push(`ready lists ${ready.items.map(i => i.label).join(' ')}, the page has ${dom.labels.join(' ')}`);
      if (dom.bare.length) errs.push(`items without a note line: ${dom.bare.join(' ')}`);
      if (dom.send) errs.push('the page shows a send box of its own: the board sends');
      if (!dom.labels.length) return;
      const first = dom.labels[0];
      const last = m => p.evaluate(t => window.got.filter(x => x.type === t).pop(), m);
      const pick = await f.$(`[data-item="${first}"] .seg[data-pick] button[data-v]`);
      if (pick) {
        await pick.click(); await p.waitForTimeout(200);
        const s = await last('state');
        if (!s || !s.summary.startsWith(first + ' ') || s.summary.startsWith(first + ' not picked')) errs.push(`a pick on ${first} did not reach the shell (${s && s.summary})`);
      }
      const ta = await f.$(`[data-note="${first}"]`);
      if (ta && await ta.isVisible()) {
        await ta.click(); await ta.type('Thicker at the ship end'); await p.waitForTimeout(250);
        const s = await last('state');
        if (!s || s.notes[first] !== 'Thicker at the ship end') errs.push(`a note on ${first} did not reach the shell`);
        await p.keyboard.press('Meta+d'); await p.waitForTimeout(150);
        const mic = await last('mic');
        if (!mic || mic.item !== first) errs.push(`Cmd-D in ${first}'s note did not ask the shell to dictate into it`);
      } else if (ta) errs.push(`${first}'s note line is not on show`);
      const ask = await f.$('[data-item] .kask:not([data-ask="animate"])');
      if (ask && await ask.isVisible()) {
        await ask.click(); await p.waitForTimeout(150);
        if (!(await last('ask'))) errs.push('an ask press did not reach the shell');
      }
      await p.evaluate(([l]) => { window.tell({ type: 'restore', state: {}, notes: { [l]: 'From the board' } }); window.tell({ type: 'listen', item: l }); }, [dom.labels[dom.labels.length - 1]]);
      await p.waitForTimeout(300);
      const back = await f.evaluate(l => ({ v: document.querySelector(`[data-note="${l}"]`)?.value, live: !!document.querySelector(`[data-note="${l}"]`)?.closest('.ninp.live') }), dom.labels[dom.labels.length - 1]);
      if (back.v !== 'From the board') errs.push('the shell\'s restore did not fill the note');
      if (!back.live) errs.push('the shell\'s listen did not light the note box');
      await p.evaluate(() => window.tell({ type: 'listen', item: null }));
      const free = await f.evaluate(() => {
        const b = [...document.querySelectorAll('.seg[data-pick] button[data-v][data-say]')].find(x => !x.closest('[data-item]') && x.dataset.say);
        if (!b) return null;
        b.setAttribute('data-shot-free', ''); return b.dataset.say;
      });
      if (free) {
        await f.click('[data-shot-free]'); await p.waitForTimeout(200);
        const s = await last('state');
        if (!s || !s.summary.split(' · ').includes(free)) errs.push(`a choice outside the items ("${free}") is not in the send text (${s && s.summary})`);
      }
      // a toggle outside the items says its on or off words too
      if (await f.$('.tog[data-pick]:not([data-item] .tog)')) {
        await f.click('.tog[data-pick]:not([data-item] .tog)'); await p.waitForTimeout(200);
        const want = await f.evaluate(() => { const t = document.querySelector('.tog[data-pick]:not([data-item] .tog)');
          return t.getAttribute('aria-pressed') === 'true' ? (t.dataset.sayOn ?? t.textContent.trim()) : (t.dataset.sayOff ?? ''); });
        const s = await last('state');
        if (want && (!s || !s.summary.split(' · ').includes(want))) errs.push(`a toggle outside the items ("${want}") is not in the send text (${s && s.summary})`);
      }
    });
    // A change a component reports through Mock.refresh (a size, a cost) must reach the shell, and its
    // hostPart state must come back on restore in a fresh page, as a reopened round does.
    let sent = null;
    await run(1220, 960, 'parts', async (p, f) => {
      const last = () => p.evaluate(() => window.got.filter(x => x.type === 'state').pop());
      await f.evaluate(() => { Mock.extras.push(() => 'X1 probe'); Mock.refresh(); });
      await p.waitForTimeout(250);
      if (!((await last())?.picks || '').includes('X1 probe')) errs.push('a change through Mock.refresh did not reach the shell');
      const parts = await f.evaluate(() => {
        const out = {};
        const sz = document.querySelector('script#sizes');
        if (sz) { const it = JSON.parse(sz.textContent).items[0]; out.sizes = { [`${it.key}|${it.use || ''}|${it.len}`]: 2 }; }
        document.querySelectorAll('.costchart[data-src]').forEach(b => {
          const D = JSON.parse(document.getElementById(b.dataset.src).textContent);
          const s = D.rows.flatMap(r => r.segs).find(x => !x.fixed && !x.placeholder);
          out[`costs:${b.id || b.dataset.src}`] = { [`${s.id}|${D.resources[0].key}`]: (s.costs?.[D.resources[0].key] || 0) + 25 };
        });
        return out;
      });
      if (!Object.keys(parts).length) return;
      await p.evaluate(m => window.tell({ type: 'restore', state: {}, notes: {}, parts: m }), parts);
      await p.waitForTimeout(400);
      sent = await last();
      const miss = Object.keys(parts).filter(n => JSON.stringify(sent?.parts?.[n]) !== JSON.stringify(parts[n]));
      if (miss.length) errs.push(`restore did not put back ${miss.join(', ')}`);
      if (!sent || !sent.picked) errs.push(`a restored change is not counted as picked (${sent && sent.summary})`);
    });
    await run(390, 728, 'phone');
  } finally {
    await b.close();
    srv.close();
  }
  console.log(errs.length ? errs.join('\n') : 'no errors');
  process.exit(errs.length ? 1 : 0);
}

(async () => {
  const args = process.argv.slice(2);
  const [page, out] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--wait');
  if (!page || !out) { console.log('usage: node shot.js [--hosted] PAGE.html OUTDIR [--wait MS]'); process.exit(2); }
  const wi = process.argv.indexOf('--wait');
  const settle = wi > 0 ? Number(process.argv[wi + 1]) : 600;
  fs.mkdirSync(out, { recursive: true });
  if (args.includes('--hosted')) return hosted(page, out, settle);
  // Headless Chromium hides scrollbars unless told not to; the page's own must show.
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // A file: URL built from the operator's own argument, so the page can only be a local file.
  await p.goto(url.pathToFileURL(path.resolve(page)).href); // nosemgrep: playwright-goto-injection
  await p.waitForFunction(() => window.Mock && document.querySelector('[aria-pressed], .picks [data-copy]'));
  await p.waitForTimeout(settle);

  const stage = async name => {
    const st = await p.$$('.stage');
    for (const [i, s] of st.entries()) {
      if (await s.isVisible()) await s.screenshot({ path: path.join(out, `${name}${st.length > 1 ? '-' + i : ''}.png`) });
    }
  };
  // Every word on a stage must stay readable in every state: on a plate, clear of the HUD, the
  // things Mock.keep marks and other words (kit.js Mock.overlaps).
  const clash = new Map();
  const check = async name => {
    const o = await p.evaluate(() => (Mock.overlaps ? Mock.overlaps() : []));
    o.forEach(x => { if (!clash.has(x)) clash.set(x, name); });
  };
  await check('at start');
  const start = await p.evaluate(() => ({ ...Mock.state }));
  const pickers = await p.evaluate(() => Mock.pickers());
  for (const pk of pickers) {
    for (const v of pk.values) {
      const sel = pk.kind === 'tog' ? `.tog[data-pick="${pk.key}"]` : `.seg[data-pick="${pk.key}"] button[data-v="${v}"]`;
      if (pk.kind === 'tog' && (await p.evaluate(k => Mock.state[k], pk.key)) === v) continue;
      // A hidden choice (a page's own "none yet" button) is set, not clicked: a click would wait for it to show.
      if (await p.isVisible(sel)) await p.click(sel); else await p.evaluate(([k, x]) => Mock.set(k, x), [pk.key, v]);
      await p.waitForTimeout(settle);
      await stage(`${pk.key}-${v}`);
      await check(`${pk.key}=${v}`);
    }
    await p.evaluate(([k, v]) => Mock.set(k, v), [pk.key, start[pk.key]]);
  }
  await p.waitForTimeout(settle);
  await p.screenshot({ path: path.join(out, 'page.png'), fullPage: true });
  const text = await p.evaluate(() => Mock.text());
  // The review standard: every item labelled, its asks drawn, and COPY in the copy box.
  const std = await p.evaluate(() => ({
    items: document.querySelectorAll('[data-item]').length,
    bare: [...document.querySelectorAll('[data-item]')].filter(i => !i.querySelector('.ilabel') || (i.dataset.asks !== '' && !i.querySelector('.kasks'))).map(i => i.dataset.item),
    copy: !!document.querySelector('.picks [data-copy]'),
    picks: !!document.querySelector('.picks'),
  }));
  if (std.picks && !std.items) errs.push('no [data-item]: label every item the reviewer picks on');
  if (std.bare.length) errs.push(`items without a label or their asks: ${std.bare.join(' ')}`);
  if (std.picks && !std.copy) errs.push('no COPY button: copy the .picks .row from template.html');

  // A republish swaps the new page into the open window and runs its scripts again: they must not
  // throw, and a pick must still land once.
  await p.evaluate(() => document.querySelectorAll('script').forEach(s => {
    const n = document.createElement('script'); [...s.attributes].forEach(a => n.setAttribute(a.name, a.value)); n.textContent = s.textContent; s.replaceWith(n);
  }));
  await p.waitForTimeout(settle);
  const pk = pickers[0];
  if (pk) {
    const was = await p.evaluate(k => Mock.state[k], pk.key);
    const v = pk.kind === 'tog' ? !was : pk.values.find(x => x !== was);
    const sel = pk.kind === 'tog' ? `.tog[data-pick="${pk.key}"]` : `.seg[data-pick="${pk.key}"] button[data-v="${v}"]`;
    if (v !== undefined) {
      await p.click(sel);
      const now = await p.evaluate(k => Mock.state[k], pk.key);
      if (now !== v) errs.push(`after the scripts ran again, clicking ${pk.key} left it at ${now}, not ${v}`);
    }
  }

  await p.setViewportSize({ width: 390, height: 900 });
  await p.waitForTimeout(settle);
  const wide = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await p.screenshot({ path: path.join(out, 'phone.png'), fullPage: true });

  await b.close();

  console.log(`picks: ${pickers.map(k => `${k.key}(${k.values.length})`).join(' ')}`);
  console.log(`copy text: ${text}`);
  if (wide > 0) errs.push(`page scrolls sideways by ${wide}px at phone width`);
  if (clash.size) errs.push(`${clash.size} word${clash.size > 1 ? 's' : ''} on the stage cannot be read:\n` + [...clash].map(([x, at]) => `  ${at}: ${x}`).join('\n'));
  console.log(errs.length ? errs.join('\n') : 'no errors');
  process.exit(errs.length ? 1 : 0);
})();
