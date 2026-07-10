/* ============ Harvest Empire — canvas renderer ============ */
'use strict';

const Renderer = (() => {
  const D = DATA;
  const T = D.TILE;

  let canvas, ctx, dpr = 1, vw = 0, vh = 0;
  let time = 0;

  const cam = { x: D.WORLD_W * T / 2, y: D.WORLD_H * T / 2, z: 1 };

  let ghost = null;             // {type, x, y}
  const floats = [];            // floating texts
  const bursts = [];            // particle bursts
  const animalAnim = new Map(); // ephemeral wander positions

  // deterministic per-tile randomness
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  const PALETTES = [
    { grass: '#72c04f', grass2: '#7ecb5a', edge: '#5aa93e', tree: '#3e8e41', treeLight: '#57a85a' }, // spring
    { grass: '#7fc24a', grass2: '#8ccd55', edge: '#66a838', tree: '#357a38', treeLight: '#4f9a52' }, // summer
    { grass: '#b3a355', grass2: '#bfae5f', edge: '#96884a', tree: '#b06a2a', treeLight: '#cf8a3a' }, // fall
    { grass: '#dde6ec', grass2: '#e8f0f5', edge: '#c3cfd8', tree: '#5a7a6a', treeLight: '#7c9a8a' }, // winter
  ];

  // ---------------- setup ----------------
  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    vw = window.innerWidth;
    vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    // sensible default zoom: fit the starting farm on screen
    const fit = Math.min(vw / (10 * T), vh / (11 * T));
    if (!resize.done) { cam.z = Math.max(0.5, Math.min(1.4, fit)); resize.done = true; }
  }

  function screenToWorld(sx, sy) {
    return { x: (sx - vw / 2) / cam.z + cam.x, y: (sy - vh / 2) / cam.z + cam.y };
  }

  function clampCam() {
    const mx = D.WORLD_W * T, my = D.WORLD_H * T;
    const halfW = vw / 2 / cam.z, halfH = vh / 2 / cam.z;
    cam.x = Math.min(Math.max(cam.x, Math.min(halfW, mx / 2)), Math.max(mx - halfW, mx / 2));
    cam.y = Math.min(Math.max(cam.y, Math.min(halfH, my / 2)), Math.max(my - halfH, my / 2));
    cam.z = Math.min(2.2, Math.max(0.35, cam.z));
  }

  // ---------------- fx ----------------
  function addFloat(x, y, text, color) { floats.push({ x, y, text, color: color || '#fff', age: 0 }); }
  function addBurst(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
      bursts.push({ x, y, vx: Math.cos(a) * (40 + Math.random() * 50), vy: Math.sin(a) * (40 + Math.random() * 50) - 40, age: 0, color });
    }
  }
  function setGhost(g) { ghost = g; }

  // ---------------- small drawing helpers ----------------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function emoji(ch, x, y, size) {
    ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y);
  }

  function shadow(x, y, w, h) {
    ctx.fillStyle = 'rgba(30,20,5,.18)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------- terrain ----------------
  function drawGround(state, pal) {
    // base
    ctx.fillStyle = pal.grass;
    ctx.fillRect(-T * 4, -T * 4, (D.WORLD_W + 8) * T, (D.WORLD_H + 8) * T);

    // tile variation (checker-ish patches)
    for (let y = 0; y < D.WORLD_H; y++) {
      for (let x = 0; x < D.WORLD_W; x++) {
        const h = hash(x, y);
        if ((x + y) % 2 === 0 || h > 0.75) {
          ctx.fillStyle = pal.grass2;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x * T, y * T, T, T);
          ctx.globalAlpha = 1;
        }
        // tufts / snow sparkle
        if (h > 0.6 && h < 0.68) {
          ctx.fillStyle = state.season === 3 ? '#fff' : pal.edge;
          ctx.globalAlpha = 0.55;
          const gx = x * T + (h * 997 % 1) * T * 0.7 + 8;
          const gy = y * T + (h * 613 % 1) * T * 0.7 + 8;
          ctx.beginPath(); ctx.arc(gx, gy, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(gx + 7, gy + 3, 1.8, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function inAnyParcel(x, y) { return Game.parcelAt(x, y) >= 0; }

  function drawDecor(state, pal) {
    for (let y = 0; y < D.WORLD_H; y++) {
      for (let x = 0; x < D.WORLD_W; x++) {
        if (inAnyParcel(x, y)) continue;
        const h = hash(x, y);
        const cx = x * T + T / 2, cy = y * T + T / 2;
        if (h < 0.38) drawTree(cx, cy, pal, h, state.season);
        else if (h < 0.48) { // bush
          shadow(cx, cy + 10, 14, 5);
          ctx.fillStyle = pal.tree;
          ctx.beginPath(); ctx.arc(cx - 6, cy + 4, 9, 0, Math.PI * 2); ctx.arc(cx + 6, cy + 4, 9, 0, Math.PI * 2); ctx.arc(cx, cy - 2, 10, 0, Math.PI * 2); ctx.fill();
        } else if (h < 0.55) { // rock
          shadow(cx, cy + 9, 12, 4);
          ctx.fillStyle = '#a8a29a';
          ctx.beginPath(); ctx.arc(cx, cy + 2, 9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#c4beb4';
          ctx.beginPath(); ctx.arc(cx - 3, cy - 1, 5, 0, Math.PI * 2); ctx.fill();
        } else if (h < 0.62 && state.season !== 3) { // flowers
          const colors = ['#f06292', '#ffd54f', '#ba68c8', '#ff8a65'];
          ctx.fillStyle = colors[Math.floor(h * 100) % 4];
          ctx.beginPath(); ctx.arc(cx - 8, cy + 2, 3.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(cx + 9, cy - 6, 3.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  function drawTree(cx, cy, pal, h, season) {
    const s = 0.85 + (h * 731 % 1) * 0.5;
    const sway = Math.sin(time * 1.2 + cx * 0.05) * 1.5;
    shadow(cx, cy + 16 * s, 16 * s, 6 * s);
    ctx.fillStyle = '#7a5233';
    ctx.fillRect(cx - 3 * s, cy - 2 * s, 6 * s, 18 * s);
    ctx.fillStyle = pal.tree;
    ctx.beginPath(); ctx.arc(cx + sway, cy - 14 * s, 16 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.treeLight;
    ctx.beginPath(); ctx.arc(cx - 6 * s + sway, cy - 18 * s, 9 * s, 0, Math.PI * 2); ctx.fill();
    if (season === 3) { // snow cap
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(cx + sway, cy - 22 * s, 10 * s, 0, Math.PI); ctx.fill();
    }
  }

  function drawParcels(state, pal) {
    for (let i = 0; i < D.PARCELS.length; i++) {
      const p = D.PARCELS[i];
      const px = p.x * T, py = p.y * T, pw = p.w * T, ph = p.h * T;
      if (state.unlockedParcels.includes(i)) {
        // subtle grid on owned land
        ctx.strokeStyle = 'rgba(0,0,0,.05)';
        ctx.lineWidth = 1;
        for (let gx = 1; gx < p.w; gx++) { ctx.beginPath(); ctx.moveTo(px + gx * T, py); ctx.lineTo(px + gx * T, py + ph); ctx.stroke(); }
        for (let gy = 1; gy < p.h; gy++) { ctx.beginPath(); ctx.moveTo(px, py + gy * T); ctx.lineTo(px + pw, py + gy * T); ctx.stroke(); }
        drawFence(px, py, pw, ph);
      } else {
        // locked overlay
        ctx.fillStyle = 'rgba(30, 24, 10, .22)';
        rr(px + 3, py + 3, pw - 6, ph - 6, 12);
        ctx.fill();
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.lineWidth = 3;
        rr(px + 3, py + 3, pw - 6, ph - 6, 12);
        ctx.stroke();
        ctx.setLineDash([]);
        drawSign(state, i, px + pw / 2, py + ph / 2);
      }
    }
  }

  function drawFence(px, py, pw, ph) {
    ctx.strokeStyle = '#8a5a2e';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8;
    rr(px + 2, py + 2, pw - 4, ph - 4, 6);
    ctx.stroke();
    ctx.fillStyle = '#a06b38';
    const step = T;
    for (let x = px; x <= px + pw; x += step) { ctx.fillRect(x - 2.5, py - 3, 5, 10); ctx.fillRect(x - 2.5, py + ph - 7, 5, 10); }
    for (let y = py; y <= py + ph; y += step) { ctx.fillRect(px - 3, y - 2.5, 10, 5); ctx.fillRect(px + pw - 7, y - 2.5, 10, 5); }
    ctx.globalAlpha = 1;
  }

  function drawSign(state, index, cx, cy) {
    const p = D.PARCELS[index];
    shadow(cx, cy + 26, 30, 8);
    ctx.fillStyle = '#6d4c2b';
    ctx.fillRect(cx - 4, cy - 4, 8, 32);
    ctx.fillStyle = '#c98d5a';
    rr(cx - 52, cy - 34, 104, 44, 10);
    ctx.fill();
    ctx.strokeStyle = '#8a5a2e';
    ctx.lineWidth = 3;
    rr(cx - 52, cy - 34, 104, 44, 10);
    ctx.stroke();
    ctx.fillStyle = '#4a2f14';
    ctx.font = '900 16px Nunito, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const locked = state.level < p.level;
    ctx.fillText(locked ? '🔒 Lv ' + p.level : p.cost.toLocaleString() + ' 🪙', cx, cy - 18);
    ctx.font = '800 11px Nunito, system-ui, sans-serif';
    ctx.fillText(locked ? 'Keep growing!' : 'Tap to buy land', cx, cy - 2);
  }

  // ---------------- soil & crops ----------------
  function drawSoil(x, y, tile) {
    const wet = tile.crop && tile.crop.water > 0.4;
    ctx.fillStyle = wet ? '#79512f' : '#9b6d43';
    rr(x * T + 4, y * T + 4, T - 8, T - 8, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,35,12,.35)';
    ctx.lineWidth = 2;
    rr(x * T + 4, y * T + 4, T - 8, T - 8, 10);
    ctx.stroke();
    // furrows
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x * T + 10, y * T + 4 + i * (T - 8) / 4);
      ctx.lineTo(x * T + T - 10, y * T + 4 + i * (T - 8) / 4);
      ctx.stroke();
    }
    if (wet) { // moisture sheen
      ctx.fillStyle = 'rgba(120,190,255,.10)';
      rr(x * T + 4, y * T + 4, T - 8, T - 8, 10);
      ctx.fill();
    }
  }

  function drawCrop(x, y, crop) {
    const def = D.CROPS[crop.id];
    const cx = x * T + T / 2;
    const cy = y * T + T / 2 + 6;
    const s = crop.prog;

    if (crop.dead) {
      ctx.strokeStyle = '#8a7a60';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 8);
      ctx.quadraticCurveTo(cx + 4, cy - 6, cx + 12, cy - 2);
      ctx.stroke();
      ctx.fillStyle = '#a4947a';
      ctx.beginPath(); ctx.ellipse(cx + 13, cy - 2, 5, 3, 0.5, 0, Math.PI * 2); ctx.fill();
      return;
    }

    const sway = Math.sin(time * 2.2 + x * 1.7 + y) * 0.06;
    const mature = s >= 1;
    const bounce = mature ? Math.sin(time * 3 + x) * 1.5 : 0;

    ctx.save();
    ctx.translate(cx, cy + bounce);
    ctx.rotate(sway * Math.min(1, s * 2));

    if (mature) { // soft glow so ready crops pop
      const g = ctx.createRadialGradient(0, -6, 2, 0, -6, 26);
      g.addColorStop(0, 'rgba(255,255,190,.45)');
      g.addColorStop(1, 'rgba(255,255,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -6, 26, 0, Math.PI * 2); ctx.fill();
    }

    if (s < 0.22) { // sprout
      ctx.strokeStyle = '#7cb342';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = '#8bc34a';
      ctx.beginPath(); ctx.ellipse(-4, -1, 5, 3, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, -1, 5, 3, 0.6, 0, Math.PI * 2); ctx.fill();
    } else {
      const k = 0.45 + 0.55 * Math.min(1, s / 0.95); // growth scale
      ctx.scale(k, k);
      drawTemplate(def, s, mature);
    }
    ctx.restore();

    // thirsty indicator
    if (!mature && crop.water <= 0.35 && Math.sin(time * 5) > -0.2) {
      ctx.fillStyle = '#29b6f6';
      ctx.beginPath();
      const dy2 = y * T + 10;
      ctx.moveTo(cx + 16, dy2 - 6);
      ctx.quadraticCurveTo(cx + 22, dy2 + 2, cx + 16, dy2 + 6);
      ctx.quadraticCurveTo(cx + 10, dy2 + 2, cx + 16, dy2 - 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.arc(cx + 14, dy2, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawTemplate(def, s, mature) {
    const leaf = def.leaf, col = def.color;
    ctx.lineCap = 'round';
    switch (def.tpl) {
      case 'root': {
        if (mature) { // bulge of the root peeking out
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(0, 6, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          ctx.beginPath(); ctx.ellipse(-3, 3, 3, 2.5, 0, 0, Math.PI * 2); ctx.fill();
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
        ctx.strokeStyle = mature && !def.tall ? '#c9a227' : leaf;
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
            } else { // wheat head
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
            ctx.fillStyle = 'rgba(255,255,255,.35)';
            ctx.beginPath(); ctx.arc(fx2 - 1.5, fy2 - 1.5, 1.5, 0, Math.PI * 2); ctx.fill();
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
          ctx.fillStyle = 'rgba(255,255,255,.3)';
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
          ctx.strokeStyle = 'rgba(0,0,0,.15)';
          ctx.lineWidth = 2;
          for (const a of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(a + 2, -4); ctx.quadraticCurveTo(a + 2, 4, a + 2, 12); ctx.stroke(); }
          ctx.fillStyle = '#4e6b1e';
          ctx.fillRect(0, -8, 4, 5);
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
          ctx.fillStyle = '#6d4c2b';
          ctx.beginPath(); ctx.arc(0, -16, 6, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#8bc34a';
          ctx.beginPath(); ctx.arc(0, -15, 5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
    }
  }

  // ---------------- buildings ----------------
  function drawBuilding(state, b, index, alpha) {
    const def = D.BUILDINGS[b.type];
    const px = b.x * T, py = b.y * T, w = def.w * T, h = def.h * T;
    if (alpha !== undefined) ctx.globalAlpha = alpha;

    if (b.type === 'well') { drawWell(px, py); }
    else if (b.type === 'sprinkler') { drawSprinkler(px, py, state); }
    else if (b.type === 'scarecrow') { drawScarecrow(px, py); }
    else if (b.type === 'greenhouse') { drawGreenhouse(px, py, w, h); }
    else drawBarnLike(px, py, w, h, def);

    ctx.globalAlpha = 1;
    if (index === undefined) return;

    // ready badge
    let ready = 0;
    if (def.capacity) ready = Game.readyIn(index);
    else if (b.queue) ready = b.queue.filter(j => state.now >= j.done).length;
    if (ready > 0) {
      const bx = px + w / 2, by = py - 10 + Math.sin(time * 4) * 3;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffb300';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2); ctx.stroke();
      emoji('❗', bx, by + 1, 15);
    }
  }

  function drawBarnLike(px, py, w, h, def) {
    shadow(px + w / 2, py + h - 6, w * 0.45, 8);
    // walls
    ctx.fillStyle = '#cf9257';
    rr(px + 6, py + h * 0.34, w - 12, h * 0.6, 8);
    ctx.fill();
    ctx.strokeStyle = '#8a5a2e';
    ctx.lineWidth = 2.5;
    rr(px + 6, py + h * 0.34, w - 12, h * 0.6, 8);
    ctx.stroke();
    // roof
    ctx.fillStyle = def.roof || '#b5563c';
    ctx.beginPath();
    ctx.moveTo(px, py + h * 0.42);
    ctx.lineTo(px + w / 2, py + 4);
    ctx.lineTo(px + w, py + h * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.2)';
    ctx.stroke();
    // door
    ctx.fillStyle = '#7a4a24';
    rr(px + w / 2 - 11, py + h * 0.58, 22, h * 0.34, 6);
    ctx.fill();
    // icon plate
    ctx.fillStyle = '#fff8e7';
    ctx.beginPath(); ctx.arc(px + w / 2, py + h * 0.44, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.arc(px + w / 2, py + h * 0.44, 13, 0, Math.PI * 2); ctx.stroke();
    emoji(def.emoji, px + w / 2, py + h * 0.44 + 1, 15);
  }

  function drawWell(px, py) {
    const cx = px + T / 2, cy = py + T / 2;
    shadow(cx, cy + 18, 18, 6);
    ctx.fillStyle = '#98a0a8';
    ctx.beginPath(); ctx.arc(cx, cy + 6, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath(); ctx.arc(cx, cy + 6, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.beginPath(); ctx.ellipse(cx - 3, cy + 3, 4, 2.5, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a5233';
    ctx.fillRect(cx - 14, cy - 16, 4, 22);
    ctx.fillRect(cx + 10, cy - 16, 4, 22);
    ctx.fillStyle = '#b5563c';
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy - 12);
    ctx.lineTo(cx, cy - 26);
    ctx.lineTo(cx + 20, cy - 12);
    ctx.closePath();
    ctx.fill();
  }

  function drawSprinkler(px, py, state) {
    const cx = px + T / 2, cy = py + T / 2;
    shadow(cx, cy + 14, 10, 4);
    ctx.fillStyle = '#78909c';
    ctx.fillRect(cx - 3, cy - 8, 6, 22);
    ctx.fillStyle = '#29b6f6';
    ctx.beginPath(); ctx.arc(cx, cy - 12, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath(); ctx.arc(cx - 2.5, cy - 14, 2.5, 0, Math.PI * 2); ctx.fill();
    // animated droplets
    for (let i = 0; i < 3; i++) {
      const a = time * 2.4 + i * (Math.PI * 2 / 3);
      const r = 12 + ((time * 22 + i * 13) % 18);
      ctx.fillStyle = 'rgba(120,200,255,.5)';
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy - 12 + Math.sin(a) * r * 0.5, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawScarecrow(px, py) {
    const cx = px + T / 2, cy = py + T / 2;
    shadow(cx, cy + 18, 10, 4);
    ctx.strokeStyle = '#7a5233';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx, cy + 18); ctx.lineTo(cx, cy - 8); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx - 14, cy - 2); ctx.lineTo(cx + 14, cy - 2); ctx.stroke();
    // shirt
    ctx.fillStyle = '#c96a3a';
    rr(cx - 8, cy - 6, 16, 14, 5);
    ctx.fill();
    // head
    ctx.fillStyle = '#f2d191';
    ctx.beginPath(); ctx.arc(cx, cy - 14, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a2f14';
    ctx.beginPath(); ctx.arc(cx - 3, cy - 15, 1.3, 0, Math.PI * 2); ctx.arc(cx + 3, cy - 15, 1.3, 0, Math.PI * 2); ctx.fill();
    // hat
    ctx.fillStyle = '#8d6e2f';
    ctx.fillRect(cx - 11, cy - 21, 22, 4);
    rr(cx - 6, cy - 29, 12, 9, 3);
    ctx.fill();
  }

  function drawGreenhouse(px, py, w, h) {
    shadow(px + w / 2, py + h - 8, w * 0.42, 8);
    ctx.fillStyle = 'rgba(178, 227, 245, .75)';
    rr(px + 8, py + h * 0.3, w - 16, h * 0.62, 8);
    ctx.fill();
    ctx.strokeStyle = '#7fa8b8';
    ctx.lineWidth = 2.5;
    rr(px + 8, py + h * 0.3, w - 16, h * 0.62, 8);
    ctx.stroke();
    // glass panes
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + w / 2, py + h * 0.3); ctx.lineTo(px + w / 2, py + h * 0.92); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 8, py + h * 0.6); ctx.lineTo(px + w - 8, py + h * 0.6); ctx.stroke();
    // roof
    ctx.fillStyle = 'rgba(200, 240, 255, .85)';
    ctx.beginPath();
    ctx.moveTo(px + 2, py + h * 0.34);
    ctx.lineTo(px + w / 2, py + 6);
    ctx.lineTo(px + w - 2, py + h * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7fa8b8';
    ctx.stroke();
    // plants inside
    emoji('🌱', px + w * 0.32, py + h * 0.72, 14);
    emoji('🌷', px + w * 0.66, py + h * 0.72, 14);
  }

  // ---------------- animals ----------------
  function drawAnimals(state) {
    state.animals.forEach((a, i) => {
      const home = state.buildings[a.home];
      if (!home) return;
      const def = D.BUILDINGS[home.type];
      let anim = animalAnim.get(i);
      if (!anim) {
        anim = { x: (home.x + def.w / 2) * T, y: (home.y + def.h + 0.4) * T, tx: 0, ty: 0, timer: 0 };
        anim.tx = anim.x; anim.ty = anim.y;
        animalAnim.set(i, anim);
      }
      anim.timer -= 1 / 60;
      if (anim.timer <= 0) {
        anim.timer = 2 + Math.random() * 3;
        anim.tx = (home.x + Math.random() * def.w) * T + (Math.random() - 0.5) * T * 1.6;
        anim.ty = (home.y + def.h + 0.15 + Math.random() * 0.8) * T;
      }
      anim.x += (anim.tx - anim.x) * 0.02;
      anim.y += (anim.ty - anim.y) * 0.02;
      const bob = Math.abs(Math.sin(time * 4 + i * 2)) * 2.5;
      shadow(anim.x, anim.y + 9, 9, 3.5);
      emoji(D.ANIMALS[a.type].emoji, anim.x, anim.y - bob, 22);
      if (a.prodProg >= 1) emoji(D.ITEMS[D.ANIMALS[a.type].product].emoji, anim.x + 11, anim.y - 16 - bob, 12);
    });
    // prune stale entries
    if (animalAnim.size > state.animals.length) {
      for (const k of animalAnim.keys()) if (k >= state.animals.length) animalAnim.delete(k);
    }
  }

  // ---------------- weather & sky ----------------
  function drawWeather(state) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // screen space
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
      ctx.strokeStyle = 'rgba(140, 190, 255, .5)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 70; i++) {
        const seed = i * 137.5;
        const rx = ((seed * 7 + time * 480) % (vw + 100)) - 50;
        const ry = ((seed * 13 + time * 820) % (vh + 60)) - 30;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 4, ry + 14);
        ctx.stroke();
      }
      if (w === 'storm') {
        ctx.fillStyle = 'rgba(20, 26, 46, .22)';
        ctx.fillRect(0, 0, vw, vh);
        if ((time % 6) < 0.14) {
          ctx.fillStyle = 'rgba(255,255,255,.3)';
          ctx.fillRect(0, 0, vw, vh);
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
      ctx.fillStyle = 'rgba(255, 140, 40, .09)';
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  function drawDayNight(state) {
    const t = state.t;
    let dark = 0, dusk = 0;
    if (t >= 0.70 && t < 0.78) dusk = (t - 0.70) / 0.08;
    if (t >= 0.78 && t < 0.86) { dark = (t - 0.78) / 0.08; dusk = 1 - dark; }
    else if (t >= 0.86 && t < 0.94) dark = 1;
    else if (t >= 0.94) { dark = 1 - (t - 0.94) / 0.06; dusk = 1 - dark; }
    if (dusk > 0) {
      ctx.fillStyle = `rgba(255, 120, 40, ${dusk * 0.14})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (dark > 0) {
      ctx.fillStyle = `rgba(10, 18, 48, ${dark * 0.42})`;
      ctx.fillRect(0, 0, vw, vh);
      // stars
      if (dark > 0.5) {
        ctx.fillStyle = `rgba(255,255,255,${(dark - 0.5) * 1.2})`;
        for (let i = 0; i < 24; i++) {
          const sx = (i * 193.7) % vw, sy = (i * 97.3) % (vh * 0.5);
          if (Math.sin(time * 2 + i) > 0) { ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill(); }
        }
      }
    }
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
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * (1 - p.age), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.age += dt;
      if (f.age > 1.3) { floats.splice(i, 1); continue; }
      const a = Math.min(1, (1.3 - f.age) / 0.4);
      ctx.globalAlpha = a;
      ctx.font = '900 17px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(40,25,5,.8)';
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, f.x, f.y - f.age * 34);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - f.age * 34);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------- ghost (build placement) ----------------
  function drawGhost(state) {
    if (!ghost) return;
    const def = D.BUILDINGS[ghost.type];
    const ok = Game.canPlaceBuilding(ghost.type, ghost.x, ghost.y);
    ctx.fillStyle = ok ? 'rgba(90, 200, 90, .30)' : 'rgba(220, 70, 50, .30)';
    rr(ghost.x * T + 2, ghost.y * T + 2, def.w * T - 4, def.h * T - 4, 10);
    ctx.fill();
    ctx.strokeStyle = ok ? '#43a047' : '#d32f2f';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    rr(ghost.x * T + 2, ghost.y * T + 2, def.w * T - 4, def.h * T - 4, 10);
    ctx.stroke();
    ctx.setLineDash([]);
    drawBuilding(state, { type: ghost.type, x: ghost.x, y: ghost.y }, undefined, 0.65);
  }

  // ---------------- main render ----------------
  function render(state, dt) {
    if (!state) return;
    time += dt;
    clampCam();

    const pal = PALETTES[state.season];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.edge;
    ctx.fillRect(0, 0, vw, vh);

    // world transform
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z), dpr * (vh / 2 - cam.y * cam.z));

    drawGround(state, pal);
    drawParcels(state, pal);

    // soil + crops
    for (let y = 0; y < D.WORLD_H; y++)
      for (let x = 0; x < D.WORLD_W; x++) {
        const tile = state.tiles[y][x];
        if (tile.k === 'soil') drawSoil(x, y, tile);
      }
    for (let y = 0; y < D.WORLD_H; y++)
      for (let x = 0; x < D.WORLD_W; x++) {
        const tile = state.tiles[y][x];
        if (tile.crop) drawCrop(x, y, tile.crop);
      }

    drawDecor(state, pal);

    // buildings (draw by anchor only)
    state.buildings.forEach((b, i) => drawBuilding(state, b, i));

    drawAnimals(state);
    drawGhost(state);
    drawFx(dt);

    // screen-space overlays
    drawWeather(state);
    drawDayNight(state);
  }

  return { init, render, cam, screenToWorld, clampCam, addFloat, addBurst, setGhost, getGhost: () => ghost, get vw() { return vw; }, get vh() { return vh; } };
})();
