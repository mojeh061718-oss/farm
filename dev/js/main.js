/* ============ Harvest Empire — bootstrap & main loop ============ */
'use strict';

(function () {
  const canvas = document.getElementById('game');

  Renderer.init(canvas);
  const loadResult = Game.load();
  UI.init(canvas);

  if (loadResult.fresh) {
    UI.showSetup(); // choose farm name & starting capital
  } else if (loadResult.recovered) {
    UI.toast('🛡️ Your save was damaged — restored from a safety snapshot!', 'good');
  } else if (loadResult.away) {
    const a = loadResult.away; // digest shows when ANYTHING happened — losses included
    if (a.crops > 0 || a.produce > 0 || a.droneHarvest > 0 || a.expiredOrders > 0 || a.lost > 0) {
      UI.showAwaySummary(a);
    }
  }

  // ask the browser to protect our storage from eviction
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  // center camera on the starting farm
  const p0 = DATA.PARCELS[0];
  Renderer.centerOn(p0.x + p0.w / 2, p0.y + p0.h / 2);

  let last = performance.now();
  let frameErrs = 0;
  function frame(now) {
    requestAnimationFrame(frame); // schedule first: one bad frame must never kill the loop
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.25); // ignore long frame gaps (tab hidden)

    try {
      Game.tick(dt);
      Renderer.render(Game.state, dt);
      UI.update(dt);
    } catch (e) {
      if (frameErrs++ < 3) console.error('frame error (recovered):', e);
    }
  }
  requestAnimationFrame(frame);

  // autosave
  setInterval(() => Game.save(), 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Game.save();
  });
  window.addEventListener('pagehide', () => Game.save());
})();
