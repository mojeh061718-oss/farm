/* ============ Harvest Empire — isometric (45°) canvas renderer ============ */
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

  // muted, natural palettes
  const PALETTES = [
    { grass: '#79a854', grass2: '#83b25e', edge: '#5f8c42', tree: '#4a7a44', treeLight: '#5d8f55' }, // spring
    { grass: '#8aa04e', grass2: '#94aa57', edge: '#6f8440', tree: '#49703f', treeLight: '#5c8450' }, // summer
    { grass: '#a89355', grass2: '#b19d5e', edge: '#8a7845', tree: '#8a5a2c', treeLight: '#a06f38' }, // fall
    { grass: '#ccd3d8', grass2: '#d8dee2', edge: '#b3bcc2', tree: '#5a6e62', treeLight: '#728878' }, // winter
  ];

  function shade(hex, f) { // f<1 darker, f>1 lighter
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    const b = Math.min(255, Math.round((n & 255) * f));
    return `rgb(${r},${g},${b})`;
  }

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
  function diamond(cx, cy, w, h) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 2, cy);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy);
    ctx.closePath();
  }

  function poly(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

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

  function shadow(x, y, w, h) {
    ctx.fillStyle = 'rgba(25,18,8,.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------- ground ----------------
  function drawGroundTile(state, x, y, pal) {
    const c = proj(x + 0.5, y + 0.5);
    const h = hash(x, y);
    const tile = state.tiles[y][x];

    if (tile.k === 'soil') { drawSoil(state, x, y, tile); return; }

    ctx.fillStyle = (x + y) % 2 === 0 || h > 0.75 ? pal.grass2 : pal.grass;
    diamond(c.x, c.y, TW, TH);
    ctx.fill();

    // grass texture speckles
    if (h > 0.35) {
      ctx.fillStyle = state.season === 3 ? 'rgba(255,255,255,.5)' : shade(pal.edge, 0.92);
      ctx.globalAlpha = 0.5;
      const gx = c.x + (h * 997 % 1 - 0.5) * TW * 0.5;
      const gy = c.y + (h * 613 % 1 - 0.5) * TH * 0.5;
      ctx.beginPath(); ctx.ellipse(gx, gy, 2.4, 1.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(gx + 6, gy + 2, 1.7, 0.9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // faint grid on owned farmland
    if (Game.isUnlocked(x, y)) {
      ctx.strokeStyle = 'rgba(0,0,0,.06)';
      ctx.lineWidth = 1;
      diamond(c.x, c.y, TW, TH);
      ctx.stroke();
    }
  }

  function drawSoil(state, x, y, tile) {
    const c = proj(x + 0.5, y + 0.5);
    const wet = tile.crop && tile.crop.water > 0.4;
    // raised-bed side
    ctx.fillStyle = wet ? '#42301d' : '#5a4128';
    diamond(c.x, c.y + 4, TW * 0.9, TH * 0.9);
    ctx.fill();
    // topsoil
    ctx.fillStyle = wet ? '#5f452c' : '#7d5c3c';
    diamond(c.x, c.y, TW * 0.9, TH * 0.9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,26,12,.45)';
    ctx.lineWidth = 1.5;
    diamond(c.x, c.y, TW * 0.9, TH * 0.9);
    ctx.stroke();
    // furrows along the NE-SW axis
    ctx.strokeStyle = 'rgba(0,0,0,.16)';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      const a = proj(x + 0.2 + (i + 1) * 0.2, y + 0.15);
      const b = proj(x + 0.2 + (i + 1) * 0.2, y + 0.85);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    if (wet) {
      ctx.fillStyle = 'rgba(110,160,210,.10)';
      diamond(c.x, c.y, TW * 0.9, TH * 0.9);
      ctx.fill();
    }
    if (tile.crop && tile.crop.fert && !tile.crop.dead) { // fertilizer flecks
      ctx.fillStyle = 'rgba(222,190,90,.85)';
      for (let i = 0; i < 3; i++) {
        const a = time * 1.5 + i * 2.1 + x * 3 + y;
        ctx.beginPath();
        ctx.arc(c.x + Math.cos(a) * 16, c.y + Math.sin(a * 1.3) * 8, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPond(state) {
    const c = proj(1.6, 7.8);
    ctx.fillStyle = '#3c6e8f';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, TW * 1.15, TH * 1.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a86ab';
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
      ctx.fillStyle = '#6b4c2c';
      ctx.fillRect(pt.x - 2, pt.y - 14, 4, 15);
      ctx.fillStyle = '#83603a';
      ctx.fillRect(pt.x - 2, pt.y - 14, 4, 3);
    };
    const rail = (ax, ay, bx, by) => {
      const a = proj(ax, ay), b = proj(bx, by);
      ctx.strokeStyle = '#7a5836';
      ctx.lineWidth = 2.5;
      for (const h of [5, 10]) {
        ctx.beginPath(); ctx.moveTo(a.x, a.y - h); ctx.lineTo(b.x, b.y - h); ctx.stroke();
      }
    };
    // rails along the north & west edges only (so fences don't hide crops)
    for (let gx = p.x; gx < p.x + p.w; gx++) rail(gx, p.y, gx + 1, p.y);
    for (let gy = p.y; gy < p.y + p.h; gy++) rail(p.x, gy, p.x, gy + 1);
    for (let gx = p.x; gx <= p.x + p.w; gx++) post(gx, p.y);
    for (let gy = p.y + 1; gy <= p.y + p.h; gy++) post(p.x, gy);
  }

  function drawSign(state, index) {
    const p = D.PARCELS[index];
    const c = proj(p.x + p.w / 2, p.y + p.h / 2);
    shadow(c.x, c.y + 4, 26, 7);
    ctx.fillStyle = '#5f452c';
    ctx.fillRect(c.x - 3, c.y - 30, 6, 32);
    ctx.fillStyle = '#a8825a';
    rr(c.x - 50, c.y - 58, 100, 34, 6);
    ctx.fill();
    ctx.strokeStyle = '#6b4c2c';
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
  function drawCrop(x, y, crop) {
    const def = D.CROPS[crop.id];
    const c = proj(x + 0.5, y + 0.5);
    const cx = c.x, cy = c.y + 2;
    const s = crop.prog;

    if (crop.dead) {
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

    ctx.save();
    ctx.translate(cx, cy + bounce);
    ctx.rotate(sway * Math.min(1, s * 2) + droop);
    if (wilt > 0.25) ctx.globalAlpha = 1 - wilt * 0.35;

    if (mature && !droop && (crop.rot || 0) < 0.4) { // soft glow so ready crops pop
      const g = ctx.createRadialGradient(0, -8, 2, 0, -8, 24);
      g.addColorStop(0, 'rgba(255,245,190,.35)');
      g.addColorStop(1, 'rgba(255,245,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -8, 24, 0, Math.PI * 2); ctx.fill();
    }

    if (s < 0.22) { // sprout
      ctx.strokeStyle = '#6d9440';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = '#7ba24c';
      ctx.beginPath(); ctx.ellipse(-4, -1, 5, 3, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, -1, 5, 3, 0.6, 0, Math.PI * 2); ctx.fill();
    } else {
      const k = 0.5 + 0.6 * Math.min(1, s / 0.95);
      ctx.scale(k, k);
      drawTemplate(def, s, mature);
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

    // thirsty indicator
    if (!mature && crop.water <= 0.35 && Math.sin(time * 5) > -0.2) {
      const dx = cx + 15, dy = cy - 22;
      ctx.fillStyle = wilt > 0.4 ? '#d3542f' : '#3d8fc4';
      ctx.beginPath();
      ctx.moveTo(dx, dy - 6);
      ctx.quadraticCurveTo(dx + 6, dy + 2, dx, dy + 6);
      ctx.quadraticCurveTo(dx - 6, dy + 2, dx, dy - 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.arc(dx - 1.5, dy, 1.5, 0, Math.PI * 2); ctx.fill();
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
          ctx.fillStyle = 'rgba(255,255,255,.2)';
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
        ctx.strokeStyle = mature && !def.tall ? '#b3922e' : leaf;
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
        ctx.strokeStyle = '#7a5836';
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

  // ---------------- buildings (true iso boxes) ----------------
  function isoBox(x0, y0, x1, y1, hgt, wall, topCol) {
    const N = proj(x0, y0), E = proj(x1, y0), S = proj(x1, y1), W = proj(x0, y1);
    // SW-facing wall (lit)
    ctx.fillStyle = shade(wall, 0.96);
    poly([W, S, up(S, hgt), up(W, hgt)]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,10,.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // SE-facing wall (shaded)
    ctx.fillStyle = shade(wall, 0.74);
    poly([S, E, up(E, hgt), up(S, hgt)]);
    ctx.fill();
    ctx.stroke();
    // top
    ctx.fillStyle = topCol || shade(wall, 1.12);
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
    ctx.fillStyle = shade(color, 1.05);
    poly([bN, bE, apex]); ctx.fill();
    poly([bW, bN, apex]); ctx.fill();
    // front faces
    ctx.fillStyle = shade(color, 0.92);
    poly([bW, bS, apex]); ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,10,.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = shade(color, 0.72);
    poly([bS, bE, apex]); ctx.fill();
    ctx.stroke();
  }

  function wallPoint(A, B, u, v) { // point along wall edge A->B at height v
    return { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u - v };
  }

  function drawBarnLike(state, b, def) {
    const inset = 0.12;
    const x0 = b.x + inset, y0 = b.y + inset, x1 = b.x + def.w - inset, y1 = b.y + def.h - inset;
    const baseH = 42, roofH = 26;
    const c = proj((x0 + x1) / 2, (y0 + y1) / 2);
    shadow(c.x + 4, c.y + 6, TW * 0.8, TH * 0.62);
    const f = isoBox(x0, y0, x1, y1, baseH, def.wall || '#b98a5c', shade(def.wall || '#b98a5c', 1.05));
    // door on the SW wall
    const dA = wallPoint(f.W, f.S, 0.38, 0), dB = wallPoint(f.W, f.S, 0.62, 0);
    ctx.fillStyle = 'rgba(52,34,18,.9)';
    poly([dA, dB, up(dB, 26), up(dA, 26)]);
    ctx.fill();
    // window on the SE wall
    const wA = wallPoint(f.S, f.E, 0.35, 14), wB = wallPoint(f.S, f.E, 0.6, 14);
    ctx.fillStyle = 'rgba(240,240,215,.75)';
    poly([wA, wB, up(wB, 14), up(wA, 14)]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,20,10,.4)';
    ctx.stroke();
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
    // glass walls
    const N = proj(x0, y0), E = proj(x1, y0), S = proj(x1, y1), W = proj(x0, y1);
    ctx.fillStyle = 'rgba(168, 210, 225, .55)';
    poly([W, S, up(S, baseH), up(W, baseH)]); ctx.fill();
    ctx.fillStyle = 'rgba(140, 185, 205, .6)';
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
  }

  function drawWell(state, b) {
    const c = proj(b.x + 0.5, b.y + 0.5);
    shadow(c.x, c.y + 4, 24, 11);
    // stone ring
    ctx.fillStyle = '#8a8f94';
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 4, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#75797e';
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 8, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3c6e8f';
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 8, 14, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.ellipse(c.x - 4, c.y - 10, 4, 2, -0.4, 0, Math.PI * 2); ctx.fill();
    // posts + little roof
    ctx.fillStyle = '#6b4c2c';
    ctx.fillRect(c.x - 14, c.y - 34, 4, 28);
    ctx.fillRect(c.x + 10, c.y - 34, 4, 28);
    ctx.fillStyle = '#8a4a30';
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
    ctx.fillStyle = '#83603a';
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
    ctx.strokeStyle = '#6b4c2c';
    ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(c.x, c.y + 2); ctx.lineTo(c.x, c.y - 26); ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(c.x - 13, c.y - 18); ctx.lineTo(c.x + 13, c.y - 18); ctx.stroke();
    ctx.fillStyle = '#a86a3d';
    rr(c.x - 7, c.y - 22, 14, 13, 4);
    ctx.fill();
    ctx.fillStyle = '#dec28a';
    ctx.beginPath(); ctx.arc(c.x, c.y - 29, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d2a14';
    ctx.beginPath(); ctx.arc(c.x - 2.5, c.y - 30, 1.1, 0, Math.PI * 2); ctx.arc(c.x + 2.5, c.y - 30, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a672c';
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
    ctx.fillStyle = Game.state && Game.state.fuel >= 1 ? '#3d8fc4' : '#c0392b';
    ctx.beginPath(); ctx.arc(c.x, hy + 1, 3, 0, Math.PI * 2); ctx.fill();
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
    ctx.fillStyle = '#5f452c';
    ctx.fillRect(cx - 3 * s, cy - 20 * s, 6 * s, 21 * s);
    ctx.fillStyle = pal.tree;
    ctx.beginPath(); ctx.arc(cx + sway, cy - 30 * s, 15 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 9 * s + sway, cy - 22 * s, 10 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 9 * s + sway, cy - 22 * s, 10 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.treeLight;
    ctx.beginPath(); ctx.arc(cx - 5 * s + sway, cy - 33 * s, 8 * s, 0, Math.PI * 2); ctx.fill();
    if (season === 3) {
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.arc(cx + sway, cy - 38 * s, 9 * s, 0, Math.PI); ctx.fill();
    }
  }

  function drawDecorTile(state, x, y, pal) {
    const h = hash(x, y);
    const c = proj(x + 0.5, y + 0.5);
    if (h < 0.38) drawTree(c.x, c.y, pal, h, state.season);
    else if (h < 0.48) { // bush
      shadow(c.x, c.y + 2, 12, 5);
      ctx.fillStyle = pal.tree;
      ctx.beginPath(); ctx.arc(c.x - 6, c.y - 4, 8, 0, Math.PI * 2); ctx.arc(c.x + 6, c.y - 4, 8, 0, Math.PI * 2); ctx.arc(c.x, c.y - 9, 9, 0, Math.PI * 2); ctx.fill();
    } else if (h < 0.55) { // rock
      shadow(c.x, c.y + 2, 11, 4);
      ctx.fillStyle = '#98938b';
      ctx.beginPath(); ctx.arc(c.x, c.y - 5, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#b3aca2';
      ctx.beginPath(); ctx.arc(c.x - 3, c.y - 8, 4.5, 0, Math.PI * 2); ctx.fill();
    } else if (h < 0.62 && state.season !== 3) { // wildflowers
      const colors = ['#c46a8a', '#d9b23c', '#9a6ab0', '#cc7a4e'];
      ctx.fillStyle = colors[Math.floor(h * 100) % 4];
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

  // wandering animals near their homes — returns drawable entities
  function animalEntities(state) {
    const out = [];
    const seen = new Set();
    state.animals.forEach((a, i) => {
      const home = state.buildings[a.home];
      if (!home) return;
      seen.add(a.uid);
      const def = D.BUILDINGS[home.type];
      let anim = animalAnim.get(a.uid);
      if (!anim) {
        anim = { x: home.x + def.w / 2, y: home.y + def.h + 0.4, tx: 0, ty: 0, timer: 0 };
        anim.tx = anim.x; anim.ty = anim.y;
        animalAnim.set(a.uid, anim);
      }
      anim.timer -= 1 / 60;
      if (anim.timer <= 0) {
        anim.timer = 2 + Math.random() * 3;
        anim.tx = home.x + Math.random() * def.w + (Math.random() - 0.5) * 1.2;
        anim.ty = home.y + def.h + 0.1 + Math.random() * 0.9;
      }
      anim.x += (anim.tx - anim.x) * 0.02;
      anim.y += (anim.ty - anim.y) * 0.02;
      const p = proj(anim.x, anim.y);
      const flip = anim.tx < anim.x;
      out.push({
        d: anim.x + anim.y,
        fn: () => {
          drawAnimalSprite(a.type, p.x, p.y, a.sick ? 0 : time, a.uid, flip);
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
        },
      });
    });
    for (const k of animalAnim.keys()) if (!seen.has(k) && k !== 99) animalAnim.delete(k);
    return out;
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
      ctx.fillStyle = 'rgba(170, 105, 40, .75)';
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

  // ---------------- weather & sky (screen space) ----------------
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
      ctx.fillStyle = 'rgba(230, 140, 50, .08)';
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
      ctx.fillStyle = `rgba(235, 120, 45, ${dusk * 0.13})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (dark > 0) {
      ctx.fillStyle = `rgba(10, 16, 42, ${dark * 0.45})`;
      ctx.fillRect(0, 0, vw, vh);
      if (dark > 0.5) {
        ctx.fillStyle = `rgba(255,255,255,${(dark - 0.5) * 1.1})`;
        for (let i = 0; i < 24; i++) {
          const sx = (i * 193.7) % vw, sy = (i * 97.3) % (vh * 0.5);
          if (Math.sin(time * 2 + i) > 0) { ctx.beginPath(); ctx.arc(sx, sy, 1.1, 0, Math.PI * 2); ctx.fill(); }
        }
      }
    }
  }

  // subtle vignette + warmth — makes the scene feel graded, less flat
  function drawGrade() {
    const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.35, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(22, 26, 14, 0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
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
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.age += dt;
      if (f.age > 1.3) { floats.splice(i, 1); continue; }
      const a = Math.min(1, (1.3 - f.age) / 0.4);
      ctx.globalAlpha = a;
      ctx.font = '900 16px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(40,25,5,.8)';
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, f.x, f.y - 20 - f.age * 32);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - 20 - f.age * 32);
      ctx.globalAlpha = 1;
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

  // ---------------- main render ----------------
  function render(state, dt) {
    if (!state) return;
    time += dt;
    clampCam();

    const pal = PALETTES[state.season];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = shade(pal.edge, 0.82);
    ctx.fillRect(0, 0, vw, vh);

    // world transform (iso px)
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (vw / 2 - cam.x * cam.z), dpr * (vh / 2 - cam.y * cam.z));

    // ground pass (flat): tiles in scan order
    for (let y = 0; y < D.WORLD_H; y++)
      for (let x = 0; x < D.WORLD_W; x++)
        drawGroundTile(state, x, y, pal);

    drawPond(state);
    drawParcels(state);

    // entity pass: depth-sorted by (x + y)
    const ents = [];
    for (let y = 0; y < D.WORLD_H; y++)
      for (let x = 0; x < D.WORLD_W; x++) {
        const tile = state.tiles[y][x];
        if (tile.crop) {
          const cx = x, cy = y;
          ents.push({ d: x + y + 0.55, fn: () => drawCrop(cx, cy, tile.crop) });
        } else if (!tile.obj && Game.parcelAt(x, y) < 0 && !(x <= 2 && y >= 6 && y <= 9)) {
          const cx = x, cy = y;
          if (hash(x, y) < 0.62) ents.push({ d: x + y + 0.5, fn: () => drawDecorTile(state, cx, cy, pal) });
        }
      }

    state.buildings.forEach((b, i) => {
      if (!b) return;
      const def = D.BUILDINGS[b.type];
      ents.push({ d: b.x + def.w - 1 + b.y + def.h - 1 + 0.62, fn: () => drawBuilding(state, b, i) });
    });

    for (let i = 0; i < D.PARCELS.length; i++) {
      if (!state.unlockedParcels.includes(i)) {
        const p = D.PARCELS[i];
        ents.push({ d: p.x + p.w / 2 + p.y + p.h / 2, fn: () => drawSign(state, i) });
      }
    }

    ents.push(...animalEntities(state));
    ents.sort((a, b) => a.d - b.d);
    for (const e of ents) e.fn();

    drawAmbient(state);
    drawGhost(state);
    drawFx(dt);

    // screen-space overlays
    drawWeather(state);
    drawDayNight(state);
    drawGrade();
  }

  return {
    init, render, cam, clampCam, centerOn, screenToTile, tileToScreen,
    addFloat, addBurst, setGhost, getGhost: () => ghost,
    get vw() { return vw; }, get vh() { return vh; },
  };
})();
