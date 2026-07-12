/* Harvest Empire — multi-farm return-catch-up e2e suite.
   Locks in catchUpFarm(): a farm sat frozen while you tended another; on return
   its crops fast-forward by the game-time that passed (growth-only, no death),
   a blessed (Toni) farm banks the harvests it would have made, the shared clock
   stays untouched, and the fast-forward is capped at the 2.5-day away-limit.
   Run: node tests/e2e-catchup.js  (see tests/README.md) */
'use strict';
const { chromium } = require('playwright-core');
const path = require('path');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

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
  await page.fill('#farm-name', 'Catchup Acres');
  await page.tap('#setup-start');
  await page.evaluate(() => { DATA.TONI.plantChance = 0; }).catch(() => {}); // deterministic: no stray bloom mid-test
  await page.waitForTimeout(400);

  // ---- buy a second farm and verify ownership/switch ----
  const bought = await page.evaluate(() => {
    Game.save = () => {};
    const s = Game.state;
    s.coins = 999999;
    s.season = 0; // spring, so wheat/turnip grow
    const ok = Game.buyFarm('meadow');
    const farms = Game.ownedFarms();
    return { ok, count: farms.length, active: s.activeFarm, w: s.w, h: s.h };
  });
  check('buyFarm meadow succeeds & becomes active', bought.ok && bought.count === 2 && bought.active === 1, bought);
  check('meadow world dims applied (14x11)', bought.w === 14 && bought.h === 11, bought);

  // ---- plant crops on the meadow (active), then leave for home ----
  await page.evaluate(() => {
    const s = Game.state, G = Game;
    // till + plant a small block of wheat on the meadow, mid-growth, watered
    for (let x = 3; x <= 6; x++) { G.till(x, 4); G.plant(x, 4, 'wheat'); const c = s.tiles[4][x].crop; c.prog = 0.4; c.water = 1; }
  });
  const leftAt = await page.evaluate(() => {
    // switch back to home (index 0) — this snapshots the meadow with tendedNow
    Game.switchFarm(0);
    return { now: Game.state.now, active: Game.state.activeFarm };
  });
  check('switched back to home', leftAt.active === 0, leftAt);

  // ---- advance the SHARED clock by ~1.5 game-days while on home ----
  await page.evaluate(() => {
    const s = Game.state;
    // hand-advance the meadow's frozen stamp: pretend 1.5 days of game-time passed.
    // (bump now directly so the crops' elapsed = 1.5 days when we return)
    s.now += 1.5 * DATA.DAY_LEN;
    // also stamp home's snapshot so its own return-catchup is a no-op baseline
  });

  // ---- return to the meadow: crops should have finished growing ----
  // measure the shared clock immediately around the synchronous switch so the
  // only thing that could move state.now is catch-up itself (not the live loop)
  const back = await page.evaluate(() => {
    const s = Game.state;
    const nowBefore = s.now;
    Game.switchFarm(1);
    const nowAfter = s.now;
    const crops = [];
    for (let x = 3; x <= 6; x++) { const c = s.tiles[4][x].crop; crops.push(c ? { prog: c.prog, dead: !!c.dead } : null); }
    return { active: s.activeFarm, crops, w: s.w, h: s.h, clockDelta: nowAfter - nowBefore };
  });
  check('returned to meadow', back.active === 1, back);
  const allRipe = back.crops.every(c => c && c.prog >= 1 && !c.dead);
  check('frozen meadow crops fast-forwarded to ripe (no death)', allRipe, back.crops);
  check('catch-up does NOT advance the shared clock', back.clockDelta === 0, back);

  // ---- blessed farm banks harvests on return ----
  const blessed = await page.evaluate(() => {
    const s = Game.state, G = Game;
    // ensure we're on the meadow; drop a toni on its parcel to bless it
    if (s.activeFarm !== 1) G.switchFarm(1);
    // clear any inventory noise for a clean delta
    const invBefore = Object.assign({}, s.inventory);
    // plant a fresh block, then plant a toni so the whole parcel is blessed
    for (let x = 3; x <= 6; x++) { G.till(x, 6); G.plant(x, 6, 'wheat'); s.tiles[6][x].crop.prog = 0.9; s.tiles[6][x].crop.water = 1; }
    // force a toni onto the meadow (single big parcel → whole farm blessed)
    s.tonis = [{ x: 5, y: 6, day: 0, seen: true }];
    const wheatBefore = s.inventory.wheat || 0;
    // leave and come back after ~2 game-days so blessed crops bank multiple cycles
    G.switchFarm(0);
    s.now += 2 * DATA.DAY_LEN;
    let dg; G.on('farmswitch', (i, d) => dg = d);
    G.switchFarm(1);
    const wheatAfter = s.inventory.wheat || 0;
    return { wheatBefore, wheatAfter, banked: dg && dg.banked, gained: wheatAfter - wheatBefore };
  });
  check('blessed farm banked harvests while away', blessed.gained > 0, blessed);
  check('digest reports banked count', blessed.banked > 0, blessed);

  // ---- cap: a huge away-time is clamped to 2.5 days of growth ----
  const capped = await page.evaluate(() => {
    const s = Game.state, G = Game;
    if (s.activeFarm !== 1) G.switchFarm(1);
    // remove the toni so this is a plain growth test
    s.tonis = [];
    // a fresh un-grown crop, then pretend 100 days passed
    G.till(8, 8); G.plant(8, 8, 'wheat'); s.tiles[8][8].crop.prog = 0; s.tiles[8][8].crop.water = 1;
    G.switchFarm(0);
    s.now += 100 * DATA.DAY_LEN; // absurd away-time
    let dg; G.on('farmswitch', (i, d) => dg = d);
    G.switchFarm(1);
    return { elapsed: dg && dg.elapsed, cap: 2.5 * DATA.DAY_LEN };
  });
  check('catch-up elapsed clamped to 2.5-day cap', capped.elapsed !== undefined && capped.elapsed <= capped.cap + 0.01, capped);

  // ---- no console/page errors throughout ----
  check('no runtime errors', errors.length === 0, errors.slice(0, 4));

  await browser.close();
  console.log(`\n  ${pass} passed, ${fail} failed`);
  if (fail) { console.log('  FAILURES: ' + failures.join(', ')); process.exit(1); }
})();
