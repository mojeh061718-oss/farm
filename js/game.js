/* ============ Harvest Empire — core game state & simulation ============ */
'use strict';

const Game = (() => {
  const D = DATA;
  // active-farm world dimensions (per-farm; default to the home valley).
  // WW/WH replace the old fixed WW/H so farms can be different sizes.
  let WW = DATA.WORLD_W, WH = DATA.WORLD_H;
  function syncDims() { WW = (state && state.w) || DATA.WORLD_W; WH = (state && state.h) || DATA.WORLD_H; }
  // the active farm's parcel layout (home = the 9-parcel valley; bought farms
  // are one big fully-owned plot). Per-farm so worlds can differ.
  function parcels() { return (state && state.parcels) || DATA.PARCELS; }

  /* ===================== MULTIPLE FARMS =====================
     One shared wallet/level/inventory/calendar; the LAND (tiles, buildings,
     animals, parcels, dims) is per-farm. The live `state.*` fields hold the
     ACTIVE farm; state.farms[] holds snapshots of the others. */
  const FARM_FIELDS = ['tiles', 'buildings', 'animals', 'unlockedParcels', 'sprouts', 'tonis', 'w', 'h', 'parcels', 'farmName'];
  function ensureFarms() {
    if (!state.farms) { // migrate a single-farm save into farms[0]
      const home = { id: 'home', tid: 'home', label: state.farmName || 'Home Valley' };
      for (const k of FARM_FIELDS) home[k] = state[k];
      state.farms = [home];
      state.activeFarm = 0;
    }
  }
  function snapshotActiveFarm() {
    ensureFarms();
    const f = state.farms[state.activeFarm] || (state.farms[state.activeFarm] = {});
    for (const k of FARM_FIELDS) f[k] = state[k];
    f.label = state.farmName || f.label;
    f.tendedNow = state.now; // stamp when we left, so catch-up knows how long it froze
  }
  function hydrateFarm(i) {
    const f = state.farms[i];
    for (const k of FARM_FIELDS) state[k] = f[k];
    state.activeFarm = i;
    syncDims();
    blessSrc = null; // new farm → different tonis array; force the bless memo to recompute
    // catch-up: the farm sat frozen while you tended another. Fast-forward ONLY
    // its crops by the game-time that passed since you last left it.
    const elapsed = (f.tendedNow != null) ? (state.now - f.tendedNow) : 0;
    return catchUpFarm(elapsed);
  }
  function ownedFarms() { ensureFarms(); return state.farms.map((f, i) => ({ i, id: f.id, label: f.label || f.farmName, tid: f.tid, w: f.w || D.WORLD_W, h: f.h || D.WORLD_H, active: i === state.activeFarm })); }
  function switchFarm(i) {
    ensureFarms();
    if (i < 0 || i >= state.farms.length || i === state.activeFarm) return false;
    snapshotActiveFarm();
    const digest = hydrateFarm(i);
    save();
    emit('farmswitch', i, digest);
    return true;
  }
  function ownsTemplate(tid) { ensureFarms(); return state.farms.some(f => f.tid === tid); }
  // buy a whole property from the Realtor and switch to it
  function buyFarm(tid) {
    ensureFarms();
    const t = D.FARM_TEMPLATES.find(x => x.id === tid);
    if (!t) return false;
    if (ownsTemplate(tid)) { toast('You already own that farm.', 'bad'); return false; }
    if (state.coins < t.price) { toast('Not enough cash for that land!', 'bad'); return false; }
    state.coins -= t.price;
    snapshotActiveFarm();
    const tiles = [];
    for (let y = 0; y < t.h; y++) { const row = []; for (let x = 0; x < t.w; x++) row.push({ k: 'grass', crop: null, obj: null }); tiles.push(row); }
    const farm = {
      id: 'f' + Math.floor(rnd() * 1e9), tid, label: t.name, farmName: t.name,
      w: t.w, h: t.h, tiles, buildings: [], animals: [], sprouts: [], tonis: [],
      unlockedParcels: [0],
      parcels: [{ x: 0, y: 0, w: t.w, h: t.h, cost: 0 }], // whole property, fully owned
    };
    state.farms.push(farm);
    hydrateFarm(state.farms.length - 1);
    // a starter well + a couple of tilled beds on the new land
    placeBuildingRaw('well', Math.floor(t.w / 2), Math.floor(t.h / 2) - 1);
    save();
    emit('farmbought', state.activeFarm);
    toast(`🏡 Welcome to ${t.name}! Your new land is ready.`, 'good');
    return true;
  }
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
  function fx(kind, x, y, text, color, data) { emit('fx', { kind, x, y, text, color, data }); }

  // ---------------- helpers ----------------
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = Math.random;
  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  function diff() { return D.DIFFICULTIES.find(d => d.id === state.diff) || D.DIFFICULTIES[1]; }
  // effective weather harshness: on escalating modes the skies get meaner as the
  // farm gets rich, so late-game disasters still threaten a fat bank (+up to 70%).
  function eventMult() {
    const d = diff();
    if (!d.escalate) return d.eventMult;
    return d.eventMult * (1 + Math.min(0.7, farmValue() / 350000));
  }

  function rollWeather(season) {
    const table = D.WEATHER_TABLE[season];
    let total = 0;
    for (const [, w] of table) total += w;
    let r = rnd() * total;
    for (const [id, w] of table) { r -= w; if (r <= 0) return id; }
    return table[0][0];
  }

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= WW || y >= WH) return null;
    return state.tiles[y][x];
  }

  function parcelAt(x, y) {
    for (let i = 0; i < parcels().length; i++) {
      const p = parcels()[i];
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

  // a greenhouse shelters a 6×6 zone: its 2×2 footprint plus a 2-tile ring
  function greenhouseAt(x, y) {
    return state.buildings.some(b => b && b.type === 'greenhouse'
      && x >= b.x - 2 && x <= b.x + 3 && y >= b.y - 2 && y <= b.y + 3);
  }

  // position-aware: pass tile coords to honor greenhouse coverage.
  // Without coords (item pools etc.) any greenhouse counts as "maybe".
  function seasonOK(cropId, x, y) {
    if (D.CROPS[cropId].seasons.includes(state.season)) return true;
    if (x === undefined) return hasBuilding('greenhouse');
    return greenhouseAt(x, y) || isBlessed(x, y);
  }

  // ---------------- THE Sunflower (the Toni Variety) ----------------
  // Once in a great while, the big man upstairs lets a single seed go.
  // No announcement, no toast — it has to be found by eye.
  function toniAt(x, y) {
    if (!state.tonis) return null;
    for (const t of state.tonis) if (t.x === x && t.y === y) return t;
    return null;
  }

  const toniStands = () => !!(state.tonis && state.tonis.length);

  function spawnToni() {
    if (toniStands()) return null; // the land holds only one
    const cand = [];
    for (let y = 0; y < WH; y++)
      for (let x = 0; x < WW; x++)
        if (isUnlocked(x, y) && !state.tiles[y][x].obj && !toniAt(x, y) && !sproutAt(x, y)) cand.push([x, y]);
    if (!cand.length) return null;
    const [x, y] = pick(cand); // rises out of whatever is there — crops stay
    const t = addToni(x, y);
    fx('toni', x + .5, y + .5); // one golden shimmer if on-screen, nothing more
    return t;
  }

  function addToni(x, y) {
    const t = { x, y, day: absDay(), seen: false };
    state.tonis.push(t);
    blessSrc = null; // same array identity/length can hide a content change
    return t;
  }

  // the parcel a toni stands on is blessed while the toni exists (it never
  // dies). Rect list memoized off the tonis array — recomputed only when a
  // toni appears or a different save is adopted, so zero-toni farms pay
  // nothing and the tick loop never scans parcels per tile.
  let blessCache = null, blessSrc = null, blessLen = -1;
  function blessedRects() {
    const ts = state.tonis;
    if (!ts || !ts.length) return null;
    if (blessSrc !== ts || blessLen !== ts.length) {
      const seen = new Set();
      blessCache = [];
      for (const t of ts) {
        const p = parcelAt(t.x, t.y);
        if (p >= 0 && !seen.has(p)) { seen.add(p); blessCache.push(parcels()[p]); }
      }
      blessSrc = ts; blessLen = ts.length;
    }
    return blessCache;
  }

  function isBlessed(x, y) {
    const rects = blessedRects();
    if (!rects) return false;
    for (const p of rects) if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) return true;
    return false;
  }

  const toniFxAt = {}; // per-parcel golden-fx throttle (≤1/s, render-side only)
  function toniAutoHarvest(x, y) {
    if (!harvest(x, y, true)) return;
    const p = parcelAt(x, y);
    if (!state._offline && state.now - (toniFxAt[p] || -9) >= 1) {
      toniFxAt[p] = state.now;
      fx('burst', x + .5, y + .4, null, '#ffd75e');
    }
  }

  // while a toni stands, its parcel is locked in place — explain it the first
  // couple of times, then stay silent (a 6s throttle spammed it ~58×/run)
  function toniLockNotice() {
    if (!state._offline) {
      state._flags.toniLockN = (state._flags.toniLockN || 0) + 1;
      if (state._flags.toniLockN <= 2 && state.now >= (state._flags.toniWarnUntil || 0)) {
        state._flags.toniWarnUntil = state.now + 6;
        toast('🌻 The land is at peace — nothing can be disturbed while the flower stands. Tap the flower itself to learn its story.');
      }
    }
    return false;
  }

  // harvesting the flower (2-step confirm lives in the UI): the blessing ends,
  // the land wakes, and a single Glowing Seed remains
  function harvestToni(x, y) {
    const i = (state.tonis || []).findIndex(t => t.x === x && t.y === y);
    if (i < 0) return false;
    state.tonis.splice(i, 1);
    blessSrc = null; // drop the rect memo — the parcel may just have woken
    state.inventory.toni_seed = (state.inventory.toni_seed || 0) + 1;
    fx('burst', x + .5, y + .4, null, '#ffd75e');
    fx('float', x + .5, y, '🌟', '#ffe082');
    toast('🌟 A single Glowing Seed rests in your hand. The land wakes.', 'good');
    save();
    return true;
  }

  // ---- the Glowing Seed: plant it, wait a day, and hope ----
  function sproutAt(x, y) {
    if (!state.sprouts) return null;
    for (const s of state.sprouts) if (s.x === x && s.y === y) return s;
    return null;
  }

  function plantToniSeed(x, y) {
    const t = tileAt(x, y);
    if (!t || !isUnlocked(x, y) || t.k !== 'soil' || t.crop || t.obj) return false;
    if (toniAt(x, y) || sproutAt(x, y)) return false;
    if (isBlessed(x, y)) return toniLockNotice();
    if (toniStands()) { toast('🌻 The land can only hold one. Harvest the flower that stands before planting this seed.'); return false; }
    if ((state.inventory.toni_seed || 0) < 1) return false;
    state.inventory.toni_seed--;
    if (state.inventory.toni_seed <= 0) delete state.inventory.toni_seed;
    state.sprouts.push({ x, y, at: state.now + D.DAY_LEN }); // reveals in one day
    fx('plant', x + .5, y + .5, null, '#ffe082');
    toast('🌟 The Glowing Seed is in the ground. Give it a day.', 'good');
    return true;
  }

  // reveal: rolled with Math.random AT THIS MOMENT (property lookup, not the
  // cached rnd binding) so it stays genuinely non-deterministic — and tests
  // can stub Math.random for exactly one reveal.
  function revealSprout(i) {
    const sp = state.sprouts[i];
    state.sprouts.splice(i, 1);
    const t = tileAt(sp.x, sp.y);
    if (!toniStands() && Math.random() < D.TONI.seedChance) {
      addToni(sp.x, sp.y); // the story begins again
      fx('toni', sp.x + .5, sp.y + .5);
    } else if (t && !t.crop && !t.obj) {
      // a kind consolation — ripe and ready, no seed money spent
      t.crop = { id: 'sunflower', prog: 1, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
      toast('🌻 A beautiful sunflower… but an ordinary one.');
    }
  }

  // dev preview: the full stealth arc, compressed — a REAL turnip planted on a
  // free tile, silently tagged, maturing in ~10s so the true pipeline (growth
  // stages, transformation, rise, paper, blessing, lock) plays end to end.
  function devToniDemo() {
    if (toniStands()) { toast('🌻 The land can only hold one — harvest the flower that stands first.'); return null; }
    let spot = null;
    for (let y = 0; y < WH && !spot; y++) for (let x = 0; x < WW; x++) {
      const t = state.tiles[y][x];
      if (isUnlocked(x, y) && !t.obj && !t.crop && !toniAt(x, y) && !sproutAt(x, y)) { spot = [x, y, t]; break; }
    }
    if (!spot) { toast('No free tile for the demo.'); return null; }
    const [x, y, t] = spot;
    if (t.k !== 'soil') t.k = 'soil';
    const had = state.coins;
    state.coins = Math.max(state.coins, 100);
    if (!plant(x, y, 'turnip')) { state.coins = had; return null; }
    state.coins = had; // the demo is free
    const c = t.crop;
    c.toni = true;
    c.water = 1;
    c.prog = Math.max(0, 1 - 10 / D.CROPS.turnip.grow); // ripens in ~10s
    return { x, y };
  }

  // ---------------- new game ----------------
  function newGame() {
    WW = D.WORLD_W; WH = D.WORLD_H; // the home valley is the default size
    const tiles = [];
    for (let y = 0; y < WH; y++) {
      const row = [];
      for (let x = 0; x < WW; x++) row.push({ k: 'grass', crop: null, obj: null });
      tiles.push(row);
    }

    state = {
      v: 3,
      farmName: 'My Farm',
      diff: 'classic',
      w: D.WORLD_W, h: D.WORLD_H, // active-farm dimensions
      setupDone: false,
      coins: 3000,             // dollars
      fuel: 0,                 // gallons
      xp: 0,
      level: 1,
      now: 0,                  // total gameplay seconds
      day: 1, t: 0.02,         // dawn of day 1 — a full first day for crops
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
      tonis: [],
      sprouts: [],
      unlockedParcels: [0],
      goalIndex: 0,
      goalCursor: 0,
      daily: null, // generated on the first tick (or by regenDaily)
      feedCredits: 0,
      usedNames: [],
      produced: {},
      stats: { tilled: 0, planted: 0, watered: 0, harvested: 0, sold: 0, collected: 0, orders: 0, crafted: 0, fertilized: 0, earned: 0, lost: 0, recent: 0, prodMark: 0 },
      settings: { sound: false },
      autoFuel: false, // keep powered gear topped up from coins each dawn
      autoSell: false, // sell surplus produce each dawn (keeps order/craft inputs)
      autoHarvest: false, // bring ripe crops in automatically the moment they're ready
      legacy: legacyStars(), // permanent +10%/star sell bonus carried across farms
      lastSaved: Date.now(),
      _flags: { deaths: { dry: 0, rot: 0, season: 0 } },
    };

    for (const id of Object.keys(D.ITEMS)) state.market.mults[id] = 0.9 + rnd() * 0.3;

    // starter farm: a well and four tilled plots
    placeBuildingRaw('well', 7, 5);
    for (const [x, y] of [[9, 7], [10, 7], [9, 8], [10, 8]]) state.tiles[y][x].k = 'soil';
    // a farmhouse for a lived-in, premium feel (decorative — no panel), at the
    // top of the starting plot
    if (D.BUILDINGS.farmhouse) placeBuildingRaw('farmhouse', 9, 5);

    ensureFarms(); // register this as the home farm (farms[0])
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
    if (['bakery', 'creamery', 'press', 'loom'].includes(type)) { b.queue = []; b.slots = 1; }
    // reuse tombstone slots so indexes stay stable
    let idx = state.buildings.indexOf(null);
    if (idx === -1) { state.buildings.push(b); idx = state.buildings.length - 1; }
    else state.buildings[idx] = b;
    // decor buildings (the farmhouse) render but never occupy tiles — the land
    // under them stays farmable, and they collide with nothing
    if (!def.decor)
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

  function mulberry32(a) { // tiny seeded RNG — deterministic daily/seasonal picks
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const seedFrom = str => parseInt(fnv(str), 16) >>> 0;

  function validSave(st) {
    // dimension-agnostic: farms may be any size, so validate structure (a
    // non-empty rectangular tile grid) rather than a fixed row count.
    return st && st.v === 3 && Array.isArray(st.tiles) && st.tiles.length >= 1
      && Array.isArray(st.tiles[0]) && Number.isFinite(st.coins) && st.setupDone;
  }

  let noSave = false; // hard-reset latch: nothing may write after an erase
  function save() {
    // never persist a pre-setup shell — validSave would reject it on load and
    // the recovery path would resurrect an old backup instead
    if (!state || noSave || !state.setupDone) return;
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

  // The classic 20×15 home valley's parcels, by INDEX (for the migration below).
  const OLD_HOME_PARCELS = [
    { x: 7, y: 5, w: 6, h: 6 }, { x: 13, y: 5, w: 5, h: 6 }, { x: 2, y: 5, w: 5, h: 6 },
    { x: 7, y: 11, w: 6, h: 3 }, { x: 7, y: 2, w: 6, h: 3 }, { x: 13, y: 11, w: 5, h: 3 },
    { x: 13, y: 2, w: 5, h: 3 }, { x: 2, y: 11, w: 5, h: 3 }, { x: 2, y: 2, w: 5, h: 3 },
  ];
  const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  // Grow an old 20×15 home into the new big valley IN PLACE. The new world shares
  // the old origin (0,0) and is a strict superset, so every crop, building, Toni
  // and tilled tile stays exactly where it was — we just enlarge the grid and
  // re-own the new parcels that cover the player's old land (nothing is stranded;
  // a fully-owned old valley stays fully owned). The rest becomes new land to buy.
  function expandOldHome(F) {
    const NEW = D.PARCELS, nw = D.WORLD_W, nh = D.WORLD_H, ow = F.w, oh = F.h;
    const grid = [];
    for (let y = 0; y < nh; y++) {
      const row = [];
      for (let x = 0; x < nw; x++) {
        const t = (y < oh && x < ow && F.tiles[y]) ? F.tiles[y][x] : null;
        row.push(t || { k: 'grass', crop: null, obj: null });
      }
      grid.push(row);
    }
    F.tiles = grid; F.w = nw; F.h = nh;
    // re-derive ownership: keep every new parcel that covers old owned land
    const ownedOld = (F.unlockedParcels || [0]).map(i => OLD_HOME_PARCELS[i]).filter(Boolean);
    let unlocked = NEW.map((p, i) => i).filter(i => i === 0 || ownedOld.some(o => rectsOverlap(NEW[i], o)));
    if ((F.unlockedParcels || []).length >= OLD_HOME_PARCELS.length) unlocked = NEW.map((_, i) => i); // was fully owned → stays fully owned
    F.unlockedParcels = unlocked;
    F.parcels = NEW.map(p => ({ ...p }));
  }
  // one-time: enlarge every original home valley in the save (active + snapshots)
  function expandHomesOnce() {
    if (state._flags.homeExpanded) return;
    state._flags.homeExpanded = true;
    const isOldHome = f => f && f.w === 20 && f.h === 15; // no bought template is 20×15
    ensureFarms();
    for (let i = 0; i < state.farms.length; i++) {
      if (i === state.activeFarm) { if (isOldHome(state)) expandOldHome(state); }
      else if (isOldHome(state.farms[i])) expandOldHome(state.farms[i]);
    }
    syncDims();
    snapshotActiveFarm(); // refresh the active snapshot to match the migrated live state
  }

  function adoptState(st) {
    state = st;
    state._flags = state._flags || {};
    state._flags.deaths = state._flags.deaths || { dry: 0, rot: 0, season: 0 };
    // ---- multi-farm: derive dims from the tile grid for pre-multifarm saves ----
    state.w = state.w || (state.tiles && state.tiles[0] ? state.tiles[0].length : D.WORLD_W);
    state.h = state.h || (state.tiles ? state.tiles.length : D.WORLD_H);
    syncDims();
    ensureFarms(); // wrap a pre-multifarm save into farms[0]
    for (const a of state.animals) if (!a.uid) a.uid = animalUid++;
    animalUid = Math.max(animalUid, ...state.animals.map(a => a.uid + 1), 1);

    // ---- 2.0 additive migrations (v3 saves stay loadable) ----
    state.feedCredits = state.feedCredits || 0;
    state.usedNames = state.usedNames || [...new Set(state.animals.map(a => a.name))];
    state.produced = state.produced || {};
    for (const k of Object.keys(state.inventory || {}))
      if (!D.ITEMS[k] || !D.ITEMS[k].mythic) state.produced[k] = 1; // orders never ask for mythics
    state.stats.recent = state.stats.recent || 0;
    state.stats.prodMark = state.stats.prodMark || 0;
    // ---- 3.0 additive migrations ----
    state.goalCursor = state.goalCursor || 0;
    state.tonis = state.tonis || [];
    state.sprouts = state.sprouts || [];
    if (!state.daily) regenDaily();
    // orders gain deadlines (floored so slow items are never impossible)
    for (const o of state.orders || []) {
      if (o.expires == null) o.expires = state.now + orderWindow(o.reqs || {});
      if (o.posted == null) o.posted = state.now;
    }
    // craft queues: absolute `done` timestamps → remaining seconds; jobs
    // queued under the old parallel rules are grandfathered (legacy) so
    // they all finish — new jobs obey the slot lanes.
    for (const b of state.buildings) {
      if (!b || !b.queue) continue;
      if (!b.slots) b.slots = 1;
      b.queue = b.queue.map(j => j.left != null ? j
        : { r: j.r, left: Math.max(0, (j.done || 0) - state.now), legacy: true });
    }
    // sound became opt-in — quiet existing farms once (the menu can re-enable)
    state.settings = state.settings || { sound: false };
    if (!state._flags.soundOptIn) { state._flags.soundOptIn = true; state.settings.sound = false; }
    // greenhouse became an area effect — tell the player once
    if (!state._flags.ghAreaNotice && state.buildings.some(b => b && b.type === 'greenhouse')) {
      state._flags.ghAreaNotice = true;
      state._flags.pendingToast = '🪴 Greenhouses now protect a 6×6 area around them!';
    }
    // the home valley grew: expand any classic 20×15 home into the big new one
    expandHomesOnce();
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
    const realAway = (Date.now() - (state.lastSaved || Date.now())) / 1000;
    let away = null;
    if (realAway > 45) {
      // away time compresses: 1 real hour ≈ 1 in-game day, at most 2.5 days of
      // sim — crops finish and wait, nothing catastrophic happens overnight
      const sim = Math.min(Math.min(realAway, 72 * 3600) * (D.DAY_LEN / 3600), 2.5 * D.DAY_LEN);
      away = fastForward(sim, realAway);
    }
    return { fresh: false, away, recovered };
  }

  // portable save code: HE1.<base64 json>.<checksum>
  function exportCode() {
    if (!state) return null;
    state._flags.lastBackupAt = Date.now(); // feeds the backup nudge
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
    noSave = true; // pagehide/autosave must not resurrect the farm on reload
    try {
      localStorage.removeItem(SAVE_KEY);
      for (const k of BACKUP_KEYS) localStorage.removeItem(k);
    } catch (e) {}
  }

  // ---- Legacy (prestige) — carried across farms, never part of the save ----
  const LEGACY_KEY = 'harvest-empire-legacy';
  function legacyStars() { try { return parseInt(localStorage.getItem(LEGACY_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  // start a fresh valley, banking one Legacy Star (+10% permanent sell price)
  function startNewLegacy() {
    const stars = legacyStars() + 1;
    try { localStorage.setItem(LEGACY_KEY, String(stars)); } catch (e) {}
    resetGame();
    return stars;
  }
  // offered once the whole valley is owned
  function canPrestige() { return !!state && state.unlockedParcels.length >= parcels().length; }

  // simulate compressed time that passed while the game was closed
  // (kinder than live play: no thirst, wilt or rot — crops finish and wait)
  function fastForward(elapsed, realSeconds) {
    state._offline = true;
    const before = readyCounts();
    const lostBefore = state.stats.lost;
    const harvestedBefore = state.stats.harvested;
    const orderIds = state.orders.map(o => o.id);
    const seasonBefore = state.season;
    let remaining = elapsed;
    while (remaining > 0) {
      const step = Math.min(2, remaining);
      tick(step);
      remaining -= step;
    }
    state._offline = false;
    // a season flipped while away: grace window before off-season wilt resumes
    if (state.season !== seasonBefore) state._flags.rescueUntil = state.now + 0.75 * D.DAY_LEN;
    state._flags.quietUntil = state.now + 10; // let the digest breathe — no toast pile-up
    const after = readyCounts();
    // fold (and zero) unflushed death tallies into the digest so the delayed
    // flushDeaths toast can't report them a second time
    const d = state._flags.deaths;
    const lostBy = { dry: d.dry, rot: d.rot, season: d.season };
    d.dry = d.rot = d.season = 0;
    return {
      seconds: realSeconds != null ? realSeconds : elapsed, // real away time
      crops: Math.max(0, after.crops - before.crops),
      produce: Math.max(0, after.produce - before.produce),
      droneHarvest: state.stats.harvested - harvestedBefore, // offline harvests only come from drones
      expiredOrders: orderIds.filter(id => !state.orders.some(o => o.id === id)).length,
      lost: Math.max(state.stats.lost - lostBefore, lostBy.dry + lostBy.rot + lostBy.season),
      lostBy,
    };
  }

  // Return-catch-up: fast-forward ONLY a farm's crops by the game-time it sat
  // frozen while you tended another. Growth-only and forgiving — nothing wilts or
  // rots (you literally couldn't tend it), so a visit is always a small reward:
  // crops advance, and a blessed (Toni) farm banks the harvests it would have made.
  // The shared clock / orders / market / animals are already current, so we never
  // touch them. Capped at the same 2.5-day away-limit so an idle empire can't mint.
  function catchUpFarm(elapsed) {
    if (!(elapsed > 0) || !state || !state.tiles) return null;
    elapsed = Math.min(elapsed, 2.5 * D.DAY_LEN);
    const wasOffline = state._offline;
    state._offline = true; // silences fx/toasts and the blessed auto-harvester's sparkle
    const before = readyCounts();
    const harvestedBefore = state.stats.harvested;
    const STEP = 2; // small steps so regrow/blessed cycles can bank more than once
    let remaining = elapsed;
    while (remaining > 0) {
      const dt = Math.min(STEP, remaining);
      remaining -= dt;
      const bless = blessedRects(); // cheap: cached unless a toni just rose
      for (let ty = 0; ty < WH; ty++) for (let tx = 0; tx < WW; tx++) {
        const c = state.tiles[ty][tx].crop;
        if (!c || c.dead) continue;
        let bl = false;
        if (bless) for (const p of bless) if (tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h) { bl = true; break; }
        if (bl) { c.water = 1; c.wilt = 0; c.rot = 0; }
        const off = !seasonOK(c.id, tx, ty);
        if (c.prog >= 1) {
          if (c.toni) { // a secret toni-turnip ripens: she rises (only one, ever)
            if (state.tonis.length) delete c.toni;
            else { state.tiles[ty][tx].crop = null; const tn = addToni(tx, ty); tn.rise = state.now; continue; }
          }
          if (bl) { toniAutoHarvest(tx, ty); continue; } // blessed ripe crops bank + replant
          // ordinary ripe crops just wait (no rot while you're away)
        } else if (!off) {
          const def = D.CROPS[c.id];
          const growTime = c.regrown && def.regrow ? def.regrow : def.grow;
          const speed = (c.fert || bl) ? 1.25 : 1;
          c.prog = Math.min(1, c.prog + (dt * speed) / growTime);
        }
      }
    }
    state._offline = wasOffline;
    const after = readyCounts();
    const banked = state.stats.harvested - harvestedBefore; // blessed auto-harvests
    return {
      elapsed,
      grew: Math.max(0, after.crops - before.crops), // newly-ripe standing crops
      banked,
      ripe: after.crops,
    };
  }

  // backup nudge: the player has never exported a code (and the farm is past
  // its first days), or the last export is over 7 real days stale
  let backupNudged = false; // one toast per session, max
  function backupDue() {
    if (!state || !state.setupDone) return false;
    const at = state._flags.lastBackupAt;
    if (!at) return state.now > 2 * D.DAY_LEN;
    return Date.now() - at > 7 * 86400 * 1000;
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
  // Market Day: every mid-season day, 2-3 deterministic items sell +50%
  let mdCache = null; // { key, items } — recomputed per season
  function marketDayItems() {
    if (!state || state.day !== Math.ceil(D.SEASON_DAYS / 2)) return [];
    const key = state.year + '-' + state.season;
    if (!mdCache || mdCache.key !== key) {
      const rng = mulberry32(seedFrom(key));
      // mythics excluded — the filtered list also keeps pre-toni picks identical
      const ids = Object.keys(D.ITEMS).filter(id => !D.ITEMS[id].mythic);
      const items = [];
      const n = 2 + Math.floor(rng() * 2);
      while (items.length < n) {
        const id = ids[Math.floor(rng() * ids.length)];
        if (!items.includes(id)) items.push(id);
      }
      mdCache = { key, items };
    }
    return mdCache.items;
  }

  function sellPrice(item) {
    const base = D.ITEMS[item].base;
    let m = state.market.mults[item] || 1;
    if (state.market.hot === item) m *= 1.5;
    if (marketDayItems().includes(item)) m *= 1.5;
    m *= (1 + D.repBonus(state.level)) * diff().sellBonus;
    m *= 1 + 0.10 * (state.legacy || 0); // Legacy Stars: +10% each, permanently
    return Math.max(1, Math.round(base * m));
  }

  function fuelPrice() { return state.market.fuelPrice; }

  function buyFuel(gal) {
    gal = Number(gal);
    if (!Number.isFinite(gal) || gal <= 0 || gal > 500) return false; // no negative-gallon money printers
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

  // seconds to produce one unit of an item: crop grow time, animal prodTime,
  // or recipe time + its slowest input (one level deep)
  function timeToProduce(id, depth) {
    if (D.CROPS[id]) return D.CROPS[id].grow;
    for (const a of Object.values(D.ANIMALS)) if (a.product === id) return a.prodTime;
    if (depth > 1) return 0;
    const r = Object.values(D.RECIPES).find(r => r.out === id);
    if (!r) return 0;
    let slowest = 0;
    for (const inId of Object.keys(r.in)) slowest = Math.max(slowest, timeToProduce(inId, (depth || 0) + 1));
    return r.time + slowest;
  }

  // deadline window for a set of requirements: never less than 3 days, never
  // less than 3× the slowest item's production time (no impossible orders)
  function orderWindow(reqs) {
    let need = 0;
    for (const id of Object.keys(reqs)) need = Math.max(need, timeToProduce(id, 0));
    return Math.max(3 * D.DAY_LEN, 3 * need);
  }

  function makeOrder() {
    const pool = availableItems();
    // 70% of picks come from what this farm has actually produced — orders ask
    // for things the player demonstrably makes (fresh farms fall back to pool)
    const producedPool = Object.keys(state.produced || {}).filter(id => D.ITEMS[id] && !D.ITEMS[id].mythic);
    // quantities scale with RECENT production (decayed daily harvest+collect),
    // not lifetime wealth — a slumping or fresh farm gets small orders again
    const scale = 1 + Math.min(6, (state.stats.recent || 0) / 10);
    const n = 1 + Math.floor(rnd() * 2); // 1–2 line items — assemble-able, not a shopping list
    const reqs = {};
    for (let i = 0; i < n; i++) {
      const item = producedPool.length && rnd() < 0.75 ? pick(producedPool) : pick(pool);
      // asks stay small and are capped so a productive farm can actually fill them
      // (previously they scaled with production the player was simultaneously selling)
      // scales with recent production (via `scale`) but is capped so a delivery
      // stays assemble-able — never the 10-15+ pile the old formula could ask for
      const want = Math.round((2 + rnd() * 2) * (0.8 + scale * 0.15));
      const qty = Math.max(2, Math.min(8, want));
      reqs[item] = (reqs[item] || 0) + qty;
    }
    // payout rides the player's LIVE prices (market, reputation, difficulty)
    // so a delivery always beats spot-selling by ~25%; productive farms get a
    // fatter ticket (up to +30%), not just bigger asks
    let total = 0, baseTotal = 0;
    for (const [item, qty] of Object.entries(reqs)) {
      total += sellPrice(item) * qty;
      baseTotal += D.ITEMS[item].base * qty;
    }
    total *= 1 + Math.min(0.3, (state.stats.recent || 0) / 40);
    return {
      id: 'o' + Math.floor(rnd() * 1e9),
      reqs,
      coins: Math.ceil(total * 1.25 / 5) * 5,
      xp: Math.max(5, Math.ceil(baseTotal / 8)),
      posted: state.now,
      expires: state.now + orderWindow(reqs),
    };
  }

  // rush bonus: delivered within one day of posting pays +25%
  function orderRush(order) {
    return order.posted != null && state.now <= order.posted + D.DAY_LEN;
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
    const rush = orderRush(order);
    const payout = rush ? Math.ceil(order.coins * 1.25 / 5) * 5 : order.coins;
    state.coins += payout;
    state.stats.earned += payout;
    addXp(order.xp);
    state.stats.orders++;
    dailyProgress('orders');
    state.orders.splice(i, 1);
    state.orderTimer = 30;
    toast(`Order complete! +${D.$(payout)}${rush ? ' ⚡ RUSH +25%!' : ''}`, 'good');
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

  // artisan goods hold their price — the incentive to run processing chains
  const PROCESSED = new Set(Object.values(D.RECIPES).map(r => r.out));

  function sellItem(item, qty) {
    if (D.ITEMS[item] && D.ITEMS[item].mythic) return 0; // mythics are beyond money
    const have = state.inventory[item] || 0;
    qty = Math.min(qty, have);
    if (qty <= 0) return 0;
    const gain = sellPrice(item) * qty;
    state.inventory[item] -= qty;
    if (state.inventory[item] <= 0) delete state.inventory[item];
    state.coins += gain;
    state.stats.earned += gain;
    state.stats.sold += qty;
    addXp(qty * 0.5); // fractional — selling 1-at-a-time earns exactly the same
    // market memory: dumping a pile crashes that price MULTIPLICATIVELY — repeat
    // dumps keep digging (down to 0.05×), so dump-selling can't print money
    if (!PROCESSED.has(item)) {
      const crash = Math.max(0.55, 1 - qty * 0.004); // one sale costs at most −45%
      state.market.mults[item] = Math.max(0.05, (state.market.mults[item] || 1) * crash);
      if (crash <= 0.85 && !state._flags.dumpTold && !state._offline) {
        state._flags.dumpTold = true;
        toast(`📉 Dumping ${qty} ${D.ITEMS[item].name} at once crashed its price! It recovers over a few days.`, 'bad');
      }
    }
    emit('sound', 'coin');
    checkGoal();
    return gain;
  }

  // ---------------- farming actions ----------------
  function till(x, y) {
    const t = tileAt(x, y);
    if (!t || !isUnlocked(x, y) || t.k !== 'grass' || t.obj) return false;
    if (isBlessed(x, y)) return toniLockNotice();
    t.k = 'soil';
    state.stats.tilled++;
    fx('till', x + .5, y + .5, null, '#7d5c3c');
    checkGoal();
    return true;
  }

  function plant(x, y, cropId) {
    const t = tileAt(x, y);
    const def = D.CROPS[cropId];
    if (!t || !def || t.k !== 'soil' || t.crop || t.obj || sproutAt(x, y)) return false;
    if (isBlessed(x, y)) return toniLockNotice(); // the frozen field plants itself
    if (state.coins < def.seed) { toast('Not enough cash for seeds! (Tip: work odd jobs from the ⚙️ Menu)', 'bad'); return false; }
    // planting out of season is allowed — but the crop will wither and die.
    if (!seasonOK(cropId, x, y) && state.now >= (state._flags.offWarnUntil || 0) && !state._offline) {
      state._flags.offWarnUntil = state.now + 12; // don't spam while drag-planting
      toast(`⚠️ ${D.ITEMS[cropId].name} is out of season — it will wither and the seed money is gone!`, 'bad');
    }
    state.coins -= def.seed;
    t.crop = { id: cropId, prog: 0, water: 0, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    if (state.weather === 'rain' || state.weather === 'storm') t.crop.water = 1;
    state.stats.planted++;
    fx('plant', x + .5, y + .5, null, def.color);
    // any seed, cheapest or priciest, might be the one He dropped: the roll
    // happens ONLY here, at planting — and it tells NO ONE. The crop grows
    // exactly as the seed it was planted as (same timer, same sprite); the
    // truth waits for maturity. Math.random read at the roll.
    if (!state._offline && !toniStands() && Math.random() < D.TONI.plantChance) t.crop.toni = true;
    checkGoal();
    return true;
  }

  // every empty, plantable, tilled plot you own (ignores season — that's per seed)
  function tilledEmptyCount() {
    if (!state || !state.tiles) return 0;
    let n = 0;
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
      const t = state.tiles[y][x];
      if (t && t.k === 'soil' && !t.crop && !t.obj && isUnlocked(x, y) && !isBlessed(x, y) && !sproutAt(x, y)) n++;
    }
    return n;
  }
  // fill every empty tilled plot with one crop, in-season only (never wastes seed
  // money on a doomed off-season plant), stopping the moment the cash runs out
  function plantAll(cropId) {
    const def = D.CROPS[cropId];
    if (!def || !state) return { planted: 0, cost: 0, broke: false };
    const before = state.coins;
    let planted = 0, broke = false, skippedOff = 0;
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
      const t = state.tiles[y][x];
      if (!t || t.k !== 'soil' || t.crop || t.obj) continue;
      if (!isUnlocked(x, y) || isBlessed(x, y) || sproutAt(x, y)) continue;
      if (!seasonOK(cropId, x, y)) { skippedOff++; continue; } // don't sow into a season it can't survive
      if (state.coins < def.seed) { broke = true; y = WH; break; }
      if (plant(x, y, cropId)) planted++;
    }
    return { planted, cost: before - state.coins, broke, skippedOff };
  }

  function water(x, y) {
    const t = tileAt(x, y);
    if (!t || !t.crop || t.crop.dead || t.crop.water > 0.55) return false;
    if (state.can.water <= 0) return 'empty';
    state.can.water--;
    t.crop.water = 1;
    state.stats.watered++;
    dailyProgress('water');
    fx('water', x + .5, y + .35, null, '#4a90b8');
    checkGoal();
    return true;
  }

  function fertilize(x, y) {
    const t = tileAt(x, y);
    if (!t || !t.crop || t.crop.dead || t.crop.fert || t.crop.prog >= 1) return false;
    if (isBlessed(x, y)) return false; // silent no-op: blessed soil already grows with love
    const cost = D.fertCost(t.crop.id);
    if (state.coins < cost) return 'broke';
    state.coins -= cost;
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
    if (state.produced) state.produced[id] = 1;
    addXp(def.xp);
    state.stats.harvested++;
    dailyProgress('harvest', id, n);

    if (def.regrow && seasonOK(id, x, y)) { // multi-harvest crops grow back
      t.crop.prog = 0;
      t.crop.rot = 0;
      t.crop.regrown = true;
      t.crop.fert = false;
    } else if (isBlessed(x, y)) {
      // the blessed field is a frozen snapshot: single-harvest crops replant
      // themselves, free — its composition never changes while the toni stands
      t.crop = { id, prog: 0, water: 1, wilt: 0, rot: 0, dead: false, fert: false, regrown: false };
    } else {
      t.crop = null;
    }

    if (!silent) {
      fx('float', x + .5, y, `+${n} ${D.ITEMS[id].emoji}`, n > 1 ? '#ffe082' : '#fff');
      fx('harvest', x + .5, y + .4, null, def.color, { n, id });
    }
    checkGoal();
    return n;
  }

  function clearDead(x, y) {
    const t = tileAt(x, y);
    if (!t || !t.crop || !t.crop.dead) return false;
    t.crop = null;
    fx('clear', x + .5, y + .4, null, '#8a8178');
    return true;
  }

  // the shovel: dig up a living crop (50% seed refund), clear a dead one,
  // or un-till empty soil back to grass (the ground layer repaints itself)
  function dig(x, y) {
    const t = tileAt(x, y);
    if (!t || !isUnlocked(x, y) || t.obj || sproutAt(x, y)) return false;
    if (toniAt(x, y) || isBlessed(x, y)) return toniLockNotice(); // untouchable while the flower stands
    if (t.crop) {
      if (t.crop.dead) return clearDead(x, y);
      const refund = Math.round(D.CROPS[t.crop.id].seed * 0.5);
      t.crop = null;
      state.coins += refund;
      fx('till', x + .5, y + .5, null, '#7d5c3c'); // small dirt burst
      fx('float', x + .5, y, `+${D.$(refund)}`, '#ffe082');
      return true;
    }
    if (t.k === 'soil') {
      t.k = 'grass'; // baked ground layer repaints via its tile signature
      fx('till', x + .5, y + .5, null, '#6a8f3c');
      return true;
    }
    return false;
  }

  function refillCan() {
    const cap = D.CAN_TIERS[state.can.tier].cap;
    if (state.can.water >= cap) return false;
    state.can.water = cap;
    emit('sound', 'water');
    // no toast — the can meter shows it, and this fired ~70×/run as pure noise
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
    } else if (tool === 'shovel') {
      if (dig(x, y)) { count = 1; emit('sound', 'till'); }
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
      if (t.crop.dead) {
        // teach the loss: say WHY it died, then clear it
        const CAUSES = { thirst: 'thirst 🥀', rot: 'rot — it stood ripe too long 🪰', season: 'the season change 🍂', frost: 'frost ❄️', storm: 'the storm ⛈️' };
        toast(`💀 ${D.ITEMS[t.crop.id].name} died of ${CAUSES[t.crop.deadCause] || 'neglect'}`);
        clearDead(x, y);
        emit('sound', 'till');
        return { act: 'clear' };
      }
      if (t.crop.prog >= 1) { applyTool('harvest', x, y); return { act: 'harvest' }; }
      if (t.crop.water <= 0.55) {
        const r = applyTool('water', x, y);
        if (r === 'empty') { toast('Watering can is empty — tap the Well! 💧', 'bad'); return { act: 'empty-can' }; }
        return { act: 'water' };
      }
      return { act: 'growing' };
    }

    if (sproutAt(x, y)) { toast('🌟 Something is glowing beneath the soil…'); return { act: 'sprout' }; }
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
        if (toniAt(x + dx, y + dy) || sproutAt(x + dx, y + dy) || isBlessed(x + dx, y + dy)) return false;
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
    if (type === 'greenhouse') state._flags.ghAreaNotice = true; // built under the area rules

    checkGoal();
    return true;
  }

  // sell a building back at 50% — a lifeline when cash runs dry
  function sellBuilding(index) {
    const b = state.buildings[index];
    if (!b) return false;
    const def = D.BUILDINGS[b.type];
    if (isBlessed(b.x, b.y)) return toniLockNotice(); // locked in place under the blessing
    if (def.capacity && animalsIn(index).length > 0) {
      toast('Sell or move the animals first!', 'bad');
      return false;
    }
    if (b.type === 'well' && buildingsOf('well').length <= 1) {
      toast('A farm needs at least one well!', 'bad');
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
    const p = parcels()[index];
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

  function sprinkle(b) { // 5×5 — one affordable unit now covers a real plot
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const t = tileAt(b.x + dx, b.y + dy);
        if (t && t.crop && !t.crop.dead) t.crop.water = 1;
      }
  }

  // every tile covered by a sprinkler (5×5), rebuilt per tick — null on farms
  // with no sprinklers so ordinary farms pay nothing. Crops on these tiles are
  // kept watered continuously (true auto-watering), not just at dawn.
  function sprinkledCells() {
    let any = false;
    for (const b of state.buildings) if (b && b.type === 'sprinkler') { any = true; break; }
    if (!any) return null;
    const set = new Set();
    for (const b of state.buildings) {
      if (!b || b.type !== 'sprinkler') continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) set.add((b.x + dx) + ',' + (b.y + dy));
    }
    return set;
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
          if (!tileAt(x, y).crop && state.coins >= D.CROPS[id].seed && seasonOK(id, x, y)) {
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

  // draw names without replacement; when the pool runs dry, "Clover II" etc.
  function pickAnimalName() {
    state.usedNames = state.usedNames || [];
    const used = state.usedNames;
    let pool = D.ANIMAL_NAMES.filter(n => !used.includes(n));
    if (!pool.length) {
      const ROMAN = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
      for (let gen = 2; !pool.length; gen++) {
        const suffix = ROMAN[gen] || `#${gen}`;
        pool = D.ANIMAL_NAMES.map(n => `${n} ${suffix}`).filter(n => !used.includes(n));
      }
    }
    const name = pick(pool);
    used.push(name);
    return name;
  }

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
      name: pickAnimalName(),
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

  // the Feed Mill grinds grain into feed credits: 1 wheat/corn → 3 feeds
  function grindGrain(item, qty) {
    if (item !== 'wheat' && item !== 'corn') return 0;
    if (!hasBuilding('mill')) return 0;
    qty = Math.min(Math.max(0, Math.floor(qty)), state.inventory[item] || 0);
    if (qty <= 0) { toast(`No ${D.ITEMS[item].name.toLowerCase()} to grind!`, 'bad'); return 0; }
    state.inventory[item] -= qty;
    if (state.inventory[item] <= 0) delete state.inventory[item];
    state.feedCredits = (state.feedCredits || 0) + qty * 3;
    emit('sound', 'till');
    toast(`🌾 Ground ${qty} ${D.ITEMS[item].name.toLowerCase()} into ${qty * 3} feed credit${qty * 3 > 1 ? 's' : ''}!`, 'good');
    return qty * 3;
  }

  // feeding spends a feed credit first, then falls back to cash
  function feedCostFor(animal) {
    const def = D.ANIMALS[animal.type];
    if ((state.feedCredits || 0) > 0) return { credits: 1 };
    return { coins: def.feedCost };
  }

  function feedAnimal(index) {
    const a = state.animals[index];
    if (!a || state.now < a.fedUntil - D.DAY_LEN * 0.2) return false; // already well fed
    const cost = feedCostFor(a);
    if (cost.credits) {
      state.feedCredits -= cost.credits;
    } else {
      if (state.coins < cost.coins) { toast('Not enough cash for feed!', 'bad'); return false; }
      state.coins -= cost.coins;
    }
    a.fedUntil = state.now + D.DAY_LEN * 1.2;
    if (!a.sick) a.happiness = clamp(a.happiness + 8, 0, 100);
    dailyProgress('feed');
    return true;
  }

  function feedAll(bIdx) {
    let n = 0;
    state.animals.forEach((a, i) => { if (a.home === bIdx && feedAnimal(i)) n++; });
    if (n) emit('sound', 'plant'); // no toast — happy animals are visible feedback; fired ~66×/run
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
      if (state.produced) state.produced[def.product] = 1;
      a.prodProg = 0;
      n += bonus;
      gainXp += Math.ceil(D.ITEMS[def.product].base / 8);
      state.stats.collected++;
      dailyProgress('collect', def.product, bonus);
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
    b.queue.push({ r: recipeId, left: r.time }); // remaining seconds — lanes tick it down
    emit('sound', 'plant');
    return true;
  }

  // which queued jobs are actually crafting right now (up to `slots` lanes;
  // legacy jobs from pre-2.0 parallel saves always run to completion)
  function runningJobs(b) {
    const out = [];
    let lanes = b.slots || 1;
    for (const job of b.queue) {
      if (job.left <= 0) continue;                 // finished, awaiting collection
      if (job.legacy) { out.push(job); continue; } // grandfathered
      if (lanes <= 0) break;
      out.push(job);
      lanes--;
    }
    return out;
  }

  // buy an extra parallel craft lane for a processing building
  function buySlot(bIdx) {
    const b = state.buildings[bIdx];
    if (!b || !b.queue) return false;
    const next = (b.slots || 1) + 1;
    const cost = D.SLOT_COSTS[next];
    if (!cost) return false;
    if (state.coins < cost) { toast('Not enough cash!', 'bad'); return false; }
    state.coins -= cost;
    b.slots = next;
    emit('sound', 'build');
    toast(`⚙️ Craft slot ${next} installed — ${next} recipes run at once!`, 'good');
    return true;
  }

  function collectRecipes(bIdx) {
    const b = state.buildings[bIdx];
    if (!b || !b.queue) return 0;
    let n = 0;
    b.queue = b.queue.filter(job => {
      if (job.left <= 0) {
        const out = D.RECIPES[job.r].out;
        state.inventory[out] = (state.inventory[out] || 0) + 1;
        if (state.produced) state.produced[out] = 1;
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

  // odd jobs: a once-per-day income floor so a failed farm is never a dead end.
  // $40 base, +$5 per consecutive day worked (cap $60); skipping a day resets.
  function absDay() {
    return ((state.year - 1) * 4 + state.season) * D.SEASON_DAYS + state.day;
  }

  function oddJobsAvailable() {
    return state._flags.oddJobsDay !== `${state.year}-${state.season}-${state.day}`;
  }

  function oddJobsPay() { // today's rate, streak included
    const streak = state._flags.oddJobsAbs === absDay() - 1 ? (state._flags.oddJobsStreak || 0) + 1 : 0;
    return Math.min(60, 40 + streak * 5);
  }

  function workOddJobs() {
    if (!oddJobsAvailable()) { toast('You already worked today — come back tomorrow!', 'bad'); return false; }
    const pay = oddJobsPay();
    state._flags.oddJobsStreak = state._flags.oddJobsAbs === absDay() - 1 ? (state._flags.oddJobsStreak || 0) + 1 : 0;
    state._flags.oddJobsAbs = absDay();
    state._flags.oddJobsDay = `${state.year}-${state.season}-${state.day}`;
    state.coins += pay;
    emit('sound', 'coin');
    toast(`💪 A hard day's work in town: +${D.$(pay)}${pay > 40 ? ' (streak bonus!)' : ''}`, 'good');
    return true;
  }

  // ---------------- daily tasks & streak ----------------
  // Three tasks a day, generated from the LOCAL calendar date — a real-world
  // reason to come back. Clearing all three grows a streak; day 7 pays big.
  const dateStr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function todayLocal() { return dateStr(new Date()); } // single date source — tests shim Date
  function dayBefore(date) { // 'YYYY-MM-DD' minus one day, local calendar
    const [y, m, d] = date.split('-').map(Number);
    return dateStr(new Date(y, m - 1, d - 1));
  }

  function inSeasonCrops() {
    return Object.keys(D.CROPS).filter(id => D.CROPS[id].seasons.includes(state.season));
  }

  function regenDaily(date) {
    date = date || todayLocal();
    const rng = mulberry32(seedFrom('daily|' + date));
    const sc = 1 + Math.min(3, (state.stats.recent || 0) / 12); // gentle size scaling
    const crops = inSeasonCrops();
    const crop = crops[Math.floor(rng() * crops.length)] || 'turnip';
    const pay = () => 5 * Math.round((60 + rng() * 40 + Math.min(50, (state.stats.recent || 0) * 2)) / 5);
    const menu = [
      { kind: 'harvest', item: crop, need: Math.round(4 * sc) },
      { kind: 'water', need: Math.round(5 * sc) },
      { kind: 'orders', need: (state.stats.recent || 0) > 20 ? 2 : 1 },
    ];
    if (state.animals.length) {
      menu.push({ kind: 'feed', need: state.animals.length });
      menu.push({ kind: 'collect', need: Math.round(2 * sc) });
    }
    for (let i = menu.length - 1; i > 0; i--) { // seeded shuffle → 3 distinct kinds
      const j = Math.floor(rng() * (i + 1));
      [menu[i], menu[j]] = [menu[j], menu[i]];
    }
    const prev = state.daily || {};
    state.daily = {
      date,
      tasks: menu.slice(0, 3).map(t => Object.assign(t, { n: 0, reward: pay(), claimed: false })),
      streak: prev.streak || 0,
      lastClaimDate: prev.lastClaimDate || null,
    };
    // a skipped day already broke the streak — show the truth at rollover
    if (state.daily.lastClaimDate && state.daily.lastClaimDate !== date
      && state.daily.lastClaimDate !== dayBefore(date)) state.daily.streak = 0;
    return state.daily;
  }

  function ensureDaily() {
    if (!state.daily || state.daily.date !== todayLocal()) regenDaily(todayLocal());
  }

  // progress hook — called from harvest / water / fulfillOrder / feed / collect
  function dailyProgress(kind, item, n) {
    const d = state.daily;
    if (!d || state._offline) return;
    for (const t of d.tasks) {
      if (t.kind !== kind || t.claimed) continue;
      if (t.item && t.item !== item) continue;
      t.n = Math.min(t.need, (t.n || 0) + (n || 1));
    }
  }

  function dailyClaimable() {
    return state.daily ? state.daily.tasks.filter(t => !t.claimed && t.n >= t.need).length : 0;
  }

  function claimDaily(i) {
    const d = state.daily;
    const t = d && d.tasks[i];
    if (!t || t.claimed || t.n < t.need) return false;
    t.claimed = true;
    state.coins += t.reward;
    emit('sound', 'coin');
    toast(`✅ Daily task done: +${D.$(t.reward)}`, 'good');
    if (d.tasks.every(x => x.claimed)) {
      // full clear: the streak only continues off yesterday's full clear
      d.streak = d.lastClaimDate === dayBefore(d.date) ? (d.streak || 0) + 1 : 1;
      d.lastClaimDate = d.date;
      if (d.streak % 7 === 0) { // weekly jackpot, then the count keeps climbing
        const prize = inSeasonCrops().sort((a, b) => D.ITEMS[b].base - D.ITEMS[a].base)[0] || 'turnip';
        state.coins += 1200;
        state.inventory[prize] = (state.inventory[prize] || 0) + 3;
        toast(`🔥 ${d.streak}-day streak! Bonus: +${D.$(1200)} and 3 ${D.ITEMS[prize].name}!`, 'good');
      } else {
        toast(`🔥 All tasks cleared — streak: ${d.streak} day${d.streak > 1 ? 's' : ''}!`, 'good');
      }
      emit('sound', 'goal');
    }
    checkGoal();
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
  // Goals pay out in ANY order — one skipped goal (e.g. "complete 2 orders")
  // must never block credit for everything achieved after it.
  function goalsDoneList() {
    if (!state.goalsDone) state.goalsDone = D.GOALS.slice(0, state.goalIndex || 0).map(g => g.id);
    return state.goalsDone;
  }

  // Incomplete goals ranked by how close they are to done — so the chip always
  // surfaces the goal the player is about to finish and NEVER freezes on a goal
  // they're ignoring (the #1 playtest complaint). Tapping cycles to the next.
  function rankedGoals() {
    const done = goalsDoneList();
    return D.GOALS.filter(g => !done.includes(g.id))
      .map(g => { const [c, n] = g.check(state); return { g, prog: n > 0 ? Math.min(1, c / n) : 0 }; })
      .sort((a, b) => b.prog - a.prog || D.GOALS.indexOf(a.g) - D.GOALS.indexOf(b.g))
      .map(r => r.g);
  }

  function currentGoal() {
    const todo = rankedGoals();
    if (!todo.length) return null;
    return todo[(state.goalCursor || 0) % todo.length];
  }

  function cycleGoal() {
    const todo = rankedGoals();
    if (todo.length < 2) return;
    state.goalCursor = ((state.goalCursor || 0) + 1) % todo.length;
  }

  function checkGoal() {
    const done = goalsDoneList();
    let paid = false;
    for (const g of D.GOALS) {
      if (done.includes(g.id)) continue;
      const [cur, need] = g.check(state);
      if (cur >= need) {
        done.push(g.id);
        state.coins += g.reward;
        toast(`${g.icon} Goal complete: ${g.title}! +${D.$(g.reward)}`, 'good');
        emit('sound', 'goal');
        paid = true;
      }
    }
    state.goalIndex = done.length;
    if (paid) emit('goal');
  }

  // ---------------- season telegraphs ----------------
  // planted crops that will NOT survive the next season flip
  function atRiskCrops() {
    const next = (state.season + 1) % 4;
    const out = [];
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
      const c = state.tiles[y][x].crop;
      if (!c || c.dead) continue;
      if (D.CROPS[c.id].seasons.includes(next)) continue;
      if (greenhouseAt(x, y) || isBlessed(x, y)) continue;
      out.push({ x, y, id: c.id, ripe: c.prog >= 1, prog: c.prog });
    }
    return out;
  }

  function harvestAtRisk() { // one tap: bring in everything ripe on the risk list
    let n = 0;
    for (const e of atRiskCrops()) if (e.ripe) n += harvest(e.x, e.y, true);
    if (n) {
      toast(`🧺 Harvested ${n} crop${n > 1 ? 's' : ''} ahead of the season flip!`, 'good');
      emit('sound', 'harvest');
    }
    return n;
  }

  function digAtRisk() { // one tap: shovel out everything still at risk (50% seed refund)
    let n = 0;
    const before = state.coins;
    for (const e of atRiskCrops()) if (dig(e.x, e.y)) n++;
    if (n) {
      toast(`⛏️ Dug up ${n} at-risk crop${n > 1 ? 's' : ''} — ${D.$(state.coins - before)} in seed refunds.`, 'good');
      emit('sound', 'till');
    }
    return n;
  }

  // ---------------- daily events ----------------
  function newDay() {
    // recent production: exponentially decayed daily harvest+collect count
    // (order quantities scale with this, not lifetime wealth)
    const hc = state.stats.harvested + state.stats.collected;
    const today = Math.max(0, hc - (state.stats.prodMark || 0));
    state.stats.recent = Math.round(((state.stats.recent || 0) * 0.7 + today * 0.3) * 10) / 10;
    state.stats.prodMark = hc;

    state.day++;
    if (state.day > D.SEASON_DAYS) {
      state.day = 1;
      state.season = (state.season + 1) % 4;
      if (state.season === 0) state.year++;
      toast(`${D.SEASONS[state.season].emoji} ${D.SEASONS[state.season].name} has arrived!`);
      emit('season');
    }
    // dawn of the season's LAST day: warn about crops that won't make it
    if (state.day === D.SEASON_DAYS && !state._offline && state.now >= (state._flags.quietUntil || 0)) {
      const risk = atRiskCrops();
      if (risk.length) {
        emit('care', {
          n: risk.length,
          season: D.SEASONS[state.season].name,
          next: D.SEASONS[(state.season + 1) % 4].name,
        });
      }
    }
    state.weather = state.forecast;
    state.forecast = rollWeather(state.day === D.SEASON_DAYS ? (state.season + 1) % 4 : state.season);
    state._flags.crowDone = false;
    state._flags.frostDone = false;

    // auto-fuel: top the tank up from coins before the drones run, so an idle
    // player's automation never silently strands itself for want of $3 of diesel
    if (state.autoFuel && !state._offline) {
      const need = D.FUEL.dronePerDay * state.buildings.filter(b => b && b.type === 'drone').length + 1;
      if ((state.fuel || 0) < need && state.coins > state.market.fuelPrice * 5) buyFuel(5);
    }

    // drones harvest & replant first, THEN sprinklers water — so freshly
    // replanted crops don't spend their first day dry
    runDrones();
    for (const b of state.buildings) if (b && b.type === 'sprinkler') sprinkle(b);

    // auto-sell: liquidate surplus produce each dawn (keeps a buffer + never
    // touches mythics), so a hands-off player's barn turns into coins instead
    // of a hoard. Runs quietly; the coin counter is the feedback.
    if (state.autoSell && !state._offline) {
      let earned = 0;
      for (const [item, qty] of Object.entries(state.inventory)) {
        if (qty <= 0 || (D.ITEMS[item] && D.ITEMS[item].mythic)) continue;
        const keep = 4; // leave a little for orders & recipes
        if (qty > keep) earned += sellItem(item, qty - keep);
      }
      if (earned > 0) toast(`💰 Auto-sold surplus for ${D.$(Math.round(earned))}.`, 'good');
    }

    // teach selling: a hoarder can sit on a fortune in produce while feeling
    // broke. Nudge once when the barn is worth far more than the wallet.
    if (!state.autoSell && !state._flags.soldTip && !state._offline && state.now >= (state._flags.quietUntil || 0)) {
      let invVal = 0;
      for (const [it, q] of Object.entries(state.inventory)) invVal += (D.ITEMS[it] ? D.ITEMS[it].base : 0) * q;
      if (invVal > 2000 && invVal > state.coins * 2) {
        state._flags.soldTip = true;
        toast(`🧺 Your barn holds ~${D.$(invVal)} of goods — visit the ⚖️ Market to cash in (or turn on Auto-Sell in ⚙️ Menu).`);
      }
    }

    // hungry animals lose happiness; at rock bottom they fall sick
    // (half speed while away — an empty trough overnight isn't neglect)
    for (const a of state.animals) {
      if (state.now >= a.fedUntil) {
        a.happiness = clamp(a.happiness - (state._offline ? 6 : 12), 0, 100);
        if (a.happiness <= 0 && !a.sick && !state._offline) {
          a.sick = true;
          toast(`🤒 ${a.name} the ${D.ANIMALS[a.type].name.toLowerCase()} is sick from neglect — call the vet!`, 'bad');
        }
      }
    }

    // market drift + hot item + fuel price — crashed prices climb back toward
    // normal (+0.08/day below 0.6×), so a deep dump recovers in ~5-8 days
    for (const id of Object.keys(state.market.mults)) {
      const m = state.market.mults[id];
      state.market.mults[id] = clamp(m * (0.82 + rnd() * 0.36) + (m < 0.6 ? 0.08 : 0), 0.05, 1.6);
    }
    state.market.hot = pick(Object.keys(D.ITEMS).filter(id => !D.ITEMS[id].mythic));
    state.market.fuelPrice = Math.round(clamp(state.market.fuelPrice * (0.9 + rnd() * 0.2), D.FUEL.min, D.FUEL.max) * 10) / 10;

    // mid-season Market Day banner
    const md = marketDayItems();
    if (md.length && !state._offline) {
      const names = md.map(id => D.ITEMS[id].name);
      const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1] : names[0];
      toast(`🎪 Market Day! ${list} sell +50% today`, 'good');
    }

    // storms can flatten unprotected crops
    if (state.weather === 'storm' && !state._offline) {
      let smashed = 0;
      for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
        const t = state.tiles[y][x];
        if (t.crop && !t.crop.dead && !isProtected(x, y) && !isBlessed(x, y) && rnd() < 0.12 * eventMult()) {
          t.crop.dead = true; t.crop.deadCause = 'storm'; smashed++; state.stats.lost++;
          if (smashed <= 4) fx('lightning', x + .5, y + .5);
        }
      }
      if (smashed) toast(`⛈️ The storm destroyed ${smashed} crop${smashed > 1 ? 's' : ''}! Scarecrows protect nearby plots.`, 'bad');
    }
    if (state.weather === 'drought') toast('🔥 Heatwave! Crops dry out three times faster today.', 'bad');
    if (state.weather === 'rain') toast('🌧️ Rain today — no watering needed!');
  }

  function middayEvents() {
    // crows steal a mature crop on clear days if unprotected
    if ((state.weather === 'sun' || state.weather === 'cloud') && !state._offline && rnd() < 0.3 * eventMult()) {
      const targets = [];
      for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
        const t = state.tiles[y][x];
        if (t.crop && !t.crop.dead && t.crop.prog >= 1 && !isProtected(x, y) && !isBlessed(x, y)) targets.push([x, y]);
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
    // winter frost kills non-winter crops — greenhouse coverage spares its 6×6 zone
    if (state.season === 3 && !state._offline && rnd() < 0.4 * eventMult()) {
      let frozen = 0;
      for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
        const t = state.tiles[y][x];
        if (t.crop && !t.crop.dead && !D.CROPS[t.crop.id].seasons.includes(3) && !greenhouseAt(x, y) && !isBlessed(x, y)) {
          t.crop.dead = true;
          t.crop.deadCause = 'frost';
          frozen++;
          state.stats.lost++;
        }
      }
      if (frozen) toast(`❄️ Frost killed ${frozen} crop${frozen > 1 ? 's' : ''}! Only winter crops survive — or shelter plots under a Greenhouse.`, 'bad');
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
    // seconds of moisture per watering — tuned so ONE watering lasts well over a
    // full day (DAY_LEN=120), so you water ~once a day, not two-plus times.
    // Heatwaves still demand attention; winter holds moisture longest.
    const drain = state.weather === 'drought' ? 70 : (state.season === 3 ? 260 : 190);
    const wet = sprinkledCells(); // tiles under a sprinkler stay watered every tick
    const deaths = state._flags.deaths;
    // offline: moisture holds and nothing wilts or rots — growth still runs, so
    // crops finish and wait. A rescue window after an away season-flip pauses
    // wilt the same way until the player has had time to react.
    const rescued = state.now < (state._flags.rescueUntil || 0);
    const bless = blessedRects(); // toni parcels, computed once per tick — null on ordinary farms

    // glowing seedlings reveal after their day in the ground
    if (state.sprouts && state.sprouts.length)
      for (let i = state.sprouts.length - 1; i >= 0; i--)
        if (state.now >= state.sprouts[i].at) revealSprout(i);

    // crops: growth, thirst, wilting, rot
    for (let ty = 0; ty < WH; ty++) for (let tx = 0; tx < WW; tx++) {
      const c = state.tiles[ty][tx].crop;
      if (!c || c.dead) continue;
      let bl = false;
      if (bless) for (const p of bless) if (tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h) { bl = true; break; }
      if (bl) { c.water = 1; c.wilt = 0; c.rot = 0; } // the blessing: never dry, never failing
      const off = !seasonOK(c.id, tx, ty);
      if (raining || (wet && wet.has(tx + ',' + ty))) c.water = 1; // rain or a sprinkler keeps it wet
      else if (!state._offline && !bl) c.water = Math.max(0, c.water - dt / drain);

      // wilting: dry crops and out-of-season crops decline; watered ones recover
      let wilting = false;
      if (!state._offline && !rescued) {
        if (off) { c.wilt = (c.wilt || 0) + dt / (0.8 * D.DAY_LEN); wilting = true; }
        else if (c.water <= 0) { c.wilt = (c.wilt || 0) + dt / ((diff().wiltDays || D.WILT_DAYS) * D.DAY_LEN); wilting = true; }
      }
      if (!wilting && c.wilt > 0) c.wilt = Math.max(0, c.wilt - dt / D.DAY_LEN);
      if (c.wilt >= 1) {
        c.dead = true;
        c.deadCause = off ? 'season' : 'thirst';
        state.stats.lost++;
        deaths[off ? 'season' : 'dry']++;
        continue;
      }

      if (c.prog >= 1) {
        if (c.toni) { // the seed was never a turnip at all — she rises now
          if (state.tonis.length) delete c.toni; // …unless one already stands: only one, ever
          else {
            state.tiles[ty][tx].crop = null;
            const tn = addToni(tx, ty);
            tn.rise = state.now;
            fx('toni', tx + .5, ty + .5);
            continue;
          }
        }
        if (bl) { toniAutoHarvest(tx, ty); continue; } // ripe blessed crops bank themselves
        // your standing order: auto-harvest brings ripe crops in the moment they're ready
        if (state.autoHarvest && !state._offline) { harvest(tx, ty); continue; }
        // ripe crops rot if you leave them standing (never while away)
        if (!state._offline) {
          c.rot = (c.rot || 0) + dt / (D.ROT_DAYS * D.DAY_LEN);
          if (c.rot >= 1) { c.dead = true; c.deadCause = 'rot'; state.stats.lost++; deaths.rot++; }
        }
      } else if ((c.water > 0 || state._offline) && !off) {
        const def = D.CROPS[c.id];
        const growTime = c.regrown && def.regrow ? def.regrow : def.grow;
        const speed = (c.fert || bl) ? 1.25 : 1; // blessed soil grows with love
        c.prog = Math.min(1, c.prog + (dt * speed) / growTime);
      }
    }

    // surface aggregated crop deaths every few seconds
    state._flags.deathTimer = (state._flags.deathTimer || 0) + dt;
    if (state._flags.deathTimer > 5) {
      state._flags.deathTimer = 0;
      if (!state._offline && state.now >= (state._flags.quietUntil || 0)) flushDeaths();
    }

    // animals produce while fed and healthy
    for (const a of state.animals) {
      if (!a.sick && state.now < a.fedUntil && a.prodProg < 1) {
        const speed = 0.75 + (a.happiness / 100) * 0.5; // 0.75x .. 1.25x
        a.prodProg = Math.min(1, a.prodProg + (dt * speed) / D.ANIMALS[a.type].prodTime);
      }
    }

    // craft lanes: only `slots` jobs per building tick down (legacy jobs always run)
    for (const b of state.buildings) {
      if (!b || !b.queue || !b.queue.length) continue;
      for (const job of runningJobs(b)) job.left -= dt;
    }

    // expired orders quietly leave the board (no penalty) and refresh
    if (state.orders.length) {
      let expired = 0;
      for (let i = state.orders.length - 1; i >= 0; i--) {
        const o = state.orders[i];
        if (o.expires != null && state.now >= o.expires) { state.orders.splice(i, 1); expired++; }
      }
      if (expired) {
        // no toast: a player ignoring the board racked up 67–96 "expired" toasts
        // per run — pure failure-spam. Orders refresh silently; the board badge tells the story.
        state.orderTimer = Math.min(state.orderTimer, 8);
        emit('orders');
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

    // daily tasks follow the real-world local date (~1×/sec rollover check)
    state._flags.dailyTimer = (state._flags.dailyTimer || 0) + dt;
    if (state._flags.dailyTimer >= 1) {
      state._flags.dailyTimer = 0;
      ensureDaily();
    }

    // one-shot notices deferred from load (UI listeners weren't attached yet)
    if (state._flags.pendingToast && !state._offline && state.now >= (state._flags.quietUntil || 0)) {
      const msg = state._flags.pendingToast;
      delete state._flags.pendingToast;
      toast(msg, 'good');
    }

    // one gentle backup reminder per session, never during the digest window
    if (!backupNudged && !state._offline && state.now >= (state._flags.quietUntil || 0) && backupDue()) {
      backupNudged = true;
      toast('💾 It\'s been a while — save a farm backup code from the ⚙️ Menu.');
    }
  }

  // ---------------- derived info for UI ----------------
  function farmValue() {
    if (!state) return 0;
    let v = state.coins + state.fuel * (state.market.fuelPrice || 3.4);
    for (const [item, qty] of Object.entries(state.inventory)) v += D.ITEMS[item].base * qty;
    for (const b of state.buildings) if (b) v += D.BUILDINGS[b.type].cost;
    for (const a of state.animals) v += D.ANIMALS[a.type].cost;
    for (const i of state.unlockedParcels) v += parcels()[i].cost;
    return Math.round(v);
  }

  function ownsPoweredGear() {
    return state.till.tier > 0 || hasBuilding('drone');
  }

  return {
    get state() { return state; },
    on, emit, toast,
    newGame, applySetup, load, save, resetGame, fastForward,
    startNewLegacy, canPrestige, legacyStars,
    ownedFarms, switchFarm, buyFarm, ownsTemplate,
    exportCode, importCode, backupDue,
    workOddJobs, oddJobsAvailable, oddJobsPay,
    tick,
    // world queries
    tileAt, parcelAt, isUnlocked, hasBuilding, isProtected, seasonOK, greenhouseAt,
    spawnToni, toniAt, isBlessed, harvestToni, plantToniSeed, sproutAt, devToniDemo,
    buildingsOf, animalsIn, readyIn, feedCostFor, canCraft, canFulfill,
    currentGoal, cycleGoal, sellPrice, fuelPrice, availableItems, farmValue, ownsPoweredGear,
    atRiskCrops, runningJobs, orderRush, marketDayItems,
    todayLocal, regenDaily, claimDaily, dailyClaimable,
    // actions
    smartAction, applyTool, till, plant, plantAll, tilledEmptyCount, water, fertilize, harvest, clearDead, dig, refillCan,
    harvestAtRisk, digAtRisk,
    canPlaceBuilding, placeBuilding, sellBuilding, buyParcel,
    buyAnimal, sellAnimal, vetAnimal, feedAnimal, feedAll, collectBuilding, grindGrain,
    startRecipe, collectRecipes, buySlot,
    sellItem, fulfillOrder, skipOrder,
    buyCanTier, buyTillTier, buyFuel,
    addXp, checkGoal,
  };
})();
