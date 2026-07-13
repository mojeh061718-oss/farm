/* Harvest Empire — UI/interaction e2e suite (touch input, sheets, screenshots).
   Run: node tests/e2e-ui.js  (see tests/README.md) */
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
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(900);
  await page.tap('#setup-start');
  await page.evaluate(() => { DATA.TONI.plantChance = 0; }).catch(() => {}); // deterministic: no stray bloom mid-test
  await page.waitForTimeout(500);

  const tileXY = (x, y) => page.evaluate(([x, y]) => Renderer.tileToScreen(x + 0.5, y + 0.5), [x, y]);
  async function tapTile(x, y) {
    const { x: sx, y: sy } = await tileXY(x, y);
    await page.touchscreen.tap(sx, sy);
    await page.waitForTimeout(120);
  }

  // ---- day pill format ----
  const pill = await page.evaluate(() => ({
    text: document.getElementById('day-label').textContent,
    want: 'D1/' + DATA.SEASON_DAYS,
  }));
  check('day pill shows season progress "D1/{SEASON_DAYS}"', pill.text === pill.want, pill);

  // ---- the toolbar is gone; the action bubble is the tile UI now ----
  const chrome = await page.evaluate(() => ({
    toolbar: !!document.getElementById('toolbar'),
    toolBtns: document.querySelectorAll('.tool-btn').length,
    bubble: !!document.getElementById('bubble'),
    hidden: document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('bottom toolbar removed (no #toolbar, no .tool-btn)', !chrome.toolbar && chrome.toolBtns === 0, chrome);
  check('action bubble container exists and rests hidden', chrome.bubble && chrome.hidden, chrome);

  // ---- tap-a-tile basics: one tap does the obvious thing ----
  await tapTile(8, 6); // grass → tills directly, no bubble
  await page.waitForTimeout(250);
  const tilled = await page.evaluate(() => ({
    k: Game.state.tiles[6][8].k,
    bubble: !document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('tapping grass tills it directly (no bubble)', tilled.k === 'soil' && !tilled.bubble, tilled);

  await tapTile(9, 7); // pre-tilled starter plot → seed picker opens directly
  await page.waitForTimeout(300);
  const sheetVisible = await page.evaluate(() => !document.getElementById('sheet').classList.contains('hidden'));
  check('tapping bare soil opens the seed sheet', sheetVisible);
  await page.evaluate(() => {
    [...document.querySelectorAll('#sheet-body .item-card')].find(c => c.textContent.includes('Turnip')).click();
  });
  await page.waitForTimeout(250);
  const planted = await page.evaluate(() => Game.state.tiles[7][9].crop && Game.state.tiles[7][9].crop.id);
  check('picking a seed plants it', planted === 'turnip', planted);

  // ---- dig via the bubble: a not-thirsty crop offers Fertilize + Dig up ----
  await page.evaluate(() => { Game.state.tiles[7][9].crop.water = 1; }); // not thirsty → bubble, not auto-water
  const preDig = await page.evaluate(() => ({ coins: Game.state.coins }));
  await tapTile(9, 7);
  await page.waitForTimeout(200);
  await page.tap('#bubble .act-dig');
  await page.waitForTimeout(200);
  const dug = await page.evaluate(() => ({
    crop: !!Game.state.tiles[7][9].crop,
    soil: Game.state.tiles[7][9].k,
    coins: Game.state.coins,
  }));
  check('bubble Dig up digs the crop (refund $4, soil kept)', !dug.crop && dug.soil === 'soil' && dug.coins === preDig.coins + 4, dug);

  // ---- un-till: tapping bare soil → seed picker → Un-till returns it to grass ----
  await tapTile(9, 7);
  await page.waitForTimeout(250);
  await page.tap('#sheet-body .seed-untill');
  await page.waitForTimeout(250);
  const untilled = await page.evaluate(() => Game.state.tiles[7][9].k);
  check('seed-picker Un-till returns empty soil to grass', untilled === 'grass', untilled);

  // ---- a drag pans the camera (no tool painting) and dismisses the bubble ----
  await page.evaluate(() => {
    const s = Game.state;
    for (const x of [10, 11, 12]) s.tiles[6][x].k = 'soil';
    // a not-thirsty fertilizable crop so the tap opens a bubble to dismiss
    s.tiles[6][10].crop = { id: 'turnip', prog: 0.3, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
  });
  await tapTile(10, 6); // bubble up on the crop
  await page.waitForTimeout(200);
  const camBefore = await page.evaluate(() => ({ x: Renderer.cam.x, y: Renderer.cam.y }));
  const p1 = await tileXY(10, 6), p3 = await tileXY(12, 6);
  await page.evaluate(async ([a, b]) => {
    const canvas = document.getElementById('game');
    const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true,
    }));
    fire('pointerdown', a.x, a.y);
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      fire('pointermove', a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps);
      await new Promise(r => setTimeout(r, 16));
    }
    fire('pointerup', b.x, b.y);
  }, [p1, p3]);
  await page.waitForTimeout(300);
  const afterDrag = await page.evaluate(() => ({
    bubbleOpen: !document.getElementById('bubble').classList.contains('hidden'),
    tiles: [10, 11, 12].map(x => Game.state.tiles[6][x].k),
    camMoved: Math.hypot(Renderer.cam.x, Renderer.cam.y) > 0,
    cam: { x: Renderer.cam.x, y: Renderer.cam.y },
  }));
  check('dragging pans (tiles untouched) and dismisses the bubble',
    !afterDrag.bubbleOpen && afterDrag.tiles.every(k => k === 'soil')
    && (afterDrag.cam.x !== camBefore.x || afterDrag.cam.y !== camBefore.y), { camBefore, afterDrag });

  // ---- order card: deadline countdown, rush tag, "not grown yet" hint ----
  await page.evaluate(() => {
    const s = Game.state;
    s.produced = {}; // brand-new farm perspective
    s.inventory = {};
    s.orders = [];
    s.orderTimer = 0.1;
    Game.tick(0.2); // posts a fresh (rush-eligible) order
  });
  await page.tap('#btn-orders');
  await page.waitForTimeout(400);
  const orderCard = await page.evaluate(() => {
    const card = document.querySelector('#sheet-body .order-card:not(:first-child), #sheet-body .order-card');
    const all = document.getElementById('sheet-body').textContent;
    return {
      timer: !!document.querySelector('.order-timer'),
      timerText: document.querySelector('.order-timer') && document.querySelector('.order-timer').textContent,
      rush: !!document.querySelector('.rush-tag'),
      hint: !!document.querySelector('.order-hint'),
      hintText: document.querySelector('.order-hint') && document.querySelector('.order-hint').textContent,
      hasSkip: all.includes('Skip'),
      card: !!card,
    };
  });
  check('order card shows a deadline countdown', orderCard.timer && /days? left|s left/.test(orderCard.timerText), orderCard);
  check('order card shows RUSH +25% while eligible', orderCard.rush, orderCard);
  check('order card tags never-produced items', orderCard.hint && /Not grown yet/i.test(orderCard.hintText), orderCard);
  check('skip stays available', orderCard.hasSkip);
  await page.screenshot({ path: path.join(OUT, 'order-card.png') });
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- greenhouse: placement ghost + tap flash coverage ----
  await page.evaluate(() => {
    const s = Game.state;
    s.coins += 40000;
    Game.buyParcel(1); // unlock a neighbouring parcel for later placements
    Game.placeBuilding('greenhouse', 11, 8); // footprint (11,8)-(12,9), coverage x9..14 y6..11
  });
  await page.waitForTimeout(800); // let the land-purchase camera ceremony finish
  await page.evaluate(() => { Renderer.centerOn(11.5, 8.5); Renderer.cam.z = 0.85; });
  await page.waitForTimeout(200);
  await tapTile(11, 8); // tap the greenhouse → coverage flash + panel
  await page.waitForTimeout(250);
  const ghPanel = await page.evaluate(() => document.getElementById('sheet-title').textContent);
  check('tapping the greenhouse opens its panel', ghPanel === 'Greenhouse', ghPanel);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);
  await tapTile(11, 8); // tap again with a clear view — the 6×6 aura flashes for 2s
  await page.tap('#sheet-close');
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'greenhouse-coverage.png') });

  // ghost coverage while placing a second one
  await page.evaluate(() => {
    Renderer.setGhost({ type: 'greenhouse', x: 14, y: 7 });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'greenhouse-ghost.png') });
  const ghostOn = await page.evaluate(() => !!Renderer.getGhost());
  check('greenhouse ghost active (coverage tint drawn)', ghostOn);
  await page.evaluate(() => Renderer.setGhost(null));

  // ---- mill panel & processor slots UI ----
  const panels = await page.evaluate(() => {
    const G = Game, s = Game.state;
    s.coins += 30000;
    const millOk = G.placeBuilding('mill', 13, 5);
    s.inventory.wheat = 3;
    const creamOk = G.placeBuilding('creamery', 15, 8);
    const ci = s.buildings.findIndex(b => b && b.type === 'creamery');
    s.inventory.milk = 5;
    G.startRecipe(ci, 'cheese');
    G.startRecipe(ci, 'cheese');
    return { millOk, creamOk };
  });
  check('mill & creamery placed for panel checks', panels.millOk && panels.creamOk, panels);
  await page.evaluate(() => Renderer.centerOn(13.5, 5.5)); // zoom floor rose: keep the target clear of the HUD
  await page.waitForTimeout(250);
  await tapTile(13, 5);
  await page.waitForTimeout(300);
  const millPanel = await page.evaluate(() => ({
    title: document.getElementById('sheet-title').textContent,
    credits: document.getElementById('sheet-body').textContent.includes('Feed credits'),
    grind: document.getElementById('sheet-body').textContent.includes('Grind'),
  }));
  check('mill panel shows feed credits + grind actions', millPanel.title === 'Feed Mill' && millPanel.credits && millPanel.grind, millPanel);
  await page.tap('#sheet-close');
  await page.waitForTimeout(250);

  await page.evaluate(() => Renderer.centerOn(15.5, 8.5));
  await page.waitForTimeout(250);
  await tapTile(15, 8);
  await page.waitForTimeout(300);
  const procPanel = await page.evaluate(() => {
    const body = document.getElementById('sheet-body').textContent;
    return {
      title: document.getElementById('sheet-title').textContent,
      queued: body.includes('queued'),
      slotBtn: body.includes('Add craft slot 2'),
      slotLabel: body.includes('1 craft slot'),
    };
  });
  check('processor panel: sequential queue + slot purchase button', procPanel.title === 'Creamery' && procPanel.queued && procPanel.slotBtn && procPanel.slotLabel, procPanel);
  await page.screenshot({ path: path.join(OUT, 'processor-slots.png') });
  await page.tap('#sheet-close');

  // ---- menu: streaky odd jobs + season care entry ----
  await page.tap('#btn-menu');
  await page.waitForTimeout(350);
  const menu = await page.evaluate(() => {
    const body = document.getElementById('sheet-body').textContent;
    return { jobs: body.includes('odd jobs'), care: body.includes('Season care') };
  });
  check('menu offers odd jobs and Season care review', menu.jobs && menu.care, menu);
  await page.evaluate(() => {
    [...document.querySelectorAll('#sheet-body .row-card button')].find(b => b.textContent === 'Review').click();
  });
  await page.waitForTimeout(300);
  const careFromMenu = await page.evaluate(() => document.getElementById('sheet-title').textContent);
  check('menu → Review opens the Season Care sheet', careFromMenu === 'Season care', careFromMenu);
  await page.tap('#sheet-close');

  // ---- one-tap: grass tills directly, never a bubble ----
  await page.waitForTimeout(400); // let the sheet finish closing
  await tapTile(16, 10);
  await page.waitForTimeout(250);
  const grassTap = await page.evaluate(() => ({
    bubble: !document.getElementById('bubble').classList.contains('hidden'),
    tilled: Game.state.tiles[10][16].k === 'soil',
  }));
  check('tapping grass tills it directly — no bubble', grassTap.tilled && !grassTap.bubble, grassTap);

  // ---- keep-placing: drop several buildings without reopening the shop ----
  const repeat = await page.evaluate(() => {
    const s = Game.state; s.coins += 99999;
    document.getElementById('buildbar').classList.remove('hidden');
    const before = s.buildings.filter(b => b && b.type === 'sprinkler').length;
    let inModeEach = true;
    for (const [x, y] of [[2, 6], [4, 6], [6, 8]]) {
      Renderer.setGhost({ type: 'sprinkler', x, y });
      document.getElementById('build-ok').click();
      if (document.getElementById('buildbar').classList.contains('hidden') || !Renderer.getGhost()) inModeEach = false;
    }
    const after = s.buildings.filter(b => b && b.type === 'sprinkler').length;
    document.getElementById('build-cancel').click();
    const exited = document.getElementById('buildbar').classList.contains('hidden') && !Renderer.getGhost();
    return { placed: after - before, inModeEach, exited };
  });
  check('keep-placing: 3 buildings drop via repeated ✓, stays in build mode, then ✕ exits', repeat.placed === 3 && repeat.inModeEach && repeat.exited, repeat);

  // ---- reload: UI state intact, no errors ----
  await page.reload();
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => ({
    coins: Game.state.coins,
    gh: Game.state.buildings.some(b => b && b.type === 'greenhouse'),
    noToolbar: !document.getElementById('toolbar'),
    bubble: !!document.getElementById('bubble'),
  }));
  check('reload keeps the farm (and no toolbar comes back)', after.gh && after.noToolbar && after.bubble && Number.isFinite(after.coins), after);

  console.log(errors.length ? '\nJS ERRORS:\n' + errors.join('\n') : '\nNO JS ERRORS');
  console.log(`\nui: ${pass} passed, ${fail} failed${fail ? ' → ' + failures.join(' | ') : ''}`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED', e); process.exit(1); });
