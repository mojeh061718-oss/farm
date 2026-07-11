/* Harvest Empire — 3.0 return-friendliness e2e suite.
   Locks in the away-time rescale (1 real hour ≈ 1 in-game day, 2.5-day cap),
   the offline decay pause, the season-flip rescue window, the welcome-back
   digest, the toast quiet window and the backup nudge.
   Run: node tests/e2e-return.js  (see tests/README.md) */
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
  await page.fill('#farm-name', 'Return Ranch');
  await page.tap('#setup-start');
  await page.waitForTimeout(400);

  // ---- pacing constants ----
  const pacing = await page.evaluate(() => ({ dayLen: DATA.DAY_LEN, seasonDays: DATA.SEASON_DAYS }));
  check('pacing: DAY_LEN=120, SEASON_DAYS=10', pacing.dayLen === 120 && pacing.seasonDays === 10, pacing);

  // ---- 2h away: rescale + offline decay pause (through the real load path) ----
  const saved = await page.evaluate(() => {
    const G = Game, s = Game.state;
    Game.save = () => {}; // the fixture below IS the save
    G.plant(9, 7, 'wheat'); G.water(9, 7);      // healthy & watered
    G.plant(10, 7, 'turnip');
    s.tiles[7][10].crop.water = 0;              // bone-dry at leave
    s.weather = 'sun'; s.forecast = 'sun'; s.t = 0.3;
    s._flags.deaths.dry = 2;                    // unflushed pre-away losses
    s.lastSaved = Date.now() - 2 * 3600 * 1000; // 2h real ≈ 2 in-game days
    localStorage.setItem('harvest-empire-save-v3', JSON.stringify(s));
    return { now: s.now };
  });
  await page.reload();
  await page.waitForTimeout(900);
  const ret = await page.evaluate(savedNow => {
    const s = Game.state;
    const wheat = s.tiles[7][9].crop, turnip = s.tiles[7][10].crop;
    return {
      delta: s.now - savedNow,
      dayLen: DATA.DAY_LEN,
      wheat: wheat && { prog: wheat.prog, dead: wheat.dead, wilt: wheat.wilt || 0, rot: wheat.rot || 0 },
      turnip: turnip && { prog: turnip.prog, dead: turnip.dead, wilt: turnip.wilt || 0 },
      deathsZeroed: s._flags.deaths.dry === 0,
      quietSet: (s._flags.quietUntil || 0) > s.now - 5,
      modal: !document.getElementById('modal-backdrop').classList.contains('hidden'),
      text: document.getElementById('modal-text').textContent,
    };
  }, saved.now);
  check('away rescale: 2h real ≈ 2 in-game days of sim', ret.delta >= 2 * ret.dayLen && ret.delta < 2 * ret.dayLen + 15, ret.delta);
  check('healthy watered crop comes back RIPE — no wilt, no rot', ret.wheat && ret.wheat.prog === 1 && !ret.wheat.dead && ret.wheat.wilt < 0.05 && ret.wheat.rot < 0.05, ret.wheat);
  check('bone-dry crop still grows offline (moisture pause)', ret.turnip && ret.turnip.prog === 1 && !ret.turnip.dead && ret.turnip.wilt < 0.05, ret.turnip);
  check('pre-away losses folded into the digest, tally zeroed (no double toast)', ret.deathsZeroed && ret.quietSet, ret);
  check('digest is warm and itemized — never guilt', ret.modal && ret.text.includes('Welcome back to Return Ranch') && ret.text.includes("didn't make it") && !/needs its farmer/.test(ret.text), ret.text);
  await page.tap('#modal-yes');
  await page.waitForTimeout(200);

  // ---- losses-only return still shows the digest card ----
  await page.evaluate(() => {
    const s = Game.state;
    Game.save = () => {};
    for (const row of s.tiles) for (const t of row) t.crop = null;
    for (const o of s.orders) o.expires = s.now + 100 * DATA.DAY_LEN;
    s.orderTimer = 999;
    s._flags.deaths.season = 1;
    s.lastSaved = Date.now() - 3600 * 1000;
    localStorage.setItem('harvest-empire-save-v3', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForTimeout(900);
  const lossOnly = await page.evaluate(() => ({
    modal: !document.getElementById('modal-backdrop').classList.contains('hidden'),
    text: document.getElementById('modal-text').textContent,
  }));
  check('losses-only return shows the digest (with the breakdown)', lossOnly.modal && lossOnly.text.includes("didn't make it") && lossOnly.text.includes('season change'), lossOnly);
  await page.tap('#modal-yes');
  await page.waitForTimeout(200);

  // ---- 30h away: sim capped at 2.5 in-game days ----
  const saved3 = await page.evaluate(() => {
    const s = Game.state;
    Game.save = () => {};
    s.lastSaved = Date.now() - 30 * 3600 * 1000;
    localStorage.setItem('harvest-empire-save-v3', JSON.stringify(s));
    return { now: s.now };
  });
  await page.reload();
  await page.waitForTimeout(900);
  const capped = await page.evaluate(savedNow => ({
    delta: Game.state.now - savedNow,
    cap: 2.5 * DATA.DAY_LEN,
  }), saved3.now);
  check('away sim caps at 2.5 in-game days', capped.delta >= capped.cap && capped.delta < capped.cap + 15, capped);

  // ---- digest fields: drones bank harvests, expired orders counted ----
  const digest = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s.coins += 20000;
    for (const row of s.tiles) for (const t of row) t.crop = null;
    out.dronePlaced = G.placeBuilding('drone', 12, 6);
    G.buyFuel(5);
    s.tiles[6][11].k = 'soil';
    G.plant(11, 6, 'wheat');
    const c = s.tiles[6][11].crop;
    c.water = 1; c.prog = 1;                    // ripe under the drone
    s.t = 0.3; s.weather = 'rain'; s.forecast = 'rain';
    for (const o of s.orders) o.expires = s.now + 100 * DATA.DAY_LEN;
    s.orders[0].expires = s.now + 5;            // lapses while away
    out.away = G.fastForward(DATA.DAY_LEN, 3600);
    return out;
  });
  check('digest reports real away seconds', digest.away.seconds === 3600, digest.away);
  check('drones bank offline harvests into the digest', digest.dronePlaced && digest.away.droneHarvest === 1, digest.away);
  check('expired orders counted (fresh arrivals ignored)', digest.away.expiredOrders === 1, digest.away);

  // ---- season flip while away: rescue window ----
  const flip = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    for (const row of s.tiles) for (const t of row) t.crop = null;
    s.fuel = 0; // ground the drone — it must not steal the fixture crop
    s.coins += 500;
    s.season = 0; s.day = DATA.SEASON_DAYS; s.t = 0.5;
    s.weather = 'rain'; s.forecast = 'rain';
    s.tiles[8][10].k = 'soil';
    G.plant(10, 8, 'turnip'); // spring-only
    const c = s.tiles[8][10].crop;
    c.water = 1; c.prog = 1;  // ripe going into the flip
    G.fastForward(DATA.DAY_LEN, 3600); // crosses into summer
    out.flipped = s.season === 1;
    out.alive = !!s.tiles[8][10].crop && !s.tiles[8][10].crop.dead;
    out.wilt0 = (c.wilt || 0) === 0;
    out.rescueSet = Math.abs((s._flags.rescueUntil || 0) - (s.now + 0.75 * DATA.DAY_LEN)) < 1e-6;
    G.tick(8); // live, inside the window
    out.noWiltInWindow = (c.wilt || 0) === 0;
    s._flags.rescueUntil = s.now - 1; // window over
    G.tick(8);
    out.wiltResumes = c.wilt > 0;
    return out;
  });
  check('season flip while away: crop survives, rescue window armed', flip.flipped && flip.alive && flip.wilt0 && flip.rescueSet, flip);
  check('no season-wilt during the rescue window', flip.noWiltInWindow, flip);
  check('wilt resumes once the window closes', flip.wiltResumes, flip);

  // ---- quiet window: flushDeaths held, then delivered ----
  const quiet = await page.evaluate(() => {
    const G = Game, s = Game.state, out = {};
    s._flags.quietUntil = s.now + 30;
    s._flags.deaths.dry = 3;
    s._flags.deathTimer = 6;
    G.tick(0.1);
    out.held = s._flags.deaths.dry === 3 && !document.getElementById('toasts').textContent.includes('Crop losses');
    s._flags.quietUntil = 0;
    s._flags.deathTimer = 6;
    G.tick(0.1);
    out.flushed = s._flags.deaths.dry === 0;
    return out;
  });
  check('quiet window holds the crop-loss toast; it flushes after', quiet.held && quiet.flushed, quiet);

  // ---- rescue button: one tap harvests the at-risk crops, closes the modal ----
  await page.evaluate(() => {
    // the off-season turnip from the flip fixture is still ripe & at risk
    UI.showAwaySummary({ seconds: 7200, crops: 1, produce: 0, droneHarvest: 0, expiredOrders: 0, lost: 0, lostBy: { dry: 0, rot: 0, season: 0 } });
  });
  await page.waitForTimeout(200);
  const rescueUi = await page.evaluate(() => ({
    visible: getComputedStyle(document.getElementById('modal-no')).display !== 'none',
    label: document.getElementById('modal-no').textContent,
  }));
  check('digest offers a one-tap Rescue harvest button', rescueUi.visible && /^Rescue harvest/.test(rescueUi.label), rescueUi);
  const invBefore = await page.evaluate(() => Game.state.inventory.turnip || 0);
  await page.tap('#modal-no');
  await page.waitForTimeout(250);
  const rescued = await page.evaluate(() => ({
    turnip: Game.state.inventory.turnip || 0,
    cropGone: !Game.state.tiles[8][10].crop,
    closed: document.getElementById('modal-backdrop').classList.contains('hidden'),
    cancelRestored: document.getElementById('modal-no').textContent === 'Cancel',
  }));
  check('Rescue harvest brings in the crop, closes and restores Cancel', rescued.turnip > invBefore && rescued.cropGone && rescued.closed && rescued.cancelRestored, rescued);

  // ---- backward compat: the pre-3.0 digest shape must not throw ----
  const compat = await page.evaluate(() => {
    try {
      UI.showAwaySummary({ seconds: 3700, crops: 2, produce: 1, lost: 0 });
      return { ok: true, shown: !document.getElementById('modal-backdrop').classList.contains('hidden') };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  check('legacy digest shape {seconds,crops,produce,lost} still works', compat.ok && compat.shown, compat);
  await page.tap('#modal-yes');
  await page.waitForTimeout(200);

  // ---- backup nudge: menu line + gear badge ----
  await page.tap('#btn-menu');
  await page.waitForTimeout(400);
  const menu1 = await page.evaluate(() => ({
    line: document.getElementById('sheet-body').textContent.includes('Last backup: never'),
    badge: !document.getElementById('menu-badge').classList.contains('hidden'),
    highlighted: !!document.querySelector('#sheet-body .row-card.backup-due'),
  }));
  check('menu shows "Last backup: never" + gear badge when overdue', menu1.line && menu1.badge && menu1.highlighted, menu1);
  await page.evaluate(() => { Game.exportCode(); UI.updateHud(); });
  await page.tap('#sheet-close');
  await page.waitForTimeout(300);
  await page.tap('#btn-menu');
  await page.waitForTimeout(400);
  const menu2 = await page.evaluate(() => ({
    line: document.getElementById('sheet-body').textContent.includes('Last backup: today'),
    badge: !document.getElementById('menu-badge').classList.contains('hidden'),
    highlighted: !!document.querySelector('#sheet-body .row-card.backup-due'),
  }));
  check('after exporting a code: "Last backup: today", badge and highlight clear', menu2.line && !menu2.badge && !menu2.highlighted, menu2);
  await page.tap('#sheet-close');

  console.log(errors.length ? '\nJS ERRORS:\n' + errors.join('\n') : '\nNO JS ERRORS');
  console.log(`\nreturn: ${pass} passed, ${fail} failed${fail ? ' → ' + failures.join(' | ') : ''}`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('SUITE CRASHED', e); process.exit(1); });
