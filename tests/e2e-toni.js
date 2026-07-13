/* Harvest Empire — THE Sunflower (the Toni Variety) e2e suite.
   Locks in: the rarity constants, non-deterministic spawn wiring (dawn +
   action rolls, never offline), silent unannounced spawns, the parcel
   blessing (pinned water/wilt/rot, love-speed growth, disaster immunity,
   self-harvest + frozen-snapshot replant, offline production), the parcel
   lock, the 1930s newspaper → blessing card flow, the two-step harvest to a
   Glowing Seed, and the seed's 1-in-25 replant gamble.
   Determinism note: spawn/reveal rolls call Math.random AT THE MOMENT of the
   roll (a live property lookup, not game.js's cached `rnd` binding), so these
   tests stub Math.random for exactly the rolls they force.
   Run: node tests/e2e-toni.js  (see tests/README.md) */
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
  await page.fill('#farm-name', 'Toni Acres');
  await page.tap('#setup-start');
  await page.waitForTimeout(400);

  // ---- rarity constants (exact spec values) ----
  const rare = await page.evaluate(() => DATA.TONI);
  check('rarity: plant roll 1/100, glowing seed 1/25',
    Math.abs(rare.plantChance - 1 / 100) < 1e-12
    && Math.abs(rare.seedChance - 1 / 25) < 1e-12, rare);

  // ---- the roll lives on the seed: planting can BE the seed ----
  const act = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.coins += 50000;
    s.level = 60; // no level-up splash over the flow below
    s.goalsDone = DATA.GOALS.map(g => g.id); s.goalIndex = s.goalsDone.length; // drain goals: level 60 would otherwise complete the level-15 goal mid-flow
    s.t = 0.1; s.weather = 'sun'; s.forecast = 'sun';
    s._flags.crowDone = true;
    document.getElementById('toasts').innerHTML = '';
    G.plant(9, 7, 'turnip');             // the bystander crop the blessing tests use
    s.tiles[7][9].crop.water = 1;
    const mr = Math.random;
    Math.random = () => 0;               // the 1/1000 plant roll must hit
    G.plant(10, 8, 'turnip');
    // offline plants never roll — tested here, before anything stands
    s._offline = true;
    G.plant(10, 7, 'turnip');
    s._offline = false;
    out.offlineNoTag = !!s.tiles[7][10].crop && !s.tiles[7][10].crop.toni;
    s.tiles[7][10].crop = null;          // leave no fixture residue
    Math.random = mr;
    // total stealth: the crop IS a normal turnip — same id, same timer, no toni yet
    const c0 = s.tiles[8][10].crop;
    out.hidden = !!c0 && c0.id === 'turnip' && c0.toni === true && s.tonis.length === 0;
    out.toastsAtPlant = document.getElementById('toasts').textContent;
    // she rises only at maturity
    c0.water = 1; c0.prog = 0.98;
    G.tick(2); G.tick(1); // ripen, then the next tick transforms
    const t = s.tonis[0];
    out.spawned = s.tonis.length === 1 && !!t;
    out.atTile = t && t.x === 10 && t.y === 8;
    out.seedGone = !s.tiles[8][10].crop; // the seed was never a turnip at all
    out.rises = t && t.rise != null;
    out.unlocked = t && G.isUnlocked(t.x, t.y);
    out.noBuilding = t && !s.tiles[t.y][t.x].obj;
    out.fresh = t && t.seen === false && t.day >= 1;
    out.toasts = document.getElementById('toasts').textContent;
    return out;
  });
  check('tagged seed grows as a NORMAL crop — no toni, no tell at planting', act.hidden && act.toastsAtPlant === '', act);
  check('offline planting never rolls (gated by _offline)', act.offlineNoTag, act);
  check('at maturity the toni rises AT that tile (crop consumed, rise animation armed, seen=false)',
    act.spawned && act.atTile && act.seedGone && act.rises && act.unlocked && act.noBuilding && act.fresh, act);
  check('no announcement toast on spawn — found by eye only', act.toasts === '', act.toasts);

  // ---- the gate: only one, ever ----
  const dawn = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    const mr = Math.random;
    Math.random = () => 0;
    out.gateHelper = G.spawnToni() === null && s.tonis.length === 1;
    // a stubbed plant roll cannot tag while she stands. Plant on owned, UNBLESSED
    // land (parcel 1, away from her parcel) — (30,6) sits in the right-upper plot.
    G.buyParcel(1);
    G.till(30, 6);
    G.plant(30, 6, 'turnip');
    out.gateTag = !!s.tiles[6][30].crop && !s.tiles[6][30].crop.toni;
    // and a tagged crop maturing while she stands quietly ripens as ordinary
    s.tiles[6][30].crop.toni = true;
    s.tiles[6][30].crop.water = 1; s.tiles[6][30].crop.prog = 0.99;
    G.tick(1); G.tick(1);
    const c14 = s.tiles[6][30].crop;
    out.gateMature = s.tonis.length === 1 && !!c14 && c14.id === 'turnip' && c14.prog >= 1 && !c14.toni;
    s.tiles[6][30].crop = null;          // leave no fixture residue
    Math.random = mr;
    DATA.TONI.plantChance = 0;           // stability for the loops below
    G.fastForward(DATA.DAY_LEN, 3600);   // ripens the blessed turnip for the block below
    return out;
  });
  check('the gate: spawnToni refuses a second while one stands', dawn.gateHelper, dawn);
  check('the gate: no tag while she stands; a pending tag ripens as an ordinary crop', dawn.gateTag && dawn.gateMature, dawn);

  // ---- blessing: pins, love-speed growth, frozen-snapshot replant ----
  const bless = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    out.blessed = G.isBlessed(9, 7);
    G.tick(0.5); // settle a ripe-at-boundary cycle: auto-harvest can swap the crop object
    // fastForward above ripened the turnip → auto-harvest banks + replants (frozen snapshot)
    const c = s.tiles[7][9].crop;
    out.replanted = !!c && c.id === 'turnip' && c.prog < 1;
    out.banked = (s.inventory.turnip || 0) >= 1;
    // pins: water full, wilt/rot zero — the blessing holds them there
    s.t = 0.2; s.weather = 'sun';
    let cl = s.tiles[7][9].crop;
    cl.water = 0.2; cl.wilt = 0.6; cl.rot = 0.4;
    G.tick(1);
    cl = s.tiles[7][9].crop;             // re-read: the cycle may have replaced it
    out.pinned = cl.water === 1 && cl.wilt === 0 && cl.rot === 0;
    // unfertilized crops grow at the fertilizer speed ("love") — measured from
    // a low prog so the crop can't ripen (and self-harvest) mid-measurement
    cl.prog = 0.1;
    G.tick(4);
    out.speed = (s.tiles[7][9].crop.prog - 0.1) * DATA.CROPS.turnip.grow / 4;
    out.speedOK = Math.abs(out.speed - 1.25) < 0.03;
    return out;
  });
  check('blessing pins water=1, wilt=0, rot=0 on parcel crops', bless.blessed && bless.pinned, bless);
  check('auto-harvest banks to inventory; single-harvest crop replants itself (composition frozen)',
    bless.replanted && bless.banked, bless);
  check('unfertilized blessed crops grow at the 1.25× fertilizer speed', bless.speedOK, bless.speed);

  // ---- off-season crop in a blessed parcel survives and grows ----
  const off = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.season = 3; s.weather = 'sun'; s.t = 0.2;
    // fixture crops directly — planting is a locked action inside the blessing
    s.tiles[8][9].k = 'soil';
    s.tiles[8][9].crop = { id: 'tomato', prog: 0.2, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    out.seasonOKBlessed = G.seasonOK('tomato', 9, 8);
    // contrast: same crop on freshly-bought parcel 1 (unblessed)
    G.buyParcel(1);
    G.till(31, 6);
    G.plant(31, 6, 'tomato'); // off-season warning is expected
    s.tiles[6][31].crop.water = 1;
    for (let i = 0; i < 8; i++) G.tick(1);
    const cin = s.tiles[8][9].crop, cout = s.tiles[6][31].crop;
    out.inGrows = cin && !cin.dead && cin.prog > 0.2 && (cin.wilt || 0) === 0;
    out.outWilts = cout && cout.wilt > 0 && cout.prog === 0.0;
    return out;
  });
  check('off-season crop in blessed parcel survives + grows (seasonOK hooks the blessing)',
    off.seasonOKBlessed && off.inGrows && off.outWilts, off);

  // ---- storms skip blessed parcels ----
  const storm = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.tiles[6][10].k = 'soil';
    s.tiles[6][10].crop = { id: 'garlic', prog: 0.3, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    const outside = s.tiles[6][31].crop; // unblessed tomato from above
    let tries = 0;
    while (!outside.dead && tries < 400) {
      s.day = 2; s.t = 0.999; s.forecast = 'storm';
      G.tick(0.2); // crosses dawn → newDay storm smash (0.12/crop, unprotected)
      tries++;
    }
    out.outsideDead = outside.dead && outside.deadCause === 'storm';
    out.blessedAlive = !!s.tiles[6][10].crop && !s.tiles[6][10].crop.dead;
    out.tries = tries;
    return out;
  });
  check('storm flattens the unblessed crop but skips the blessed parcel', storm.outsideDead && storm.blessedAlive, storm);

  // ---- frost skips blessed parcels ----
  const frost = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.season = 3; s.weather = 'sun'; s.forecast = 'sun';
    s.tiles[6][31].crop = { id: 'tomato', prog: 0.3, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    const outside = s.tiles[6][31].crop;
    let tries = 0;
    while (!outside.dead && tries < 400) {
      s._flags.frostDone = false;
      s.t = DATA.NIGHT_START - 0.005 / DATA.DAY_LEN;
      G.tick(0.01);
      tries++;
    }
    out.outsideDead = outside.dead && outside.deadCause === 'frost';
    const cin = s.tiles[8][9].crop; // blessed off-season tomato
    out.blessedAlive = !!cin && !cin.dead;
    return out;
  });
  check('frost kills the unblessed off-season crop but spares the blessed parcel', frost.outsideDead && frost.blessedAlive, frost);

  // ---- crows skip blessed parcels; regrow crops reset like a normal harvest ----
  const crow = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.season = 0; s.weather = 'sun'; s.forecast = 'sun';
    s.tiles[6][31].crop = null; // no unblessed targets anywhere
    s.tiles[7][10].k = 'soil';
    s.tiles[7][10].crop = { id: 'strawberry', prog: 1, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    const lost0 = s.stats.lost, inv0 = s.inventory.strawberry || 0, h0 = s.stats.harvested;
    for (let i = 0; i < 60; i++) {       // ~18 crow rolls land — all must find no target
      const c = s.tiles[7][10].crop;
      if (c) c.prog = 1;
      s._flags.crowDone = false;
      s.t = 0.5 - 0.001 / DATA.DAY_LEN;  // the tick crosses midday
      G.tick(0.005);
    }
    const c = s.tiles[7][10].crop;
    out.noLoss = s.stats.lost === lost0;
    out.regrowKept = !!c && c.id === 'strawberry' && c.regrown === true && c.prog < 1;
    out.banked = (s.inventory.strawberry || 0) > inv0;
    out.statsCounted = s.stats.harvested > h0;
    return out;
  });
  check('ripe blessed crop is never crow-eaten (60 middays, zero losses)', crow.noLoss, crow);
  check('blessed regrow crop resets like a normal harvest and banks its yield', crow.regrowKept && crow.banked && crow.statsCounted, crow);

  // ---- blessed parcel keeps producing through fastForward ----
  const ff = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.t = 0.3; s.day = 2; s.season = 0; s.weather = 'sun'; s.forecast = 'sun';
    s.tiles[8][10].k = 'soil';
    s.tiles[8][10].crop = { id: 'wheat', prog: 0, water: 0, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    const inv0 = s.inventory.wheat || 0;
    const away = G.fastForward(DATA.DAY_LEN, 3600); // wheat: 40s/1.25 = 32s per cycle
    const c = s.tiles[8][10].crop;
    out.banked = (s.inventory.wheat || 0) - inv0;
    out.stillWheat = !!c && c.id === 'wheat';
    out.digestCounts = away.droneHarvest >= 2;
    return out;
  });
  check('blessed parcel produces through fastForward (≥2 wheat banked, digest counts them)',
    ff.banked >= 2 && ff.stillWheat && ff.digestCounts, ff);

  // ---- parcel lock: dig / till / sellBuilding / building placement ----
  const lock = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    const t0 = s.tonis[0];
    s._flags.toniWarnUntil = 0;
    document.getElementById('toasts').innerHTML = '';
    out.digToniTile = G.dig(t0.x, t0.y);                 // false
    out.digCrop = G.dig(9, 7);                           // blessed turnip — false
    out.toast = document.getElementById('toasts').textContent;
    out.tillBlocked = G.till(8, 6) === false && s.tiles[6][8].k === 'grass';
    out.sellWellBlocked = G.sellBuilding(0) === false && !!s.buildings[0]; // the starter well is inside the blessing
    out.placeBlocked = G.canPlaceBuilding('well', 8, 6) === false;
    out.cropKept = !!s.tiles[7][9].crop;
    out.toniKept = s.tonis.length === 1;
    out.shovelTool = G.applyTool('shovel', t0.x, t0.y) === 0;
    return out;
  });
  check('lock: dig/shovel do nothing on the toni tile or its parcel', lock.digToniTile === false && lock.digCrop === false && lock.shovelTool && lock.cropKept && lock.toniKept, lock);
  check('lock: gentle "land is at peace" toast, till/sellBuilding/placement all blocked',
    /at peace/.test(lock.toast) && lock.tillBlocked && lock.sellWellBlocked && lock.placeBlocked, lock);

  // ---- first tap: the 1930s newspaper ----
  await page.evaluate(() => {
    const t = Game.state.tonis[0];
    if (t) Renderer.centerOn(t.x + 0.5, t.y + 0.5);
  });
  await page.waitForTimeout(250);
  const pos = await page.evaluate(() => {
    const t = Game.state.tonis[0];
    if (!t) return { x: 195, y: 420 };
    Renderer.centerOn(t.x + 0.5, t.y + 0.5); // cancels any in-flight pan tween
    return Renderer.tileToScreen(t.x + 0.5, t.y + 0.5);
  });
  await page.waitForTimeout(250);
  await page.touchscreen.tap(pos.x, pos.y);
  await page.waitForTimeout(350);
  const paper = await page.evaluate(() => ({
    overlay: !document.getElementById('toni-overlay').classList.contains('hidden'),
    paper: !!document.getElementById('toni-paper'),
    page1: document.getElementById('toni-page1') && !document.getElementById('toni-page1').classList.contains('hidden'),
    masthead: (document.querySelector('.tp-masthead') || {}).textContent || '',
    headline: (document.querySelector('.tp-headline') || {}).textContent || '',
    dateline: document.getElementById('toni-paper').textContent,
    seen: Game.state.tonis[0].seen === true,
  }));
  check('first tap opens #toni-paper — page 1 with masthead, dateline & headline; seen persists',
    paper.overlay && paper.paper && paper.page1 && /Valley Herald/i.test(paper.masthead)
    && paper.headline === 'THE GOLDEN GIANT BLOOMS AGAIN'
    && paper.dateline.includes('est. 1897') && paper.dateline.includes('Thursday Morning, August 14, 1930')
    && paper.dateline.includes('TWO CENTS') && paper.seen, paper);

  await page.tap('#toni-flip');
  await page.waitForTimeout(250);
  const page2 = await page.evaluate(() => {
    const p2 = document.getElementById('toni-page2');
    return {
      visible: p2 && !p2.classList.contains('hidden'),
      p1Hidden: document.getElementById('toni-page1').classList.contains('hidden'),
      text: p2 ? p2.textContent : '',
    };
  });
  check('flip reveals page 2 — "Some farmers … never … even see it." + the lucky line',
    page2.visible && page2.p1Hidden && page2.text.includes('Some farmers') && page2.text.includes('never')
    && page2.text.includes('even see it.') && page2.text.includes('But some are lucky enough to have it.'), page2);

  await page.tap('#toni-fold');
  await page.waitForTimeout(250);
  const card1 = await page.evaluate(() => ({
    card: !!document.getElementById('toni-card'),
    paperGone: !document.getElementById('toni-paper'),
    text: (document.getElementById('toni-card') || {}).textContent || '',
  }));
  check('folding the paper opens the blessing card (attributes + plain promise + harvest button)',
    card1.card && card1.paperGone && card1.text.includes('Toni’s Variety')
    && card1.text.includes('Endless sun') && card1.text.includes('Everything on this land will thrive, forever.')
    && card1.text.includes('now blessed') && card1.text.includes('read the old story again')
    && card1.text.includes('Harvest her'), card1);
  await page.tap('#toni-ok');
  await page.waitForTimeout(250);

  // ---- second tap: straight to the blessing card ----
  await page.touchscreen.tap(pos.x, pos.y);
  await page.waitForTimeout(350);
  const card2 = await page.evaluate(() => ({
    card: !!document.getElementById('toni-card'),
    noPaper: !document.getElementById('toni-paper'),
  }));
  check('second tap opens the blessing card directly (no newspaper)', card2.card && card2.noPaper, card2);

  // ---- save/load + HE1 export/import round-trip ----
  const fix = await page.evaluate(() => {
    const s = Game.state;
    const code = Game.exportCode();
    const json = JSON.stringify(s.tonis);
    localStorage.setItem('harvest-empire-save-v3', JSON.stringify(s));
    return { code, json };
  });
  await page.reload();
  await page.waitForTimeout(900);
  const loaded = await page.evaluate(f => {
    DATA.TONI.plantChance = 0; // fresh page — re-pin
    const out = {};
    out.persisted = JSON.stringify(Game.state.tonis) === f.json;
    out.seenTrue = Game.state.tonis[0].seen === true;
    out.blessed = Game.isBlessed(Game.state.tonis[0].x, Game.state.tonis[0].y);
    const r = Game.importCode(f.code);
    out.importOk = r.ok && JSON.stringify(Game.state.tonis) === f.json;
    Game.save = () => {};
    return out;
  }, fix);
  check('tonis (with seen) survive save/load', loaded.persisted && loaded.seenTrue && loaded.blessed, loaded);
  check('tonis survive the HE1 export/import code', loaded.importOk, loaded);
  await page.evaluate(() => { // clear any welcome-back digest
    const mb = document.getElementById('modal-backdrop');
    if (!mb.classList.contains('hidden')) document.getElementById('modal-yes').click();
  });
  await page.waitForTimeout(200);

  // ---- the two-step harvest: first confirm alone must NOT harvest ----
  await page.evaluate(() => {
    const t = Game.state.tonis[0];
    Game.state.level = 60;
    if (t) Renderer.centerOn(t.x + 0.5, t.y + 0.5);
  });
  await page.waitForTimeout(250);
  const pos2 = await page.evaluate(() => {
    const t = Game.state.tonis[0];
    return t ? Renderer.tileToScreen(t.x + 0.5, t.y + 0.5) : { x: 195, y: 420 };
  });
  await page.touchscreen.tap(pos2.x, pos2.y);
  await page.waitForTimeout(350);
  await page.tap('#toni-harvest');
  await page.waitForTimeout(250);
  const step1 = await page.evaluate(() => ({
    modal: !document.getElementById('modal-backdrop').classList.contains('hidden'),
    text: document.getElementById('modal-text').textContent,
    tonis: Game.state.tonis.length,
    seeds: Game.state.inventory.toni_seed || 0,
  }));
  check('harvest step 1: confirm asks, nothing harvested yet',
    step1.modal && /Are you sure you want to harvest THE Sunflower/.test(step1.text) && step1.tonis === 1 && step1.seeds === 0, step1);
  await page.tap('#modal-yes');
  await page.waitForTimeout(250);
  const step2 = await page.evaluate(() => ({
    modal: !document.getElementById('modal-backdrop').classList.contains('hidden'),
    text: document.getElementById('modal-text').textContent,
    tonis: Game.state.tonis.length, // STILL 1 — the first confirm alone must not harvest
  }));
  check('harvest step 2: a second, final confirm — the flower still stands after step 1',
    step2.modal && /goodbye/.test(step2.text) && /Glowing Seed/.test(step2.text) && step2.tonis === 1, step2);
  await page.tap('#modal-yes');
  await page.waitForTimeout(250);
  const done = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    out.tonis = s.tonis.length;               // 0 — she is gone
    out.seeds = s.inventory.toni_seed || 0;   // exactly 1
    out.unblessed = !G.isBlessed(9, 7);
    s._flags.toniWarnUntil = 0;
    out.digWorks = G.dig(9, 7) === true;      // the land wakes
    s.inventory.toni_seed = 2;                // stock for the seed-flow blocks below
    return out;
  });
  check('harvest removes her, yields exactly 1 Glowing Seed; the lock lifts and the land wakes',
    done.tonis === 0 && done.seeds === 1 && done.unblessed && done.digWorks, done);

  // ---- Glowing Seed: unsellable, never listed on the market ----
  await page.tap('#btn-market');
  await page.waitForTimeout(400);
  const market = await page.evaluate(() => ({
    listed: document.getElementById('sheet-body').textContent.includes('Glowing Seed'),
    sold: Game.sellItem('toni_seed', 1),
    still: Game.state.inventory.toni_seed,
  }));
  check('Glowing Seed: absent from market listings, sellItem refuses it', !market.listed && market.sold === 0 && market.still === 2, market);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);

  // ---- the seed picker offers it; planting consumes it and grows a glowing sprout ----
  await page.evaluate(() => { // an empty tilled plot to tap for the seed sheet
    const t = Game.state.tiles[7][9];
    t.k = 'soil'; t.crop = null;
    Renderer.centerOn(9.5, 7.5);
  });
  await page.waitForTimeout(300);
  const psp = await page.evaluate(() => Renderer.tileToScreen(9.5, 7.5));
  await page.touchscreen.tap(psp.x, psp.y); // soil → seed sheet opens directly
  await page.waitForTimeout(300);
  await page.waitForTimeout(350);
  const picker = await page.evaluate(() => ({
    card: !!document.querySelector('#sheet-body .mythic-card'),
    text: (document.querySelector('#sheet-body .mythic-card') || {}).textContent || '',
  }));
  check('seed picker offers the Glowing Seed as a mythic card', picker.card && /Glowing Seed/.test(picker.text), picker);
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);
  const sprout = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    G.till(14, 6);
    out.planted = G.plantToniSeed(14, 6);
    out.seedsLeft = s.inventory.toni_seed || 0;   // 1 left
    const sp = s.sprouts[0];
    out.sprout = !!sp && sp.x === 14 && sp.y === 6;
    out.dayTimed = sp && Math.abs(sp.at - (s.now + DATA.DAY_LEN)) < 1; // DATA-relative
    out.smart = G.smartAction(14, 6).act === 'sprout';
    out.digBlocked = G.dig(14, 6) === false;
    out.plantBlocked = G.plant(14, 6, 'turnip') === false;
    return out;
  });
  check('planting consumes the seed → a glowing sprout, revealed after one in-game day, untouchable',
    sprout.planted && sprout.seedsLeft === 1 && sprout.sprout && sprout.dayTimed
    && sprout.smart && sprout.digBlocked && sprout.plantBlocked, sprout);

  // ---- reveal, both outcomes (Math.random stubbed for exactly the reveal roll) ----
  const reveal = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    const mr = Math.random;
    document.getElementById('toasts').innerHTML = '';
    s.t = 0.2; s.weather = 'sun';
    // outcome 1: the 24/25 consolation — an ordinary sunflower, ripe and ready
    Math.random = () => 0.999;
    s.sprouts[0].at = s.now - 1;
    G.tick(0.05);
    Math.random = mr;
    const c = s.tiles[6][14].crop;
    out.consolation = s.sprouts.length === 0 && !!c && c.id === 'sunflower' && c.prog === 1;
    out.kindToast = document.getElementById('toasts').textContent.includes('but an ordinary one');
    out.noToni = !G.toniAt(14, 6);
    // outcome 2: the 1/25 miracle — a brand-new Toni on that exact tile
    G.dig(14, 6); // clear the consolation so the tile is free again
    G.till(15, 6);
    out.planted2 = G.plantToniSeed(15, 6);
    Math.random = () => 0;
    s.sprouts[0].at = s.now - 1;
    G.tick(0.05);
    Math.random = mr;
    const t = G.toniAt(15, 6);
    out.newToni = !!t && t.seen === false;
    out.blessedAgain = G.isBlessed(15, 6);
    out.seedsGone = !s.inventory.toni_seed;
    // gate: with her standing, a Glowing Seed refuses the ground (and is kept)
    s.inventory.toni_seed = 1;
    G.till(16, 8);
    out.seedGated = G.plantToniSeed(16, 8) === false && s.inventory.toni_seed === 1;
    delete s.inventory.toni_seed;
    return out;
  });
  check('reveal (24/25): an ordinary ripe sunflower + a kind toast — never mockery',
    reveal.consolation && reveal.kindToast && reveal.noToni, reveal);
  check('reveal (1/25): a brand-new Toni on that exact tile — seen=false, parcel blessed & locked again',
    reveal.planted2 && reveal.newToni && reveal.blessedAgain && reveal.seedsGone, reveal);
  check('the gate: a Glowing Seed refuses the ground while she stands (seed kept)', reveal.seedGated, reveal);

  // ---- developer demo: the real pipeline, compressed to ~10s ----
  const demo = await page.evaluate(async () => {
    const G = Game, s = Game.state, out = {};
    out.gated = G.devToniDemo() === null;        // one stands — demo refuses
    G.harvestToni(15, 6);                        // clear the stage
    const coins0 = s.coins;
    const r = G.devToniDemo();
    out.started = !!r;
    out.free = s.coins === coins0;
    const c = r && s.tiles[r.y][r.x].crop;
    out.normalCrop = !!c && c.id === 'turnip' && c.toni === true;
    for (let i = 0; i < 14; i++) G.tick(1);      // ~10s to maturity + transform
    out.rose = r && !!G.toniAt(r.x, r.y);
    return out;
  });
  check('dev demo: refuses while one stands; then plants a free normal crop that rises in ~10s',
    demo.gated && demo.started && demo.free && demo.normalCrop && demo.rose, demo);

  console.log(errors.length ? '\nJS ERRORS:\n' + errors.join('\n') : '\nNO JS ERRORS');
  console.log(`\ntoni: ${pass} passed, ${fail} failed${fail ? ' → ' + failures.join(' | ') : ''}`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED', e); process.exit(1); });
