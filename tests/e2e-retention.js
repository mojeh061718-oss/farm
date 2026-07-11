/* Harvest Empire — 3.0 retention & economy suite.
   Locks in the Return Update: single-harvest crop rebalance + recipe margins,
   the multiplicative market-crash fix (with processed-goods exemption and
   drift recovery), produced-weighted orders with expiry floors, goal-chip
   cycling, daily tasks + streak, Market Day, and the quick-fix batch
   (backdrop-cancel, deferred level-up, disabled Deliver, type-count market
   badge, armed-seed indicator, Escape-to-close).
   All day math is DATA-relative — never hardcode DAY_LEN/SEASON_DAYS.
   Run: node tests/e2e-retention.js  (see tests/README.md) */
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

  // controllable local clock: window.__setDayOffset(n) shifts "today" by n days
  // (daily tasks read the date through Game's todayLocal → new Date())
  await page.addInitScript(() => {
    const RealDate = Date;
    let offsetDays = 0;
    window.__setDayOffset = d => { offsetDays = d; };
    // eslint-disable-next-line no-global-assign
    Date = class extends RealDate {
      constructor(...args) {
        if (args.length) super(...args);
        else super(RealDate.now() + offsetDays * 86400000);
      }
      static now() { return RealDate.now() + offsetDays * 86400000; }
    };
  });

  await page.goto(INDEX);
  await page.waitForTimeout(900);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(900);
  await page.fill('#farm-name', 'Retention Acres');
  await page.tap('#setup-start');
  await page.waitForTimeout(1300); // first tick generates state.daily

  // ================= 1. crop rebalance + recipe margins =================
  const eco = await page.evaluate(() => {
    const I = DATA.ITEMS, R = DATA.RECIPES;
    const raw = reqs => Object.entries(reqs).reduce((sum, [id, q]) => sum + I[id].base * q, 0);
    return {
      buffed: { turnip: I.turnip.base, carrot: I.carrot.base, potato: I.potato.base, corn: I.corn.base, melon: I.melon.base, pumpkin: I.pumpkin.base, kale: I.kale.base, frostberry: I.frostberry.base },
      regrowUntouched: I.strawberry.base === 36 && I.tomato.base === 44 && I.pepper.base === 62 && I.grapes.base === 88,
      animalsUntouched: I.egg.base === 24 && I.milk.base === 62 && I.wool.base === 150,
      pieMargin: I.pie.base / raw(R.pie.in),
      melonJuiceMargin: I.melon_juice.base / raw(R.melon_juice.in),
      breadMargin: I.bread.base / raw(R.bread.in),
      cakeMargin: I.cake.base / raw(R.cake.in),
    };
  });
  check('single-harvest crops buffed (turnip 26 … frostberry 320)',
    eco.buffed.turnip === 26 && eco.buffed.carrot === 42 && eco.buffed.potato === 62 && eco.buffed.corn === 145
    && eco.buffed.melon === 265 && eco.buffed.pumpkin === 300 && eco.buffed.kale === 150 && eco.buffed.frostberry === 320, eco.buffed);
  check('regrow crops & animal products untouched', eco.regrowUntouched && eco.animalsUntouched, eco);
  check('every buffed-input recipe keeps a ≥25% margin over raw inputs',
    eco.pieMargin >= 1.25 && eco.melonJuiceMargin >= 1.25 && eco.breadMargin >= 1.25 && eco.cakeMargin >= 1.25, eco);

  // ================= 2. market-dump fix =================
  const dump = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.coins += 50000;
    // multiplicative crash: two max dumps dig well below the old 0.55 floor
    s.market.mults.turnip = 1;
    s.inventory.turnip = 1000;
    G.sellItem('turnip', 500);
    G.sellItem('turnip', 500);
    out.below55 = Math.abs(s.market.mults.turnip - 0.55 * 0.55) < 1e-9;
    // processed goods exempt — the artisan chain holds its price
    s.market.mults.cheese = 1.2;
    s.inventory.cheese = 400;
    G.sellItem('cheese', 400);
    out.processedHeld = s.market.mults.cheese === 1.2;
    // deep crash recovers via daily drift in ~5-8 days (seeded → deterministic)
    s.market.mults.turnip = 0.05;
    const realRandom = Math.random;
    let sd = 7 >>> 0;
    Math.random = () => { sd = (sd + 0x6D2B79F5) >>> 0; let z = sd; z = Math.imul(z ^ (z >>> 15), z | 1); z ^= z + Math.imul(z ^ (z >>> 7), z | 61); return ((z ^ (z >>> 14)) >>> 0) / 4294967296; };
    let recoverDays = null;
    for (let day = 1; day <= 10; day++) {
      s.t = 1 - 0.001;
      G.tick(0.01 * DATA.DAY_LEN); // cross the day boundary
      if (recoverDays === null && s.market.mults.turnip >= 0.6) recoverDays = day;
    }
    Math.random = realRandom;
    out.recoverDays = recoverDays;
    return out;
  });
  check('dump crash is multiplicative (0.55² after two max dumps)', dump.below55 === true, dump);
  check('processed goods are exempt from the crash', dump.processedHeld === true, dump);
  check('a 0.05× crash recovers to ≥0.6× in days, not overnight (~5-10)',
    dump.recoverDays !== null && dump.recoverDays >= 4 && dump.recoverDays <= 10, dump);

  // ================= 3. orders: produced weighting + expiry floor =================
  const ord = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.season = 0; s.t = 0.2; s.weather = 'sun'; s.stats.recent = 0;
    const realRandom = Math.random;
    let sd = 42 >>> 0;
    Math.random = () => { sd = (sd + 0x6D2B79F5) >>> 0; let z = sd; z = Math.imul(z ^ (z >>> 15), z | 1); z ^= z + Math.imul(z ^ (z >>> 7), z | 61); return ((z ^ (z >>> 14)) >>> 0) / 4294967296; };
    const sample = n => { const os = []; for (let i = 0; i < n; i++) { s.orders = []; s.orderTimer = 0.4; G.tick(0.5); os.push(s.orders[0]); } return os; };
    // corn is out of season in spring: it can ONLY appear via produced-weighting
    s.produced = { corn: 1 };
    const weighted = sample(30);
    out.cornShare = weighted.filter(o => o.reqs.corn != null).length / 30;
    // slow items get a floored deadline: ≥ max(3 days, 3× production time)
    out.floorOk = weighted.filter(o => o.reqs.corn != null)
      .every(o => o.expires - o.posted >= Math.max(3 * DATA.DAY_LEN, 3 * DATA.CROPS.corn.grow) - 1e-6);
    // fresh farm (nothing produced) draws purely from the seasonal pool
    s.produced = {};
    const fresh = sample(20);
    out.freshNoCorn = fresh.every(o => o.reqs.corn == null);
    Math.random = realRandom;
    // migration path applies the same floor to saved orders missing a deadline
    s.orders = [{ id: 'oSlow', reqs: { pumpkin: 4 }, coins: 900, xp: 20 }];
    const now = s.now;
    G.importCode(G.exportCode()); // round-trip runs adoptState
    const o = Game.state.orders.find(x => x.id === 'oSlow');
    out.migrated = o && o.expires - now >= Math.max(3 * DATA.DAY_LEN, 3 * DATA.CROPS.pumpkin.grow) - 1;
    return out;
  });
  check('~70% of order picks come from produced items', ord.cornShare >= 0.55 && ord.cornShare < 1, ord);
  check('fresh farms (nothing produced) draw from the seasonal pool', ord.freshNoCorn === true, ord);
  check('slow items get a floored expiry (makeOrder + adoptState)', ord.floorOk === true && ord.migrated === true, ord);

  // ================= 4. goal chip cycling =================
  await page.waitForTimeout(1200); // let celebrations from earlier payouts finish
  const goals = await page.evaluate(async () => {
    const G = Game, out = {};
    out.first = G.currentGoal().id;
    document.getElementById('goal-chip').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    out.second = G.currentGoal().id;
    out.titleMatches = document.getElementById('goal-title').textContent === DATA.GOALS.find(g => g.id === out.second).title;
    out.noStamp = !document.querySelector('.goal-stamp');
    out.noCelebrate = !document.getElementById('goal-chip').classList.contains('celebrate');
    return out;
  });
  check('tapping the goal chip cycles to the next incomplete goal',
    goals.first !== goals.second && goals.titleMatches === true, goals);
  check('cycling never fires the celebrate animation', goals.noStamp && goals.noCelebrate, goals);
  const laterPays = await page.evaluate(() => {
    const G = Game, s = Game.state;
    // cursor parked on a later goal — completing a DIFFERENT goal still pays
    const c0 = s.coins;
    s.stats.tilled = 4; // 'till' goal target
    G.checkGoal();
    return { paid: s.coins - c0 >= 40, done: (s.goalsDone || []).includes('till') };
  });
  check('a goal other than the displayed one still pays on completion', laterPays.paid && laterPays.done, laterPays);
  const celebrated = await page.waitForSelector('.goal-stamp', { timeout: 2500 }).then(() => true).catch(() => false);
  check('a real completion still celebrates on the chip', celebrated);

  // ================= 5. daily tasks & streak =================
  const daily = await page.evaluate(() => {
    const G = Game, out = {};
    const sig = d => d.tasks.map(t => [t.kind, t.item || '', t.need, t.reward].join(':')).join('|');
    const a = sig(G.regenDaily('2026-03-05'));
    const b = sig(G.regenDaily('2026-03-05'));
    const c = sig(G.regenDaily('2026-03-06'));
    out.deterministic = a === b;
    out.datesDiffer = a !== c;
    out.threeDistinct = new Set(Game.state.daily.tasks.map(t => t.kind)).size === 3;
    out.rewardsSane = Game.state.daily.tasks.every(t => t.reward >= 60 && t.reward <= 150);
    G.regenDaily(); // back to the (shimmed) real today
    return out;
  });
  check('same injected date → identical tasks; new date → new tasks',
    daily.deterministic && daily.datesDiffer && daily.threeDistinct && daily.rewardsSane, daily);

  const claim = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    const t = s.daily.tasks[0];
    out.blockedEarly = G.claimDaily(0) === false; // no progress yet
    t.n = t.need;
    const c0 = s.coins;
    out.claimed = G.claimDaily(0);
    out.paid = s.coins - c0 === t.reward;
    out.doubleBlocked = G.claimDaily(0) === false;
    s.daily.tasks[1].n = s.daily.tasks[1].need; // one more claimable → badge
    UI.updateHud();
    const badge = document.getElementById('orders-badge');
    out.badge = !badge.classList.contains('hidden') && parseInt(badge.textContent, 10) >= 1;
    G.save();
    return out;
  });
  check('claim pays once (no double-claim); claimable count reaches the orders badge',
    claim.blockedEarly && claim.claimed && claim.paid && claim.doubleBlocked && claim.badge, claim);

  await page.reload();
  await page.waitForTimeout(1400); // load + first tick (same local date → no regen)
  const persisted = await page.evaluate(() => ({
    date: Game.state.daily.date === Game.todayLocal(),
    claimed: Game.state.daily.tasks[0].claimed === true,
    progressKept: Game.state.daily.tasks[1].n === Game.state.daily.tasks[1].need,
  }));
  check('claims and progress survive a reload (same day → no regen)',
    persisted.date && persisted.claimed && persisted.progressKept, persisted);

  // streak: clear all 3 today, then all 3 tomorrow → 2; skip a day → reset
  const clearAll = () => page.evaluate(() => {
    const s = Game.state;
    s.daily.tasks.forEach((t, i) => { t.n = t.need; Game.claimDaily(i); });
    return { streak: s.daily.streak, date: s.daily.date };
  });
  const d0 = await clearAll();
  await page.evaluate(() => window.__setDayOffset(1));
  await page.waitForTimeout(1600); // tick rollover regenerates for the new date
  const d1state = await page.evaluate(() => ({ date: Game.state.daily.date, fresh: Game.state.daily.tasks.every(t => !t.claimed) }));
  const d1 = await clearAll();
  check('next-day full clear keeps the streak (1 → 2)',
    d0.streak === 1 && d1state.fresh && d1state.date !== d0.date && d1.streak === 2, { d0, d1state, d1 });

  await page.evaluate(() => window.__setDayOffset(3)); // skip a day entirely
  await page.waitForTimeout(1600);
  const skipped = await page.evaluate(() => Game.state.daily.streak);
  const d3 = await clearAll();
  check('skipping a day resets the streak', skipped === 0 && d3.streak === 1, { skipped, d3 });

  // day-7 jackpot: $1,200 + 3 premium in-season crops, streak keeps counting
  await page.evaluate(() => window.__setDayOffset(4));
  await page.waitForTimeout(1600);
  const week = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.daily.streak = 6;
    s.daily.lastClaimDate = (() => { // yesterday relative to the daily's date
      const [y, m, d] = s.daily.date.split('-').map(Number);
      const yd = new Date(y, m - 1, d - 1);
      return yd.getFullYear() + '-' + String(yd.getMonth() + 1).padStart(2, '0') + '-' + String(yd.getDate()).padStart(2, '0');
    })();
    const inv0 = Object.assign({}, s.inventory);
    const c0 = s.coins;
    let taskPay = 0;
    s.daily.tasks.forEach((t, i) => { t.n = t.need; taskPay += t.reward; Game.claimDaily(i); });
    out.streak = s.daily.streak;
    out.bonusPaid = s.coins - c0 === taskPay + 1200;
    out.cropsGifted = Object.keys(s.inventory).some(id => (s.inventory[id] || 0) - (inv0[id] || 0) === 3 && DATA.CROPS[id]);
    return out;
  });
  check('7-day streak pays $1,200 + 3 premium in-season crops', week.streak === 7 && week.bonusPaid && week.cropsGifted, week);

  // the Today section renders at the top of the Orders sheet
  await page.evaluate(() => window.__setDayOffset(5));
  await page.waitForTimeout(1600); // fresh unclaimed board for the render check
  await page.tap('#btn-orders');
  await page.waitForTimeout(400);
  const todayUI = await page.evaluate(() => {
    const body = document.getElementById('sheet-body');
    const head = body.querySelector('.daily-head');
    const rows = body.querySelectorAll('.daily-row');
    return {
      headFirst: head && body.firstElementChild === head,
      headText: head && head.textContent,
      rows: rows.length,
      bars: body.querySelectorAll('.daily-row .minibar').length,
      claimBtns: [...rows].every(r => /Claim|Done/.test(r.querySelector('button').textContent)),
    };
  });
  check('Orders sheet leads with the Today section (3 tasks, bars, streak flame)',
    todayUI.headFirst && /🔥/.test(todayUI.headText) && todayUI.rows === 3 && todayUI.bars === 3 && todayUI.claimBtns, todayUI);
  await page.screenshot({ path: path.join(OUT, 'retention-daily.png') });

  // a claim through the UI pays and re-renders
  await page.evaluate(() => { Game.state.daily.tasks[0].n = Game.state.daily.tasks[0].need; });
  await page.waitForTimeout(800); // the 0.5s live refresh re-enables the Claim button
  const uiClaim = await page.evaluate(() => {
    const s = Game.state;
    const c0 = s.coins;
    document.querySelector('#sheet-body .daily-row button').click();
    return { paid: s.coins - c0 === s.daily.tasks[0].reward, claimed: s.daily.tasks[0].claimed };
  });
  check('tapping Claim in the sheet pays the reward', uiClaim.paid && uiClaim.claimed, uiClaim);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ================= 6. Market Day =================
  const md = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    const mdDay = Math.ceil(DATA.SEASON_DAYS / 2);
    s.day = mdDay;
    const a = G.marketDayItems(), b = G.marketDayItems();
    out.deterministic = a.length >= 2 && a.length <= 3 && a.join() === b.join();
    // ×1.5 on the picked items, gone on other days
    const item = a[0];
    s.market.mults[item] = 1;
    if (a.includes(s.market.hot)) s.market.hot = Object.keys(DATA.ITEMS).find(id => !a.includes(id));
    const on = G.sellPrice(item);
    s.day = mdDay === 1 ? 2 : 1;
    const off = G.sellPrice(item);
    out.ratio = on / off;
    out.offEmpty = G.marketDayItems().length === 0;
    // dawn banner: crossing into the mid-season day announces the fair
    s.day = mdDay - 1; s.t = 1 - 0.001; s.weather = 'sun'; s.forecast = 'rain';
    document.getElementById('toasts').innerHTML = '';
    G.tick(0.01 * DATA.DAY_LEN);
    out.onMdDay = s.day === mdDay;
    out.banner = document.getElementById('toasts').textContent;
    out.items = a;
    return out;
  });
  check('Market Day picks 2-3 deterministic items (mid-season only)', md.deterministic && md.offEmpty, md);
  check('Market Day items sell ×1.5 that day', Math.abs(md.ratio - 1.5) < 0.05, md);
  check('dawn of Market Day fires the 🎪 banner toast', md.onMdDay && /Market Day/.test(md.banner) && /\+50%/.test(md.banner), md);

  await page.evaluate(() => { // stock one Market Day item and open the market
    const s = Game.state;
    s.day = Math.ceil(DATA.SEASON_DAYS / 2);
    s.inventory = {};
    s.inventory[Game.marketDayItems()[0]] = 3;
    UI.updateHud();
  });
  await page.tap('#btn-market');
  await page.waitForTimeout(400);
  const mdUI = await page.evaluate(() => ({
    banner: !!document.querySelector('#sheet-body .md-banner'),
    bannerText: (document.querySelector('#sheet-body .md-banner') || {}).textContent,
    rowTag: !!document.querySelector('#sheet-body .row-card .md-tag') || !!document.querySelector('#sheet-body .row-card .md-badge'),
  }));
  check('market sheet shows the Market Day banner card + badged rows', mdUI.banner && /Market Day/.test(mdUI.bannerText) && mdUI.rowTag, mdUI);
  await page.screenshot({ path: path.join(OUT, 'retention-market-day.png') });
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ================= 7. quick fixes =================
  // (a) modal backdrop tap = Cancel
  await page.evaluate(() => { Game.state.inventory = { egg: 5 }; UI.updateHud(); });
  await page.tap('#btn-market');
  await page.waitForTimeout(400);
  await page.evaluate(() => { [...document.querySelectorAll('#sheet-body button')].find(b => b.textContent.includes('Sell everything')).click(); });
  await page.waitForTimeout(250);
  const backdrop = await page.evaluate(() => {
    const open = !document.getElementById('modal-backdrop').classList.contains('hidden');
    const eggs0 = Game.state.inventory.egg;
    document.getElementById('modal-backdrop').click(); // tap outside the box
    return { open, closed: document.getElementById('modal-backdrop').classList.contains('hidden'), eggsKept: Game.state.inventory.egg === eggs0 };
  });
  check('tapping the modal backdrop cancels (nothing sold)', backdrop.open && backdrop.closed && backdrop.eggsKept, backdrop);

  // (b) level-up splash defers while a sheet is open
  const splash = await page.evaluate(async () => {
    const out = {};
    Game.emit('levelup', 9);
    await new Promise(r => setTimeout(r, 150));
    out.hiddenWhileSheet = document.getElementById('levelup').classList.contains('hidden');
    document.getElementById('sheet-close').click();
    await new Promise(r => setTimeout(r, 700));
    out.shownAfterClose = !document.getElementById('levelup').classList.contains('hidden');
    document.getElementById('levelup').classList.add('hidden');
    return out;
  });
  check('level-up splash waits for the sheet to close', splash.hiddenWhileSheet && splash.shownAfterClose, splash);

  // (c) Deliver disabled until requirements are met
  await page.evaluate(() => {
    const s = Game.state;
    s.orders = [];
    s.orderTimer = 0.4; s.t = 0.2;
    Game.tick(0.5);
    s.inventory = {}; // can't fulfill anything
    UI.updateHud();
  });
  await page.tap('#btn-orders');
  await page.waitForTimeout(400);
  const deliver = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#sheet-body .order-card button')].find(b => b.textContent.includes('Deliver'));
    const before = btn.disabled;
    const o = Game.state.orders[0];
    for (const [item, qty] of Object.entries(o.reqs)) Game.state.inventory[item] = qty;
    UI.updateHud(); UI.updateHud(); // orders sheet refreshes on its own cadence…
    return { before, orderId: o.id };
  });
  await page.waitForTimeout(900); // …so give the 0.5s live refresh a beat
  const deliverAfter = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('#sheet-body .order-card button')].find(b => b.textContent.includes('Deliver'));
    return btn && !btn.disabled;
  });
  check('order Deliver button is disabled until reqs are met', deliver.before === true && deliverAfter === true, { deliver, deliverAfter });
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // (d) market badge counts distinct item types, not units
  const badge = await page.evaluate(() => {
    Game.state.inventory = { egg: 250, milk: 3 };
    UI.updateHud();
    return document.getElementById('market-badge').textContent;
  });
  check('market badge counts item types (250 eggs + milk → "2", not 99+)', badge === '2', badge);

  // (e) bubble Plant → seed pick plants the tapped tile and closes everything
  await page.evaluate(() => {
    const t = Game.state.tiles[6][10];
    t.k = 'soil'; t.crop = null;
    Game.state.coins += 200;
    Renderer.centerOn(10.5, 6.5);
  });
  await page.waitForTimeout(300);
  const rsp = await page.evaluate(() => Renderer.tileToScreen(10.5, 6.5));
  await page.touchscreen.tap(rsp.x, rsp.y); // soil → bubble
  await page.waitForTimeout(300);
  await page.tap('#bubble .act-plant');     // → seed sheet
  await page.waitForTimeout(400);
  await page.evaluate(() => { [...document.querySelectorAll('#sheet-body .item-card')].find(c => !c.classList.contains('off-season') && !c.classList.contains('mythic-card')).click(); });
  await page.waitForTimeout(400);
  const picked = await page.evaluate(() => ({
    crop: Game.state.tiles[6][10].crop && Game.state.tiles[6][10].crop.id,
    sheetClosed: document.getElementById('sheet').classList.contains('hidden'),
    bubbleClosed: document.getElementById('bubble').classList.contains('hidden'),
  }));
  check('seed pick from the bubble plants the tapped tile and closes up', !!picked.crop && picked.sheetClosed && picked.bubbleClosed, picked);

  // (f) Escape closes the top sheet / modal on desktop
  await page.tap('#btn-market');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const escSheet = await page.evaluate(() => document.getElementById('sheet').classList.contains('hidden'));
  await page.evaluate(() => { Game.state.inventory = { egg: 5 }; UI.updateHud(); });
  await page.tap('#btn-market');
  await page.waitForTimeout(400);
  await page.evaluate(() => { [...document.querySelectorAll('#sheet-body button')].find(b => b.textContent.includes('Sell everything')).click(); });
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape'); // closes the modal, not the sheet under it
  await page.waitForTimeout(250);
  const escModal = await page.evaluate(() => ({
    modalClosed: document.getElementById('modal-backdrop').classList.contains('hidden'),
    sheetStays: !document.getElementById('sheet').classList.contains('hidden'),
    eggsKept: Game.state.inventory.egg === 5,
  }));
  check('Escape closes the sheet', escSheet === true);
  check('Escape closes a confirm modal first (sheet stays, nothing sold)', escModal.modalClosed && escModal.sheetStays && escModal.eggsKept, escModal);

  console.log(errors.length ? '\nJS ERRORS:\n' + errors.join('\n') : '\nNO JS ERRORS');
  console.log(`\nretention: ${pass} passed, ${fail} failed${fail ? ' → ' + failures.join(' | ') : ''}`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED', e); process.exit(1); });
