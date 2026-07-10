/* Harvest Empire — gameplay 2.0 engine e2e suite.
   Run: node tests/e2e-gameplay.js  (see tests/README.md) */
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

  // ---- day-1 clock starts at dawn (before setup no ticks run) ----
  const t0 = await page.evaluate(() => Game.state.t);
  check('day-1 clock starts at t=0.02', t0 === 0.02, t0);

  await page.fill('#farm-name', 'Test Acres');
  await page.tap('#setup-start');
  await page.waitForTimeout(400);

  // ================= balance numbers (Appendix A) =================
  const nums = await page.evaluate(() => ({
    wheatBase: DATA.ITEMS.wheat.base,
    wheatGrow: DATA.CROPS.wheat.grow,
    wheatSeed: DATA.CROPS.wheat.seed,
    pepperRegrow: DATA.CROPS.pepper.regrow,
    cowProd: DATA.ANIMALS.cow.prodTime,
    pigCost: DATA.ANIMALS.pig.cost,
    ghCost: DATA.BUILDINGS.greenhouse.cost,
    truffleOilItem: DATA.ITEMS.truffle_oil && DATA.ITEMS.truffle_oil.base,
    truffleOilRecipe: DATA.RECIPES.truffle_oil && { b: DATA.RECIPES.truffle_oil.building, t: DATA.RECIPES.truffle_oil.time, in: DATA.RECIPES.truffle_oil.in },
    tycoonBonus: DATA.DIFFICULTIES.find(d => d.id === 'tycoon').sellBonus,
    tycoonBlurb: DATA.DIFFICULTIES.find(d => d.id === 'tycoon').blurb,
    rep11: DATA.repBonus(11),
    rep21: DATA.repBonus(21),
    rep30: DATA.repBonus(30),
    fertTurnip: DATA.fertCost('turnip'),
    fertCabbage: DATA.fertCost('cabbage'),
    fertGrapes: DATA.fertCost('grapes'),
    slotCosts: DATA.SLOT_COSTS,
  }));
  check('wheat $6 / $16 / 40s', nums.wheatSeed === 6 && nums.wheatBase === 16 && nums.wheatGrow === 40, nums);
  check('pepper regrows in 45s', nums.pepperRegrow === 45, nums.pepperRegrow);
  check('cow milks every 100s', nums.cowProd === 100, nums.cowProd);
  check('pig costs $2,400', nums.pigCost === 2400, nums.pigCost);
  check('greenhouse costs $6,000', nums.ghCost === 6000, nums.ghCost);
  check('truffle oil item $620', nums.truffleOilItem === 620, nums.truffleOilItem);
  check('truffle oil recipe: press, 1 truffle, 90s', nums.truffleOilRecipe && nums.truffleOilRecipe.b === 'press' && nums.truffleOilRecipe.t === 90 && nums.truffleOilRecipe.in.truffle === 1, nums.truffleOilRecipe);
  check('tycoon sell bonus is +5%', nums.tycoonBonus === 1.05 && nums.tycoonBlurb.includes('+5%'), nums.tycoonBonus);
  check('reputation +1.5%/level', Math.abs(nums.rep11 - 0.15) < 1e-9, nums.rep11);
  check('reputation caps at +30% (level 21)', nums.rep21 === 0.30 && nums.rep30 === 0.30, nums);
  check('fert cost = max(8, 30% of seed)', nums.fertTurnip === 8 && nums.fertCabbage === 19 && nums.fertGrapes === 29, nums);
  check('parallel slots cost $2k / $6k', nums.slotCosts[2] === 2000 && nums.slotCosts[3] === 6000, nums.slotCosts);

  // ================= core loop smoke (ported suite) =================
  const smoke = await page.evaluate(() => {
    const out = {};
    const G = Game, s = Game.state;
    out.till = G.till(8, 6);
    out.plant = G.plant(8, 6, 'turnip');
    out.water = G.water(8, 6);
    const c0 = s.coins;
    out.fert = G.fertilize(8, 6);
    out.fertCharge = c0 - s.coins; // dynamic: turnip → $8
    s.weather = 'sun'; s.forecast = 'rain';
    // pin the clock & disarm the midday crow: the page's own rAF loop has been
    // ticking real time, so t may sit just under 0.5 — a crow would eat the
    // ripe turnip mid-loop and flake this check on slower machines
    s.t = 0.02; s._flags.crowDone = true;
    for (let i = 0; i < 40; i++) G.tick(1);
    out.prog = s.tiles[6][8].crop ? s.tiles[6][8].crop.prog : 'gone';
    out.harvest = G.harvest(8, 6);
    // regrow crop
    G.till(8, 7); s.coins += 200;
    G.plant(8, 7, 'strawberry'); G.water(8, 7);
    s.tiles[7][8].crop.prog = 1;
    G.harvest(8, 7);
    out.regrow = s.tiles[7][8].crop ? { prog: s.tiles[7][8].crop.prog, regrown: s.tiles[7][8].crop.regrown } : 'gone';
    out.sold = G.sellItem('turnip', 1) > 0;

    // failure mechanics + deadCause
    G.till(11, 6); s.coins += 300;
    G.plant(11, 6, 'turnip');
    { const c = s.tiles[6][11].crop; c.water = 0; c.wilt = 0.99; s.weather = 'sun'; G.tick(2); }
    out.driedDead = s.tiles[6][11].crop && s.tiles[6][11].crop.dead;
    out.driedCause = s.tiles[6][11].crop && s.tiles[6][11].crop.deadCause;
    G.till(11, 7);
    G.plant(11, 7, 'turnip');
    { const c = s.tiles[7][11].crop; c.prog = 1; c.rot = 0.99; c.water = 1; G.tick(2); }
    out.rotCause = s.tiles[7][11].crop && s.tiles[7][11].crop.deadCause;
    G.till(11, 8);
    out.offPlant = G.plant(11, 8, 'pumpkin'); // fall crop in spring
    { const c = s.tiles[8][11].crop; c.water = 1; c.wilt = 0.99; G.tick(2); }
    out.offCause = s.tiles[8][11].crop && s.tiles[8][11].crop.deadCause;

    // tapping a dead crop toasts WHY, then clears
    let toastMsg = '';
    G.on('toast', m => { toastMsg = m; });
    const r = G.smartAction(11, 6);
    out.deadTapAct = r.act;
    out.deadTapToast = toastMsg;
    out.deadCleared = !s.tiles[6][11].crop;

    // animals & vet
    G.addXp(500);
    s.coins += 8000;
    out.placeCoop = G.placeBuilding('coop', 8, 9);
    const coopIdx = s.buildings.findIndex(b => b && b.type === 'coop');
    out.buyChicken = G.buyAnimal('chicken', coopIdx);
    const a = s.animals[0];
    a.happiness = 5; a.fedUntil = 0;
    s.forecast = 'rain';
    for (let i = 0; i < 60; i++) G.tick(1);
    out.sick = a.sick;
    out.vet = G.vetAnimal(0);
    out.sellAnimal = G.sellAnimal(0);

    // fuel + tractor
    s.coins += 5000;
    out.buyTill1 = G.buyTillTier();
    out.fuelBuy = G.buyFuel(5);
    const fuelBefore = s.fuel;
    G.applyTool('hoe', 11, 9);
    out.fuelUsed = Math.round((fuelBefore - s.fuel) * 100) / 100 > 0;
    out.tilled2x2 = ['11,9', '12,9', '11,10', '12,10'].every(k => {
      const [x, y] = k.split(',').map(Number);
      return s.tiles[y][x].k === 'soil';
    });

    out.sellCoop = G.sellBuilding(coopIdx);
    s.coins += 20000;
    out.buyParcel = G.buyParcel(1) && G.buyParcel(2);
    return out;
  });
  check('till/plant/water/fertilize work', smoke.till && smoke.plant === true && smoke.water === true && smoke.fert === true, smoke);
  check('fertilizing a turnip charges $8', smoke.fertCharge === 8, smoke.fertCharge);
  check('watered crop ripens and harvests', smoke.prog === 1 && smoke.harvest >= 1, smoke);
  check('regrow crop stays planted after harvest', smoke.regrow && smoke.regrow.regrown === true && smoke.regrow.prog === 0, smoke.regrow);
  check('selling items pays', smoke.sold === true);
  check('dry crop dies of thirst (deadCause)', smoke.driedDead === true && smoke.driedCause === 'thirst', smoke.driedCause);
  check('ripe crop rots (deadCause)', smoke.rotCause === 'rot', smoke.rotCause);
  check('off-season crop withers (deadCause=season)', smoke.offPlant === true && smoke.offCause === 'season', smoke.offCause);
  check('tapping dead crop explains the death, then clears', smoke.deadTapAct === 'clear' && /died of thirst/.test(smoke.deadTapToast) && smoke.deadCleared, smoke.deadTapToast);
  check('animal sickness / vet / sell-back', smoke.sick === true && smoke.vet === true && smoke.sellAnimal === true, smoke);
  check('powered tilling burns fuel over a 2×2', smoke.buyTill1 && smoke.fuelBuy && smoke.fuelUsed && smoke.tilled2x2, smoke);
  check('building sell-back & parcel purchase', smoke.sellCoop === true && smoke.buyParcel === true, smoke);

  // ================= the shovel =================
  const shovel = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.coins += 1000;
    // dig a LIVING crop: 50% seed refund, soil kept
    G.till(13, 5);
    G.plant(13, 5, 'turnip'); // seed $8
    const c0 = s.coins;
    out.digLiving = G.dig(13, 5);
    out.refund = s.coins - c0;
    out.cropGone = !s.tiles[5][13].crop;
    out.stillSoil = s.tiles[5][13].k === 'soil';
    // dig EMPTY SOIL: un-till back to grass
    out.digSoil = G.dig(13, 5);
    out.grassAgain = s.tiles[5][13].k === 'grass';
    // dig a DEAD crop: clears it, keeps the soil
    G.till(13, 6);
    G.plant(13, 6, 'turnip');
    s.tiles[6][13].crop.dead = true;
    const c1 = s.coins;
    out.digDead = G.dig(13, 6);
    out.deadNoRefund = s.coins === c1;
    out.deadCleared = !s.tiles[6][13].crop && s.tiles[6][13].k === 'soil';
    // shovel via applyTool (tap & drag path)
    G.till(14, 6);
    out.toolDig = G.applyTool('shovel', 14, 6) === 1 && s.tiles[6][14].k === 'grass';
    // dig does nothing on plain grass or buildings
    out.grassNoop = G.dig(14, 6) === false;
    out.wellNoop = G.dig(7, 5) === false;
    // auto (smart) mode never digs
    out.autoTillsInstead = G.smartAction(14, 6).act === 'till';
    return out;
  });
  check('shovel digs living crop with 50% seed refund', shovel.digLiving === true && shovel.refund === 4 && shovel.cropGone && shovel.stillSoil, shovel);
  check('shovel un-tills empty soil to grass', shovel.digSoil === true && shovel.grassAgain, shovel);
  check('shovel clears dead crop (no refund)', shovel.digDead === true && shovel.deadNoRefund && shovel.deadCleared, shovel);
  check('shovel works through applyTool', shovel.toolDig === true, shovel);
  check('shovel no-ops on grass/buildings; auto mode never digs', shovel.grassNoop && shovel.wellNoop && shovel.autoTillsInstead, shovel);

  // ================= XP-per-call exploit & market memory =================
  const econ = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.inventory.turnip = 200;
    s.xp = 0;
    for (let i = 0; i < 4; i++) G.sellItem('turnip', 1);
    out.xpSingles = s.xp;
    s.xp = 0;
    G.sellItem('turnip', 4);
    out.xpBulk = s.xp;
    // market memory: dumping crashes the price by 1 - qty*0.004 (floor 0.55)
    const m0 = s.market.mults.turnip;
    G.sellItem('turnip', 50);
    out.crashOk = Math.abs(s.market.mults.turnip - Math.max(0.55, m0 * (1 - 50 * 0.004))) < 1e-9;
    const m1 = s.market.mults.turnip;
    s.inventory.turnip = 500;
    G.sellItem('turnip', 500); // huge dump → floor
    out.floorOk = s.market.mults.turnip === Math.max(0.55, m1 * 0.55) || s.market.mults.turnip === 0.55;
    out.dumpToldFlag = !!s._flags.dumpTold;
    return out;
  });
  check('sell XP is per-item (0.5), not per-call', econ.xpSingles === 2 && econ.xpBulk === 2, econ);
  check('market memory: dumps crash the price', econ.crashOk === true, econ);
  check('market memory: crash floors at 0.55×', econ.floorOk === true, econ);
  check('first big dump explains itself (hint flag)', econ.dumpToldFlag === true, econ);

  // ================= animal name pool =================
  const names = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.coins += 30000;
    G.placeBuilding('coop', 15, 9);
    const ci = s.buildings.findIndex(b => b && b.type === 'coop');
    s.buildings[ci].capacity = 30;
    for (let i = 0; i < 25; i++) G.buyAnimal('chicken', ci);
    const all = s.animals.map(a => a.name);
    out.count = all.length;
    out.unique = new Set(all).size === all.length;
    out.hasSuffix = all.some(n => / II$/.test(n));
    return out;
  });
  check('animal names never duplicate (pool + "Name II")', names.count === 25 && names.unique && names.hasSuffix, names);

  // ================= feed mill: grind → credits =================
  const mill = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.coins += 10000;
    out.placeMill = G.placeBuilding('mill', 13, 8);
    s.inventory.wheat = 4;
    out.grind = G.grindGrain('wheat', 2);
    out.credits = s.feedCredits;
    out.wheatLeft = s.inventory.wheat;
    // feeding uses a credit first…
    const a = s.animals[0];
    a.fedUntil = 0;
    out.costWithCredits = G.feedCostFor(a);
    const coins0 = s.coins;
    out.fed = G.feedAnimal(0);
    out.creditSpent = s.feedCredits === out.credits - 1;
    out.noCash = s.coins === coins0;
    // …and falls back to cash when credits run out
    s.feedCredits = 0;
    const b = s.animals[1];
    b.fedUntil = 0;
    out.costNoCredits = G.feedCostFor(b);
    G.feedAnimal(1);
    out.cashCharged = coins0 - s.coins === DATA.ANIMALS.chicken.feedCost;
    return out;
  });
  check('mill grinds 1 grain → 3 feed credits', mill.placeMill && mill.grind === 6 && mill.credits === 6 && mill.wheatLeft === 2, mill);
  check('feeding spends 1 credit before cash', mill.costWithCredits.credits === 1 && mill.fed && mill.creditSpent && mill.noCash, mill);
  check('no credits → feeding costs cash again', mill.costNoCredits.coins === 5 && mill.cashCharged, mill);

  // ================= orders rework =================
  const orders = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.t = 0.2; s.weather = 'sun'; // mid-morning: the short ticks below never cross a day
    // fresh order via the refill timer
    s.orders = [];
    s.orderTimer = 0.4;
    s.stats.recent = 0;
    G.tick(0.5);
    const o1 = s.orders[0];
    out.hasOrder = !!o1;
    // payout = ceil(Σ live sellPrice × qty × 1.25 / 5) × 5
    let total = 0;
    for (const [item, qty] of Object.entries(o1.reqs)) total += G.sellPrice(item) * qty;
    out.payoutOk = o1.coins === Math.ceil(total * 1.25 / 5) * 5;
    out.deadlineOk = Math.abs((o1.expires - o1.posted) - 3 * DATA.DAY_LEN) < 1e-6;
    out.smallQty = Object.values(o1.reqs).every(q => q <= 5); // recent=0 → small board
    // drain pending goal rewards so fulfil deltas are pure order payouts
    s.stats.orders = 10; s.stats.earned = 1e6; s.stats.collected = 10; G.checkGoal();
    // rush: fulfilled within 1 day pays +25%
    for (const [item, qty] of Object.entries(o1.reqs)) s.inventory[item] = (s.inventory[item] || 0) + qty;
    const c0 = s.coins;
    out.rushEligible = G.orderRush(o1);
    G.fulfillOrder(o1.id);
    out.rushPaid = s.coins - c0 === Math.ceil(o1.coins * 1.25 / 5) * 5;
    // non-rush pays face value
    s.orders = []; s.orderTimer = 0.4; G.tick(0.5);
    const o2 = s.orders[0];
    o2.posted = s.now - DATA.DAY_LEN - 1;
    for (const [item, qty] of Object.entries(o2.reqs)) s.inventory[item] = (s.inventory[item] || 0) + qty;
    const c1 = s.coins;
    G.fulfillOrder(o2.id);
    out.flatPaid = s.coins - c1 === o2.coins;
    // expiry: auto-removed, no penalty, board refreshes
    s.orders = []; s.orderTimer = 0.4; G.tick(0.5);
    const o3 = s.orders[0];
    o3.expires = s.now + 0.3;
    const rep = s.level, coins2 = s.coins;
    G.tick(0.5);
    out.expired = !s.orders.some(o => o.id === o3.id);
    out.noPenalty = s.level === rep && s.coins === coins2;
    out.refreshSoon = s.orderTimer <= 8;
    // quantity scales with RECENT production, not lifetime wealth
    // (sampled: single rolls are random — compare distributions)
    s.stats.earned = 1e7; // rich…
    // pin the clock: ~12s of sampled ticks must not cross a day, or newDay()
    // recomputes stats.recent from real harvest counts and un-pins the fixture
    s.t = 0.05; s.forecast = 'rain';
    const sample = n => { const qs = []; for (let i = 0; i < n; i++) { s.orders = []; s.orderTimer = 0.4; G.tick(0.5); for (const q of Object.values(s.orders[0].reqs)) qs.push(q); } return qs; };
    s.stats.recent = 0;   // …but idle
    const idleQ = sample(12);
    s.stats.recent = 100; // pumping farm
    const busyQ = sample(12);
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    out.richIdleSmall = Math.max(...idleQ) <= 6;
    out.busyBig = avg(busyQ) > avg(idleQ) + 1;
    s.stats.recent = 2;
    return out;
  });
  check('order payout = live prices × 1.25 (rounded to $5)', orders.hasOrder && orders.payoutOk, orders);
  check('orders expire 3 days after posting', orders.deadlineOk, orders);
  check('rush delivery (≤1 day) pays +25%', orders.rushEligible && orders.rushPaid, orders);
  check('late delivery pays face value', orders.flatPaid, orders);
  check('expired orders vanish without penalty and refresh', orders.expired && orders.noPenalty && orders.refreshSoon, orders);
  check('order size follows recent production, not wealth', orders.smallQty && orders.richIdleSmall && orders.busyBig, orders);

  // ================= sequential craft queue + slots =================
  const craft = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.coins += 30000;
    out.place = G.placeBuilding('creamery', 16, 5);
    const bi = s.buildings.findIndex(b => b && b.type === 'creamery');
    const b = s.buildings[bi];
    out.defaultSlots = b.slots;
    s.inventory.milk = 20;
    G.startRecipe(bi, 'cheese');
    G.startRecipe(bi, 'cheese');
    G.startRecipe(bi, 'cheese'); // 3 × 60s jobs
    out.queued = b.queue.length;
    s.t = 0.05; s.forecast = 'rain'; // deterministic day crossing
    for (let i = 0; i < 61; i++) G.tick(1);
    out.doneAfter61 = b.queue.filter(j => j.left <= 0).length; // sequential → exactly 1
    out.secondUntouched = Math.abs(b.queue[1].left - 60) < 1.5;
    out.collected1 = G.collectRecipes(bi); // take the finished one; 2 jobs remain
    // buy slot 2 → two lanes
    const c0 = s.coins;
    out.buySlot2 = G.buySlot(bi);
    out.slot2Cost = c0 - s.coins;
    s.forecast = 'rain';
    for (let i = 0; i < 61; i++) G.tick(1);
    out.doneAfterSlot2 = b.queue.filter(j => j.left <= 0).length; // both remaining ran in parallel
    out.collected2 = G.collectRecipes(bi);
    // slot 3 costs $6k, then no more
    const c1 = s.coins;
    out.buySlot3 = G.buySlot(bi);
    out.slot3Cost = c1 - s.coins;
    out.noSlot4 = G.buySlot(bi) === false;
    // legacy grandfathering: old-format parallel jobs all finish after load
    b.queue = [
      { r: 'cheese', done: s.now + 60 },
      { r: 'cheese', done: s.now + 60 },
      { r: 'cheese', done: s.now + 60 },
    ];
    delete b.slots;
    const imp = G.importCode(G.exportCode()); // round-trip runs adoptState migrations
    out.reimport = imp.ok;
    const s2 = Game.state;
    const b2 = s2.buildings[bi];
    out.migratedSlots = b2.slots === 1;
    out.migratedLegacy = b2.queue.every(j => j.legacy === true && Math.abs(j.left - 60) < 0.01);
    s2.t = 0.05; s2.forecast = 'rain';
    for (let i = 0; i < 61; i++) G.tick(1);
    out.legacyAllDone = b2.queue.filter(j => j.left <= 0).length === 3; // parallel finish honored
    return out;
  });
  check('processors default to 1 craft slot', craft.place && craft.defaultSlots === 1 && craft.queued === 3, craft);
  check('queue is sequential: 3×60s jobs → 1 done after 61s', craft.doneAfter61 === 1 && craft.secondUntouched, craft);
  check('slot 2 ($2,000) runs two lanes', craft.buySlot2 && craft.slot2Cost === 2000 && craft.collected1 === 1 && craft.doneAfterSlot2 === 2 && craft.collected2 === 2, craft);
  check('slot 3 costs $6,000; no fourth slot', craft.buySlot3 && craft.slot3Cost === 6000 && craft.noSlot4, craft);
  check('old parallel saves grandfathered: legacy jobs all finish', craft.reimport && craft.migratedSlots && craft.migratedLegacy && craft.legacyAllDone, craft);

  // ================= greenhouse becomes an area =================
  const gh = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.coins += 30000;
    out.place = G.placeBuilding('greenhouse', 4, 7); // covers x2..7, y5..10
    out.coveredIn = G.greenhouseAt(3, 6) && G.greenhouseAt(2, 5) && G.greenhouseAt(7, 10);
    out.coveredOut = !G.greenhouseAt(8, 7) && !G.greenhouseAt(2, 4);
    // off-season crop INSIDE grows; OUTSIDE wilts
    s.season = 0; s.weather = 'sun'; s.t = 0.1; // fresh morning — no day cross below
    G.till(3, 6); G.plant(3, 6, 'tomato'); G.water(3, 6);   // summer-only, inside
    G.till(8, 10); G.plant(8, 10, 'tomato'); G.water(8, 10); // outside
    for (let i = 0; i < 20; i++) G.tick(1);
    const cin = s.tiles[6][3].crop, cout = s.tiles[10][8].crop;
    out.insideGrows = cin && cin.prog > 0 && (cin.wilt || 0) === 0;
    out.outsideWilts = cout && cout.prog === 0 && cout.wilt > 0;
    out.seasonOKPos = G.seasonOK('tomato', 3, 6) && !G.seasonOK('tomato', 8, 10);
    // order pool treats owning a greenhouse as access to any crop
    out.poolHasTomato = G.availableItems().includes('tomato');
    // frost spares ONLY the covered zone
    s.season = 3;
    let tries = 0;
    while (!s.tiles[10][8].crop.dead && tries < 400) {
      s._flags.frostDone = false;
      s.t = DATA.NIGHT_START - 0.0001; // just under NIGHT_START — the tick crosses it
      G.tick(0.01);
      tries++;
    }
    out.frostFired = s.tiles[10][8].crop.dead;
    out.frostCause = s.tiles[10][8].crop.deadCause;
    out.insideSpared = !s.tiles[6][3].crop.dead;
    s.season = 0;
    G.dig(8, 10); G.dig(3, 6); // tidy up
    return out;
  });
  check('greenhouse covers exactly its 6×6 zone', gh.place && gh.coveredIn && gh.coveredOut, gh);
  check('off-season crop grows inside coverage, wilts outside', gh.insideGrows && gh.outsideWilts && gh.seasonOKPos, gh);
  check('order pool counts greenhouse access', gh.poolHasTomato, gh);
  check('frost kills outside only (deadCause=frost)', gh.frostFired && gh.frostCause === 'frost' && gh.insideSpared, gh);

  // ================= seasons that teach =================
  // dawn of the season's last day → banner + auto-opened Season Care sheet
  const care = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    for (const row of s.tiles) for (const t of row) t.crop = null; // clean slate
    s.coins += 500;
    s.season = 0; s.day = 5; s.t = 0.98; s.weather = 'sun'; s.forecast = 'rain';
    G.till(14, 5);
    G.plant(14, 5, 'turnip'); // spring-only → at risk when summer nears
    G.water(14, 5);
    out.atRiskBefore = G.atRiskCrops().length;
    G.tick(2); // cross dawn into day 6
    out.day = s.day;
    out.banner = document.getElementById('toasts').textContent; // UI banner toast
    out.sheetTitle = document.getElementById('sheet-title').textContent;
    out.sheetVisible = !document.getElementById('sheet').classList.contains('hidden');
    out.bodyHasTurnip = document.getElementById('sheet-body').textContent.includes('Turnip');
    return out;
  });
  check('last-day dawn fires the banner toast', care.day === 6 && /Last day of Spring/.test(care.banner), care.banner);
  check('Season Care sheet auto-opens listing at-risk crops', care.sheetVisible && care.sheetTitle === 'Season care' && care.bodyHasTurnip && care.atRiskBefore === 1, care);
  await page.evaluate(() => document.getElementById('levelup').classList.add('hidden')); // clear any splash
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'care-sheet.png') });

  // care sheet bulk actions
  const careActions = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    // one ripe + one growing at-risk crop
    s.tiles[5][14].crop.prog = 1;
    G.till(15, 5); G.plant(15, 5, 'turnip'); G.water(15, 5);
    out.atRisk = G.atRiskCrops().length;
    out.harvested = G.harvestAtRisk();
    out.ripeGone = !s.tiles[5][14].crop;
    const c0 = s.coins;
    out.dug = G.digAtRisk();
    out.refunded = s.coins - c0;
    out.allClear = G.atRiskCrops().length === 0;
    return out;
  });
  check('[Harvest all ripe] harvests only the ripe at-risk crops', careActions.atRisk === 2 && careActions.harvested >= 1 && careActions.ripeGone, careActions);
  check('[Dig up all at-risk] shovels the rest with refunds', careActions.dug === 1 && careActions.refunded === 4 && careActions.allClear, careActions);

  // seed sheet: “won’t ripen in time” tag on the last day
  await page.evaluate(() => { Game.state.t = 1 - 24 / DATA.DAY_LEN; document.getElementById('sheet-close').click(); }); // ~24s left in the day
  await page.tap('.tool-btn[data-tool="plant"]');
  await page.waitForTimeout(350);
  const seedTags = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#sheet-body .item-card')];
    const find = name => cards.find(c => c.textContent.includes(name));
    return {
      potatoTag: find('Potato').textContent.includes('won’t ripen'),   // 70s > 24s left, dies in summer
      turnipTag: find('Turnip').textContent.includes('won’t ripen'),   // 35s > 24s left
      wheatTag: find('Wheat').textContent.includes('won’t ripen'),     // survives summer → no tag
      wheatOff: find('Wheat').textContent.includes('off-season'),
      stillPlantable: !find('Potato').classList.contains('disabled'),
    };
  });
  check('seed sheet warns crops that can\'t ripen before a fatal flip', seedTags.potatoTag && seedTags.turnipTag, seedTags);
  check('crops surviving next season are not warned', !seedTags.wheatTag && !seedTags.wheatOff && seedTags.stillPlantable, seedTags);
  await page.evaluate(() => document.getElementById('levelup').classList.add('hidden'));
  await page.screenshot({ path: path.join(OUT, 'seed-warnings.png') });
  await page.evaluate(() => document.getElementById('sheet-close').click());

  // day pill shows season progress
  const dayPill = await page.evaluate(() => document.getElementById('day-label').textContent);
  check('day pill reads "D{day}/6"', dayPill === 'D6/6', dayPill);

  // ================= odd jobs streak =================
  const jobs = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    delete s._flags.oddJobsDay; delete s._flags.oddJobsAbs; delete s._flags.oddJobsStreak;
    const nextDay = () => { s.t = 0.995; s.forecast = 'rain'; G.tick(0.5); };
    const work = () => { const c = s.coins; G.workOddJobs(); return s.coins - c; };
    out.day1 = work();          // $40 base
    out.repeatBlocked = !G.workOddJobs();
    nextDay(); out.day2 = work(); // +$5 streak
    nextDay(); out.day3 = work();
    nextDay(); nextDay(); out.afterSkip = work(); // skipped a day → reset
    // cap at $60
    s._flags.oddJobsStreak = 9;
    s._flags.oddJobsAbs = ((s.year - 1) * 4 + s.season) * DATA.SEASON_DAYS + s.day - 1;
    delete s._flags.oddJobsDay;
    out.capped = G.oddJobsPay();
    return out;
  });
  check('odd jobs: $40 base, +$5 per consecutive day', jobs.day1 === 40 && jobs.day2 === 45 && jobs.day3 === 50 && jobs.repeatBlocked, jobs);
  check('odd jobs streak resets after a skipped day', jobs.afterSkip === 40, jobs);
  check('odd jobs pay caps at $60', jobs.capped === 60, jobs);

  // ================= persistence of the new fields =================
  await page.evaluate(() => { Game.state.feedCredits = 5; Game.save(); });
  await page.reload();
  await page.waitForTimeout(900);
  const persisted = await page.evaluate(() => {
    const s = Game.state;
    return {
      credits: s.feedCredits,
      usedNames: Array.isArray(s.usedNames) && s.usedNames.length >= 25,
      slots: s.buildings.filter(b => b && b.queue).every(b => b.slots >= 1),
      ordersHaveExpiry: s.orders.every(o => o.expires != null && o.posted != null),
      produced: !!s.produced,
    };
  });
  check('2.0 fields survive save/reload', persisted.credits === 5 && persisted.usedNames && persisted.slots && persisted.ordersHaveExpiry && persisted.produced, persisted);

  console.log(errors.length ? '\nJS ERRORS:\n' + errors.join('\n') : '\nNO JS ERRORS');
  console.log(`\ngameplay: ${pass} passed, ${fail} failed${fail ? ' → ' + failures.join(' | ') : ''}`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED', e); process.exit(1); });
