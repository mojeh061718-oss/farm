/* Harvest Empire — data-safety, exploit-guard & save-migration e2e suite.
   Run: node tests/e2e-safety.js  (see tests/README.md) */
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(INDEX);
  await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);
  await page.tap('#setup-start');
  await page.waitForTimeout(400);

  // ---- exploit guards (ported) ----
  const guards = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    const c0 = s.coins, f0 = s.fuel;
    out.negFuelBlocked = G.buyFuel(-10) === false && s.coins === c0 && s.fuel === f0;
    out.nanFuelBlocked = G.buyFuel('lol') === false && s.coins === c0;
    out.hugeFuelBlocked = G.buyFuel(99999) === false;
    out.posFuelWorks = G.buyFuel(5) === true && s.fuel === f0 + 5;
    const well = G.buildingsOf('well')[0];
    out.lastWellBlocked = G.sellBuilding(well.i) === false;
    // grind guards
    out.grindNoMill = G.grindGrain('wheat', 5) === 0; // no mill yet
    out.grindBadItem = G.grindGrain('cheese', 5) === 0;
    // goal chain: a skipped goal never blocks later payouts
    s.stats.tilled = 10; s.stats.planted = 10; s.stats.watered = 10; s.stats.harvested = 10;
    s.stats.earned = 500; s.stats.collected = 9; s.stats.fertilized = 9;
    s.coins += 5000;
    G.placeBuilding('scarecrow', 8, 9); // 'equip' goal sits AFTER the orders goal
    const done = s.goalsDone || [];
    out.laterGoalPaid = done.includes('equip') && done.includes('fert');
    out.ordersGoalStillPending = !done.includes('order');
    return out;
  });
  check('negative/NaN/huge fuel purchases blocked', guards.negFuelBlocked && guards.nanFuelBlocked && guards.hugeFuelBlocked && guards.posFuelWorks, guards);
  check('cannot sell the last well', guards.lastWellBlocked);
  check('grinding requires a mill and real grain', guards.grindNoMill && guards.grindBadItem, guards);
  check('goals pay in any order (skipped goal never deadlocks)', guards.laterGoalPaid && guards.ordersGoalStillPending, guards);

  // ---- odd jobs floor & once-per-day ----
  const jobs = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    const c0 = s.coins;
    out.paid = G.workOddJobs() && s.coins === c0 + 40;
    out.oncePerDay = !G.workOddJobs();
    return out;
  });
  check('odd jobs pay $40 and only once per day', jobs.paid && jobs.oncePerDay, jobs);

  // ---- farm code roundtrip ----
  const codes = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.coins = 12345; s.farmName = 'Roundtrip Ranch';
    const code = G.exportCode();
    out.codeFormat = code.startsWith('HE1.');
    s.coins = 1; s.farmName = 'Wrong';
    const imp = G.importCode(code);
    out.importOk = imp.ok && Game.state.coins === 12345 && Game.state.farmName === 'Roundtrip Ranch';
    out.badCodeRejected = !G.importCode(code.slice(0, -4) + 'beef').ok;
    out.garbageRejected = !G.importCode('hello world').ok;
    return out;
  });
  check('farm code export/import roundtrip', codes.codeFormat && codes.importOk, codes);
  check('damaged/garbage codes rejected', codes.badCodeRejected && codes.garbageRejected, codes);

  // ---- v3 save WITHOUT any 2.0 fields must load & migrate (additive only) ----
  await page.evaluate(() => {
    const s = Game.state;
    // strip every 2.0 field to simulate a pre-2.0 v3 save
    delete s.feedCredits;
    delete s.usedNames;
    delete s.produced;
    delete s.stats.recent;
    delete s.stats.prodMark;
    s.orders = [{ id: 'oLegacy', reqs: { turnip: 3 }, coins: 100, xp: 10 }]; // no expires/posted
    s.coins += 30000;
    Game.placeBuilding('greenhouse', 11, 8); // old save owns one
    delete s._flags.ghAreaNotice;
    Game.placeBuilding('bakery', 7, 7);
    const bi = s.buildings.findIndex(b => b && b.type === 'bakery');
    const b = s.buildings[bi];
    delete b.slots;
    b.queue = [{ r: 'bread', done: s.now + 30 }, { r: 'bread', done: s.now + 30 }]; // old parallel format
    s.lastSaved = Date.now();
    localStorage.setItem('harvest-empire-save-v3', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForTimeout(1200);
  const migrated = await page.evaluate(() => {
    const s = Game.state;
    const bakery = s.buildings.find(b => b && b.type === 'bakery');
    return {
      loaded: !!s && s.setupDone === true && s.farmName === 'Roundtrip Ranch',
      credits: s.feedCredits === 0,
      usedNames: Array.isArray(s.usedNames),
      produced: typeof s.produced === 'object',
      recent: s.stats.recent === 0,
      orderExpiry: s.orders.every(o => o.expires != null && o.posted != null),
      slots: bakery.slots === 1,
      legacyJobs: bakery.queue.length === 2 && bakery.queue.every(j => j.left > 0 && j.legacy === true),
      ghNoticeQueued: s._flags.ghAreaNotice === true,
    };
  });
  check('pre-2.0 v3 save loads (no data loss)', migrated.loaded, migrated);
  check('missing 2.0 fields defaulted on load', migrated.credits && migrated.usedNames && migrated.produced && migrated.recent, migrated);
  check('old orders gain deadlines on load', migrated.orderExpiry, migrated);
  check('old craft queues migrate: slots=1, jobs grandfathered', migrated.slots && migrated.legacyJobs, migrated);
  check('greenhouse-area notice queued once for old saves', migrated.ghNoticeQueued, migrated);

  // the deferred toast fires on the first live ticks
  await page.waitForTimeout(1200);
  const ghToast = await page.evaluate(() => {
    const log = document.getElementById('toasts').textContent;
    return { flag: Game.state._flags.pendingToast === undefined, note: log };
  });
  check('greenhouse area toast delivered after load', ghToast.flag, ghToast);

  // legacy parallel jobs actually run in parallel to completion
  const legacyDone = await page.evaluate(() => {
    const s = Game.state;
    s.t = 0.1; s.forecast = 'rain';
    for (let i = 0; i < 31; i++) Game.tick(1);
    const bakery = s.buildings.find(b => b && b.type === 'bakery');
    return bakery.queue.filter(j => j.left <= 0).length;
  });
  check('grandfathered jobs all finish (parallel honored once)', legacyDone === 2, legacyDone);

  // ---- corruption recovery from backup snapshots ----
  await page.evaluate(() => {
    Game.state.coins = 55555;
    Game.save();
    localStorage.setItem('harvest-empire-backup-1', JSON.stringify({ at: Date.now(), data: localStorage.getItem('harvest-empire-save-v3') }));
    localStorage.setItem('harvest-empire-save-v3', '{"corrupt": tru');
  });
  await page.reload();
  await page.waitForTimeout(1200);
  const recovered = await page.evaluate(() => ({
    coins: Game.state && Game.state.coins,
    setupHidden: document.getElementById('setup').classList.contains('hidden'),
  }));
  check('corrupted save recovers from backup snapshot', recovered.coins === 55555 && recovered.setupHidden, recovered);

  // ---- hard reset actually resets: no snapshot resurrection, ever ----
  // regression: resetGame used to leave the 3 backups behind AND the pagehide
  // save re-wrote a pre-setup shell, so every reset "recovered" the old farm.
  await page.evaluate(() => { Game.resetGame(); });
  await page.reload(); // fires pagehide -> save(), which must now be latched off
  await page.waitForTimeout(1200);
  const wiped = await page.evaluate(() => ({
    setupShown: !document.getElementById('setup').classList.contains('hidden'),
    main: localStorage.getItem('harvest-empire-save-v3'),
    b1: localStorage.getItem('harvest-empire-backup-1'),
    b2: localStorage.getItem('harvest-empire-backup-2'),
    b3: localStorage.getItem('harvest-empire-backup-3'),
    toast: document.getElementById('toasts').textContent,
  }));
  check('hard reset lands on a FRESH setup screen — main + all backups erased, no snapshot toast',
    wiped.setupShown && !wiped.main && !wiped.b1 && !wiped.b2 && !wiped.b3
    && !wiped.toast.includes('snapshot'), wiped);
  // abandoning the setup screen must not write an invalid save that would
  // resurrect a backup on the next open
  await page.reload();
  await page.waitForTimeout(1000);
  const still = await page.evaluate(() => ({
    setupShown: !document.getElementById('setup').classList.contains('hidden'),
    main: localStorage.getItem('harvest-empire-save-v3'),
  }));
  check('leaving during setup never persists a pre-setup shell', still.setupShown && !still.main, still);

  console.log(errors.length ? '\nJS ERRORS:\n' + errors.join('\n') : '\nNO JS ERRORS');
  console.log(`\nsafety: ${pass} passed, ${fail} failed${fail ? ' → ' + failures.join(' | ') : ''}`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED', e); process.exit(1); });
