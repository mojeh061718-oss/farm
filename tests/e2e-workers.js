/* Harvest Empire — Farmhands (hired workers) e2e suite.
   Covers hiring (cost/cap), each job type working its patch, zone restriction,
   dawn payroll (pay + can't-make-payroll downs tools), training, dismissal,
   save round-trip, and the offline no-op. Drives the engine API directly.
   Run: node tests/e2e-workers.js */
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
  await page.fill('#farm-name', 'Crew Ranch');
  await page.tap('#setup-start');
  await page.evaluate(() => {
    Game.save = () => {};
    DATA.TONI.plantChance = 0;              // no stray bloom from a Planter
    const s = Game.state, D = DATA;
    s.coins = 1000000;
    s.unlockedParcels = D.PARCELS.map((_, i) => i); // own the whole valley
    s.season = 0; s.weather = 'sun'; s.forecast = 'sun'; s.t = 0.3;
  });
  await page.waitForTimeout(200);

  // ---- config constants ----
  const cfg = await page.evaluate(() => ({ W: DATA.WORKER, jobs: Object.keys(DATA.WORKER_JOBS), names: DATA.WORKER_NAMES.length }));
  check('worker config: hire $2500, wage $120, maxCrew 8, 5 jobs',
    cfg.W.hireCost === 2500 && cfg.W.baseWage === 120 && cfg.W.maxCrew === 8 && cfg.jobs.length === 5, cfg);

  // ---- hire: cost + roster ----
  const hire = await page.evaluate(() => {
    const s = Game.state; const c0 = s.coins;
    const w = Game.hireWorker('harvest');
    return { ok: !!w, spent: c0 - s.coins, crew: s.workers.length, name: w && w.name, job: w && w.job, zone: w && w.zone, lvl: w && w.level };
  });
  check('hire deducts the signing fee and adds a hand', hire.ok && hire.spent === 2500 && hire.crew === 1, hire);
  check('a new hand starts Lv1 Harvester on the whole farm, with a name', hire.job === 'harvest' && hire.zone === 'all' && hire.lvl === 1 && !!hire.name, hire);

  // ---- harvester works its patch ----
  const harv = await page.evaluate(() => {
    const s = Game.state, G = Game;
    const P = DATA.PARCELS[0];
    let planted = 0;
    for (let y = P.y; y < P.y + P.h && planted < 12; y++) for (let x = P.x; x < P.x + P.w && planted < 12; x++) {
      s.tiles[y][x].k = 'soil';
      s.tiles[y][x].crop = { id: 'turnip', prog: 1, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
      planted++;
    }
    const h0 = s.stats.harvested, inv0 = s.inventory.turnip || 0;
    for (let i = 0; i < 40; i++) G.tick(1); // 40s: a Lv1 hand (~0.85/s) clears them
    let ripeLeft = 0; for (let y = P.y; y < P.y + P.h; y++) for (let x = P.x; x < P.x + P.w; x++) { const c = s.tiles[y][x].crop; if (c && c.prog >= 1 && !c.dead) ripeLeft++; }
    return { planted, harvested: s.stats.harvested - h0, invGain: (s.inventory.turnip || 0) - inv0, ripeLeft };
  });
  check('a Harvester brings in the ripe crops in its patch', harv.harvested >= 10 && harv.invGain >= 10 && harv.ripeLeft <= 2, harv);

  // ---- zone restriction: a hand ignores land outside its patch ----
  const zoned = await page.evaluate(() => {
    const s = Game.state, G = Game, D = DATA;
    // clear the board
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { s.tiles[y][x].crop = null; }
    s.workers = [];
    const w = Game.hireWorker('harvest');
    Game.assignWorker(w.uid, { zone: 1 }); // parcel 1 only
    const inP = (p, x, y) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h;
    const P1 = D.PARCELS[1], P0 = D.PARCELS[0];
    const ins = { x: P1.x, y: P1.y }, out = { x: P0.x, y: P0.y };
    for (const t of [ins, out]) { s.tiles[t.y][t.x].k = 'soil'; s.tiles[t.y][t.x].crop = { id: 'wheat', prog: 1, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false }; }
    for (let i = 0; i < 20; i++) G.tick(1);
    return { insideGone: !s.tiles[ins.y][ins.x].crop, outsideKept: !!s.tiles[out.y][out.x].crop };
  });
  check('a zoned hand harvests inside its patch but not outside it', zoned.insideGone && zoned.outsideKept, zoned);

  // ---- planter sows empty tilled soil (in season) and pays for seed ----
  const plant = await page.evaluate(() => {
    const s = Game.state, G = Game, D = DATA;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { s.tiles[y][x].crop = null; if (s.tiles[y][x].k === 'soil') s.tiles[y][x].k = 'grass'; }
    s.workers = [];
    const P = D.PARCELS[0];
    let beds = 0;
    for (let y = P.y; y < P.y + P.h && beds < 8; y++) for (let x = P.x; x < P.x + P.w && beds < 8; x++) { s.tiles[y][x].k = 'soil'; beds++; }
    const w = Game.hireWorker('plant'); Game.assignWorker(w.uid, { job: 'plant', seed: 'turnip', zone: 0 });
    const p0 = s.stats.planted, c0 = s.coins;
    for (let i = 0; i < 30; i++) G.tick(1);
    let sown = 0; for (let y = P.y; y < P.y + P.h; y++) for (let x = P.x; x < P.x + P.w; x++) { const c = s.tiles[y][x].crop; if (c && c.id === 'turnip') sown++; }
    return { sown, plantedStat: s.stats.planted - p0, paidSeed: c0 - s.coins > 0 };
  });
  check('a Planter sows empty beds with its chosen seed and pays for seed', plant.sown >= 6 && plant.plantedStat >= 6 && plant.paidSeed, plant);

  // ---- waterer keeps thirsty crops watered ----
  const watered = await page.evaluate(() => {
    const s = Game.state, G = Game, D = DATA;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) s.tiles[y][x].crop = null;
    s.workers = [];
    const P = D.PARCELS[0]; const tx = P.x, ty = P.y;
    s.tiles[ty][tx].k = 'soil';
    s.tiles[ty][tx].crop = { id: 'wheat', prog: 0.3, water: 0, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    const w = Game.hireWorker('water'); Game.assignWorker(w.uid, { job: 'water', zone: 0 });
    for (let i = 0; i < 6; i++) G.tick(1);
    return { water: s.tiles[ty][tx].crop.water };
  });
  check('a Waterer tops up a thirsty crop', watered.water > 0.9, watered);

  // ---- tiller opens grass into soil ----
  const tilled = await page.evaluate(() => {
    const s = Game.state, G = Game, D = DATA;
    s.workers = [];
    const P = D.PARCELS[0];
    for (let y = P.y; y < P.y + P.h; y++) for (let x = P.x; x < P.x + P.w; x++) { s.tiles[y][x].crop = null; s.tiles[y][x].k = 'grass'; }
    // clear any building obj under the patch so grass is tillable
    const t0 = s.stats.tilled;
    const w = Game.hireWorker('till'); Game.assignWorker(w.uid, { job: 'till', zone: 0 });
    for (let i = 0; i < 20; i++) G.tick(1);
    return { tilledStat: s.stats.tilled - t0 };
  });
  check('a Tiller breaks open grass into soil', tilled.tilledStat >= 8, tilled);

  // ---- dawn payroll: wages leave the wallet ----
  const pay = await page.evaluate(() => {
    const s = Game.state, G = Game;
    s.workers = []; Game.hireWorker('harvest'); Game.hireWorker('water'); // 2 Lv1 hands → $240/day
    const bill = Game.workerWageBill();
    s.coins = 100000; const c0 = s.coins;
    s.t = 0.99; s.day = 3; s.weather = 'sun'; s.forecast = 'sun';
    G.tick(1.5); // crosses dawn → payWorkers
    return { bill, paid: c0 - s.coins >= bill, anyUnpaid: s.workers.some(w => w.unpaid) };
  });
  check('payroll: the crew is paid at dawn ($240 for two Lv1 hands)', pay.bill === 240 && pay.paid && !pay.anyUnpaid, pay);

  // ---- can't make payroll → hands down tools, then resume when paid ----
  const broke = await page.evaluate(() => {
    const s = Game.state, G = Game, D = DATA;
    s.coins = 10; // can't cover the wage bill
    s.t = 0.99; s.day = 4; s.weather = 'sun'; s.forecast = 'sun';
    G.tick(1.5);
    const wentUnpaid = s.workers.every(w => w.unpaid);
    // an unpaid harvester ignores a ripe crop
    const P = D.PARCELS[0], tx = P.x, ty = P.y;
    s.tiles[ty][tx].k = 'soil';
    s.tiles[ty][tx].crop = { id: 'turnip', prog: 1, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    for (let i = 0; i < 10; i++) G.tick(1);
    const idledWhileUnpaid = !!s.tiles[ty][tx].crop;
    // pay them next dawn → back to work
    s.coins = 100000; s.t = 0.99; s.day = 5; G.tick(1.5);
    const backOnPayroll = s.workers.every(w => !w.unpaid);
    for (let i = 0; i < 10; i++) G.tick(1);
    const resumed = !s.tiles[ty][tx].crop;
    return { wentUnpaid, idledWhileUnpaid, backOnPayroll, resumed };
  });
  check('unpaid hands down tools, then resume once payroll clears', broke.wentUnpaid && broke.idledWhileUnpaid && broke.backOnPayroll && broke.resumed, broke);

  // ---- training raises level, rate and wage ----
  const train = await page.evaluate(() => {
    const s = Game.state, G = Game;
    s.workers = []; const w = Game.hireWorker('harvest');
    s.coins = 100000;
    const wage0 = Game.workerWage(w), rate0 = Game.workerRate(w), c0 = s.coins, cost = Game.workerUpCost(w);
    const ok = Game.upgradeWorker(w.uid);
    return { ok, lvl: w.level, wageUp: Game.workerWage(w) > wage0, rateUp: Game.workerRate(w) > rate0, charged: c0 - s.coins === cost };
  });
  check('training a hand raises level, work rate and wage (and charges for it)', train.ok && train.lvl === 2 && train.wageUp && train.rateUp && train.charged, train);

  // ---- dismissal frees the roster + the name ----
  const fire = await page.evaluate(() => {
    const s = Game.state;
    s.workers = []; s.usedWorkerNames = [];
    const w = Game.hireWorker('harvest'); const nm = w.name;
    const before = s.workers.length;
    Game.dismissWorker(w.uid);
    return { before, after: s.workers.length, nameFreed: !(s.usedWorkerNames || []).includes(nm) };
  });
  check('dismissing a hand removes it and frees its name', fire.before === 1 && fire.after === 0 && fire.nameFreed, fire);

  // ---- save round-trip: the crew persists ----
  const persisted = await page.evaluate(() => {
    const s = Game.state;
    s.workers = []; const w = Game.hireWorker('water'); Game.assignWorker(w.uid, { zone: 1, job: 'water' }); Game.upgradeWorker(w.uid);
    const json = JSON.stringify(s);
    const round = JSON.parse(json);
    const rw = round.workers && round.workers[0];
    return { has: !!rw, job: rw && rw.job, zone: rw && rw.zone, lvl: rw && rw.level };
  });
  check('workers survive a save round-trip (job, patch, level intact)', persisted.has && persisted.job === 'water' && persisted.zone === 1 && persisted.lvl === 2, persisted);

  // ---- per-farm: the crew belongs to its farm, never leaks across a switch ----
  const perFarm = await page.evaluate(() => {
    const s = Game.state, G = Game;
    s.workers = []; s.usedWorkerNames = [];
    const w = G.hireWorker('harvest');
    const homeCrew = s.workers.length;
    s.coins = 100000;
    const bought = G.buyFarm('meadow');                 // buy + switch to a new farm
    const awayCrew = (Game.state.workers || []).length; // new farm has its own (empty) crew
    G.switchFarm(0);                                     // back to the home valley
    const back = Game.state.workers || [];
    return { homeCrew, bought, awayCrew, backCrew: back.length, sameHand: back[0] && back[0].uid === w.uid };
  });
  check('workers are per-farm: the crew stays home when you switch farms', perFarm.homeCrew === 1 && perFarm.bought && perFarm.awayCrew === 0 && perFarm.backCrew === 1 && perFarm.sameHand, perFarm);

  // ---- offline: hands do not work while the farm is away ----
  const offline = await page.evaluate(() => {
    const s = Game.state, G = Game, D = DATA;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) s.tiles[y][x].crop = null;
    s.workers = []; const w = Game.hireWorker('harvest'); s.coins = 100000; w.unpaid = false;
    const P = D.PARCELS[0], tx = P.x, ty = P.y;
    s.tiles[ty][tx].k = 'soil';
    s.tiles[ty][tx].crop = { id: 'turnip', prog: 1, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    G.fastForward(D.DAY_LEN, 3600); // a day away
    return { stillThere: !!s.tiles[ty][tx].crop };
  });
  check('offline: hands do not harvest while the farm is away', offline.stillThere, offline);

  check('no runtime errors', errors.length === 0, errors.slice(0, 5));

  await browser.close();
  console.log(`\n  workers: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('  FAILURES: ' + failures.join(', ')); process.exit(1); }
})();
