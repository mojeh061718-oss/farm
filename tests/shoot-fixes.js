const { chromium } = require('playwright-core');
const path = require('path'); const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.resolve(__dirname, '../docs/playtest/fix-shots'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errs = []; p.on('pageerror', e => errs.push('PE ' + e.message));
  await p.goto(INDEX); await p.waitForTimeout(500);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(800);
  await p.fill('#farm-name', 'Fix Test'); await p.tap('#setup-start'); await p.waitForTimeout(400);
  // plant an OUT-OF-SEASON crop to show the new telegraph (spring: plant a summer tomato)
  await p.evaluate(() => {
    const G = Game, P = DATA.PARCELS[0];
    Game.state.coins += 5000;
    let n = 0;
    for (let y = P.y; y < P.y + P.h && n < 8; y++) for (let x = P.x; x < P.x + P.w && n < 8; x++) {
      if (G.till(x, y)) { G.plant(x, y, 'tomato'); n++; } // tomato = summer, out of season in spring
    }
  });
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, '01-out-of-season-telegraph.png') });
  // open the Menu to show automation toggles + compendium + (later) legacy
  await p.evaluate(() => UI && document.getElementById('btn-menu') && document.getElementById('btn-menu').click());
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, '02-menu-automation.png') });
  // scroll the sheet to the automation section
  await p.evaluate(() => { const b = document.getElementById('sheet-body'); if (b) b.scrollTop = b.scrollHeight * 0.35; });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, '03-menu-scrolled.png') });
  // open compendium
  await p.evaluate(() => { const G = Game; G.state.produced = { turnip:1, wheat:1, carrot:1, bread:1 }; });
  await p.evaluate(() => { if (window.UI) {} });
  // click the compendium "Open" button by locating the row
  await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.row-card')];
    const r = rows.find(x => /Compendium/.test(x.textContent));
    if (r) r.querySelector('button').click();
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, '04-compendium.png') });
  console.log('errors:', errs.length, errs.slice(0,5).join(' | '));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
