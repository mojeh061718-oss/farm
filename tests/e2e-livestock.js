/* Harvest Empire — Meat livestock (Pasture → Slaughterhouse) e2e suite.
   Covers buying young stock, fattening by weight while fed, market-weight
   readiness, keep-fattening past market to a max, the Slaughterhouse gate,
   slaughter → meat goods scaled by weight, bulk slaughter, the hungry no-grow
   pause, the sell-pasture guard, per-farm isolation and the offline pause.
   Run: node tests/e2e-livestock.js */
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
  await page.fill('#farm-name', 'Beef Ranch');
  await page.tap('#setup-start');
  await page.evaluate(() => {
    Game.save = () => {};
    const s = Game.state;
    s.coins = 500000; s.weather = 'sun'; s.forecast = 'sun'; s.t = 0.3;
    s.goalIndex = DATA.GOALS.length; s.goalsDone = DATA.GOALS.map(g => g.id); // drain goals so buys don't award coins mid-test
  });
  await page.waitForTimeout(150);

  // ---- config ----
  const cfg = await page.evaluate(() => ({
    types: Object.keys(DATA.MEAT_ANIMALS),
    meats: ['beef', 'pork', 'chicken_meat'].every(k => DATA.ITEMS[k]),
    pasture: !!DATA.BUILDINGS.pasture && DATA.BUILDINGS.pasture.pasture === true,
    slaughter: !!DATA.BUILDINGS.slaughterhouse,
  }));
  check('config: 3 livestock types, meat items, pasture + slaughterhouse', cfg.types.length === 3 && cfg.meats && cfg.pasture && cfg.slaughter, cfg);

  // ---- buy young stock into a pasture ----
  const buy = await page.evaluate(() => {
    const s = Game.state;
    s.buildings.push({ type: 'pasture', x: 4, y: 4, capacity: 6 });
    const pi = s.buildings.length - 1;
    window.__pi = pi;
    const c0 = s.coins;
    const ok = Game.buyLivestock('steer', pi);
    const l = Game.livestockIn(pi)[0];
    return { ok, spent: c0 - s.coins, count: Game.livestockIn(pi).length, wt: l && l.weight, start: DATA.MEAT_ANIMALS.steer.startWt };
  });
  check('buying a steer deducts its price and adds it to the pasture', buy.ok && buy.spent === 720 && buy.count === 1, buy);
  check('a young steer starts at its start weight', Math.abs(buy.wt - buy.start) < 1e-6, buy);

  // ---- it fattens while fed, and reaches market weight ----
  const grow = await page.evaluate(() => {
    const s = Game.state, G = Game, pi = window.__pi;
    const l = Game.livestockIn(pi)[0];
    l.fedUntil = s.now + 100000; // well fed
    const w0 = l.weight;
    for (let i = 0; i < 220; i++) G.tick(1); // ~growTime to reach market weight
    return { grew: l.weight > w0, ready: Game.livestockReady(l), wt: l.weight, market: DATA.MEAT_ANIMALS.steer.marketWt };
  });
  check('a fed steer fattens up and reaches market weight', grow.grew && grow.ready && grow.wt >= grow.market, grow);

  // ---- keep feeding past market → bigger, up to the max (diminishing) ----
  const fatten = await page.evaluate(() => {
    const s = Game.state, G = Game, pi = window.__pi;
    const l = Game.livestockIn(pi)[0];
    l.fedUntil = s.now + 100000;
    const wBefore = l.weight;
    for (let i = 0; i < 800; i++) G.tick(1);
    return { biggerThanMarket: l.weight > wBefore, capped: l.weight <= DATA.MEAT_ANIMALS.steer.maxWt + 1e-6, near: l.weight > DATA.MEAT_ANIMALS.steer.maxWt - 0.2 };
  });
  check('feeding past market keeps fattening up to (and no further than) the max', fatten.biggerThanMarket && fatten.capped && fatten.near, fatten);

  // ---- the Slaughterhouse gate: can't process without one ----
  const gated = await page.evaluate(() => {
    const G = Game, pi = window.__pi;
    const l = Game.livestockIn(pi)[0];
    const units = G.slaughter(l.uid); // no slaughterhouse yet
    return { units, still: Game.livestockIn(pi).length };
  });
  check('you cannot slaughter without a Slaughterhouse', gated.units === 0 && gated.still === 1, gated);

  // ---- build a slaughterhouse → slaughter → meat goods scaled by weight ----
  const kill = await page.evaluate(() => {
    const s = Game.state, G = Game, pi = window.__pi;
    s.buildings.push({ type: 'slaughterhouse', x: 8, y: 4 });
    const l = Game.livestockIn(pi)[0];
    const expected = Math.max(1, Math.round(l.weight));
    const beef0 = s.inventory.beef || 0;
    const units = G.slaughter(l.uid);
    return { units, expected, beefGain: (s.inventory.beef || 0) - beef0, gone: Game.livestockIn(pi).length, produced: !!(s.produced && s.produced.beef) };
  });
  check('with a Slaughterhouse, slaughter yields Beef ≈ the animal\'s weight', kill.units === kill.expected && kill.beefGain === kill.expected && kill.gone === 0, kill);
  check('slaughtered meat is tracked as produced (orders can ask for it)', kill.produced, kill);

  // ---- bulk: slaughter every ready head at once ----
  const bulk = await page.evaluate(() => {
    const s = Game.state, G = Game, pi = window.__pi;
    for (let k = 0; k < 3; k++) { G.buyLivestock('broiler', pi); }
    // force them all to market weight
    for (const l of Game.livestockIn(pi)) { l.weight = DATA.MEAT_ANIMALS.broiler.marketWt; l.fedUntil = s.now + 100000; }
    const chick0 = s.inventory.chicken_meat || 0;
    const total = G.slaughterReady(pi);
    return { total, leftover: Game.livestockIn(pi).length, chickGain: (s.inventory.chicken_meat || 0) - chick0 };
  });
  check('slaughter-all processes every ready head at once', bulk.total >= 3 && bulk.leftover === 0 && bulk.chickGain >= 3, bulk);

  // ---- hungry stock does not grow ----
  const hungry = await page.evaluate(() => {
    const s = Game.state, G = Game, pi = window.__pi;
    G.buyLivestock('hog', pi);
    const l = Game.livestockIn(pi)[0];
    l.fedUntil = s.now - 1; // hungry
    const w0 = l.weight;
    for (let i = 0; i < 60; i++) G.tick(1);
    return { unchanged: Math.abs(l.weight - w0) < 1e-9 };
  });
  check('a hungry animal does not fatten', hungry.unchanged, hungry);

  // ---- you can't sell a pasture with stock still in it ----
  const guard = await page.evaluate(() => {
    const s = Game.state, G = Game, pi = window.__pi;
    const sold = G.sellBuilding(pi);
    return { sold, still: !!s.buildings[pi] };
  });
  check('selling a pasture is blocked while livestock remain', guard.sold === false && guard.still, guard);

  // ---- per-farm: stock stays with its farm across a switch ----
  const perFarm = await page.evaluate(() => {
    const s = Game.state, G = Game, pi = window.__pi;
    const homeStock = Game.livestockIn(pi).length;
    s.coins = 200000;
    const bought = G.buyFarm('meadow');
    const awayStock = (Game.state.livestock || []).length;
    G.switchFarm(0);
    const backStock = (Game.state.livestock || []).length;
    return { homeStock, bought, awayStock, backStock };
  });
  check('livestock is per-farm (stays home across a farm switch)', perFarm.homeStock >= 1 && perFarm.bought && perFarm.awayStock === 0 && perFarm.backStock === perFarm.homeStock, perFarm);

  // ---- offline: growth pauses once the animal goes hungry while away ----
  const offline = await page.evaluate(() => {
    const s = Game.state, G = Game, D = DATA;
    // fresh pasture on the home farm
    s.buildings.push({ type: 'pasture', x: 12, y: 6, capacity: 6 });
    const pi = s.buildings.length - 1;
    G.buyLivestock('steer', pi);
    const l = Game.livestockIn(pi)[0];
    l.fedUntil = s.now + 5; // fed for only 5s more, then hungry
    const w0 = l.weight;
    G.fastForward(D.DAY_LEN, 3600); // a day away
    // it grows a little (the 5s of feed) but not a full day's worth
    const gained = l.weight - w0;
    const fullDay = (D.MEAT_ANIMALS.steer.marketWt - D.MEAT_ANIMALS.steer.startWt) / D.MEAT_ANIMALS.steer.growTime * D.DAY_LEN;
    return { small: gained < fullDay * 0.2 };
  });
  check('offline: growth stops once feed runs out (no free full-day fattening)', offline.small, offline);

  check('no runtime errors', errors.length === 0, errors.slice(0, 5));

  await browser.close();
  console.log(`\n  livestock: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('  FAILURES: ' + failures.join(', ')); process.exit(1); }
})();
