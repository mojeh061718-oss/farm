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
  } else if (loadResult.away && (loadResult.away.crops > 0 || loadResult.away.produce > 0)) {
    UI.showAwaySummary(loadResult.away);
  }

  // ask the browser to protect our storage from eviction
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  // center camera on the starting farm
  const p0 = DATA.PARCELS[0];
  Renderer.centerOn(p0.x + p0.w / 2, p0.y + p0.h / 2);

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.25); // ignore long frame gaps (tab hidden)

    Game.tick(dt);
    Renderer.render(Game.state, dt);
    UI.update(dt);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // autosave
  setInterval(() => Game.save(), 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Game.save();
  });
  window.addEventListener('pagehide', () => Game.save());
})();
