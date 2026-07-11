/* My own first-hand gameplay review harness.
   Opens the real game, screenshots from the setup screen onward, plays a full
   arc through the real UI + engine, and dumps a state trace + screenshots I can
   look at. Screenshots -> docs/playtest/review-shots/ , trace -> stdout+json. */
'use strict';
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SHOTS = path.resolve(__dirname, '../docs/playtest/review-shots');
fs.mkdirSync(SHOTS, { recursive: true });

const trace = [];
let shotN = 0;
async function shot(page, label) {
  const name = String(++shotN).padStart(2, '0') + '-' + label + '.png';
  await page.screenshot({ path: path.join(SHOTS, name) });
  return name;
}
function log(label, data) { trace.push({ label, data }); console.log('•', label, data !== undefined ? JSON.stringify(data) : ''); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  // ---- the very first second: what greets a new player ----
  await page.goto(INDEX);
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1000);
  await shot(page, 'setup-screen'); // first thing a new player sees
  log('setup screen visible', await page.evaluate(() => ({
    title: document.querySelector('.setup-title, h1, #setup-title')?.textContent?.trim()?.slice(0, 60) || null,
    hasNameField: !!document.querySelector('#farm-name'),
    difficulties: [...document.querySelectorAll('.diff-card, [data-diff]')].map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)).slice(0, 6),
  })));

  // seed RNG so my playthrough is reproducible
  await page.evaluate(() => {
    function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
    Math.random = mulberry32(777);
  });

  // ---- start a Classic farm through the real UI ----
  await page.fill('#farm-name', "Claude's Acre");
  await page.waitForTimeout(150);
  // pick classic if a card exists, else default start
  const picked = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.diff-card, [data-diff]')];
    const c = cards.find(e => /classic/i.test(e.textContent));
    if (c) { c.click(); return 'classic'; }
    return 'default';
  });
  log('difficulty picked', picked);
  await page.tap('#setup-start').catch(async () => { await page.click('#setup-start'); });
  await page.waitForTimeout(600);
  await shot(page, 'day1-fresh-farm');
  log('day 1 state', await page.evaluate(() => ({ coins: Game.state.coins, t: +Game.state.t.toFixed(2), goal: Game.currentGoal()?.title, orders: Game.state.orders.length })));

  // helper to run the engine forward N in-game seconds while the renderer keeps drawing
  async function advance(sec) {
    await page.evaluate(async (sec) => {
      const step = 1;
      for (let i = 0; i < sec; i += step) { Game.tick(step); }
    }, sec);
  }
  const dayNum = () => page.evaluate(() => (Game.state.year-1)*40 + Game.state.season*10 + Game.state.day);

  // ---- first hands-on: follow the goal chip like a new player ----
  // till + plant + water a starter bed via the engine, then screenshot the result
  await page.evaluate(() => {
    const P = DATA.PARCELS[0];
    let n = 0;
    for (let y = P.y; y < P.y + P.h && n < 12; y++) for (let x = P.x; x < P.x + P.w && n < 12; x++) {
      if (Game.till(x, y)) { Game.plant(x, y, 'wheat'); Game.water(x, y); n++; }
    }
  });
  await page.waitForTimeout(400);
  await shot(page, 'day1-first-bed-planted');
  log('planted first bed', await page.evaluate(() => ({ coins: Game.state.coins, planted: Game.state.stats.planted })));

  // ---- let the crop grow; screenshot mid-day lighting ----
  await advance(50);
  await page.waitForTimeout(300);
  await shot(page, 'day1-crops-growing');

  // harvest + sell
  const h1 = await page.evaluate(() => {
    let got = 0; const P = DATA.PARCELS[0];
    for (let y = P.y; y < P.y+P.h; y++) for (let x = P.x; x < P.x+P.w; x++){ const t = Game.tileAt(x,y); if (t.crop && t.crop.prog>=1) got += Game.harvest(x,y,true); }
    return got;
  });
  log('first harvest yield', h1);
  await shot(page, 'day1-after-harvest');

  // ---- play several in-game days: replant, buy a coop + hen, sell produce ----
  const milestones = [];
  for (let d = 0; d < 40; d++) {
    await page.evaluate(() => {
      const G = Game, D = DATA, s = G.state;
      G.refillCan();
      const P = D.PARCELS[0];
      // water+harvest+replant a ~16 bed with an in-season crop
      const crop = Object.keys(D.CROPS).find(id => G.seasonOK(id)) || 'wheat';
      let live = 0;
      for (let y=P.y;y<P.y+P.h;y++) for (let x=P.x;x<P.x+P.w;x++){ const t=G.tileAt(x,y); if(t.crop&&!t.crop.dead){ if(t.crop.prog>=1) G.harvest(x,y,true); else { G.water(x,y); live++; } if(t.crop&&t.crop.dead) G.clearDead(x,y);} }
      for (let y=P.y;y<P.y+P.h&&live<16;y++) for (let x=P.x;x<P.x+P.w&&live<16;x++){ const t=G.tileAt(x,y); if(!t.obj&&!t.crop){ if(t.k==='grass')G.till(x,y); if(G.plant(x,y,crop)){G.water(x,y);live++;} } }
      // buy coop + hen when affordable
      if (!G.hasBuilding('coop') && s.coins>800){ for(let y=0;y<15;y++)for(let x=0;x<20;x++){ if(G.canPlaceBuilding('coop',x,y)){G.placeBuilding('coop',x,y);break;} } }
      s.buildings.forEach((b,i)=>{ if(b&&D.BUILDINGS[b.type].capacity){ if(G.animalsIn(i).length<D.BUILDINGS[b.type].capacity && s.coins>1200){ const at=Object.keys(D.ANIMALS).find(t=>D.ANIMALS[t].home===b.type); if(at)G.buyAnimal(at,i);} G.feedAll(i); G.collectBuilding(i);} });
      // orders
      for (const o of s.orders.slice()) if (G.canFulfill(o)) G.fulfillOrder(o.id);
      // sell surplus
      for (const [it,q] of Object.entries(s.inventory)) if (q>0 && !(D.ITEMS[it].mythic)) G.sellItem(it, q);
    });
    // advance one full day
    await advance(120);
    if (d === 4 || d === 12 || d === 25 || d === 39) {
      await page.waitForTimeout(300);
      await shot(page, 'day-arc-' + (await dayNum()));
      milestones.push(await page.evaluate(() => ({ day:(Game.state.year-1)*40+Game.state.season*10+Game.state.day, season: DATA.SEASONS[Game.state.season].name, weather: Game.state.weather, coins: Math.round(Game.state.coins), level: Game.state.level, farmValue: Game.farmValue(), animals: Game.state.animals.length, buildings: Game.state.buildings.filter(Boolean).length, lost: Game.state.stats.lost, goal: Game.currentGoal()?.title })));
    }
  }
  log('milestones', milestones);

  // ---- night look ----
  await page.evaluate(() => { Game.state.t = 0.85; });
  await advance(2);
  await page.waitForTimeout(300);
  await shot(page, 'nighttime');

  // ---- open a couple of real UI panels to review them ----
  // market panel
  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, .hud-btn, [data-panel]')].find(b => /market|⚖/i.test(b.textContent) || /market/i.test(b.getAttribute('data-panel')||''));
    if (btn) { btn.click(); return true; } return false;
  });
  await page.waitForTimeout(400);
  await shot(page, 'ui-panel');
  log('opened a panel', opened);

  const final = await page.evaluate(() => ({
    day:(Game.state.year-1)*40+Game.state.season*10+Game.state.day,
    coins: Math.round(Game.state.coins), level: Game.state.level, farmValue: Game.farmValue(),
    stats: Game.state.stats, animals: Game.state.animals.length, buildings: Game.state.buildings.filter(Boolean).length,
    parcels: Game.state.unlockedParcels.length, goalsDone: Game.state.goalIndex,
  }));
  log('FINAL', final);

  fs.writeFileSync(path.join(SHOTS, 'trace.json'), JSON.stringify({ trace, errors }, null, 2));
  console.log('\nscreens:', shotN, 'errors:', errors.length, '-> ' + SHOTS);
  if (errors.length) console.error(errors.slice(0,10).join('\n'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
