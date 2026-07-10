/* ============ Harvest Empire — isometric (45°) canvas renderer ============
   Graphics 2.0 Phase 0+1: cached pipeline + "Golden Hour Storybook" lighting.
   - Phase 0: no per-frame gradient/pattern allocations, viewport culling,
     pooled entity records, DPR cap 2.0, dt-correct animation.
   - Phase 1: HSL ramp shading, global sun struct, colored directional
     shadows, baked ground layer (de-gridded meadow + diorama edge),
     sky backdrop, dusk/night lightmap with emissive windows & fireflies. */
'use strict';

const Renderer = (() => {
  const D = DATA;
  // isometric diamond tile: 2:1 ratio
  const TW = 96;
  const TH = 48;

  let canvas, ctx, dpr = 1, vw = 0, vh = 0;
  let time = 0;

  const cam = { x: 0, y: 0, z: 0.8 };

  let ghost = null;             // {type, x, y}
  const floats = [];            // floating texts (iso px)
  const animalAnim = new Map(); // ephemeral animal FSM state, keyed by animal uid

  // ---------------- projection ----------------
  function proj(gx, gy) { return { x: (gx - gy) * TW / 2, y: (gx + gy) * TH / 2 }; }
  function unproj(px, py) { return { x: py / TH + px / TW, y: py / TH - px / TW }; }

  function screenToTile(sx, sy) {
    const wx = (sx - vw / 2) / cam.z + cam.x;
    const wy = (sy - vh / 2) / cam.z + cam.y;
    return unproj(wx, wy);
  }

  function tileToScreen(tx, ty) {
    const p = proj(tx, ty);
    return { x: (p.x - cam.x) * cam.z + vw / 2, y: (p.y - cam.y) * cam.z + vh / 2 };
  }

  function centerOn(tx, ty) {
    const p = proj(tx, ty);
    cam.x = p.x;
    cam.y = p.y;
  }

  // deterministic per-tile randomness
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  // bilinear-smoothed hash noise (for organic meadow variation)
  function snoise(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0), b = hash(x0 + 1, y0);
    const c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
    const top = a + (b - a) * sx;
    const bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  }

  // ---------------- HSL ramp system (replaces RGB-multiply shade()) ----------------
  // Style guide: each ±1 step = ±8 L; shadow steps shift hue toward blue-violet
  // and gain saturation; highlight steps shift toward warm yellow and lose a bit.
  function hsl(h, s, l, a) {
    s = Math.max(0, Math.min(100, s));
    l = Math.max(0, Math.min(100, l));
    return a === undefined ? `hsl(${h},${s}%,${l}%)` : `hsla(${h},${s}%,${l}%,${a})`;
  }
  function ramp(h, s, l, step, a) {
    return hsl(h - step * 8, s + (step < 0 ? 7 : -4) * Math.abs(step), l + step * 8, a);
  }

  const hexHslCache = new Map();
  function hexHsl(hex) {
    let v = hexHslCache.get(hex);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    v = [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
    hexHslCache.set(hex, v);
    return v;
  }
  function rampHex(hex, step, a) {
    const c = hexHsl(hex);
    return ramp(c[0], c[1], c[2], step, a);
  }

  // ---------------- season palettes (Golden Hour Storybook) ----------------
  // grass: [h, s, l] base — high-key (L 55+, sat 55+ in growing seasons).
  // Seasons are distinct paintings: spring lush mint + blossom pink; summer
  // deeper gold-green; fall amber/crimson (never khaki); winter cool blue
  // that lets warm roofs pop.
  const PALETTES = [
    { // spring
      grass: [102, 58, 57], hueJit: 10,
      edge: hsl(103, 52, 42),
      tuftD: [106, 60, 40], tuftL: [88, 62, 68],
      trees: [[114, 48, 24], [112, 50, 34], [100, 55, 45]], // deep / mid / lit canopy
      blossom: 'hsl(338,72%,82%)',
      flowers: ['#e56a97', '#f2c23e', '#a970c8', '#f08a5a'],
      far: [110, 30, 34],
      skyDay: [[204, 72, 75], [182, 48, 84], [100, 42, 64]],
    },
    { // summer
      grass: [72, 58, 50], hueJit: 8,
      edge: hsl(80, 55, 37),
      tuftD: [84, 58, 33], tuftL: [58, 64, 60],
      trees: [[112, 45, 20], [100, 52, 29], [86, 58, 40]],
      blossom: null,
      flowers: ['#f2c23e', '#e56a97', '#f08a5a', '#d9b23c'],
      far: [88, 32, 26],
      skyDay: [[206, 74, 68], [50, 60, 80], [72, 44, 55]],
    },
    { // fall — amber grass + crimson/orange/gold tree triad
      grass: [43, 60, 56], hueJit: 8,
      edge: hsl(38, 55, 42),
      tuftD: [36, 58, 40], tuftL: [48, 68, 66],
      trees: [[10, 60, 30], [20, 65, 40], [36, 72, 50]],
      fallTriad: [[6, 68, 44], [24, 76, 50], [42, 80, 52]],
      blossom: null,
      flowers: ['#d97c2e', '#c4552e', '#d9b23c', '#a86a3d'],
      far: [30, 35, 30],
      skyDay: [[212, 46, 72], [36, 60, 80], [44, 46, 58]],
    },
    { // winter — cool blue snow; warm accents pop
      grass: [212, 26, 82], hueJit: 4,
      edge: hsl(214, 24, 66),
      tuftD: [210, 20, 60], tuftL: [200, 25, 92],
      trees: [[165, 22, 22], [160, 24, 30], [150, 22, 40]],
      blossom: null,
      flowers: [],
      far: [215, 20, 42],
      skyDay: [[211, 42, 74], [212, 30, 87], [212, 22, 78]],
    },
  ];

  // ---------------- global sun (one struct per frame) ----------------
  const SUN = {
    elev: 1, dirX: 0, dusk: 0, dark: 0, warm: 0, stretch: 1,
    shadowAlpha: 0.24, shadowCol: '64,52,124', glow: 0,
  };
  function computeSun(state) {
    const t = state.t;
    // compressed evening: dusk starts late, full night is a short interlude
    let dark = 0, dusk = 0;
    if (t >= 0.80 && t < 0.87) dusk = (t - 0.80) / 0.07;
    if (t >= 0.87 && t < 0.92) { dark = (t - 0.87) / 0.05; dusk = 1 - dark; }
    else if (t >= 0.92 && t < 0.965) dark = 1;
    else if (t >= 0.965) { dark = 1 - (t - 0.965) / 0.035; dusk = 1 - dark; }
    const dayT = Math.max(0, Math.min(1, t / 0.76));      // 0 sunrise .. 1 sunset
    const a = (dayT - 0.5) * Math.PI * 0.95;              // sun arc
    const elev = Math.max(0, Math.cos(a)) * (1 - dark);   // 0 night .. 1 noon
    const dirX = Math.sin(a);                             // -1 dawn .. +1 dusk
    const warm = Math.max(dusk, Math.max(0, 1 - dayT * 3.4)); // peaks dawn & dusk
    SUN.elev = elev; SUN.dirX = dirX; SUN.dusk = dusk; SUN.dark = dark; SUN.warm = warm;
    SUN.stretch = 1 + (1 - elev) * 1.35 + dusk * 0.8;    // long shadows at dawn/dusk
    SUN.shadowAlpha = 0.30 * (1 - dark) * (0.6 + 0.4 * elev);
    SUN.shadowCol = dusk > 0.3 ? '88,48,112' : '64,52,124'; // violet, warms at dusk
    SUN.glow = Math.max(dusk * 0.65, dark);               // emissive window factor
    return SUN;
  }

  // ---------------- setup ----------------
  const lm = document.createElement('canvas'); // half-res lightmap
  let lmx = null;
  const lmFull = document.createElement('canvas'); // full-res scratch: cheap 1:1 multiply
  let lmFullX = null;

  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    lmx = lm.getContext('2d');
    lmFullX = lmFull.getContext('2d');
    bakeSprites();
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    // iOS Safari: the visual viewport grows when the toolbar collapses — track it
    if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  }

  let gradeCanvas = null; // pre-composed vignette+grain overlay (rebuilt on resize)

  /* ---------- dynamic resolution (DPR 3 with an automatic safety net) ----------
     The backing store targets the device's real DPR (now capped at 3.0 so DPR-3
     phones get text-sharp world rendering). If sustained frame times run hot,
     the store steps down 3.0 → 2.5 → 2.0 → 1.75 (CSS size unchanged — only the
     internal resolution drops, which is invisible next to a dropped frame).
     It steps back up after a sustained cool period. Steps apply between frames. */
  const RES_CAPS = [3.0, 2.5, 2.0, 1.75];
  let resStep = 0;
  let emaFrame = 16.7, hotFrames = 0, coolTime = 0, coolNeed = 5, upAt = -1e9;
  function dynRes(dt) {
    emaFrame += (dt * 1000 - emaFrame) * 0.08;         // EMA ≈ running p50
    // cool = at/under vsync for coolNeed s (a 60 Hz rAF never reports <15 ms
    // even when idle). Mild jitter (17.5–19 ms) holds the cool clock instead
    // of resetting it — only genuinely hot frames restart the wait.
    if (emaFrame > 19) { hotFrames++; coolTime = 0; }
    else { hotFrames = 0; if (emaFrame < 17.5) coolTime += dt; }
    const dev = Math.min(window.devicePixelRatio || 1, RES_CAPS[0]);
    if (hotFrames >= 60 && resStep < RES_CAPS.length - 1) {
      // a step-up that went hot again within 12 s was a failed probe:
      // exponential backoff so boundary hardware doesn't oscillate visibly
      if (time - upAt < 12) coolNeed = Math.min(80, coolNeed * 2);
      // skip caps that don't actually lower the store on this device
      do { resStep++; } while (resStep < RES_CAPS.length - 1 && Math.min(dev, RES_CAPS[resStep]) >= dpr);
      hotFrames = 0; coolTime = 0;
      if (Math.min(dev, RES_CAPS[resStep]) < dpr) resize();
    } else if (coolTime >= coolNeed && resStep > 0) {
      do { resStep--; } while (resStep > 0 && Math.min(dev, RES_CAPS[resStep]) <= dpr);
      coolTime = 0; emaFrame = 16.7;
      upAt = time;
      if (Math.min(dev, RES_CAPS[resStep]) > dpr) resize();
    }
    if (coolNeed > 5 && time - upAt > 90) coolNeed = 5; // held a level for 90 s — trust it again
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, RES_CAPS[resStep]); // DPR-3-ready, dyn-res capped
    // size to the canvas's actual CSS box (body tracks 100dvh), not the layout viewport
    vw = canvas.clientWidth || window.innerWidth;
    vh = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    ctx.imageSmoothingQuality = 'high'; // context state resets with the store size
    lm.width = Math.max(1, Math.round(vw * dpr / 2));   // half-res light layer
    lm.height = Math.max(1, Math.round(vh * dpr / 2));
    lmFull.width = Math.max(1, Math.round(vw * dpr));
    lmFull.height = Math.max(1, Math.round(vh * dpr));
    gradeCanvas = null;
    skyKey = '';
    ambKey = '';
    if (!resize.done) {
      cam.z = Math.min(1.15, Math.max(0.55, vw / 900));
      resize.done = true;
    }
  }

  function clampCam() {
    cam.z = Math.min(2.0, Math.max(0.35, cam.z));
    const minX = proj(0, D.WORLD_H).x, maxX = proj(D.WORLD_W, 0).x;
    const minY = -TH * 2, maxY = proj(D.WORLD_W, D.WORLD_H).y + TH * 2;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const halfW = vw / 2 / cam.z, halfH = vh / 2 / cam.z;
    cam.x = Math.min(Math.max(cam.x, Math.min(minX + halfW, cx)), Math.max(maxX - halfW, cx));
    cam.y = Math.min(Math.max(cam.y, Math.min(minY + halfH, cy)), Math.max(maxY - halfH, cy));
  }

  /* ================= PHASE 3: tween micro-framework =================
     The renderer's only time primitive used to be sin(time). Anticipation,
     overshoot and settle need begin/end motion — this is the 40-line manager
     from the animation review (§2), the standard 6-ease set, nothing more. */
  const Ease = {
    linear: t => t,
    quadIn: t => t * t,
    quadOut: t => t * (2 - t),
    cubicOut: t => 1 - (1 - t) ** 3,
    backOut: t => { const c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
    elasticOut: t => t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1,
  };
  const Tween = (() => {
    const active = [];
    function to(obj, props, dur, ease, onComplete, delay) {
      const tw = { obj, dur, ease: ease || Ease.quadOut, onComplete, t: -(delay || 0), from: null, to: props };
      active.push(tw);
      return tw;
    }
    function update(dt) {
      for (let i = active.length - 1; i >= 0; i--) {
        const tw = active[i];
        tw.t += dt;
        if (tw.t < 0) continue;
        if (!tw.from) { tw.from = {}; for (const k in tw.to) tw.from[k] = tw.obj[k]; }
        const p = Math.min(1, tw.t / tw.dur);
        const e = tw.ease(p);
        for (const k in tw.to) tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
        if (p >= 1) { active.splice(i, 1); if (tw.onComplete) tw.onComplete(); }
      }
    }
    function kill(obj) { for (let i = active.length - 1; i >= 0; i--) if (active[i].obj === obj) active.splice(i, 1); }
    return { to, update, kill };
  })();

  // one-shot scheduled callbacks — fx choreography ("then, 60ms later…")
  const timers = [];
  function after(d, fn) { timers.push({ t: d, fn }); }
  function runTimers(dt) {
    for (let i = timers.length - 1; i >= 0; i--) {
      if ((timers[i].t -= dt) <= 0) { const fn = timers[i].fn; timers.splice(i, 1); fn(); }
    }
  }
  // world-emitted sounds ride the same bus as game sounds (respects mute)
  const sfx = name => { if (window.Game && Game.emit) Game.emit('sound', name); };

  /* ---------------- pooled world particles (budget 150, kill-oldest ring) ----
     Shapes: dot (plain), soil (rotating clod), chunk (fruit piece w/ glint),
     leaf (rotating ellipse fleck), dust (expanding rising puff), spark,
     drop (falling streak that splashes), splash (2-frame ground tick),
     star (4-point glint), husk (grey crumble flake). */
  const P_MAX = 150;
  const parts = [];
  let pHead = 0;
  function spawnP(x, y, o) {
    let p;
    if (parts.length < P_MAX) { p = {}; parts.push(p); }
    else { p = parts[pHead]; pHead = (pHead + 1) % P_MAX; } // over budget: recycle oldest
    p.on = true;
    p.x = x; p.y = y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.g = o.g !== undefined ? o.g : 300;
    p.rot = o.rot || Math.random() * 6; p.vr = o.vr || 0;
    p.age = 0; p.life = o.life || 0.6;
    p.size = o.size || 2.5; p.col = o.col || '#fff';
    p.shape = o.shape || 'dot';
    p.floorY = o.floorY; p.next = o.next;
    return p;
  }
  function burstDust(px, py, n, size, col) {
    for (let i = 0; i < n; i++) {
      spawnP(px + (Math.random() - 0.5) * 26, py + (Math.random() - 0.5) * 8, {
        shape: 'dust', g: 0, vy: -22 - Math.random() * 12, vx: (Math.random() - 0.5) * 14,
        life: 0.4 + Math.random() * 0.15, size: (size || 5) + Math.random() * 3, col: col || '#a3805a', vr: 26,
      });
    }
  }

  /* ---------------- per-tile crop fx state (dip / squash / pulse) ---------------- */
  const cropFxMap = new Map();
  function cropFx(x, y) {
    const key = x + '|' + y;
    let f = cropFxMap.get(key);
    if (!f) { f = { dip: 0, sc: 1, pulse: 1, hide: 0, glowK: -1, busy: 0 }; cropFxMap.set(key, f); }
    return f;
  }
  const stageMap = new Map(); // render-side quantized growth stage per tile
  let fxSweepAt = 0;
  function sweepFx(state) {
    for (const [k, f] of cropFxMap) {
      if (time > f.busy && !f.hide && Math.abs(f.dip) < 0.05 && Math.abs(f.sc - 1) < 0.02 && Math.abs(f.pulse - 1) < 0.02) cropFxMap.delete(k);
    }
    for (const k of stageMap.keys()) {
      const i = k.indexOf('|');
      const x = +k.slice(0, i), y = +k.slice(i + 1);
      const t = state.tiles[y] && state.tiles[y][x];
      if (!t || !t.crop) stageMap.delete(k);
    }
  }

  // small fx entity lists (world space unless noted)
  const rings = [];      // impact shockwaves {x,y,r,a,vr,va,gold}
  const soaks = [];      // watering dark-soak ellipses {x,y,age}
  const tillFx = [];     // raked furrow reveal overlays {x,y,age}
  const wedges = [];     // hoe blade anticipation sprites
  const ghosts = [];     // harvest ghost crops (squash→flash→pop-out)
  const fliers = [];     // item arcs to the HUD market button (screen space)
  const bolts = [];      // lightning strikes
  const emblems = [];    // season-transition sweep particles (screen space)
  let skyFlash = 0, lastStrike = -9;

  // ---------------- fx (tile coords in, projected immediately) ----------------
  function addFloat(tx, ty, text, color) {
    const p = proj(tx, ty);
    floats.push({ x: p.x, y: p.y, text, color: color || '#fff', age: 0 });
  }
  function addBurst(tx, ty, color) {
    const p = proj(tx, ty);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
      spawnP(p.x, p.y, {
        shape: 'dot', col: color, g: 160, life: 0.5 + Math.random() * 0.2,
        vx: Math.cos(a) * (40 + Math.random() * 50), vy: Math.sin(a) * (25 + Math.random() * 30) - 45,
      });
    }
  }
  // gold star glints at the camera focus — world-side beat for goal payouts
  function addGlintBurst() {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + Math.random();
      spawnP(cam.x + (Math.random() - 0.5) * 40, cam.y + (Math.random() - 0.5) * 24, {
        shape: 'star', col: '#ffe082', g: -30, life: 0.55 + Math.random() * 0.25,
        vx: Math.cos(a) * 50, vy: Math.sin(a) * 30 - 30, vr: 3, size: 5 + Math.random() * 3,
      });
    }
  }

  /* ---------------- TILL: wedge anticipation → strike → raked reveal ---------------- */
  let tillBatchAt = -9, tillBatchBase = 0;
  function fxTill(tx, ty) {
    const x = Math.floor(tx), y = Math.floor(ty);
    // tractor multi-tile: NE→SW sweep, 40ms stagger per diagonal
    if (time - tillBatchAt > 0.15) tillBatchBase = x + y;
    tillBatchAt = time;
    const delay = Math.max(0, x + y - tillBatchBase) * 0.04;
    after(delay, () => {
      const c = proj(x + 0.5, y + 0.5);
      const w = { x: c.x + 6, y: c.y - 26, sc: 0.01, rot: -0.61, alpha: 1, dead: false };
      wedges.push(w);
      Tween.to(w, { sc: 1, y: c.y - 18 }, 0.06, Ease.backOut, () => {   // anticipation
        Tween.to(w, { y: c.y - 5, rot: -0.15 }, 0.05, Ease.quadIn, () => { // strike
          tillFx.push({ x, y, age: 0 });
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            spawnP(c.x + (Math.random() - 0.5) * 20, c.y - 2, {
              shape: 'soil', col: ['#5a4128', '#4a3520', '#6b4e30'][i % 3], g: 900,
              vx: Math.cos(a) * (50 + Math.random() * 70), vy: -90 - Math.random() * 110,
              vr: (Math.random() - 0.5) * 14, life: 0.42 + Math.random() * 0.16, size: 2 + Math.random() * 2,
            });
          }
          burstDust(c.x, c.y, 4);
          Tween.to(w, { alpha: 0, y: c.y - 20 }, 0.14, Ease.quadOut, () => { w.dead = true; });
        });
      });
    });
  }

  /* ---------------- PLANT: seed toss → soil puff → sprout pop ---------------- */
  let plantChain = 0, plantChainAt = -9;
  function fxPlant(tx, ty, color) {
    const x = Math.floor(tx), y = Math.floor(ty);
    const c = proj(x + 0.5, y + 0.5);
    plantChain = time - plantChainAt < 0.5 ? plantChain + 1 : 0;   // rate-limit the toss while drag-planting
    plantChainAt = time;
    const f = cropFx(x, y);
    f.busy = time + 0.7;
    f.sc = 0.01;
    const toss = plantChain < 3 && cam.z >= 0.45;
    if (toss) {
      for (let i = 0; i < 3; i++) {
        spawnP(c.x + (Math.random() - 0.5) * 8, c.y - 17 - Math.random() * 5, {
          shape: 'dot', col: color || '#d9b23c', size: 1.6, g: 1000,
          vx: (Math.random() - 0.5) * 34, vy: 46, life: 0.15,
        });
      }
    }
    after(toss ? 0.09 : 0, () => {
      if (toss) burstDust(c.x, c.y + 1, 3, 3.5);
      Tween.to(f, { sc: 1 }, 0.28, Ease.backOut);
      if (cam.z >= 0.55) {
        spawnP(c.x, c.y - 4, { shape: 'dot', col: '#7ba24c', size: 1.6, vy: -70, vx: (Math.random() - 0.5) * 20, g: 300, life: 0.3 });
      }
    });
  }

  /* ---------------- WATER: droplet fan → splash ticks → soak → happy pulse ---------------- */
  function fxWater(tx, ty) {
    const x = Math.floor(tx), y = Math.floor(ty);
    const c = proj(x + 0.5, y + 0.5);
    soaks.push({ x: c.x, y: c.y + 2, age: 0 });
    if (cam.z >= 0.55) {
      for (let i = 0; i < 10; i++) {
        after(Math.random() * 0.24, () => {
          const px = c.x + (Math.random() - 0.5) * TW * 0.5;
          const py = c.y + (Math.random() - 0.5) * TH * 0.45;
          spawnP(px + 4, py - 26 - Math.random() * 8, {
            shape: 'drop', col: '#7ec3ea', size: 2, g: 500, vx: -12, vy: 200,
            life: 0.4, floorY: py, next: 'splash',
          });
        });
      }
    }
    const f = cropFx(x, y);
    f.busy = time + 0.9;
    after(0.35, () => { f.pulse = 1.08; Tween.to(f, { pulse: 1 }, 0.25, Ease.backOut); });
  }

  /* ---------------- HARVEST: the flagship chain (animation.md §1.5) ----------------
     The game nulls the crop before the fx event lands, so the chain runs on a
     ghost crop drawn at the tile: squash 80ms → white flash + pop + 14 mixed
     particles + soil puff + ground ring + tile dip → item flier on a bezier
     to the HUD market button → badge pop + chime (in ui.js). */
  function fxHarvest(tx, ty, data) {
    const x = Math.floor(tx), y = Math.floor(ty);
    const def = data && D.CROPS[data.id];
    if (!def) { addBurst(tx, ty, '#fff'); return; }
    const n = (data.n || 1);
    const f = cropFx(x, y);
    f.hide = 1; f.busy = time + 1.4;
    stageMap.delete(x + '|' + y);
    const g = { x, y, def, sx: 1, sy: 1, alpha: 1, flash: 0, gold: n > 1, dead: false };
    ghosts.push(g);
    Tween.to(g, { sy: 0.7, sx: 1.22 }, 0.08, Ease.quadOut, () => {       // anticipation: the grab
      g.flash = 1;
      harvestImpact(x, y, def, n);
      Tween.to(g, { sy: 1.28, sx: 1.28 }, 0.09, Ease.backOut, () => {    // impact pop
        Tween.to(g, { alpha: 0, sy: 0.6, sx: 0.6 }, 0.1, Ease.quadIn, () => {
          g.dead = true;
          f.hide = 0;
          const t = Game.state && Game.state.tiles[y] && Game.state.tiles[y][x];
          if (t && t.crop && !t.crop.dead) {                             // regrow: visible snap back to young
            f.sc = 0.05;
            Tween.to(f, { sc: 1 }, 0.3, Ease.backOut);
          }
        });
      });
    });
    after(0.14, () => launchFlier(x, y, def, false));
    if (n > 1) after(0.22, () => launchFlier(x, y, def, true));          // double harvest: second flier
  }

  function harvestImpact(x, y, def, n) {
    const c = proj(x + 0.5, y + 0.5);
    const f = cropFx(x, y);
    f.dip = 3.5;
    Tween.to(f, { dip: 0 }, 0.5, Ease.elasticOut, null, 0.05);           // tile dip + elastic settle
    rings.push({ x: c.x, y: c.y + 2, r: 6, a: 0.55, vr: 165, va: 2.3, gold: n > 1 });
    const cnt = n > 1 ? 22 : 14;
    const leafD = def.leaf, leafL = rampHex(def.leaf, 0.8);
    for (let i = 0; i < cnt; i++) {
      const leafy = i % 7 < 4;                                           // ~8 leaf flecks + ~6 fruit chunks
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 105;
      spawnP(c.x, c.y - 12, {
        shape: leafy ? 'leaf' : 'chunk',
        col: leafy ? (Math.random() < 0.5 ? leafD : leafL) : (Math.random() < 0.7 ? def.color : rampHex(def.color, 0.8)),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.55 - (110 + Math.random() * 85),
        g: 560, vr: (Math.random() - 0.5) * 14,
        life: 0.55 + Math.random() * 0.3,
        size: leafy ? 3 + Math.random() * 1.8 : 2.6 + Math.random() * 2,
      });
    }
    burstDust(c.x, c.y, n > 1 ? 8 : 6);
    if (n > 1) addGlint(c.x, c.y - 20);
  }
  function addGlint(px, py) {
    spawnP(px, py, { shape: 'star', col: '#ffe082', g: 0, vy: -14, life: 0.5, vr: 3.2, size: 7 });
  }

  function launchFlier(x, y, def, gold) {
    const fl = { t: 0, wx: x + 0.5, wy: y + 0.5, def, gold, trail: [], dead: false };
    fliers.push(fl);
    Tween.to(fl, { t: 1 }, 0.48, Ease.quadIn, () => {
      fl.dead = true;
      if (window.UI && UI.fxArrive) UI.fxArrive(gold);                   // badge pop + pentatonic chime
    });
  }

  /* ---------------- DEAD-CROP CLEAR: husk crumble ---------------- */
  function fxClear(tx, ty) {
    const c = proj(tx, ty);
    for (let i = 0; i < 8; i++) {
      spawnP(c.x + (Math.random() - 0.5) * 14, c.y - 6 - Math.random() * 8, {
        shape: 'husk', col: ['#8a8178', '#93846a', '#7a6b52'][i % 3], g: 480,
        vx: (Math.random() - 0.5) * 70, vy: -30 - Math.random() * 60,
        vr: (Math.random() - 0.5) * 10, life: 0.45 + Math.random() * 0.2, size: 2 + Math.random() * 1.6,
      });
    }
    burstDust(c.x, c.y, 3, 4, '#8f8478');
  }

  /* ---------------- LIGHTNING: a bolt that strikes something ---------------- */
  function fxLightning(tx, ty, silent) {
    after(Math.random() * 0.5, () => {
      const c = proj(tx, ty);
      bolts.push({
        x: c.x, y: c.y, age: 0,
        j1: (Math.random() - 0.5) * 110, j2: (Math.random() - 0.5) * 60,
        m1: 0.3 + Math.random() * 0.18, m2: 0.62 + Math.random() * 0.16,
      });
      skyFlash = 1;
      rings.push({ x: c.x, y: c.y + 2, r: 4, a: 0.7, vr: 260, va: 3.2 });
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        spawnP(c.x, c.y - 4, {
          shape: 'spark', col: i % 2 ? '#fff8d8' : '#ffd77a', g: 700,
          vx: Math.cos(a) * (90 + Math.random() * 120), vy: -60 - Math.random() * 160,
          life: 0.3 + Math.random() * 0.2, size: 2,
        });
      }
      if (!silent) after(0.3 + Math.random() * 0.5, () => sfx('thunder')); // distance-delayed rumble
    });
  }

  /* ---------------- STARTLE: tap near an animal → hop + flee ---------------- */
  function addStartle(wx, wy) {
    let any = false;
    for (const [uid, anim] of animalAnim) {
      if (uid === 99 || anim.st === 'flee' || anim.st === 'sleep') continue;
      const d = Math.hypot(anim.x - wx, anim.y - wy);
      if (d > 1.5 || d < 0.02) continue;
      anim.st = 'flee';
      anim.timer = 1.2;
      anim.wp = 0;
      const ang = Math.atan2(anim.y - wy, anim.x - wx);
      anim.tx = Math.max(0.5, Math.min(D.WORLD_W - 0.5, anim.x + Math.cos(ang) * 2.2));
      anim.ty = Math.max(0.5, Math.min(D.WORLD_H - 0.5, anim.y + Math.sin(ang) * 2.2));
      const p = proj(anim.x, anim.y);
      for (let i = 0; i < 3; i++) {
        spawnP(p.x + (Math.random() - 0.5) * 10, p.y - 8 - Math.random() * 6, {
          shape: 'leaf', col: i % 2 ? '#ece5d8' : '#d8cfc0', g: 120,
          vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 30,
          vr: (Math.random() - 0.5) * 12, life: 0.55, size: 2.4,
        });
      }
      any = true;
    }
    if (any) sfx('squawk');
  }

  function setGhost(g) { ghost = g; }

  // ---------------- small helpers ----------------
  function diamondOn(g, cx, cy, w, h) {
    g.beginPath();
    g.moveTo(cx, cy - h / 2);
    g.lineTo(cx + w / 2, cy);
    g.lineTo(cx, cy + h / 2);
    g.lineTo(cx - w / 2, cy);
    g.closePath();
  }
  function diamond(cx, cy, w, h) { diamondOn(ctx, cx, cy, w, h); }

  function polyOn(g, pts) {
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath();
  }
  function poly(pts) { polyOn(ctx, pts); }

  function up(p, h) { return { x: p.x, y: p.y - h }; }

  function rrOn(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function rr(x, y, w, h, r) { rrOn(ctx, x, y, w, h, r); }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lpt(A, B, t) { return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }; }

  // colored directional shadow: one sun (upper-left), cool violet ellipse
  // stretched toward lower-right; long at dawn/dusk, short at noon, gone at night.
  function shadow(x, y, w, h) {
    const a = SUN.shadowAlpha;
    if (a < 0.02) return;
    const len = w * SUN.stretch;
    ctx.fillStyle = `rgba(${SUN.shadowCol},${a})`;
    ctx.beginPath();
    ctx.ellipse(x + (len - w) * 0.62, y + h * 0.22, len, h, 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------- baked sprites (no per-frame gradient allocations) ----------------
  const sprites = {};
  function bakeRadial(size, r, g, b, a0) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${r},${g},${b},${a0})`);
    grad.addColorStop(0.45, `rgba(${r},${g},${b},${a0 * 0.45})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = grad;
    x.fillRect(0, 0, size, size);
    return c;
  }
  function bakeSprites() {
    sprites.glow = bakeRadial(96, 255, 245, 190, 0.38);       // ripe-crop glow
    sprites.lightWarm = bakeRadial(256, 255, 176, 96, 1);     // window light
    sprites.lightCool = bakeRadial(128, 130, 185, 255, 1);    // drone LED
    sprites.lightFly = bakeRadial(96, 210, 230, 110, 1);      // firefly
  }

  // ---------------- per-frame light registry (pooled) ----------------
  const lightPool = [];
  let lightN = 0;
  function addLight(x, y, r, spr, a, flicker, halo) {
    if (a < 0.02) return;
    let L = lightPool[lightN];
    if (!L) L = lightPool[lightN] = { x: 0, y: 0, r: 0, spr: null, a: 0, fl: 0, halo: 0 };
    L.x = x; L.y = y; L.r = r; L.spr = spr; L.a = a; L.fl = flicker ? 1 : 0; L.halo = halo ? 1 : 0;
    lightN++;
  }

  /* ================= ATLAS CACHE (Phase 2: sprite baking) =================
     Every static art asset — trees, buildings, props, decor — is drawn ONCE
     into an offscreen canvas keyed `(kind|variant|season|lod)` and stamped
     with drawImage afterwards. LOD 1 bakes at 2x world scale (full detail);
     LOD 0 bakes at 1x with simplified art for far zoom (cam.z < ~0.5).
     Invalidation: the whole cache drops on season change and rebakes lazily
     over the next frames (each bake is < 1 ms). */
  const Atlas = (() => {
    const cache = new Map();
    let stale = null;   // last season's sprites, kept briefly as fallbacks
    let curSeason = -1;
    let bakesLeft = 3;  // per-frame budget while a season turnover is in flight
    // bakeFn(g, lod) draws with its anchor at local (0,0); the sprite covers
    // x in [-ox, w-ox], y in [-oy, h-oy] around that anchor.
    function get(kind, variant, season, lod, w, h, ox, oy, bakeFn) {
      const key = kind + '|' + variant + '|' + season + '|' + lod;
      let e = cache.get(key);
      if (!e && stale && bakesLeft <= 0) {
        // over budget this frame: stamp the old season's sprite instead —
        // the season crossfade is covering the screen while this happens
        const old = stale.get(kind + '|' + variant + '|' + lod);
        if (old) return old;
      }
      if (!e) {
        if (stale) bakesLeft--;
        // LOD0 1x (far zoom, simplified art), LOD1 2x (classic detail),
        // LOD2 3x (lazy — only baked when cam.z × dpr actually needs it, so
        // high-DPR close zoom never upscales a bake)
        const sc = lod === 2 ? 3 : lod ? 2 : 1;
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w * sc));
        c.height = Math.max(1, Math.ceil(h * sc));
        const g = c.getContext('2d');
        g.setTransform(sc, 0, 0, sc, ox * sc, oy * sc);
        g.lineCap = 'round';
        bakeFn(g, lod);
        e = { c, ox, oy, w, h };
        cache.set(key, e);
      }
      return e;
    }
    function season(s) { // season palette change: current bakes become fallbacks
      if (s === curSeason) return;
      curSeason = s;
      if (cache.size) {
        stale = new Map();
        for (const [k, v] of cache) {
          const p = k.split('|'); // kind|variant|season|lod → kind|variant|lod
          stale.set(p[0] + '|' + p[1] + '|' + p[3], v);
        }
      }
      cache.clear();
    }
    function tick() { // once per frame: refill the bake budget, retire fallbacks
      bakesLeft = 2;
      if (stale && seasonFade.a < 0.5 && !seasonFade.hold) stale = null;
    }
    return { get, season, tick };
  })();
  let LOD = 1;    // picked per frame from cam.z
  let stormK = 0; // storm gust blend 0..1 (eased on weather change)
  let fdt = 1 / 60; // current frame dt, for immediate-mode animation (rotors etc.)
  let dripAcc = 0;  // roof drip spawner accumulator

  // stamp a baked sprite at world point (x, y), optionally rotated/scaled
  // around its anchor (used for tree sway, crop-free transforms are cheap)
  function blit(e, x, y, rot, scale) {
    if (rot || (scale !== undefined && scale !== 1)) {
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      if (scale !== undefined && scale !== 1) ctx.scale(scale, scale);
      ctx.drawImage(e.c, -e.ox, -e.oy, e.w, e.h);
      ctx.restore();
    } else {
      ctx.drawImage(e.c, x - e.ox, y - e.oy, e.w, e.h);
    }
  }

  /* ================= GROUND LAYER (baked once, blitted per frame) =================
     The whole static ground — meadow tiles with smoothed-noise variation, tufts,
     soil beds (with moisture state), the diorama treeline band and the south
     soil-cliff rim — lives in ONE offscreen world canvas. Individual tiles are
     repainted into it when they change (till / water / unlock); the whole layer
     rebuilds on season change. Per-frame cost: one drawImage. */
  // Ground bake supersample follows the device DPR: 2x on DPR-≤2 screens
  // (unchanged, ~30 MB), 3x on DPR-3 phones so the ground stays crisp at
  // gameplay zoom (5664×3078 ≈ 70 MB — measured, within a modern phone's
  // canvas budget; DPR-2 devices never pay it). Decided per device at load,
  // independent of dynamic-resolution steps (no rebake when the store steps).
  const GS = (window.devicePixelRatio || 1) > 2.05 ? 3 : 2;
  const ground = {
    c: null, g: null, mip: null, mg: null, season: -1,
    minX: 0, minY: 0, w: 0, h: 0,
    sig: new Int8Array(D.WORLD_W * D.WORLD_H),
  };
  // half- and quarter-res mips of the ground bake: far zoom samples the mip
  // whose scale is nearest 1:1 instead of minifying the full-res bake >2:1
  // (no pan shimmer, and near-1:1 sampling stays cheap on software raster)
  function refreshMip(sx, sy, sw, sh) {
    if (!ground.mip) {
      for (const [key, div] of [['mip', 2], ['mip2', 4]]) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(ground.c.width / div));
        c.height = Math.max(1, Math.round(ground.c.height / div));
        const g2 = c.getContext('2d');
        g2.imageSmoothingQuality = 'high';
        ground[key] = c;
        ground[key + 'g'] = g2;
      }
    }
    for (const [key, div] of [['mip', 2], ['mip2', 4]]) {
      const mg = ground[key + 'g'], mc = ground[key];
      mg.setTransform(1, 0, 0, 1, 0, 0);
      if (sx === undefined) {
        mg.clearRect(0, 0, mc.width, mc.height);
        mg.drawImage(ground.c, 0, 0, mc.width, mc.height);
      } else {
        const px = Math.max(0, sx) / div, py = Math.max(0, sy) / div;
        mg.clearRect(px, py, sw / div, sh / div);
        mg.drawImage(ground.c, Math.max(0, sx), Math.max(0, sy), sw, sh, px, py, sw / div, sh / div);
      }
    }
  }

  // per-tile bake signature: any visual state that lives in the baked ground
  // layer must be encoded here so the tile repaints when it changes.
  function tileSig(state, x, y) {
    const t = state.tiles[y][x];
    let s = 1;
    if (t.k === 'soil') {
      s = 2;
      const c = t.crop;
      if (c) {
        if (c.water > 0.4) s += 4;                     // wet sheen
        if (c.dead) s += 8;                             // grey dead bed
        else {
          if (c.fert) s += 16;                          // warm fertilized tone
          if ((c.wilt || 0) > 0.4) s += 32;             // cracked wilting bed
          if (c.prog >= 1) s += 64;                     // lit rim on ripe tiles
        }
      }
    }
    if (Game.isUnlocked(x, y)) s -= 128;                // fold into Int8 range
    return s;
  }

  function paintGrassTile(g, state, x, y, pal) {
    const c = proj(x + 0.5, y + 0.5);
    // locked parcels read as wilder, slightly faded meadow (not police tape)
    const pi = Game.parcelAt(x, y);
    const locked = pi >= 0 && !state.unlockedParcels.includes(pi);
    // smoothed-noise meadow: meso tone variance + macro patches + a fine
    // micro octave (crisper patch texture at DPR 3) + hue jitter
    const n = snoise(x * 0.55 + 3.1, y * 0.55 + 7.7);
    const m = snoise(x * 0.21 + 11.3, y * 0.21 + 4.9); // macro meadow patches
    const mi = snoise(x * 1.35 + 8.5, y * 1.35 + 2.2); // micro grain
    const owned = !locked && pi >= 0 && state.unlockedParcels.includes(pi);
    // owned grass reads groomed: subtle alternating diagonal mowing bands
    const mow = owned && state.season !== 3 ? ((Math.floor((x - y) / 2) % 2 + 2) % 2 ? 1.1 : -1.1) : 0;
    const l = pal.grass[2] + (n - 0.5) * 7 + (m - 0.5) * 9 + (mi - 0.5) * 3 + (locked ? -2 : 0) + mow;
    const hh = pal.grass[0] + (snoise(x * 0.4 + 5.2, y * 0.4 + 2.8) - 0.5) * pal.hueJit;
    g.fillStyle = hsl(hh, pal.grass[1] - (locked ? 13 : 0), l);
    diamondOn(g, c.x, c.y, TW + 1.5, TH + 1);
    g.fill();
    const h = hash(x, y);
    // clustered grass tufts — curved tapered blades in two shapes (loose
    // scatter vs. fan sharing one base), two tones + season palette
    if (h > (locked ? 0.14 : 0.21)) {
      const tx = c.x + (h * 997 % 1 - 0.5) * TW * 0.55;
      const ty = c.y + (h * 613 % 1 - 0.5) * TH * 0.55;
      const fan = h * 771 % 1 > 0.55; // tuft shape variant
      const nblades = (locked ? 6 : 4) + Math.floor(h * 17) % 4;
      const tall = locked ? 1.8 : 1;
      g.lineWidth = 1.25;
      g.lineCap = 'round';
      for (let i = 0; i < nblades; i++) {
        const bx = fan ? tx + (i - nblades / 2) * 1.3
          : tx + (hash(x * 7 + i, y * 3) - 0.5) * (locked ? 22 : 13);
        const by = fan ? ty + (hash(x * 3, y + i) - 0.5) * 2
          : ty + (hash(x * 3, y * 7 + i) - 0.5) * (locked ? 11 : 6);
        const tc = (i % 2 === 0) ? pal.tuftD : pal.tuftL;
        const hgt = (3.4 + (hash(x + i * 3, y * 5 + i) * 3.2)) * tall;
        const lean = fan ? (i - (nblades - 1) / 2) * 1.6 : (hash(x + i, y - i) - 0.5) * 5;
        g.strokeStyle = hsl(tc[0], tc[1] - (locked ? 12 : 0), tc[2], 0.78);
        g.beginPath();
        g.moveTo(bx, by);
        g.quadraticCurveTo(bx + lean * 0.25, by - hgt * 0.65, bx + lean, by - hgt);
        g.stroke();
      }
    }
    // fine grass speckle: 3 short paired micro-blades per tile (bake-time
    // only) — breaks up the flat diamond read at DPR-3 close zoom
    if (state.season !== 3) {
      g.lineWidth = 1;
      g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const r1 = hash(x * 17 + i * 5, y * 19 + 3), r2 = hash(x * 23 + 7, y * 29 + i * 3);
        if (r1 < 0.25) continue;
        const px = c.x + (r1 - 0.5) * TW * 0.86;
        const py = c.y + (r2 - 0.5) * TH * 0.86;
        g.strokeStyle = hsl(pal.grass[0] + (i % 2 ? 8 : -5), pal.grass[1],
          pal.grass[2] + (i % 2 ? 9 : -8), 0.42);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + (r2 - 0.5) * 2.4, py - 2 - r1 * 1.6);
        g.moveTo(px + 1.8, py + 0.8);
        g.lineTo(px + 1.8 + (r1 - 0.5) * 2.4, py - 1 - r2 * 1.6);
        g.stroke();
      }
    }
    // clover patches: little three-dot clusters, a light fleck on some
    if (!locked && state.season !== 3 && hash(x * 5 + 1, y * 9 + 2) > 0.74) {
      const px = c.x + (hash(x * 3 + 4, y + 6) - 0.5) * TW * 0.5;
      const py = c.y + (hash(x + 8, y * 5 + 3) - 0.5) * TH * 0.5;
      g.fillStyle = hsl(pal.grass[0] + 14, pal.grass[1], pal.grass[2] - 9, 0.55);
      for (let i = 0; i < 6; i++) {
        const a = hash(x + i, y * 7 + i) * Math.PI * 2, r = 1.5 + hash(x * 9 + i, y) * 4.5;
        g.beginPath();
        g.ellipse(px + Math.cos(a) * r, py + Math.sin(a) * r * 0.55, 1.15, 0.85, a, 0, PI2);
        g.fill();
      }
      if (hash(x * 7, y * 11) > 0.5 && state.season < 2) { // odd white bloom
        g.fillStyle = 'rgba(248,246,238,.7)';
        g.beginPath(); g.arc(px, py - 1.2, 0.9, 0, PI2); g.fill();
      }
    }
    // winter: soft snow drifts
    if (state.season === 3 && h > 0.45) {
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.beginPath();
      g.ellipse(c.x + (h * 331 % 1 - 0.5) * TW * 0.4, c.y + (h * 173 % 1 - 0.5) * TH * 0.4, 9, 3.5, 0, 0, Math.PI * 2);
      g.fill();
    }
    // faint tillable-land grid: gameplay information on owned parcels only
    if (Game.isUnlocked(x, y)) {
      g.strokeStyle = 'rgba(60,42,20,.08)';
      g.lineWidth = 1;
      diamondOn(g, c.x, c.y, TW, TH);
      g.stroke();
    }
  }

  /* Soil bed rebuild (environment.md §2): raised bed with sun-consistent
     lit/shadow lip, contact AO, wobbly ridged furrows, mulch flecks, grass
     transition scallops on grass-adjacent edges, and whole-tile state cues
     (wet sheen, fert warmth, wilt cracks, ripe rim, dead grey, winter snow). */
  function paintSoilTile(g, state, x, y, pal) {
    const t = state.tiles[y][x];
    const c = proj(x + 0.5, y + 0.5);
    const crop = t.crop;
    const wet = crop && crop.water > 0.4;
    const dead = crop && crop.dead;
    const fert = crop && crop.fert && !dead;
    const wilty = crop && !dead && (crop.wilt || 0) > 0.4;
    const ripe = crop && !dead && crop.prog >= 1;
    const winter = state.season === 3;
    const W = TW * 0.96, H = TH * 0.96, lip = 5;
    const NC = { x: c.x, y: c.y - H / 2 }, EC = { x: c.x + W / 2, y: c.y },
          SC = { x: c.x, y: c.y + H / 2 }, WC = { x: c.x - W / 2, y: c.y };
    // neighbor-soil flags — beds sharing an edge merge into one field
    const soilAt = (nx, ny) => nx >= 0 && ny >= 0 && nx < D.WORLD_W && ny < D.WORLD_H && state.tiles[ny][nx].k === 'soil';
    const nNE = soilAt(x, y - 1), nSE = soilAt(x + 1, y), nSW = soilAt(x, y + 1), nNW = soilAt(x - 1, y);
    // soil tones: base hue/sat/lum shifted by state
    let sh = 24, ss = 40, sl = 34;
    if (dead) { sh = 30; ss = 8; sl = 36; }
    else {
      if (fert) { sh = 20; ss = 48; sl = 33; }
      if (wilty) { ss -= 18; sl += 4; sh += 8; }
    }
    if (wet) { sh -= 6; ss -= 4; sl -= 8; }
    // contact AO under the bed (only toward open edges — merged beds stay flush)
    if (!nSW || !nSE || !nNE || !nNW) {
      g.fillStyle = 'rgba(30,26,16,.30)';
      diamondOn(g, c.x, c.y + 3.5, W * 1.05, H * 1.05);
      g.fill();
    }
    // raised sides: SW face lit, SE face shaded (same sun as the buildings) —
    // skipped where another bed continues the field
    if (!nSW) {
      g.fillStyle = hsl(sh, ss + 2, sl - 12);
      polyOn(g, [WC, SC, { x: SC.x, y: SC.y + lip }, { x: WC.x, y: WC.y + lip }]);
      g.fill();
    }
    if (!nSE) {
      g.fillStyle = hsl(sh - 4, ss + 6, sl - 19);
      polyOn(g, [SC, EC, { x: EC.x, y: EC.y + lip }, { x: SC.x, y: SC.y + lip }]);
      g.fill();
    }
    // topsoil
    g.fillStyle = hsl(sh, ss, sl);
    diamondOn(g, c.x, c.y, W, H);
    g.fill();
    // hairline half-px-inset lighter stroke anti-aliases the diamond edge so
    // bed rims don't sparkle against grass at DPR 3
    g.strokeStyle = hsl(sh, ss, sl + 4, 0.5);
    g.lineWidth = 0.8;
    diamondOn(g, c.x, c.y, W - 1, H - 0.6);
    g.stroke();
    // seam filler along merged edges (covers the sliver of grass between beds)
    if (nNE || nSE || nSW || nNW) {
      g.strokeStyle = hsl(sh, ss, sl);
      g.lineWidth = 5;
      g.lineCap = 'butt';
      g.beginPath();
      if (nNE) { g.moveTo(c.x, c.y - TH / 2); g.lineTo(c.x + TW / 2, c.y); }
      if (nSE) { g.moveTo(c.x + TW / 2, c.y); g.lineTo(c.x, c.y + TH / 2); }
      if (nSW) { g.moveTo(c.x, c.y + TH / 2); g.lineTo(c.x - TW / 2, c.y); }
      if (nNW) { g.moveTo(c.x - TW / 2, c.y); g.lineTo(c.x, c.y - TH / 2); }
      g.stroke();
      g.lineCap = 'round';
    }
    // ridged wobbly furrows: paired dark trench + lit crest, clipped to bed.
    // 8 samples + midpoint quadratics — the old 4-segment polyline faceted
    // visibly at DPR 3 close zoom.
    g.save();
    diamondOn(g, c.x, c.y, W - 3, H - 3);
    g.clip();
    const furrow = (wob, ox, oy) => {
      const NSEG = 8;
      const pts = [];
      for (let k = 0; k <= NSEG; k++) pts.push(wob(k / NSEG));
      g.beginPath();
      g.moveTo(pts[0].x + ox, pts[0].y + oy);
      for (let k = 1; k < NSEG; k++) {
        const mx = (pts[k].x + pts[k + 1].x) / 2, my = (pts[k].y + pts[k + 1].y) / 2;
        g.quadraticCurveTo(pts[k].x + ox, pts[k].y + oy, mx + ox, my + oy);
      }
      g.lineTo(pts[NSEG].x + ox, pts[NSEG].y + oy);
      g.stroke();
    };
    for (let i = 0; i < 4; i++) {
      const u = (i + 0.5) / 4;
      const wob = ph => k => proj(x + u + Math.sin(k * 9 + ph + i + x * 2 + y) * 0.02, y + 0.05 + k * 0.9);
      g.strokeStyle = wet ? 'rgba(14,8,4,.44)' : dead ? 'rgba(40,36,30,.4)' : 'rgba(30,16,6,.38)';
      g.lineWidth = 3;
      furrow(wob(0), 0, 0);
      g.strokeStyle = winter ? 'rgba(245,250,255,.55)' // snow caught in the troughs
        : wet ? 'rgba(155,175,205,.14)' : dead ? 'rgba(200,196,185,.25)' : 'rgba(235,195,140,.28)';
      g.lineWidth = 1.6;
      furrow(wob(1.3), -3, -1.6);
    }
    // mulch flecks: dark clods, light straw bits, warm crumbs — denser and
    // more varied than the old 12-fleck pass; clods get a lit top edge
    for (let i = 0; i < 18; i++) {
      const r1 = hash(x * 13 + i, y * 7), r2 = hash(x * 5, y * 17 + i), r3 = hash(x + i, y + i);
      const px = c.x + (r1 - 0.5) * W * 0.82, py = c.y + (r2 - 0.5) * H * 0.82;
      const rw = 1.1 + r3 * 1.6, rh = 0.7 + r3 * 0.9;
      g.fillStyle = r3 > 0.72 ? 'rgba(216,186,120,.35)' : r3 > 0.36 ? 'rgba(40,22,8,.42)' : 'rgba(210,165,115,.26)';
      g.beginPath();
      g.ellipse(px, py, rw, rh, r1 * 3, 0, Math.PI * 2);
      g.fill();
      if (r3 > 0.36 && r3 <= 0.72 && r2 > 0.5) { // lit crumb edge on the bigger clods
        g.fillStyle = 'rgba(200,150,100,.22)';
        g.beginPath();
        g.ellipse(px - rw * 0.25, py - rh * 0.45, rw * 0.55, rh * 0.4, r1 * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // a few small field stones half-buried in the bed
    for (let i = 0; i < 3; i++) {
      const r1 = hash(x * 29 + i * 7, y * 23), r2 = hash(x * 11, y * 31 + i * 5);
      if (r1 < 0.55) continue;
      const px = c.x + (r2 - 0.5) * W * 0.7, py = c.y + (hash(x + i * 3, y * 13) - 0.5) * H * 0.7;
      g.fillStyle = wet ? 'rgba(96,98,104,.8)' : 'rgba(128,124,116,.8)';
      g.beginPath(); g.ellipse(px, py, 1.5 + r1, 1 + r1 * 0.6, r2 * 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(210,208,196,.4)';
      g.beginPath(); g.ellipse(px - 0.5, py - 0.5, (1.5 + r1) * 0.45, (1 + r1 * 0.6) * 0.4, r2 * 2, 0, Math.PI * 2); g.fill();
    }
    // wilting: dry cracks across the bed
    if (wilty && !wet) {
      g.strokeStyle = 'rgba(52,36,20,.5)';
      g.lineWidth = 1.1;
      for (let i = 0; i < 3; i++) {
        const r1 = hash(x * 7 + i * 3, y * 11 + i);
        const px = c.x + (r1 - 0.5) * W * 0.5, py = c.y + (hash(x + i, y * 3) - 0.5) * H * 0.5;
        g.beginPath();
        g.moveTo(px - 7, py + 2);
        g.lineTo(px - 2, py - 1 + r1 * 2);
        g.lineTo(px + 4, py + 1);
        g.lineTo(px + 8, py - 2);
        g.stroke();
      }
    }
    if (wet) { // moist sheen: two soft cool specular bands swept across the top
      const grd = g.createLinearGradient(c.x - W / 2, c.y - H / 2, c.x + W / 2, c.y + H / 2);
      grd.addColorStop(0, 'rgba(150,190,230,.17)');
      grd.addColorStop(0.45, 'rgba(150,190,230,.03)');
      grd.addColorStop(0.75, 'rgba(150,190,230,.13)');
      grd.addColorStop(1, 'rgba(150,190,230,0)');
      g.fillStyle = grd;
      diamondOn(g, c.x, c.y, W, H);
      g.fill();
      g.fillStyle = 'rgba(185,220,250,.30)';
      for (let i = 0; i < 2; i++) {
        const r1 = hash(x * 3 + i * 7, y * 11);
        g.beginPath();
        g.ellipse(c.x + (r1 - 0.5) * W * 0.5, c.y + (hash(x, y + i) - 0.5) * H * 0.5, 2.4, 1, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    // inner rim: lit NW/NE lip toward the sun, dark base of the far lip —
    // only on edges where the field actually ends (ripe rim always shows)
    g.strokeStyle = ripe ? 'rgba(255,232,160,.6)' : hsl(sh + 7, ss + 8, sl + 13, 0.5);
    g.lineWidth = ripe ? 2.2 : 1.6;
    g.beginPath();
    if (!nNW || ripe) { g.moveTo(WC.x + 2, WC.y); g.lineTo(NC.x, NC.y + 1.5); }
    if (!nNE || ripe) { g.moveTo(NC.x, NC.y + 1.5); g.lineTo(EC.x - 2, EC.y); }
    g.stroke();
    g.strokeStyle = 'rgba(24,14,6,.4)';
    g.lineWidth = 1.4;
    g.beginPath();
    if (!nSW || ripe) { g.moveTo(WC.x + 2, WC.y + 1.5); g.lineTo(SC.x, SC.y); }
    if (!nSE || ripe) { g.moveTo(SC.x, SC.y); g.lineTo(EC.x - 2, EC.y + 1.5); }
    g.stroke();
    // grass transition scallops lapping over edges that adjoin grass
    const gcol = hsl(pal.grass[0] + 3, pal.grass[1] + 4, pal.grass[2] - 6, 0.9);
    const edges = [ // [neighbor dx, dy, edge corner A, corner B]
      [0, -1, NC, EC], [1, 0, EC, SC], [0, 1, SC, WC], [-1, 0, WC, NC],
    ];
    g.fillStyle = gcol;
    for (const [dx, dy, A, B] of edges) {
      const nx = x + dx, ny = y + dy;
      const nt = nx < 0 || ny < 0 || nx >= D.WORLD_W || ny >= D.WORLD_H ? null : state.tiles[ny][nx];
      if (nt && nt.k === 'soil') continue;
      for (let i = 0; i < 7; i++) {
        const u = (i + 0.5 + (hash(x * 3 + i, y * 5 + dx) - 0.5) * 0.7) / 7;
        const p = lpt(A, B, u);
        const r = 3.4 + hash(x + i, y + dy * 7) * 3.4;
        g.beginPath();
        g.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function paintGroundTile(g, state, x, y, pal) {
    if (state.tiles[y][x].k === 'soil') paintSoilTile(g, state, x, y, pal);
    else paintGrassTile(g, state, x, y, pal);
  }

  // distant treeline band + meadow fade behind the two north edges (baked)
  function paintBackdrop(g, pal) {
    const W = D.WORLD_W, H = D.WORLD_H;
    const f = pal.far;
    // soft meadow band so the map never meets raw void (hazy, low-contrast)
    g.fillStyle = hsl(f[0], f[1] - 14, f[2] + 30, 0.8);
    polyOn(g, [
      { x: proj(0, H).x - 30, y: proj(0, H).y - 8 },
      { x: proj(0, 0).x, y: proj(0, 0).y - 78 },
      { x: proj(W, 0).x + 30, y: proj(W, 0).y - 8 },
      { x: proj(W, 0).x + 30, y: proj(W, 0).y + 20 },
      { x: proj(0, 0).x, y: proj(0, 0).y + 26 },
      { x: proj(0, H).x - 30, y: proj(0, H).y + 20 },
    ]);
    g.fill();
    // two rows of blurred canopy blobs — the forest treeline
    for (let side = 0; side < 2; side++) {
      const n = side === 0 ? 16 : 21;
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const p = side === 0 ? proj(0, u * H) : proj(u * W, 0);
          const hsh = hash(i * 31 + side * 7, row * 13 + side);
          const r = 20 + hsh * 18 - row * 5;
          g.fillStyle = hsl(f[0] + (hsh - 0.5) * 14, f[1] - 4, f[2] + 8 + row * 10 + hsh * 6, 0.85);
          g.beginPath();
          g.ellipse(p.x + (hsh - 0.5) * 26, p.y - 26 - row * 20 - hsh * 12, r, r * 0.72, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  // soil-cliff rim with scalloped grass lip on the two south map edges (baked)
  function paintCliff(g, pal) {
    const W = D.WORLD_W, H = D.WORLD_H;
    const drop = 26;
    const faces = [
      { a: proj(0, H), b: proj(W, H), lit: true },   // SW-facing (lit) face
      { a: proj(W, H), b: proj(W, 0), lit: false },  // SE-facing (shaded) face
    ];
    for (const fc of faces) {
      const base = fc.lit ? [24, 40, 33] : [22, 42, 24];
      g.fillStyle = hsl(base[0], base[1], base[2]);
      polyOn(g, [fc.a, fc.b, { x: fc.b.x, y: fc.b.y + drop }, { x: fc.a.x, y: fc.a.y + drop }]);
      g.fill();
      // darker footing strip (fades to shadow)
      g.fillStyle = hsl(base[0] - 6, base[1] + 8, base[2] - 12);
      polyOn(g, [
        { x: fc.a.x, y: fc.a.y + drop * 0.55 }, { x: fc.b.x, y: fc.b.y + drop * 0.55 },
        { x: fc.b.x, y: fc.b.y + drop }, { x: fc.a.x, y: fc.a.y + drop },
      ]);
      g.fill();
      // strata scratches
      g.strokeStyle = 'rgba(60,36,16,.35)';
      g.lineWidth = 1.2;
      for (let i = 0; i < 22; i++) {
        const u = (i + 0.5) / 22;
        const px = fc.a.x + (fc.b.x - fc.a.x) * u, py = fc.a.y + (fc.b.y - fc.a.y) * u;
        const hh = hash(i * 17 + (fc.lit ? 0 : 5), 99);
        g.beginPath();
        g.moveTo(px - 6, py + 6 + hh * 10);
        g.lineTo(px + 5, py + 8 + hh * 10);
        g.stroke();
      }
      // scalloped grass lip overhanging the cliff top
      const lipC = pal.grass;
      g.fillStyle = hsl(lipC[0] + 4, lipC[1] + 6, lipC[2] - (fc.lit ? 8 : 14));
      const segs = 30;
      for (let i = 0; i < segs; i++) {
        const u = (i + 0.5) / segs;
        const px = fc.a.x + (fc.b.x - fc.a.x) * u, py = fc.a.y + (fc.b.y - fc.a.y) * u;
        const hh = hash(i * 13 + (fc.lit ? 3 : 8), 77);
        g.beginPath();
        g.ellipse(px, py + 1.5, 16 + hh * 10, 4.5 + hh * 2.5, 0, 0, Math.PI);
        g.fill();
      }
    }
  }

  /* ---------------- pond geometry (renderer-side only; tiles stay 'grass'
     in game state so Game.tileAt consumers are untouched — the pond lives on
     never-unlockable land west of the parcels) ---------------- */
  const POND = (() => {
    const cx = 1.0, cy = 7.65, rx = 0.85, ry = 1.42;
    const pts = [];
    const n = 22; // denser control ring + spline drawing = no visible facets
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      // two jitter octaves: big lobes + fine bank wobble
      const j = 0.86 + hash((i >> 1) * 7 + 1, 31) * 0.22 + (hash(i * 13 + 5, 33) - 0.5) * 0.05;
      pts.push({ gx: cx + Math.cos(a) * rx * j, gy: cy + Math.sin(a) * ry * j });
    }
    return { cx, cy, rx, ry, pts };
  })();
  function pondPoly(g, k) { // closed quadratic spline through bank midpoints
    const P = POND.pts, n = P.length, S = [];
    for (let i = 0; i < n; i++) {
      S.push(proj(POND.cx + (P[i].gx - POND.cx) * k, POND.cy + (P[i].gy - POND.cy) * k));
    }
    g.beginPath();
    g.moveTo((S[n - 1].x + S[0].x) / 2, (S[n - 1].y + S[0].y) / 2);
    for (let i = 0; i < n; i++) {
      const nx = S[(i + 1) % n];
      g.quadraticCurveTo(S[i].x, S[i].y, (S[i].x + nx.x) / 2, (S[i].y + nx.y) / 2);
    }
    g.closePath();
  }
  function nearPond(x, y) {
    return Math.abs(x + 0.5 - POND.cx) < POND.rx + 1.4 && Math.abs(y + 0.5 - POND.cy) < POND.ry + 1.4;
  }

  function paintPond(g, state, pal) {
    const C = proj(POND.cx, POND.cy);
    const winter = state.season === 3;
    // mud ring (wet sand fading out) under the bank
    g.fillStyle = winter ? hsl(214, 14, 62) : hsl(32, 30, 44);
    pondPoly(g, 1.22);
    g.fill();
    g.fillStyle = winter ? hsl(216, 14, 52) : hsl(28, 34, 33);
    pondPoly(g, 1.1);
    g.fill();
    // grass overhang scallops on the mud's outer edge — denser ring with
    // varied sizes + a darker under-tuft so the lip reads at DPR 3
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const j = 1.21 + hash(i * 3, 47) * 0.11;
      const p = proj(POND.cx + Math.cos(a) * POND.rx * j, POND.cy + Math.sin(a) * POND.ry * j);
      const rw = 3.2 + hash(i, 49) * 4.4, rh = 1.8 + hash(i, 51) * 1.6;
      g.fillStyle = hsl(pal.grass[0] + 5, pal.grass[1] + 2, pal.grass[2] - 11, 0.6);
      g.beginPath();
      g.ellipse(p.x + 0.6, p.y + 0.9, rw, rh, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = hsl(pal.grass[0] + 3, pal.grass[1] + 4, pal.grass[2] - 5, 0.95);
      g.beginPath();
      g.ellipse(p.x, p.y, rw, rh, 0, 0, Math.PI * 2);
      g.fill();
    }
    // water with radial depth gradient (shallow warm teal rim → deep center)
    if (winter) {
      g.fillStyle = '#c2d4e2';
      pondPoly(g, 1);
      g.fill();
      const ig = g.createRadialGradient(C.x, C.y, 4, C.x, C.y, TW * 1.1);
      ig.addColorStop(0, 'rgba(226,238,248,.9)');
      ig.addColorStop(1, 'rgba(160,185,210,.35)');
      g.fillStyle = ig;
      pondPoly(g, 1);
      g.fill();
      // cracks in the ice
      g.strokeStyle = 'rgba(120,150,180,.6)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(C.x - 26, C.y - 8);
      g.lineTo(C.x - 6, C.y - 2);
      g.lineTo(C.x + 14, C.y - 10);
      g.moveTo(C.x - 6, C.y - 2);
      g.lineTo(C.x + 2, C.y + 12);
      g.lineTo(C.x + 22, C.y + 16);
      g.stroke();
      // snow drifts on the rim
      g.fillStyle = 'rgba(250,252,255,.85)';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        const p = proj(POND.cx + Math.cos(a) * POND.rx * 0.95, POND.cy + Math.sin(a) * POND.ry * 0.95);
        g.beginPath();
        g.ellipse(p.x, p.y, 7 + hash(i, 53) * 5, 2.6, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.save();
      pondPoly(g, 1);
      g.clip();
      const wg = g.createRadialGradient(C.x, C.y, 3, C.x, C.y, TW * 1.15);
      wg.addColorStop(0, '#2e5d7d');
      wg.addColorStop(0.55, '#3f7796');
      wg.addColorStop(1, '#7fb8c9');
      g.fillStyle = wg;
      g.fillRect(C.x - TW * 1.4, C.y - TH * 2.4, TW * 2.8, TH * 4.8);
      // inner-bank AO: the lip casts onto the water
      g.strokeStyle = 'rgba(18,38,52,.4)';
      g.lineWidth = 5;
      pondPoly(g, 1.02);
      g.stroke();
      g.restore();
    }
    // reeds & cattails on the far (north) bank, overlapping the waterline
    if (!winter) {
      for (const [ci, ca] of [[0, -1.95], [1, -1.35], [2, -0.55]]) {
        const p = proj(POND.cx + Math.cos(ca) * POND.rx * 1.02, POND.cy + Math.sin(ca) * POND.ry * 1.02);
        for (let i = 0; i < 6; i++) {
          const bx = p.x + (hash(ci * 9 + i, 57) - 0.5) * 14;
          const by = p.y + (hash(ci * 5, i * 3 + 59) - 0.5) * 5;
          const hgt = 12 + hash(ci + i, 61) * 9;
          const lean = (hash(i, ci + 63) - 0.5) * 5;
          g.strokeStyle = hsl(95, 30, 26 + (i % 3) * 7);
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(bx, by);
          g.quadraticCurveTo(bx + lean * 0.4, by - hgt * 0.6, bx + lean, by - hgt);
          g.stroke();
          if (i % 2 === 0) { // cattail head
            g.fillStyle = hsl(24, 45, 30);
            g.beginPath();
            g.ellipse(bx + lean * 0.9, by - hgt + 2.5, 1.6, 4, lean * 0.02, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }
  }

  /* ---------------- worn path network (baked into the ground layer) --------
     One main lane from the south map edge to the home field, plus a lane from
     the field centroid to each production building's door. Regenerated when a
     building is placed/sold or a parcel unlocks; painted as layered blob
     strokes with wheel ruts and pebbles. */
  const paths = { blobs: [], ruts: [], gates: [], sig: null };

  function pathSig(state) {
    let s = state.unlockedParcels.join(',') + '#';
    for (const b of state.buildings) if (b) s += b.type + b.x + ',' + b.y + ';';
    return s;
  }

  function addLane(pts) { // sample a polyline (tile coords) into blobs + ruts
    // cumulative arc walk with gentle deterministic wobble
    const samples = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(2, Math.round(len / 0.09));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const gx = lerp(a.x, b.x, t) + Math.sin((i + t) * 4.2 + pts[0].x) * 0.045;
        const gy = lerp(a.y, b.y, t) + Math.sin((i + t) * 3.1 + pts[0].y) * 0.035;
        samples.push(proj(gx, gy));
      }
    }
    samples.push(proj(pts[pts.length - 1].x, pts[pts.length - 1].y));
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      paths.blobs.push({ x: s.x + (hash(i, 71) - 0.5) * 3, y: s.y + (hash(i, 73) - 0.5) * 1.6, j: hash(i * 3, 77) });
    }
    // wheel ruts: two offset polylines (perpendicular offset in screen space)
    for (const off of [-4.6, 4.6]) {
      const rut = [];
      for (let i = 0; i < samples.length; i++) {
        const p0 = samples[Math.max(0, i - 1)], p1 = samples[Math.min(samples.length - 1, i + 1)];
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const dl = Math.hypot(dx, dy) || 1;
        rut.push({ x: samples[i].x - dy / dl * off, y: samples[i].y + dx / dl * off * 0.6 });
      }
      paths.ruts.push(rut);
    }
    return pts;
  }

  function segGate(a, b, state) { // fence-edge crossings of one lane segment
    for (const pi of state.unlockedParcels) {
      const p = D.PARCELS[pi];
      const edges = [
        { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y, horiz: true },
        { x0: p.x, y0: p.y + p.h, x1: p.x + p.w, y1: p.y + p.h, horiz: true },
        { x0: p.x, y0: p.y, x1: p.x, y1: p.y + p.h, horiz: false },
        { x0: p.x + p.w, y0: p.y, x1: p.x + p.w, y1: p.y + p.h, horiz: false },
      ];
      for (const e of edges) {
        if (e.horiz) {
          if ((a.y - e.y0) * (b.y - e.y0) < 0) {
            const t = (e.y0 - a.y) / (b.y - a.y);
            const x = a.x + (b.x - a.x) * t;
            if (x > e.x0 - 0.01 && x < e.x1 + 0.01) paths.gates.push({ x, y: e.y0, horiz: true });
          }
        } else {
          if ((a.x - e.x0) * (b.x - e.x0) < 0) {
            const t = (e.x0 - a.x) / (b.x - a.x);
            const y = a.y + (b.y - a.y) * t;
            if (y > e.y0 - 0.01 && y < e.y1 + 0.01) paths.gates.push({ x: e.x0, y, horiz: false });
          }
        }
      }
    }
  }

  /* ---- lane ↔ building avoidance: lanes must never draw beneath a building.
     Straight segments are kept; any segment that would cross a footprint is
     re-routed with a tiny A* over the tile grid, then string-pulled back to a
     few waypoints. The lane's own target building is exempt (it ends at its
     door). All deterministic — same farm, same lanes. */
  const LANE_MARGIN = 0.32; // keeps blob spread + wobble clear of the walls

  function laneBlockRects(state, skip) {
    const rects = [];
    for (const b of state.buildings) {
      if (!b) continue;
      const def = D.BUILDINGS[b.type];
      // the lane's own target keeps its body blocked but a slim south margin,
      // so the lane can end at its door without cutting under the walls
      const sm = b === skip ? 0.12 : LANE_MARGIN;
      rects.push({ x0: b.x - LANE_MARGIN, y0: b.y - LANE_MARGIN, x1: b.x + def.w + LANE_MARGIN, y1: b.y + def.h + sm });
    }
    return rects;
  }
  const laneHit = (rects, x, y) => {
    for (const r of rects) if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return true;
    return false;
  };
  function segClear(rects, a, b) {
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.15));
    for (let i = 0; i <= n; i++) {
      if (laneHit(rects, lerp(a.x, b.x, i / n), lerp(a.y, b.y, i / n))) return false;
    }
    return true;
  }
  // nearest clear point for an endpoint that got built over
  function openPoint(rects, p) {
    if (!laneHit(rects, p.x, p.y)) return p;
    let best = null, bd = 1e9;
    for (let y = 0; y < D.WORLD_H; y++)
      for (let x = 0; x < D.WORLD_W; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        if (laneHit(rects, cx, cy)) continue;
        const d = (cx - p.x) * (cx - p.x) + (cy - p.y) * (cy - p.y);
        if (d < bd) { bd = d; best = { x: cx, y: cy }; }
      }
    return best || p;
  }
  // A* over tile centers (8-dir, no corner cutting) → string-pulled waypoints
  function gridRoute(rects, A, B) {
    const W = D.WORLD_W, H = D.WORLD_H, N = W * H;
    const bl = new Uint8Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (laneHit(rects, x + 0.5, y + 0.5)) bl[y * W + x] = 1;
    const clampT = (v, m) => Math.min(m - 1, Math.max(0, Math.floor(v)));
    const s = clampT(A.y, H) * W + clampT(A.x, W);
    const g0 = clampT(B.y, H) * W + clampT(B.x, W);
    bl[s] = 0; bl[g0] = 0;
    const gs = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const open = [s];
    gs[s] = 0;
    const hx = i => {
      const dx = Math.abs((i % W) - (g0 % W)), dy = Math.abs(((i / W) | 0) - ((g0 / W) | 0));
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    let found = false;
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (gs[open[i]] + hx(open[i]) < gs[open[bi]] + hx(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (cur === g0) { found = true; break; }
      const cx = cur % W, cy = (cur / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (bl[ni]) continue;
          if (dx && dy && (bl[cy * W + nx] || bl[ny * W + cx])) continue; // no corner cuts
          const ng = gs[cur] + (dx && dy ? 1.414 : 1);
          if (ng < gs[ni] - 1e-6) {
            gs[ni] = ng;
            came[ni] = cur;
            if (!open.includes(ni)) open.push(ni);
          }
        }
    }
    if (!found) return null;
    const centers = [];
    for (let i = g0; i !== -1; i = came[i]) centers.unshift({ x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 });
    // string-pull [A, …centers…, B] down to the few corners that matter
    const list = [A, ...centers, B];
    const out = [];
    let i = 0;
    while (i < list.length - 1) {
      let j = list.length - 1;
      while (j > i + 1 && !segClear(rects, list[i], list[j])) j--;
      out.push(list[j]);
      i = j;
    }
    return out; // ends with B
  }
  // rebuild a lane so no segment crosses a building footprint
  function routeLane(state, pts, skip) {
    const rects = laneBlockRects(state, skip);
    if (!rects.length) return pts;
    // drop authored waypoints that got built over; rescue endpoints
    const way = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !laneHit(rects, p.x, p.y));
    way[0] = openPoint(rects, way[0]);
    way[way.length - 1] = openPoint(rects, way[way.length - 1]);
    const out = [way[0]];
    for (let i = 0; i < way.length - 1; i++) {
      const a = out[out.length - 1], b = way[i + 1];
      if (segClear(rects, a, b)) { out.push(b); continue; }
      const detour = gridRoute(rects, a, b);
      if (detour) out.push(...detour);
      else out.push(b); // pathological farm: keep the old behavior
    }
    return out;
  }

  function computePaths(state) {
    paths.blobs.length = 0;
    paths.ruts.length = 0;
    paths.gates.length = 0;
    paths.sig = pathSig(state);
    const F = { x: 10, y: 8.4 }; // home-field hub (parcel 0 center)
    const lanes = [];
    lanes.push(routeLane(state, [{ x: 11.2, y: 14.8 }, { x: 10.6, y: 12.8 }, { x: 10.15, y: 11 }, F], null)); // main lane
    // field → each production building's door (nearest 8 keeps it uncluttered)
    const targets = [];
    for (const b of state.buildings) {
      if (!b) continue;
      const def = D.BUILDINGS[b.type];
      if (def.w < 2 && b.type !== 'well') continue;
      const door = { x: b.x + def.w / 2 - 0.12, y: b.y + def.h + 0.22 };
      targets.push({ b, door, d: Math.hypot(door.x - F.x, door.y - F.y) });
    }
    targets.sort((a, b) => a.d - b.d);
    for (const t of targets.slice(0, 8)) {
      const mid = { // one gentle bend
        x: (F.x + t.door.x) / 2 + (t.door.y - F.y) * 0.12,
        y: (F.y + t.door.y) / 2 - (t.door.x - F.x) * 0.12,
      };
      lanes.push(routeLane(state, [F, mid, t.door], t.b));
    }
    for (const lane of lanes) {
      addLane(lane);
      for (let i = 0; i < lane.length - 1; i++) segGate(lane[i], lane[i + 1], state);
    }
  }

  const PATH_LAYERS = [ // [half-width, color-by-season fn parts]
    { w: 10.5, c: [[26, 34, 27], [214, 12, 56]] }, // dark moist edge (grow / winter)
    { w: 7.2, c: [[28, 38, 36], [216, 10, 64]] },
    { w: 4.0, c: [[33, 40, 45], [218, 8, 72]] },   // dry light center
  ];
  // part: undefined = everything; 0..2 = one blob layer; 3 = ruts/stones/creep.
  // f0/f1 slice the blob list so the progressive rebake can spread lane
  // painting across frames in small raster units.
  function paintPaths(g, state, part, f0, f1) {
    if (!paths.blobs.length) return;
    const nB = paths.blobs.length;
    const b0 = f0 === undefined ? 0 : Math.floor(f0 * nB);
    const b1 = f1 === undefined ? nB : Math.floor(f1 * nB);
    const wi = state.season === 3 ? 1 : 0;
    const l0 = part === undefined ? 0 : Math.min(part, 3);
    const l1 = part === undefined ? 2 : Math.min(part, 2);
    for (let li = l0; li <= l1 && li < 3; li++) {
      const L = PATH_LAYERS[li];
      const c = L.c[wi];
      g.fillStyle = hsl(c[0], c[1], c[2], li === 0 ? 0.72 : 1);
      for (let bi = b0; bi < b1; bi++) {
        const b = paths.blobs[bi];
        const r = L.w * (0.88 + b.j * 0.24);
        g.beginPath();
        g.ellipse(b.x, b.y, r, r * 0.52, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (part !== undefined && part !== 3) return;
    // wheel ruts — quadratic-smoothed through sample midpoints (the raw
    // polyline faceted at DPR 3); drawn with the first extras slice
    if (b0 === 0) {
      g.strokeStyle = wi ? 'rgba(90,100,120,.4)' : 'rgba(74,52,30,.42)';
      g.lineWidth = 2.2;
      g.lineCap = 'round';
      for (const rut of paths.ruts) {
        if (rut.length < 3) continue;
        g.beginPath();
        g.moveTo(rut[0].x, rut[0].y);
        for (let i = 1; i < rut.length - 1; i++) {
          g.quadraticCurveTo(rut[i].x, rut[i].y, (rut[i].x + rut[i + 1].x) / 2, (rut[i].y + rut[i + 1].y) / 2);
        }
        g.lineTo(rut[rut.length - 1].x, rut[rut.length - 1].y);
        g.stroke();
      }
    }
    // pebbles + small stones along the shoulders
    for (let i = Math.ceil(b0 / 5) * 5; i < b1; i += 5) {
      const b = paths.blobs[i];
      const a = hash(i, 83) * Math.PI * 2, r = 9 + hash(i, 87) * 6;
      g.fillStyle = i % 15 ? '#96897b' : '#b3a48f';
      const pw = 1.2 + hash(i, 89) * 1.5, ph = 0.9 + hash(i, 91);
      const px = b.x + Math.cos(a) * r, py = b.y + Math.sin(a) * r * 0.5;
      g.beginPath();
      g.ellipse(px, py, pw, ph, a, 0, Math.PI * 2);
      g.fill();
      if (hash(i, 93) > 0.6) { // lit top facet on the bigger stones
        g.fillStyle = 'rgba(225,218,200,.5)';
        g.beginPath();
        g.ellipse(px - pw * 0.2, py - ph * 0.35, pw * 0.5, ph * 0.4, a, 0, Math.PI * 2);
        g.fill();
      }
    }
    // parcel-boundary wear: grass creeping in over the lane's shoulders
    if (!wi) {
      const pal = PALETTES[state.season];
      g.fillStyle = hsl(pal.grass[0] + 4, pal.grass[1] + 4, pal.grass[2] - 6, 0.85);
      for (let i = Math.ceil(Math.max(0, b0 - 2) / 6) * 6 + 2; i < b1; i += 6) {
        const b = paths.blobs[i];
        const side = i % 12 < 6 ? -1 : 1;
        const rr3 = 2.6 + hash(i, 101) * 3.4;
        g.beginPath();
        g.ellipse(b.x + side * (9.5 + hash(i, 103) * 3), b.y + (hash(i, 105) - 0.5) * 4,
          rr3, rr3 * 0.48, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function groundGeom() {
    const W = D.WORLD_W, H = D.WORLD_H;
    ground.minX = proj(0, H).x - TW / 2 - 56;
    ground.minY = -118;
    ground.w = (proj(W, 0).x + TW / 2 + 56) - ground.minX;
    ground.h = (proj(W, H).y + TH / 2 + 44) - ground.minY;
  }

  // full synchronous bake — used once at boot, before anything is on screen
  function bakeGround(state, pal) {
    const W = D.WORLD_W, H = D.WORLD_H;
    groundGeom();
    if (!ground.c) {
      ground.c = document.createElement('canvas');
      ground.c.width = Math.ceil(ground.w * GS);
      ground.c.height = Math.ceil(ground.h * GS);
      ground.g = ground.c.getContext('2d');
    }
    const g = ground.g;
    g.setTransform(GS, 0, 0, GS, -ground.minX * GS, -ground.minY * GS);
    g.clearRect(ground.minX, ground.minY, ground.w, ground.h);
    paintBackdrop(g, pal);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        paintGroundTile(g, state, x, y, pal);
        ground.sig[y * W + x] = tileSig(state, x, y);
      }
    paintPaths(g, state);
    // raised beds sit proud of the lane — repaint soil over the path layer
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (state.tiles[y][x].k === 'soil') paintSoilTile(g, state, x, y, pal);
    paintPond(g, state, pal);
    paintCliff(g, pal);
    ground.season = state.season;
    refreshMip();
  }

  /* ---- progressive rebake: season flips & lane changes ----
     A full ground bake at the DPR-3 supersample costs several hundred ms of
     software raster — far past the frame budget. Instead the new ground is
     painted into a spare buffer a few milliseconds per frame while the old
     one stays on screen (the season crossfade holds at full alpha meanwhile),
     then buffers swap and the old store is released. Nothing pops. */
  const bakeJob = { active: false, c: null, g: null, unit: 0, units: null };
  function startGroundBake() {
    groundGeom();
    if (!bakeJob.c) bakeJob.c = document.createElement('canvas');
    bakeJob.c.width = Math.ceil(ground.w * GS);   // (re)alloc — also clears
    bakeJob.c.height = Math.ceil(ground.h * GS);
    bakeJob.g = bakeJob.c.getContext('2d');
    bakeJob.g.setTransform(GS, 0, 0, GS, -ground.minX * GS, -ground.minY * GS);
    const W = D.WORLD_W, H = D.WORLD_H;
    const g = bakeJob.g;
    // small fixed raster units — canvas paint is deferred, so a time budget
    // would only measure command *recording*; ~2 units/frame keeps the real
    // raster cost of each frame bounded
    const U = bakeJob.units = [];
    U.push((s2, p2) => paintBackdrop(g, p2));
    for (let y = 0; y < H; y++) {
      for (const [x0, x1] of [[0, W >> 1], [W >> 1, W]]) {
        U.push((s2, p2) => {
          for (let x = x0; x < x1; x++) {
            paintGroundTile(g, s2, x, y, p2);
            ground.sig[y * W + x] = tileSig(s2, x, y);
          }
        });
      }
    }
    for (let li = 0; li < 3; li++)
      for (let k = 0; k < 3; k++)
        U.push((s2) => paintPaths(g, s2, li, k / 3, (k + 1) / 3));
    U.push((s2) => paintPaths(g, s2, 3, 0, 0.5));
    U.push((s2) => paintPaths(g, s2, 3, 0.5, 1));
    for (const [y0, y1] of [[0, H >> 1], [H >> 1, H]]) {
      U.push((s2, p2) => {
        for (let y = y0; y < y1; y++)
          for (let x = 0; x < W; x++)
            if (s2.tiles[y][x].k === 'soil') paintSoilTile(g, s2, x, y, p2);
      });
    }
    U.push((s2, p2) => paintPond(g, s2, p2));
    U.push((s2, p2) => {
      paintCliff(g, p2);
      const old = ground.c;
      ground.c = bakeJob.c; ground.g = bakeJob.g; // swap buffers
      old.width = 1; old.height = 1;              // release the old store now
      bakeJob.c = old; bakeJob.g = null;
      ground.season = s2.season;
    });
    // mips refresh in 4 horizontal strips (reads the swapped-in ground.c)
    for (let k = 0; k < 4; k++) {
      U.push(() => {
        const hh = Math.ceil(ground.c.height / 4 / 4) * 4; // mip2-aligned strips
        refreshMip(0, k * hh, ground.c.width, Math.min(hh, ground.c.height - k * hh));
      });
    }
    bakeJob.unit = 0;
    bakeJob.active = true;
  }
  function stepGroundBake(state, pal) {
    for (let i = 0; i < 2 && bakeJob.active; i++) {
      bakeJob.units[bakeJob.unit++](state, pal);
      if (bakeJob.unit >= bakeJob.units.length) {
        bakeJob.active = false;
        bakeJob.units = null;
      }
    }
  }

  function repaintTile(state, pal, x, y) {
    const g = ground.g;
    const c = proj(x + 0.5, y + 0.5);
    g.setTransform(GS, 0, 0, GS, -ground.minX * GS, -ground.minY * GS);
    g.save();
    g.beginPath();
    g.rect(c.x - TW / 2 - 1, c.y - TH / 2 - 1, TW + 2, TH + 10);
    g.clip();
    g.clearRect(c.x - TW / 2 - 1, c.y - TH / 2 - 1, TW + 2, TH + 10);
    // repaint the 3×3 neighborhood clipped to this tile's box (tufts/beds overlap)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= D.WORLD_W || ny >= D.WORLD_H) continue;
        paintGroundTile(g, state, nx, ny, pal);
      }
    // re-lay paths / pond over the repainted patch (both live in this layer)
    paintPaths(g, state);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= D.WORLD_W || ny >= D.WORLD_H) continue;
        if (state.tiles[ny][nx].k === 'soil') paintSoilTile(g, state, nx, ny, pal);
      }
    if (nearPond(x, y)) paintPond(g, state, pal);
    g.restore();
    ground.sig[y * D.WORLD_W + x] = tileSig(state, x, y);
    // keep the far-zoom mip in sync with the repainted patch
    refreshMip(
      (c.x - TW / 2 - 2 - ground.minX) * GS, (c.y - TH / 2 - 2 - ground.minY) * GS,
      (TW + 4) * GS, (TH + 12) * GS
    );
  }

  function updateGround(state, pal) {
    if (!ground.c) { // boot: synchronous first bake, nothing on screen yet
      if (paths.sig !== pathSig(state)) computePaths(state);
      bakeGround(state, pal);
      return;
    }
    if (bakeJob.active) { stepGroundBake(state, pal); return; } // rebake in flight
    if (paths.sig !== pathSig(state)) { // building placed/sold or land bought
      computePaths(state);
      startGroundBake();
      stepGroundBake(state, pal);
      return;
    }
    if (ground.season !== state.season) {
      startGroundBake();
      stepGroundBake(state, pal);
      return;
    }
    const W = D.WORLD_W, H = D.WORLD_H;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (ground.sig[y * W + x] !== tileSig(state, x, y)) repaintTile(state, pal, x, y);
      }
  }

  // ---------------- sky backdrop (screen space, cached half-res canvas) ----------------
  let skyKey = '', skyCanvas = null;
  function mix3(day, dus, nit, kDusk, kDark) {
    const kd = Math.max(0, 1 - kDusk - kDark);
    return [
      day[0] * kd + dus[0] * kDusk + nit[0] * kDark,
      day[1] * kd + dus[1] * kDusk + nit[1] * kDark,
      day[2] * kd + dus[2] * kDusk + nit[2] * kDark,
    ];
  }
  const SKY_DUSK = [[326, 62, 62], [26, 82, 66], [32, 45, 46]];
  const SKY_NIGHT = [[231, 46, 27], [229, 38, 34], [227, 30, 28]];
  const SKY_STOPS = [0, 0.42, 0.85];
  function drawSky(state) {
    const key = state.season + ':' + Math.round(state.t * 96) + ':' + vw + 'x' + vh;
    if (key !== skyKey) { // re-render the small sky canvas only when light changes
      skyKey = key;
      const sw = Math.max(1, vw * dpr / 4 | 0), sh = Math.max(1, vh * dpr / 4 | 0);
      if (!skyCanvas || skyCanvas.width !== sw || skyCanvas.height !== sh) {
        skyCanvas = document.createElement('canvas');
        skyCanvas.width = sw; skyCanvas.height = sh;
      }
      const sx = skyCanvas.getContext('2d');
      const pal = PALETTES[state.season];
      const grad = sx.createLinearGradient(0, 0, 0, sh);
      for (let i = 0; i < 3; i++) {
        const c = mix3(pal.skyDay[i], SKY_DUSK[i], SKY_NIGHT[i], SUN.dusk, SUN.dark);
        grad.addColorStop(SKY_STOPS[i], hsl(c[0], c[1], c[2]));
      }
      sx.fillStyle = grad;
      sx.fillRect(0, 0, sw, sh);
    }
    if (SUN.dark > 0.98) { // full night: a flat deep blue is indistinguishable & cheaper
      ctx.fillStyle = hsl(SKY_NIGHT[1][0], SKY_NIGHT[1][1], SKY_NIGHT[1][2]);
      ctx.fillRect(0, 0, vw, vh);
      return;
    }
    ctx.imageSmoothingEnabled = false; // vertical gradient survives nearest upscale
    ctx.drawImage(skyCanvas, 0, 0, vw, vh);
    ctx.imageSmoothingEnabled = true;
  }

  // ---------------- pond: dynamic pass (bank/water/reeds live in the bake) ----------------
  const ripples = [{ age: 9, x: 0, y: 0 }, { age: 9, x: 0, y: 0 }, { age: 9, x: 0, y: 0 }];
  let rippleTimer = 0;
  // pond duck FSM: paddle (drift on rails) ↔ dabble (tip forward, head under)
  let duckPhase = 0, duckMode = 'paddle', duckTimer = 6;
  function drawPond(state, dt) {
    if (state.season === 3) return; // frozen solid — all baked
    duckTimer -= dt;
    if (duckTimer <= 0) {
      if (duckMode === 'paddle') { duckMode = 'dabble'; duckTimer = 1.3; }
      else { duckMode = 'paddle'; duckTimer = 5 + Math.random() * 4; }
    }
    const dabble = duckMode === 'dabble';
    duckPhase += dt * (dabble ? 0 : 1); // hold position while dabbling
    const duckX = POND.cx + Math.sin(duckPhase * 0.32) * 0.34;
    const duckY = POND.cy + Math.cos(duckPhase * 0.24) * 0.62;
    const dp = proj(duckX, duckY);
    // expanding ripple rings shed by the duck (faster while paddling/dabbling)
    rippleTimer -= dt;
    if (rippleTimer <= 0) {
      rippleTimer = dabble ? 0.4 : 1.1;
      let oldest = ripples[0];
      for (const r of ripples) if (r.age > oldest.age) oldest = r;
      oldest.age = 0; oldest.x = dp.x; oldest.y = dp.y + 3;
    }
    for (const r of ripples) {
      r.age += dt;
      if (r.age > 1.8) continue;
      const k = r.age / 1.8;
      const rr4 = 4 + k * 22;
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `rgba(225,245,255,${0.42 * (1 - k)})`;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rr4, rr4 * 0.48, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (k > 0.22) { // finer trailing ring behind the crest
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = `rgba(225,245,255,${0.22 * (1 - k)})`;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, rr4 * 0.72, rr4 * 0.72 * 0.48, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // two drifting lily pads with a blossom
    for (let i = 0; i < 2; i++) {
      const lp = proj(POND.cx + (i ? 0.42 : -0.3), POND.cy + (i ? 0.55 : -0.4));
      const drift = Math.sin(time * 0.5 + i * 2.6) * 2;
      ctx.fillStyle = i ? '#3f7a48' : '#4a8a52';
      ctx.beginPath();
      ctx.ellipse(lp.x + drift, lp.y, 7.5, 4, 0, 0.28, Math.PI * 2 - 0.28); // notched pad
      ctx.lineTo(lp.x + drift, lp.y);
      ctx.fill();
      if (i === 0) {
        ctx.fillStyle = '#e98cae';
        ctx.beginPath(); ctx.arc(lp.x + drift - 2, lp.y - 2.5, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f7d774';
        ctx.beginPath(); ctx.arc(lp.x + drift - 2, lp.y - 2.5, 1, 0, Math.PI * 2); ctx.fill();
      }
    }
    // sun sparkles near the lit rim (skipped in rain/snow)
    if (state.weather !== 'rain' && state.weather !== 'storm' && SUN.elev > 0.08) {
      const sc = proj(POND.cx - 0.28, POND.cy - 0.32);
      for (let i = 0; i < 5; i++) {
        const tw = Math.sin(time * 3 + i * 1.9);
        if (tw < 0.1) continue;
        ctx.fillStyle = `rgba(255,252,235,${tw * 0.55 * SUN.elev})`;
        const px = sc.x + (hash(i, 95) - 0.5) * 40, py = sc.y + (hash(i * 3, 97) - 0.5) * 20;
        ctx.fillRect(px, py, 4.5, 1.3);
      }
    }
    if (dabble) { // bottoms up: tip forward, head under the waterline
      ctx.save();
      ctx.translate(dp.x, dp.y + 1);
      if (Math.cos(duckPhase * 0.32) < 0) ctx.scale(-1, 1);
      ctx.rotate(0.9 + Math.sin(time * 7) * 0.06);
      ctx.translate(-dp.x, -(dp.y + 1));
      drawAnimalSprite('duck', dp.x, dp.y - 1, 0, 99, false, posePool0);
      ctx.restore();
      // waterline masks the submerged head
      ctx.fillStyle = 'rgba(88,148,178,.85)';
      ctx.beginPath(); ctx.ellipse(dp.x + 4, dp.y + 3, 9, 3.4, 0, 0, PI2); ctx.fill();
    } else {
      drawAnimalSprite('duck', dp.x, dp.y - 2, time, 99, Math.cos(duckPhase * 0.32) < 0);
    }
  }
  const posePool0 = { moving: false, peck: 0, sleep: false, hop: 0 };

  // ---------------- parcels: fences, wild locked land, survey rope, signs ----------------
  function inUnlockedParcel(state, x, y) {
    const pi = Game.parcelAt(x, y);
    return pi >= 0 && state.unlockedParcels.includes(pi);
  }

  function gateAt(mx, my, horiz) { // is a path gate near this rail segment midpoint?
    for (const gt of paths.gates) {
      if (gt.horiz !== horiz) continue;
      if (horiz ? (Math.abs(gt.y - my) < 0.05 && Math.abs(gt.x - mx) < 0.62)
                : (Math.abs(gt.x - mx) < 0.05 && Math.abs(gt.y - my) < 0.62)) return true;
    }
    return false;
  }

  function fencePost(gx, gy, big, sc) {
    const pt = proj(gx, gy);
    const j = (hash(Math.round(gx * 7), Math.round(gy * 11)) - 0.5) * 2;
    let hgt = (big ? 18 : 16) + j;
    if (sc !== undefined) hgt *= sc;   // fence-builds-itself: post scales in
    const w = big ? 3.4 : 3;
    ctx.fillStyle = 'rgba(30,26,50,.28)';
    ctx.beginPath(); ctx.ellipse(pt.x + 1, pt.y + 1, 4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hsl(25, 40, 25);                       // shaded side
    ctx.fillRect(pt.x - w + j * 0.4, pt.y - hgt, w * 2, hgt + 1);
    ctx.fillStyle = hsl(29, 42, 37);                       // lit side
    ctx.fillRect(pt.x - w + j * 0.4, pt.y - hgt, w, hgt + 1);
    ctx.fillStyle = hsl(33, 46, 46);                       // beveled cap
    ctx.beginPath();
    ctx.moveTo(pt.x - w - 0.6 + j * 0.4, pt.y - hgt);
    ctx.lineTo(pt.x + j * 0.4, pt.y - hgt - 2.6);
    ctx.lineTo(pt.x + w + 0.6 + j * 0.4, pt.y - hgt);
    ctx.closePath();
    ctx.fill();
  }

  function fenceRail(ax, ay, bx, by, snow) {
    const a = proj(ax, ay), b = proj(bx, by);
    const sag = 1.6;
    for (const h of [12, 6]) {
      ctx.strokeStyle = hsl(27, 40, 31);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - h);
      ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - h + sag, b.x, b.y - h);
      ctx.stroke();
      ctx.strokeStyle = snow && h === 12 ? 'rgba(250,252,255,.85)' : 'rgba(255,235,200,.28)';
      ctx.lineWidth = snow && h === 12 ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - h - 1.4);
      ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 - h + sag - 1.4, b.x, b.y - h - 1.4);
      ctx.stroke();
    }
  }

  function drawGate(ax, ay, bx, by) { // gap in the fence: 2 stout posts + brace
    const a = proj(ax, ay), b = proj(bx, by);
    ctx.strokeStyle = hsl(29, 42, 36);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 3);
    ctx.lineTo(b.x, b.y - 12);
    ctx.stroke();
    fencePost(ax, ay, true);
    fencePost(bx, by, true);
  }

  // one side of a parcel's fence: unit segments with gate gaps; segments that
  // border another unlocked parcel are interior and skipped entirely.
  // `age`/`base` clip the draw so a fresh parcel's fence builds itself
  // post-by-post (~90ms per post) with a dust tick as each one lands.
  function fenceSide(state, x0, y0, dx, dy, len, outDx, outDy, snow, age, base, pi) {
    for (let i = 0; i < len; i++) {
      const ax = x0 + dx * i, ay = y0 + dy * i;
      const mx = ax + dx * 0.5, my = ay + dy * 0.5;
      // outside neighbor tile of this segment
      const ox = Math.floor(mx + outDx * 0.5 - (dx ? 0 : 0.5)), oy = Math.floor(my + outDy * 0.5 - (dy ? 0 : 0.5));
      if (inUnlockedParcel(state, ox, oy)) continue;      // interior — no fence
      let sc;
      if (age !== Infinity) {
        const t = age - (base + i) * 0.09;
        if (t <= 0) continue;                             // this post hasn't been built yet
        sc = Ease.backOut(Math.min(1, t / 0.16));
        const dk = pi * 100 + base + i;
        if (t < 0.1 && !postDust.has(dk)) {               // hammer-blow dust tick
          postDust.add(dk);
          const pp = proj(ax, ay);
          burstDust(pp.x, pp.y, 2, 3);
        }
        if (gateAt(mx, my, dy === 0)) { drawGate(ax, ay, ax + dx, ay + dy); continue; }
        const rk = Math.min(1, Math.max(0, (t - 0.08) / 0.12)); // rail draws on toward the next post
        if (rk > 0) fenceRail(ax, ay, ax + (dx * rk), ay + (dy * rk), snow);
        fencePost(ax, ay, false, sc);
        if (rk >= 1) fencePost(ax + dx, ay + dy, false, Ease.backOut(Math.min(1, (age - (base + i + 1) * 0.09) / 0.16 + 0.4)));
        continue;
      }
      if (gateAt(mx, my, dy === 0)) { drawGate(ax, ay, ax + dx, ay + dy); continue; }
      fenceRail(ax, ay, ax + dx, ay + dy, snow);
      fencePost(ax, ay);
      fencePost(ax + dx, ay + dy);
    }
  }

  function drawFenceBack(state, p, snow, i) { // N + W edges (behind entities)
    const age = fenceAge(i);
    fenceSide(state, p.x, p.y, 1, 0, p.w, 0, -1, snow, age, 0, i);
    fenceSide(state, p.x, p.y, 0, 1, p.h, -1, 0, snow, age, p.w, i);
  }
  function drawFenceFront(state, i) {      // S + E edges (depth-sorted entity)
    const p = D.PARCELS[i];
    const snow = Game.state && Game.state.season === 3;
    const age = fenceAge(i);
    fenceSide(state, p.x, p.y + p.h, 1, 0, p.w, 0, 1, snow, age, p.w + p.h, i);
    fenceSide(state, p.x + p.w, p.y, 0, 1, p.h, 1, 0, snow, age, p.w + p.h + p.w, i);
  }

  // locked parcels: stake-and-rope survey boundary over the wilder meadow
  function drawSurvey(p) {
    const corners = [
      { gx: p.x, gy: p.y }, { gx: p.x + p.w, gy: p.y },
      { gx: p.x + p.w, gy: p.y + p.h }, { gx: p.x, gy: p.y + p.h },
    ];
    for (let e = 0; e < 4; e++) {
      const A = corners[e], B = corners[(e + 1) % 4];
      const len = Math.abs(B.gx - A.gx) + Math.abs(B.gy - A.gy);
      const nStakes = Math.max(2, Math.round(len / 1.5));
      let prev = null;
      for (let i = 0; i <= nStakes; i++) {
        const t = i / nStakes;
        const gx = lerp(A.gx, B.gx, t), gy = lerp(A.gy, B.gy, t);
        const pt = proj(gx, gy);
        const j = (hash(Math.round(gx * 13), Math.round(gy * 17)) - 0.5) * 2;
        if (prev) { // sagging rope between stakes
          ctx.strokeStyle = 'rgba(240,228,196,.62)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y - 9);
          ctx.quadraticCurveTo((prev.x + pt.x) / 2, (prev.y + pt.y) / 2 - 6.4, pt.x, pt.y - 9);
          ctx.stroke();
        }
        ctx.fillStyle = hsl(28, 34, 30);                  // short wooden stake
        ctx.fillRect(pt.x - 1.6 + j, pt.y - 10, 3.2, 11);
        ctx.fillStyle = hsl(33, 40, 44);
        ctx.fillRect(pt.x - 1.6 + j, pt.y - 10, 1.5, 11);
        prev = pt;
      }
    }
  }

  function drawParcels(state) {
    const snow = state.season === 3;
    for (let i = 0; i < D.PARCELS.length; i++) {
      const p = D.PARCELS[i];
      if (state.unlockedParcels.includes(i)) drawFenceBack(state, p, snow, i);
      else drawSurvey(p);
    }
  }

  // FOR SALE sign at the parcel's front corner post: smaller, tilted, with a
  // hanging price tag. Briefly replaced by a popping SOLD! board on purchase.
  function signAnchor(index) {
    const p = D.PARCELS[index];
    return proj(p.x + p.w - 0.45, p.y + p.h - 0.32);
  }

  function drawSign(state, index, fall, alpha) {
    const c = signAnchor(index);
    const p = D.PARCELS[index];
    shadow(c.x, c.y + 3, 15, 5);
    ctx.save();
    ctx.translate(c.x, c.y);
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.rotate(-0.045 + (fall || 0) * 1.42); // purchase: the sign keels over
    // two support posts
    ctx.fillStyle = hsl(26, 38, 26);
    ctx.fillRect(-16, -34, 4, 35);
    ctx.fillRect(12, -32, 4, 33);
    ctx.fillStyle = hsl(30, 42, 36);
    ctx.fillRect(-16, -34, 1.8, 35);
    ctx.fillRect(12, -32, 1.8, 33);
    // board
    ctx.fillStyle = hsl(35, 46, 62);
    rr(-31, -48, 62, 22, 4);
    ctx.fill();
    ctx.strokeStyle = hsl(26, 40, 30);
    ctx.lineWidth = 2;
    rr(-31, -48, 62, 22, 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(60,40,18,.8)'; // nail heads
    ctx.beginPath();
    ctx.arc(-14, -44, 1.1, 0, Math.PI * 2);
    ctx.arc(14, -43, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a3214';
    ctx.font = '900 11px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FOR SALE', 0, -37);
    // hanging price tag on a string
    ctx.strokeStyle = 'rgba(90,70,40,.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(6, -26);
    ctx.lineTo(8, -19);
    ctx.stroke();
    ctx.fillStyle = '#f4ecd8';
    ctx.save();
    ctx.translate(8, -19);
    ctx.rotate(0.10 + Math.sin(time * 1.7 + index) * 0.05);
    rr(-16, 0, 32, 13, 2.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,50,.6)';
    ctx.lineWidth = 1.2;
    rr(-16, 0, 32, 13, 2.5);
    ctx.stroke();
    ctx.fillStyle = '#8a5a1a';
    ctx.font = '800 9px Nunito, system-ui, sans-serif';
    ctx.fillText(D.$(p.cost), 0, 7);
    ctx.restore();
    ctx.restore();
  }

  // ownership ceremony: camera glide → fence builds itself post-by-post →
  // the FOR SALE sign keels over in a dust puff → SOLD! board pops
  let knownParcels = null;
  const soldFx = [];
  const signFalls = [];
  const unlockAnim = new Map();   // parcel index → unlock time (clips fence draw)
  const postDust = new Set();     // once-only dust tick per revealed post
  function trackParcelSales(state) {
    if (!knownParcels) { knownParcels = state.unlockedParcels.slice(); return; }
    if (state.unlockedParcels.length !== knownParcels.length) {
      for (const i of state.unlockedParcels) {
        if (!knownParcels.includes(i)) {
          soldFx.push({ i, age: 0 });
          const p = D.PARCELS[i];
          addBurst(p.x + p.w - 0.45, p.y + p.h - 0.32, '#f2c23e');
          unlockAnim.set(i, time + 0.45);            // fence starts after the camera lands
          signFalls.push({ i, age: 0, dusted: false });
          const c = proj(p.x + p.w / 2, p.y + p.h / 2);
          Tween.to(cam, { x: c.x, y: c.y }, 0.65, Ease.cubicOut);
          for (let k = 0; k < 4; k++) after(0.55 + k * 0.3, () => sfx('hammer'));
        }
      }
      knownParcels = state.unlockedParcels.slice();
    }
  }
  // seconds since this parcel's fence started building (Infinity = long done)
  function fenceAge(i) {
    const t0 = unlockAnim.get(i);
    if (t0 === undefined) return Infinity;
    const age = time - t0;
    if (age > 3.5) { unlockAnim.delete(i); postDust.clear(); return Infinity; }
    return age;
  }
  function drawSoldFx(dt) {
    for (let i = signFalls.length - 1; i >= 0; i--) {
      const f = signFalls[i];
      f.age += dt;
      if (f.age > 1.4) { signFalls.splice(i, 1); continue; }
      const fall = Ease.quadIn(Math.min(1, f.age / 0.5));
      if (fall >= 1 && !f.dusted) {
        f.dusted = true;
        const c = signAnchor(f.i);
        burstDust(c.x + 20, c.y, 4, 5);
      }
      const alpha = f.age > 1.0 ? (1.4 - f.age) / 0.4 : 1;
      drawSign(Game.state, f.i, fall, alpha);
    }
    for (let i = soldFx.length - 1; i >= 0; i--) {
      const f = soldFx[i];
      f.age += dt;
      if (f.age > 1.5) { soldFx.splice(i, 1); continue; }
      const c = signAnchor(f.i);
      const pop = f.age < 0.25 ? 0.5 + (f.age / 0.25) * 0.62 : 1.12 - Math.min(0.12, (f.age - 0.25) * 0.6);
      const alpha = f.age > 1.1 ? (1.5 - f.age) / 0.4 : 1;
      ctx.save();
      ctx.translate(c.x, c.y - 40);
      ctx.scale(pop, pop);
      ctx.rotate(-0.05);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#d9543a';
      rr(-30, -12, 60, 24, 5);
      ctx.fill();
      ctx.strokeStyle = '#f4ecd8';
      ctx.lineWidth = 2.4;
      rr(-27, -9, 54, 18, 3);
      ctx.stroke();
      ctx.fillStyle = '#fff6e8';
      ctx.font = '900 13px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SOLD!', 0, 0.5);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // ---------------- crops (billboarded at tile center) ----------------
  // Staged silhouettes: every template reads as 4 distinct plants —
  // sprout (soil mound + seed leaves) → young → full → mature (fruit with
  // shaded gradient + sparkle). Wilt is a color story: ochre leaves + droop.
  const PI2 = Math.PI * 2;
  const WILT_LEAF = 'hsl(48,44%,45%)', WILT_DARK = 'hsl(43,40%,36%)', WILT_LITE = 'hsl(52,48%,55%)';

  function tleaf(x0, y0, x1, y1, w) { // filled tapered leaf, base → tip
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * w, ny = dx / len * w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx + nx, my + ny, x1, y1);
    ctx.quadraticCurveTo(mx - nx * 0.55, my - ny * 0.55, x0, y0);
    ctx.fill();
  }

  // fake radial shading + specular sparkle on a fruit (no gradients, no clips)
  function fruitShine(x, y, r, ry) {
    ctx.fillStyle = 'rgba(45,16,10,.22)';
    ctx.beginPath(); ctx.ellipse(x + r * 0.18, y + ry * 0.24, r * 0.74, ry * 0.68, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,230,.30)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.34, y - ry * 0.36, r * 0.42, ry * 0.34, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; // crisp primary specular
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - ry * 0.32, Math.max(0.9, r * 0.13), 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; // tiny trailing glint
    ctx.beginPath(); ctx.arc(x - r * 0.12, y - ry * 0.46, Math.max(0.6, r * 0.07), 0, PI2); ctx.fill();
  }

  // quantized growth: pop the plant when its render stage steps up (§1.4)
  let ripeChimeAt = -9;
  function stagePop(x, y, st, def) {
    const f = cropFx(x, y);
    f.busy = time + 0.6;
    Tween.kill(f);
    if (st === 3) {                                  // maturity moment — the bigger beat
      f.sc = 0.62;
      f.glowK = 0;
      Tween.to(f, { sc: 1 }, 0.45, Ease.elasticOut);
      Tween.to(f, { glowK: 1 }, 0.32, Ease.quadOut);
      if (time - ripeChimeAt > 0.8) { ripeChimeAt = time; sfx('ripe'); }
    } else {
      f.sc = 1.22;
      Tween.to(f, { sc: 1 }, 0.35, Ease.backOut);
    }
    if (cam.z >= 0.55) {
      const c = proj(x + 0.5, y + 0.5);
      const col = st === 3 ? def.color : rampHex(def.leaf, 0.8);
      for (let i = 0; i < 3; i++) {
        spawnP(c.x + (Math.random() - 0.5) * 8, c.y - 8, {
          shape: 'dot', col, size: 1.7, g: 260,
          vx: (Math.random() - 0.5) * 46, vy: -46 - Math.random() * 36, life: 0.35,
        });
      }
    }
  }

  function drawCrop(x, y, crop) {
    const def = D.CROPS[crop.id];
    const c = proj(x + 0.5, y + 0.5);
    const fx2 = cropFxMap.get(x + '|' + y);
    if (fx2 && fx2.hide) return;                     // a harvest ghost owns this tile right now
    const cx = c.x, cy = c.y + 2 + (fx2 ? fx2.dip : 0);
    const s = crop.prog;

    // fertilizer flecks (animated — kept out of the baked ground layer)
    if (crop.fert && !crop.dead) {
      ctx.fillStyle = 'rgba(230,196,92,.85)';
      for (let i = 0; i < 3; i++) {
        const a = time * 1.5 + i * 2.1 + x * 3 + y;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 16, cy + Math.sin(a * 1.3) * 8 - 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (crop.dead) { // grey husk (kept — readability cue)
      ctx.strokeStyle = '#7a6b52';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 6);
      ctx.quadraticCurveTo(cx + 4, cy - 8, cx + 11, cy - 4);
      ctx.stroke();
      ctx.fillStyle = '#93846a';
      ctx.beginPath(); ctx.ellipse(cx + 12, cy - 4, 4.5, 2.6, 0.5, 0, Math.PI * 2); ctx.fill();
      return;
    }

    const wilt = crop.wilt || 0;
    const storm = stormK > 0;
    let sway = Math.sin(time * 2.2 + x * 1.7 + y) * 0.05;
    // storm gust waves travel diagonally across the field via the (x+y) phase
    if (storm) sway += Math.sin(time * 3 - (x + y) * 0.6) * 0.22 * stormK;
    const droop = wilt > 0.25 ? wilt * 0.45 : 0; // wilting plants lean over
    const mature = s >= 1;
    const bounce = mature && !droop ? Math.sin(time * 3 + x + y * 2.3) * 1.2 : 0;

    // stage buckets: 0 sprout / 1 young / 2 full / 3 mature — plus a gentle
    // within-stage scale so growth still feels continuous
    const wilted = wilt > 0.25;
    let st, wt;
    if (s >= 1) { st = 3; wt = 1; }
    else if (s < 0.25) { st = 0; wt = s / 0.25; }
    else if (s < 0.6) { st = 1; wt = (s - 0.25) / 0.35; }
    else { st = 2; wt = (s - 0.6) / 0.4; }

    // render-side stage tracking → pop on step-up, elastic beat at maturity
    const skey = x + '|' + y;
    const prev = stageMap.get(skey);
    if (prev === undefined) stageMap.set(skey, st);
    else if (st !== prev) {
      stageMap.set(skey, st);
      if (st > prev && !wilted && !crop.dead) stagePop(x, y, st, def);
    }
    const f = cropFxMap.get(skey);
    const fsc = f ? f.sc * f.pulse : 1;

    // small contact shadow glues the plant to the soil
    shadow(cx, cy + 5, (8 + s * 5) * Math.min(1, fsc), 3.2);

    ctx.save();
    const lowLod = cam.z < 0.45;                     // LOD: skip sway transforms far out
    ctx.translate(cx, cy + (lowLod ? 0 : bounce));
    if (!lowLod) ctx.rotate(sway * Math.min(1, s * 2) + droop);

    if (mature && !droop && (crop.rot || 0) < 0.4) { // baked glow sprite for ready crops
      const gk = f && f.glowK >= 0 ? f.glowK : 1;    // maturity moment fades the glow IN
      if (gk > 0.02) {
        if (gk < 1) ctx.globalAlpha = gk;
        ctx.drawImage(sprites.glow, -24, -32, 48, 48);
        ctx.globalAlpha = 1;
      }
    }

    const kk = (0.78 + 0.22 * wt) * fsc;
    ctx.scale(kk, kk);
    drawTemplate(def, st, wilted);
    ctx.restore();

    // rot: flies circle a spoiling crop
    if (mature && (crop.rot || 0) > 0.35) {
      ctx.fillStyle = 'rgba(40,35,25,.8)';
      for (let i = 0; i < 3; i++) {
        const a = time * 4 + i * 2.1;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 12, cy - 14 + Math.sin(a * 1.7) * 7, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // thirsty indicator (bigger, with a soft dark halo so it reads anywhere)
    if (!mature && crop.water <= 0.35 && Math.sin(time * 5) > -0.2) {
      const dx = cx + 15, dy = cy - 22;
      ctx.fillStyle = 'rgba(20,16,40,.30)';
      ctx.beginPath(); ctx.arc(dx, dy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = wilt > 0.4 ? '#d3542f' : '#3d8fc4';
      ctx.beginPath();
      ctx.moveTo(dx, dy - 7);
      ctx.quadraticCurveTo(dx + 7, dy + 2.5, dx, dy + 7);
      ctx.quadraticCurveTo(dx - 7, dy + 2.5, dx, dy - 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.arc(dx - 1.8, dy, 1.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawTemplate(def, st, wilted) {
    const leaf = wilted ? WILT_LEAF : def.leaf;
    const dark = wilted ? WILT_DARK : rampHex(def.leaf, -0.9);
    const lite = wilted ? WILT_LITE : rampHex(def.leaf, 0.7);
    const col = def.color;
    ctx.lineCap = 'round';

    if (st === 0) { // sprout: fresh soil mound + seed leaves (shared)
      ctx.fillStyle = 'rgba(58,36,18,.85)';
      ctx.beginPath(); ctx.ellipse(0, 5.5, 7.5, 3.2, 0, 0, PI2); ctx.fill();
      ctx.fillStyle = 'rgba(150,108,64,.45)';
      ctx.beginPath(); ctx.ellipse(-1.5, 4.6, 4.5, 1.8, 0, 0, PI2); ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(0, -1); ctx.stroke();
      ctx.fillStyle = leaf;
      tleaf(0, -1, -6.5, -5.5, 2.6);
      tleaf(0, -1, 6.5, -5.5, 2.6);
      ctx.fillStyle = lite;
      tleaf(0, -1, -4, -8, 1.6);
      return;
    }

    switch (def.tpl) {
      case 'root': { // rosette of tapered leaves; mature = root shoulder heaves out
        if (st === 3) {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(0, 3.5, 8.5, 7, 0, 0, PI2); ctx.fill();
          fruitShine(0, 3.5, 8.5, 7);
        }
        const n = st === 1 ? 3 : 5;
        for (let i = 0; i < n; i++) {
          const a = n === 1 ? 0 : (i - (n - 1) / 2) / ((n - 1) / 2);
          const L = (st === 1 ? 13 : 19) + (i % 2) * 3;
          ctx.fillStyle = i % 2 ? dark : leaf;
          tleaf(a * 2, 2, a * (st === 1 ? 8 : 13), 2 - L, st === 1 ? 2.4 : 3.2);
        }
        ctx.fillStyle = lite;
        tleaf(0, 2, -3, st === 1 ? -12 : -17, 1.8);
        break;
      }
      case 'grain': {
        if (def.tall) { // corn: stalk with arcing blades, then cobs
          const hgt = st === 1 ? 14 : st === 2 ? 26 : 32;
          ctx.strokeStyle = st === 3 ? rampHex(def.leaf, -0.4) : dark;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, 8 - hgt); ctx.stroke();
          const blades = st === 1 ? 2 : 4;
          for (let i = 0; i < blades; i++) {
            const side = i % 2 ? 1 : -1;
            const by = 6 - (i + 1) * hgt / (blades + 1);
            ctx.fillStyle = i % 2 ? leaf : lite;
            tleaf(0, by, side * (st === 1 ? 9 : 13), by - 6, 2.6);
          }
          if (st === 3) { // two cobs with silk
            for (const side of [-1, 1]) {
              const cy2 = -hgt * 0.45 + side * 3;
              ctx.fillStyle = col;
              ctx.beginPath(); ctx.ellipse(side * 5, cy2, 3.6, 8, side * 0.25, 0, PI2); ctx.fill();
              fruitShine(side * 5, cy2, 3.6, 8);
              ctx.fillStyle = leaf; // husk leaf hugging the cob
              tleaf(side * 3, cy2 + 7, side * 8, cy2 - 4, 2);
              ctx.strokeStyle = '#e8c46a'; // silk
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(side * 5, cy2 - 8);
              ctx.quadraticCurveTo(side * 8, cy2 - 11, side * 7, cy2 - 13);
              ctx.stroke();
            }
          }
        } else { // wheat / rice: blades then golden heads
          const hgt = st === 1 ? 12 : st === 2 ? 20 : 24;
          const n = st === 1 ? 4 : 6;
          const gold = st === 3 && !wilted;
          for (let i = 0; i < n; i++) {
            const a = (i - (n - 1) / 2) / ((n - 1) / 2);
            ctx.strokeStyle = gold ? (i % 2 ? '#b2872a' : '#c8a02e') : (i % 2 ? dark : leaf);
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(a * 5, 8);
            ctx.quadraticCurveTo(a * 7, 8 - hgt * 0.55, a * 9, 8 - hgt);
            ctx.stroke();
            if (st >= 2 && i % 2 === 0) { // heads: green forming → golden ripe
              ctx.fillStyle = st === 3 ? col : rampHex(def.leaf, 0.4);
              for (let k = 0; k < (st === 3 ? 4 : 2); k++) {
                ctx.beginPath();
                ctx.ellipse(a * 9 + (k % 2 ? 2 : -2) * 0.9, 8 - hgt + k * 3.4, 2.4, 3.6, a * 0.2, 0, PI2);
                ctx.fill();
              }
              if (st === 3) { // awns
                ctx.strokeStyle = 'rgba(200,160,60,.8)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(a * 9, 8 - hgt - 2);
                ctx.lineTo(a * 9 + a * 3, 8 - hgt - 8);
                ctx.stroke();
              }
            }
          }
          if (st === 3) { ctx.fillStyle = 'rgba(255,250,220,.7)'; ctx.fillRect(-1, 8 - hgt - 3, 1.6, 1.6); }
        }
        break;
      }
      case 'bush': { // berry bush: blobs → white blossoms → shiny berries
        ctx.fillStyle = dark;
        if (st === 1) {
          ctx.beginPath(); ctx.arc(-5, -3, 6.5, 0, PI2); ctx.arc(5, -2, 6, 0, PI2); ctx.fill();
          ctx.fillStyle = leaf;
          ctx.beginPath(); ctx.arc(0, -7, 6.5, 0, PI2); ctx.fill();
          ctx.fillStyle = lite;
          ctx.beginPath(); ctx.arc(-2.5, -9, 3.4, 0, PI2); ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(-8, -3, 9, 0, PI2); ctx.arc(8, -3, 9, 0, PI2); ctx.arc(0, 1, 9.5, 0, PI2);
          ctx.fill();
          ctx.fillStyle = leaf;
          ctx.beginPath();
          ctx.arc(-6, -8, 8, 0, PI2); ctx.arc(6, -8, 7.5, 0, PI2); ctx.arc(0, -3, 9, 0, PI2);
          ctx.fill();
          ctx.fillStyle = lite;
          ctx.beginPath(); ctx.arc(-4, -12, 5, 0, PI2); ctx.arc(3, -11, 3.6, 0, PI2); ctx.fill();
          if (st === 2 && !wilted) { // blossoms promise the fruit
            for (const [bx, by] of [[-8, -5], [6, -9], [1, -1]]) {
              ctx.fillStyle = '#fff5f8';
              for (let k = 0; k < 5; k++) {
                const a = (k / 5) * PI2;
                ctx.beginPath(); ctx.ellipse(bx + Math.cos(a) * 2.1, by + Math.sin(a) * 2.1, 1.3, 0.9, a, 0, PI2); ctx.fill();
              }
              ctx.fillStyle = '#f2c23e';
              ctx.beginPath(); ctx.arc(bx, by, 1, 0, PI2); ctx.fill();
            }
          }
          if (st === 3) {
            ctx.fillStyle = col;
            for (const [fx2, fy2] of [[-8, -2], [7, -6], [1, 2], [-3, -11]]) {
              ctx.beginPath(); ctx.arc(fx2, fy2, 4.4, 0, PI2); ctx.fill();
              fruitShine(fx2, fy2, 4.4, 4.4);
              ctx.fillStyle = col;
            }
          }
        }
        break;
      }
      case 'leafy': { // rosette → dense wrap → big shiny head
        const n = st === 1 ? 5 : 8;
        const R = st === 1 ? 6 : 9.5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * PI2 + 0.4;
          ctx.fillStyle = i % 2 ? dark : leaf;
          tleaf(Math.cos(a) * 2, Math.sin(a) * 1.4 - 3, Math.cos(a) * (R + 5), Math.sin(a) * (R * 0.7 + 3) - 5, 3.4);
        }
        if (st >= 2) {
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * PI2 + 1.1;
            ctx.fillStyle = lite;
            tleaf(Math.cos(a) * 1.5, Math.sin(a) * 1 - 4, Math.cos(a) * 7, Math.sin(a) * 4.6 - 6, 2.6);
          }
        }
        if (st === 3) {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(0, -5, 8.5, 0, PI2); ctx.fill();
          ctx.strokeStyle = rampHex(def.color, -0.8); // wrap-leaf seams
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(-2.5, -5, 6.5, Math.PI * 0.7, Math.PI * 1.55); ctx.stroke();
          ctx.beginPath(); ctx.arc(3, -5, 6, Math.PI * 1.5, Math.PI * 2.2); ctx.stroke();
          fruitShine(0, -5, 8.5, 8.5);
        }
        break;
      }
      case 'vine': { // creeping vine → tendrils + flower → big striped fruit
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        if (st === 1) {
          ctx.moveTo(-8, 6);
          ctx.quadraticCurveTo(0, 0, 8, 3);
        } else {
          ctx.moveTo(-15, 6);
          ctx.quadraticCurveTo(-4, -6, 6, -2);
          ctx.quadraticCurveTo(12, 0, 15, 5);
        }
        ctx.stroke();
        const leaves = st === 1 ? [[-6, 1], [5, -1]] : [[-12, -1], [-3, -6], [7, -5], [13, 1]];
        for (let i = 0; i < leaves.length; i++) {
          ctx.fillStyle = i % 2 ? leaf : lite;
          ctx.beginPath();
          ctx.ellipse(leaves[i][0], leaves[i][1], 5.5, 3.6, leaves[i][0] * 0.05, 0, PI2);
          ctx.fill();
          ctx.fillStyle = dark; // leaf vein notch
          ctx.beginPath();
          ctx.ellipse(leaves[i][0], leaves[i][1] + 1.2, 1.6, 0.8, 0, 0, PI2);
          ctx.fill();
        }
        if (st === 2) { // curling tendril + a yellow bloom
          ctx.strokeStyle = leaf;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(10, -7, 3, Math.PI * 0.3, Math.PI * 1.9); ctx.stroke();
          if (!wilted) {
            ctx.fillStyle = '#f2c23e';
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * PI2;
              ctx.beginPath(); ctx.ellipse(-8 + Math.cos(a) * 2.4, -8 + Math.sin(a) * 2.4, 1.5, 1, a, 0, PI2); ctx.fill();
            }
          }
        }
        if (st === 3) {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(2, 2, 11.5, 9.5, 0, 0, PI2); ctx.fill();
          ctx.strokeStyle = def.stripe || 'rgba(0,0,0,.15)';
          ctx.lineWidth = 2.2;
          for (const a of [-6, 0, 6]) {
            ctx.beginPath();
            ctx.moveTo(a + 2, -6);
            ctx.quadraticCurveTo(a * 1.3 + 2, 2, a + 2, 10);
            ctx.stroke();
          }
          fruitShine(2, 2, 11.5, 9.5);
          ctx.fillStyle = '#44591c'; // stem nub
          rr(0, -9.5, 4, 4.5, 1.5);
          ctx.fill();
        }
        break;
      }
      case 'trellis': { // wooden frame; vine climbs it stage by stage
        ctx.strokeStyle = hsl(28, 40, 35);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-12, 10); ctx.lineTo(-12, -18);
        ctx.moveTo(12, 10); ctx.lineTo(12, -18);
        ctx.moveTo(-15, -14); ctx.lineTo(15, -14);
        ctx.stroke();
        ctx.strokeStyle = leaf;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        if (st === 1) ctx.quadraticCurveTo(-4, 2, -7, -4);
        else {
          ctx.quadraticCurveTo(-10, -4, -12, -14);
          ctx.moveTo(0, 10);
          ctx.quadraticCurveTo(10, -4, 12, -14);
        }
        ctx.stroke();
        const lvs = st === 1 ? [[-4, 0], [-7, -5]]
          : [[-9, -8], [9, -8], [-4, -14], [5, -15], [0, -2], [-11, -2], [11, -3]];
        for (let i = 0; i < lvs.length; i++) {
          ctx.fillStyle = i % 3 === 2 ? lite : i % 2 ? dark : leaf;
          ctx.beginPath();
          ctx.ellipse(lvs[i][0], lvs[i][1], 4.8, 3.4, lvs[i][0] * 0.05, 0, PI2);
          ctx.fill();
        }
        if (st === 3) { // hanging grape clusters
          for (const [gx, gy] of [[-8, -6], [8, -7]]) {
            ctx.fillStyle = rampHex(def.color, -0.6);
            for (let i = 0; i < 6; i++) {
              ctx.beginPath();
              ctx.arc(gx + (i % 2) * 4 - 2, gy + Math.floor(i / 2) * 3.8, 2.7, 0, PI2);
              ctx.fill();
            }
            ctx.fillStyle = col;
            for (let i = 0; i < 4; i++) {
              ctx.beginPath();
              ctx.arc(gx + (i % 2) * 3.4 - 1.6, gy + Math.floor(i / 2) * 3.4 + 0.6, 2.5, 0, PI2);
              ctx.fill();
            }
            ctx.fillStyle = 'rgba(255,255,255,.65)';
            ctx.beginPath(); ctx.arc(gx - 1.5, gy + 0.5, 1.1, 0, PI2); ctx.fill();
          }
        }
        break;
      }
      case 'flower': { // stem+leaves → swelling bud → full sun-face
        const hgt = st === 1 ? 10 : st === 2 ? 15 : 17;
        ctx.strokeStyle = dark;
        ctx.lineWidth = 3.2;
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -hgt + 2); ctx.stroke();
        ctx.fillStyle = leaf;
        tleaf(0, 3, -8, -2, 3);
        tleaf(0, 0, 8, -6, 3);
        if (st >= 2) { ctx.fillStyle = lite; tleaf(0, 5, -6, 3, 2.2); }
        if (st === 1) {
          ctx.fillStyle = lite;
          ctx.beginPath(); ctx.arc(0, -hgt, 3.4, 0, PI2); ctx.fill();
        } else if (st === 2) { // fat bud with a hint of petal color
          ctx.fillStyle = leaf;
          ctx.beginPath(); ctx.ellipse(0, -hgt - 1, 4.6, 5.4, 0, 0, PI2); ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(0, -hgt - 4, 2.6, 2.2, 0, 0, PI2); ctx.fill();
          ctx.fillStyle = lite;
          tleaf(-2, -hgt + 3, -5, -hgt - 3, 1.6);
          tleaf(2, -hgt + 3, 5, -hgt - 3, 1.6);
        } else {
          const hy = -hgt - 3;
          ctx.fillStyle = rampHex(def.color, -0.7); // back petal ring
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * PI2 + 0.31;
            ctx.beginPath(); ctx.ellipse(Math.cos(a) * 9.4, hy + Math.sin(a) * 9.4, 5.2, 2.7, a, 0, PI2); ctx.fill();
          }
          ctx.fillStyle = col;
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * PI2;
            ctx.beginPath(); ctx.ellipse(Math.cos(a) * 8.6, hy + Math.sin(a) * 8.6, 5.4, 2.9, a, 0, PI2); ctx.fill();
          }
          ctx.fillStyle = '#5a4020';
          ctx.beginPath(); ctx.arc(0, hy, 5.6, 0, PI2); ctx.fill();
          ctx.fillStyle = 'rgba(140,95,40,.9)'; // seed spiral dots
          for (let i = 0; i < 6; i++) {
            const a = i * 2.4;
            ctx.beginPath(); ctx.arc(Math.cos(a) * (1 + i * 0.5), hy + Math.sin(a) * (1 + i * 0.5) * 0.8, 0.8, 0, PI2); ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,.6)';
          ctx.beginPath(); ctx.arc(-2, hy - 2, 1.2, 0, PI2); ctx.fill();
        }
        break;
      }
    }
  }

  /* ================= BUILDINGS: baked material pass =================
     Each building type is drawn ONCE per (season, lod) into the atlas with
     the full proto-barn treatment — stone foundation, plank/siding/timber
     walls with per-board jitter + grime & eave gradients, shingled hip roofs
     with ridge caps + fascia + eave shadow, recessed framed doors, mullioned
     windows — then blitted per frame. Night window glow, chimney smoke and
     the mill rotor stay immediate-mode on top of the bake. */
  const BVIS = {
    coop:     { mat: 'plank', baseH: 36, roofH: 20, door: 'x',
                props: [['nest', -0.22, 1.05], ['nest', -0.22, 1.55], ['feed', 0.85, 2.3]] },
    barn:     { mat: 'plank', baseH: 46, roofH: 28, door: 'x', vane: true, loft: true, straw: true,
                props: [['hay', 2.32, 0.8], ['hay', 2.26, 1.42], ['trough', 0.55, 2.32]] },
    mill:     { mat: 'timber', baseH: 50, roofH: 22, door: 'panel', rotor: true,
                props: [['sack', -0.22, 1.25], ['sack', -0.16, 1.62], ['crate', 2.24, 1.5]] },
    bakery:   { mat: 'siding', baseH: 40, roofH: 22, door: 'panel', chimney: true, awning: ['#c25b4a', '#f0e6d2'],
                props: [['sack', 2.24, 1.35], ['crate', -0.22, 1.5]] },
    creamery: { mat: 'siding', baseH: 40, roofH: 22, door: 'panel', chimney: true,
                props: [['churn', 2.22, 1.25], ['churn', 2.32, 1.62], ['crate', 0.5, 2.32]] },
    press:    { mat: 'plank', baseH: 40, roofH: 22, door: 'panel', awning: ['#5a7a4a', '#f0e6d2'],
                props: [['barrel', 2.24, 1.3], ['barrel', 2.32, 1.75], ['crate', -0.25, 1.55]] },
    loom:     { mat: 'timber', baseH: 42, roofH: 24, door: 'panel',
                props: [['spool', 2.22, 1.3], ['spool', 2.3, 1.7], ['crate', 0.5, 2.32]] },
    greenhouse: { baseH: 34, roofH: 22, props: [['crate', 2.2, 1.5]] },
  };

  function wallPoint(A, B, u, v) { // point along wall edge A->B at height v
    return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u - v };
  }

  // one wall face with a material read (bake-time only)
  function paintWallFace(g, A, B, v0, v1, base, lit, mat, trim, seed, lod) {
    const step = lit ? 0.6 : -1.3;
    const quad = [up(A, v0), up(B, v0), up(B, v1), up(A, v1)];
    polyOn(g, quad);
    g.fillStyle = rampHex(base, step);
    g.fill();
    if (!lit) { g.fillStyle = 'rgba(50,58,132,.13)'; polyOn(g, quad); g.fill(); }
    if (!lod) return; // LOD0: flat two-tone walls
    g.save();
    polyOn(g, quad);
    g.clip();
    if (mat === 'plank') { // vertical boards: per-board value jitter + seams
      const n = lod >= 2 ? 12 : 9; // finer boards at the 3x bake
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n;
        const j = (hash(seed + i, seed * 3 + 11) - 0.5) * 0.5;
        g.fillStyle = rampHex(base, step + j);
        polyOn(g, [wallPoint(A, B, u0, v0), wallPoint(A, B, u1, v0), wallPoint(A, B, u1, v1), wallPoint(A, B, u0, v1)]);
        g.fill();
        g.strokeStyle = 'rgba(40,18,8,.32)';
        g.lineWidth = 0.9;
        const p1 = wallPoint(A, B, u1, v0), p2 = wallPoint(A, B, u1, v1);
        g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
        if (lod >= 2) { // wood grain: a couple of short strokes + a knot per board
          g.strokeStyle = 'rgba(40,18,8,.14)';
          g.lineWidth = 0.7;
          for (let k = 0; k < 2; k++) {
            const gu = u0 + (0.25 + 0.4 * hash(seed + i * 3, k * 7 + 19)) * (u1 - u0);
            const gv0 = v0 + (0.12 + 0.3 * hash(seed + k, i * 5 + 23)) * (v1 - v0);
            const ga = wallPoint(A, B, gu, gv0), gb = wallPoint(A, B, gu, gv0 + (v1 - v0) * 0.28);
            g.beginPath();
            g.moveTo(ga.x, ga.y);
            g.quadraticCurveTo(ga.x + 0.8, (ga.y + gb.y) / 2, gb.x, gb.y);
            g.stroke();
          }
          if (hash(seed * 5 + i, 29) > 0.72) {
            const ku = u0 + 0.5 * (u1 - u0), kv = v0 + (0.3 + hash(seed + i, 31) * 0.4) * (v1 - v0);
            const kp = wallPoint(A, B, ku, kv);
            g.fillStyle = 'rgba(40,18,8,.22)';
            g.beginPath(); g.ellipse(kp.x, kp.y, 0.9, 1.3, 0, 0, Math.PI * 2); g.fill();
          }
        }
      }
    } else if (mat === 'siding') { // horizontal clapboard courses
      const n = lod >= 2 ? 10 : 7;
      for (let i = 0; i < n; i++) {
        const va = v0 + (i / n) * (v1 - v0), vb = v0 + ((i + 1) / n) * (v1 - v0);
        const j = (hash(seed + i * 5, seed + 7) - 0.5) * 0.34;
        g.fillStyle = rampHex(base, step + j);
        polyOn(g, [wallPoint(A, B, 0, va), wallPoint(A, B, 1, va), wallPoint(A, B, 1, vb), wallPoint(A, B, 0, vb)]);
        g.fill();
        const p1 = wallPoint(A, B, 0, vb), p2 = wallPoint(A, B, 1, vb);
        g.strokeStyle = 'rgba(50,32,14,.28)';
        g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
        g.strokeStyle = 'rgba(255,244,220,.14)';
        g.beginPath(); g.moveTo(p1.x, p1.y + 1.2); g.lineTo(p2.x, p2.y + 1.2); g.stroke();
      }
    } else if (mat === 'timber') { // plaster + dark half-timber frame
      g.fillStyle = lit ? hsl(40, 26, 74) : hsl(228, 14, 52);
      polyOn(g, quad);
      g.fill();
      g.strokeStyle = rampHex(base, -1.8);
      g.lineWidth = 3;
      for (const u of [0.08, 0.5, 0.92]) {
        const p1 = wallPoint(A, B, u, v0), p2 = wallPoint(A, B, u, v1);
        g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
      }
      const d1 = wallPoint(A, B, 0.08, v0), d2 = wallPoint(A, B, 0.5, v1 - 4);
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(d1.x, d1.y); g.lineTo(d2.x, d2.y); g.stroke();
      const t1 = wallPoint(A, B, 0, v1 - 3), t2 = wallPoint(A, B, 1, v1 - 3);
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(t1.x, t1.y); g.lineTo(t2.x, t2.y); g.stroke();
    }
    // 5-step ramp completion: core shadow just past the corner terminator on
    // the shaded face + a cool reflected-light lift low on it; the lit face
    // gets a warm highlight wash toward its sunward corner (art-director ramp:
    // deep shadow / shadow / base / light / highlight)
    if (!lit) {
      const core = g.createLinearGradient(A.x, 0, B.x, 0);
      core.addColorStop(0, 'rgba(38,28,86,.20)');
      core.addColorStop(0.45, 'rgba(38,28,86,0)');
      polyOn(g, quad);
      g.fillStyle = core;
      g.fill();
      const refl = g.createLinearGradient(0, A.y - v0 - (v1 - v0) * 0.05, 0, A.y - v0 - (v1 - v0) * 0.5);
      refl.addColorStop(0, 'rgba(150,180,225,.11)'); // sky/grass bounce
      refl.addColorStop(1, 'rgba(150,180,225,0)');
      polyOn(g, quad);
      g.fillStyle = refl;
      g.fill();
    } else {
      const hi = g.createLinearGradient(A.x, 0, B.x, 0);
      hi.addColorStop(0, 'rgba(255,240,196,.13)');
      hi.addColorStop(0.6, 'rgba(255,240,196,0)');
      polyOn(g, quad);
      g.fillStyle = hi;
      g.fill();
    }
    // grime rising from the ground + eave light at the top
    const gg = g.createLinearGradient(0, A.y - v0, 0, A.y - v1);
    gg.addColorStop(0, 'rgba(30,16,8,.26)');
    gg.addColorStop(0.35, 'rgba(30,16,8,0)');
    gg.addColorStop(0.85, 'rgba(255,235,200,0)');
    gg.addColorStop(1, lit ? 'rgba(255,235,200,.12)' : 'rgba(255,235,200,.05)');
    polyOn(g, quad);
    g.fillStyle = gg;
    g.fill();
    g.restore();
  }

  // one hip-roof face with shingle courses (bake-time)
  function paintRoofFace(g, P, Q, apex, tone, lod, snow) {
    polyOn(g, [P, Q, apex]);
    g.fillStyle = tone;
    g.fill();
    if (!lod) {
      if (snow) {
        polyOn(g, [lpt(P, apex, 0.3), lpt(Q, apex, 0.3), apex]);
        g.fillStyle = 'rgba(248,251,255,.9)';
        g.fill();
      }
      return;
    }
    g.save();
    polyOn(g, [P, Q, apex]);
    g.clip();
    const rows = lod >= 2 ? 9 : 6; // finer shingle courses at the 3x bake
    for (let i = 1; i <= rows; i++) {
      const t0 = i / rows;
      const p1 = lpt(P, apex, t0), q1 = lpt(Q, apex, t0);
      g.strokeStyle = 'rgba(30,14,6,.30)';
      g.lineWidth = lod >= 2 ? 1.2 : 1.5;
      g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(q1.x, q1.y); g.stroke();
      g.strokeStyle = 'rgba(255,225,190,.10)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(p1.x, p1.y - 1.1); g.lineTo(q1.x, q1.y - 1.1); g.stroke();
      // staggered shingle ticks
      g.strokeStyle = 'rgba(30,14,6,.18)';
      g.lineWidth = lod >= 2 ? 0.7 : 0.9;
      const segs = (lod >= 2 ? 12 : 8) - i;
      const t1 = (i - 1) / rows;
      for (let k = 1; k < segs; k++) {
        const u = (k + (i % 2 ? 0.5 : 0)) / segs;
        const a1 = lpt(p1, q1, u);
        const a0 = lpt(lpt(P, apex, t1), lpt(Q, apex, t1), u);
        g.beginPath(); g.moveTo(a1.x, a1.y); g.lineTo(a0.x, a0.y); g.stroke();
      }
      if (lod >= 2) { // per-course weathering: a few darker shingle tabs
        const t1m = (t0 + t1) / 2;
        for (let k = 0; k < 3; k++) {
          const hj = hash(i * 7 + k, 151);
          if (hj < 0.55) continue;
          const u = hash(k * 5 + i, 153);
          const s0 = lpt(lpt(P, apex, t1m), lpt(Q, apex, t1m), u);
          g.fillStyle = hj > 0.8 ? 'rgba(255,230,200,.09)' : 'rgba(30,14,6,.12)';
          g.fillRect(s0.x - 2.4, s0.y - 1.6, 4.8, 3.2);
        }
      }
    }
    // sun gradient down the face
    const fg = g.createLinearGradient(apex.x, apex.y, (P.x + Q.x) / 2, (P.y + Q.y) / 2);
    fg.addColorStop(0, 'rgba(255,235,200,.13)');
    fg.addColorStop(1, 'rgba(20,10,5,.10)');
    polyOn(g, [P, Q, apex]);
    g.fillStyle = fg;
    g.fill();
    if (snow) { // winter: snow blanket sliding down from the ridge
      polyOn(g, [lpt(P, apex, 0.28), lpt(Q, apex, 0.28), apex]);
      g.fillStyle = 'rgba(248,251,255,.92)';
      g.fill();
      g.fillStyle = 'rgba(248,251,255,.75)';
      for (let k = 0; k < 4; k++) {
        const u = 0.15 + k * 0.24;
        const p = lpt(lpt(P, apex, 0.26), lpt(Q, apex, 0.26), u);
        g.beginPath();
        g.ellipse(p.x, p.y + 2, 6 + hash(k, 13) * 4, 3, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  function paintHipRoof(g, x0, y0, x1, y1, baseH, roofH, color, lod, snow, V) {
    const grow = 0.14;
    const N = proj(x0 - grow, y0 - grow), E = proj(x1 + grow, y0 - grow),
          S = proj(x1 + grow, y1 + grow), W = proj(x0 - grow, y1 + grow);
    const apex = up(proj((x0 + x1) / 2, (y0 + y1) / 2), baseH + roofH);
    const bN = up(N, baseH), bE = up(E, baseH), bS = up(S, baseH), bW = up(W, baseH);
    paintRoofFace(g, bN, bE, apex, rampHex(color, 0.9), lod, snow);
    paintRoofFace(g, bW, bN, apex, rampHex(color, 1.05), lod, snow);
    paintRoofFace(g, bW, bS, apex, rampHex(color, 0.35), lod, snow);
    paintRoofFace(g, bS, bE, apex, rampHex(color, -1.4), lod, snow);
    // fascia board along the front eaves
    g.strokeStyle = '#e0d8c4';
    g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(bW.x, bW.y); g.lineTo(bS.x, bS.y); g.lineTo(bE.x, bE.y); g.stroke();
    // ridge caps down the hips
    g.strokeStyle = snow ? 'rgba(250,252,255,.95)' : rampHex(color, 1.5);
    g.lineWidth = 3;
    for (const b of [bW, bS, bE]) {
      g.beginPath(); g.moveTo(apex.x, apex.y); g.lineTo(lerp(apex.x, b.x, 0.97), lerp(apex.y, b.y, 0.97)); g.stroke();
    }
    // cream rim light on the sun-facing ridge
    g.strokeStyle = 'rgba(255,246,200,.5)';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(bW.x, bW.y); g.lineTo(apex.x, apex.y); g.stroke();
    if (V && V.chimney && lod) { // stone chimney on the NE slope
      const ch = lpt(apex, bE, 0.38);
      g.fillStyle = '#8d8878'; g.fillRect(ch.x - 5, ch.y - 16, 10, 15);
      g.fillStyle = '#6f6a5c'; g.fillRect(ch.x, ch.y - 16, 5, 15);
      g.fillStyle = '#5a564a'; g.fillRect(ch.x - 6.5, ch.y - 19.5, 13, 4.5);
      if (snow) { g.fillStyle = 'rgba(250,252,255,.9)'; g.fillRect(ch.x - 6.5, ch.y - 21, 13, 2); }
    }
    if (V && V.vane && lod) { // weathervane rooster at the apex
      g.strokeStyle = '#3c342a';
      g.lineWidth = 1.7;
      g.beginPath(); g.moveTo(apex.x, apex.y); g.lineTo(apex.x, apex.y - 13); g.stroke();
      g.beginPath(); g.moveTo(apex.x - 5.5, apex.y - 9.5); g.lineTo(apex.x + 5.5, apex.y - 9.5); g.stroke();
      g.fillStyle = '#3c342a';
      g.beginPath(); g.ellipse(apex.x + 1, apex.y - 14.5, 3.2, 2, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(apex.x + 3.8, apex.y - 16.4, 1.3, 0, Math.PI * 2); g.fill();
      g.beginPath();
      g.moveTo(apex.x - 1.8, apex.y - 15);
      g.lineTo(apex.x - 4.6, apex.y - 17.8);
      g.lineTo(apex.x - 1.4, apex.y - 13.2);
      g.closePath();
      g.fill();
    }
  }

  // full material-pass building bake (the 2x2 production buildings)
  function paintBarnLike(g, type, lod, season) {
    const def = D.BUILDINGS[type], V = BVIS[type];
    const inset = 0.12;
    const x0 = inset, y0 = inset, x1 = def.w - inset, y1 = def.h - inset;
    const N = proj(x0, y0), E = proj(x1, y0), S = proj(x1, y1), W = proj(x0, y1);
    const baseH = V.baseH, roofH = V.roofH;
    const wall = def.wall || '#b98a5c';
    const trim = '#e8e2d0';
    const snow = season === 3;
    const seed = type.charCodeAt(0) * 7 + type.length;
    const fh = 8;
    // tight AO strip hugging the base (the directional shadow is dynamic)
    g.fillStyle = 'rgba(30,26,50,.30)';
    polyOn(g, [{ x: W.x - 3, y: W.y }, { x: S.x, y: S.y + 3.5 }, { x: E.x + 3, y: E.y }, { x: S.x, y: S.y - 4 }]);
    g.fill();
    // stone foundation course
    g.fillStyle = '#8d8878';
    polyOn(g, [W, S, up(S, fh), up(W, fh)]);
    g.fill();
    g.fillStyle = '#6f6a5c';
    polyOn(g, [S, E, up(E, fh), up(S, fh)]);
    g.fill();
    if (lod) {
      g.strokeStyle = 'rgba(40,36,26,.45)';
      g.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const u = i / 6;
        const p1 = lpt(W, S, u), p2 = lpt(S, E, u);
        g.beginPath(); g.moveTo(p1.x, p1.y - (i % 2 ? fh * 0.55 : fh)); g.lineTo(p1.x, p1.y); g.stroke();
        g.beginPath(); g.moveTo(p2.x, p2.y - (i % 2 ? fh : fh * 0.55)); g.lineTo(p2.x, p2.y); g.stroke();
      }
      g.strokeStyle = 'rgba(255,250,235,.25)';
      g.beginPath(); g.moveTo(W.x, W.y - fh); g.lineTo(S.x, S.y - fh); g.lineTo(E.x, E.y - fh); g.stroke();
    }
    // walls
    paintWallFace(g, W, S, fh, baseH, wall, true, V.mat, trim, seed, lod);
    paintWallFace(g, S, E, fh, baseH, wall, false, V.mat, trim, seed + 3, lod);
    // white corner trim boards
    if (lod && V.mat !== 'timber') {
      g.fillStyle = trim;
      g.fillRect(S.x - 2, S.y - baseH, 4, baseH - fh + 1);
      g.fillStyle = 'rgba(213,207,189,.9)';
      g.fillRect(W.x - 1.6, W.y - baseH, 3.2, baseH - fh + 1);
      g.fillRect(E.x - 1.6, E.y - baseH, 3.2, baseH - fh + 1);
    }
    // recessed door on the SW wall with a white frame
    const d0 = 0.34, d1 = 0.64, dh = Math.min(28, baseH - 12);
    polyOn(g, [wallPoint(W, S, d0, fh), wallPoint(W, S, d1, fh), wallPoint(W, S, d1, fh + dh), wallPoint(W, S, d0, fh + dh)]);
    g.fillStyle = '#3a2214';
    g.fill();
    const i0 = d0 + 0.025, i1 = d1 - 0.025;
    polyOn(g, [wallPoint(W, S, i0, fh), wallPoint(W, S, i1, fh), wallPoint(W, S, i1, fh + dh - 2.5), wallPoint(W, S, i0, fh + dh - 2.5)]);
    g.fillStyle = rampHex(wall, -0.9);
    g.fill();
    if (lod) {
      if (V.door === 'x') { // barn/coop X-brace
        g.strokeStyle = 'rgba(240,225,200,.7)';
        g.lineWidth = 2.2;
        const A1 = wallPoint(W, S, i0, fh + 2), B1 = wallPoint(W, S, i1, fh + 2);
        const A2 = wallPoint(W, S, i0, fh + dh - 4.5), B2 = wallPoint(W, S, i1, fh + dh - 4.5);
        g.beginPath(); g.moveTo(A2.x, A2.y); g.lineTo(B1.x, B1.y); g.moveTo(A1.x, A1.y); g.lineTo(B2.x, B2.y); g.stroke();
      } else { // shop doors: panel lines
        g.strokeStyle = 'rgba(240,225,200,.4)';
        g.lineWidth = 1.2;
        for (const u of [0.4, 0.6]) {
          const p1 = wallPoint(W, S, d0 + (d1 - d0) * u, fh + 1), p2 = wallPoint(W, S, d0 + (d1 - d0) * u, fh + dh - 4);
          g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
        }
      }
      // frame + lintel shadow
      g.strokeStyle = trim;
      g.lineWidth = 2.6;
      polyOn(g, [wallPoint(W, S, d0, fh), wallPoint(W, S, d1, fh), wallPoint(W, S, d1, fh + dh), wallPoint(W, S, d0, fh + dh)]);
      g.stroke();
      g.fillStyle = 'rgba(20,10,5,.35)';
      polyOn(g, [wallPoint(W, S, d0, fh + dh - 3), wallPoint(W, S, d1, fh + dh - 3), wallPoint(W, S, d1, fh + dh), wallPoint(W, S, d0, fh + dh)]);
      g.fill();
      if (V.straw) { // straw spilling from the barn door
        const dm = wallPoint(W, S, (d0 + d1) / 2, fh - 1);
        g.fillStyle = '#d9b23c';
        g.beginPath(); g.ellipse(dm.x, dm.y + 3, 10, 3.6, 0.2, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(120,90,20,.6)';
        g.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          g.beginPath();
          g.moveTo(dm.x - 7 + i * 3, dm.y + 4);
          g.lineTo(dm.x - 7 + i * 3 + Math.cos(hash(i, 71) * Math.PI) * 4, dm.y + 1);
          g.stroke();
        }
      }
    }
    // window on the SE wall: frame + mullions + day glass with reflection
    const w0 = 0.35, w1 = 0.6, wv = baseH * 0.36, wh2 = 13;
    polyOn(g, [wallPoint(S, E, w0, wv), wallPoint(S, E, w1, wv), wallPoint(S, E, w1, wv + wh2), wallPoint(S, E, w0, wv + wh2)]);
    g.fillStyle = '#3a2c18';
    g.fill();
    polyOn(g, [wallPoint(S, E, w0 + 0.015, wv + 1.3), wallPoint(S, E, w1 - 0.015, wv + 1.3), wallPoint(S, E, w1 - 0.015, wv + wh2 - 1.3), wallPoint(S, E, w0 + 0.015, wv + wh2 - 1.3)]);
    g.fillStyle = '#cfe0e8';
    g.fill();
    if (lod) {
      g.fillStyle = 'rgba(255,255,255,.35)'; // diagonal sky reflection
      polyOn(g, [wallPoint(S, E, w0 + 0.02, wv + 2), wallPoint(S, E, w0 + 0.07, wv + 2), wallPoint(S, E, w0 + 0.16, wv + wh2 - 2), wallPoint(S, E, w0 + 0.11, wv + wh2 - 2)]);
      g.fill();
    }
    g.strokeStyle = trim;
    g.lineWidth = 2;
    polyOn(g, [wallPoint(S, E, w0, wv), wallPoint(S, E, w1, wv), wallPoint(S, E, w1, wv + wh2), wallPoint(S, E, w0, wv + wh2)]);
    g.stroke();
    if (lod) {
      g.lineWidth = 1.2;
      const mm = wallPoint(S, E, (w0 + w1) / 2, wv), mm2 = wallPoint(S, E, (w0 + w1) / 2, wv + wh2);
      g.beginPath(); g.moveTo(mm.x, mm.y); g.lineTo(mm2.x, mm2.y); g.stroke();
      const s1 = wallPoint(S, E, w0, wv + wh2 / 2), s2 = wallPoint(S, E, w1, wv + wh2 / 2);
      g.beginPath(); g.moveTo(s1.x, s1.y); g.lineTo(s2.x, s2.y); g.stroke();
      g.fillStyle = '#d5cfbd'; // sill
      polyOn(g, [wallPoint(S, E, w0 - 0.02, wv - 1), wallPoint(S, E, w1 + 0.02, wv - 1), wallPoint(S, E, w1 + 0.02, wv - 3), wallPoint(S, E, w0 - 0.02, wv - 3)]);
      g.fill();
    }
    // barn hayloft door up in the gable (gambrel-barn identity)
    if (V.loft && lod) {
      const lm = wallPoint(W, S, 0.5, baseH - 3);
      g.fillStyle = '#3a2214';
      g.fillRect(lm.x - 6, lm.y - 9, 12, 10);
      g.strokeStyle = trim;
      g.lineWidth = 1.6;
      g.strokeRect(lm.x - 6, lm.y - 9, 12, 10);
      g.beginPath(); g.moveTo(lm.x, lm.y - 9); g.lineTo(lm.x, lm.y + 1); g.stroke();
    }
    // eave shadow strip cast onto the wall tops
    g.fillStyle = 'rgba(45,32,90,.22)';
    polyOn(g, [up(W, baseH - 6), up(S, baseH - 6), up(S, baseH), up(W, baseH)]);
    g.fill();
    polyOn(g, [up(S, baseH - 6), up(E, baseH - 6), up(E, baseH), up(S, baseH)]);
    g.fill();
    paintHipRoof(g, x0, y0, x1, y1, baseH, roofH, def.roof || '#8a5a3a', lod, snow, V);
    // striped awning over the door (retail buildings)
    if (V.awning && lod) {
      const a0 = wallPoint(W, S, d0 - 0.04, fh + dh + 3), a1 = wallPoint(W, S, d1 + 0.04, fh + dh + 3);
      const o0 = { x: a0.x - 7, y: a0.y + 8 }, o1 = { x: a1.x - 7, y: a1.y + 8 };
      for (let i = 0; i < 5; i++) {
        g.fillStyle = V.awning[i % 2];
        polyOn(g, [lpt(a0, a1, i / 5), lpt(a0, a1, (i + 1) / 5), lpt(o0, o1, (i + 1) / 5), lpt(o0, o1, i / 5)]);
        g.fill();
      }
      g.fillStyle = 'rgba(30,16,8,.22)'; // scalloped bottom edge shading
      const segW = Math.hypot(o1.x - o0.x, o1.y - o0.y) / 10;
      for (let i = 0; i < 5; i++) {
        const p = lpt(o0, o1, (i + 0.5) / 5);
        g.beginPath(); g.ellipse(p.x, p.y + 0.5, segW, 2, 0, 0, Math.PI); g.fill();
      }
    }
    // hung sign board with brackets over the door
    if (def.sign && lod) {
      const sp = wallPoint(W, S, 0.49, baseH - 8);
      const sw = def.sign.length * 6.4 + 12;
      g.strokeStyle = '#4a3214';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(sp.x - sw / 2 + 5, sp.y - 4); g.lineTo(sp.x - sw / 2 + 5, sp.y + 2);
      g.moveTo(sp.x + sw / 2 - 5, sp.y - 4); g.lineTo(sp.x + sw / 2 - 5, sp.y + 2);
      g.stroke();
      g.fillStyle = '#f1e7cf';
      rrOn(g, sp.x - sw / 2, sp.y + 1, sw, 14, 3);
      g.fill();
      g.strokeStyle = 'rgba(90,60,30,.6)';
      g.lineWidth = 1.4;
      rrOn(g, sp.x - sw / 2, sp.y + 1, sw, 14, 3);
      g.stroke();
      g.fillStyle = '#4a3214';
      g.font = '900 9px Nunito, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(def.sign, sp.x, sp.y + 8.4);
    }
    // mill: wooden mast above the roofline carrying the wind fan (the rotor
    // itself is animated in drawBarnLike; here we bake what doesn't move)
    if (V.rotor) {
      const apx = up(proj((x0 + x1) / 2, (y0 + y1) / 2), baseH + roofH);
      g.strokeStyle = '#4a3a28';
      g.lineWidth = 2.8;
      g.beginPath(); g.moveTo(apx.x, apx.y + 3); g.lineTo(apx.x, apx.y - 15); g.stroke();
      if (lod) { // diagonal struts bracing the mast against the roof
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(apx.x - 4.5, apx.y + 2); g.lineTo(apx.x, apx.y - 8);
        g.moveTo(apx.x + 4.5, apx.y + 2); g.lineTo(apx.x, apx.y - 8);
        g.stroke();
      }
    }
    // mill: attached grain silo on the E corner (silhouette identity)
    if (V.rotor && lod) {
      const sc2 = E;
      g.fillStyle = '#9a917f';
      g.beginPath();
      g.moveTo(sc2.x + 2, sc2.y - 2);
      g.quadraticCurveTo(sc2.x + 1, sc2.y - baseH * 0.75, sc2.x + 4, sc2.y - baseH * 0.8);
      g.lineTo(sc2.x + 18, sc2.y - baseH * 0.8);
      g.quadraticCurveTo(sc2.x + 21, sc2.y - baseH * 0.75, sc2.x + 20, sc2.y - 2);
      g.quadraticCurveTo(sc2.x + 11, sc2.y + 4, sc2.x + 2, sc2.y - 2);
      g.closePath();
      g.fill();
      g.fillStyle = '#7f776a';
      g.fillRect(sc2.x + 11, sc2.y - baseH * 0.8 + 1, 9, baseH * 0.8 - 3);
      g.fillStyle = '#6f675c';
      g.beginPath();
      g.moveTo(sc2.x - 1, sc2.y - baseH * 0.8 + 2);
      g.lineTo(sc2.x + 11, sc2.y - baseH * 0.94);
      g.lineTo(sc2.x + 23, sc2.y - baseH * 0.8 + 2);
      g.closePath();
      g.fill();
    }
    // grass tufts breaking the wall/ground line (season-tinted)
    if (lod && !snow) {
      const tuftCol = season === 2 ? hsl(38, 50, 38) : hsl(100, 42, 32);
      g.strokeStyle = tuftCol;
      g.lineWidth = 1.5;
      for (const [u, edge] of [[0.14, 0], [0.86, 0], [0.24, 1], [0.78, 1]]) {
        const P = edge === 0 ? lpt(W, S, u) : lpt(S, E, u);
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.moveTo(P.x + i * 2.4, P.y + 2);
          g.lineTo(P.x + i * 3.6, P.y - 4 - Math.abs(i));
          g.stroke();
        }
      }
    }
  }

  function paintGreenhouse(g, lod, season) {
    const def = D.BUILDINGS.greenhouse, V = BVIS.greenhouse;
    const inset = 0.12;
    const x0 = inset, y0 = inset, x1 = def.w - inset, y1 = def.h - inset;
    const N = proj(x0, y0), E = proj(x1, y0), S = proj(x1, y1), W = proj(x0, y1);
    const baseH = V.baseH, roofH = V.roofH;
    const c = proj(def.w / 2, def.h / 2);
    const snow = season === 3;
    // base AO + low brick knee wall
    g.fillStyle = 'rgba(30,26,50,.30)';
    polyOn(g, [{ x: W.x - 3, y: W.y }, { x: S.x, y: S.y + 3.5 }, { x: E.x + 3, y: E.y }, { x: S.x, y: S.y - 4 }]);
    g.fill();
    const kb = 7;
    g.fillStyle = '#a8836a';
    polyOn(g, [W, S, up(S, kb), up(W, kb)]);
    g.fill();
    g.fillStyle = '#8a6852';
    polyOn(g, [S, E, up(E, kb), up(S, kb)]);
    g.fill();
    // glass walls: vertical gradient sky-blue → warm plant green
    const gw = g.createLinearGradient(0, S.y - baseH, 0, S.y);
    gw.addColorStop(0, 'rgba(190,225,238,.62)');
    gw.addColorStop(0.6, 'rgba(150,200,210,.55)');
    gw.addColorStop(1, 'rgba(120,170,140,.6)');
    polyOn(g, [up(W, kb), up(S, kb), up(S, baseH), up(W, baseH)]);
    g.fillStyle = gw;
    g.fill();
    polyOn(g, [up(S, kb), up(E, kb), up(E, baseH), up(S, baseH)]);
    g.fillStyle = 'rgba(120,165,185,.62)';
    g.fill();
    // potted plants silhouetted through the glass
    if (lod) {
      g.fillStyle = 'rgba(52,96,58,.55)';
      for (const [px, py, r] of [[-22, -14, 6.5], [-6, -10, 8], [12, -13, 6], [26, -9, 7]]) {
        g.beginPath(); g.arc(c.x + px, c.y + py - kb, r, 0, Math.PI * 2); g.fill();
        g.fillRect(c.x + px - 2.5, c.y + py - kb + r - 2, 5, 5);
      }
      // one diagonal reflection streak per face
      g.fillStyle = 'rgba(255,255,255,.22)';
      polyOn(g, [wallPoint(W, S, 0.18, kb), wallPoint(W, S, 0.28, kb), wallPoint(W, S, 0.45, baseH), wallPoint(W, S, 0.35, baseH)]);
      g.fill();
      polyOn(g, [wallPoint(S, E, 0.3, kb), wallPoint(S, E, 0.38, kb), wallPoint(S, E, 0.55, baseH), wallPoint(S, E, 0.47, baseH)]);
      g.fill();
    }
    // glazing bars
    g.strokeStyle = 'rgba(250,252,255,.85)';
    g.lineWidth = 1.6;
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const a1 = wallPoint(W, S, u, kb);
      g.beginPath(); g.moveTo(a1.x, a1.y); g.lineTo(a1.x, a1.y - baseH + kb); g.stroke();
      const a2 = wallPoint(S, E, u, kb);
      g.beginPath(); g.moveTo(a2.x, a2.y); g.lineTo(a2.x, a2.y - baseH + kb); g.stroke();
    }
    // arched glass roof: curved panes rising to a ridge beam
    const apexW = up(lpt(N, W, 0.5), baseH + roofH - 4);
    const apexE = up(lpt(E, S, 0.5), baseH + roofH - 4);
    const bN = up(N, baseH), bE = up(E, baseH), bS = up(S, baseH), bW = up(W, baseH);
    g.fillStyle = 'rgba(205,232,240,.88)'; // back pane
    g.beginPath();
    g.moveTo(bN.x, bN.y);
    g.lineTo(bE.x, bE.y);
    g.lineTo(apexE.x, apexE.y);
    g.quadraticCurveTo((apexW.x + apexE.x) / 2, (apexW.y + apexE.y) / 2 - 3, apexW.x, apexW.y);
    g.closePath();
    g.fill();
    g.fillStyle = snow ? 'rgba(240,247,252,.95)' : 'rgba(176,215,228,.9)'; // front pane
    g.beginPath();
    g.moveTo(bW.x, bW.y);
    g.lineTo(bS.x, bS.y);
    g.lineTo(bE.x, bE.y);
    g.lineTo(apexE.x, apexE.y);
    g.quadraticCurveTo((apexW.x + apexE.x) / 2, (apexW.y + apexE.y) / 2 - 3, apexW.x, apexW.y);
    g.closePath();
    g.fill();
    if (lod) { // roof glazing ribs following the arch
      g.strokeStyle = 'rgba(250,252,255,.7)';
      g.lineWidth = 1.4;
      for (let i = 1; i < 5; i++) {
        const u = i / 5;
        const e0 = lpt(bW, bS, u), e1 = lpt(apexW, apexE, u);
        g.beginPath();
        g.moveTo(e0.x, e0.y);
        g.quadraticCurveTo(lerp(e0.x, e1.x, 0.55), lerp(e0.y, e1.y, 0.62) - 2, e1.x, e1.y);
        g.stroke();
      }
    }
    // ridge beam
    g.strokeStyle = '#e8f2f6';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(apexW.x, apexW.y);
    g.quadraticCurveTo((apexW.x + apexE.x) / 2, (apexW.y + apexE.y) / 2 - 3, apexE.x, apexE.y);
    g.stroke();
    if (snow) {
      g.strokeStyle = 'rgba(250,252,255,.95)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(apexW.x, apexW.y - 2);
      g.quadraticCurveTo((apexW.x + apexE.x) / 2, (apexW.y + apexE.y) / 2 - 5, apexE.x, apexE.y - 2);
      g.stroke();
    }
  }

  function paintWell(g, lod, season) {
    const c = proj(0.5, 0.5);
    const snow = season === 3;
    // puddle + two stones at the base
    if (lod) {
      g.fillStyle = snow ? 'rgba(220,235,245,.6)' : 'rgba(80,140,175,.35)';
      g.beginPath(); g.ellipse(c.x + 14, c.y + 4, 9, 3.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8f8a80';
      g.beginPath(); g.ellipse(c.x - 17, c.y + 3, 3.4, 2.2, 0.3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(c.x - 11, c.y + 6, 2.4, 1.6, -0.2, 0, Math.PI * 2); g.fill();
    }
    // stone ring — cool grey with a warm lit cap + joint ticks
    g.fillStyle = hsl(215, 10, 58);
    g.beginPath(); g.ellipse(c.x, c.y - 4, 20, 10, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = hsl(220, 12, 47);
    g.beginPath(); g.ellipse(c.x, c.y - 8, 20, 10, 0, 0, Math.PI * 2); g.fill();
    if (lod) {
      g.strokeStyle = 'rgba(40,42,50,.4)';
      g.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const a = 0.35 + (i / 7) * Math.PI * 0.92;
        g.beginPath();
        g.moveTo(c.x + Math.cos(a) * 20, c.y - 8 + Math.sin(a) * 10);
        g.lineTo(c.x + Math.cos(a) * 19, c.y - 3 + Math.sin(a) * 9);
        g.stroke();
      }
    }
    g.fillStyle = '#39708f';
    g.beginPath(); g.ellipse(c.x, c.y - 8, 14, 6.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.beginPath(); g.ellipse(c.x - 4, c.y - 10, 4, 2, -0.4, 0, Math.PI * 2); g.fill();
    // posts + little shingled roof
    g.fillStyle = hsl(26, 38, 27);
    g.fillRect(c.x - 14, c.y - 34, 4, 28);
    g.fillRect(c.x + 10, c.y - 34, 4, 28);
    g.fillStyle = hsl(10, 50, 38);
    g.beginPath();
    g.moveTo(c.x - 22, c.y - 32);
    g.lineTo(c.x, c.y - 46);
    g.lineTo(c.x + 22, c.y - 32);
    g.lineTo(c.x + 16, c.y - 28);
    g.lineTo(c.x, c.y - 40);
    g.lineTo(c.x - 16, c.y - 28);
    g.closePath();
    g.fill();
    if (lod) { // shingle strokes on the little roof
      g.strokeStyle = 'rgba(40,16,8,.35)';
      g.lineWidth = 1;
      for (let i = 1; i <= 2; i++) {
        g.beginPath();
        g.moveTo(c.x - 22 + i * 6, c.y - 32 - i * 2);
        g.lineTo(c.x, c.y - 44 + i * 1.2);
        g.lineTo(c.x + 22 - i * 6, c.y - 32 - i * 2);
        g.stroke();
      }
      if (snow) {
        g.strokeStyle = 'rgba(250,252,255,.9)';
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(c.x - 21, c.y - 33);
        g.lineTo(c.x, c.y - 47);
        g.lineTo(c.x + 21, c.y - 33);
        g.stroke();
      }
    }
    // crossbar + rope + off-center hanging bucket
    g.strokeStyle = '#4a3214';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(c.x - 12, c.y - 33); g.lineTo(c.x + 12, c.y - 33); g.stroke();
    g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(c.x + 4, c.y - 33); g.lineTo(c.x + 4, c.y - 19); g.stroke();
    g.fillStyle = hsl(33, 42, 40);
    g.beginPath();
    g.moveTo(c.x, c.y - 19);
    g.lineTo(c.x + 8, c.y - 19);
    g.lineTo(c.x + 7, c.y - 12);
    g.lineTo(c.x + 1, c.y - 12);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(60,40,20,.6)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(c.x + 0.5, c.y - 17); g.lineTo(c.x + 7.5, c.y - 17); g.stroke();
  }

  function paintScarecrow(g, lod, season) {
    const c = proj(0.5, 0.5);
    g.strokeStyle = hsl(26, 38, 27);
    g.lineWidth = 4.5;
    g.beginPath(); g.moveTo(c.x, c.y + 2); g.lineTo(c.x, c.y - 26); g.stroke();
    g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(c.x - 13, c.y - 18); g.lineTo(c.x + 13, c.y - 18); g.stroke();
    // patched shirt
    g.fillStyle = '#b06f3c';
    rrOn(g, c.x - 7, c.y - 22, 14, 13, 4);
    g.fill();
    if (lod) {
      g.fillStyle = '#8a5a2e';
      g.fillRect(c.x - 4, c.y - 15, 4, 3.5);
      g.strokeStyle = 'rgba(70,42,18,.7)';
      g.lineWidth = 0.8;
      g.strokeRect(c.x - 4, c.y - 15, 4, 3.5);
      // straw poking from the cuffs
      g.strokeStyle = '#e0c26a';
      g.lineWidth = 1.2;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(c.x + side * 12, c.y - 18);
          g.lineTo(c.x + side * (14 + i), c.y - 15 + i);
          g.stroke();
        }
      }
    }
    g.fillStyle = '#e8ca8c';
    g.beginPath(); g.arc(c.x, c.y - 29, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3d2a14';
    g.beginPath(); g.arc(c.x - 2.5, c.y - 30, 1.1, 0, Math.PI * 2); g.arc(c.x + 2.5, c.y - 30, 1.1, 0, Math.PI * 2); g.fill();
    if (lod) { // stitched smile
      g.strokeStyle = '#3d2a14';
      g.lineWidth = 1;
      g.beginPath(); g.arc(c.x, c.y - 28, 3.4, 0.35, Math.PI - 0.35); g.stroke();
    }
    g.fillStyle = '#82702e';
    g.fillRect(c.x - 10, c.y - 36, 20, 3.5);
    rrOn(g, c.x - 5.5, c.y - 43, 11, 8, 2.5);
    g.fill();
    if (season === 3 && lod) {
      g.fillStyle = 'rgba(250,252,255,.9)';
      g.beginPath(); g.ellipse(c.x, c.y - 42.5, 5.5, 1.8, 0, 0, Math.PI * 2); g.fill();
    }
  }

  /* ---------------- prop dressing sprites (baked once; no season key) ---------------- */
  const PROP_PAINTERS = {
    hay(g) { // round bale on its side: spiral end + twine straps
      g.fillStyle = 'rgba(28,30,18,.3)';
      g.beginPath(); g.ellipse(0, 1.5, 13, 4.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c9a03a';
      rrOn(g, -12, -16, 20, 16, 4);
      g.fill();
      g.fillStyle = '#e0bd55';
      g.beginPath(); g.ellipse(8, -8, 5.6, 7.6, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#a87f24';
      g.lineWidth = 1.3;
      g.beginPath(); g.ellipse(8, -8, 3.4, 4.6, 0, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse(8, -8, 1.3, 1.9, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(120,90,20,.5)';
      g.lineWidth = 1;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-10, -13 + i * 4.4); g.lineTo(3, -13 + i * 4.4); g.stroke(); }
      g.strokeStyle = 'rgba(90,60,20,.8)';
      g.lineWidth = 1.7;
      g.beginPath(); g.moveTo(-5, -16); g.lineTo(-5, 0); g.moveTo(0, -16); g.lineTo(0, 0); g.stroke();
      g.fillStyle = 'rgba(255,240,200,.22)';
      rrOn(g, -12, -16, 20, 4.5, 4);
      g.fill();
    },
    crate(g) { // slatted iso crate
      const w = 9, h = 8;
      g.fillStyle = 'rgba(28,30,18,.3)';
      g.beginPath(); g.ellipse(0, 1, w * 1.3, 3.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b3864a';
      polyOn(g, [{ x: -w, y: -w / 2 }, { x: 0, y: 0 }, { x: 0, y: -h }, { x: -w, y: -w / 2 - h }]);
      g.fill();
      g.fillStyle = '#8a6233';
      polyOn(g, [{ x: 0, y: 0 }, { x: w, y: -w / 2 }, { x: w, y: -w / 2 - h }, { x: 0, y: -h }]);
      g.fill();
      g.fillStyle = '#c99b5c';
      polyOn(g, [{ x: -w, y: -w / 2 - h }, { x: 0, y: -h }, { x: w, y: -w / 2 - h }, { x: 0, y: -w - h }]);
      g.fill();
      g.strokeStyle = 'rgba(70,45,20,.55)';
      g.lineWidth = 1;
      polyOn(g, [{ x: -w, y: -w / 2 - h }, { x: 0, y: -h }, { x: w, y: -w / 2 - h }, { x: 0, y: -w - h }]);
      g.stroke();
      g.beginPath();
      g.moveTo(-w + 2, -w / 2 - h / 2);
      g.lineTo(-2, -h / 2);
      g.moveTo(2, -h / 2);
      g.lineTo(w - 2, -w / 2 - h / 2);
      g.stroke();
    },
    barrel(g) { // oak barrel with rainwater sheen
      g.fillStyle = 'rgba(28,30,18,.3)';
      g.beginPath(); g.ellipse(0, 1, 8.5, 3.2, 0, 0, Math.PI * 2); g.fill();
      const g2 = g.createLinearGradient(-8, 0, 8, 0);
      g2.addColorStop(0, '#8a6233');
      g2.addColorStop(0.4, '#a5793f');
      g2.addColorStop(1, '#6e4d26');
      g.fillStyle = g2;
      g.beginPath();
      g.moveTo(-7, -1);
      g.quadraticCurveTo(-9.2, -8.5, -7, -15);
      g.lineTo(7, -15);
      g.quadraticCurveTo(9.2, -8.5, 7, -1);
      g.closePath();
      g.fill();
      g.fillStyle = '#5a4020';
      g.beginPath(); g.ellipse(0, -15, 7, 2.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7a5c34';
      g.beginPath(); g.ellipse(0, -15, 5.4, 2, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#4c463c';
      g.lineWidth = 1.5;
      for (const yy of [-4.5, -11.5]) {
        g.beginPath(); g.moveTo(-8.2, yy); g.quadraticCurveTo(0, yy + 1.4, 8.2, yy); g.stroke();
      }
      g.fillStyle = 'rgba(150,200,255,.5)';
      g.beginPath(); g.ellipse(-0.8, -14.7, 3.8, 1.3, 0, 0, Math.PI * 2); g.fill();
    },
    churn(g) { // steel milk churn
      g.fillStyle = 'rgba(28,30,18,.3)';
      g.beginPath(); g.ellipse(0, 1, 5.6, 2.2, 0, 0, Math.PI * 2); g.fill();
      const g3 = g.createLinearGradient(-5, 0, 5, 0);
      g3.addColorStop(0, '#c8cdd2');
      g3.addColorStop(0.35, '#eef1f4');
      g3.addColorStop(1, '#9aa1a8');
      g.fillStyle = g3;
      g.beginPath();
      g.moveTo(-4.6, 0);
      g.quadraticCurveTo(-6, -7.5, -3.7, -12);
      g.lineTo(3.7, -12);
      g.quadraticCurveTo(6, -7.5, 4.6, 0);
      g.closePath();
      g.fill();
      g.fillStyle = '#aeb5bc';
      g.beginPath(); g.ellipse(0, -12, 3.7, 1.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8d959c';
      rrOn(g, -2.2, -15.6, 4.4, 3.6, 1.4);
      g.fill();
      g.strokeStyle = '#7b838a';
      g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(-5.1, -3.6); g.lineTo(5.1, -3.6); g.stroke();
    },
    sack(g) { // plump flour sack with tie-off + stencil band
      g.fillStyle = 'rgba(28,30,18,.3)';
      g.beginPath(); g.ellipse(0, 1, 8, 3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d9c9a3';
      g.beginPath();
      g.moveTo(-7, 0);
      g.quadraticCurveTo(-8.5, -7, -5.5, -11.5);
      g.quadraticCurveTo(-2, -14.5, 0.5, -13.5);
      g.quadraticCurveTo(2, -15.5, 3.6, -13.6);
      g.quadraticCurveTo(7.5, -10, 7, -4);
      g.quadraticCurveTo(7.6, 0.5, 0, 1.2);
      g.quadraticCurveTo(-5, 1.4, -7, 0);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(120,95,55,.35)';
      g.beginPath(); g.ellipse(2, -3, 5, 4.5, 0.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b8a578';
      g.beginPath(); g.ellipse(1.6, -13.8, 2.6, 1.7, 0.3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#8a744a';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-0.6, -12.8); g.lineTo(4, -14.6); g.stroke();
      g.strokeStyle = 'rgba(140,100,60,.7)'; // stencil mark
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-4, -6); g.lineTo(1, -6); g.moveTo(-4, -4); g.lineTo(2, -4); g.stroke();
    },
    nest(g) { // coop nest box with straw + eggs
      g.fillStyle = 'rgba(28,30,18,.3)';
      g.beginPath(); g.ellipse(0, 1, 9, 3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8a6233';
      polyOn(g, [{ x: -8, y: -3 }, { x: 0, y: 1 }, { x: 8, y: -3 }, { x: 8, y: -9 }, { x: 0, y: -5 }, { x: -8, y: -9 }]);
      g.fill();
      g.fillStyle = '#6e4d26';
      polyOn(g, [{ x: 0, y: 1 }, { x: 8, y: -3 }, { x: 8, y: -9 }, { x: 0, y: -5 }]);
      g.fill();
      g.fillStyle = '#d9b23c'; // straw ring
      g.beginPath(); g.ellipse(0, -8, 6.4, 2.8, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(140,100,25,.7)';
      g.lineWidth = 0.9;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(-5 + i * 2.4, -6.8);
        g.lineTo(-4 + i * 2.4, -9.4);
        g.stroke();
      }
      g.fillStyle = '#f4efe2';
      g.beginPath();
      g.ellipse(-1.8, -8.4, 2, 2.5, -0.2, 0, Math.PI * 2);
      g.ellipse(2, -8, 1.9, 2.4, 0.25, 0, Math.PI * 2);
      g.fill();
    },
    trough(g) { // water trough with sheen
      g.fillStyle = 'rgba(28,30,18,.3)';
      g.beginPath(); g.ellipse(0, 1.5, 13, 3.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7a5836';
      polyOn(g, [{ x: -13, y: -4 }, { x: 0, y: 1 }, { x: 0, y: -6 }, { x: -13, y: -11 }]);
      g.fill();
      g.fillStyle = '#5e4226';
      polyOn(g, [{ x: 0, y: 1 }, { x: 13, y: -4 }, { x: 13, y: -11 }, { x: 0, y: -6 }]);
      g.fill();
      g.fillStyle = '#8a6a44';
      polyOn(g, [{ x: -13, y: -11 }, { x: 0, y: -6 }, { x: 13, y: -11 }, { x: 0, y: -16 }]);
      g.fill();
      g.fillStyle = '#4a86ab';
      polyOn(g, [{ x: -10.5, y: -11 }, { x: 0, y: -7.2 }, { x: 10.5, y: -11 }, { x: 0, y: -14.8 }]);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.4)';
      g.beginPath(); g.ellipse(-3, -11.5, 3.4, 1.2, -0.2, 0, Math.PI * 2); g.fill();
    },
    spool(g) { // yarn spool
      g.fillStyle = 'rgba(28,30,18,.3)';
      g.beginPath(); g.ellipse(0, 1, 6.5, 2.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b3864a';
      g.fillRect(-5.5, -12.4, 11, 2.2);
      g.fillRect(-5.5, -2, 11, 2.2);
      g.fillStyle = '#9a6ab0';
      g.fillRect(-4.4, -10.2, 8.8, 8.2);
      g.strokeStyle = 'rgba(255,255,255,.3)';
      g.lineWidth = 0.9;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-4.4, -8.8 + i * 2.1); g.lineTo(4.4, -9.4 + i * 2.1); g.stroke(); }
      g.fillStyle = '#c9a03a';
      g.beginPath(); g.ellipse(0, -13, 4.2, 1.6, 0, 0, Math.PI * 2); g.fill();
    },
    feed(g) { // feed scatter for the coop yard
      for (let i = 0; i < 10; i++) {
        const a = hash(i, 111) * Math.PI * 2, r = hash(i * 3, 113) * 9;
        g.fillStyle = i % 3 ? '#d9b23c' : '#b8862a';
        g.beginPath();
        g.ellipse(Math.cos(a) * r, Math.sin(a) * r * 0.5 - 1, 1.2, 0.8, a, 0, Math.PI * 2);
        g.fill();
      }
    },
  };

  function propSprite(kind) {
    return Atlas.get('prop', kind, 'x', LOD, 36, 40, 18, 30, (g) => PROP_PAINTERS[kind](g));
  }

  function buildingSprite(type, season) {
    const def = D.BUILDINGS[type], V = BVIS[type] || {};
    const left = -def.h * TW / 2 - 16, right = def.w * TW / 2 + 28;
    const top = -((V.baseH || 46) + (V.roofH || 28) + 34);
    const bottom = (def.w + def.h) * TH / 2 + 16;
    return Atlas.get('bldg', type, season, LOD, right - left, bottom - top, -left, -top, (g, lod) => {
      if (type === 'greenhouse') paintGreenhouse(g, lod, season);
      else if (type === 'well') paintWell(g, lod, season);
      else if (type === 'scarecrow') paintScarecrow(g, lod, season);
      else paintBarnLike(g, type, lod, season);
    });
  }

  function drawProps(state, b, def, V) {
    if (!V.props) return;
    for (const [kind, dx, dy] of V.props) {
      const p = proj(b.x + dx, b.y + dy);
      blit(propSprite(kind), p.x, p.y);
    }
  }

  // per-frame building draw: blit the bake, then the dynamic layer
  const rotorPhase = new WeakMap(); // per-building rotor angle (dt-accumulated)
  function drawBarnLike(state, b, def) {
    const V = BVIS[b.type];
    const c = proj(b.x + def.w / 2, b.y + def.h / 2);
    shadow(c.x + 4, c.y + 6, TW * 0.8, TH * 0.62);
    const P = proj(b.x, b.y);
    blit(buildingSprite(b.type, state.season), P.x, P.y);
    const inset = 0.12;
    const S = proj(b.x + def.w - inset, b.y + def.h - inset);
    const E = proj(b.x + def.w - inset, b.y + inset);
    const W = proj(b.x + inset, b.y + def.h - inset);
    const baseH = V.baseH;
    if (SUN.glow > 0.12) { // window glass re-lit warm after dark
      const w0 = 0.35, w1 = 0.6, wv = baseH * 0.36, wh2 = 13;
      ctx.fillStyle = `rgba(255,216,120,${0.72 + 0.26 * SUN.glow})`;
      poly([wallPoint(S, E, w0 + 0.015, wv + 1.3), wallPoint(S, E, w1 - 0.015, wv + 1.3), wallPoint(S, E, w1 - 0.015, wv + wh2 - 1.3), wallPoint(S, E, w0 + 0.015, wv + wh2 - 1.3)]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,70,20,.55)'; // mullion silhouetted on the glow
      ctx.lineWidth = 1.2;
      const mm = wallPoint(S, E, (w0 + w1) / 2, wv + 1), mm2 = wallPoint(S, E, (w0 + w1) / 2, wv + wh2 - 1);
      ctx.beginPath(); ctx.moveTo(mm.x, mm.y); ctx.lineTo(mm2.x, mm2.y); ctx.stroke();
      // warm light seeping under the door
      const dm = wallPoint(W, S, 0.49, 0);
      ctx.fillStyle = `rgba(255,190,90,${0.30 * SUN.glow})`;
      ctx.beginPath(); ctx.ellipse(dm.x, dm.y + 2, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (SUN.glow > 0.02) { // the window stays a registered emitter
      const wm = wallPoint(S, E, 0.475, baseH * 0.36 + 6);
      addLight(wm.x, wm.y, 96, sprites.lightWarm, 0.9 * SUN.glow, true, true);
    }
    const cooking = b.queue && b.queue.some(j => state.now < j.done);
    // chimney smoke while a recipe is cooking (working-state feedback)
    if (V.chimney && cooking) {
      const apex = up(proj(b.x + def.w / 2, b.y + def.h / 2), baseH + V.roofH);
      const bE2 = up(proj(b.x + def.w + 0.14, b.y - 0.14), baseH);
      const ch = lpt(apex, bE2, 0.38);
      const wind = state.weather === 'storm' ? 9 : state.weather === 'rain' ? 4 : 0;
      for (let i = 0; i < 3; i++) {
        const t = (time * 0.5 + i * 0.33) % 1;
        ctx.fillStyle = `rgba(235,235,230,${0.4 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(ch.x + Math.sin(t * 5 + i) * 3 + wind * t, ch.y - 20 - t * 16, 2.5 + t * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // working processors: warm window pulse even in daylight (bakery ovens on)
    if (cooking) {
      const w0 = 0.35, w1 = 0.6, wv = baseH * 0.36, wh2 = 13;
      const pulse = 0.15 + 0.1 * (Math.sin(time * 3.1) * 0.5 + 0.5);
      ctx.fillStyle = `rgba(255,190,90,${pulse})`;
      poly([wallPoint(S, E, w0 + 0.015, wv + 1.3), wallPoint(S, E, w1 - 0.015, wv + 1.3), wallPoint(S, E, w1 - 0.015, wv + wh2 - 1.3), wallPoint(S, E, w0 + 0.015, wv + wh2 - 1.3)]);
      ctx.fill();
    }
    if (V.rotor) { // mill wind fan: a proper 4-sail rotor on the baked mast above
      const apex = up(proj(b.x + def.w / 2, b.y + def.h / 2), baseH + V.roofH);
      const hub = { x: apex.x, y: apex.y - 15 }; // top of the baked mast
      const milling = state.animals.some(a2 => !a2.sick && state.now < a2.fedUntil);
      let ph = rotorPhase.get(b) || 0;
      ph += fdt * (milling ? 2.2 : 0.35);
      rotorPhase.set(b, ph);
      // sails spin in a near-vertical plane (front-facing fan, slight iso squash)
      const KY = 0.92;
      ctx.strokeStyle = '#5c4a32';
      ctx.fillStyle = 'rgba(240,232,210,.92)';
      for (let i = 0; i < 4; i++) {
        const a = ph + (i / 4) * Math.PI * 2;
        const dx = Math.cos(a), dy = Math.sin(a) * KY;      // along the spoke
        const px = -Math.sin(a) * 0.94, py = Math.cos(a) * KY * 0.94; // perpendicular
        // spoke
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(hub.x, hub.y);
        ctx.lineTo(hub.x + dx * 14.5, hub.y + dy * 14.5);
        ctx.stroke();
        // canvas sail on one side of the spoke (classic windmill lattice sail)
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(hub.x + dx * 4.5, hub.y + dy * 4.5);
        ctx.lineTo(hub.x + dx * 13.8, hub.y + dy * 13.8);
        ctx.lineTo(hub.x + dx * 13.8 + px * 4.6, hub.y + dy * 13.8 + py * 4.6);
        ctx.lineTo(hub.x + dx * 5.5 + px * 3.6, hub.y + dy * 5.5 + py * 3.6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#3c342a';
      ctx.beginPath(); ctx.ellipse(hub.x, hub.y, 2.2, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a7458';
      ctx.beginPath(); ctx.arc(hub.x - 0.5, hub.y - 0.5, 0.8, 0, Math.PI * 2); ctx.fill();
    }
    drawProps(state, b, def, V);
  }

  function drawGreenhouse(state, b, def) {
    const V = BVIS.greenhouse;
    const c = proj(b.x + def.w / 2, b.y + def.h / 2);
    shadow(c.x + 4, c.y + 6, TW * 0.8, TH * 0.62);
    const P = proj(b.x, b.y);
    blit(buildingSprite('greenhouse', state.season), P.x, P.y);
    const gl = SUN.glow;
    if (gl > 0.12) { // glass glows warm from the inside after dark
      const inset = 0.12;
      const S = proj(b.x + def.w - inset, b.y + def.h - inset);
      const E = proj(b.x + def.w - inset, b.y + inset);
      const W = proj(b.x + inset, b.y + def.h - inset);
      const baseH = V.baseH;
      ctx.fillStyle = `rgba(255,214,150,${0.30 + 0.25 * gl})`;
      poly([W, S, up(S, baseH), up(W, baseH)]);
      ctx.fill();
      ctx.fillStyle = `rgba(235,180,120,${0.30 + 0.25 * gl})`;
      poly([S, E, up(E, baseH), up(S, baseH)]);
      ctx.fill();
    }
    if (gl > 0.02) addLight(c.x, c.y - V.baseH / 2, 128, sprites.lightWarm, 0.7 * gl, true, true);
    drawProps(state, b, def, V);
  }

  function drawWell(state, b) {
    const c = proj(b.x + 0.5, b.y + 0.5);
    shadow(c.x, c.y + 4, 24, 11);
    const P = proj(b.x, b.y);
    blit(buildingSprite('well', state.season), P.x, P.y);
  }

  function drawSprinkler(state, b) {
    const c = proj(b.x + 0.5, b.y + 0.5);
    shadow(c.x, c.y + 3, 9, 4);
    ctx.fillStyle = '#5f6d76';
    ctx.fillRect(c.x - 2.5, c.y - 22, 5, 24);
    ctx.fillStyle = '#3d8fc4';
    ctx.beginPath(); ctx.arc(c.x, c.y - 25, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath(); ctx.arc(c.x - 2, c.y - 27, 2, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const a = time * 2.4 + i * (Math.PI * 2 / 3);
      const r = 10 + ((time * 20 + i * 13) % 16);
      ctx.fillStyle = 'rgba(120,190,235,.5)';
      ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * r, c.y - 22 + Math.sin(a) * r * 0.4, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawScarecrow(state, b) {
    const c = proj(b.x + 0.5, b.y + 0.5);
    shadow(c.x, c.y + 3, 9, 4);
    const P = proj(b.x, b.y);
    blit(buildingSprite('scarecrow', state.season), P.x, P.y);
  }

  function drawDrone(state, b) {
    const c = proj(b.x + 0.5, b.y + 0.5);
    // landing pad
    ctx.fillStyle = '#6d7a82';
    diamond(c.x, c.y, TW * 0.72, TH * 0.72);
    ctx.fill();
    ctx.strokeStyle = '#4e5a62';
    ctx.lineWidth = 2;
    diamond(c.x, c.y, TW * 0.72, TH * 0.72);
    ctx.stroke();
    ctx.strokeStyle = '#d9b23c';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 13, 6.5, 0, 0, Math.PI * 2); ctx.stroke();
    // hovering drone
    const hy = c.y - 26 + Math.sin(time * 2.2) * 4;
    shadow(c.x, c.y, 9 + Math.sin(time * 2.2) * 2, 4);
    ctx.fillStyle = '#dde3e6';
    rr(c.x - 8, hy - 4, 16, 9, 4);
    ctx.fill();
    const fueled = Game.state && Game.state.fuel >= 1;
    ctx.fillStyle = fueled ? '#3d8fc4' : '#c0392b';
    ctx.beginPath(); ctx.arc(c.x, hy + 1, 3, 0, Math.PI * 2); ctx.fill();
    if (SUN.glow > 0.02 && fueled) addLight(c.x, hy + 1, 34, sprites.lightCool, 0.8 * SUN.glow, false, true);
    ctx.strokeStyle = 'rgba(60,75,85,.75)';
    ctx.lineWidth = 2;
    const spin = Math.sin(time * 26) * 7;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(c.x + side * 11 - spin, hy - 7); ctx.lineTo(c.x + side * 11 + spin, hy - 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(c.x + side * 11, hy - 7); ctx.lineTo(c.x + side * 8, hy - 2); ctx.stroke();
    }
  }

  /* placement ceremony: drop from 24px → dust ring → elastic settle → outline flash */
  const bDropMap = new Map();
  let knownBTypes = null;
  function trackPlacements(state) {
    if (!knownBTypes) { knownBTypes = state.buildings.map(b => b && b.type); return; }
    for (let i = 0; i < state.buildings.length; i++) {
      const b = state.buildings[i];
      const t = b && b.type;
      if (t !== knownBTypes[i]) {
        knownBTypes[i] = t;
        if (!t) continue;
        const def = D.BUILDINGS[t];
        const dr = { dy: -26, flash: 1.2 };
        bDropMap.set(i, dr);
        Tween.to(dr, { dy: 0 }, 0.18, Ease.quadIn, () => {
          const c = proj(b.x + def.w / 2, b.y + def.h / 2);
          burstDust(c.x, c.y + 4, 8, 6);
          dr.dy = 3;
          Tween.to(dr, { dy: 0 }, 0.45, Ease.elasticOut);
          after(0.6, () => bDropMap.delete(i));
        });
      }
    }
    while (knownBTypes.length < state.buildings.length) knownBTypes.push(state.buildings[knownBTypes.length] && state.buildings[knownBTypes.length].type);
  }

  function drawBuilding(state, b, index, alpha) {
    const def = D.BUILDINGS[b.type];
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    const dr = index !== undefined ? bDropMap.get(index) : null;
    if (dr) { ctx.save(); ctx.translate(0, dr.dy); }

    if (b.type === 'well') drawWell(state, b);
    else if (b.type === 'sprinkler') drawSprinkler(state, b);
    else if (b.type === 'scarecrow') drawScarecrow(state, b);
    else if (b.type === 'drone') drawDrone(state, b);
    else if (b.type === 'greenhouse') drawGreenhouse(state, b, def);
    else drawBarnLike(state, b, def);

    if (dr) {
      ctx.restore();
      if (dr.flash > 0) { // white footprint flash on touchdown
        const c0 = proj(b.x, b.y), c1 = proj(b.x + def.w, b.y), c2 = proj(b.x + def.w, b.y + def.h), c3 = proj(b.x, b.y + def.h);
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(1, dr.flash) * 0.8})`;
        ctx.lineWidth = 2.5;
        poly([c0, c1, c2, c3]);
        ctx.stroke();
        if (dr.dy >= 0) dr.flash -= fdt * 6;
      }
    }
    ctx.globalAlpha = 1;
    if (index === undefined) return;

    // ready badge (drawn, not emoji)
    let ready = 0;
    if (def.capacity) ready = Game.readyIn(index);
    else if (b.queue) ready = b.queue.filter(j => state.now >= j.done).length;
    if (ready > 0) {
      const c = proj(b.x + def.w / 2, b.y + def.h / 2);
      const by = c.y - 78 + Math.sin(time * 4) * 3;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(c.x, by, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d9912b';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(c.x, by, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#c2611a';
      rr(c.x - 1.7, by - 6, 3.4, 7.5, 1.7);
      ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, by + 4.6, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ================= DECOR: deterministic clusters + baked trees =================
     Per-tile uniform rolls are gone. A coarse grid of cluster cells seeds
     3–7 items each (with radial falloff and deliberate empty meadows); items
     live at continuous positions, so nothing snaps to the tile lattice.
     Trees come in 3 silhouette variants × 3 canopy hue shifts, baked per
     season with true seasonal states (blossom / crimson-gold / snow-lined
     bare winter) and swayed as whole sprites around their trunk anchor. */

  function paintTree(g, pal, season, variant, hueShift, lod) {
    // 3-value canopy colors with per-tree hue variance
    let deep = pal.trees[0], mid = pal.trees[1], lit = pal.trees[2];
    if (season === 2) {
      const t = pal.fallTriad[(variant * 7 + hueShift + 3) % 3];
      deep = [t[0] - 6, t[1], t[2] - 14]; mid = t; lit = [t[0] + 8, t[1], t[2] + 11];
    }
    const hs = (hueShift - 1) * 7;
    const C = (c, dl) => hsl(c[0] + hs, c[1], c[2] + (dl || 0));
    const trunk = () => {
      g.fillStyle = hsl(24, 36, 25);
      g.fillRect(-3, -20, 6, 21);
      g.fillStyle = hsl(28, 40, 36);
      g.fillRect(-3, -20, 2.4, 21);
    };
    if (season === 3) { // winter: bare snow-lined branches
      g.strokeStyle = hsl(25, 30, 24);
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, 1); g.lineTo(0, -22); g.stroke();
      g.lineWidth = 2.2;
      const spread = variant === 1 ? 8 : 13;
      const rise = variant === 1 ? 18 : 12;
      for (const [dx, dy, ph] of [[-spread, -rise, 0.2], [spread, -rise + 2, 0.5], [-spread * 0.6, -rise - 8, 0.8], [spread * 0.55, -rise - 9, 0.3], [0, -rise - 14, 0.6]]) {
        g.beginPath();
        g.moveTo(0, -14 - ph * 6);
        g.quadraticCurveTo(dx * 0.5, -18 - ph * 6, dx, -22 + dy);
        g.stroke();
        if (lod) { // twigs
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(dx * 0.7, -21 + dy * 0.85);
          g.lineTo(dx * 0.7 + (dx > 0 ? 4 : -4), -26 + dy);
          g.stroke();
          g.lineWidth = 2.2;
        }
      }
      // snow lining the branch tops
      g.strokeStyle = 'rgba(250,252,255,.9)';
      g.lineWidth = 1.8;
      for (const [dx, dy] of [[-spread, -rise], [spread, -rise + 2], [0, -rise - 14]]) {
        g.beginPath();
        g.moveTo(dx * 0.3, -16 + dy * 0.4 - 1.5);
        g.quadraticCurveTo(dx * 0.6, -19 + dy * 0.7 - 1.5, dx, -22 + dy - 1.5);
        g.stroke();
      }
      g.fillStyle = 'rgba(250,252,255,.85)'; // snow at the roots
      g.beginPath(); g.ellipse(0, 0, 9, 3, 0, 0, Math.PI * 2); g.fill();
      return;
    }
    if (variant === 1) { // tall & lean: stacked narrow canopy
      trunk();
      g.fillStyle = C(deep);
      g.beginPath();
      g.arc(0, -30, 10, 0, Math.PI * 2);
      g.arc(-4, -22, 7.5, 0, Math.PI * 2);
      g.arc(4, -21, 7, 0, Math.PI * 2);
      g.arc(0, -42, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C(mid);
      g.beginPath();
      g.arc(0, -33, 8.5, 0, Math.PI * 2);
      g.arc(1, -44, 6.5, 0, Math.PI * 2);
      g.arc(-3, -24, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C(lit);
      g.beginPath();
      g.arc(-3, -45, 4.6, 0, Math.PI * 2);
      g.arc(-4.5, -35, 5, 0, Math.PI * 2);
      g.fill();
    } else if (variant === 2) { // broad double-trunk
      g.fillStyle = hsl(24, 36, 25);
      g.save();
      g.transform(1, 0, -0.22, 1, 0, 0);
      g.fillRect(-8, -18, 5, 19);
      g.restore();
      g.save();
      g.transform(1, 0, 0.22, 1, 0, 0);
      g.fillRect(3, -18, 5, 19);
      g.restore();
      g.fillStyle = hsl(28, 40, 36);
      g.fillRect(-6.5, -16, 2, 16);
      g.fillStyle = C(deep);
      g.beginPath();
      g.arc(-10, -24, 11, 0, Math.PI * 2);
      g.arc(10, -23, 10.5, 0, Math.PI * 2);
      g.arc(0, -30, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C(mid);
      g.beginPath();
      g.arc(-8, -27, 8.5, 0, Math.PI * 2);
      g.arc(8, -26, 8, 0, Math.PI * 2);
      g.arc(0, -33, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C(lit);
      g.beginPath();
      g.arc(-6, -34, 6, 0, Math.PI * 2);
      g.arc(-13, -26, 4.5, 0, Math.PI * 2);
      g.fill();
    } else { // classic round
      trunk();
      g.fillStyle = C(deep);
      g.beginPath();
      g.arc(0, -28, 15, 0, Math.PI * 2);
      g.arc(-9, -20, 10, 0, Math.PI * 2);
      g.arc(9, -20, 10, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C(mid);
      g.beginPath();
      g.arc(0, -31, 12.5, 0, Math.PI * 2);
      g.arc(-8, -23, 8, 0, Math.PI * 2);
      g.arc(8.5, -22, 7.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C(lit);
      g.beginPath();
      g.arc(-5, -34, 8, 0, Math.PI * 2);
      g.arc(-10, -27, 5, 0, Math.PI * 2);
      g.fill();
    }
    // 5-step ramp completion (art-director §ramp): core shadow tucked into
    // the canopy underside + a faint cool reflected-light arc on the shadow
    // side, so canopies read as volumes instead of stacked flats
    {
      const cy0 = variant === 1 ? -24 : -23;
      const rr0 = variant === 1 ? 8 : 12;
      g.fillStyle = hsl(deep[0] + hs + 11, Math.min(100, deep[1] + 9), deep[2] - 7, 0.55);
      g.beginPath();
      g.arc(3, cy0, rr0 * 0.66, Math.PI * 1.75, Math.PI * 0.85);
      g.arc(rr0 * 0.45, cy0 - 4, rr0 * 0.4, Math.PI * 1.8, Math.PI * 0.9);
      g.fill();
      g.strokeStyle = hsl(215, 42, 72, 0.22); // sky bounce along the dark limb
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(1, cy0 - 2, rr0 * 0.92, Math.PI * 0.12, Math.PI * 0.6);
      g.stroke();
    }
    // baked cream rim light on the sun-facing contour
    if (lod) {
      g.strokeStyle = 'rgba(255,246,200,.4)';
      g.lineWidth = 1.8;
      const ry = variant === 1 ? -33 : variant === 2 ? -30 : -28;
      const rr2 = variant === 1 ? 8.5 : variant === 2 ? 13 : 15;
      g.beginPath();
      g.arc(0, ry, rr2, Math.PI * 1.05, Math.PI * 1.6);
      g.stroke();
    }
    // LOD2: individual leaf-cluster ticks along the lit crown (only baked at
    // 3x for high-DPR close zoom, where flat fills start reading empty)
    if (lod >= 2) {
      const by2 = variant === 1 ? -38 : variant === 2 ? -30 : -30;
      const rr5 = variant === 1 ? 9 : variant === 2 ? 13 : 14;
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.95 + i * 0.09) + hueShift;
        const rj = rr5 * (0.55 + hash(i * 3 + variant, 141) * 0.5);
        const lx = Math.cos(a) * rj, ly = by2 + Math.sin(a) * rj * 0.9;
        g.fillStyle = i % 3 === 2
          ? hsl(deep[0] + hs, deep[1], deep[2] + 4, 0.5)
          : hsl(lit[0] + hs, lit[1], lit[2] + (i % 2 ? 4 : 0), 0.45);
        g.beginPath();
        g.arc(lx, ly, 1.5 + hash(i, variant + 143) * 1.3, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (season === 0 && pal.blossom && lod) { // spring blossom dots
      g.fillStyle = pal.blossom;
      const by = variant === 1 ? -36 : -27;
      for (let i = 0; i < 6; i++) {
        const a = variant * 1.7 + hueShift * 2.9 + i * 2.3;
        g.beginPath();
        g.arc(Math.cos(a) * 11, by + Math.sin(a) * 8, 1.7, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function treeSprite(state, variant, hueShift) {
    const pal = PALETTES[state.season];
    return Atlas.get('tree', variant * 3 + hueShift, state.season, LOD, 76, 92, 38, 70,
      (g, lod) => paintTree(g, pal, state.season, variant, hueShift, lod));
  }

  function decorSprite(state, kind, variant) {
    const pal = PALETTES[state.season];
    return Atlas.get(kind, variant, state.season, LOD, 44, 44, 22, 32, (g, lod) => {
      if (kind === 'bush') {
        const t = pal.trees[1], l = pal.trees[2];
        g.fillStyle = hsl(t[0] + (variant - 1) * 6, t[1], t[2]);
        g.beginPath();
        g.arc(-6, -4, 8, 0, Math.PI * 2);
        g.arc(6, -4, 8, 0, Math.PI * 2);
        g.arc(0, -9, 9, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = hsl(l[0] + (variant - 1) * 6, l[1], l[2]);
        g.beginPath(); g.arc(-4, -10, 5, 0, Math.PI * 2); g.fill();
        if (state.season === 3) {
          g.fillStyle = 'rgba(250,252,255,.85)';
          g.beginPath(); g.arc(0, -13, 6.5, Math.PI, 0); g.fill();
        }
      } else if (kind === 'rock') {
        g.fillStyle = hsl(222, 8, 58);
        g.beginPath();
        g.moveTo(-8, 1);
        g.quadraticCurveTo(-7, -6, -1, -7);
        g.quadraticCurveTo(6, -7.5, 8, -1);
        g.quadraticCurveTo(5, 2.5, -8, 1);
        g.fill();
        g.fillStyle = hsl(38, 12, 70);
        g.beginPath(); g.ellipse(-2, -4.5, 4.5, 2.4, -0.35, 0, Math.PI * 2); g.fill();
        if (lod) { // grass lapping the base
          g.fillStyle = hsl(pal.grass[0], pal.grass[1], pal.grass[2] - 10, 0.6);
          g.beginPath();
          g.ellipse(-6, 1.5, 3, 1.4, 0, 0, Math.PI * 2);
          g.ellipse(6, 0.5, 2.6, 1.2, 0, 0, Math.PI * 2);
          g.fill();
        }
      } else if (kind === 'stump') {
        g.fillStyle = hsl(26, 34, 30);
        g.fillRect(-5, -8, 10, 9);
        g.fillStyle = hsl(33, 40, 52);
        g.beginPath(); g.ellipse(0, -8, 5, 2.6, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = hsl(28, 38, 40);
        g.lineWidth = 1;
        g.beginPath(); g.ellipse(0, -8, 3, 1.5, 0, 0, Math.PI * 2); g.stroke();
      } else { // flowers
        const cols = pal.flowers.length ? pal.flowers : ['#e0e4ee'];
        for (let i = 0; i < 3; i++) {
          const fx = (hash(variant * 5 + i, 121) - 0.5) * 18;
          const fy = (hash(i, variant * 7 + 123) - 0.5) * 8 - 2;
          g.strokeStyle = pal.edge;
          g.lineWidth = 1.3;
          g.beginPath(); g.moveTo(fx, fy + 4); g.lineTo(fx, fy - 1); g.stroke();
          g.fillStyle = cols[(variant + i) % cols.length];
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            g.beginPath();
            g.ellipse(fx + Math.cos(a) * 2.2, fy - 2.5 + Math.sin(a) * 2.2, 1.6, 1, a, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = '#f0d264';
          g.beginPath(); g.arc(fx, fy - 2.5, 1.1, 0, Math.PI * 2); g.fill();
        }
      }
    });
  }

  // deterministic decor item list, built once (world layout never changes).
  // hash() is biased low for small structured inputs, so cluster rolls go
  // through a golden-ratio scramble for a uniform spread.
  const decorItems = [];
  (function buildDecor() {
    const h2 = (a, b) => (hash(a, b) * 43.9871) % 1;
    const CS = 3; // cluster cell size in tiles
    for (let cy = 0; cy < Math.ceil(D.WORLD_H / CS); cy++) {
      for (let cx = 0; cx < Math.ceil(D.WORLD_W / CS); cx++) {
        const hc = h2(cx * 17 + 3, cy * 23 + 7);
        if (hc < 0.34) continue; // deliberate empty meadows
        const sx = cx * CS + h2(cx + 1, cy + 5) * CS;
        const sy = cy * CS + h2(cy + 9, cx + 2) * CS;
        const n = 3 + Math.floor(hc * 97) % 5; // 3–7 items with falloff
        for (let i = 0; i < n; i++) {
          const a = h2(cx * 31 + i, cy * 13 + 1) * Math.PI * 2;
          const r = Math.sqrt(h2(i * 7 + 2, cx * 5 + cy)) * 1.9;
          const px = sx + Math.cos(a) * r;
          const py = sy + Math.sin(a) * r * 0.8;
          if (px < 0.4 || py < 0.4 || px > D.WORLD_W - 0.4 || py > D.WORLD_H - 0.4) continue;
          if (Math.abs(px - POND.cx) < POND.rx + 0.9 && Math.abs(py - POND.cy) < POND.ry + 0.9) continue;
          const hk = h2(Math.round(px * 23), Math.round(py * 29));
          let kind, variant = Math.floor(hk * 61) % 3;
          if (i === 0 || hk < 0.42) kind = 'tree';
          else if (hk < 0.58) kind = 'bush';
          else if (hk < 0.7) kind = 'rock';
          else if (hk < 0.9) kind = 'flower';
          else kind = 'stump';
          decorItems.push({
            x: px, y: py, kind, variant,
            hue: Math.floor(h2(Math.round(py * 31), Math.round(px * 37)) * 47) % 3,
            s: 0.82 + h2(Math.round(px * 41), Math.round(py * 43)) * 0.42,
          });
        }
      }
    }
    decorItems.sort((a, b) => (a.x + a.y) - (b.x + b.y));
  })();

  // is this decor item currently visible? (owned farmland stays groomed;
  // items also yield to buildings, soil and crops)
  function decorVisible(state, it) {
    const tx = Math.floor(it.x), ty = Math.floor(it.y);
    const pi = Game.parcelAt(tx, ty);
    if (pi >= 0 && state.unlockedParcels.includes(pi)) return false;
    const t = state.tiles[ty] && state.tiles[ty][tx];
    if (!t || t.k !== 'grass' || t.obj || t.crop) return false;
    return true;
  }

  function drawDecorItem(state, i) {
    const it = decorItems[i];
    const c = proj(it.x, it.y);
    if (it.kind === 'tree') {
      let sway = Math.sin(time * 1.2 + it.x * 0.6 + it.y) * 0.022;
      // storm gusts: trees whip at 2x crop amplitude, same traveling phase
      if (stormK > 0) sway += Math.sin(time * 3 - (it.x + it.y) * 0.6) * 0.044 * stormK;
      shadow(c.x + 3, c.y + 1, 16 * it.s, 6.5 * it.s);
      blit(treeSprite(state, it.variant, it.hue), c.x, c.y, sway, it.s);
    } else if (it.kind === 'flower') {
      if (state.season === 3) return;
      blit(decorSprite(state, 'flower', it.variant), c.x, c.y, 0, it.s);
    } else {
      if (it.kind === 'bush') shadow(c.x, c.y + 1, 11 * it.s, 4.5 * it.s);
      else if (it.kind === 'rock') shadow(c.x, c.y + 1, 9 * it.s, 3.6 * it.s);
      blit(decorSprite(state, it.kind, it.variant), c.x, c.y, 0, it.s);
    }
  }

  // ---------------- animals (hand-drawn vector sprites + micro-FSM poses) ----------------
  const POSE_DEFAULT = { moving: true, peck: 0, sleep: false, hop: 0 };
  function legs(cx, cy, w, t, col, moving) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    const step = moving ? Math.sin(t * 8) * 1.5 : 0; // legs animate ONLY when moving
    ctx.beginPath(); ctx.moveTo(cx - w, cy); ctx.lineTo(cx - w + step, cy + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w, cy); ctx.lineTo(cx + w - step, cy + 6); ctx.stroke();
  }

  function drawAnimalSprite(type, sx, sy, t, uid, flip, pose) {
    pose = pose || POSE_DEFAULT;
    ctx.save();
    ctx.translate(sx, sy);
    if (flip) ctx.scale(-1, 1);
    const moving = pose.moving;
    const bob = moving ? Math.abs(Math.sin(t * 5 + uid)) * 1.2 + (pose.hop || 0) : 0;
    ctx.translate(0, -bob);
    shadow(0, 7 + bob, 11, 4);
    if (pose.sleep) {                                 // sit: squash body, hide legs
      ctx.translate(0, 2.2);
      ctx.scale(1, 0.82);
    } else if (pose.peck > 0) {                       // head-dip toward the ground
      ctx.translate(0, pose.peck * 1.6);
      ctx.rotate(pose.peck * 0.22);
    }
    const legsOn = !pose.sleep;

    switch (type) {
      case 'chicken': {
        if (legsOn) legs(0, 3, 3, t + uid, '#c9862b', moving);
        ctx.fillStyle = '#ece5d8';
        ctx.beginPath(); ctx.ellipse(0, -2, 7, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-6, -5, 3.5, 3, -0.6, 0, Math.PI * 2); ctx.fill(); // tail
        ctx.beginPath(); ctx.arc(6, -8, 3.6, 0, Math.PI * 2); ctx.fill(); // head
        ctx.fillStyle = '#c0392b';
        ctx.beginPath(); ctx.arc(5, -12, 1.4, 0, Math.PI * 2); ctx.arc(7, -12.4, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(6.5, -5.5, 1.2, 1.8, 0, 0, Math.PI * 2); ctx.fill(); // wattle
        ctx.fillStyle = '#d9912b';
        ctx.beginPath(); ctx.moveTo(9, -8); ctx.lineTo(12.5, -7); ctx.lineTo(9, -6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#2d2620';
        ctx.beginPath(); ctx.arc(7, -8.5, 0.9, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'duck': {
        if (legsOn) legs(0, 3, 3, t + uid, '#c9862b', moving);
        ctx.fillStyle = '#9c7a4e';
        ctx.beginPath(); ctx.ellipse(0, -2, 8, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2e6e46';
        ctx.beginPath(); ctx.arc(6.5, -8, 3.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d9b23c';
        ctx.beginPath(); ctx.ellipse(11, -7.5, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f0ead8';
        ctx.beginPath(); ctx.ellipse(-2, -3, 4, 2.5, 0.3, 0, Math.PI * 2); ctx.fill(); // wing
        ctx.fillStyle = '#2d2620';
        ctx.beginPath(); ctx.arc(7.5, -8.6, 0.9, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'cow': {
        if (legsOn) { legs(-3, 4, 4, t + uid, '#8a8178', moving); legs(5, 4, 3, t + uid + 1, '#8a8178', moving); }
        ctx.fillStyle = '#ece5d8';
        rr(-11, -9, 21, 13, 6);
        ctx.fill();
        ctx.fillStyle = '#3d3833';
        ctx.beginPath(); ctx.ellipse(-4, -5, 4, 3, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(4, -1, 3, 2.4, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ece5d8';
        rr(7, -13, 9, 9, 4); // head
        ctx.fill();
        ctx.fillStyle = '#d8a8a0';
        rr(9, -8, 6, 4, 2); // muzzle
        ctx.fill();
        ctx.fillStyle = '#c9c2b8';
        ctx.beginPath(); ctx.ellipse(7, -13, 2.5, 1.4, -0.6, 0, Math.PI * 2); ctx.fill(); // ear
        ctx.fillStyle = '#2d2620';
        ctx.beginPath(); ctx.arc(11, -10.5, 1, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'goat': {
        if (legsOn) legs(-2, 4, 4, t + uid, '#8a8178', moving);
        ctx.fillStyle = '#b3aca2';
        rr(-10, -8, 18, 11, 5);
        ctx.fill();
        rr(6, -13, 8, 8, 3.5);
        ctx.fill();
        ctx.strokeStyle = '#75695a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(8, -13); ctx.quadraticCurveTo(6, -18, 3.5, -17); ctx.stroke(); // horn
        ctx.fillStyle = '#9a9187';
        ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(10, -1); ctx.lineTo(12, -4); ctx.closePath(); ctx.fill(); // beard
        ctx.fillStyle = '#2d2620';
        ctx.beginPath(); ctx.arc(10, -9.5, 1, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'sheep': {
        if (legsOn) legs(-2, 4, 4, t + uid, '#5c554c', moving);
        ctx.fillStyle = '#eee8dc';
        ctx.beginPath();
        ctx.arc(-6, -4, 6.5, 0, Math.PI * 2);
        ctx.arc(1, -6.5, 7, 0, Math.PI * 2);
        ctx.arc(6, -3, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5c554c';
        rr(8, -11, 7, 7, 3);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(12.5, -8.5, 0.9, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'pig': {
        if (legsOn) legs(-2, 4, 4, t + uid, '#c98a86', moving);
        ctx.fillStyle = '#e0a8a0';
        rr(-11, -8, 20, 12, 6);
        ctx.fill();
        rr(6, -10, 8, 8, 3.5);
        ctx.fill();
        ctx.fillStyle = '#c9857c';
        ctx.beginPath(); ctx.ellipse(12.5, -6, 2.4, 1.9, 0, 0, Math.PI * 2); ctx.fill(); // snout
        ctx.beginPath(); ctx.moveTo(7, -10); ctx.lineTo(9, -13.5); ctx.lineTo(11, -10); ctx.closePath(); ctx.fill(); // ear
        ctx.strokeStyle = '#c9857c';
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(-11.5, -5, 2.4, 0.5, 4.4); ctx.stroke(); // curly tail
        ctx.fillStyle = '#2d2620';
        ctx.beginPath(); ctx.arc(9.5, -7, 0.9, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  /* ---------------- animal micro-FSM (render-side, zero save impact) ----------------
     idle → peck/graze (60% — most of the "alive" feeling) or walk to a new
     yard spot; birds hop, livestock amble; legs only swing while walking.
     Night & sickness force the sleep pose; a nearby tap startles into flee. */
  const seenUids = new Set();
  const isBird = t => t === 'chicken' || t === 'duck';
  function updateAnimals(state, dt) {
    seenUids.clear();
    const night = SUN.dark > 0.5;
    for (let i = 0; i < state.animals.length; i++) {
      const a = state.animals[i];
      const home = state.buildings[a.home];
      if (!home) continue;
      seenUids.add(a.uid);
      const def = D.BUILDINGS[home.type];
      let anim = animalAnim.get(a.uid);
      if (!anim) {
        anim = {
          x: home.x + def.w / 2 + (Math.random() - 0.5), y: home.y + def.h + 0.4,
          tx: 0, ty: 0, timer: Math.random() * 2, st: 'idle', flip: Math.random() < 0.5, wp: 0,
        };
        anim.tx = anim.x; anim.ty = anim.y;
        animalAnim.set(a.uid, anim);
      }
      const bird = isBird(a.type);
      const asleep = a.sick || night;
      if (asleep) { anim.st = 'sleep'; }
      else if (anim.st === 'sleep') { anim.st = 'idle'; anim.timer = Math.random() * 1.5; }
      anim.timer -= dt;
      if (anim.st === 'walk' || anim.st === 'flee') {
        const dx = anim.tx - anim.x, dy = anim.ty - anim.y;
        const dist = Math.hypot(dx, dy);
        const spd = (bird ? 0.5 : 0.3) * (anim.st === 'flee' ? 2.8 : 1);
        if (dist < 0.05 || (anim.st === 'flee' && anim.timer <= 0)) {
          anim.st = 'idle';
          anim.timer = 0.8 + Math.random() * 2.2;
          anim.wp = 0;
        } else {
          anim.x += dx / dist * spd * dt;
          anim.y += dy / dist * spd * dt;
          anim.flip = dx < 0;
          if (bird) anim.wp += dt * (anim.st === 'flee' ? 9 : 4.5); // hop cadence
        }
      } else if (anim.st !== 'sleep' && anim.timer <= 0) {
        if (anim.st === 'idle' && Math.random() < 0.6) {
          anim.st = 'peck';
          anim.timer = 2 + Math.random() * 2;
        } else if (anim.st === 'idle') {
          anim.st = 'walk';
          anim.tx = home.x + Math.random() * def.w + (Math.random() - 0.5) * 1.2;
          anim.ty = home.y + def.h + 0.1 + Math.random() * 0.9;
        } else {
          anim.st = 'idle';
          anim.timer = 1 + Math.random() * 2;
        }
      }
      if (anim.st === 'idle' && Math.random() < dt * 0.1) anim.flip = !anim.flip; // head-turn
      // pecking chickens kick up a soil fleck now and then
      if (anim.st === 'peck' && bird && cam.z >= 0.55 && Math.random() < dt * 1.1) {
        const p = proj(anim.x, anim.y);
        spawnP(p.x + (anim.flip ? -8 : 8), p.y - 2, {
          shape: 'dot', col: '#6b4e30', size: 1.2, g: 500,
          vx: (Math.random() - 0.5) * 30, vy: -40, life: 0.3,
        });
      }
    }
    for (const key of animalAnim.keys()) if (!seenUids.has(key) && key !== 99) animalAnim.delete(key);
  }

  const posePool = { moving: false, peck: 0, sleep: false, hop: 0 };
  function drawAnimal(state, i) {
    const a = state.animals[i];
    if (!a) return;
    const anim = animalAnim.get(a.uid);
    if (!anim) return;
    const p = proj(anim.x, anim.y);
    const bird = isBird(a.type);
    posePool.moving = anim.st === 'walk' || anim.st === 'flee';
    posePool.sleep = anim.st === 'sleep';
    // peck/graze: birds bob at 2Hz, livestock munch at ~0.5Hz
    posePool.peck = anim.st === 'peck'
      ? Math.max(0, Math.sin(time * (bird ? 12.6 : 3.2) + a.uid)) : 0;
    posePool.hop = posePool.moving && bird ? Math.abs(Math.sin(anim.wp * Math.PI)) * 3 : 0;
    drawAnimalSprite(a.type, p.x, p.y, time, a.uid, anim.flip, posePool);
    if (posePool.sleep && !a.sick) { // drifting "z"
      const zk = (time * 0.45 + a.uid * 0.37) % 1;
      if (zk < 0.75) {
        ctx.globalAlpha = 0.7 * (1 - zk / 0.75);
        ctx.fillStyle = '#e8ecff';
        ctx.font = '900 8px Nunito, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('z', p.x + 8 + zk * 6, p.y - 16 - zk * 12);
        ctx.globalAlpha = 1;
      }
    }
    if (a.sick) { // green sick bubble
      ctx.fillStyle = 'rgba(140,180,80,.9)';
      ctx.beginPath(); ctx.arc(p.x + 9, p.y - 20, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a5f22';
      ctx.font = '900 7px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('zz', p.x + 9, p.y - 19);
    } else if (a.prodProg >= 1) { // ready dot
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x + 10, p.y - 20, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d9912b';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x + 10, p.y - 20, 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#c2611a';
      ctx.beginPath(); ctx.arc(p.x + 10, p.y - 20, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ---------------- dawn delivery cart (animation.md §3.4) ----------------
     Pure renderer theater: when state.t crosses ~0.03 a two-frame cart rolls
     west→east along the south road edge over ~8s, pauses a beat at the main
     lane's mouth, and exits. If any order was fulfilled since the previous
     dawn it carries crates. Zero game-state writes. */
  let cart = null, cartPrevT = null, cartOrdersPrev = -1;
  const CART_Y = 14.55, CART_SPEED = 3.2;

  function updateCart(state, dt) {
    const t = state.t;
    if (cartOrdersPrev < 0 && state.stats) cartOrdersPrev = state.stats.orders || 0;
    if (cartPrevT !== null && cartPrevT < 0.03 && t >= 0.03 && t - cartPrevT < 0.5) {
      const orders = state.stats ? state.stats.orders || 0 : 0;
      cart = { x: -2.5, crates: orders > cartOrdersPrev, paused: false, pausing: 0 };
      cartOrdersPrev = orders;
    }
    cartPrevT = t;
    if (!cart) return;
    if (cart.pausing > 0) {
      cart.pausing -= dt;
    } else {
      cart.x += dt * CART_SPEED;
      if (!cart.paused && cart.x >= 11.2) { // a beat at the farm gate
        cart.paused = true;
        cart.pausing = 1;
        const p = proj(cart.x, CART_Y);
        burstDust(p.x - 6, p.y - 4, 4, 5);
      }
      if (cart.x > D.WORLD_W + 2.5) cart = null;
    }
  }

  function drawCart(state) {
    if (!cart) return;
    const p = proj(cart.x, CART_Y);
    const moving = cart.pausing <= 0;
    const bob = moving ? Math.sin(time * 15) * 0.7 : 0;
    shadow(p.x, p.y + 2, 19, 6);
    // wheels first (behind the bed), two-frame spoke flip while rolling
    const spin = moving ? (Math.floor(time * 8) % 2) : 0;
    for (const wx of [-7.5, 7.5]) {
      ctx.fillStyle = '#3b3229';
      ctx.beginPath(); ctx.arc(p.x + wx, p.y - 3.4, 4.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#181310';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x + wx, p.y - 3.4, 4.3, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#c9b489';
      ctx.lineWidth = 1.1;
      const a = spin ? Math.PI / 4 : 0;
      ctx.beginPath();
      ctx.moveTo(p.x + wx - Math.cos(a) * 3.1, p.y - 3.4 - Math.sin(a) * 3.1);
      ctx.lineTo(p.x + wx + Math.cos(a) * 3.1, p.y - 3.4 + Math.sin(a) * 3.1);
      ctx.moveTo(p.x + wx + Math.sin(a) * 3.1, p.y - 3.4 - Math.cos(a) * 3.1);
      ctx.lineTo(p.x + wx - Math.sin(a) * 3.1, p.y - 3.4 + Math.cos(a) * 3.1);
      ctx.stroke();
    }
    // cargo bed
    const by = p.y - 10.5 + bob;
    ctx.fillStyle = '#8a6440';
    rr(p.x - 12.5, by, 25, 8.5, 2);
    ctx.fill();
    ctx.strokeStyle = '#5b3e25';
    ctx.lineWidth = 1.3;
    rr(p.x - 12.5, by, 25, 8.5, 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(91,62,37,.55)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x - 11, by + 4.2); ctx.lineTo(p.x + 11, by + 4.2); ctx.stroke();
    // hitch bobbing ahead of the cart (it travels east)
    ctx.strokeStyle = '#5b3e25';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + 12.5, by + 6);
    ctx.lineTo(p.x + 20, by + 8 + bob * 1.6);
    ctx.stroke();
    // crates when yesterday's orders shipped
    if (cart.crates) {
      for (const [cx2, cy2, s2] of [[-6.5, -7.5, 7], [1.5, -6.5, 6]]) {
        ctx.fillStyle = '#c9974f';
        rr(p.x + cx2, by + cy2, s2, s2, 1.2);
        ctx.fill();
        ctx.strokeStyle = '#6d4c2e';
        ctx.lineWidth = 1.1;
        rr(p.x + cx2, by + cy2, s2, s2, 1.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x + cx2, by + cy2 + s2 / 2); ctx.lineTo(p.x + cx2 + s2, by + cy2 + s2 / 2);
        ctx.stroke();
      }
    }
  }

  // ---------------- fireflies (summer dusk/night, pooled) ----------------
  const flies = [];
  for (let i = 0; i < 8; i++) {
    flies.push({
      gx: 4 + hash(i * 7 + 1, 3) * 13,
      gy: 4 + hash(2, i * 11 + 5) * 9,
      ph: i * 1.9,
      sp: 0.4 + (i % 5) * 0.12,
    });
  }
  function drawFireflies(state) {
    if (state.season !== 1) return;
    const act = Math.max(SUN.dusk, SUN.dark);
    if (act < 0.05) return;
    for (const f of flies) {
      const wx = f.gx + Math.sin(time * f.sp + f.ph) * 0.6;
      const wy = f.gy + Math.cos(time * f.sp * 0.8 + f.ph) * 0.5;
      const p = proj(wx, wy);
      const pulse = Math.sin(time * 2.2 + f.ph) * 0.5 + 0.5;
      const py = p.y - 22 - Math.sin(time * 0.7 + f.ph) * 9;
      ctx.globalAlpha = act * (0.3 + 0.7 * pulse);
      ctx.fillStyle = '#ffefa8';
      ctx.fillRect(p.x - 1, py - 1, 2.4, 2.4);
      if (pulse > 0.55) addLight(p.x, py, 16, sprites.lightFly, 0.5 * act * pulse, false, false);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- ambient life ----------------
  function drawAmbient(state) {
    if (state.season === 0 || state.season === 1) {
      for (let i = 0; i < 5; i++) {
        const seed = i * 217.7;
        const range = proj(D.WORLD_W, D.WORLD_H).y;
        const bx = ((seed * 3 + time * 26 + Math.sin(time * 0.9 + i * 2) * 60) % (TW * D.WORLD_W)) - TW * D.WORLD_W / 2;
        const by = ((seed * 7) % range) + Math.sin(time * 2.4 + i) * 24;
        const flap = Math.abs(Math.sin(time * 9 + i * 3));
        ctx.fillStyle = ['#c46a8a', '#d9b23c', '#9a8ab8', '#7ab8c4', '#cc8a6a'][i];
        ctx.beginPath();
        ctx.ellipse(bx - 3 * flap, by, 4 * flap + 1, 3, -0.5, 0, Math.PI * 2);
        ctx.ellipse(bx + 3 * flap, by, 4 * flap + 1, 3, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (state.season === 2) {
      ctx.fillStyle = 'rgba(186, 92, 38, .8)';
      for (let i = 0; i < 8; i++) {
        const seed = i * 133.3;
        const range = proj(D.WORLD_W, D.WORLD_H).y;
        const lx = ((seed * 5 + time * 34 + Math.sin(time * 1.4 + i) * 30) % (TW * D.WORLD_W)) - TW * D.WORLD_W / 2;
        const ly = ((seed * 11 + time * 46) % range);
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(time * 2 + i);
        ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
  }

  // ---------------- weather particles (screen space) ----------------
  function drawWeather(state) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = state.weather;

    if (w === 'cloud' || w === 'storm') {
      ctx.fillStyle = 'rgba(40,50,70,.10)';
      for (let i = 0; i < 3; i++) {
        const cx2 = ((time * 12 + i * 500) % (vw + 600)) - 300;
        const cy2 = 80 + i * (vh / 3.2);
        ctx.beginPath(); ctx.ellipse(cx2, cy2, 220, 90, 0, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (w === 'rain' || w === 'storm') {
      ctx.strokeStyle = 'rgba(150, 190, 235, .5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < 70; i++) {
        const seed = i * 137.5;
        const rx = ((seed * 7 + time * 480) % (vw + 100)) - 50;
        const ry = ((seed * 13 + time * 820) % (vh + 60)) - 30;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 4, ry + 14);
      }
      ctx.stroke();
      if (w === 'storm') {
        ctx.fillStyle = 'rgba(20, 26, 46, .22)';
        ctx.fillRect(0, 0, vw, vh);
        // sky flash now comes from REAL lightning strikes — see drawBolts()
      }
    }

    if (w === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 50; i++) {
        const seed = i * 91.3;
        const sx = ((seed * 5 + time * 30 + Math.sin(time + i) * 40) % (vw + 40)) - 20;
        const sy = ((seed * 11 + time * 55) % (vh + 40)) - 20;
        ctx.beginPath(); ctx.arc(sx, sy, 1.5 + (i % 3), 0, Math.PI * 2); ctx.fill();
      }
    }

    if (w === 'drought') {
      ctx.fillStyle = 'rgba(230, 140, 50, .08)';
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  /* ---------------- dusk & night: half-res lightmap, ONE multiply pass ----------------
     The lightmap base carries the ambient grade (warm dusk → cool blue-violet
     night) and baked radial light sprites are added on top ('lighter'), so
     ambient + local lights reach the screen in a single full-screen multiply.
     Small additive halos give the emitters bloom. */
  let ambKey = '', ambGrad = null;
  const AMB_DAY = [255, 253, 248];
  function drawNight(state) {
    const dusk = SUN.dusk, dark = SUN.dark;
    if (dusk < 0.01 && dark < 0.01) { lightN = 0; return; }

    lmx.setTransform(1, 0, 0, 1, 0, 0);
    lmx.globalCompositeOperation = 'source-over';
    lmx.globalAlpha = 1;
    if (dark > 0.98) { // deep night: near-uniform ambient — solid fill is far cheaper
      lmx.fillStyle = 'rgb(122,130,182)'; // moonlit, not pitch — the farm stays readable
      lmx.fillRect(0, 0, lm.width, lm.height);
    } else {
      const key = Math.round(dusk * 24) + ':' + Math.round(dark * 24) + ':' + lm.height;
      if (key !== ambKey) { // ambient gradient rebuilt only when the light changes
        ambKey = key;
        ambGrad = lmx.createLinearGradient(0, 0, 0, lm.height);
        const top = mix3(AMB_DAY, [255, 196, 120], [138, 146, 196], dusk, dark);
        const mid = mix3(AMB_DAY, [250, 176, 138], [120, 128, 180], dusk, dark);
        const bot = mix3(AMB_DAY, [206, 152, 188], [106, 114, 168], dusk, dark);
        ambGrad.addColorStop(0, `rgb(${top[0] | 0},${top[1] | 0},${top[2] | 0})`);
        ambGrad.addColorStop(0.5, `rgb(${mid[0] | 0},${mid[1] | 0},${mid[2] | 0})`);
        ambGrad.addColorStop(1, `rgb(${bot[0] | 0},${bot[1] | 0},${bot[2] | 0})`);
      }
      lmx.fillStyle = ambGrad;
      lmx.fillRect(0, 0, lm.width, lm.height);
    }

    // additive baked light sprites (never createRadialGradient per frame)
    lmx.globalCompositeOperation = 'lighter';
    const hdpr = dpr / 2;
    for (let i = 0; i < lightN; i++) {
      const L = lightPool[i];
      const px = ((L.x - cam.x) * cam.z + vw / 2) * hdpr;
      const py = ((L.y - cam.y) * cam.z + vh / 2) * hdpr;
      let r = L.r * cam.z * hdpr;
      if (L.fl) r *= 1 + Math.sin(time * 9 + L.x) * 0.04; // inhabited flicker
      lmx.globalAlpha = L.a;
      lmx.drawImage(L.spr, px - r, py - r, r * 2, r * 2);
    }
    lmx.globalAlpha = 1;

    // composite: the ONE full-screen blend pass. Two-step (nearest upscale to a
    // full-res scratch, then 1:1 multiply) — measured cheaper than a scaled
    // multiply on software raster; on GPU both are trivial blend quads.
    lmFullX.imageSmoothingEnabled = false;
    lmFullX.drawImage(lm, 0, 0, lmFull.width, lmFull.height);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(lmFull, 0, 0, vw, vh);

    // bloom: small additive halos at the bright emitters only
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lightN; i++) {
      const L = lightPool[i];
      if (!L.halo) continue;
      const px = (L.x - cam.x) * cam.z + vw / 2;
      const py = (L.y - cam.y) * cam.z + vh / 2;
      const r = L.r * 0.42 * cam.z;
      ctx.globalAlpha = L.a * 0.5;
      ctx.drawImage(L.spr, px - r, py - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // stars
    if (dark > 0.5) {
      ctx.fillStyle = `rgba(255,255,255,${(dark - 0.5) * 1.1})`;
      for (let i = 0; i < 24; i++) {
        const sx = (i * 193.7) % vw, sy = (i * 97.3) % (vh * 0.5);
        if (Math.sin(time * 2 + i) > 0) { ctx.beginPath(); ctx.arc(sx, sy, 1.1, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    lightN = 0;
  }

  // warm-center grade + cool vignette + fine grain, pre-composed on resize
  function drawGrade() {
    if (!gradeCanvas) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, vw * dpr / 2 | 0);
      c.height = Math.max(1, vh * dpr / 2 | 0);
      const x = c.getContext('2d');
      // fine grain (kills the flat-vector-fill feel; very subtle)
      const im = x.createImageData(c.width, c.height);
      for (let i = 0; i < im.data.length; i += 4) {
        im.data[i] = im.data[i + 1] = im.data[i + 2] = 128 + (Math.random() * 26 - 13) | 0;
        im.data[i + 3] = 12;
      }
      x.putImageData(im, 0, 0);
      const g = x.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.38, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.72);
      g.addColorStop(0, 'rgba(255,236,180,.05)');   // warm center lift
      g.addColorStop(0.55, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(34,26,66,.20)');      // cool corners, never soot
      x.fillStyle = g;
      x.fillRect(0, 0, c.width, c.height);
      gradeCanvas = c;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(gradeCanvas, 0, 0, vw, vh);
    ctx.imageSmoothingEnabled = true;
  }

  // ---------------- fx rendering ----------------
  // ground-level fx: soak stains, furrow reveals, shockwave rings.
  // Drawn right after the ground blit so crops & buildings stack on top.
  function drawGroundFx(dt) {
    for (let i = soaks.length - 1; i >= 0; i--) {
      const s = soaks[i];
      s.age += dt;
      if (s.age > 0.9) { soaks.splice(i, 1); continue; }
      const k = s.age / 0.9;
      ctx.fillStyle = `rgba(30,16,6,${0.32 * (1 - k)})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 6 + k * 30, (6 + k * 30) * 0.5, 0, 0, PI2);
      ctx.fill();
    }
    // raked furrow reveal: strokes sweep on over the freshly-baked soil tile
    for (let i = tillFx.length - 1; i >= 0; i--) {
      const t = tillFx[i];
      t.age += dt;
      if (t.age > 0.55) { tillFx.splice(i, 1); continue; }
      const c = proj(t.x + 0.5, t.y + 0.5);
      if (t.age < 0.05) { // 1-frame impact flash on the diamond
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        diamond(c.x, c.y, TW * 0.9, TH * 0.9);
        ctx.fill();
      }
      const fade = t.age > 0.42 ? 1 - (t.age - 0.42) / 0.13 : 1;
      ctx.strokeStyle = `rgba(24,12,4,${0.5 * fade})`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let f = 0; f < 4; f++) {
        const start = f * 0.06;                      // staggered 60ms apart
        const kk = Math.min(1, Math.max(0, (t.age - start) / 0.09));
        if (kk <= 0) continue;
        const u = (f + 0.5) / 4;
        const A = proj(t.x + u, t.y + 0.05), B = proj(t.x + u, t.y + 0.95);
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(A.x + (B.x - A.x) * kk, A.y + (B.y - A.y) * kk);
        ctx.stroke();
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += r.vr * dt;
      r.a -= r.va * dt;
      if (r.a <= 0) { rings.splice(i, 1); continue; }
      ctx.strokeStyle = r.gold ? `rgba(255,224,130,${r.a})` : `rgba(255,240,200,${r.a})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.5, 0, 0, PI2);
      ctx.stroke();
    }
  }

  // harvest ghost crops + hoe wedges (drawn above the entity pass)
  function drawJuice(dt) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      if (g.dead) { ghosts.splice(i, 1); continue; }
      const f = cropFxMap.get(g.x + '|' + g.y);
      const c = proj(g.x + 0.5, g.y + 0.5);
      ctx.save();
      ctx.translate(c.x, c.y + 2 + (f ? f.dip : 0));
      ctx.scale(g.sx, g.sy);
      ctx.globalAlpha = g.alpha;
      drawTemplate(g.def, 3, false);
      if (g.flash > 0) { // 1-frame white (gold when doubled) impact flash
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g.gold ? `rgba(255,214,90,${g.flash * 0.9})` : `rgba(255,255,255,${g.flash * 0.8})`;
        ctx.beginPath(); ctx.arc(0, -8, 20, 0, PI2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        g.flash = Math.max(0, g.flash - 0.4);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    for (let i = wedges.length - 1; i >= 0; i--) {
      const w = wedges[i];
      if (w.dead) { wedges.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.rot);
      ctx.scale(w.sc, w.sc);
      ctx.globalAlpha = w.alpha;
      ctx.fillStyle = '#6b7178';                     // steel blade
      ctx.beginPath();
      ctx.moveTo(-7, 0); ctx.lineTo(7, -2); ctx.lineTo(5, 6); ctx.lineTo(-4, 7);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a9198';
      ctx.fillRect(-7, -1, 13, 2.4);
      ctx.strokeStyle = '#7a5a34';                   // handle stub
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(2, -3); ctx.lineTo(12, -16); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // item fliers: world-launched, screen-space landing on the market button.
  // Re-aimed every frame so they land even while the camera moves.
  let mktEl = null;
  function marketPoint() {
    if (!mktEl) mktEl = document.getElementById('btn-market');
    if (!mktEl) return { x: vw - 34, y: vh - 46 };
    const r = mktEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.35 };
  }
  function drawFliers() {
    if (!fliers.length) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const b = marketPoint();
    for (let i = fliers.length - 1; i >= 0; i--) {
      const fl = fliers[i];
      if (fl.dead) { fliers.splice(i, 1); continue; }
      const a = tileToScreen(fl.wx, fl.wy);
      const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 120;
      const t = fl.t, u = 1 - t;
      const x = u * u * a.x + 2 * u * t * mx + t * t * b.x;
      const y = u * u * (a.y - 18) + 2 * u * t * my + t * t * b.y;
      fl.trail.push({ x, y });
      if (fl.trail.length > 10) fl.trail.shift();
      ctx.globalCompositeOperation = 'lighter';      // additive amber trail
      ctx.fillStyle = fl.gold ? '#ffe082' : '#ffd77a';
      for (let k2 = 0; k2 < fl.trail.length; k2++) {
        const p = fl.trail[k2];
        ctx.globalAlpha = (k2 / fl.trail.length) * 0.45;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 + k2 * 0.5, 0, PI2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const s = 1 - t * 0.45;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.rotate(t * 2.5);
      ctx.fillStyle = fl.def.color;                  // drawn fruit, not emoji
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, PI2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath(); ctx.arc(-2.4, -2.4, 2, 0, PI2); ctx.fill();
      ctx.fillStyle = fl.def.leaf;
      ctx.beginPath(); ctx.ellipse(0, -6.5, 3.4, 1.9, 0, 0, PI2); ctx.fill();
      ctx.restore();
    }
  }

  // lightning bolts + sky flash — drawn AFTER the night multiply so they glow
  function drawBolts(dt) {
    if (skyFlash > 0.02) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(235,240,255,${0.2 * skyFlash})`;
      ctx.fillRect(0, 0, vw, vh * 0.55);
      ctx.fillStyle = `rgba(235,240,255,${0.09 * skyFlash})`;
      ctx.fillRect(0, vh * 0.55, vw, vh * 0.45);
      skyFlash = Math.max(0, skyFlash - dt * 6);     // short double-frame flash
    }
    if (!bolts.length) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = bolts.length - 1; i >= 0; i--) {
      const bl = bolts[i];
      bl.age += dt;
      if (bl.age > 0.18) { bolts.splice(i, 1); continue; }
      const sx = (bl.x - cam.x) * cam.z + vw / 2;
      const sy = (bl.y - cam.y) * cam.z + vh / 2;
      // hot plateau then quick decay, with a strobe flicker on the tail
      const k = Math.min(1, (1 - bl.age / 0.18) * 1.9) * (0.8 + 0.2 * Math.sin(bl.age * 110));
      const pts = [
        [sx + bl.j1 * 1.6, 0],
        [sx + bl.j1, sy * bl.m1],
        [sx + bl.j2, sy * bl.m2],
        [sx, sy],
      ];
      for (const [w2, col] of [[9, `rgba(185,208,255,${0.5 * k})`], [4.5, `rgba(235,242,255,${0.75 * k})`], [2, `rgba(255,255,255,${k})`]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w2;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let p2 = 1; p2 < 4; p2++) ctx.lineTo(pts[p2][0], pts[p2][1]);
        ctx.stroke();
      }
      // local radial flash at the strike point
      ctx.fillStyle = `rgba(255,250,220,${0.5 * k})`;
      ctx.beginPath(); ctx.ellipse(sx, sy, 26 * (1 - k * 0.4), 13 * (1 - k * 0.4), 0, 0, PI2); ctx.fill();
    }
  }

  // dawn god-rays: warm translucent wedges from the top-left, 'screen' blend
  function drawGodRays(state) {
    if (state.t >= 0.07 || SUN.dark > 0.4) return;
    const k = 1 - state.t / 0.07;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    const R = vw + vh;
    for (let i = 0; i < 4; i++) {
      const a0 = 0.34 + i * 0.24 + Math.sin(time * 0.12 + i * 1.7) * 0.035;
      const a1 = a0 + 0.09 + (i % 2) * 0.05;
      ctx.fillStyle = `rgba(255,222,150,${(0.075 + (i % 2) * 0.03) * k})`;
      ctx.beginPath();
      ctx.moveTo(-30, -30);
      ctx.lineTo(-30 + Math.cos(a0) * R, -30 + Math.sin(a0) * R);
      ctx.lineTo(-30 + Math.cos(a1) * R, -30 + Math.sin(a1) * R);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------- season transition: crossfade + emblem sweep ----------------
     The old hard palette cut was the most jarring frame in the game. On season
     flip we keep the last-rendered frame (old palette) and fade it out over the
     freshly-rebaked new-season world, while ~40 season emblems sweep through. */
  let visSeason = -1;
  let seasonFadeC = null;
  const seasonFade = { a: 0, hold: false };
  function checkSeasonFlip(state) {
    if (state.season === visSeason) return;
    const first = visSeason < 0;
    visSeason = state.season;
    if (first || !canvas.width) return;
    if (!seasonFadeC) seasonFadeC = document.createElement('canvas');
    seasonFadeC.width = canvas.width;
    seasonFadeC.height = canvas.height;
    seasonFadeC.getContext('2d').drawImage(canvas, 0, 0);   // capture the old-season frame
    Tween.kill(seasonFade);
    seasonFade.a = 1;
    seasonFade.hold = true; // fade starts once the progressive ground rebake lands
    emblems.length = 0;
    for (let i = 0; i < 40; i++) {
      emblems.push({
        x: -60 - Math.random() * vw * 0.7, y: Math.random() * vh - vh * 0.25,
        vx: 190 + Math.random() * 150, vy: 60 + Math.random() * 80,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6,
        age: -Math.random() * 0.9, life: 2.2, kind: state.season,
        size: 3.5 + Math.random() * 3, ph: Math.random() * 6,
      });
    }
  }
  function drawSeasonFade(dt) {
    if (seasonFade.hold && !bakeJob.active) { // new-season ground is in — crossfade
      seasonFade.hold = false;
      Tween.to(seasonFade, { a: 0 }, 2.2, Ease.quadOut);
    }
    if (seasonFade.a > 0.01 && seasonFadeC) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = seasonFade.a;
      ctx.drawImage(seasonFadeC, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (!emblems.length) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = emblems.length - 1; i >= 0; i--) {
      const e = emblems[i];
      e.age += dt;
      if (e.age < 0) continue;
      if (e.age > e.life) { emblems.splice(i, 1); continue; }
      e.x += e.vx * dt;
      e.y += (e.vy + Math.sin(time * 2.2 + e.ph) * 30) * dt;
      e.rot += e.vr * dt;
      const a = Math.min(1, (e.life - e.age) / 0.5);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot);
      ctx.globalAlpha = a * 0.9;
      if (e.kind === 0) {          // spring: blossom petals
        ctx.fillStyle = '#f2a8c4';
        ctx.beginPath(); ctx.ellipse(0, 0, e.size, e.size * 0.62, 0, 0, PI2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath(); ctx.ellipse(-e.size * 0.25, -e.size * 0.2, e.size * 0.4, e.size * 0.25, 0, 0, PI2); ctx.fill();
      } else if (e.kind === 1) {   // summer: pollen glints
        ctx.fillStyle = '#ffe082';
        ctx.beginPath(); ctx.arc(0, 0, e.size * 0.5, 0, PI2); ctx.fill();
      } else if (e.kind === 2) {   // fall: leaves
        ctx.fillStyle = ['#c4552e', '#d97c2e', '#d9b23c'][i % 3];
        ctx.beginPath(); ctx.ellipse(0, 0, e.size, e.size * 0.55, 0, 0, PI2); ctx.fill();
      } else {                     // winter: flakes
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.beginPath(); ctx.arc(0, 0, e.size * 0.5, 0, PI2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawFx(dt) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (!p.on) continue;
      p.age += dt;
      if (p.age > p.life) { p.on = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.rot += p.vr * dt;
      // falling drops splash when they hit their floor
      if (p.shape === 'drop' && p.floorY !== undefined && p.y >= p.floorY) {
        if (p.next === 'splash') {
          p.shape = 'splash'; p.y = p.floorY; p.vx = p.vy = p.g = 0;
          p.age = 0; p.life = 0.16; p.next = null;
        } else { p.on = false; continue; }
      }
      const k = 1 - p.age / p.life;
      switch (p.shape) {
        case 'dot':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * k + 0.5), 0, PI2); ctx.fill();
          break;
        case 'soil':
          ctx.globalAlpha = Math.min(1, k * 2.5);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.col;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
          break;
        case 'leaf':
        case 'husk':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, PI2); ctx.fill();
          ctx.restore();
          break;
        case 'chunk':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k + 1, 0, PI2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.4)';
          ctx.beginPath(); ctx.arc(p.x - 1, p.y - 1, 1.1, 0, PI2); ctx.fill();
          break;
        case 'dust':
          ctx.globalAlpha = 0.45 * k;
          ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size + p.vr * (1 - k), 0, PI2); ctx.fill();
          break;
        case 'spark':
          ctx.globalAlpha = Math.min(1, k * 1.6);
          ctx.strokeStyle = p.col;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          break;
        case 'drop':
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = p.col;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.028);
          ctx.stroke();
          break;
        case 'splash': {
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.col;
          ctx.lineWidth = 1.2;
          const e = (1 - k) * 4;
          const rx = 2 + e * 1.6;
          ctx.beginPath();
          ctx.moveTo(p.x - 1 - e, p.y - 1 - e * 0.7);
          ctx.lineTo(p.x - 3 - e, p.y - 3 - e);
          ctx.moveTo(p.x + 1 + e, p.y - 1 - e * 0.7);
          ctx.lineTo(p.x + 3 + e, p.y - 3 - e);
          ctx.moveTo(p.x + rx, p.y);
          ctx.ellipse(p.x, p.y, rx, rx * 0.45, 0, 0, PI2);
          ctx.stroke();
          break;
        }
        case 'star': {
          ctx.globalAlpha = Math.min(1, k * 1.8);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.col;
          const r = p.size, r2 = p.size * 0.32;
          ctx.beginPath();
          for (let s2 = 0; s2 < 8; s2++) {
            const rr2 = s2 % 2 ? r2 : r, aa = (s2 / 8) * PI2;
            ctx[s2 ? 'lineTo' : 'moveTo'](Math.cos(aa) * rr2, Math.sin(aa) * rr2);
          }
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
      }
      ctx.globalAlpha = 1;
    }
    if (floats.length) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        f.age += dt;
        if (f.age > 1.3) { floats.splice(i, 1); continue; }
        const a = Math.min(1, (1.3 - f.age) / 0.4);
        const pop = 0.6 + 0.4 * Ease.backOut(Math.min(1, f.age / 0.14)); // pop-in
        const rise = 44 * Ease.cubicOut(Math.min(1, f.age / 1.15));      // fast rise, then hang
        ctx.font = `900 ${Math.round(16 * pop)}px Nunito, system-ui, sans-serif`;
        ctx.globalAlpha = a;
        ctx.strokeStyle = 'rgba(40,25,5,.8)';
        ctx.lineWidth = 4;
        ctx.strokeText(f.text, f.x, f.y - 20 - rise);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y - 20 - rise);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------------- coverage zones (greenhouse aura) ----------------
  // translucent iso-diamond over a tile rect — placement ghosts show it live,
  // tapping a greenhouse flashes it for a couple of seconds.
  let covFlash = null; // { x0, y0, x1, y1, until }
  function flashCoverage(x0, y0, x1, y1, dur) {
    covFlash = { x0, y0, x1, y1, until: time + (dur || 2) };
  }

  function drawZone(x0, y0, x1, y1, alpha) {
    const pts = [proj(x0, y0), proj(x1, y0), proj(x1, y1), proj(x0, y1)];
    ctx.fillStyle = `rgba(126,207,146,${(0.24 * alpha).toFixed(3)})`;
    poly(pts);
    ctx.fill();
    ctx.strokeStyle = `rgba(47,143,82,${(0.8 * alpha).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    poly(pts);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawCoverageFlash() {
    if (!covFlash) return;
    const a = Math.min(1, (covFlash.until - time) / 0.4);
    if (a <= 0) { covFlash = null; return; }
    drawZone(covFlash.x0, covFlash.y0, covFlash.x1, covFlash.y1, a);
  }

  // ---------------- ghost (build placement) ----------------
  function drawGhost(state) {
    if (!ghost) return;
    const def = D.BUILDINGS[ghost.type];
    // greenhouses shelter a 6×6 zone — show it while placing
    if (ghost.type === 'greenhouse') drawZone(ghost.x - 2, ghost.y - 2, ghost.x + 4, ghost.y + 4, 0.85);
    const ok = Game.canPlaceBuilding(ghost.type, ghost.x, ghost.y);
    const corners = [
      proj(ghost.x, ghost.y), proj(ghost.x + def.w, ghost.y),
      proj(ghost.x + def.w, ghost.y + def.h), proj(ghost.x, ghost.y + def.h),
    ];
    ctx.fillStyle = ok ? 'rgba(90, 170, 90, .35)' : 'rgba(200, 70, 50, .35)';
    poly(corners);
    ctx.fill();
    ctx.strokeStyle = ok ? '#3f8a42' : '#b03a2a';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);
    poly(corners);
    ctx.stroke();
    ctx.setLineDash([]);
    drawBuilding(state, { type: ghost.type, x: ghost.x, y: ghost.y, queue: [] }, undefined, 0.65);
  }

  // ---------------- pooled entity records (no per-frame closures) ----------------
  const K_CROP = 0, K_DECOR = 1, K_BLDG = 2, K_SIGN = 3, K_ANIMAL = 4, K_FENCE = 5;
  const entPool = [];
  let entN = 0;
  const drawArr = [];
  function pushEnt(d, kind, a, b) {
    let e = entPool[entN];
    if (!e) e = entPool[entN] = { d: 0, kind: 0, a: 0, b: 0 };
    e.d = d; e.kind = kind; e.a = a; e.b = b;
    entN++;
  }
  function entCmp(a, b) { return a.d - b.d; }

  // ---------------- main render ----------------
  function render(state, dt) {
    if (!state) return;
    time += dt;
    fdt = dt;
    dynRes(dt);                          // resolution step (if any) lands before drawing
    Tween.update(dt);                    // all fx motion advances first (§2)
    runTimers(dt);
    checkSeasonFlip(state);              // captures the old-season frame BEFORE drawing
    clampCam();
    computeSun(state);
    lightN = 0;
    // sprite LOD matched to on-screen scale (cam.z × dpr): LOD2 bakes at 3x so
    // close zoom on a DPR-3 screen samples down instead of stretching a 2x bake
    LOD = cam.z < 0.5 ? 0 : (cam.z * dpr > 2.05 ? 2 : 1);
    stormK += ((state.weather === 'storm' ? 1 : 0) - stormK) * Math.min(1, dt * 2);
    if (stormK < 0.01) stormK = 0;
    Atlas.season(state.season);          // retire bakes when the season turns
    Atlas.tick();                        // refill the per-frame rebake budget
    trackParcelSales(state);             // fence-build + sign-fall ceremony on new land
    trackPlacements(state);              // drop-in ceremony on new buildings
    if (time > fxSweepAt) { fxSweepAt = time + 2; sweepFx(state); }

    const pal = PALETTES[state.season];

    // sky → meadow backdrop (screen space, cached gradient)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(state);

    // world transform (iso px)
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z), dpr * (vh / 2 - cam.y * cam.z));

    // ground pass: baked world layer, ONE drawImage. Mip chain keeps the
    // sampling scale near 1:1 (cheap nearest, already box-filtered — no far
    // zoom shimmer); true magnification gets bilinear so close zoom at DPR 3
    // never goes blocky.
    updateGround(state, pal);
    const gsc = dpr * cam.z / GS;
    let gSrc = ground.c, gEff = gsc;
    if (ground.mip2 && gsc < 0.3) { gSrc = ground.mip2; gEff = gsc * 4; }
    else if (ground.mip && gsc < 0.6) { gSrc = ground.mip; gEff = gsc * 2; }
    ctx.imageSmoothingEnabled = gEff > 1.05;
    ctx.drawImage(gSrc, ground.minX, ground.minY, ground.w, ground.h);
    ctx.imageSmoothingEnabled = true;
    drawPond(state, dt);
    drawGroundFx(dt);                    // soak stains, furrow reveals, impact rings
    drawParcels(state);
    drawCoverageFlash();                 // tapped-greenhouse 6×6 aura

    // viewport culling: visible tile window from the 4 screen corners
    const c1 = screenToTile(0, 0), c2 = screenToTile(vw, 0), c3 = screenToTile(0, vh), c4 = screenToTile(vw, vh);
    const vx0 = Math.max(0, Math.floor(Math.min(c1.x, c2.x, c3.x, c4.x)) - 2);
    const vx1 = Math.min(D.WORLD_W - 1, Math.ceil(Math.max(c1.x, c2.x, c3.x, c4.x)) + 3);
    const vy0 = Math.max(0, Math.floor(Math.min(c1.y, c2.y, c3.y, c4.y)) - 2);
    const vy1 = Math.min(D.WORLD_H - 1, Math.ceil(Math.max(c1.y, c2.y, c3.y, c4.y)) + 3);

    // world-space rain: splash ticks land ON the farm, roofs drip (LOD-gated)
    const raining = state.weather === 'rain' || state.weather === 'storm';
    if (raining && cam.z >= 0.55) {
      const nSp = state.weather === 'storm' ? 2 : 2;
      for (let i = 0; i < nSp; i++) {
        const p = proj(vx0 + Math.random() * (vx1 - vx0 + 1), vy0 + Math.random() * (vy1 - vy0 + 1));
        spawnP(p.x, p.y, { shape: 'splash', life: 0.15, g: 0, col: 'rgba(215,238,255,.75)' });
      }
      dripAcc += dt;
      if (dripAcc > 0.45 && state.buildings.length) {
        dripAcc = 0;
        const b = state.buildings[(Math.random() * state.buildings.length) | 0];
        const bv = b && BVIS[b.type];
        if (b && bv && b.x >= vx0 && b.x <= vx1 && b.y >= vy0 && b.y <= vy1) {
          const def = D.BUILDINGS[b.type];
          const e = proj(b.x + Math.random() * def.w, b.y + def.h); // south eave line
          spawnP(e.x, e.y - bv.baseH * 0.95, {
            shape: 'drop', col: '#9fd0ee', g: 700, vy: 60, life: 0.6,
            floorY: e.y, next: 'splash', size: 1.6,
          });
        }
      }
    }
    // storm theater: ambient lightning strikes a real visible tile every few seconds
    if (state.weather === 'storm' && time - lastStrike > 4.5) {
      lastStrike = time + Math.random() * 4;
      fxLightning(vx0 + 1 + Math.random() * (vx1 - vx0 - 1), vy0 + 1 + Math.random() * (vy1 - vy0 - 1));
    }

    // entity pass: pooled records, depth-sorted by (x + y)
    entN = 0;
    for (let y = vy0; y <= vy1; y++)
      for (let x = vx0; x <= vx1; x++) {
        const tile = state.tiles[y][x];
        if (tile.crop) pushEnt(x + y + 0.55, K_CROP, x, y);
      }

    // clustered decor items (continuous positions, baked sprites)
    for (let i = 0; i < decorItems.length; i++) {
      const it = decorItems[i];
      if (it.x < vx0 - 1 || it.x > vx1 + 2 || it.y < vy0 - 1 || it.y > vy1 + 2) continue;
      if (!decorVisible(state, it)) continue;
      pushEnt(it.x + it.y, K_DECOR, i, 0);
    }

    for (let i = 0; i < state.buildings.length; i++) {
      const b = state.buildings[i];
      if (!b) continue;
      const def = D.BUILDINGS[b.type];
      if (b.x + def.w < vx0 || b.x > vx1 + 1 || b.y + def.h < vy0 || b.y > vy1 + 1) continue;
      pushEnt(b.x + def.w - 1 + b.y + def.h - 1 + 0.62, K_BLDG, i, 0);
    }

    for (let i = 0; i < D.PARCELS.length; i++) {
      const p = D.PARCELS[i];
      if (p.x > vx1 + 1 || p.x + p.w < vx0 - 1 || p.y > vy1 + 1 || p.y + p.h < vy0 - 1) continue;
      if (!state.unlockedParcels.includes(i)) {
        pushEnt(p.x + p.w + p.y + p.h - 0.6, K_SIGN, i, 0);
      } else {
        // S+E fence sides draw in front of the parcel's contents
        pushEnt(p.x + p.w + p.y + p.h + 0.1, K_FENCE, i, 0);
      }
    }

    updateAnimals(state, dt);
    for (let i = 0; i < state.animals.length; i++) {
      const a = state.animals[i];
      const anim = animalAnim.get(a.uid);
      if (!anim) continue;
      if (anim.x < vx0 - 1 || anim.x > vx1 + 1 || anim.y < vy0 - 1 || anim.y > vy1 + 1) continue;
      pushEnt(anim.x + anim.y, K_ANIMAL, i, 0);
    }

    drawArr.length = entN;
    for (let i = 0; i < entN; i++) drawArr[i] = entPool[i];
    drawArr.sort(entCmp);
    for (let i = 0; i < entN; i++) {
      const e = drawArr[i];
      switch (e.kind) {
        case K_CROP: {
          const crop = state.tiles[e.b][e.a].crop;
          if (crop) drawCrop(e.a, e.b, crop);
          break;
        }
        case K_DECOR: drawDecorItem(state, e.a); break;
        case K_BLDG: {
          const b = state.buildings[e.a];
          if (b) drawBuilding(state, b, e.a);
          break;
        }
        case K_SIGN: drawSign(state, e.a); break;
        case K_ANIMAL: drawAnimal(state, e.a); break;
        case K_FENCE: drawFenceFront(state, e.a); break;
      }
    }

    updateCart(state, dt);               // dawn delivery cart along the south road
    drawCart(state);
    drawJuice(dt);                       // harvest ghosts + hoe wedges
    drawSoldFx(dt);
    drawFireflies(state);
    drawAmbient(state);
    drawGhost(state);
    drawFx(dt);
    // screen-space overlays
    drawWeather(state);
    drawNight(state);
    drawBolts(dt);                       // lightning glows over the night multiply
    drawFliers();                        // harvest items land on the DOM market button
    drawGodRays(state);
    drawSeasonFade(dt);                  // palette crossfade + emblem sweep
    // vignette+grain is invisible under the deep-night multiply — skip it there
    if (SUN.dark < 0.6) drawGrade();
  }

  return {
    init, render, cam, clampCam, centerOn, screenToTile, tileToScreen,
    addFloat, addBurst, setGhost, getGhost: () => ghost, flashCoverage,
    // Phase 3 juice hooks (fx bus → ui.js → here)
    fxTill, fxPlant, fxWater, fxHarvest, fxClear, fxLightning,
    addStartle, addGlintBurst,
    get vw() { return vw; }, get vh() { return vh; },
  };
})();
