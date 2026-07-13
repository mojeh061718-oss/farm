/* Harvest Empire — big home valley + migration e2e suite.
   Locks in the enlarged 34×26 home valley for new games, and the one-time
   in-place migration that grows a classic 20×15 home save into the new layout
   WITHOUT losing crops, buildings, tilled soil, unlocked parcels or Tonis.
   Run: node tests/e2e-bigfarm.js  (see tests/README.md) */
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

  // ============ 1) NEW GAME: home valley is big ============
  await page.fill('#farm-name', 'Big Acres');
  await page.tap('#setup-start');
  await page.evaluate(() => { DATA.TONI.plantChance = 0; }).catch(() => {}); // deterministic: no stray bloom mid-test
  await page.waitForTimeout(500);
  const fresh = await page.evaluate(() => {
    const s = Game.state, D = DATA;
    const p0 = D.PARCELS[0];
    // well / farmhouse / a starter bed should all sit inside the free centre parcel
    const inP0 = (x, y) => x >= p0.x && x < p0.x + p0.w && y >= p0.y && y < p0.y + p0.h;
    const well = s.buildings.find(b => b && b.type === 'well');
    const house = s.buildings.find(b => b && b.type === 'farmhouse');
    let soil = 0; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.tiles[y][x].k === 'soil') soil++;
    return {
      w: s.w, h: s.h, WW: D.WORLD_W, WH: D.WORLD_H,
      centre: [p0.w, p0.h],
      wellIn: well && inP0(well.x, well.y),
      houseNearP0: house && house.x >= p0.x - 1 && house.y >= p0.y - 1,
      soil, parcels: D.PARCELS.length,
    };
  });
  check('new home valley is 40×30', fresh.w === 40 && fresh.h === 30, fresh);
  check('free starting plot is a generous 20×12', fresh.centre[0] === 20 && fresh.centre[1] === 12, fresh);
  check('eight parcels', fresh.parcels === 8, fresh);
  check('well sits inside the starting parcel', fresh.wellIn === true, fresh);
  check('four starter beds tilled', fresh.soil === 4, fresh);

  // renders at the big size with no errors
  const rendered = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return { hasCanvas: !!c, w: c && c.width, h: c && c.height };
  });
  check('canvas renders at big size', rendered.hasCanvas && rendered.w > 0, rendered);

  // ============ 2) MIGRATION: a classic 20×15 home grows in place ============
  const seeded = await page.evaluate(() => {
    Game.save = () => {}; // stop the live Big Acres game from autosaving over our seed
    // Build a pre-multifarm 20×15 save by hand (old layout), with content in
    // three different parcels so the per-parcel translation is exercised.
    const W = 20, H = 15;
    const tiles = [];
    for (let y = 0; y < H; y++) { const r = []; for (let x = 0; x < W; x++) r.push({ k: 'grass', crop: null, obj: null }); tiles.push(r); }
    // parcel 0 (centre, 7,5,6,6): a wheat crop at (9,7) + tilled soil
    tiles[7][9] = { k: 'soil', crop: { id: 'wheat', prog: 0.5, water: 1, wilt: 0, rot: 0, dead: false }, obj: null };
    tiles[8][9] = { k: 'soil', crop: null, obj: null };
    // parcel 1 (right, 13,5,5,6): a carrot at (14,6)
    tiles[6][14] = { k: 'soil', crop: { id: 'carrot', prog: 0.9, water: 1, wilt: 0, rot: 0, dead: false }, obj: null };
    // parcel 3 (centre-bottom, 7,11,6,3): a potato at (8,12)
    tiles[12][8] = { k: 'soil', crop: { id: 'potato', prog: 0.2, water: 1, wilt: 0, rot: 0, dead: false }, obj: null };
    const save = {
      v: 3, farmName: 'Classic Home', diff: 'classic', setupDone: true,
      coins: 5000, fuel: 0, xp: 0, level: 3, now: 500, day: 5, t: 0.3, season: 0, year: 1,
      weather: 'sun', forecast: 'sun',
      can: { tier: 0, water: 6 }, till: { tier: 0 }, tiles,
      buildings: [{ type: 'well', x: 7, y: 5 }, { type: 'coop', x: 15, y: 6, capacity: 4 }],
      animals: [], inventory: { wheat: 3 },
      market: { mults: {}, hot: 'turnip', fuelPrice: 3.4 }, orders: [], orderTimer: 20,
      tonis: [], sprouts: [],
      unlockedParcels: [0, 1, 3], // three owned parcels
      goalIndex: 0, goalCursor: 0, daily: null, feedCredits: 0, usedNames: [], produced: {},
      stats: { tilled: 4, planted: 3, watered: 3, harvested: 6, sold: 2, collected: 0, orders: 0, crafted: 0, fertilized: 0, earned: 300, lost: 0, recent: 0, prodMark: 0 },
      settings: { sound: false }, legacy: 0, lastSaved: Date.now(),
      _flags: { deaths: { dry: 0, rot: 0, season: 0 } },
    };
    localStorage.setItem('harvest-empire-save-v3', JSON.stringify(save));
    return true;
  });
  check('seeded a classic 20×15 save', seeded === true);

  await page.reload();
  await page.waitForTimeout(1000);

  const mig = await page.evaluate(() => {
    const s = Game.state;
    // crops keep their ORIGINAL coordinates — the new world is a superset
    const at = (x, y) => { const t = s.tiles[y] && s.tiles[y][x]; return t && t.crop ? t.crop.id : (t ? t.k : 'OOB'); };
    let crops = 0; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.tiles[y][x].crop) crops++;
    const well = s.buildings.find(b => b && b.type === 'well');
    const coop = s.buildings.find(b => b && b.type === 'coop');
    return {
      w: s.w, h: s.h, coins: s.coins, level: s.level, invWheat: s.inventory.wheat,
      cropCount: crops,
      wheat: at(9, 7), carrot: at(14, 6), potato: at(8, 12),
      wheatOwned: Game.isUnlocked(9, 7), carrotOwned: Game.isUnlocked(14, 6), potatoOwned: Game.isUnlocked(8, 12),
      well: well && [well.x, well.y], wellStayed: well && well.x === 7 && well.y === 5,
      wellOwned: well && Game.isUnlocked(well.x, well.y),
      coopStayed: coop && coop.x === 15 && coop.y === 6,
      farmsLen: s.farms && s.farms.length, homeExpanded: !!s._flags.homeExpanded,
    };
  });
  check('migrated home is now 40×30', mig.w === 40 && mig.h === 30, mig);
  check('all 3 crops preserved (none dropped)', mig.cropCount === 3, mig);
  check('wheat kept its place', mig.wheat === 'wheat', mig);
  check('carrot kept its place', mig.carrot === 'carrot', mig);
  check('potato kept its place', mig.potato === 'potato', mig);
  check('preserved crops sit on OWNED land', mig.wheatOwned && mig.carrotOwned && mig.potatoOwned, mig);
  check('well building stayed put and stays owned', mig.wellStayed === true && mig.wellOwned === true, mig);
  check('coop building stayed put', mig.coopStayed === true, mig);
  check('shared coins/level/inventory untouched', mig.coins === 5000 && mig.level === 3 && mig.invWheat === 3, mig);
  check('migration flag set (runs once)', mig.homeExpanded === true, mig);

  // reload again — migration must NOT double-run / re-shift anything
  await page.reload();
  await page.waitForTimeout(900);
  const again = await page.evaluate(() => {
    const s = Game.state;
    let crops = 0; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.tiles[y][x].crop) crops++;
    return { w: s.w, h: s.h, cropCount: crops };
  });
  check('idempotent: second load keeps 40×30 and 3 crops', again.w === 40 && again.cropCount === 3, again);

  // ============ 2b) MIGRATION: a 34×26 home grows into the 40×30 clean grid ============
  const seeded34 = await page.evaluate(() => {
    Game.save = () => {};
    // Hand-build a 34×26 save (the previous home valley) with content spread
    // across three old parcels, and mark homeExpanded so only the 40×30 pass runs.
    const W = 34, H = 26;
    const tiles = [];
    for (let y = 0; y < H; y++) { const r = []; for (let x = 0; x < W; x++) r.push({ k: 'grass', crop: null, obj: null }); tiles.push(r); }
    // old parcel 0 (free, 2,5,16,8): wheat at (5,7)
    tiles[7][5] = { k: 'soil', crop: { id: 'wheat', prog: 0.5, water: 1, wilt: 0, rot: 0, dead: false }, obj: null };
    // old parcel 5 (lower-right, 18,13,16,7): pumpkin at (25,15)
    tiles[15][25] = { k: 'soil', crop: { id: 'pumpkin', prog: 0.3, water: 1, wilt: 0, rot: 0, dead: false }, obj: null };
    // old parcel 8 (far bottom-right, 24,20,10,6): melon at (30,23)
    tiles[23][30] = { k: 'soil', crop: { id: 'melon', prog: 0.8, water: 1, wilt: 0, rot: 0, dead: false }, obj: null };
    const save = {
      v: 3, farmName: '34 Valley', diff: 'classic', setupDone: true,
      coins: 22000, fuel: 0, xp: 0, level: 8, now: 900, day: 9, t: 0.4, season: 0, year: 1,
      weather: 'sun', forecast: 'sun',
      can: { tier: 0, water: 6 }, till: { tier: 0 }, tiles,
      buildings: [{ type: 'barn', x: 26, y: 22, capacity: 6 }],
      animals: [], inventory: { melon: 2 },
      market: { mults: {}, hot: 'turnip', fuelPrice: 3.4 }, orders: [], orderTimer: 20,
      tonis: [], sprouts: [],
      unlockedParcels: [0, 5, 8], // three owned old parcels
      goalIndex: 0, goalCursor: 0, daily: null, feedCredits: 0, usedNames: [], produced: {},
      stats: { tilled: 4, planted: 3, watered: 3, harvested: 20, sold: 5, collected: 0, orders: 1, crafted: 0, fertilized: 0, earned: 4000, lost: 0, recent: 0, prodMark: 0 },
      settings: { sound: false }, legacy: 0, lastSaved: Date.now(),
      _flags: { deaths: { dry: 0, rot: 0, season: 0 }, homeExpanded: true }, // classic pass already done
    };
    localStorage.setItem('harvest-empire-save-v3', JSON.stringify(save));
    return true;
  });
  check('seeded a 34×26 save', seeded34 === true);

  await page.reload();
  await page.waitForTimeout(1000);

  const mig34 = await page.evaluate(() => {
    const s = Game.state;
    const at = (x, y) => { const t = s.tiles[y] && s.tiles[y][x]; return t && t.crop ? t.crop.id : (t ? t.k : 'OOB'); };
    let crops = 0; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.tiles[y][x].crop) crops++;
    const barn = s.buildings.find(b => b && b.type === 'barn');
    return {
      w: s.w, h: s.h, coins: s.coins, level: s.level, invMelon: s.inventory.melon,
      cropCount: crops,
      wheat: at(5, 7), pumpkin: at(25, 15), melon: at(30, 23),
      wheatOwned: Game.isUnlocked(5, 7), pumpkinOwned: Game.isUnlocked(25, 15), melonOwned: Game.isUnlocked(30, 23),
      barnStayed: barn && barn.x === 26 && barn.y === 22, barnOwned: barn && Game.isUnlocked(barn.x, barn.y),
      home40: !!s._flags.home40,
    };
  });
  check('34×26 home migrated to 40×30', mig34.w === 40 && mig34.h === 30, mig34);
  check('all 3 crops preserved across 40×30 migration', mig34.cropCount === 3, mig34);
  check('wheat/pumpkin/melon kept their places', mig34.wheat === 'wheat' && mig34.pumpkin === 'pumpkin' && mig34.melon === 'melon', mig34);
  check('all preserved crops sit on OWNED land', mig34.wheatOwned && mig34.pumpkinOwned && mig34.melonOwned, mig34);
  check('barn stayed put and stays owned', mig34.barnStayed === true && mig34.barnOwned === true, mig34);
  check('shared coins/level/inventory untouched (34→40)', mig34.coins === 22000 && mig34.level === 8 && mig34.invMelon === 2, mig34);
  check('40×30 migration flag set', mig34.home40 === true, mig34);

  // ============ 3) premium Realtor farms exceed the home valley ============
  const ladder = await page.evaluate(() => {
    const T = DATA.FARM_TEMPLATES, homeArea = 40 * 30;
    const by = id => T.find(t => t.id === id);
    return {
      estate: by('estate').w * by('estate').h,
      frontier: by('frontier').w * by('frontier').h,
      homeArea,
    };
  });
  check('estate is bigger than the home valley', ladder.estate > ladder.homeArea, ladder);
  check('frontier is the biggest of all', ladder.frontier > ladder.estate, ladder);

  check('no runtime errors', errors.length === 0, errors.slice(0, 5));

  await browser.close();
  console.log(`\n  ${pass} passed, ${fail} failed`);
  if (fail) { console.log('  FAILURES: ' + failures.join(', ')); process.exit(1); }
})();
