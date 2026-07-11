/* Harvest Empire — instrumented playtest driver.
   Boots the REAL game headless, plays it with a persona strategy, captures
   every toast, and writes a per-day journal (JSON) to docs/playtest/data/.

   Usage:  node tests/playtest-driver.js <persona>
   Personas: casual | optimizer | tycoon | explorer | idler
   (or pass a JSON config file path via  --config <file>) */
'use strict';
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUTDIR = path.resolve(__dirname, '../docs/playtest/data');
fs.mkdirSync(OUTDIR, { recursive: true });

// ---- persona configs (behaviour knobs the in-page bot reads) ----
const PERSONAS = {
  casual: {
    name: 'Willow Creek', diff: 'cozy', days: 90, seed: 1011,
    plot: 12, diligence: 0.80, sellMode: 'hoard', ambition: 0.25,
    fertilize: false, doOrders: 0.2, buyAnimals: true, buildProd: false,
    automate: false, note: 'Casual cozy player, small plot, follows goals, hoards produce, forgets to water ~1 day in 5.'
  },
  optimizer: {
    name: 'Maple Yield Co', diff: 'classic', days: 90, seed: 2022,
    plot: 30, diligence: 0.98, sellMode: 'daily', ambition: 0.95,
    fertilize: true, doOrders: 0.9, buyAnimals: true, buildProd: true,
    automate: true, note: 'Min-maxer, big plot, sells daily, chases orders, buildings, automation.'
  },
  tycoon: {
    name: 'Ironhoof Ranch', diff: 'tycoon', days: 90, seed: 3033,
    plot: 20, diligence: 0.95, sellMode: 'market', ambition: 0.7,
    fertilize: true, doOrders: 0.8, buyAnimals: true, buildProd: true,
    automate: true, note: 'Hardcore thin-wallet start, sells on market/hot items, fuel-aware, order focus.'
  },
  explorer: {
    name: 'Wanderlust Farm', diff: 'classic', days: 100, seed: 4044,
    plot: 18, diligence: 0.9, sellMode: 'daily', ambition: 0.85,
    fertilize: true, doOrders: 0.7, buyAnimals: true, buildProd: true,
    automate: true, tryEverything: true, note: 'Tries every feature: all buildings, recipes, fertilizer, drone, land, animals.'
  },
  idler: {
    name: 'Slow Sunday', diff: 'cozy', days: 100, seed: 5055,
    plot: 16, diligence: 0.62, sellMode: 'hoard', ambition: 0.45,
    fertilize: false, doOrders: 0.3, buyAnimals: true, buildProd: false,
    automate: true, note: 'Low-attention idler, forgets ~1 day in 3, leans on automation, tests neglect and recovery.'
  },
};

async function main() {
  const arg = process.argv[2];
  let cfg;
  if (arg === '--config') cfg = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  else cfg = PERSONAS[arg];
  if (!cfg) { console.error('Unknown persona:', arg, '\nChoose:', Object.keys(PERSONAS).join(', ')); process.exit(2); }
  cfg.persona = arg;

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(INDEX);
  await page.waitForTimeout(700);

  const journal = await page.evaluate(runBot, cfg);
  journal.pageErrors = errors;

  const out = path.join(OUTDIR, cfg.persona + '.json');
  fs.writeFileSync(out, JSON.stringify(journal, null, 2));
  // human-readable digest to stdout
  const f = journal.final;
  console.log(`\n== ${cfg.persona} (${cfg.name}, ${cfg.diff}) — ${cfg.days} days ==`);
  console.log(`  Level ${f.level}  coins $${f.coins}  farmValue $${f.farmValue}`);
  console.log(`  harvested ${f.stats.harvested}  lost ${f.stats.lost} (dry ${f.lostBy.dry}/season ${f.lostBy.season}/rot ${f.lostBy.rot})`);
  console.log(`  animals ${f.animals}  buildings ${f.buildings}  parcels ${f.parcels}  goalsDone ${f.goalsDone}`);
  console.log(`  toasts captured: ${journal.toasts.length}  pageErrors: ${errors.length}`);
  console.log(`  -> ${out}`);
  await browser.close();
  if (errors.length) { console.error('PAGE ERRORS:\n' + errors.slice(0, 20).join('\n')); }
}

/* ============ everything below runs INSIDE the page ============ */
function runBot(cfg) {
  const G = Game, D = DATA;
  const S = () => G.state;

  // seed RNG for reproducibility (weather, crows, harvest doubling, toni)
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rng = mulberry32(cfg.seed);
  Math.random = rng;

  // fresh game
  try { localStorage.clear(); } catch (e) {}
  G.newGame();
  G.applySetup(cfg.name, cfg.diff);

  // ---- toast capture ----
  const toasts = [];
  G.on('toast', (msg, kind) => {
    const s = S();
    toasts.push({ day: dayNum(), year: s.year, season: s.season, t: +s.t.toFixed(2), kind: kind || 'info', msg });
  });
  let levelups = 0;
  G.on('levelup', () => levelups++);

  const DAY = D.DAY_LEN;
  const WT = D.WORLD_H, WD = D.WORLD_W;
  function dayNum() { const s = S(); return (s.year - 1) * (4 * D.SEASON_DAYS) + s.season * D.SEASON_DAYS + s.day; }

  // list of unlocked, plantable/ tillable tiles (no building/obj)
  function farmTiles() {
    const out = [];
    for (let y = 0; y < WT; y++) for (let x = 0; x < WD; x++) {
      if (!G.isUnlocked(x, y)) continue;
      const t = G.tileAt(x, y);
      if (t.obj) continue;
      out.push([x, y]);
    }
    return out;
  }
  function inSeasonCrops() {
    return Object.keys(D.CROPS).filter(id => G.seasonOK(id));
  }
  // pick a crop the persona would plant: prefer regrow crops for optimizer, cheap for casual
  function pickCrop() {
    const opts = inSeasonCrops();
    if (!opts.length) return null;
    if (cfg.ambition > 0.7) {
      const regrow = opts.filter(id => D.CROPS[id].regrow);
      if (regrow.length && rng() < 0.7) return regrow[Math.floor(rng() * regrow.length)];
    }
    // cheapest-few bias for low ambition
    const sorted = opts.slice().sort((a, b) => D.CROPS[a].seed - D.CROPS[b].seed);
    const k = cfg.ambition < 0.5 ? Math.min(3, sorted.length) : sorted.length;
    return sorted[Math.floor(rng() * k)];
  }

  const days = [];
  function snapshot() {
    const s = S();
    let invCount = 0, invValue = 0;
    for (const [it, q] of Object.entries(s.inventory)) { invCount += q; invValue += (D.ITEMS[it] ? D.ITEMS[it].base : 0) * q; }
    const g = G.currentGoal();
    return {
      day: dayNum(), year: s.year, season: s.season, seasonName: D.SEASONS[s.season].name,
      weather: s.weather, coins: Math.round(s.coins), fuel: +(s.fuel || 0).toFixed(2),
      level: s.level, xp: Math.round(s.xp), farmValue: G.farmValue(),
      invCount, invValue: Math.round(invValue),
      animals: s.animals.length, buildings: s.buildings.filter(Boolean).length,
      parcels: s.unlockedParcels.length, orders: s.orders.length,
      goalsDone: s.goalIndex || 0, goal: g ? g.title : null,
      stats: Object.assign({}, s.stats),
      lostBy: Object.assign({}, s._flags.deaths),
      canTier: s.can.tier, tillTier: s.till.tier,
    };
  }

  // advance the in-game clock by a whole day (dawn -> next dawn)
  function passDay() {
    const s = S();
    const startDay = dayNum();
    let guard = 0;
    while (dayNum() === startDay && guard < 400) { G.tick(2); guard++; }
  }

  // ---- one persona action pass at dawn ----
  function dawnRoutine(dayIdx) {
    const s = S();
    const forgets = rng() > cfg.diligence; // some days the player just doesn't show up

    // refill + water everything (unless forgot)
    G.refillCan();
    if (!forgets) {
      for (const [x, y] of farmTiles()) {
        const t = G.tileAt(x, y);
        if (t.crop && !t.crop.dead) {
          const r = G.water(x, y);
          if (r === 'empty') { G.refillCan(); G.water(x, y); }
        }
      }
    }

    // harvest anything ripe (even if forgets, assume they glance)
    let ripe = 0;
    for (const [x, y] of farmTiles()) {
      const t = G.tileAt(x, y);
      if (t.crop && !t.crop.dead && t.crop.prog >= 1) { const n = G.harvest(x, y, true); ripe += n; }
    }
    // clear dead beds so we can replant
    for (const [x, y] of farmTiles()) {
      const t = G.tileAt(x, y);
      if (t.crop && t.crop.dead) G.clearDead(x, y);
    }
    if (forgets) { record('forgot'); return; } // a neglected day: no planting/shopping/selling

    // plant empty soil up to plot size
    const crop
      = pickCrop();
    let planted = 0, tilled = 0;
    const tiles = farmTiles();
    let cropTiles = tiles.filter(([x, y]) => { const t = G.tileAt(x, y); return t.crop && !t.crop.dead; }).length;
    for (const [x, y] of tiles) {
      if (cropTiles >= cfg.plot) break;
      const t = G.tileAt(x, y);
      if (t.crop) continue;
      if (t.k === 'grass') { if (G.till(x, y)) tilled++; else continue; }
      if (crop && G.plant(x, y, crop)) {
        planted++; cropTiles++;
        G.water(x, y);
        if (cfg.fertilize && s.coins > 400 && rng() < 0.4) G.fertilize(x, y);
      }
    }

    // ---- feed & collect animals / buildings ----
    for (let i = 0; i < s.buildings.length; i++) {
      const b = s.buildings[i]; if (!b) continue;
      if (D.BUILDINGS[b.type].capacity) { G.feedAll(i); G.collectBuilding(i); }
    }
    // collect artisan recipes
    G.collectRecipes && s.buildings.forEach((b, i) => { if (b && ['bakery', 'creamery', 'press', 'loom'].includes(b.type)) G.collectRecipes(i); });

    // ---- shopping (ambition-gated) ----
    shop(dayIdx);

    // ---- start a recipe if we own a processor and have inputs ----
    if (cfg.buildProd) startAnyRecipe();

    // ---- orders ----
    if (rng() < cfg.doOrders) tryOrders();

    // ---- selling ----
    sell();

    record('played');
  }

  function record(kind) { /* placeholder to mark day type */ lastDayKind = kind; }
  let lastDayKind = 'played';

  function coins() { return S().coins; }

  function shop(dayIdx) {
    const s = S();
    const amb = cfg.ambition;
    // buy fuel if we own powered gear and it's low
    if ((s.till.tier > 0 || G.hasBuilding('drone')) && (s.fuel || 0) < 3) {
      if (coins() > 50) G.buyFuel(5);
    }
    // coop + first hen
    if (cfg.buyAnimals && !G.hasBuilding('coop') && coins() > 900) tryBuild('coop');
    // buy animals into coops/barns up to capacity
    if (cfg.buyAnimals) buyAnimalsUpToBudget();
    // barn once richer
    if (cfg.buyAnimals && amb > 0.5 && !G.hasBuilding('barn') && coins() > 3000) tryBuild('barn');
    // scarecrow for protection
    if (amb > 0.4 && !G.hasBuilding('scarecrow') && coins() > 1200 && s.stats.lost > 3) tryBuild('scarecrow');
    // production buildings
    if (cfg.buildProd) {
      if (!G.hasBuilding('bakery') && coins() > 5000) tryBuild('bakery');
      if (amb > 0.8 && !G.hasBuilding('creamery') && coins() > 6000 && G.hasBuilding('barn')) tryBuild('creamery');
      if (cfg.tryEverything && !G.hasBuilding('feedmill') && coins() > 4000) tryBuild('feedmill');
      if (cfg.tryEverything && !G.hasBuilding('press') && coins() > 6000) tryBuild('press');
      if (cfg.tryEverything && !G.hasBuilding('loom') && coins() > 7000 && G.hasBuilding('barn')) tryBuild('loom');
      if (cfg.tryEverything && !G.hasBuilding('greenhouse') && coins() > 9000) tryBuild('greenhouse');
    }
    // land expansion
    if (amb > 0.5 && coins() > 4000) {
      for (let i = 0; i < D.PARCELS.length; i++) {
        if (!s.unlockedParcels.includes(i) && D.PARCELS[i].cost < coins() * 0.4) { G.buyParcel(i); break; }
      }
    }
    // automation
    if (cfg.automate) {
      if (amb > 0.5 && s.till.tier === 0 && coins() > 1500) G.buyTillTier && G.buyTillTier(1);
      if (s.can.tier === 0 && coins() > 300) G.buyCanTier && G.buyCanTier(1);
      if (!G.hasBuilding('sprinkler') && coins() > 3000 && amb > 0.6) tryBuild('sprinkler');
      if (!G.hasBuilding('drone') && coins() > 12000 && amb > 0.7) tryBuild('drone');
    }
  }

  function tryBuild(type) {
    const def = D.BUILDINGS[type]; if (!def) return false;
    if (coins() < def.cost) return false;
    // find an empty spot that fits
    for (let y = 0; y < WT - (def.h - 1); y++) for (let x = 0; x < WD - (def.w - 1); x++) {
      if (G.canPlaceBuilding && G.canPlaceBuilding(type, x, y)) { return G.placeBuilding(type, x, y); }
    }
    return false;
  }

  function buyAnimalsUpToBudget() {
    const s = S();
    for (let i = 0; i < s.buildings.length; i++) {
      const b = s.buildings[i]; if (!b) continue;
      const def = D.BUILDINGS[b.type];
      if (!def.capacity) continue;
      const inside = G.animalsIn ? G.animalsIn(i).length : s.animals.filter(a => a.home === i).length;
      if (inside >= def.capacity) continue;
      // which animal types this building houses
      const types = Object.keys(D.ANIMALS).filter(t => D.ANIMALS[t].home === b.type);
      for (const at of types) {
        const cost = D.ANIMALS[at].cost;
        if (coins() > cost * 3 && rng() < 0.5) { G.buyAnimal(at, i); break; }
      }
    }
  }

  function startAnyRecipe() {
    const s = S();
    for (let i = 0; i < s.buildings.length; i++) {
      const b = s.buildings[i]; if (!b) continue;
      if (!['bakery', 'creamery', 'press', 'loom'].includes(b.type)) continue;
      for (const [rid, r] of Object.entries(D.RECIPES)) {
        if (r.building !== b.type) continue;
        if (G.canCraft && G.canCraft(rid)) { if (G.startRecipe(i, rid)) break; }
      }
    }
  }

  function tryOrders() {
    const s = S();
    for (const o of s.orders.slice()) {
      if (G.canFulfill && G.canFulfill(o)) G.fulfillOrder(o.id);
    }
    // skip a stale unfulfillable order occasionally
    if (s.orders.length && rng() < 0.3) {
      const o = s.orders[0];
      if (!(G.canFulfill && G.canFulfill(o))) G.skipOrder && G.skipOrder(o.id);
    }
  }

  function sell() {
    const s = S();
    if (cfg.sellMode === 'hoard') {
      // only sell when cash is low or inventory huge
      if (coins() > 800 && invTotal() < 400) return;
    }
    const hot = s.market && s.market.hot;
    const md = G.marketDayItems ? G.marketDayItems() : [];
    for (const [item, qty] of Object.entries(s.inventory)) {
      if (qty <= 0) continue;
      if (D.ITEMS[item] && D.ITEMS[item].mythic) continue; // never sell mythic
      if (cfg.sellMode === 'market') {
        // sell hot / market-day items fully, others only if piling up
        const premium = item === hot || md.includes(item);
        if (!premium && qty < 8) continue;
      }
      G.sellItem(item, qty);
    }
  }
  function invTotal() { let n = 0; for (const q of Object.values(S().inventory)) n += q; return n; }

  // ============ main loop ============
  for (let d = 0; d < cfg.days; d++) {
    lastDayKind = 'played';
    dawnRoutine(d);
    const snap = snapshot();
    snap.dayKind = lastDayKind;
    snap.levelups = levelups;
    days.push(snap);
    passDay();
  }

  const finalSnap = snapshot();
  finalSnap.lostBy = Object.assign({}, S()._flags.deaths);
  // recompute cumulative loss causes from toasts as a cross-check
  return {
    config: cfg,
    days,
    final: finalSnap,
    toasts,
    toastSummary: summarizeToasts(toasts),
    lossCauses: lossCauses(toasts),
    levelups,
  };

  function lossCauses(ts) {
    const c = { thirst: 0, rot: 0, season: 0, storm: 0, crow: 0, frost: 0 };
    for (const t of ts) {
      let m;
      if ((m = t.msg.match(/(\d+) died of thirst/))) c.thirst += +m[1];
      if ((m = t.msg.match(/(\d+) rotted/))) c.rot += +m[1];
      if ((m = t.msg.match(/(\d+) withered out of season/))) c.season += +m[1];
      if ((m = t.msg.match(/storm destroyed (\d+) crop/))) c.storm += +m[1];
      if (/Crows ate a crop/.test(t.msg)) c.crow += 1;
      if ((m = t.msg.match(/Frost killed (\d+) crop/))) c.frost += +m[1];
    }
    return c;
  }

  function summarizeToasts(ts) {
    const counts = {};
    for (const t of ts) {
      // bucket by a normalized key (strip numbers)
      const key = t.msg.replace(/\d[\d,\.]*/g, '#').replace(/\s+/g, ' ').trim().slice(0, 60);
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
