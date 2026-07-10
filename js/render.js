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
  const bursts = [];            // particle bursts (iso px)
  const animalAnim = new Map(); // ephemeral wander positions, keyed by animal uid

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
    let dark = 0, dusk = 0;
    if (t >= 0.70 && t < 0.78) dusk = (t - 0.70) / 0.08;
    if (t >= 0.78 && t < 0.86) { dark = (t - 0.78) / 0.08; dusk = 1 - dark; }
    else if (t >= 0.86 && t < 0.94) dark = 1;
    else if (t >= 0.94) { dark = 1 - (t - 0.94) / 0.06; dusk = 1 - dark; }
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
  }

  let gradeCanvas = null; // pre-composed vignette+grain overlay (rebuilt on resize)
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.0); // capped at 2.0
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
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

  // ---------------- fx (tile coords in, projected immediately) ----------------
  function addFloat(tx, ty, text, color) {
    const p = proj(tx, ty);
    floats.push({ x: p.x, y: p.y, text, color: color || '#fff', age: 0 });
  }
  function addBurst(tx, ty, color) {
    const p = proj(tx, ty);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
      bursts.push({ x: p.x, y: p.y, vx: Math.cos(a) * (40 + Math.random() * 50), vy: Math.sin(a) * (25 + Math.random() * 30) - 45, age: 0, color });
    }
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

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

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

  /* ================= GROUND LAYER (baked once, blitted per frame) =================
     The whole static ground — meadow tiles with smoothed-noise variation, tufts,
     soil beds (with moisture state), the diorama treeline band and the south
     soil-cliff rim — lives in ONE offscreen world canvas. Individual tiles are
     repainted into it when they change (till / water / unlock); the whole layer
     rebuilds on season change. Per-frame cost: one drawImage. */
  const GS = 2; // ground bake supersample
  const ground = {
    c: null, g: null, season: -1,
    minX: 0, minY: 0, w: 0, h: 0,
    sig: new Int8Array(D.WORLD_W * D.WORLD_H),
  };

  function tileSig(state, x, y) {
    const t = state.tiles[y][x];
    let s = 1;
    if (t.k === 'soil') s = 2 + (t.crop && t.crop.water > 0.4 ? 1 : 0);
    if (Game.isUnlocked(x, y)) s += 8;
    return s;
  }

  function paintGrassTile(g, state, x, y, pal) {
    const c = proj(x + 0.5, y + 0.5);
    // smoothed-noise meadow: meso tone variance + macro patches + hue jitter
    const n = snoise(x * 0.55 + 3.1, y * 0.55 + 7.7);
    const m = snoise(x * 0.21 + 11.3, y * 0.21 + 4.9); // macro meadow patches
    const l = pal.grass[2] + (n - 0.5) * 7 + (m - 0.5) * 9;
    const hh = pal.grass[0] + (snoise(x * 0.4 + 5.2, y * 0.4 + 2.8) - 0.5) * pal.hueJit;
    g.fillStyle = hsl(hh, pal.grass[1], l);
    diamondOn(g, c.x, c.y, TW + 1.5, TH + 1);
    g.fill();
    const h = hash(x, y);
    // clustered two-value grass tufts (crossing tile borders is fine at bake time)
    if (h > 0.28) {
      const tx = c.x + (h * 997 % 1 - 0.5) * TW * 0.55;
      const ty = c.y + (h * 613 % 1 - 0.5) * TH * 0.55;
      const nblades = 3 + Math.floor(h * 17) % 4;
      g.lineWidth = 1.4;
      g.lineCap = 'round';
      for (let i = 0; i < nblades; i++) {
        const bx = tx + (hash(x * 7 + i, y * 3) - 0.5) * 13;
        const by = ty + (hash(x * 3, y * 7 + i) - 0.5) * 6;
        const tc = (i % 2 === 0) ? pal.tuftD : pal.tuftL;
        g.strokeStyle = hsl(tc[0], tc[1], tc[2], 0.75);
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(bx + (hash(x + i, y - i) - 0.5) * 3, by - 3 - (h * 431 % 1) * 3);
        g.stroke();
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

  function paintSoilTile(g, state, x, y) {
    const t = state.tiles[y][x];
    const c = proj(x + 0.5, y + 0.5);
    const wet = t.crop && t.crop.water > 0.4;
    // raised-bed side (dark lip)
    g.fillStyle = wet ? hsl(18, 44, 15) : hsl(22, 42, 21);
    diamondOn(g, c.x, c.y + 4, TW * 0.9, TH * 0.9);
    g.fill();
    // topsoil: warm chocolate; wet soil darkens and cools two steps
    g.fillStyle = wet ? hsl(17, 36, 25) : hsl(24, 40, 34);
    diamondOn(g, c.x, c.y, TW * 0.9, TH * 0.9);
    g.fill();
    // sun-lit rim on the two upper edges of the bed
    g.strokeStyle = wet ? hsl(22, 38, 36) : hsl(31, 48, 46);
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(c.x - TW * 0.45, c.y);
    g.lineTo(c.x, c.y - TH * 0.45);
    g.lineTo(c.x + TW * 0.45, c.y);
    g.stroke();
    // ridged furrows: paired dark line + offset light line reads as 3D ridges
    for (let i = -1; i <= 1; i++) {
      const a = proj(x + 0.2 + (i + 1) * 0.2, y + 0.15);
      const b = proj(x + 0.2 + (i + 1) * 0.2, y + 0.85);
      g.strokeStyle = wet ? 'rgba(16,8,4,.4)' : 'rgba(30,16,6,.32)';
      g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      g.strokeStyle = wet ? 'rgba(150,170,200,.10)' : 'rgba(235,195,140,.16)';
      g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(a.x + 2.4, a.y + 1.2); g.lineTo(b.x + 2.4, b.y + 1.2); g.stroke();
    }
    // clods
    for (let i = 0; i < 9; i++) {
      const r1 = hash(x * 13 + i, y * 7), r2 = hash(x * 5, y * 17 + i), r3 = hash(x + i, y + i);
      g.fillStyle = r3 > 0.5 ? 'rgba(40,22,8,.35)' : 'rgba(210,165,115,.22)';
      g.beginPath();
      g.ellipse(c.x + (r1 - 0.5) * TW * 0.6, c.y + (r2 - 0.5) * TH * 0.6, 1.4 + r3 * 1.5, 0.9 + r3, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (wet) { // moisture sheen + sky-blue specular speckles
      g.fillStyle = 'rgba(110,160,215,.13)';
      diamondOn(g, c.x, c.y, TW * 0.9, TH * 0.9);
      g.fill();
      g.fillStyle = 'rgba(175,215,250,.32)';
      for (let i = 0; i < 2; i++) {
        const r1 = hash(x * 3 + i * 7, y * 11);
        g.beginPath();
        g.ellipse(c.x + (r1 - 0.5) * TW * 0.5, c.y + (hash(x, y + i) - 0.5) * TH * 0.5, 2.2, 1, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.strokeStyle = 'rgba(40,26,12,.4)';
    g.lineWidth = 1.4;
    diamondOn(g, c.x, c.y, TW * 0.9, TH * 0.9);
    g.stroke();
  }

  function paintGroundTile(g, state, x, y, pal) {
    if (state.tiles[y][x].k === 'soil') paintSoilTile(g, state, x, y);
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

  function bakeGround(state, pal) {
    const W = D.WORLD_W, H = D.WORLD_H;
    ground.minX = proj(0, H).x - TW / 2 - 56;
    ground.minY = -118;
    ground.w = (proj(W, 0).x + TW / 2 + 56) - ground.minX;
    ground.h = (proj(W, H).y + TH / 2 + 44) - ground.minY;
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
    paintCliff(g, pal);
    ground.season = state.season;
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
    g.restore();
    ground.sig[y * D.WORLD_W + x] = tileSig(state, x, y);
  }

  function updateGround(state, pal) {
    if (!ground.c || ground.season !== state.season) { bakeGround(state, pal); return; }
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

  // ---------------- pond ----------------
  function drawPond(state) {
    const c = proj(1.6, 7.8);
    const winter = state.season === 3;
    ctx.fillStyle = winter ? '#7d99ad' : '#39708f';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, TW * 1.15, TH * 1.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = winter ? '#a9c3d4' : '#4a8ab0';
    ctx.beginPath(); ctx.ellipse(c.x - 6, c.y - 4, TW * 0.9, TH * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const rx = TW * (0.3 + 0.22 * i) + Math.sin(time * 1.2 + i) * 4;
      ctx.beginPath(); ctx.ellipse(c.x - 6, c.y - 4, rx, rx * 0.5, 0, 0.4, 2.2); ctx.stroke();
    }
    drawAnimalSprite('duck', c.x + Math.sin(time * 0.5) * 24, c.y + Math.cos(time * 0.4) * 10 - 4, time, 99, false);
  }

  // ---------------- parcels: fences, locked overlays, signs ----------------
  function drawParcels(state) {
    for (let i = 0; i < D.PARCELS.length; i++) {
      const p = D.PARCELS[i];
      const corners = [proj(p.x, p.y), proj(p.x + p.w, p.y), proj(p.x + p.w, p.y + p.h), proj(p.x, p.y + p.h)];
      if (state.unlockedParcels.includes(i)) {
        drawFence(p);
      } else {
        ctx.fillStyle = 'rgba(28, 22, 10, .28)';
        poly(corners);
        ctx.fill();
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = 'rgba(255,255,255,.45)';
        ctx.lineWidth = 2.5;
        poly(corners);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawFence(p) {
    const post = (gx, gy) => {
      const pt = proj(gx, gy);
      ctx.fillStyle = hsl(26, 38, 27);
      ctx.fillRect(pt.x - 2, pt.y - 14, 4, 15);
      ctx.fillStyle = hsl(33, 45, 43);
      ctx.fillRect(pt.x - 2, pt.y - 14, 4, 3);
    };
    const rail = (ax, ay, bx, by) => {
      const a = proj(ax, ay), b = proj(bx, by);
      for (const h of [5, 10]) {
        ctx.moveTo(a.x, a.y - h); ctx.lineTo(b.x, b.y - h);
      }
    };
    // rails along the north & west edges only (so fences don't hide crops),
    // batched into a single stroked path
    ctx.strokeStyle = hsl(28, 40, 35);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let gx = p.x; gx < p.x + p.w; gx++) rail(gx, p.y, gx + 1, p.y);
    for (let gy = p.y; gy < p.y + p.h; gy++) rail(p.x, gy, p.x, gy + 1);
    ctx.stroke();
    for (let gx = p.x; gx <= p.x + p.w; gx++) post(gx, p.y);
    for (let gy = p.y + 1; gy <= p.y + p.h; gy++) post(p.x, gy);
  }

  function drawSign(state, index) {
    const p = D.PARCELS[index];
    const c = proj(p.x + p.w / 2, p.y + p.h / 2);
    shadow(c.x, c.y + 4, 26, 7);
    ctx.fillStyle = hsl(26, 38, 27);
    ctx.fillRect(c.x - 3, c.y - 30, 6, 32);
    ctx.fillStyle = hsl(31, 42, 51);
    rr(c.x - 50, c.y - 58, 100, 34, 6);
    ctx.fill();
    ctx.strokeStyle = hsl(26, 40, 30);
    ctx.lineWidth = 2.5;
    rr(c.x - 50, c.y - 58, 100, 34, 6);
    ctx.stroke();
    ctx.fillStyle = '#3d2a14';
    ctx.font = '900 15px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FOR SALE', c.x, c.y - 49);
    ctx.font = '800 12px Nunito, system-ui, sans-serif';
    ctx.fillText(D.$(p.cost), c.x, c.y - 34);
  }

  // ---------------- crops (billboarded at tile center) ----------------
  const wiltDef = { tpl: '', color: '', leaf: '', stripe: undefined, tall: false, grain: false };

  function drawCrop(x, y, crop) {
    const def = D.CROPS[crop.id];
    const c = proj(x + 0.5, y + 0.5);
    const cx = c.x, cy = c.y + 2;
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
    const sway = Math.sin(time * 2.2 + x * 1.7 + y) * 0.05;
    const droop = wilt > 0.25 ? wilt * 0.45 : 0; // wilting plants lean over
    const mature = s >= 1;
    const bounce = mature && !droop ? Math.sin(time * 3 + x) * 1.2 : 0;

    // small contact shadow glues the plant to the soil
    shadow(cx, cy + 5, 8 + s * 5, 3.2);

    ctx.save();
    ctx.translate(cx, cy + bounce);
    ctx.rotate(sway * Math.min(1, s * 2) + droop);

    if (mature && !droop && (crop.rot || 0) < 0.4) { // baked glow sprite for ready crops
      ctx.drawImage(sprites.glow, -24, -32, 48, 48);
    }

    let tdef = def;
    if (wilt > 0.25) { // wilt is a color story: leaves dry to ochre + droop
      wiltDef.tpl = def.tpl; wiltDef.color = def.color; wiltDef.stripe = def.stripe;
      wiltDef.tall = def.tall; wiltDef.grain = def.grain;
      wiltDef.leaf = hsl(50, 42, 44);
      tdef = wiltDef;
      ctx.globalAlpha = 0.94;
    }

    if (s < 0.22) { // sprout
      ctx.strokeStyle = wilt > 0.25 ? hsl(50, 42, 42) : '#6d9440';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = wilt > 0.25 ? hsl(52, 44, 50) : '#7ba24c';
      ctx.beginPath(); ctx.ellipse(-4, -1, 5, 3, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, -1, 5, 3, 0.6, 0, Math.PI * 2); ctx.fill();
    } else {
      const k = 0.5 + 0.6 * Math.min(1, s / 0.95);
      ctx.scale(k, k);
      drawTemplate(tdef, s, mature);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

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

  function drawTemplate(def, s, mature) {
    const leaf = def.leaf, col = def.color;
    ctx.lineCap = 'round';
    switch (def.tpl) {
      case 'root': {
        if (mature) {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(0, 5, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          ctx.beginPath(); ctx.ellipse(-3, 2, 3, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = leaf;
        ctx.lineWidth = 3;
        for (const a of [-0.7, -0.25, 0.25, 0.7]) {
          ctx.beginPath();
          ctx.moveTo(0, 4);
          ctx.quadraticCurveTo(a * 10, -8, a * 14, -16);
          ctx.stroke();
        }
        break;
      }
      case 'grain': {
        const hgt = def.tall ? 30 : 22;
        ctx.strokeStyle = mature && !def.tall ? '#c8a02e' : leaf;
        ctx.lineWidth = 2.5;
        for (const a of [-1, 0, 1]) {
          ctx.beginPath();
          ctx.moveTo(a * 6, 8);
          ctx.quadraticCurveTo(a * 8, -hgt / 2, a * 10, -hgt);
          ctx.stroke();
          if (mature) {
            ctx.fillStyle = col;
            if (def.tall) { // corn cob
              ctx.beginPath(); ctx.ellipse(a * 9, -hgt + 6, 4.5, 9, a * 0.2, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = leaf;
              ctx.beginPath(); ctx.moveTo(a * 9, -hgt + 14); ctx.quadraticCurveTo(a * 9 + 6, -hgt + 8, a * 9 + 4, -hgt); ctx.stroke();
            } else { // wheat/rice head
              for (let i = 0; i < 4; i++) {
                ctx.beginPath(); ctx.ellipse(a * 10 + (i % 2 ? 2.5 : -2.5), -hgt + i * 4, 3, 4.5, 0, 0, Math.PI * 2); ctx.fill();
              }
            }
          }
        }
        break;
      }
      case 'bush': {
        ctx.fillStyle = leaf;
        ctx.beginPath();
        ctx.arc(-8, -4, 9, 0, Math.PI * 2);
        ctx.arc(8, -4, 9, 0, Math.PI * 2);
        ctx.arc(0, -10, 10, 0, Math.PI * 2);
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        if (mature) {
          ctx.fillStyle = col;
          for (const [fx2, fy2] of [[-8, -2], [7, -6], [1, 3], [-2, -12]]) {
            ctx.beginPath(); ctx.arc(fx2, fy2, 4.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.3)';
            ctx.beginPath(); ctx.arc(fx2 - 1.5, fy2 - 1.5, 1.4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = col;
          }
        }
        break;
      }
      case 'leafy': {
        ctx.fillStyle = leaf;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath(); ctx.ellipse(Math.cos(a) * 9, Math.sin(a) * 6 - 4, 7, 4.5, a, 0, Math.PI * 2); ctx.fill();
        }
        if (mature) {
          ctx.fillStyle = def.color;
          ctx.beginPath(); ctx.arc(0, -5, 9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          ctx.beginPath(); ctx.arc(-3, -8, 3, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'vine': {
        ctx.strokeStyle = leaf;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-14, 6);
        ctx.quadraticCurveTo(0, -8, 14, 2);
        ctx.stroke();
        ctx.fillStyle = leaf;
        ctx.beginPath(); ctx.ellipse(-10, -2, 6, 4, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(10, -6, 6, 4, 0.5, 0, Math.PI * 2); ctx.fill();
        if (mature) {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(2, 4, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = def.stripe || 'rgba(0,0,0,.15)';
          ctx.lineWidth = 2;
          for (const a of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(a + 2, -4); ctx.quadraticCurveTo(a + 2, 4, a + 2, 12); ctx.stroke(); }
          ctx.fillStyle = '#44591c';
          ctx.fillRect(0, -8, 4, 5);
        }
        break;
      }
      case 'trellis': {
        ctx.strokeStyle = hsl(28, 40, 35);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-12, 10); ctx.lineTo(-12, -18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(12, 10); ctx.lineTo(12, -18); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-15, -14); ctx.lineTo(15, -14); ctx.stroke();
        ctx.strokeStyle = leaf;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.quadraticCurveTo(-10, -4, -12, -14);
        ctx.moveTo(0, 10);
        ctx.quadraticCurveTo(10, -4, 12, -14);
        ctx.stroke();
        ctx.fillStyle = leaf;
        for (const [lx, ly] of [[-9, -8], [9, -8], [-4, -14], [5, -15], [0, -2]]) {
          ctx.beginPath(); ctx.ellipse(lx, ly, 5, 3.5, lx * 0.05, 0, Math.PI * 2); ctx.fill();
        }
        if (mature) {
          ctx.fillStyle = col;
          for (const [gx, gy] of [[-8, -6], [8, -7]]) {
            for (let i = 0; i < 6; i++) {
              ctx.beginPath(); ctx.arc(gx + (i % 2) * 4 - 2, gy + Math.floor(i / 2) * 4, 2.6, 0, Math.PI * 2); ctx.fill();
            }
          }
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          ctx.beginPath(); ctx.arc(-9, -7, 1.2, 0, Math.PI * 2); ctx.arc(7, -8, 1.2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'flower': {
        ctx.strokeStyle = leaf;
        ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -14); ctx.stroke();
        ctx.fillStyle = leaf;
        ctx.beginPath(); ctx.ellipse(-6, 0, 7, 3.5, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(6, -4, 7, 3.5, 0.5, 0, Math.PI * 2); ctx.fill();
        if (mature) {
          ctx.fillStyle = col;
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            ctx.beginPath(); ctx.ellipse(Math.cos(a) * 9, -16 + Math.sin(a) * 9, 5.5, 3, a, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = '#5f452c';
          ctx.beginPath(); ctx.arc(0, -16, 6, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#7ba24c';
          ctx.beginPath(); ctx.arc(0, -15, 5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
    }
  }

  // ---------------- buildings (true iso boxes, sun-lit faces) ----------------
  function isoBox(x0, y0, x1, y1, hgt, wall, topCol) {
    const N = proj(x0, y0), E = proj(x1, y0), S = proj(x1, y1), W = proj(x0, y1);
    // SW-facing wall (sun side): warm lit ramp step
    ctx.fillStyle = rampHex(wall, 0.55 + SUN.warm * 0.25);
    poly([W, S, up(S, hgt), up(W, hgt)]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(48,34,74,.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // SE-facing wall (shade side): cool + saturated ramp step + violet overlay
    ctx.fillStyle = rampHex(wall, -1.35);
    poly([S, E, up(E, hgt), up(S, hgt)]);
    ctx.fill();
    ctx.fillStyle = 'rgba(50,58,132,.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(48,34,74,.28)';
    ctx.stroke();
    // top
    ctx.fillStyle = topCol || rampHex(wall, 1.1);
    poly([up(N, hgt), up(E, hgt), up(S, hgt), up(W, hgt)]);
    ctx.fill();
    ctx.stroke();
    return { N, E, S, W };
  }

  function hipRoof(x0, y0, x1, y1, baseH, roofH, color) {
    const grow = 0.12; // eaves overhang
    const N = proj(x0 - grow, y0 - grow), E = proj(x1 + grow, y0 - grow),
          S = proj(x1 + grow, y1 + grow), W = proj(x0 - grow, y1 + grow);
    const apex = up(proj((x0 + x1) / 2, (y0 + y1) / 2), baseH + roofH);
    const bN = up(N, baseH), bE = up(E, baseH), bS = up(S, baseH), bW = up(W, baseH);
    // back faces first
    ctx.fillStyle = rampHex(color, 0.9);
    poly([bN, bE, apex]); ctx.fill();
    poly([bW, bN, apex]); ctx.fill();
    // sun-facing front face: warm lit
    ctx.fillStyle = rampHex(color, 0.25 + SUN.warm * 0.3);
    poly([bW, bS, apex]); ctx.fill();
    ctx.strokeStyle = 'rgba(48,34,74,.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // shade front face: cool violet shift
    ctx.fillStyle = rampHex(color, -1.4);
    poly([bS, bE, apex]); ctx.fill();
    ctx.fillStyle = 'rgba(50,58,132,.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(48,34,74,.3)';
    ctx.stroke();
    // cream rim light along the sun-facing ridge (miniature-diorama cue)
    if (SUN.elev > 0.05) {
      ctx.strokeStyle = `rgba(255,246,200,${0.28 + 0.3 * SUN.elev + 0.2 * SUN.warm})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(bW.x, bW.y); ctx.lineTo(apex.x, apex.y); ctx.stroke();
    }
  }

  function wallPoint(A, B, u, v) { // point along wall edge A->B at height v
    return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u - v };
  }

  function windowStyle() {
    // windows glow warm at dusk/night; plain glass by day
    return SUN.glow > 0.12 ? `rgba(255,216,120,${0.75 + 0.25 * SUN.glow})` : 'rgba(240,240,215,.75)';
  }

  function drawBarnLike(state, b, def) {
    const inset = 0.12;
    const x0 = b.x + inset, y0 = b.y + inset, x1 = b.x + def.w - inset, y1 = b.y + def.h - inset;
    const baseH = 42, roofH = 26;
    const c = proj((x0 + x1) / 2, (y0 + y1) / 2);
    shadow(c.x + 4, c.y + 6, TW * 0.8, TH * 0.62);
    const wall = def.wall || '#b98a5c';
    const f = isoBox(x0, y0, x1, y1, baseH, wall, rampHex(wall, 1.0));
    // eave shadow strip cast onto the walls under the roofline
    ctx.fillStyle = 'rgba(45,32,90,.20)';
    poly([up(f.W, baseH - 6), up(f.S, baseH - 6), up(f.S, baseH), up(f.W, baseH)]);
    ctx.fill();
    poly([up(f.S, baseH - 6), up(f.E, baseH - 6), up(f.E, baseH), up(f.S, baseH)]);
    ctx.fill();
    // door on the SW wall
    const dA = wallPoint(f.W, f.S, 0.38, 0), dB = wallPoint(f.W, f.S, 0.62, 0);
    ctx.fillStyle = 'rgba(52,34,18,.92)';
    poly([dA, dB, up(dB, 26), up(dA, 26)]);
    ctx.fill();
    if (SUN.glow > 0.12) { // warm light seeping under the door after dark
      const dm = wallPoint(f.W, f.S, 0.5, 1);
      ctx.fillStyle = `rgba(255,190,90,${0.30 * SUN.glow})`;
      ctx.beginPath(); ctx.ellipse(dm.x, dm.y + 2, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    // window on the SE wall — an emitter after dark
    const wA = wallPoint(f.S, f.E, 0.35, 14), wB = wallPoint(f.S, f.E, 0.6, 14);
    ctx.fillStyle = windowStyle();
    poly([wA, wB, up(wB, 14), up(wA, 14)]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,10,.4)';
    ctx.stroke();
    if (SUN.glow > 0.02) {
      const wxm = (wA.x + wB.x) / 2, wym = (wA.y + wB.y) / 2 - 7;
      addLight(wxm, wym, 96, sprites.lightWarm, 0.9 * SUN.glow, true, true);
    }
    hipRoof(x0, y0, x1, y1, baseH, roofH, def.roof || '#8a5a3a');
    // painted sign board over the door
    if (def.sign) {
      const sp = wallPoint(f.W, f.S, 0.5, 34);
      ctx.fillStyle = '#f4ecd8';
      const sw = def.sign.length * 7 + 12;
      rr(sp.x - sw / 2, sp.y - 8, sw, 15, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,20,.5)';
      ctx.lineWidth = 1.5;
      rr(sp.x - sw / 2, sp.y - 8, sw, 15, 3);
      ctx.stroke();
      ctx.fillStyle = '#4a3214';
      ctx.font = '900 10px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.sign, sp.x, sp.y);
    }
  }

  function drawGreenhouse(state, b, def) {
    const inset = 0.12;
    const x0 = b.x + inset, y0 = b.y + inset, x1 = b.x + def.w - inset, y1 = b.y + def.h - inset;
    const baseH = 34, roofH = 22;
    const c = proj((x0 + x1) / 2, (y0 + y1) / 2);
    shadow(c.x + 4, c.y + 6, TW * 0.8, TH * 0.62);
    // glass walls (glow warmly from inside at night)
    const N = proj(x0, y0), E = proj(x1, y0), S = proj(x1, y1), W = proj(x0, y1);
    const gl = SUN.glow;
    ctx.fillStyle = gl > 0.12 ? `rgba(255,214,150,${0.35 + 0.25 * gl})` : 'rgba(168, 210, 225, .55)';
    poly([W, S, up(S, baseH), up(W, baseH)]); ctx.fill();
    ctx.fillStyle = gl > 0.12 ? `rgba(235,180,120,${0.35 + 0.25 * gl})` : 'rgba(140, 185, 205, .6)';
    poly([S, E, up(E, baseH), up(S, baseH)]); ctx.fill();
    // frame lines
    ctx.strokeStyle = 'rgba(250,252,255,.8)';
    ctx.lineWidth = 1.5;
    for (const u of [0.33, 0.66]) {
      const a1 = wallPoint(W, S, u, 0);
      ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a1.x, a1.y - baseH); ctx.stroke();
      const a2 = wallPoint(S, E, u, 0);
      ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(a2.x, a2.y - baseH); ctx.stroke();
    }
    // plants inside (peek over the glass)
    ctx.fillStyle = '#4a7a44';
    ctx.beginPath(); ctx.arc(c.x - 14, c.y - baseH + 4, 7, 0, Math.PI * 2); ctx.arc(c.x + 8, c.y - baseH + 2, 8, 0, Math.PI * 2); ctx.fill();
    hipRoof(x0, y0, x1, y1, baseH, roofH, '#bcd9e4');
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    const apex = up(proj((x0 + x1) / 2, (y0 + y1) / 2), baseH + roofH);
    ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(up(S, baseH).x, up(S, baseH).y); ctx.stroke();
    if (gl > 0.02) addLight(c.x, c.y - baseH / 2, 128, sprites.lightWarm, 0.7 * gl, true, true);
  }

  function drawWell(state, b) {
    const c = proj(b.x + 0.5, b.y + 0.5);
    shadow(c.x, c.y + 4, 24, 11);
    // stone ring — cool grey with a warm lit cap
    ctx.fillStyle = hsl(215, 10, 58);
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 4, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hsl(220, 12, 47);
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 8, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#39708f';
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 8, 14, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.ellipse(c.x - 4, c.y - 10, 4, 2, -0.4, 0, Math.PI * 2); ctx.fill();
    // posts + little roof
    ctx.fillStyle = hsl(26, 38, 27);
    ctx.fillRect(c.x - 14, c.y - 34, 4, 28);
    ctx.fillRect(c.x + 10, c.y - 34, 4, 28);
    ctx.fillStyle = hsl(10, 50, 38);
    ctx.beginPath();
    ctx.moveTo(c.x - 22, c.y - 32);
    ctx.lineTo(c.x, c.y - 46);
    ctx.lineTo(c.x + 22, c.y - 32);
    ctx.lineTo(c.x + 16, c.y - 28);
    ctx.lineTo(c.x, c.y - 40);
    ctx.lineTo(c.x - 16, c.y - 28);
    ctx.closePath();
    ctx.fill();
    // crank + bucket
    ctx.strokeStyle = '#4a3214';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c.x, c.y - 30); ctx.lineTo(c.x, c.y - 18); ctx.stroke();
    ctx.fillStyle = hsl(33, 42, 40);
    ctx.fillRect(c.x - 4, c.y - 18, 8, 6);
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
    ctx.strokeStyle = hsl(26, 38, 27);
    ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(c.x, c.y + 2); ctx.lineTo(c.x, c.y - 26); ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(c.x - 13, c.y - 18); ctx.lineTo(c.x + 13, c.y - 18); ctx.stroke();
    ctx.fillStyle = '#b06f3c';
    rr(c.x - 7, c.y - 22, 14, 13, 4);
    ctx.fill();
    ctx.fillStyle = '#e8ca8c';
    ctx.beginPath(); ctx.arc(c.x, c.y - 29, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d2a14';
    ctx.beginPath(); ctx.arc(c.x - 2.5, c.y - 30, 1.1, 0, Math.PI * 2); ctx.arc(c.x + 2.5, c.y - 30, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#82702e';
    ctx.fillRect(c.x - 10, c.y - 36, 20, 3.5);
    rr(c.x - 5.5, c.y - 43, 11, 8, 2.5);
    ctx.fill();
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

  function drawBuilding(state, b, index, alpha) {
    const def = D.BUILDINGS[b.type];
    if (alpha !== undefined) ctx.globalAlpha = alpha;

    if (b.type === 'well') drawWell(state, b);
    else if (b.type === 'sprinkler') drawSprinkler(state, b);
    else if (b.type === 'scarecrow') drawScarecrow(state, b);
    else if (b.type === 'drone') drawDrone(state, b);
    else if (b.type === 'greenhouse') drawGreenhouse(state, b, def);
    else drawBarnLike(state, b, def);

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

  // ---------------- decor ----------------
  function drawTree(cx, cy, pal, h, season) {
    const s = 0.85 + (h * 731 % 1) * 0.5;
    const sway = Math.sin(time * 1.2 + cx * 0.05) * 1.5;
    shadow(cx + 3, cy + 2, 17 * s, 7 * s);
    // trunk: two-tone
    ctx.fillStyle = hsl(24, 36, 25);
    ctx.fillRect(cx - 3 * s, cy - 20 * s, 6 * s, 21 * s);
    ctx.fillStyle = hsl(28, 40, 36);
    ctx.fillRect(cx - 3 * s, cy - 20 * s, 2.4 * s, 21 * s);
    // 3-value canopy: deep base / mid mass / lit crown toward the sun
    let deep = pal.trees[0], mid = pal.trees[1], lit = pal.trees[2];
    if (season === 2) { // fall: per-tree crimson/orange/gold pick
      const t = pal.fallTriad[Math.floor(h * 100) % 3];
      deep = [t[0] - 6, t[1], t[2] - 14]; mid = t; lit = [t[0] + 8, t[1], t[2] + 11];
    }
    ctx.fillStyle = hsl(deep[0], deep[1], deep[2]);
    ctx.beginPath();
    ctx.arc(cx + sway, cy - 28 * s, 15 * s, 0, Math.PI * 2);
    ctx.arc(cx - 9 * s + sway, cy - 20 * s, 10 * s, 0, Math.PI * 2);
    ctx.arc(cx + 9 * s + sway, cy - 20 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hsl(mid[0], mid[1], mid[2]);
    ctx.beginPath();
    ctx.arc(cx + sway, cy - 31 * s, 12.5 * s, 0, Math.PI * 2);
    ctx.arc(cx - 8 * s + sway, cy - 23 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(cx + 8.5 * s + sway, cy - 22 * s, 7.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hsl(lit[0], lit[1], lit[2]);
    ctx.beginPath();
    ctx.arc(cx - 5 * s + sway, cy - 34 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(cx - 10 * s + sway, cy - 27 * s, 5 * s, 0, Math.PI * 2);
    ctx.fill();
    // cream rim light on the sun-facing (upper-left) contour
    if (SUN.elev > 0.05) {
      ctx.strokeStyle = `rgba(255,246,200,${0.25 + 0.3 * SUN.elev})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx + sway, cy - 28 * s, 15 * s, Math.PI * 1.05, Math.PI * 1.6);
      ctx.stroke();
    }
    if (season === 0 && pal.blossom && SUN.dark < 0.5) { // spring blossoms
      ctx.fillStyle = pal.blossom;
      for (let i = 0; i < 5; i++) {
        const a = h * 43 + i * 2.3;
        ctx.beginPath();
        ctx.arc(cx + sway + Math.cos(a) * 11 * s, cy - 28 * s + Math.sin(a) * 8 * s, 1.7 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (season === 3) { // snow lining the canopy masses
      ctx.fillStyle = 'rgba(250,252,255,.85)';
      ctx.beginPath();
      ctx.arc(cx + sway, cy - 36 * s, 9.5 * s, Math.PI, 0);
      ctx.arc(cx - 9 * s + sway, cy - 26 * s, 6 * s, Math.PI, 0);
      ctx.arc(cx + 9 * s + sway, cy - 25 * s, 5.5 * s, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawDecorTile(state, x, y, pal) {
    const h = hash(x, y);
    const c = proj(x + 0.5, y + 0.5);
    if (h < 0.38) drawTree(c.x, c.y, pal, h, state.season);
    else if (h < 0.48) { // bush
      shadow(c.x, c.y + 2, 12, 5);
      const t = pal.trees[1];
      ctx.fillStyle = hsl(t[0], t[1], t[2]);
      ctx.beginPath(); ctx.arc(c.x - 6, c.y - 4, 8, 0, Math.PI * 2); ctx.arc(c.x + 6, c.y - 4, 8, 0, Math.PI * 2); ctx.arc(c.x, c.y - 9, 9, 0, Math.PI * 2); ctx.fill();
      const l = pal.trees[2];
      ctx.fillStyle = hsl(l[0], l[1], l[2]);
      ctx.beginPath(); ctx.arc(c.x - 4, c.y - 10, 5, 0, Math.PI * 2); ctx.fill();
    } else if (h < 0.55) { // rock
      shadow(c.x, c.y + 2, 11, 4);
      ctx.fillStyle = hsl(222, 8, 58);
      ctx.beginPath(); ctx.arc(c.x, c.y - 5, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hsl(38, 12, 70);
      ctx.beginPath(); ctx.arc(c.x - 3, c.y - 8, 4.5, 0, Math.PI * 2); ctx.fill();
    } else if (h < 0.62 && state.season !== 3 && pal.flowers.length) { // wildflowers
      ctx.fillStyle = pal.flowers[Math.floor(h * 100) % pal.flowers.length];
      ctx.beginPath(); ctx.arc(c.x - 8, c.y - 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(c.x + 9, c.y - 8, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = pal.edge;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(c.x - 8, c.y + 2); ctx.lineTo(c.x - 8, c.y - 1); ctx.stroke();
    }
  }

  // ---------------- animals (hand-drawn vector sprites) ----------------
  function legs(cx, cy, w, t, col) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    const step = Math.sin(t * 8) * 1.5;
    ctx.beginPath(); ctx.moveTo(cx - w, cy); ctx.lineTo(cx - w + step, cy + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w, cy); ctx.lineTo(cx + w - step, cy + 6); ctx.stroke();
  }

  function drawAnimalSprite(type, sx, sy, t, uid, flip) {
    ctx.save();
    ctx.translate(sx, sy);
    if (flip) ctx.scale(-1, 1);
    const bob = Math.abs(Math.sin(t * 5 + uid)) * 1.2;
    ctx.translate(0, -bob);
    shadow(0, 7 + bob, 11, 4);

    switch (type) {
      case 'chicken': {
        legs(0, 3, 3, t + uid, '#c9862b');
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
        legs(0, 3, 3, t + uid, '#c9862b');
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
        legs(-3, 4, 4, t + uid, '#8a8178');
        legs(5, 4, 3, t + uid + 1, '#8a8178');
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
        legs(-2, 4, 4, t + uid, '#8a8178');
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
        legs(-2, 4, 4, t + uid, '#5c554c');
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
        legs(-2, 4, 4, t + uid, '#c98a86');
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

  // wandering animals near their homes — dt-correct update, pooled entities
  const seenUids = new Set();
  function updateAnimals(state, dt) {
    seenUids.clear();
    const k = 1 - Math.exp(-dt * 1.2); // frame-rate-independent lerp
    for (let i = 0; i < state.animals.length; i++) {
      const a = state.animals[i];
      const home = state.buildings[a.home];
      if (!home) continue;
      seenUids.add(a.uid);
      const def = D.BUILDINGS[home.type];
      let anim = animalAnim.get(a.uid);
      if (!anim) {
        anim = { x: home.x + def.w / 2, y: home.y + def.h + 0.4, tx: 0, ty: 0, timer: 0, flip: false };
        anim.tx = anim.x; anim.ty = anim.y;
        animalAnim.set(a.uid, anim);
      }
      anim.timer -= dt;
      if (anim.timer <= 0) {
        anim.timer = 2 + Math.random() * 3;
        anim.tx = home.x + Math.random() * def.w + (Math.random() - 0.5) * 1.2;
        anim.ty = home.y + def.h + 0.1 + Math.random() * 0.9;
      }
      anim.x += (anim.tx - anim.x) * k;
      anim.y += (anim.ty - anim.y) * k;
      anim.flip = anim.tx < anim.x;
    }
    for (const key of animalAnim.keys()) if (!seenUids.has(key) && key !== 99) animalAnim.delete(key);
  }

  function drawAnimal(state, i) {
    const a = state.animals[i];
    if (!a) return;
    const anim = animalAnim.get(a.uid);
    if (!anim) return;
    const p = proj(anim.x, anim.y);
    drawAnimalSprite(a.type, p.x, p.y, a.sick ? 0 : time, a.uid, anim.flip);
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
        if ((time % 6) < 0.14) { // sky-band flash, softer than a full-screen slam
          ctx.fillStyle = 'rgba(235,240,255,.28)';
          ctx.fillRect(0, 0, vw, vh * 0.55);
          ctx.fillStyle = 'rgba(235,240,255,.12)';
          ctx.fillRect(0, vh * 0.55, vw, vh * 0.45);
        }
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
      lmx.fillStyle = 'rgb(72,78,140)';
      lmx.fillRect(0, 0, lm.width, lm.height);
    } else {
      const key = Math.round(dusk * 24) + ':' + Math.round(dark * 24) + ':' + lm.height;
      if (key !== ambKey) { // ambient gradient rebuilt only when the light changes
        ambKey = key;
        ambGrad = lmx.createLinearGradient(0, 0, 0, lm.height);
        const top = mix3(AMB_DAY, [255, 196, 120], [90, 96, 158], dusk, dark);
        const mid = mix3(AMB_DAY, [250, 176, 138], [70, 76, 138], dusk, dark);
        const bot = mix3(AMB_DAY, [206, 152, 188], [58, 64, 124], dusk, dark);
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
  function drawFx(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const p = bursts[i];
      p.age += dt;
      if (p.age > 0.6) { bursts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      ctx.globalAlpha = 1 - p.age / 0.6;
      ctx.fillStyle = p.color || '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * (1 - p.age), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (floats.length) {
      ctx.font = '900 16px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        f.age += dt;
        if (f.age > 1.3) { floats.splice(i, 1); continue; }
        const a = Math.min(1, (1.3 - f.age) / 0.4);
        ctx.globalAlpha = a;
        ctx.strokeStyle = 'rgba(40,25,5,.8)';
        ctx.lineWidth = 4;
        ctx.strokeText(f.text, f.x, f.y - 20 - f.age * 32);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y - 20 - f.age * 32);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------------- ghost (build placement) ----------------
  function drawGhost(state) {
    if (!ghost) return;
    const def = D.BUILDINGS[ghost.type];
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
  const K_CROP = 0, K_DECOR = 1, K_BLDG = 2, K_SIGN = 3, K_ANIMAL = 4;
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
    clampCam();
    computeSun(state);
    lightN = 0;

    const pal = PALETTES[state.season];

    // sky → meadow backdrop (screen space, cached gradient)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(state);

    // world transform (iso px)
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z), dpr * (vh / 2 - cam.y * cam.z));

    // ground pass: baked world layer, ONE drawImage.
    // Nearest sampling when at/below bake scale — 5× cheaper on software raster,
    // indistinguishable on a supersampled noise ground.
    updateGround(state, pal);
    const groundScale = dpr * cam.z / GS;
    if (groundScale <= 1.55) ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ground.c, ground.minX, ground.minY, ground.w, ground.h);
    ctx.imageSmoothingEnabled = true;
    drawPond(state);
    drawParcels(state);

    // viewport culling: visible tile window from the 4 screen corners
    const c1 = screenToTile(0, 0), c2 = screenToTile(vw, 0), c3 = screenToTile(0, vh), c4 = screenToTile(vw, vh);
    const vx0 = Math.max(0, Math.floor(Math.min(c1.x, c2.x, c3.x, c4.x)) - 2);
    const vx1 = Math.min(D.WORLD_W - 1, Math.ceil(Math.max(c1.x, c2.x, c3.x, c4.x)) + 3);
    const vy0 = Math.max(0, Math.floor(Math.min(c1.y, c2.y, c3.y, c4.y)) - 2);
    const vy1 = Math.min(D.WORLD_H - 1, Math.ceil(Math.max(c1.y, c2.y, c3.y, c4.y)) + 3);

    // entity pass: pooled records, depth-sorted by (x + y)
    entN = 0;
    for (let y = vy0; y <= vy1; y++)
      for (let x = vx0; x <= vx1; x++) {
        const tile = state.tiles[y][x];
        if (tile.crop) {
          pushEnt(x + y + 0.55, K_CROP, x, y);
        } else if (!tile.obj && Game.parcelAt(x, y) < 0 && !(x <= 2 && y >= 6 && y <= 9)) {
          if (hash(x, y) < 0.62) pushEnt(x + y + 0.5, K_DECOR, x, y);
        }
      }

    for (let i = 0; i < state.buildings.length; i++) {
      const b = state.buildings[i];
      if (!b) continue;
      const def = D.BUILDINGS[b.type];
      if (b.x + def.w < vx0 || b.x > vx1 + 1 || b.y + def.h < vy0 || b.y > vy1 + 1) continue;
      pushEnt(b.x + def.w - 1 + b.y + def.h - 1 + 0.62, K_BLDG, i, 0);
    }

    for (let i = 0; i < D.PARCELS.length; i++) {
      if (!state.unlockedParcels.includes(i)) {
        const p = D.PARCELS[i];
        pushEnt(p.x + p.w / 2 + p.y + p.h / 2, K_SIGN, i, 0);
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
        case K_DECOR: drawDecorTile(state, e.a, e.b, pal); break;
        case K_BLDG: {
          const b = state.buildings[e.a];
          if (b) drawBuilding(state, b, e.a);
          break;
        }
        case K_SIGN: drawSign(state, e.a); break;
        case K_ANIMAL: drawAnimal(state, e.a); break;
      }
    }

    drawFireflies(state);
    drawAmbient(state);
    drawGhost(state);
    drawFx(dt);
    // screen-space overlays
    drawWeather(state);
    drawNight(state);
    // vignette+grain is invisible under the deep-night multiply — skip it there
    if (SUN.dark < 0.6) drawGrade();
  }

  return {
    init, render, cam, clampCam, centerOn, screenToTile, tileToScreen,
    addFloat, addBurst, setGhost, getGhost: () => ghost,
    get vw() { return vw; }, get vh() { return vh; },
  };
})();
