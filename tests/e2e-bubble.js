/* Harvest Empire — contextual tile action bubble suite.
   The bottom toolbar is gone: tapping a farmable tile pops a bubble anchored
   to it listing only what that tile can do right now. This locks in the
   context rules, the dismiss gestures, viewport clamping and the untouched
   tap behaviors (buildings, the toni).
   Run: node tests/e2e-bubble.js  (see tests/README.md) */
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
  await page.waitForTimeout(500);

  const tileXY = (x, y) => page.evaluate(([x, y]) => Renderer.tileToScreen(x + 0.5, y + 0.5), [x, y]);
  async function tapTile(x, y) {
    const { x: sx, y: sy } = await tileXY(x, y);
    await page.touchscreen.tap(sx, sy);
    await page.waitForTimeout(250);
  }
  // classes + labels of the actions in the open bubble (empty when hidden)
  const bubbleState = () => page.evaluate(() => {
    const el = document.getElementById('bubble');
    return {
      open: !el.classList.contains('hidden') && !el.classList.contains('closing'),
      acts: [...el.querySelectorAll('.bubble-act')].map(b => b.classList[1]),
      labels: [...el.querySelectorAll('.ba-label')].map(l => l.textContent),
    };
  });

  // ---- grass: exactly Till ----
  await page.evaluate(() => Renderer.centerOn(8.5, 5.5));
  await page.waitForTimeout(200);
  await tapTile(8, 5);
  let b = await bubbleState();
  check('tapping grass opens the bubble with exactly [Till]', b.open && b.acts.length === 1 && b.acts[0] === 'act-till', b);

  // ---- till executes with the real action, then the bubble closes ----
  await page.tap('#bubble .act-till');
  await page.waitForTimeout(400);
  const tilled = await page.evaluate(() => ({
    k: Game.state.tiles[5][8].k,
    closed: document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('Till actually tills the tile and the bubble closes', tilled.k === 'soil' && tilled.closed, tilled);

  // ---- empty soil: Plant + Un-till ----
  await tapTile(8, 5);
  b = await bubbleState();
  check('empty soil offers Plant + Un-till', b.open && b.acts.join(',') === 'act-plant,act-dig' && b.labels.join(',') === 'Plant,Un-till', b);

  // ---- re-tap the same tile toggles the bubble away ----
  await tapTile(8, 5);
  await page.waitForTimeout(250);
  b = await bubbleState();
  const stillSoil = await page.evaluate(() => Game.state.tiles[5][8].k === 'soil');
  check('re-tapping the same tile closes the bubble (no action fires)', !b.open && stillSoil, b);

  // ---- outside tap (on the HUD) dismisses ----
  await tapTile(8, 5);
  b = await bubbleState();
  await page.tap('#pill-coins');
  await page.waitForTimeout(300);
  const afterOutside = await bubbleState();
  check('an outside tap dismisses the bubble', b.open && !afterOutside.open, { before: b, after: afterOutside });

  // ---- a camera pan dismisses ----
  await tapTile(8, 5);
  const start = await tileXY(8, 5);
  await page.evaluate(async a => {
    const canvas = document.getElementById('game');
    const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true,
    }));
    fire('pointerdown', a.x, a.y);
    for (let i = 1; i <= 8; i++) {
      fire('pointermove', a.x + i * 12, a.y + i * 6);
      await new Promise(r => setTimeout(r, 16));
    }
    fire('pointerup', a.x + 96, a.y + 48);
  }, start);
  await page.waitForTimeout(300);
  b = await bubbleState();
  check('starting a pan dismisses the bubble', !b.open, b);

  // ---- Plant opens the seed picker; the pick plants THAT tile ----
  await page.evaluate(() => Renderer.centerOn(8.5, 5.5));
  await page.waitForTimeout(200);
  await tapTile(8, 5);
  await page.tap('#bubble .act-plant');
  await page.waitForTimeout(400);
  const sheetUp = await page.evaluate(() => ({
    open: !document.getElementById('sheet').classList.contains('hidden'),
    title: document.getElementById('sheet-title').textContent,
  }));
  check('bubble Plant opens the seed picker sheet', sheetUp.open && /seed/i.test(sheetUp.title), sheetUp);
  await page.evaluate(() => {
    [...document.querySelectorAll('#sheet-body .item-card')].find(c => c.textContent.includes('Turnip')).click();
  });
  await page.waitForTimeout(400);
  const planted = await page.evaluate(() => ({
    crop: Game.state.tiles[5][8].crop && Game.state.tiles[5][8].crop.id,
    sheetClosed: document.getElementById('sheet').classList.contains('hidden'),
  }));
  check('picking a seed plants it on the tapped tile and closes the sheet', planted.crop === 'turnip' && planted.sheetClosed, planted);

  // ---- growing dry crop: Water (with charge chip) + Fertilize (cost chip) + Dig up ----
  await page.evaluate(() => { Game.state.tiles[5][8].crop.water = 0; Game.state.can.water = 4; });
  await tapTile(8, 5);
  const growing = await page.evaluate(() => {
    const water = document.querySelector('#bubble .act-water');
    const fert = document.querySelector('#bubble .act-fert');
    return {
      acts: [...document.querySelectorAll('#bubble .bubble-act')].map(x => x.classList[1]),
      chip: water && water.querySelector('.ba-chip') && water.querySelector('.ba-chip').textContent,
      waterEnabled: water && !water.disabled,
      fertChip: fert && fert.querySelector('.ba-chip') && fert.querySelector('.ba-chip').textContent,
    };
  });
  check('dry growing crop offers Water + Fertilize + Dig up', growing.acts.join(',') === 'act-water,act-fert,act-dig', growing);
  check('Water shows the remaining can charges as a chip (💧4)', growing.waterEnabled && growing.chip === '💧4', growing);
  check('Fertilize shows its coin cost chip', !!growing.fertChip && /\d/.test(growing.fertChip), growing);

  // ---- wilting crop: Water pulses for attention ----
  await tapTile(8, 5); // toggle away
  await page.evaluate(() => { Game.state.tiles[5][8].crop.wilt = 0.6; });
  await tapTile(8, 5);
  const wilty = await page.evaluate(() => {
    const w = document.querySelector('#bubble .act-water');
    return { attention: w && w.classList.contains('attention') };
  });
  check('a wilting crop\'s Water action pulses (attention class)', wilty.attention === true, wilty);

  // ---- empty can: Water disabled with a refill hint ----
  await tapTile(8, 5); // toggle away
  await page.evaluate(() => { Game.state.can.water = 0; });
  await tapTile(8, 5);
  const emptyCan = await page.evaluate(() => {
    const w = document.querySelector('#bubble .act-water');
    return {
      disabled: w && w.disabled,
      hint: w && w.querySelector('.ba-hint') && w.querySelector('.ba-hint').textContent,
      chip: w && !!w.querySelector('.ba-chip'),
    };
  });
  check('empty can disables Water with a "refill at the well" hint', emptyCan.disabled && /refill at the well/.test(emptyCan.hint) && !emptyCan.chip, emptyCan);

  // ---- watering works and closes the bubble ----
  await tapTile(8, 5); // toggle away
  await page.evaluate(() => { Game.state.can.water = 4; });
  await tapTile(8, 5);
  await page.tap('#bubble .act-water');
  await page.waitForTimeout(400);
  const watered = await page.evaluate(() => ({
    water: Game.state.tiles[5][8].crop.water,
    can: Game.state.can.water,
    closed: document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('Water waters the crop, spends a charge and closes the bubble', watered.water > 0.9 && watered.can === 3 && watered.closed, watered);

  // ---- ripe crop: a single tap harvests directly, NO bubble ----
  await page.evaluate(() => { Game.state.tiles[5][8].crop.prog = 1; });
  const preTurnips = await page.evaluate(() => Game.state.inventory.turnip || 0);
  await tapTile(8, 5);
  await page.waitForTimeout(400);
  const harvested = await page.evaluate(() => ({
    turnips: Game.state.inventory.turnip || 0,
    crop: !!Game.state.tiles[5][8].crop,
    bubbleHidden: document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('ripe crop harvests on a single tap — no bubble opens', harvested.turnips > preTurnips && !harvested.crop && harvested.bubbleHidden, harvested);

  // ---- dead crop: exactly Clear, and it explains the death ----
  await page.evaluate(() => {
    Game.state.tiles[5][8].crop = { id: 'turnip', prog: 0.4, water: 0, wilt: 1, rot: 0, dead: true, deadCause: 'thirst', fert: false, regrown: false };
    document.getElementById('toasts').innerHTML = '';
  });
  await tapTile(8, 5);
  b = await bubbleState();
  check('dead crop offers exactly [Clear]', b.open && b.acts.join(',') === 'act-clear', b);
  await page.tap('#bubble .act-clear');
  await page.waitForTimeout(400);
  const cleared = await page.evaluate(() => ({
    crop: !!Game.state.tiles[5][8].crop,
    toast: document.getElementById('toasts').textContent,
  }));
  check('Clear removes the dead crop and explains why it died', !cleared.crop && /died of/.test(cleared.toast), cleared);

  // ---- buildings keep their sheet (no bubble) ----
  await page.evaluate(() => {
    Game.state.coins += 20000;
    Game.placeBuilding('coop', 11, 8);
    Renderer.centerOn(11.5, 8.5);
  });
  await page.waitForTimeout(250);
  await tapTile(11, 8);
  await page.waitForTimeout(300);
  const coopTap = await page.evaluate(() => ({
    sheet: !document.getElementById('sheet').classList.contains('hidden'),
    title: document.getElementById('sheet-title').textContent,
    bubble: !document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('tapping a building opens its sheet, never a bubble', coopTap.sheet && /Coop/i.test(coopTap.title) && !coopTap.bubble, coopTap);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- the toni keeps its paper (no bubble) ----
  await page.evaluate(() => {
    Game.state.tonis.push({ x: 10, y: 9, day: 1, seen: false });
    Renderer.centerOn(10.5, 9.5);
  });
  await page.waitForTimeout(250);
  await tapTile(10, 9);
  await page.waitForTimeout(400);
  const toniTap = await page.evaluate(() => ({
    paper: !!document.getElementById('toni-paper'),
    overlay: !document.getElementById('toni-overlay').classList.contains('hidden'),
    bubble: !document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('tapping the toni opens the paper, never a bubble', toniTap.paper && toniTap.overlay && !toniTap.bubble, toniTap);
  await page.evaluate(() => { // fold it away and remove her
    document.getElementById('toni-overlay').classList.add('hidden');
    document.getElementById('toni-overlay').innerHTML = '';
    Game.state.tonis = [];
  });

  // ---- 320×568: a corner tile's bubble stays inside the viewport ----
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    // park tile (8,6) near the top-left corner of the tiny screen
    // (zoomed in so the camera clamp allows the world edge to leave view)
    Renderer.cam.z = 1.8;
    Renderer.centerOn(8.5, 6.5);
    Renderer.cam.x += (Renderer.vw / 2 - 30) / Renderer.cam.z;
    Renderer.cam.y += (Renderer.vh / 2 - 140) / Renderer.cam.z; // below the HUD/goal chip
    Renderer.clampCam();
  });
  await page.waitForTimeout(250);
  await tapTile(8, 6);
  const corner = await page.evaluate(() => {
    const el = document.getElementById('bubble');
    const r = el.getBoundingClientRect();
    return {
      open: !el.classList.contains('hidden'),
      below: el.classList.contains('below'),
      fits: r.left >= 8 && r.top >= 8 && r.right <= window.innerWidth - 8 && r.bottom <= window.innerHeight - 8,
      rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) },
      vw: window.innerWidth, vh: window.innerHeight,
    };
  });
  check('corner tile at 320×568: bubble clamps inside the viewport (flips below)', corner.open && corner.fits && corner.below, corner);
  await page.screenshot({ path: path.join(OUT, 'bubble-corner-320.png') });

  console.log(errors.length ? '\nJS ERRORS:\n' + errors.join('\n') : '\nNO JS ERRORS');
  console.log(`\nbubble: ${pass} passed, ${fail} failed${fail ? ' → ' + failures.join(' | ') : ''}`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED', e); process.exit(1); });
