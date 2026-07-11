/* Harvest Empire — UI debug-pass regression suite.
   Locks in the fixes from the full-UI debug sweep: stable sheet geometry under
   rapid taps, farm-name escaping, the well panel, modal hygiene, order stubs,
   auto-refresh finger freeze, off-season seed safety, 320px HUD fit.
   Run: node tests/e2e-ui2.js  (see tests/README.md) */
'use strict';
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✘ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(INDEX);
  await page.waitForTimeout(900);
  await page.evaluate(() => { Game.save = () => {}; localStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(900);

  // ---- farm names render as text, never as markup (menu stats card) ----
  await page.fill('#farm-name', '<b>Sneaky</b> & "Farm"');
  await page.tap('#setup-start');
  await page.waitForTimeout(400);
  await page.tap('#btn-menu');
  await page.waitForTimeout(400);
  const inj = await page.evaluate(() => {
    const card = document.querySelector('#sheet-body .order-card div');
    return {
      literal: card.textContent.includes('<b>Sneaky</b> & "Farm"'),
      injected: [...card.querySelectorAll('b')].some(b => b.textContent === 'Sneaky'),
    };
  });
  check('farm name is escaped in the menu stats card', inj.literal && !inj.injected, inj);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- market: rapid Sell-1 taps land; geometry never slides into Sell-everything ----
  await page.evaluate(() => { Game.state.inventory = { egg: 3 }; UI.updateHud(); });
  await page.tap('#btn-market');
  await page.waitForTimeout(400);
  const pre = await page.evaluate(() => ({ coins: Game.state.coins, price: Game.sellPrice('egg') }));
  const sb = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#sheet-body button')].find(x => x.textContent.includes('Sell 1'));
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  for (let i = 0; i < 5; i++) await page.touchscreen.tap(sb.x, sb.y);
  await page.waitForTimeout(400);
  const rapid = await page.evaluate(() => ({
    egg: Game.state.inventory.egg || 0,
    coins: Game.state.coins,
    modal: !document.getElementById('modal-backdrop').classList.contains('hidden'),
    soldout: document.querySelectorAll('#sheet-body .row-card.soldout').length,
    sellAllDisabled: (() => { const b = [...document.querySelectorAll('#sheet-body button.chunky')][0]; return b && b.disabled; })(),
  }));
  check('5 rapid Sell-1 taps sell all 3 eggs (no dropped taps)', rapid.egg === 0 && rapid.coins - pre.coins === 3 * pre.price, { rapid, pre });
  check('rapid taps never trigger the sell-everything confirm', rapid.modal === false, rapid);
  check('sold-out item keeps a placeholder row while the sheet stays open', rapid.soldout === 1 && rapid.sellAllDisabled === true, rapid);
  await page.screenshot({ path: path.join(OUT, 'ui2-market-soldout.png') });
  // fresh open collapses to the empty state
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);
  await page.tap('#btn-market');
  await page.waitForTimeout(350);
  const emptyAgain = await page.evaluate(() => ({
    note: document.getElementById('sheet-body').textContent.includes('empty'),
    soldout: document.querySelectorAll('#sheet-body .row-card.soldout').length,
  }));
  check('reopening the market resets the session (empty state, no ghosts)', emptyAgain.note && emptyAgain.soldout === 0, emptyAgain);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- market row membership/order is frozen per open ("All" button at qty 1) ----
  await page.evaluate(() => { Game.state.inventory = { egg: 1 }; UI.updateHud(); });
  await page.tap('#btn-market');
  await page.waitForTimeout(350);
  const oneQty = await page.evaluate(() => {
    const row = document.querySelector('#sheet-body .row-card');
    const btns = [...row.querySelectorAll('button')];
    return { count: btns.length, all: btns[1] && btns[1].textContent.includes('All ·') };
  });
  check('qty-1 market row still renders both buttons (stable tap targets)', oneQty.count === 2 && oneQty.all, oneQty);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- well panel: reachable when the can is full; second well sellable ----
  await page.evaluate(() => {
    const s = Game.state; s.coins += 99999;
    Game.buyParcel(1);
    Game.placeBuilding('well', 16, 9);
    s.can.water = DATA.CAN_TIERS[s.can.tier].cap;
    Renderer.centerOn(16.5, 9.5);
  });
  await page.waitForTimeout(250);
  const wp = await page.evaluate(() => Renderer.tileToScreen(16.5, 9.5));
  await page.touchscreen.tap(wp.x, wp.y);
  await page.waitForTimeout(400);
  const wellPanel = await page.evaluate(() => ({
    title: document.getElementById('sheet-title').textContent,
    sellRow: document.getElementById('sheet-body').textContent.includes('Sell this Well'),
  }));
  check('tapping a well with a full can opens the Well panel', wellPanel.title === 'Well', wellPanel);
  check('a second well offers the sell-back row', wellPanel.sellRow, wellPanel);
  await page.evaluate(() => { [...document.querySelectorAll('#sheet-body button')].find(b => b.textContent === 'Sell').click(); });
  await page.waitForTimeout(250);
  await page.tap('#modal-yes');
  await page.waitForTimeout(350);
  const wellsLeft = await page.evaluate(() => Game.state.buildings.filter(b => b && b.type === 'well').length);
  check('selling the second well works (one remains)', wellsLeft === 1, wellsLeft);
  // refill behaviour unchanged when the can has room
  await page.evaluate(() => { Game.state.can.water = 1; Renderer.centerOn(7.5, 5.5); });
  await page.waitForTimeout(250);
  const wp1 = await page.evaluate(() => Renderer.tileToScreen(7.5, 5.5));
  await page.touchscreen.tap(wp1.x, wp1.y);
  await page.waitForTimeout(350);
  const refill = await page.evaluate(() => ({
    water: Game.state.can.water,
    cap: DATA.CAN_TIERS[Game.state.can.tier].cap,
    sheet: !document.getElementById('sheet').classList.contains('hidden'),
  }));
  check('tapping the well with an empty can still just refills', refill.water === refill.cap && !refill.sheet, refill);

  // ---- modal hygiene: away-summary must not leak a hidden Cancel button ----
  await page.evaluate(() => UI.showAwaySummary({ seconds: 3700, crops: 2, produce: 1, lost: 0 }));
  await page.waitForTimeout(200);
  const noHidden = await page.evaluate(() => getComputedStyle(document.getElementById('modal-no')).display === 'none');
  check('away summary hides Cancel while it is up', noHidden === true);
  // interleave another confirm WITHOUT dismissing the away modal first
  await page.evaluate(() => { Game.state.inventory = { egg: 2 }; UI.updateHud(); });
  await page.tap('#modal-yes');
  await page.waitForTimeout(200);
  await page.tap('#btn-market');
  await page.waitForTimeout(350);
  await page.evaluate(() => { [...document.querySelectorAll('#sheet-body button')].find(b => b.textContent.includes('Sell everything')).click(); });
  await page.waitForTimeout(250);
  const cancelBack = await page.evaluate(() => getComputedStyle(document.getElementById('modal-no')).display !== 'none');
  check('the next confirm dialog always shows Cancel again', cancelBack === true);
  await page.tap('#modal-no');
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- orders: cards that leave the board mid-view keep a stub (no button shift) ----
  await page.evaluate(() => {
    const s = Game.state;
    s.orders = [];
    for (let i = 0; i < 3; i++) { s.orderTimer = 0.01; Game.tick(0.02); }
    s.orders[0].expires = s.now + 1.2;
    for (const [item, qty] of Object.entries(s.orders[1].reqs)) s.inventory[item] = qty;
    UI.updateHud();
  });
  await page.tap('#btn-orders');
  await page.waitForTimeout(350);
  const cardsBefore = await page.evaluate(() => document.querySelectorAll('#sheet-body .order-card').length);
  await page.waitForTimeout(2200); // order 0 expires while we watch
  const exp = await page.evaluate(() => ({
    cards: document.querySelectorAll('#sheet-body .order-card').length,
    stub: [...document.querySelectorAll('#sheet-body .order-card.done')].some(c => /Expired/.test(c.textContent)),
  }));
  check('an order expiring mid-view leaves an "Expired" stub (card count stable)', exp.cards === cardsBefore && exp.stub, { cardsBefore, exp });
  await page.evaluate(() => { [...document.querySelectorAll('#sheet-body button')].find(b => b.textContent.includes('Deliver') && !b.disabled).click(); });
  await page.waitForTimeout(400);
  const del = await page.evaluate(() => ({
    cards: document.querySelectorAll('#sheet-body .order-card').length,
    stub: [...document.querySelectorAll('#sheet-body .order-card.done')].some(c => /Delivered/.test(c.textContent)),
  }));
  check('a delivered order leaves a "Delivered" stub in place', del.cards === cardsBefore && del.stub, del);
  await page.screenshot({ path: path.join(OUT, 'ui2-order-stubs.png') });
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- the 0.5s live refresh never rebuilds the sheet under a held finger ----
  await page.evaluate(() => {
    const s = Game.state;
    Game.placeBuilding('coop', 13, 5);
    const ci = s.buildings.findIndex(b => b && b.type === 'coop');
    Game.buyAnimal('chicken', ci);
    Renderer.centerOn(13.5, 5.5);
  });
  await page.waitForTimeout(250);
  const cp = await page.evaluate(() => Renderer.tileToScreen(13.5, 5.5));
  await page.touchscreen.tap(cp.x, cp.y);
  await page.waitForTimeout(400);
  const held = await page.evaluate(async () => {
    const body = document.getElementById('sheet-body');
    body.querySelector('button')._marker = 'held';
    document.getElementById('sheet').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 1200)); // two refresh windows pass
    const frozen = body.querySelector('button')._marker === 'held';
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, pointerType: 'touch' }));
    await new Promise(r => setTimeout(r, 700));
    const caughtUp = body.querySelector('button')._marker !== 'held';
    return { frozen, caughtUp };
  });
  check('auto-refresh pauses while a pointer is down on the sheet', held.frozen === true, held);
  check('the queued refresh lands after the finger lifts', held.caughtUp === true, held);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- seeds: picking an off-season seed never silently spends on the tapped tile ----
  await page.evaluate(() => {
    const t = Game.state.tiles[7][9];
    t.crop = null; t.k = 'soil';
    Renderer.centerOn(9.5, 7.5);
  });
  await page.waitForTimeout(250);
  const sp = await page.evaluate(() => Renderer.tileToScreen(9.5, 7.5));
  await page.touchscreen.tap(sp.x, sp.y); // soil → seed sheet opens directly
  await page.waitForTimeout(400);
  const preCoins = await page.evaluate(() => Game.state.coins);
  await page.evaluate(() => { [...document.querySelectorAll('#sheet-body .item-card')].find(c => c.classList.contains('off-season')).click(); });
  await page.waitForTimeout(300);
  const offPick = await page.evaluate(() => ({
    planted: !!Game.state.tiles[7][9].crop,
    coins: Game.state.coins,
    warned: document.getElementById('toasts').textContent.includes('wastes the seed money'),
  }));
  check('off-season seed pick warns but does not plant/charge the tapped tile',
    !offPick.planted && offPick.coins === preCoins && offPick.warned, offPick);
  // wording no longer wraps over the art: the amber tag stays a single line
  await page.evaluate(() => { Game.state.day = DATA.SEASON_DAYS; Game.state.t = 0.6; });
  await page.touchscreen.tap(sp.x, sp.y); // same empty soil tile → seed sheet
  await page.waitForTimeout(400);
  const amber = await page.evaluate(() => {
    const tag = document.querySelector('.lock-tag.amber');
    if (!tag) return { found: false };
    const r = tag.getBoundingClientRect();
    return { found: true, oneLine: r.height < 26, text: tag.textContent };
  });
  check('"won\'t ripen" tag renders on one line (art stays visible)', amber.found && amber.oneLine, amber);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- the care event never clobbers a sheet the player is using ----
  await page.tap('#btn-menu');
  await page.waitForTimeout(400);
  await page.evaluate(() => Game.emit('care', { n: 1, season: 'Spring', next: 'Summer' }));
  await page.waitForTimeout(250);
  const careGuard = await page.evaluate(() => document.getElementById('sheet-title').textContent);
  check('care alert does not replace an open sheet', careGuard === 'Menu', careGuard);
  await page.tap('#sheet-close');
  await page.waitForTimeout(400);
  await page.evaluate(() => Game.emit('care', { n: 1, season: 'Spring', next: 'Summer' }));
  await page.waitForTimeout(300);
  const careOpens = await page.evaluate(() => document.getElementById('sheet-title').textContent);
  check('care sheet still auto-opens when nothing else is up', careOpens === 'Season care', careOpens);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- sheet keeps its height while open (bottom-anchored no-shrink guard) ----
  await page.evaluate(() => { Game.state.inventory = { egg: 2, milk: 2 }; UI.updateHud(); });
  await page.tap('#btn-market');
  await page.waitForTimeout(400);
  const hBefore = await page.evaluate(() => document.getElementById('sheet').getBoundingClientRect().height);
  await page.evaluate(() => { // sell out one item → content shrinks, sheet must not
    const all = [...document.querySelectorAll('#sheet-body button')].filter(b => b.textContent.includes('All ·'));
    all[0].click();
  });
  await page.waitForTimeout(300);
  const hAfter = await page.evaluate(() => document.getElementById('sheet').getBoundingClientRect().height);
  check('sheet height never shrinks mid-session (buttons cannot slide down)', hAfter >= hBefore - 1, { hBefore, hAfter });
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- text entry fields escape the global user-select:none (iOS paste) ----
  const selectable = await page.evaluate(() => {
    const inp = document.getElementById('farm-name');
    return getComputedStyle(inp).userSelect || getComputedStyle(inp).webkitUserSelect;
  });
  check('#farm-name (and .restore-input) allow text selection', selectable === 'text', selectable);

  // ---- 320px: all four HUD pills fit on one line ----
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => { Game.state.coins = 1234567; Game.state.fuel = 12.4; UI.updateHud(); });
  await page.waitForTimeout(300);
  const hud = await page.evaluate(() => {
    const rights = [...document.querySelectorAll('#hud-top .pill')]
      .filter(p => !p.classList.contains('hidden'))
      .map(p => Math.round(p.getBoundingClientRect().right));
    return { vw: window.innerWidth, worst: Math.max(...rights) };
  });
  check('HUD pills fit a 320px viewport even with 7-digit coins', hud.worst <= hud.vw, hud);
  await page.screenshot({ path: path.join(OUT, 'ui2-320-hud.png') });

  console.log(errors.length ? '\nJS ERRORS:\n' + errors.join('\n') : '\nNO JS ERRORS');
  console.log(`\nui2: ${pass} passed, ${fail} failed${fail ? ' → ' + failures.join(' | ') : ''}`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED', e); process.exit(1); });
