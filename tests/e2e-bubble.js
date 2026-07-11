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

  // ---- grass: a single tap tills it, no bubble ----
  await page.evaluate(() => Renderer.centerOn(8.5, 5.5));
  await page.waitForTimeout(200);
  await tapTile(8, 5);
  await page.waitForTimeout(300);
  let b = await bubbleState();
  const tilled = await page.evaluate(() => Game.state.tiles[5][8].k);
  check('tapping grass tills it directly — no bubble', tilled === 'soil' && !b.open, { tilled, b });

  // ---- empty soil: a tap opens the seed picker (the choice), no bubble ----
  await tapTile(8, 5);
  await page.waitForTimeout(300);
  const soilTap = await page.evaluate(() => ({
    sheet: !document.getElementById('sheet').classList.contains('hidden'),
    title: document.getElementById('sheet-title').textContent,
    bubble: !document.getElementById('bubble').classList.contains('hidden'),
    untill: !!document.querySelector('#sheet-body .seed-untill'),
  }));
  check('tapping bare soil opens the seed picker (no bubble) with an Un-till option',
    soilTap.sheet && /seed/i.test(soilTap.title) && !soilTap.bubble && soilTap.untill, soilTap);

  // picking a seed plants it on the tapped tile
  await page.evaluate(() => {
    [...document.querySelectorAll('#sheet-body .item-card')].find(c => c.textContent.includes('Turnip')).click();
  });
  await page.waitForTimeout(400);
  const planted = await page.evaluate(() => ({
    crop: Game.state.tiles[5][8].crop && Game.state.tiles[5][8].crop.id,
    sheetClosed: document.getElementById('sheet').classList.contains('hidden'),
  }));
  check('picking a seed plants it on the tapped tile and closes the sheet', planted.crop === 'turnip' && planted.sheetClosed, planted);

  // ---- Un-till from inside the seed picker clears the plot ----
  await page.evaluate(() => { Game.state.tiles[5][8].crop = null; }); // back to bare soil
  await tapTile(8, 5);
  await page.waitForTimeout(300);
  await page.tap('#sheet-body .seed-untill');
  await page.waitForTimeout(400);
  const untilled = await page.evaluate(() => ({
    k: Game.state.tiles[5][8].k,
    sheetClosed: document.getElementById('sheet').classList.contains('hidden'),
  }));
  check('Un-till in the seed picker turns the plot back to grass', untilled.k === 'grass' && untilled.sheetClosed, untilled);

  // ---- thirsty crop + a full can: a single tap just waters it, no bubble ----
  await page.evaluate(() => {
    Game.state.tiles[5][8].k = 'soil';
    Game.state.tiles[5][8].crop = { id: 'turnip', prog: 0.3, water: 0, wilt: 0, rot: 0, dead: false, fert: true, regrown: false };
    Game.state.can.water = 4;
  });
  await tapTile(8, 5);
  await page.waitForTimeout(400);
  const autoWater = await page.evaluate(() => ({
    water: Game.state.tiles[5][8].crop.water,
    can: Game.state.can.water,
    bubble: !document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('a thirsty crop waters on a single tap — no bubble (a charge is spent)',
    autoWater.water > 0.9 && autoWater.can === 3 && !autoWater.bubble, autoWater);

  // ---- a crop with a real choice (Fertilize) opens the bubble ----
  await page.evaluate(() => {
    Game.state.tiles[5][8].crop.fert = false; // now fertilizable
    Game.state.tiles[5][8].crop.water = 1;    // not thirsty → only Fertilize / Dig remain
  });
  await tapTile(8, 5);
  const growing = await page.evaluate(() => {
    const fert = document.querySelector('#bubble .act-fert');
    return {
      acts: [...document.querySelectorAll('#bubble .bubble-act')].map(x => x.classList[1]),
      fertChip: fert && fert.querySelector('.ba-chip') && fert.querySelector('.ba-chip').textContent,
    };
  });
  check('a fertilizable crop opens the bubble with Fertilize + Dig up', growing.acts.join(',') === 'act-fert,act-dig', growing);
  check('Fertilize shows its coin cost chip', !!growing.fertChip && /\d/.test(growing.fertChip), growing);

  // ---- re-tap the same tile toggles the bubble away ----
  await tapTile(8, 5);
  await page.waitForTimeout(250);
  b = await bubbleState();
  check('re-tapping the same tile closes the bubble (no action fires)', !b.open, b);

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

  // ---- Fertilize executes and closes the bubble ----
  await page.evaluate(() => { Game.state.coins += 5000; Renderer.centerOn(8.5, 5.5); });
  await page.waitForTimeout(150);
  await tapTile(8, 5);
  await page.tap('#bubble .act-fert');
  await page.waitForTimeout(400);
  const ferted = await page.evaluate(() => ({
    fert: !!Game.state.tiles[5][8].crop.fert,
    closed: document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('Fertilize applies and closes the bubble', ferted.fert && ferted.closed, ferted);

  // ---- empty can + thirsty crop → bubble with Water disabled + refill hint ----
  await page.evaluate(() => {
    Game.state.tiles[5][8].crop = { id: 'turnip', prog: 0.3, water: 0, wilt: 0, rot: 0, dead: false, fert: true, regrown: false };
    Game.state.can.water = 0;
  });
  await tapTile(8, 5);
  const emptyCan = await page.evaluate(() => {
    const w = document.querySelector('#bubble .act-water');
    return {
      open: !document.getElementById('bubble').classList.contains('hidden'),
      disabled: w && w.disabled,
      hint: w && w.querySelector('.ba-hint') && w.querySelector('.ba-hint').textContent,
    };
  });
  check('empty can + thirsty crop → bubble with Water disabled and a "refill at the well" hint',
    emptyCan.open && emptyCan.disabled && /refill at the well/.test(emptyCan.hint), emptyCan);
  await tapTile(8, 5); // toggle away

  // ---- ripe crop: a single tap harvests directly, NO bubble ----
  await page.evaluate(() => {
    Game.state.can.water = 4;
    Game.state.tiles[5][8].crop = { id: 'turnip', prog: 1, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
  });
  const preTurnips = await page.evaluate(() => Game.state.inventory.turnip || 0);
  await tapTile(8, 5);
  await page.waitForTimeout(400);
  const harvested = await page.evaluate(() => ({
    turnips: Game.state.inventory.turnip || 0,
    crop: !!Game.state.tiles[5][8].crop,
    bubbleHidden: document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('ripe crop harvests on a single tap — no bubble opens', harvested.turnips > preTurnips && !harvested.crop && harvested.bubbleHidden, harvested);

  // ---- dead crop: a single tap clears it (explains why), no bubble ----
  await page.evaluate(() => {
    Game.state.tiles[5][8].k = 'soil';
    Game.state.tiles[5][8].crop = { id: 'turnip', prog: 0.4, water: 0, wilt: 1, rot: 0, dead: true, deadCause: 'thirst', fert: false, regrown: false };
    document.getElementById('toasts').innerHTML = '';
  });
  await tapTile(8, 5);
  await page.waitForTimeout(400);
  const cleared = await page.evaluate(() => ({
    crop: !!Game.state.tiles[5][8].crop,
    toast: document.getElementById('toasts').textContent,
    bubbleHidden: document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('dead crop clears on a single tap and explains why it died — no bubble',
    !cleared.crop && /died of/.test(cleared.toast) && cleared.bubbleHidden, cleared);

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
    // a fertilizable crop so the tap opens a bubble (grass/soil would auto-act)
    Game.state.tiles[6][8].k = 'soil';
    Game.state.tiles[6][8].crop = { id: 'turnip', prog: 0.3, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
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
