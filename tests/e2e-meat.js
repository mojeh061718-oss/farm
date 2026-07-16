/* Harvest Empire — barnyard meat e2e suite (post-S3b).
   Covers the unified meat path (any barn/coop animal sells for meat, bigger =
   more meat), the shop staying free of the retired Pasture/Slaughterhouse, and
   the S3b save migration that retires legacy pastures gracefully (stock banked
   as meat, buildings refunded, tiles freed).
   Run: node tests/e2e-meat.js */
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
  await page.waitForTimeout(150);

  // ---- config: the legacy system is gone from the data ----
  const cfg = await page.evaluate(() => ({
    noMeatAnimals: DATA.MEAT_ANIMALS === undefined && DATA.FATTEN_SLOWDOWN === undefined,
    noBuildings: !DATA.BUILDINGS.pasture && !DATA.BUILDINGS.slaughterhouse,
    meatItems: !!(DATA.ITEMS.beef && DATA.ITEMS.pork && DATA.ITEMS.chicken_meat),
    everyAnimalHasMeat: Object.values(DATA.ANIMALS).every(a => a.meat && DATA.ITEMS[a.meat]),
  }));
  check('legacy MEAT_ANIMALS / Pasture / Slaughterhouse data is gone', cfg.noMeatAnimals && cfg.noBuildings, cfg);
  check('meat items remain and every barnyard animal maps to one', cfg.meatItems && cfg.everyAnimalHasMeat, cfg);

  // ---- unified barnyard: any animal can be raised & sold for meat ----
  const barnMeat = await page.evaluate(() => {
    const s = Game.state, G = Game, D = DATA;
    s.coins = 1000000;
    s.goalIndex = D.GOALS.length; s.goalsDone = D.GOALS.map(g => g.id);
    s.buildings.push({ type: 'barn', x: 16, y: 6, capacity: 6 });
    const bi = s.buildings.length - 1;
    G.buyAnimal('cow', bi);
    const cow = s.animals[s.animals.length - 1];
    cow.size = 0;
    const youngUnits = G.animalMeatUnits(cow);
    cow.size = 1; // fully grown
    const fullUnits = G.animalMeatUnits(cow);
    const beef0 = s.inventory.beef || 0;
    const got = G.sellForMeat(s.animals.indexOf(cow));
    return {
      youngUnits, fullUnits,
      grewValue: fullUnits > youngUnits,
      got, beefGain: (s.inventory.beef || 0) - beef0,
      gone: !s.animals.includes(cow),
      produced: !!(s.produced && s.produced.beef),
    };
  });
  check('a bigger (fully-grown) animal is worth more meat than a young one', barnMeat.grewValue, barnMeat);
  check('selling a barn animal for meat yields beef and removes it', barnMeat.got === barnMeat.fullUnits && barnMeat.beefGain === barnMeat.fullUnits && barnMeat.gone && barnMeat.produced, barnMeat);

  // ---- the standalone meat buildings are gone from the Shop ----
  const shopClean = await page.evaluate(() => {
    document.getElementById('btn-shop').click();
    const txt = document.getElementById('sheet-body').textContent;
    return { noPasture: !/Pasture/.test(txt), noSlaughter: !/Slaughterhouse/.test(txt), hasCoop: /Coop/.test(txt) };
  });
  check('Pasture & Slaughterhouse are no longer sold in the Shop (Coop still is)', shopClean.noPasture && shopClean.noSlaughter && shopClean.hasCoop, shopClean);

  // ---- S3b migration: a legacy save with a pasture + stock retires gracefully ----
  await page.evaluate(() => {
    // fake the legacy artifacts in a CLONE the way an old save would carry them
    // (never in live state — the render loop would trip over the defunct types)
    const s = JSON.parse(JSON.stringify(Game.state));
    const place = (type, x, y) => {
      s.buildings.push({ type, x, y });
      const i = s.buildings.length - 1;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s.tiles[y + dy][x + dx].obj = { t: 'b', i };
      return i;
    };
    const pi = place('pasture', 4, 4);
    place('slaughterhouse', 8, 4);
    s.livestock = [
      { uid: 1, type: 'steer', home: pi, weight: 6.4, fedUntil: 0, name: 'Chuck' },
      { uid: 2, type: 'hog', home: pi, weight: 4, fedUntil: 0, name: 'Hamlet' },
    ];
    s.coins = 5000;
    s.inventory.beef = 0; s.inventory.pork = 0;
    // serialize by hand the way save() does, then freeze storage so the live
    // game's autosave/pagehide can't clobber the injected legacy save (save()
    // swallows setItem failures; the patch dies with the document on reload)
    localStorage.clear();
    s.lastSaved = Date.now();
    localStorage.setItem('harvest-empire-save-v3', JSON.stringify(s));
    Storage.prototype.setItem = function () {};
  });
  await page.reload();
  await page.waitForTimeout(1200);
  const migrated = await page.evaluate(() => {
    const s = Game.state;
    const types = s.buildings.filter(Boolean).map(b => b.type);
    let orphanTiles = 0;
    for (const row of s.tiles) for (const t of row)
      if (t && t.obj && t.obj.t === 'b' && !s.buildings[t.obj.i]) orphanTiles++;
    return {
      coins: s.coins,
      beef: s.inventory.beef || 0,
      pork: s.inventory.pork || 0,
      livestockGone: s.livestock === undefined,
      noPasture: !types.includes('pasture') && !types.includes('slaughterhouse'),
      orphanTiles,
      produced: !!(s.produced.beef && s.produced.pork),
    };
  });
  check('migration: legacy stock is banked as meat at its weight', migrated.beef === 6 && migrated.pork === 4 && migrated.produced, migrated);
  check('migration: pasture + slaughterhouse are removed and refunded in full', migrated.noPasture && migrated.coins === 5000 + 1800 + 5000, migrated);
  check('migration: no orphaned building tiles and no livestock field remains', migrated.orphanTiles === 0 && migrated.livestockGone, migrated);

  check('no runtime errors', errors.length === 0, errors.slice(0, 5));

  await browser.close();
  console.log(`\n  meat: ${pass} passed, ${fail} failed`);
  if (fail) { console.log('  FAILURES: ' + failures.join(', ')); process.exit(1); }
})();
