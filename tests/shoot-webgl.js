const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const FILE = 'file://' + process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
  page.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text()); });
  await page.goto(FILE);
  await page.waitForTimeout(1200);
  const times = [['midday',0.5],['golden',0.82],['sunset',0.85],['night',0.96]];
  for (const [name,t] of times) {
    await page.evaluate((t)=>window.setTOD(t), t);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, name+'.png') });
  }
  console.log('errors:', errs.length); if (errs.length) console.log(errs.slice(0,15).join('\n'));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
