/* ============ Harvest Empire — core game state & simulation ============ */
'use strict';

const Game = (() => {
  const D = DATA;
  const SAVE_KEY = 'harvest-empire-save-v3';

  let state = null;
  let animalUid = 1;
  const listeners = {};

  // ---------------- events ----------------
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
  function emit(type, ...args) {
    if (state && state._offline && type !== 'levelup') return; // quiet during fast-forward
    (listeners[type] || []).forEach(fn => fn(...args));
  }
  function toast(msg, kind) { emit('toast', msg, kind); }
  // fx coordinates are in TILE units — the renderer projects them
  function fx(kind, x, y, text, color) { emit('fx', { kind, x, y, text, color }); }

  // ---------------- helpers ----------------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = Math.random;
  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  function diff() { return D.DIFFICULTIES.find(d => d.id === state.diff) || D.DIFFICULTIES[1]; }

  function rollWeather(season) {
    const table = D.WEATHER_TABLE[season];
    let total = 0;
    for (const [, w] of table) total += w;
    let r = rnd() * total;
    for (const [id, w] of table) { r -= w; if (r <= 0) return id; }
    return table[0][0];
  }

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= D.WORLD_W || y >= D.WORLD_H) return null;
    return state.tiles[y][x];
  }

  function parcelAt(x, y) {
    for (let i = 0; i < D.PARCELS.length; i++) {
      const p = D.PARCELS[i];
      if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return i;
    }
    return -1;
  }

  function isUnlocked(x, y) {
    const p = parcelAt(x, y);
    return p >= 0 && state.unlockedParcels.includes(p);
  }

  function liveBuildings() { return state.buildings.filter(Boolean); }
  function hasBuilding(type) { return state.buildings.some(b => b && b.type === type); }

  function isProtected(x, y) { // scarecrow guards a 5x5 area against crows & storms
    return state.buildings.some(b => b && b.type === 'scarecrow' && Math.abs(b.x - x) <= 2 && Math.abs(b.y - y) <= 2);
  }

  function seasonOK(cropId) {
    return D.CROPS[cropId].seasons.includes(state.season) || hasBuilding('greenhouse');
  }

  // ---------------- new game ----------------
  function newGame() {
    const tiles = [];
    for (let y = 0; y < D.WORLD_H; y++) {
      const row = [];
      for (let x = 0; x < D.WORLD_W; x++) row.push({ k: 'grass', crop: null, obj: null });
      tiles.push(row);
    }

    state = {
      v: 3,
      farmName: 'My Farm',
      diff: 'classic',
      setupDone: false,
      coins: 3000,             // dollars
      fuel: 0,                 // gallons
      xp: 0,
      level: 1,
      now: 0,                  // total gameplay seconds
      day: 1, t: 0.25,         // morning of day 1
      season: 0, year: 1,
      weather: 'sun',
      forecast: 'rain',
      can: { tier: 0, water: D.CAN_TIERS[0].cap },
      till: { tier: 0 },
      tiles,
      buildings: [],
      animals: [],
      inventory: {},
      market: { mults: {}, hot: 'turnip', fuelPrice: D.FUEL.startPrice },
      orders: [],
      orderTimer: 20,
      unlockedParcels: [0],
      goalIndex: 0,
      stats: { tilled: 0, planted: 0, watered: 0, harvested: 0, sold: 0, collected: 0, orders: 0, crafted: 0, fertilized: 0, earned: 0, lost: 0 },
      settings: { sound: true },
      lastSaved: Date.now(),
      _flags: { deaths: { dry: 0, rot: 0, season: 0 } },
    };

    for (const id of Object.keys(D.ITEMS)) state.market.mults[id] = 0.9 + rnd() * 0.3;

    // starter farm: a well and four tilled plots
    placeBuildingRaw('well', 7, 5);
    for (const [x, y] of [[9, 7], [10, 7], [9, 8], [10, 8]]) state.tiles[y][x].k = 'soil';

    return state;
  }

  // called from the setup screen: farm name + starting capital / difficulty
  function applySetup(name, diffId) {
    state.farmName = (name || 'My Farm').slice(0, 24);
    state.diff = diffId;
    state.coins = (D.DIFFICULTIES.find(d => d.id === diffId) || D.DIFFICULTIES[1]).coins;
    state.setupDone = true;
    state.orders.push(makeOrder(), makeOrder());
    save();
  }

  function placeBuildingRaw(type, x, y) {
    const def = D.BUILDINGS[type];
    const b = { type, x, y };
    if (def.capacity) b.capacity = def.capacity;
    if (['bakery', 'creamery', 'press', 'loom'].includes(type)) b.queue = [];
    // reuse tombstone slots so indexes stay stable
    let idx = state.buildings.indexOf(null);
    if (idx === -1) { state.buildings.push(b); idx = state.buildings.length - 1; }
    else state.buildings[idx] = b;
    for (let dy = 0; dy < def.h; dy++)
      for (let dx = 0; dx < def.w; dx++)
        state.tiles[y + dy][x + dx].obj = { t: 'b', i: idx };
    return idx;
  }

  // ---------------- save / load & data safety ----------------
  // Layered protection: main save + 3 rotating timestamped backups,
  // checksum-verified export/import codes, and corruption recovery on load.
  const BACKUP_KEYS = ['harvest-empire-backup-1', 'harvest-empire-backup-2', 'harvest-empire-backup-3'];
  let lastBackupAt = 0;
  let backupSlot = 0;

  function fnv(str) { // small checksum for save codes
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  function validSave(st) {
    return st && st.v === 3 && Array.isArray(st.tiles) && st.tiles.length === D.WORLD_H
      && Number.isFinite(st.coins) && st.setupDone;
  }

  function save() {
    if (!state) return;
    state.lastSaved = Date.now();
    const json = JSON.stringify(state);
    try { localStorage.setItem(SAVE_KEY, json); } catch (e) { /* storage full/blocked */ }
    // rotate a backup snapshot every ~2 minutes of play
    if (Date.now() - lastBackupAt > 120000 && state.setupDone) {
      lastBackupAt = Date.now();
      try {
        localStorage.setItem(BACKUP_KEYS[backupSlot % BACKUP_KEYS.length], JSON.stringify({ at: Date.now(), data: json }));
        backupSlot++;
      } catch (e) {}
    }
  }

  function tryParse(json) {
    try {
      const st = JSON.parse(json);
      return validSave(st) ? st : null;
    } catch (e) { return null; }
  }

  function newestBackup() {
    let best = null;
    for (const key of BACKUP_KEYS) {
      try {
        const wrap = JSON.parse(localStorage.getItem(key));
        if (wrap && wrap.data && (!best || wrap.at > best.at)) {
          const st = tryParse(wrap.data);
          if (st) best = { at: wrap.at, st };
        }
      } catch (e) {}
    }
    return best;
  }

  function adoptState(st) {
    state = st;
    state._flags = state._flags || {};
    state._flags.deaths = state._flags.deaths || { dry: 0, rot: 0, season: 0 };
    for (const a of state.animals) if (!a.uid) a.uid = animalUid++;
    animalUid = Math.max(animalUid, ...state.animals.map(a => a.uid + 1), 1);
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    let st = raw ? tryParse(raw) : null;
    let recovered = false;
    if (!st) { // main save missing or corrupt — try the backup snapshots
      const backup = newestBackup();
      if (backup) { st = backup.st; recovered = true; }
    }
    if (!st) { newGame(); return { fresh: true }; }
    adoptState(st);
    if (recovered) save();
    const elapsed = Math.min((Date.now() - (state.lastSaved || Date.now())) / 1000, 4 * 3600);
    let away = null;
    if (elapsed > 45) away = fastForward(elapsed);
    return { fresh: false, away, recovered };
  }

  // portable save code: HE1.<base64 json>.<checksum>
  function exportCode() {
    if (!state) return null;
    save();
    const json = JSON.stringify(state);
    return 'HE1.' + btoa(unescape(encodeURIComponent(json))) + '.' + fnv(json);
  }

  function importCode(code) {
    try {
      const parts = (code || '').trim().split('.');
      if (parts.length !== 3 || parts[0] !== 'HE1') return { ok: false, why: 'That doesn\'t look like a farm code.' };
      const json = decodeURIComponent(escape(atob(parts[1])));
      if (fnv(json) !== parts[2]) return { ok: false, why: 'The code is damaged (checksum mismatch).' };
      const st = tryParse(json);
      if (!st) return { ok: false, why: 'The code holds an incompatible save.' };
      adoptState(st);
      save();
      return { ok: true };
    } catch (e) {
      return { ok: false, why: 'Could not read that code.' };
    }
  }

  function resetGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    newGame();
  }

  // simulate time that passed while the game was closed
  // (kinder than live play: decay runs at half speed, no disasters)
  function fastForward(elapsed) {
    state._offline = true;
    const before = readyCounts();
    const lostBefore = state.stats.lost;
    let remaining = elapsed;
    while (remaining > 0) {
      const step = Math.min(2, remaining);
      tick(step);
      remaining -= step;
    }
    state._offline = false;
    const after = readyCounts();
    return {
      seconds: elapsed,
      crops: Math.max(0, after.crops - before.crops),
      produce: Math.max(0, after.produce - before.produce),
      lost: state.stats.lost - lostBefore,
    };
  }

  function readyCounts() {
    let crops = 0, produce = 0;
    for (const row of state.tiles) for (const t of row) if (t.crop && !t.crop.dead && t.crop.prog >= 1) crops++;
    for (const a of state.animals) if (a.prodProg >= 1) produce++;
    return { crops, produce };
  }

  // ---------------- reputation ----------------
  function addXp(n) {
    state.xp += n;
    while (state.xp >= D.xpForLevel(state.level)) {
      state.xp -= D.xpForLevel(state.level);
      state.level++;
      emit('levelup', state.level);
    }
  }

  // ---------------- market & orders ----------------
  function sellPrice(item) {
    const base = D.ITEMS[item].base;
    let m = state.market.mults[item] || 1;
    if (state.market.hot === item) m *= 1.5;
    m *= (1 + D.repBonus(state.level)) * diff().sellBonus;
    return Math.max(1, Math.round(base * m));
  }

  function fuelPrice() { return state.market.fuelPrice; }

  function buyFuel(gal) {
    const cost = Math.ceil(gal * state.market.fuelPrice);
    if (state.coins < cost) { toast('Not enough cash for fuel!', 'bad'); return false; }
    state.coins -= cost;
    state.fuel = Math.round((state.fuel + gal) * 100) / 100;
    emit('sound', 'water');
    toast(`⛽ +${gal} gal of fuel (${D.$(cost)})`, 'good');
    return true;
  }

  // items an order may reasonably ask for: crops in season, products of owned
  // animals, and recipes of owned buildings
  function availableItems() {
    const out = [];
    for (const id of Object.keys(D.CROPS)) if (seasonOK(id)) out.push(id);
    for (const a of state.animals) if (!out.includes(D.ANIMALS[a.type].product)) out.push(D.ANIMALS[a.type].product);
    for (const [, r] of Object.entries(D.RECIPES)) if (hasBuilding(r.building) && !out.includes(r.out)) out.push(r.out);
    return out.length ? out : ['turnip', 'wheat'];
  }

  function makeOrder() {
    const pool = availableItems();
    const wealth = 1 + Math.min(6, state.stats.earned / 4000); // orders grow with your empire
    const n = 1 + Math.floor(rnd() * Math.min(3, 1 + wealth / 2));
    const reqs = {};
    let total = 0;
    for (let i = 0; i < n; i++) {
      const item = pick(pool);
      const qty = Math.max(2, Math.round((2 + rnd() * 3) * (0.7 + wealth * 0.25)));
      reqs[item] = (reqs[item] || 0) + qty;
    }
    for (const [item, qty] of Object.entries(reqs)) total += D.ITEMS[item].base * qty;
    return {
      id: 'o' + Math.floor(rnd() * 1e9),
      reqs,
      coins: Math.ceil(total * 1.6 / 5) * 5,
      xp: Math.max(5, Math.ceil(total / 8)),
    };
  }

  function canFulfill(order) {
    return Object.entries(order.reqs).every(([item, qty]) => (state.inventory[item] || 0) >= qty);
  }

  function fulfillOrder(orderId) {
    const i = state.orders.findIndex(o => o.id === orderId);
    if (i < 0) return false;
    const order = state.orders[i];
    if (!canFulfill(order)) { toast('Not enough goods yet!', 'bad'); return false; }
    for (const [item, qty] of Object.entries(order.reqs)) {
      state.inventory[item] -= qty;
      if (state.inventory[item] <= 0) delete state.inventory[item];
    }
    state.coins += order.coins;
    state.stats.earned += order.coins;
    addXp(order.xp);
    state.stats.orders++;
    state.orders.splice(i, 1);
    state.orderTimer = 30;
    toast(`Order complete! +${D.$(order.coins)}`, 'good');
    emit('sound', 'coin');
    checkGoal();
    return true;
  }

  function skipOrder(orderId) {
    const i = state.orders.findIndex(o => o.id === orderId);
    if (i < 0) return;
    state.orders.splice(i, 1);
    state.orderTimer = Math.min(state.orderTimer, 25);
  }

  function sellItem(item, qty) {
    const have = state.inventory[item] || 0;
    qty = Math.min(qty, have);
    if (qty <= 0) return 0;
    const gain = sellPrice(item) * qty;
    state.inventory[item] -= qty;
    if (state.inventory[item] <= 0) delete state.inventory[item];
    state.coins += gain;
    state.stats.earned += gain;
    state.stats.sold += qty;
    addXp(Math.ceil(qty / 2));
    emit('sound', 'coin');
    checkGoal();
    return gain;
  }

  // ---------------- farming actions ----------------
  function till(x, y) {
    const t = tileAt(x, y);
    if (!t || !isUnlocked(x, y) || t.k !== 'grass' || t.obj) return false;
    t.k = 'soil';
    state.stats.tilled++;
    fx('burst', x + .5, y + .5, null, '#7d5c3c');
    checkGoal();
    return true;
  }

  function plant(x, y, cropId) {
    const t = tileAt(x, y);
    const def = D.CROPS[cropId];
    if (!t || !def || t.k !== 'soil' || t.crop || t.obj) return false;
    if (state.coins < def.seed) { toast('Not enough cash for seeds! (Tip: work odd jobs from the ⚙️ Menu)', 'bad'); return false; }
    // planting out of season is allowed — but the crop will wither and die.
    if (!seasonOK(cropId) && state.now >= (state._flags.offWarnUntil || 0) && !state._offline) {
      state._flags.offWarnUntil = state.now + 12; // don't spam while drag-planting
      toast(`⚠️ ${D.ITEMS[cropId].name} is out of season — it will wither and the seed money is gone!`, 'bad');
    }
    state.coins -= def.seed;
    t.crop = { id: cropId, prog: 0, water: 0, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    if (state.weather === 'rain' || state.weather === 'storm') t.crop.water = 1;
    state.stats.planted++;
    checkGoal();
    return true;
  }

  function water(x, y) {
    const t = tileAt(x, y);
    if (!t || !t.crop || t.crop.dead || t.crop.water > 0.55) return false;
    if (state.can.water <= 0) return 'empty';
    state.can.water--;
    t.crop.water = 1;
    state.stats.watered++;
    fx('burst', x + .5, y + .35, null, '#4a90b8');
    checkGoal();
    return true;
  }

  function fertilize(x, y) {
    const t = tileAt(x, y);
    if (!t || !t.crop || t.crop.dead || t.crop.fert || t.crop.prog >= 1) return false;
    if (state.coins < D.FERT_COST) return 'broke';
    state.coins -= D.FERT_COST;
    t.crop.fert = true;
    state.stats.fertilized++;
    fx('burst', x + .5, y + .4, null, '#d9b23c');
    checkGoal();
    return true;
  }

  function harvestYield(crop) {
    // fertilizer and luck can double the harvest
    const doubleChance = crop.fert ? 0.45 : 0.08;
    return rnd() < doubleChance ? 2 : 1;
  }

  function harvest(x, y, silent) {
    const t = tileAt(x, y);
    if (!t || !t.crop || t.crop.dead || t.crop.prog < 1) return 0;
    const id = t.crop.id;
    const def = D.CROPS[id];
    const n = harvestYield(t.crop);
    state.inventory[id] = (state.inventory[id] || 0) + n;
    addXp(def.xp);
    state.stats.harvested++;

    if (def.regrow && seasonOK(id)) { // multi-harvest crops grow back
      t.crop.prog = 0;
      t.crop.rot = 0;
      t.crop.regrown = true;
      t.crop.fert = false;
    } else {
      t.crop = null;
    }

    if (!silent) {
      fx('float', x + .5, y, `+${n} ${D.ITEMS[id].emoji}`, n > 1 ? '#ffe082' : '#fff');
      fx('burst', x + .5, y + .4, null, def.color);
    }
    checkGoal();
    return n;
  }

  function clearDead(x, y) {
    const t = tileAt(x, y);
    if (!t || !t.crop || !t.crop.dead) return false;
    t.crop = null;
    fx('burst', x + .5, y + .4, null, '#8a8178');
    return true;
  }

  function refillCan() {
    const cap = D.CAN_TIERS[state.can.tier].cap;
    if (state.can.water >= cap) return false;
    state.can.water = cap;
    emit('sound', 'water');
    toast('Watering can refilled! 💧', 'good');
    return true;
  }

  // area for tilling / watering tiers: NxN block around tap point
  function areaCells(x, y, area) {
    const cells = [];
    const start = area === 3 ? -1 : 0;
    const end = area === 3 ? 1 : area - 1;
    for (let dy = start; dy <= end; dy++)
      for (let dx = start; dx <= end; dx++)
        cells.push([x + dx, y + dy]);
    return cells;
  }

  // apply an explicit tool. returns count of successes or a status string
  function applyTool(tool, x, y, seed) {
    let count = 0;
    if (tool === 'hoe') {
      const tier = D.TILL_TIERS[state.till.tier];
      let area = tier.area;
      let noFuel = false;
      if (tier.fuel > 0 && state.fuel < tier.fuel) { area = 1; noFuel = true; } // hand-till fallback
      for (const [cx, cy] of areaCells(x, y, area)) {
        if (tier.fuel > 0 && !noFuel && state.fuel < tier.fuel) break;
        if (till(cx, cy)) {
          count++;
          if (tier.fuel > 0 && !noFuel) state.fuel = Math.max(0, Math.round((state.fuel - tier.fuel) * 100) / 100);
        }
      }
      if (count) emit('sound', 'till');
      if (noFuel && count) return 'nofuel';
    } else if (tool === 'water') {
      let empty = false;
      for (const [cx, cy] of areaCells(x, y, D.CAN_TIERS[state.can.tier].area)) {
        const r = water(cx, cy);
        if (r === 'empty') { empty = true; break; }
        if (r === true) count++;
      }
      if (count) emit('sound', 'water');
      if (empty && !count) return 'empty';
    } else if (tool === 'fert') {
      const r = fertilize(x, y);
      if (r === 'broke') return 'broke';
      if (r === true) { count = 1; emit('sound', 'plant'); }
    } else if (tool === 'plant') {
      if (seed && plant(x, y, seed)) { count = 1; emit('sound', 'plant'); }
    } else if (tool === 'harvest') {
      if (harvest(x, y)) { count = 1; emit('sound', 'harvest'); }
      else if (clearDead(x, y)) count = 1;
    }
    return count;
  }

  // smart tap: decide the natural action for this tile
  function smartAction(x, y) {
    const t = tileAt(x, y);
    if (!t) return { act: 'none' };

    if (t.obj && t.obj.t === 'b') {
      const b = state.buildings[t.obj.i];
      if (b && b.type === 'well') { refillCan(); return { act: 'well' }; }
      return { act: 'building', index: t.obj.i };
    }

    if (!isUnlocked(x, y)) {
      const p = parcelAt(x, y);
      if (p >= 0) return { act: 'parcel', index: p };
      return { act: 'none' };
    }

    if (t.crop) {
      if (t.crop.dead) { clearDead(x, y); emit('sound', 'till'); return { act: 'clear' }; }
      if (t.crop.prog >= 1) { applyTool('harvest', x, y); return { act: 'harvest' }; }
      if (t.crop.water <= 0.55) {
        const r = applyTool('water', x, y);
        if (r === 'empty') { toast('Watering can is empty — tap the Well! 💧', 'bad'); return { act: 'empty-can' }; }
        return { act: 'water' };
      }
      return { act: 'growing' };
    }

    if (t.k === 'soil') return { act: 'seedsheet', x, y };
    if (t.k === 'grass') {
      const r = applyTool('hoe', x, y);
      if (r === 'nofuel') toast('⛽ Out of fuel — hand-tilling one plot. Buy fuel in the Shop!', 'bad');
      return { act: 'till' };
    }
    return { act: 'none' };
  }

  // ---------------- buildings & land ----------------
  function canPlaceBuilding(type, x, y) {
    const def = D.BUILDINGS[type];
    for (let dy = 0; dy < def.h; dy++)
      for (let dx = 0; dx < def.w; dx++) {
        const t = tileAt(x + dx, y + dy);
        if (!t || !isUnlocked(x + dx, y + dy) || t.k !== 'grass' || t.obj || t.crop) return false;
      }
    return true;
  }

  function placeBuilding(type, x, y) {
    const def = D.BUILDINGS[type];
    if (!canPlaceBuilding(type, x, y)) return false;
    if (state.coins < def.cost) { toast('Not enough cash!', 'bad'); return false; }
    state.coins -= def.cost;
    const idx = placeBuildingRaw(type, x, y);
    emit('sound', 'build');
    toast(`${def.emoji} ${def.name} built!`, 'good');
    if (type === 'sprinkler') sprinkle(state.buildings[idx]);
    checkGoal();
    return true;
  }

  // sell a building back at 50% — a lifeline when cash runs dry
  function sellBuilding(index) {
    const b = state.buildings[index];
    if (!b) return false;
    const def = D.BUILDINGS[b.type];
    if (def.capacity && animalsIn(index).length > 0) {
      toast('Sell or move the animals first!', 'bad');
      return false;
    }
    const refund = Math.floor(def.cost / 2);
    for (let dy = 0; dy < def.h; dy++)
      for (let dx = 0; dx < def.w; dx++) {
        const t = tileAt(b.x + dx, b.y + dy);
        if (t && t.obj && t.obj.t === 'b' && t.obj.i === index) t.obj = null;
      }
    state.buildings[index] = null; // tombstone keeps other indexes stable
    state.coins += refund;
    emit('sound', 'coin');
    toast(`Sold the ${def.name} for ${D.$(refund)}`, 'good');
    return true;
  }

  function buyParcel(index) {
    const p = D.PARCELS[index];
    if (!p || state.unlockedParcels.includes(index)) return false;
    if (state.coins < p.cost) { toast('Not enough cash!', 'bad'); return false; }
    state.coins -= p.cost;
    state.unlockedParcels.push(index);
    emit('sound', 'build');
    toast('🚧 New land unlocked — your empire grows!', 'good');
    addXp(30);
    checkGoal();
    return true;
  }

  function sprinkle(b) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const t = tileAt(b.x + dx, b.y + dy);
        if (t && t.crop && !t.crop.dead) t.crop.water = 1;
      }
  }

  // drones auto-harvest and replant a 5x5 area each dawn — if they have fuel
  function runDrones() {
    let harvested = 0, replanted = 0, grounded = false;
    for (const b of state.buildings) {
      if (!b || b.type !== 'drone') continue;
      if (state.fuel < D.FUEL.dronePerDay) { grounded = true; continue; }
      let worked = false;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = b.x + dx, y = b.y + dy;
          const t = tileAt(x, y);
          if (!t || !t.crop || t.crop.dead || t.crop.prog < 1) continue;
          const id = t.crop.id;
          harvested += harvest(x, y, true);
          worked = true;
          if (!tileAt(x, y).crop && state.coins >= D.CROPS[id].seed && seasonOK(id)) {
            if (plant(x, y, id)) replanted++;
          }
        }
      if (worked) state.fuel = Math.max(0, Math.round((state.fuel - D.FUEL.dronePerDay) * 100) / 100);
    }
    if (harvested) toast(`🤖 Drones harvested ${harvested} crop${harvested > 1 ? 's' : ''}${replanted ? ` and replanted ${replanted}` : ''}!`, 'good');
    if (grounded) toast('🤖 A drone is grounded — no fuel! Buy some in the Shop.', 'bad');
  }

  // ---------------- animals ----------------
  function buildingsOf(homeType) {
    return state.buildings.map((b, i) => ({ b, i })).filter(e => e.b && e.b.type === homeType);
  }

  function animalsIn(bIdx) { return state.animals.filter(a => a.home === bIdx); }

  function buyAnimal(type, bIdx) {
    const def = D.ANIMALS[type];
    const b = state.buildings[bIdx];
    if (!def || !b || b.type !== def.home) return false;
    if (animalsIn(bIdx).length >= b.capacity) { toast('This building is full!', 'bad'); return false; }
    if (state.coins < def.cost) { toast('Not enough cash!', 'bad'); return false; }
    state.coins -= def.cost;
    state.animals.push({
      uid: animalUid++,
      type, home: bIdx,
      name: pick(D.ANIMAL_NAMES),
      fedUntil: state.now + D.DAY_LEN * 1.2,
      happiness: 60,
      sick: false,
      prodProg: 0,
    });
    emit('sound', 'plant');
    toast(`${def.emoji} Welcome, ${state.animals[state.animals.length - 1].name}!`, 'good');
    checkGoal();
    return true;
  }

  // sell an animal back at 60% of its price
  function sellAnimal(index) {
    const a = state.animals[index];
    if (!a) return false;
    const refund = Math.floor(D.ANIMALS[a.type].cost * 0.6 * (a.sick ? 0.5 : 1));
    state.animals.splice(index, 1);
    state.coins += refund;
    emit('sound', 'coin');
    toast(`${a.name} sold for ${D.$(refund)}`, 'good');
    return true;
  }

  // a sick animal stops producing until you pay the vet
  function vetAnimal(index) {
    const a = state.animals[index];
    if (!a || !a.sick) return false;
    const cost = Math.ceil(D.ANIMALS[a.type].cost * D.VET_RATE);
    if (state.coins < cost) { toast('Not enough cash for the vet!', 'bad'); return false; }
    state.coins -= cost;
    a.sick = false;
    a.happiness = 50;
    emit('sound', 'goal');
    toast(`🩺 ${a.name} is healthy again!`, 'good');
    return true;
  }

  // feeding uses grain (wheat/corn) if you own a Feed Mill, otherwise dollars
  function feedCostFor(animal) {
    const def = D.ANIMALS[animal.type];
    if (hasBuilding('mill')) {
      if ((state.inventory.wheat || 0) > 0) return { grain: 'wheat' };
      if ((state.inventory.corn || 0) > 0) return { grain: 'corn' };
    }
    return { coins: def.feedCost };
  }

  function feedAnimal(index) {
    const a = state.animals[index];
    if (!a || state.now < a.fedUntil - D.DAY_LEN * 0.2) return false; // already well fed
    const cost = feedCostFor(a);
    if (cost.grain) {
      state.inventory[cost.grain]--;
      if (state.inventory[cost.grain] <= 0) delete state.inventory[cost.grain];
    } else {
      if (state.coins < cost.coins) { toast('Not enough cash for feed!', 'bad'); return false; }
      state.coins -= cost.coins;
    }
    a.fedUntil = state.now + D.DAY_LEN * 1.2;
    if (!a.sick) a.happiness = clamp(a.happiness + 8, 0, 100);
    return true;
  }

  function feedAll(bIdx) {
    let n = 0;
    state.animals.forEach((a, i) => { if (a.home === bIdx && feedAnimal(i)) n++; });
    if (n) { emit('sound', 'plant'); toast(`Fed ${n} animal${n > 1 ? 's' : ''}! 🌾`, 'good'); }
    return n;
  }

  function collectBuilding(bIdx) {
    let n = 0, gainXp = 0;
    const b = state.buildings[bIdx];
    for (const a of state.animals) {
      if (a.home !== bIdx || a.prodProg < 1) continue;
      const def = D.ANIMALS[a.type];
      const bonus = a.happiness >= 85 && rnd() < 0.25 ? 2 : 1; // happy animals sometimes give double
      state.inventory[def.product] = (state.inventory[def.product] || 0) + bonus;
      a.prodProg = 0;
      n += bonus;
      gainXp += Math.ceil(D.ITEMS[def.product].base / 8);
      state.stats.collected++;
    }
    if (n && b) {
      addXp(gainXp);
      emit('sound', 'harvest');
      fx('float', b.x + 1, b.y, `+${n} 📦`, '#fff');
      checkGoal();
    }
    return n;
  }

  function readyIn(bIdx) { return animalsIn(bIdx).filter(a => a.prodProg >= 1).length; }

  // ---------------- processing (bakery / creamery / press / loom) ----------------
  function canCraft(recipeId) {
    const r = D.RECIPES[recipeId];
    return Object.entries(r.in).every(([item, qty]) => (state.inventory[item] || 0) >= qty);
  }

  function startRecipe(bIdx, recipeId) {
    const b = state.buildings[bIdx];
    const r = D.RECIPES[recipeId];
    if (!b || !r || r.building !== b.type) return false;
    if (b.queue.length >= 3) { toast('The queue is full!', 'bad'); return false; }
    if (!canCraft(recipeId)) { toast('Missing ingredients!', 'bad'); return false; }
    for (const [item, qty] of Object.entries(r.in)) {
      state.inventory[item] -= qty;
      if (state.inventory[item] <= 0) delete state.inventory[item];
    }
    b.queue.push({ r: recipeId, done: state.now + r.time });
    emit('sound', 'plant');
    return true;
  }

  function collectRecipes(bIdx) {
    const b = state.buildings[bIdx];
    if (!b || !b.queue) return 0;
    let n = 0;
    b.queue = b.queue.filter(job => {
      if (state.now >= job.done) {
        const out = D.RECIPES[job.r].out;
        state.inventory[out] = (state.inventory[out] || 0) + 1;
        state.stats.crafted++;
        addXp(Math.ceil(D.ITEMS[out].base / 10));
        n++;
        return false;
      }
      return true;
    });
    if (n) {
      emit('sound', 'harvest');
      fx('float', b.x + 1, b.y, `+${n} 📦`, '#fff');
      checkGoal();
    }
    return n;
  }

  // odd jobs: a once-per-day income floor so a failed farm is never a dead end
  function oddJobsAvailable() {
    return state._flags.oddJobsDay !== `${state.year}-${state.season}-${state.day}`;
  }

  function workOddJobs() {
    if (!oddJobsAvailable()) { toast('You already worked today — come back tomorrow!', 'bad'); return false; }
    state._flags.oddJobsDay = `${state.year}-${state.season}-${state.day}`;
    state.coins += 40;
    emit('sound', 'coin');
    toast('💪 A hard day\'s work in town: +' + D.$(40), 'good');
    return true;
  }

  // ---------------- upgrades ----------------
  function buyCanTier() {
    const next = D.CAN_TIERS[state.can.tier + 1];
    if (!next) return false;
    if (state.coins < next.cost) { toast('Not enough cash!', 'bad'); return false; }
    state.coins -= next.cost;
    state.can.tier++;
    state.can.water = next.cap;
    emit('sound', 'build');
    toast(`💧 Upgraded to the ${next.name}!`, 'good');
    return true;
  }

  function buyTillTier() {
    const next = D.TILL_TIERS[state.till.tier + 1];
    if (!next) return false;
    if (state.coins < next.cost) { toast('Not enough cash!', 'bad'); return false; }
    state.coins -= next.cost;
    state.till.tier++;
    emit('sound', 'build');
    toast(`🚜 Upgraded to the ${next.name}! It burns ${next.fuel} gal per tile.`, 'good');
    return true;
  }

  // ---------------- goals ----------------
  function currentGoal() { return D.GOALS[state.goalIndex] || null; }

  function checkGoal() {
    const g = currentGoal();
    if (!g) return;
    const [cur, need] = g.check(state);
    if (cur >= need) {
      state.coins += g.reward;
      toast(`${g.icon} Goal complete: ${g.title}! +${D.$(g.reward)}`, 'good');
      emit('sound', 'goal');
      state.goalIndex++;
      emit('goal');
      checkGoal(); // next goal may already be satisfied
    }
  }

  // ---------------- daily events ----------------
  function newDay() {
    state.day++;
    if (state.day > D.SEASON_DAYS) {
      state.day = 1;
      state.season = (state.season + 1) % 4;
      if (state.season === 0) state.year++;
      toast(`${D.SEASONS[state.season].emoji} ${D.SEASONS[state.season].name} has arrived!`);
      emit('season');
    }
    state.weather = state.forecast;
    state.forecast = rollWeather(state.day === D.SEASON_DAYS ? (state.season + 1) % 4 : state.season);
    state._flags.crowDone = false;
    state._flags.frostDone = false;

    // sprinklers water every dawn, then drones harvest & replant
    for (const b of state.buildings) if (b && b.type === 'sprinkler') sprinkle(b);
    runDrones();

    // hungry animals lose happiness; at rock bottom they fall sick
    for (const a of state.animals) {
      if (state.now >= a.fedUntil) {
        a.happiness = clamp(a.happiness - 12, 0, 100);
        if (a.happiness <= 0 && !a.sick && !state._offline) {
          a.sick = true;
          toast(`🤒 ${a.name} the ${D.ANIMALS[a.type].name.toLowerCase()} is sick from neglect — call the vet!`, 'bad');
        }
      }
    }

    // market drift + hot item + fuel price
    for (const id of Object.keys(state.market.mults)) {
      state.market.mults[id] = clamp(state.market.mults[id] * (0.82 + rnd() * 0.36), 0.6, 1.6);
    }
    state.market.hot = pick(Object.keys(D.ITEMS));
    state.market.fuelPrice = Math.round(clamp(state.market.fuelPrice * (0.9 + rnd() * 0.2), D.FUEL.min, D.FUEL.max) * 10) / 10;

    // storms can flatten unprotected crops
    if (state.weather === 'storm' && !state._offline) {
      let smashed = 0;
      for (let y = 0; y < D.WORLD_H; y++) for (let x = 0; x < D.WORLD_W; x++) {
        const t = state.tiles[y][x];
        if (t.crop && !t.crop.dead && !isProtected(x, y) && rnd() < 0.12 * diff().eventMult) { t.crop.dead = true; smashed++; state.stats.lost++; }
      }
      if (smashed) toast(`⛈️ The storm destroyed ${smashed} crop${smashed > 1 ? 's' : ''}! Scarecrows protect nearby plots.`, 'bad');
    }
    if (state.weather === 'drought') toast('🔥 Heatwave! Crops dry out three times faster today.', 'bad');
    if (state.weather === 'rain') toast('🌧️ Rain today — no watering needed!');
  }

  function middayEvents() {
    // crows steal a mature crop on clear days if unprotected
    if ((state.weather === 'sun' || state.weather === 'cloud') && !state._offline && rnd() < 0.3 * diff().eventMult) {
      const targets = [];
      for (let y = 0; y < D.WORLD_H; y++) for (let x = 0; x < D.WORLD_W; x++) {
        const t = state.tiles[y][x];
        if (t.crop && !t.crop.dead && t.crop.prog >= 1 && !isProtected(x, y)) targets.push([x, y]);
      }
      if (targets.length) {
        const [x, y] = pick(targets);
        state.tiles[y][x].crop = null;
        state.stats.lost++;
        toast('🐦‍⬛ Crows ate a crop! Build a Scarecrow to protect your fields.', 'bad');
        fx('float', x + .5, y, '🐦‍⬛', '#333');
      }
    }
  }

  function nightfallEvents() {
    // winter frost kills non-winter crops unless you own a greenhouse
    if (state.season === 3 && !hasBuilding('greenhouse') && !state._offline && rnd() < 0.4 * diff().eventMult) {
      let frozen = 0;
      for (const row of state.tiles) for (const t of row) {
        if (t.crop && !t.crop.dead && !D.CROPS[t.crop.id].seasons.includes(3)) { t.crop.dead = true; frozen++; state.stats.lost++; }
      }
      if (frozen) toast(`❄️ Frost killed ${frozen} crop${frozen > 1 ? 's' : ''}! Only winter crops survive — or build a Greenhouse.`, 'bad');
    }
  }

  // batch crop-death notifications so a dying field doesn't spam toasts
  function flushDeaths() {
    const d = state._flags.deaths;
    const msgs = [];
    if (d.dry) msgs.push(`${d.dry} died of thirst 🥀`);
    if (d.rot) msgs.push(`${d.rot} rotted in the field 🪰`);
    if (d.season) msgs.push(`${d.season} withered out of season 🍂`);
    if (msgs.length) {
      toast(`Crop losses: ${msgs.join(' · ')}`, 'bad');
      d.dry = d.rot = d.season = 0;
    }
  }

  // ---------------- main tick ----------------
  function tick(dt) {
    if (!state || !state.setupDone) return;
    state.now += dt;

    // time of day
    const prevT = state.t;
    state.t += dt / D.DAY_LEN;
    if (prevT < 0.5 && state.t >= 0.5 && !state._flags.crowDone) { state._flags.crowDone = true; middayEvents(); }
    if (prevT < D.NIGHT_START && state.t >= D.NIGHT_START && !state._flags.frostDone) { state._flags.frostDone = true; nightfallEvents(); }
    if (state.t >= 1) { state.t -= 1; newDay(); }

    const raining = state.weather === 'rain' || state.weather === 'storm';
    const drain = state.weather === 'drought' ? 22 : (state.season === 3 ? 110 : 65); // seconds of moisture
    const decayMult = state._offline ? 0.5 : 1; // gentler while you're away
    const deaths = state._flags.deaths;

    // crops: growth, thirst, wilting, rot
    for (const row of state.tiles) for (const tile of row) {
      const c = tile.crop;
      if (!c || c.dead) continue;
      const off = !seasonOK(c.id);
      if (raining) c.water = 1;
      else c.water = Math.max(0, c.water - dt / drain);

      // wilting: dry crops and out-of-season crops decline; watered ones recover
      let wilting = false;
      if (off) { c.wilt = (c.wilt || 0) + (dt * decayMult) / (0.8 * D.DAY_LEN); wilting = true; }
      else if (c.water <= 0) { c.wilt = (c.wilt || 0) + (dt * decayMult) / (D.WILT_DAYS * D.DAY_LEN); wilting = true; }
      if (!wilting && c.wilt > 0) c.wilt = Math.max(0, c.wilt - dt / D.DAY_LEN);
      if (c.wilt >= 1) {
        c.dead = true;
        state.stats.lost++;
        deaths[off ? 'season' : 'dry']++;
        continue;
      }

      if (c.prog >= 1) {
        // ripe crops rot if you leave them standing
        c.rot = (c.rot || 0) + (dt * decayMult) / (D.ROT_DAYS * D.DAY_LEN);
        if (c.rot >= 1) { c.dead = true; state.stats.lost++; deaths.rot++; }
      } else if (c.water > 0 && !off) {
        const def = D.CROPS[c.id];
        const growTime = c.regrown && def.regrow ? def.regrow : def.grow;
        const speed = c.fert ? 1.25 : 1;
        c.prog = Math.min(1, c.prog + (dt * speed) / growTime);
      }
    }

    // surface aggregated crop deaths every few seconds
    state._flags.deathTimer = (state._flags.deathTimer || 0) + dt;
    if (state._flags.deathTimer > 5) {
      state._flags.deathTimer = 0;
      if (!state._offline) flushDeaths();
    }

    // animals produce while fed and healthy
    for (const a of state.animals) {
      if (!a.sick && state.now < a.fedUntil && a.prodProg < 1) {
        const speed = 0.75 + (a.happiness / 100) * 0.5; // 0.75x .. 1.25x
        a.prodProg = Math.min(1, a.prodProg + (dt * speed) / D.ANIMALS[a.type].prodTime);
      }
    }

    // order refill
    if (state.orders.length < 4) {
      state.orderTimer -= dt;
      if (state.orderTimer <= 0) {
        state.orders.push(makeOrder());
        state.orderTimer = 45;
        emit('orders');
      }
    }
  }

  // ---------------- derived info for UI ----------------
  function farmValue() {
    if (!state) return 0;
    let v = state.coins;
    for (const [item, qty] of Object.entries(state.inventory)) v += D.ITEMS[item].base * qty;
    for (const b of state.buildings) if (b) v += D.BUILDINGS[b.type].cost;
    for (const a of state.animals) v += D.ANIMALS[a.type].cost;
    for (const i of state.unlockedParcels) v += D.PARCELS[i].cost;
    return v;
  }

  function ownsPoweredGear() {
    return state.till.tier > 0 || hasBuilding('drone');
  }

  return {
    get state() { return state; },
    on, emit, toast,
    newGame, applySetup, load, save, resetGame,
    exportCode, importCode,
    workOddJobs, oddJobsAvailable,
    tick,
    // world queries
    tileAt, parcelAt, isUnlocked, hasBuilding, isProtected, seasonOK,
    buildingsOf, animalsIn, readyIn, feedCostFor, canCraft, canFulfill,
    currentGoal, sellPrice, fuelPrice, availableItems, farmValue, ownsPoweredGear,
    // actions
    smartAction, applyTool, till, plant, water, fertilize, harvest, clearDead, refillCan,
    canPlaceBuilding, placeBuilding, sellBuilding, buyParcel,
    buyAnimal, sellAnimal, vetAnimal, feedAnimal, feedAll, collectBuilding,
    startRecipe, collectRecipes,
    sellItem, fulfillOrder, skipOrder,
    buyCanTier, buyTillTier, buyFuel,
    addXp, checkGoal,
  };
})();
