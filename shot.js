// Checks a built mock-up page: clicks every pick, shoots the stage for each, then the whole page
// at desktop and phone width. Fails on a script error, an unlabelled item, a missing SEND PICKS
// or voice-notes toggle, a page that breaks when its scripts run again (a republish into an open
// window), a page that scrolls sideways, or a word on the stage that cannot be read in any pick
// (Mock.overlaps: off the stage, no plate, over a marked thing, the HUD or another word).
//
//   node $KIT/shot.js PAGE.built.html OUTDIR [--wait MS]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const url = require('url');

(async () => {
  const [page, out] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!page || !out) { console.log('usage: node shot.js PAGE.built.html OUTDIR [--wait MS]'); process.exit(2); }
  const wi = process.argv.indexOf('--wait');
  const settle = wi > 0 ? Number(process.argv[wi + 1]) : 600;
  fs.mkdirSync(out, { recursive: true });
  // Headless Chromium hides scrollbars unless told not to; the page's own must show.
  const b = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // A file: URL built from the operator's own argument, so the page can only be a local file.
  await p.goto(url.pathToFileURL(path.resolve(page)).href); // nosemgrep: playwright-goto-injection
  await p.waitForFunction(() => window.Mock && document.querySelector('[aria-pressed]'));
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
  // The review standard: every item labelled, its asks drawn, SEND PICKS and the voice-notes toggle by COPY.
  const std = await p.evaluate(() => ({
    items: document.querySelectorAll('[data-item]').length,
    bare: [...document.querySelectorAll('[data-item]')].filter(i => !i.querySelector('.ilabel') || (i.dataset.asks !== '' && !i.querySelector('.kasks'))).map(i => i.dataset.item),
    send: !!document.querySelector('.picks [data-send]') && !!document.querySelector('.picks [data-notes]'),
    picks: !!document.querySelector('.picks'),
  }));
  if (std.picks && !std.items) errs.push('no [data-item]: label every item the reviewer picks on');
  if (std.bare.length) errs.push(`items without a label or their asks: ${std.bare.join(' ')}`);
  if (std.picks && !std.send) errs.push('no SEND PICKS or voice-notes toggle: copy the .picks .row from template.html');

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

  // The longest SEND PICKS (every pick on its last value, a note past one send) must reach the thread: a
  // stand-in for the comments capability takes each part, and none may pass sendToClaude's 4096 bytes.
  if (std.send) {
    const q = await b.newPage({ viewport: { width: 1500, height: 1100 } });
    await q.addInitScript(() => {
      window.__sent = [];
      window.claude = { use: async n => (n === 'comments' ? { canSendToClaude: async () => 'available', anchorFor: async () => ({}), sendToClaude: async x => { window.__sent.push(x.text); } } : null) };
    });
    await q.goto(url.pathToFileURL(path.resolve(page)).href); // nosemgrep: playwright-goto-injection
    await q.waitForFunction(() => window.Mock && !document.querySelector('.picks [data-send]').disabled);
    await q.evaluate(() => {
      Mock.pickers().forEach(k => Mock.set(k.key, k.values[k.values.length - 1]));
      const n = document.querySelector('.picks textarea');
      if (n) { n.value = 'A long note → × · '.repeat(220); n.dispatchEvent(new Event('input')); }
    });
    for (let i = 0; i < 20; i++) {
      await q.click('.picks [data-send]');
      await q.waitForTimeout(100);
      if (!/PART/.test(await q.textContent('.picks [data-send]'))) break;
    }
    const sent = await q.evaluate(() => window.__sent.map(t => new TextEncoder().encode(t).length));
    if (!sent.length) errs.push('SEND PICKS sent nothing with every pick made');
    const big = sent.filter(n => n > 4096);
    if (big.length) errs.push(`SEND PICKS sent ${big.length} text${big.length > 1 ? 's' : ''} over 4096 bytes (${big.join(', ')}): split it`);
    console.log(`longest send: ${sent.length} part${sent.length > 1 ? 's' : ''}, ${sent.join(' + ')} bytes`);
  }
  await b.close();

  console.log(`picks: ${pickers.map(k => `${k.key}(${k.values.length})`).join(' ')}`);
  console.log(`copy text: ${text}`);
  if (wide > 0) errs.push(`page scrolls sideways by ${wide}px at phone width`);
  if (clash.size) errs.push(`${clash.size} word${clash.size > 1 ? 's' : ''} on the stage cannot be read:\n` + [...clash].map(([x, at]) => `  ${at}: ${x}`).join('\n'));
  console.log(errs.length ? errs.join('\n') : 'no errors');
  process.exit(errs.length ? 1 : 0);
})();
