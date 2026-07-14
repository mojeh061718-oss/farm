/* ============ Harvest Empire — UI, input & sound ============ */
'use strict';

const UI = (() => {
  const D = DATA;
  const $ = id => document.getElementById(id);
  const $$ = D.$; // money formatter
  const I = window.Icons;
  const REDUCED = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const fmt = n => Math.round(n).toLocaleString();
  // escape user-entered text before it goes through innerHTML (farm names!)
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // gold coin-chip price button (tabindex -1: the card/row is the tap target)
  const chip = (cost, extra) => `<button class="buy${extra ? ' ' + extra : ''}" tabindex="-1">${I.icon('coin')}<span>${fmt(cost)}</span></button>`;
  // idempotent innerHTML writer (renderSheet & updateHud rerun constantly)
  function setIcon(el, html) { if (el._ih !== html) { el._ih = html; el.innerHTML = html; } }

  let seed = 'turnip';          // last seed picked (selected card in the seed sheet)
  let buildType = null;         // building being placed
  let placedCount = 0;          // buildings dropped in the current keep-placing session
  let sheetOpen = null;         // current sheet id
  let sheetTab = null;

  /* ---------------- sound: three synth voices, one pentatonic scale ----------------
     Graphics 2.0 Phase 3 (animation.md §6). Every pitched sound sits in
     C-major pentatonic so overlapping actions harmonize instead of clashing.
     Voices: PLUCK (UI/positive — triangle + quiet octave sine, ±15 cents),
     THOCK (physical impacts — lowpassed noise burst + pitch-bent low triangle),
     CHIME (rewards — staggered sine partials f/1.5f/2f with long tails).
     Everything routes through one master gain → compressor (one mute point,
     no clipping when drag-harvesting). Consecutive plants/harvests inside
     800ms climb the scale (combo ladder, cap +5). */
  let actx = null, master = null, noiseBuf = null;
  function audioCtx() {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = actx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 8;
      master = actx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      comp.connect(actx.destination);
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  const soundOn = () => Game.state && Game.state.settings.sound;

  // C-major pentatonic: octave 4 = C4 D4 E4 G4 A4; deg walks up the scale
  const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0];
  function pent(oct, deg) {
    const o = oct + Math.floor(deg / 5);
    return PENTA[((deg % 5) + 5) % 5] * Math.pow(2, o - 4);
  }
  // combo ladder: consecutive same-verb actions within 800ms step up (cap +5)
  const combos = { plant: { at: 0, n: 0 }, harvest: { at: 0, n: 0 } };
  function combo(verb) {
    const c = combos[verb], now = performance.now();
    c.n = now - c.at < 800 ? Math.min(c.n + 1, 5) : 0;
    c.at = now;
    return c.n;
  }

  function tone(f, dur, type, vol, delay, bend, cents) {
    if (!soundOn()) return;
    try {
      const a = audioCtx();
      const t0 = a.currentTime + (delay || 0);
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type || 'sine';
      if (cents) f *= Math.pow(2, ((Math.random() * 2 - 1) * cents) / 1200);
      o.frequency.setValueAtTime(f, t0);
      if (bend) o.frequency.exponentialRampToValueAtTime(bend, t0 + dur);
      g.gain.setValueAtTime(vol || 0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  // filtered noise burst — body of the thock, rain, thunder
  function noise(dur, vol, delay, fType, f0, f1, q) {
    if (!soundOn()) return;
    try {
      const a = audioCtx();
      const t0 = a.currentTime + (delay || 0);
      const n = a.createBufferSource();
      n.buffer = noiseBuf;
      n.loop = dur > 0.45;
      const flt = a.createBiquadFilter();
      flt.type = fType || 'lowpass';
      flt.frequency.setValueAtTime(f0 || 900, t0);
      if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      if (q) flt.Q.value = q;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      n.connect(flt).connect(g).connect(master);
      n.start(t0);
      n.stop(t0 + dur + 0.05);
    } catch (e) {}
  }
  const pluck = (f, vol, delay) => {
    tone(f, 0.1, 'triangle', (vol || 1) * 0.14, delay, 0, 15);
    tone(f * 2, 0.13, 'sine', (vol || 1) * 0.07, (delay || 0) + 0.03, 0, 15);
  };
  const thock = (vol, delay) => {
    noise(0.09, (vol || 1) * 0.4, delay, 'lowpass', 900);
    tone(120, 0.1, 'triangle', (vol || 1) * 0.3, delay, 70);
  };
  const chime = (f, vol, delay) => {
    const v = vol || 1, d = delay || 0;
    tone(f, 0.18, 'sine', 0.1 * v, d);
    tone(f * 1.5, 0.26, 'sine', 0.06 * v, d + 0.05);
    tone(f * 2, 0.34, 'sine', 0.04 * v, d + 0.1);
  };
  const wood = delay => { // hammer knock (fence builds itself)
    noise(0.05, 0.22, delay, 'bandpass', 1700, 0, 2.5);
    tone(pent(4, (Math.random() * 3) | 0), 0.05, 'triangle', 0.1, delay, 0, 20);
  };

  const SOUNDS = {
    tap:     () => pluck(pent(5, 2), 0.45),                       // E5
    till:    () => thock(1),
    plant:   () => { const c = combo('plant'); pluck(pent(5, 1 + c), 0.8); }, // D5 ↑ ladder
    water:   () => {                                              // the pour, not a beep
      noise(0.3, 0.13, 0, 'bandpass', 1600, 700, 1.4);
      tone(700 + Math.random() * 200, 0.07, 'sine', 0.05, 0.12);
      tone(750 + Math.random() * 200, 0.06, 'sine', 0.04, 0.22);
    },
    harvest: () => thock(1, 0.08),                                // impact lands with the pop (t=80ms)
    chime:   () => { const c = combo('harvest'); chime(pent(5, 2 + c)); },    // flier arrival, E5 ↑ ladder
    chime2:  () => { const c = combos.harvest.n; chime(pent(5, 2 + c) * 1.5, 0.6); }, // double: a fifth up
    ripe:    () => chime(pent(5, 3), 0.4),                        // G5, soft — a crop just matured
    coin:    () => { chime(pent(6, 0), 0.8); chime(pent(6, 2), 0.5, 0.06); }, // C6 + E6
    build:   () => { thock(0.9); pluck(pent(4, 3), 0.8, 0.12); },
    hammer:  () => wood(),
    error:   () => tone(140, 0.18, 'sawtooth', 0.06),
    goal:    () => [0, 2, 3].forEach((d, i) => chime(pent(5, d), 0.85, i * 0.09)),    // C5 E5 G5
    levelup: () => [0, 2, 3, 5].forEach((d, i) => { pluck(pent(5, d), 1, i * 0.11); chime(pent(5, d), 0.5, i * 0.11 + 0.02); }),
    toni:    () => [0, 2, 4, 5, 7].forEach((d, i) => { chime(pent(5, d), 0.8, i * 0.16); pluck(pent(4, d), 0.45, i * 0.16); }), // a slow rising golden run
    huh:     () => { pluck(pent(4, 1), 0.5); pluck(pent(4, 3), 0.55, 0.14); }, // a curious two-note "hm?"

    thunder: () => noise(1.2, 0.28, 0, 'lowpass', 220, 90),
    squawk:  () => { tone(880, 0.06, 'square', 0.05, 0, 640); tone(740, 0.07, 'square', 0.04, 0.07, 500); },
  };

  // light weather ambience: one looping noise voice, gain-crossfaded by weather
  let ambSrc = null, ambGain = null, ambFilter = null;
  function updateAmbience() {
    if (!actx || !master) return;         // starts only after the first user-gesture sound
    const w = Game.state ? Game.state.weather : 'sun';
    const target = !soundOn() ? 0 : w === 'storm' ? 0.05 : w === 'rain' ? 0.032 : 0;
    if (target > 0 && !ambSrc) {
      try {
        ambSrc = actx.createBufferSource();
        ambSrc.buffer = noiseBuf;
        ambSrc.loop = true;
        ambFilter = actx.createBiquadFilter();
        ambFilter.type = 'bandpass';
        ambFilter.frequency.value = 1400;
        ambFilter.Q.value = 0.6;
        ambGain = actx.createGain();
        ambGain.gain.value = 0;
        ambSrc.connect(ambFilter).connect(ambGain).connect(master);
        ambSrc.start();
      } catch (e) { ambSrc = null; }
    }
    if (ambGain) {
      try { ambGain.gain.setTargetAtTime(target, actx.currentTime, 0.8); } catch (e) {}
    }
  }

  // ---------------- toasts / modal ----------------
  const toastLog = []; // ring buffer of the last 50 messages (read from Menu)
  const pendingToasts = []; // queued while a sheet is open (flushed on close)

  const sheetShowing = () => !!sheetOpen && !$('sheet').classList.contains('hidden');

  function toast(msg, kind) {
    toastLog.push({ msg, kind: kind || 'info', day: Game.state ? Game.state.day : 0, at: Date.now() });
    if (toastLog.length > 50) toastLog.shift();
    // sheets own the top of the screen: park non-urgent toasts until close
    if (kind !== 'bad' && sheetShowing()) {
      pendingToasts.push({ msg, kind });
      if (pendingToasts.length > 4) pendingToasts.shift();
      return;
    }
    presentToast(msg, kind);
  }

  function flushToasts() {
    const queued = pendingToasts.splice(0);
    queued.forEach((t, i) => setTimeout(() => {
      if (sheetShowing()) { pendingToasts.push(t); return; } // a sheet reopened mid-flush
      presentToast(t.msg, t.kind);
    }, 120 + i * 280));
  }

  function presentToast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    const plate = kind === 'good' ? 'check' : kind === 'bad' ? 'bang' : 'info';
    el.innerHTML = `<span class="t-plate">${I.icon(plate)}</span><span class="t-msg"></span>`;
    el.querySelector('.t-msg').textContent = msg;

    const dismiss = () => {
      if (el._dead) return;
      el._dead = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    };
    el.addEventListener('pointerdown', dismiss); // tap-to-dismiss
    el._dismiss = dismiss;

    const box = $('toasts');
    box.appendChild(el);
    // stack limit 3: dismiss the oldest gracefully, compress the rest upward
    const live = [...box.children].filter(t => !t._dead);
    while (live.length > 3) { const o = live.shift(); if (o._dismiss) o._dismiss(); }
    const alive = [...box.children].filter(t => !t._dead);
    alive.forEach((t, i) => t.classList.toggle('old', i < alive.length - 1));

    // reading-rate lifetime
    setTimeout(dismiss, Math.max(3500, 2000 + 60 * msg.length));
    if (kind === 'bad') SOUNDS.error();
  }

  function confirmBox(icon, text, yesLabel, cb) {
    $('modal-no').style.display = ''; // showAwaySummary hides it; never leak into the next dialog
    $('modal-icon').textContent = icon;
    $('modal-text').textContent = text;
    $('modal-yes').textContent = yesLabel || 'OK';
    $('modal-backdrop').classList.remove('hidden');
    $('modal-yes').onclick = () => { $('modal-backdrop').classList.add('hidden'); cb && cb(); };
    $('modal-no').onclick = () => $('modal-backdrop').classList.add('hidden');
  }

  // ---------------- motion FX (WAAPI + rAF; respects reduced motion) ----------------
  let coinShown = null, coinTarget = null, coinRaf = null;

  // eased tick-up on gains; instant on spends (spending must feel exact)
  // (writes both the HUD pill and the sheet wallet footer)
  function writeCoins(v) {
    const s = v.toLocaleString();
    $('coins').textContent = s;
    $('wallet-coins').textContent = s;
  }
  function setCoins(v) {
    if (v === coinTarget) return;
    coinTarget = v;
    if (coinRaf) { cancelAnimationFrame(coinRaf); coinRaf = null; }
    if (coinShown === null || v <= coinShown || v - coinShown < 20 || REDUCED.matches) {
      coinShown = v;
      writeCoins(v);
      return;
    }
    const from = coinShown, t0 = performance.now(), dur = 600;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      coinShown = Math.round(from + (v - from) * e);
      writeCoins(coinShown);
      coinRaf = t < 1 ? requestAnimationFrame(step) : null;
    };
    coinRaf = requestAnimationFrame(step);
  }

  function pulseCoinsPill() {
    // pulse whichever wallet the player is looking at (footer while a sheet is open)
    const p = sheetShowing() ? $('wallet-coin-chip') : $('pill-coins');
    p.classList.remove('pop');
    void p.offsetWidth;
    p.classList.add('pop');
  }

  // 3–5 coin clones arc from the purchase/sale point to the coins pill —
  // or to the sheet's wallet footer while one is open (it's the visible wallet)
  function coinFlight(src) {
    if (!src) { pulseCoinsPill(); return; }
    if (REDUCED.matches) { pulseCoinsPill(); return; }
    const r = src.getBoundingClientRect ? src.getBoundingClientRect() : src;
    const dst = (sheetShowing() ? $('wallet-coin-chip') : $('pill-coins')).getBoundingClientRect();
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const x1 = dst.left + dst.width * 0.32, y1 = dst.top + dst.height / 2;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'fx-coin';
      c.innerHTML = I.icon('coin');
      document.body.appendChild(c);
      const mx = (x0 + x1) / 2 + (Math.random() * 90 - 45);
      const my = Math.min(y0, y1) - 55 - Math.random() * 55;
      const anim = c.animate([
        { transform: `translate(${x0 - 10 + (Math.random() * 26 - 13)}px, ${y0 - 10}px) scale(.7)`, opacity: 1 },
        { transform: `translate(${mx - 10}px, ${my - 10}px) scale(1.05)`, opacity: 1, offset: .55 },
        { transform: `translate(${x1 - 10}px, ${y1 - 10}px) scale(.45)`, opacity: .9 },
      ], { duration: 520, delay: i * 45, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'backwards' });
      anim.onfinish = () => { c.remove(); pulseCoinsPill(); };
    }
  }

  // harvest flier landed on the market button: badge squash-pop + chime
  function fxArrive(gold) {
    if (gold) SOUNDS.chime2(); else SOUNDS.chime();
    const btn = $('btn-market');
    if (btn && !REDUCED.matches) {
      btn.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.28)', offset: 0.35 },
        { transform: 'scale(1)' },
      ], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
  }

  // goal complete: check stamp → chip pulse → reward flies to wallet → next goal slides in
  function celebrateGoal(chipEl) {
    SOUNDS.goal();
    if (REDUCED.matches) { pulseCoinsPill(); return; }
    chipEl.classList.remove('celebrate');
    void chipEl.offsetWidth;
    chipEl.classList.add('celebrate');
    const r = chipEl.getBoundingClientRect();
    const stamp = document.createElement('div');
    stamp.className = 'goal-stamp';
    stamp.innerHTML = I.icon('check');
    stamp.style.left = (r.right - 26) + 'px';
    stamp.style.top = (r.top - 8) + 'px';
    document.body.appendChild(stamp);
    setTimeout(() => stamp.remove(), 850);
    setTimeout(() => coinFlight(r), 320);
    setTimeout(() => chipEl.classList.remove('celebrate'), 1000);
  }

  // ---------------- HUD ----------------
  function updateHud() {
    const s = Game.state;
    setCoins(s.coins);
    $('level').textContent = s.level;
    $('xpfill').style.width = Math.min(100, (s.xp / D.xpForLevel(s.level)) * 100) + '%';
    setIcon($('season-emoji'), I.season(s.season));
    $('day-label').textContent = 'D' + s.day + '/' + D.SEASON_DAYS; // season progress at a glance
    setIcon($('weather-emoji'), I.weather(s.weather));
    setIcon($('forecast'), '→' + I.weather(s.forecast));
    $('dayfill').style.width = (s.t * 100) + '%';

    // fuel gauge appears once you own powered equipment
    const showFuel = Game.ownsPoweredGear() || s.fuel > 0;
    $('pill-fuel').classList.toggle('hidden', !showFuel);
    if (showFuel) {
      $('fuel-amount').textContent = s.fuel.toFixed(1);
      $('pill-fuel').classList.toggle('fuel-low', s.fuel < 1);
    }
    // sheet wallet footer mirrors the wallet (fuel only when owned)
    $('wallet-fuel').classList.toggle('hidden', !showFuel);
    if (showFuel) $('wallet-fuel-amt').textContent = s.fuel.toFixed(1);

    // orders badge counts deliverable orders + claimable daily tasks
    const fulfillable = s.orders.filter(o => Game.canFulfill(o)).length + Game.dailyClaimable();
    $('orders-badge').classList.toggle('hidden', fulfillable === 0);
    $('orders-badge').textContent = fulfillable;

    // distinct sellable item TYPES (unit counts pinned the badge at 99+)
    const invTypes = Object.keys(s.inventory).filter(k => s.inventory[k] > 0).length;
    $('market-badge').classList.toggle('hidden', invTypes === 0);
    $('market-badge').textContent = invTypes > 99 ? '99+' : invTypes;

    $('menu-badge').classList.toggle('hidden', !Game.backupDue()); // backup nudge dot

    updateGoalChip();
  }

  let lastGoalsDone = null;
  function updateGoalChip() {
    const g = Game.currentGoal();
    const chipEl = $('goal-chip');
    if (!g) { chipEl.classList.add('hidden'); lastGoalsDone = null; return; }
    const wasVisible = !chipEl.classList.contains('hidden');
    chipEl.classList.remove('hidden');
    // celebrate only on a real completion — never when the chip merely cycles
    const doneN = (Game.state.goalsDone || []).length;
    if (wasVisible && lastGoalsDone != null && doneN > lastGoalsDone) celebrateGoal(chipEl);
    lastGoalsDone = doneN;
    const [cur, need] = g.check(Game.state);
    setIcon($('goal-icon'), I.fromEmoji(g.icon));
    $('goal-title').textContent = g.title;
    $('goal-progress').textContent = Math.min(cur, need) + ' / ' + need;
    setIcon($('goal-reward'), I.icon('coin') + '<span>+' + fmt(g.reward) + '</span>');
  }

  // ---------------- sheet framework ----------------
  let sheetHideTimer = null;
  // Stable-geometry guards: the sheet is bottom-anchored, so content that
  // shrinks mid-session slides every button down under the user's finger
  // (rapid "Sell 1" taps used to land on "Sell everything"!).
  let sheetLockH = 0;       // tallest body height this session — sheet never shrinks while open
  let marketList = null;    // market row order + membership frozen per open
  let orderSeen = null;     // orders rendered this session (Map id → snapshot)
  let orderGone = null;     // ids that left the board this session (id → reason)
  let sheetHeld = 0;        // pointers currently down inside the sheet
  let renderQueued = false; // an auto-refresh arrived while a finger was down

  function resetSheetSession() {
    sheetLockH = 0;
    $('sheet-body').style.minHeight = '';
    marketList = null;
    orderSeen = null;
    orderGone = null;
  }

  function openSheet(id, tab) {
    sheetOpen = id;
    sheetTab = tab || null;
    if (sheetHideTimer) { clearTimeout(sheetHideTimer); sheetHideTimer = null; }
    resetSheetSession();
    $('sheet').classList.remove('closing');
    $('sheet-backdrop').classList.remove('closing');
    $('sheet').classList.remove('hidden');
    $('sheet-backdrop').classList.remove('hidden');
    renderSheet();
  }

  function closeSheet() {
    sheetOpen = null;
    const sh = $('sheet'), bd = $('sheet-backdrop');
    if (sh.classList.contains('hidden') || sheetHideTimer) return;
    sh.classList.add('closing');
    bd.classList.add('closing');
    sheetHideTimer = setTimeout(() => {
      sheetHideTimer = null;
      sh.classList.add('hidden');
      bd.classList.add('hidden');
      sh.classList.remove('closing');
      bd.classList.remove('closing');
    }, 225);
    flushToasts(); // messages parked while the sheet was up
    if (pendingLevelUp != null) { // deferred level-up splash lands now
      const lvl = pendingLevelUp;
      pendingLevelUp = null;
      setTimeout(() => showLevelUp(lvl), 260);
    }
  }

  // sheet header: icon plate + title + one-line promise
  function setSheetHeader(iconHtml, title, sub) {
    const badge = $('sheet-badge');
    setIcon(badge, iconHtml || '');
    badge.classList.toggle('on', !!iconHtml);
    $('sheet-title').textContent = title;
    $('sheet-sub').textContent = sub || '';
  }

  // right-edge fade on the tab bar while more tabs hide off-screen
  function updateTabFade() {
    const bar = $('sheet-tabs');
    const more = bar.scrollWidth - bar.clientWidth - bar.scrollLeft > 4;
    bar.classList.toggle('fade-r', more);
  }

  function setTabs(tabs, active) {
    const bar = $('sheet-tabs');
    if (!tabs) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    bar.classList.remove('hidden');
    bar.innerHTML = '';
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = 'sheet-tab' + (t.id === active ? ' active' : '');
      b.innerHTML = (t.icon || '') + '<span></span>';
      b.lastChild.textContent = t.label;
      b.onclick = () => { SOUNDS.tap(); sheetTab = t.id; resetSheetSession(); renderSheet(); };
      bar.appendChild(b);
    }
    requestAnimationFrame(updateTabFade); // after layout
  }

  function renderSheet() {
    if (!sheetOpen) return;
    const body = $('sheet-body');
    body.innerHTML = '';
    if (sheetOpen === 'seeds') renderSeeds(body);
    else if (sheetOpen === 'shop') renderShop(body);
    else if (sheetOpen === 'market') renderMarket(body);
    else if (sheetOpen === 'orders') renderOrders(body);
    else if (sheetOpen === 'menu') renderMenu(body);
    else if (sheetOpen === 'log') renderLog(body);
    else if (sheetOpen === 'care') renderCare(body);
    else if (sheetOpen === 'compendium') renderCompendium(body);
    else if (sheetOpen === 'realtor') renderRealtor(body);
    else if (sheetOpen === 'farmhands') renderFarmhands(body);
    else if (sheetOpen.startsWith('b:')) renderBuilding(body, parseInt(sheetOpen.slice(2), 10));
    // freeze the tallest height seen this session: a bottom-anchored sheet that
    // shrinks slides its buttons downward mid-tap (the sell-everything trap)
    if (sheetOpen) {
      const h = body.clientHeight;
      if (h > sheetLockH) sheetLockH = h;
      if (sheetLockH) body.style.minHeight = sheetLockH + 'px';
    }
  }

  // ---------------- seeds sheet ----------------
  let plantTarget = null; // tile to plant immediately on pick
  let plantAllMode = false; // when on, a seed tap fills EVERY empty tilled plot
  function renderSeeds(body) {
    setSheetHeader(I.icon('sprout'), 'Choose a seed', 'Right season + steady water = happy crops');
    setTabs(null);
    plantAllMode = false; // fresh each open — mass-planting is always a deliberate toggle
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.style.padding = '0 6px 10px';
    note.textContent = 'Dry crops wilt and die; ripe ones rot if left standing.';
    body.appendChild(note);

    // quick multi-plant: fill every empty tilled plot at once with one crop
    const nTilled = Game.tilledEmptyCount();
    if (nTilled >= 2) {
      const fill = document.createElement('button');
      fill.className = 'seed-fill-toggle';
      fill.innerHTML = `🌾 Plant all tilled plots <b>(${nTilled})</b>`;
      fill.onclick = () => {
        plantAllMode = !plantAllMode;
        fill.classList.toggle('on', plantAllMode);
        SOUNDS.tap();
        note.textContent = plantAllMode
          ? `Now tap a seed to fill all ${nTilled} empty plots (in season, while your cash lasts).`
          : 'Dry crops wilt and die; ripe ones rot if left standing.';
      };
      body.appendChild(fill);
    }

    const grid = document.createElement('div');
    grid.className = 'card-grid';
    const s = Game.state;

    // the Glowing Seed: a mythic card above the ordinary seeds when one is held
    if ((s.inventory.toni_seed || 0) > 0) {
      const card = document.createElement('div');
      card.className = 'item-card mythic-card' + (seed === 'toni_seed' ? ' selected' : '');
      card.innerHTML = `
        <span class="lock-tag mythic-tag">mythic</span>
        <span class="plate">${I.item('toni_seed')}</span>
        <div class="name">Glowing Seed</div>
        <div class="sub">×${s.inventory.toni_seed} · plant it in tilled soil, give it a day… and hope</div>
        <span class="mythic-price">beyond price</span>`;
      card.onclick = () => {
        seed = 'toni_seed';
        SOUNDS.tap();
        let sown = false;
        if (plantTarget) {
          sown = !!Game.plantToniSeed(plantTarget.x, plantTarget.y);
          if (sown) SOUNDS.plant();
          plantTarget = null;
        }
        closeSheet();
        toast(sown ? '🌟 The Glowing Seed is in the ground — give it a day…'
          : '🌟 Tap a tilled plot and choose Plant to sow the Glowing Seed.');
      };
      grid.appendChild(card);
    }
    // seconds left in the current season (days remaining + the rest of today)
    const seasonLeft = ((D.SEASON_DAYS - s.day) + (1 - s.t)) * D.DAY_LEN;
    const nextSeason = (s.season + 1) % 4;
    const entries = Object.entries(D.CROPS).sort((a, b) => a[1].seed - b[1].seed);
    for (const [id, c] of entries) {
      const item = D.ITEMS[id];
      const off = !Game.seasonOK(id);
      // naturally in season but too slow to ripen before a flip it can't survive
      // (greenhouse-covered plots don't care about the flip, so skip those cases)
      const wontRipen = c.seasons.includes(s.season) && !c.seasons.includes(nextSeason) && c.grow > seasonLeft;
      const card = document.createElement('div');
      card.className = 'item-card' + (off ? ' off-season' : '') + (seed === id ? ' selected' : '');
      card.innerHTML = `
        <span class="season-tag">${c.seasons.map(i => I.season(i)).join('')}</span>
        ${off ? '<span class="lock-tag warn">off-season</span>'
          : wontRipen ? '<span class="lock-tag amber">⚠️ won’t ripen</span>'
          : seed === id ? `<span class="owned-tick">${I.icon('check')}</span>`
          : c.regrow ? '<span class="lock-tag regrow">regrows</span>' : ''}
        <span class="plate">${I.item(id)}</span>
        <div class="name">${item.name}</div>
        <div class="sub">${c.grow}s${c.regrow ? ' · then ' + c.regrow + 's' : ''} · sells ~${$$(item.base)}</div>
        ${chip(c.seed, off ? 'muted' : '')}`;
      card.onclick = () => {
        seed = id;
        SOUNDS.tap();
        if (off) {
          // warn and select, but never auto-spend the seed money on a doomed plant
          toast(`⚠️ ${item.name} grows in ${c.seasons.map(i => D.SEASONS[i].name).join(' & ')} — planting now wastes the seed money!`, 'bad');
          plantTarget = null;
          closeSheet(); updateHud(); return;
        }
        if (plantAllMode) { // fill every empty tilled plot at once
          const r = Game.plantAll(id);
          if (r.planted > 0) SOUNDS.plant();
          closeSheet();
          toast(r.planted > 0
            ? `${item.emoji} Planted ${r.planted} ${item.name}${r.broke ? ' — out of cash for the rest' : ''}!`
            : 'No empty plots to fill right now.', r.planted > 0 ? 'good' : 'bad');
          updateHud(); return;
        }
        let sown = false;
        if (plantTarget) {
          sown = !!Game.plant(plantTarget.x, plantTarget.y, id);
          if (sown) SOUNDS.plant();
          plantTarget = null;
        }
        closeSheet();
        if (sown) toast(`${item.emoji} ${item.name} planted!`);
        updateHud();
      };
      grid.appendChild(card);
    }
    body.appendChild(grid);

    // when opened by tapping a bare plot, offer to un-till it right here —
    // un-tilling is a deliberate choice, so it lives inside this chooser
    if (plantTarget) {
      const pt = plantTarget;
      const untill = document.createElement('button');
      untill.className = 'seed-untill';
      untill.innerHTML = `${I.icon('shovel')} Un-till this plot`;
      untill.onclick = () => { SOUNDS.tap(); Game.applyTool('shovel', pt.x, pt.y); plantTarget = null; closeSheet(); updateHud(); };
      body.appendChild(untill);
    }
  }

  // ---------------- shop ----------------
  function renderShop(body) {
    setSheetHeader(I.icon('shop'), 'Shop', "Everything's for sale from day one");
    const tabs = [
      { id: 'build', label: 'Buildings', icon: I.icon('house') },
      { id: 'animals', label: 'Animals', icon: I.icon('hen') },
      { id: 'tools', label: 'Equipment', icon: I.icon('tractor') },
      { id: 'supplies', label: 'Supplies', icon: I.icon('fuel') },
      { id: 'land', label: 'Land', icon: I.icon('sign') },
    ];
    sheetTab = sheetTab || 'build';
    setTabs(tabs, sheetTab);
    const s = Game.state;

    if (sheetTab === 'build') {
      const grid = document.createElement('div');
      grid.className = 'card-grid';
      const entries = Object.entries(D.BUILDINGS).filter(([, b]) => !b.decor).sort((a, b) => a[1].cost - b[1].cost);
      for (const [id, b] of entries) {
        const broke = s.coins < b.cost;
        const card = document.createElement('div');
        // art stays full-color when broke; only the price chip mutes (+ save-up bar)
        card.className = 'item-card' + (broke ? ' broke' : '');
        card.innerHTML = `
          <span class="plate">${I.building(id)}</span>
          <div class="name">${b.name}</div>
          <div class="sub">${b.desc}</div>
          ${chip(b.cost)}
          ${broke ? `<span class="saveup"><i style="width:${Math.min(100, s.coins / b.cost * 100).toFixed(1)}%"></i></span>` : ''}`;
        card.onclick = () => {
          if (s.coins < b.cost) { toast(`Save up ${$$(b.cost - s.coins)} more for the ${b.name}!`, 'bad'); return; }
          SOUNDS.tap();
          startBuild(id);
        };
        grid.appendChild(card);
      }
      body.appendChild(grid);
    }

    if (sheetTab === 'animals') {
      const entries = Object.entries(D.ANIMALS).sort((a, b) => a[1].cost - b[1].cost);
      for (const [id, a] of entries) {
        const homes = Game.buildingsOf(a.home).filter(e => Game.animalsIn(e.i).length < e.b.capacity);
        const row = document.createElement('div');
        row.className = 'row-card';
        row.innerHTML = `
          <div class="emoji">${I.animal(id, 'lg')}</div>
          <div class="info">
            <div class="name">${a.name}</div>
            <div class="sub">Makes ${I.item(a.product)} ${D.ITEMS[a.product].name} (~${$$(D.ITEMS[a.product].base)}) every ${a.prodTime}s · lives in a ${D.BUILDINGS[a.home].name}</div>
          </div>
          <div class="actions"><button class="mini gold">${I.icon('coin')}${fmt(a.cost)}</button></div>`;
        row.querySelector('button').onclick = () => {
          if (!homes.length) { toast(`You need a ${D.BUILDINGS[a.home].name} with free space!`, 'bad'); return; }
          if (Game.buyAnimal(id, homes[0].i)) { updateHud(); renderSheet(); }
        };
        body.appendChild(row);
      }
    }

    if (sheetTab === 'tools') {
      body.appendChild(toolRow(I.icon('tractor'), 'Tilling', D.TILL_TIERS, s.till.tier,
        t => `Tills ${t.area}×${t.area} at once${t.fuel ? ` · burns ${t.fuel} gal/tile` : ' · no fuel needed'}`, () => Game.buyTillTier()));
      body.appendChild(toolRow(I.icon('drop'), 'Watering', D.CAN_TIERS, s.can.tier,
        t => `Holds ${t.cap} water · waters ${t.area}×${t.area}`, () => Game.buyCanTier()));
    }

    if (sheetTab === 'supplies') {
      const price = Game.fuelPrice();
      const fuelRow = document.createElement('div');
      fuelRow.className = 'row-card';
      fuelRow.innerHTML = `
        <div class="emoji">${I.icon('fuel')}</div>
        <div class="info">
          <div class="name">Diesel · $${price.toFixed(2)}/gal today</div>
          <div class="sub">Runs the rototiller, tractor and drones. You have ${s.fuel.toFixed(1)} gal. Prices change daily!</div>
        </div>
        <div class="actions">
          <button class="mini blue">+5 gal · ${$$(Math.ceil(5 * price))}</button>
          <button class="mini gold">+20 gal · ${$$(Math.ceil(20 * price))}</button>
        </div>`;
      const btns = fuelRow.querySelectorAll('button');
      btns[0].onclick = () => { if (Game.buyFuel(5)) { updateHud(); renderSheet(); } };
      btns[1].onclick = () => { if (Game.buyFuel(20)) { updateHud(); renderSheet(); } };
      body.appendChild(fuelRow);

      const fert = document.createElement('div');
      fert.className = 'row-card';
      fert.innerHTML = `
        <div class="emoji">${I.icon('sparkle')}</div>
        <div class="info">
          <div class="name">Fertilizer · 30% of the seed price (min ${$$(8)})</div>
          <div class="sub">Tap a growing crop and choose Fertilize: +25% growth speed and a 45% chance of a double harvest. Cheap crops pay ${$$(8)}, premium crops up to ${$$(D.fertCost('grapes'))}.</div>
        </div>`;
      body.appendChild(fert);
    }

    if (sheetTab === 'land') {
      let anyForSale = false;
      D.PARCELS.forEach((p, i) => {
        if (s.unlockedParcels.includes(i)) return;
        anyForSale = true;
        const broke = s.coins < p.cost;
        const row = document.createElement('div');
        row.className = 'row-card';
        row.innerHTML = `
          <div class="emoji">${I.icon('sign')}</div>
          <div class="info">
            <div class="name">Land parcel · ${p.w}×${p.h} tiles</div>
            <div class="sub">${broke ? 'Keep saving — every tile is an opportunity!' : 'Ready to farm!'}</div>
          </div>
          <div class="actions"><button class="mini gold" ${broke ? 'disabled' : ''}>${I.icon('coin')}${fmt(p.cost)}</button></div>`;
        row.querySelector('button').onclick = () => {
          if (Game.buyParcel(i)) { updateHud(); renderSheet(); }
        };
        body.appendChild(row);
      });
      if (!anyForSale) body.innerHTML = '<div class="empty-note">👑 You own all the land — a true farming empire!</div>';
    }
  }

  function toolRow(iconHtml, name, tiers, cur, describe, buy) {
    const next = tiers[cur + 1];
    const row = document.createElement('div');
    row.className = 'row-card';
    if (!next) {
      row.innerHTML = `
        <div class="emoji">${iconHtml}</div>
        <div class="info"><div class="name">${tiers[cur].name}</div><div class="sub">${describe(tiers[cur])} · fully upgraded!</div></div>`;
      return row;
    }
    row.innerHTML = `
      <div class="emoji">${iconHtml}</div>
      <div class="info">
        <div class="name">${name}: ${tiers[cur].name} → ${next.name}</div>
        <div class="sub">${describe(next)}</div>
      </div>
      <div class="actions"><button class="mini gold">${I.icon('coin')}${fmt(next.cost)}</button></div>`;
    row.querySelector('button').onclick = () => { if (buy()) { updateHud(); renderSheet(); } };
    return row;
  }

  // ---------------- market ----------------
  // Row order and membership are frozen per sheet-open (marketList): re-sorting
  // or removing rows while the player rapid-taps "Sell" moves the buttons under
  // their finger. Sold-out items keep a muted placeholder row until close.
  function renderMarket(body) {
    setSheetHeader(I.icon('scales'), 'Market', 'Prices move daily — sell high!');
    setTabs(null);
    const s = Game.state;
    // mythics (the Glowing Seed) live outside the market — never listed, never priced
    const items = Object.entries(s.inventory).filter(([id, q]) => q > 0 && !(D.ITEMS[id] && D.ITEMS[id].mythic));
    if (!marketList) {
      marketList = items
        .sort((a, b) => Game.sellPrice(b[0]) * b[1] - Game.sellPrice(a[0]) * a[1])
        .map(([id]) => id);
    } else {
      for (const [id] of items) if (!marketList.includes(id)) marketList.push(id);
    }

    const hot = s.market.hot;
    const md = Game.marketDayItems();
    if (md.length) {
      const fair = document.createElement('div');
      fair.className = 'order-card md-banner';
      fair.innerHTML = `<div style="font-weight:800;font-size:0.8125rem">🎪 <b>Market Day!</b> ${md.map(id => `${I.item(id)} <b>${D.ITEMS[id].name}</b>`).join(', ')} sell for <b>+50%</b> today only!</div>`;
      body.appendChild(fair);
    }
    const note = document.createElement('div');
    note.className = 'order-card';
    note.innerHTML = `<div style="font-weight:800;font-size:0.8125rem">${I.icon('flame')} Today's hot item: ${I.item(hot)} <b>${D.ITEMS[hot].name}</b> sells for <b>+50%</b>! Prices change daily.</div>`;
    body.appendChild(note);

    if (!marketList.length) {
      const e = document.createElement('div');
      e.className = 'empty-note';
      e.innerHTML = `<div class="empty-art">${I.icon('crate')}</div>Your barn is empty — harvest crops or collect from animals!`;
      body.appendChild(e);
      return;
    }

    let total = 0;
    for (const [id, qty] of items) total += Game.sellPrice(id) * qty;

    const sellAll = document.createElement('button');
    sellAll.className = 'chunky gold';
    sellAll.style.cssText = 'width:100%;margin-bottom:12px';
    sellAll.disabled = total <= 0;
    sellAll.innerHTML = total > 0
      ? `${I.icon('coin')} Sell everything · +${$$(total)}`
      : `${I.icon('coin')} Everything sold — nice work!`;
    sellAll.onclick = () => {
      const rect = sellAll.getBoundingClientRect();
      confirmBox('⚖️', `Sell your entire inventory for ${$$(total)}?`, 'Sell all', () => {
        for (const [id, qty] of Object.entries(s.inventory)) if (qty > 0) Game.sellItem(id, qty);
        coinFlight(rect);
        marketList = null; // fresh board: collapse to the empty state
        updateHud(); renderSheet();
      });
    };
    body.appendChild(sellAll);

    for (const id of marketList) {
      const item = D.ITEMS[id];
      const qty = s.inventory[id] || 0;
      const price = Game.sellPrice(id);
      const onMd = md.includes(id);
      const mult = s.market.mults[id] * (hot === id ? 1.5 : 1) * (onMd ? 1.5 : 1);
      const dir = mult >= 1.12 ? `<span class="price-up">▲ high</span>` : mult <= 0.85 ? `<span class="price-down">▼ low</span>` : 'steady';
      const row = document.createElement('div');
      row.className = 'row-card' + (qty ? '' : ' soldout');
      // both buttons render at every quantity so the tap targets never move
      row.innerHTML = `
        <div class="emoji">${I.item(id, 'lg')}${hot === id ? `<span class="hot-badge">${I.icon('flame')}</span>` : onMd ? '<span class="hot-badge md-badge">🎪</span>' : ''}</div>
        <div class="info">
          <div class="name">${item.name} × ${qty}${onMd ? ' <span class="md-tag">🎪 +50%</span>' : ''}</div>
          <div class="sub">${qty ? `${$$(price)} each · ${dir}` : 'sold out'}</div>
        </div>
        <div class="actions">
          <button class="mini" ${qty ? '' : 'disabled'}>Sell 1 · ${$$(price)}</button>
          <button class="mini gold" ${qty ? '' : 'disabled'}>${qty ? `All · ${$$(price * qty)}` : 'Sold out'}</button>
        </div>`;
      const btns = row.querySelectorAll('button');
      btns[0].onclick = e => { const r = e.currentTarget.getBoundingClientRect(); Game.sellItem(id, 1); coinFlight(r); updateHud(); renderSheet(); };
      btns[1].onclick = e => { const r = e.currentTarget.getBoundingClientRect(); Game.sellItem(id, s.inventory[id] || 0); coinFlight(r); updateHud(); renderSheet(); };
      body.appendChild(row);
    }
  }

  // ---------------- orders ----------------
  // Orders that leave the board mid-view (delivered / skipped / expired) keep a
  // muted stub card for the rest of the session so the remaining cards' buttons
  // don't jump up under the player's finger.
  function orderStub(o, reason) {
    const card = document.createElement('div');
    card.className = 'order-card done';
    const items = Object.entries(o.reqs).map(([id, qty]) =>
      `<div class="order-item ok">${I.item(id)} ${qty}/${qty}</div>`).join('');
    const label = reason === 'delivered' ? `✅ Delivered! +${$$(o.paid != null ? o.paid : o.coins)}`
      : reason === 'skipped' ? '🗑️ Skipped — a new order is on the way'
      : '⏳ Expired — fresh orders are coming';
    card.innerHTML = `
      <div class="order-items">${items}</div>
      <div class="order-foot"><div class="order-reward">${label}</div></div>`;
    return card;
  }

  // "Today" section: the 3 daily tasks + streak flame, at the top of Orders
  function dailyLabel(t) {
    const NAMES = {
      harvest: n => `Harvest ${n} ${t.item ? D.ITEMS[t.item].name : 'crops'}`,
      water: n => `Water ${n} crop${n > 1 ? 's' : ''}`,
      orders: n => `Fulfill ${n} order${n > 1 ? 's' : ''}`,
      feed: n => `Feed all ${n} animal${n > 1 ? 's' : ''}`,
      collect: n => `Collect ${n} animal product${n > 1 ? 's' : ''}`,
    };
    return (NAMES[t.kind] || (n => `${t.kind} × ${n}`))(t.need);
  }
  const DAILY_ICONS = { harvest: 'basket', water: 'drop', orders: 'clipboard', feed: 'hen', collect: 'crate' };

  function renderDaily(body) {
    const d = Game.state.daily;
    if (!d) return;
    const head = document.createElement('div');
    head.className = 'section-label daily-head';
    head.innerHTML = `Today's tasks <span class="streak-flame">🔥 ${d.streak || 0} day streak</span>`;
    body.appendChild(head);
    d.tasks.forEach((t, i) => {
      const pct = Math.round(Math.min(1, (t.n || 0) / t.need) * 100);
      const row = document.createElement('div');
      row.className = 'row-card daily-row' + (t.claimed ? ' claimed' : '');
      row.innerHTML = `
        <div class="emoji">${t.kind === 'harvest' && t.item ? I.item(t.item, 'lg') : I.icon(DAILY_ICONS[t.kind] || 'check')}</div>
        <div class="info">
          <div class="name">${dailyLabel(t)}</div>
          <div class="sub">${t.claimed ? '✅ claimed' : `${Math.min(t.n || 0, t.need)} / ${t.need}`}</div>
          <div class="minibar"><div style="width:${pct}%"></div></div>
        </div>
        <div class="actions"><button class="mini gold" ${!t.claimed && (t.n || 0) >= t.need ? '' : 'disabled'}>${t.claimed ? 'Done' : `Claim ${$$(t.reward)}`}</button></div>`;
      row.querySelector('button').onclick = e => {
        const r = e.currentTarget.getBoundingClientRect();
        if (Game.claimDaily(i)) { coinFlight(r); updateHud(); renderSheet(); }
      };
      body.appendChild(row);
    });
  }

  function renderOrders(body) {
    setSheetHeader(I.icon('clipboard'), 'Orders', 'Townsfolk pay a premium for deliveries');
    setTabs(null);
    const s = Game.state;
    renderDaily(body);
    if (!orderSeen) { orderSeen = new Map(); orderGone = {}; }
    const live = new Map(s.orders.map(o => [o.id, o]));
    for (const o of s.orders) if (!orderSeen.has(o.id)) orderSeen.set(o.id, o);
    const intro = document.createElement('div');
    intro.className = 'empty-note';
    intro.style.padding = '4px 10px 14px';
    intro.textContent = 'Fill orders to grow your empire!';
    body.appendChild(intro);

    if (!orderSeen.size) {
      const e = document.createElement('div');
      e.className = 'empty-note';
      e.innerHTML = `<div class="empty-art">${I.icon('clipboard')}</div>New orders arriving soon…`;
      body.appendChild(e);
    }

    for (const snap of orderSeen.values()) {
      if (!live.has(snap.id)) { // left the board this session — hold its place
        body.appendChild(orderStub(snap, orderGone[snap.id] || 'expired'));
        continue;
      }
      const o = live.get(snap.id);
      const card = document.createElement('div');
      card.className = 'order-card';
      const items = Object.entries(o.reqs).map(([id, qty]) => {
        const have = s.inventory[id] || 0;
        return `<div class="order-item ${have >= qty ? 'ok' : ''}">${I.item(id)} ${Math.min(have, qty)}/${qty}</div>`;
      }).join('');
      // hint the newcomer trap: items this farm has never produced
      const unknown = Object.keys(o.reqs).filter(id => !(s.produced && s.produced[id]) && !(s.inventory[id] > 0));
      const hint = unknown.length
        ? `<div class="order-hint">🌱 Not grown yet: ${unknown.map(id => D.ITEMS[id].name).join(', ')}</div>` : '';
      const rush = Game.orderRush(o);
      const left = o.expires != null ? Math.max(0, o.expires - s.now) : null;
      const daysLeft = left != null ? left / D.DAY_LEN : null;
      const timer = left != null
        ? `<span class="order-timer${daysLeft < 1 ? ' late' : ''}">⏳ ${daysLeft >= 1 ? daysLeft.toFixed(1) + ' days left' : Math.ceil(left) + 's left!'}</span>` : '';
      const can = Game.canFulfill(o);
      card.innerHTML = `
        <div class="order-top">${timer}${rush ? '<span class="rush-tag">⚡ RUSH +25%</span>' : ''}</div>
        <div class="order-items">${items}</div>
        ${hint}
        <div class="order-foot">
          <div class="order-reward">+${$$(o.coins)}${rush ? ' <b class="rush-plus">+25%</b>' : ''} · +${o.xp} XP</div>
          <div style="display:flex;gap:6px">
            <button class="mini quiet">Skip</button>
            <button class="mini gold" ${can ? '' : 'disabled'}>Deliver 🚚</button>
          </div>
        </div>`;
      const btns = card.querySelectorAll('button');
      btns[0].onclick = () => confirmBox('🗑️', 'Skip this order? A new one will arrive soon.', 'Skip', () => {
        if (orderGone) orderGone[o.id] = 'skipped';
        Game.skipOrder(o.id);
        renderSheet();
      });
      btns[1].onclick = e => {
        const r = e.currentTarget.getBoundingClientRect();
        const paid = Game.orderRush(o) ? Math.ceil(o.coins * 1.25 / 5) * 5 : o.coins;
        if (Game.fulfillOrder(o.id)) {
          if (orderGone) { orderGone[o.id] = 'delivered'; o.paid = paid; }
          coinFlight(r); updateHud(); renderSheet();
        }
      };
      body.appendChild(card);
    }
  }

  // ---------------- season care sheet ----------------
  // opened automatically at dawn of a season's last day; lists every planted
  // Realtor — buy whole new farms (small → massive) and hop between the ones you own
  function renderRealtor(body) {
    const s = Game.state;
    setSheetHeader(I.icon('shop'), 'Realtor', 'Buy new land — hop between your farms anytime');
    setTabs(null);

    const yours = document.createElement('div');
    yours.className = 'section-label';
    yours.textContent = '🏡 Your farms';
    body.appendChild(yours);
    for (const f of Game.ownedFarms()) {
      const row = document.createElement('div');
      row.className = 'row-card' + (f.active ? ' backup-due' : '');
      row.innerHTML = `
        <div class="emoji">${f.active ? '📍' : '🌾'}</div>
        <div class="info"><div class="name">${esc(f.label)}${f.active ? ' — you are here' : ''}</div><div class="sub">${f.w} × ${f.h} tiles</div></div>
        <div class="actions"><button class="mini${f.active ? '' : ' gold'}"${f.active ? ' disabled' : ''}>${f.active ? 'Current' : 'Visit →'}</button></div>`;
      if (!f.active) row.querySelector('button').onclick = () => { SOUNDS.tap(); Game.switchFarm(f.i); closeSheet(); };
      body.appendChild(row);
    }

    const sale = document.createElement('div');
    sale.className = 'section-label';
    sale.textContent = '🪧 Land for sale';
    body.appendChild(sale);
    const remaining = D.FARM_TEMPLATES.filter(t => !Game.ownsTemplate(t.id));
    if (!remaining.length) {
      const e = document.createElement('div');
      e.className = 'empty-note';
      e.style.padding = '4px 6px';
      e.textContent = 'You own every property in the county. A true empire!';
      body.appendChild(e);
    }
    for (const t of D.FARM_TEMPLATES) {
      const owned = Game.ownsTemplate(t.id);
      const broke = s.coins < t.price;
      const row = document.createElement('div');
      row.className = 'row-card';
      row.innerHTML = `
        <div class="emoji">🌄</div>
        <div class="info"><div class="name">${t.name} <span style="opacity:.65;font-weight:800;font-size:.8em">${t.w}×${t.h}</span></div><div class="sub">${t.blurb}</div></div>
        <div class="actions"><button class="mini${owned || broke ? '' : ' gold'}"${owned || broke ? ' disabled' : ''}>${owned ? 'Owned' : $$(t.price)}</button></div>`;
      if (!owned && !broke) row.querySelector('button').onclick = () => { SOUNDS.tap(); if (Game.buyFarm(t.id)) { closeSheet(); updateHud(); } else renderSheet(); };
      body.appendChild(row);
    }
  }

  // Compendium — a completion scoreboard for the "touch everything" player
  function renderCompendium(body) {
    const s = Game.state;
    setSheetHeader(I.icon('sprout'), 'Compendium', 'Everything you have discovered');
    setTabs(null);
    const section = (title, have, total, rows) => {
      const wrap = document.createElement('div');
      wrap.className = 'order-card';
      wrap.innerHTML = `<div style="font-weight:900;font-size:0.9rem;margin-bottom:6px">${title} — <b>${have}/${total}</b></div>
        <div class="comp-grid">${rows}</div>`;
      body.appendChild(wrap);
    };
    // crops harvested (produced flag) — everything the player has ever grown
    const grown = id => !!(s.produced && s.produced[id]);
    const cropRows = Object.keys(D.CROPS).map(id =>
      `<span class="comp-chip${grown(id) ? ' got' : ''}">${I.item(id)} ${grown(id) ? D.ITEMS[id].name : '???'}</span>`).join('');
    section('🌱 Crops grown', Object.keys(D.CROPS).filter(grown).length, Object.keys(D.CROPS).length, cropRows);
    // recipes crafted (produced flag on the output)
    const recRows = Object.entries(D.RECIPES).map(([, r]) =>
      `<span class="comp-chip${grown(r.out) ? ' got' : ''}">${I.item(r.out)} ${grown(r.out) ? D.ITEMS[r.out].name : '???'}</span>`).join('');
    section('🍞 Recipes crafted', Object.values(D.RECIPES).filter(r => grown(r.out)).length, Object.keys(D.RECIPES).length, recRows);
    // animals owned
    const haveAnimal = t => s.animals.some(a => a.type === t);
    const aniRows = Object.keys(D.ANIMALS).map(t =>
      `<span class="comp-chip${haveAnimal(t) ? ' got' : ''}">${D.ANIMALS[t].emoji} ${haveAnimal(t) ? D.ANIMALS[t].name : '???'}</span>`).join('');
    section('🐔 Animals owned', Object.keys(D.ANIMALS).filter(haveAnimal).length, Object.keys(D.ANIMALS).length, aniRows);
    // buildings placed
    const haveB = t => s.buildings.some(b => b && b.type === t);
    const bRows = Object.keys(D.BUILDINGS).map(t =>
      `<span class="comp-chip${haveB(t) ? ' got' : ''}">${D.BUILDINGS[t].emoji} ${haveB(t) ? D.BUILDINGS[t].name : '???'}</span>`).join('');
    section('🏠 Buildings placed', Object.keys(D.BUILDINGS).filter(haveB).length, Object.keys(D.BUILDINGS).length, bRows);
  }

  // crop that won't survive the flip, with one-tap rescue actions.
  function renderCare(body) {
    const s = Game.state;
    const nextName = D.SEASONS[(s.season + 1) % 4].name;
    setSheetHeader(I.icon('warning'), 'Season care', `${nextName} is coming — save what you can`);
    setTabs(null);
    const list = Game.atRiskCrops();

    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'empty-note';
      e.innerHTML = `<div class="empty-art">${I.icon('check')}</div>🌿 Nothing at risk — every planted crop survives ${nextName}!`;
      body.appendChild(e);
      return;
    }

    const ripe = list.filter(e => e.ripe);
    const secondsLeft = ((D.SEASON_DAYS - s.day) + (1 - s.t)) * D.DAY_LEN;

    const intro = document.createElement('div');
    intro.className = 'empty-note';
    intro.style.padding = '0 6px 10px';
    intro.textContent = `${list.length} crop${list.length > 1 ? 's' : ''} won't survive ${nextName} — about ${Math.max(1, Math.round(secondsLeft))}s of ${D.SEASONS[s.season].name} left.`;
    body.appendChild(intro);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;margin-bottom:12px';
    actions.innerHTML = `
      <button class="chunky green" style="flex:1" ${ripe.length ? '' : 'disabled'}>${I.icon('basket')} Harvest all ripe${ripe.length ? ' (' + ripe.length + ')' : ''}</button>
      <button class="chunky red" style="flex:1">${I.icon('shovel')} Dig up all at-risk (${list.length})</button>`;
    const [harvBtn, digBtn] = actions.querySelectorAll('button');
    harvBtn.onclick = () => { Game.harvestAtRisk(); updateHud(); renderSheet(); };
    digBtn.onclick = () => confirmBox('⛏️', `Dig up all ${list.length} at-risk crops for a 50% seed refund?`, 'Dig them up', () => {
      Game.digAtRisk();
      updateHud();
      renderSheet();
    });
    body.appendChild(actions);

    // group rows by crop + ripeness so the list stays readable
    const groups = new Map();
    for (const e of list) {
      const key = e.id + (e.ripe ? ':ripe' : ':grow');
      const g = groups.get(key) || { id: e.id, ripe: e.ripe, n: 0, minProg: 1 };
      g.n++;
      g.minProg = Math.min(g.minProg, e.prog);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const def = D.CROPS[g.id];
      const growLeft = Math.ceil((1 - g.minProg) * def.grow);
      const status = g.ripe
        ? '✅ ripe — harvest now!'
        : growLeft > secondsLeft
          ? `⏳ needs ~${growLeft}s but only ${Math.round(secondsLeft)}s left — it won't make it`
          : `🌱 ~${growLeft}s to ripen · ${Math.round(secondsLeft)}s left — keep it watered!`;
      const row = document.createElement('div');
      row.className = 'row-card';
      row.innerHTML = `
        <div class="emoji">${I.item(g.id, 'lg')}</div>
        <div class="info">
          <div class="name">${D.ITEMS[g.id].name} × ${g.n}</div>
          <div class="sub">${status}</div>
        </div>`;
      body.appendChild(row);
    }
  }

  // ---------------- building panel ----------------
  function renderBuilding(body, index) {
    const s = Game.state;
    const b = s.buildings[index];
    if (!b) { closeSheet(); return; }
    const def = D.BUILDINGS[b.type];
    setSheetHeader(I.building(b.type), def.name, def.capacity ? `Home for up to ${def.capacity} animals` : '');
    setTabs(null);

    if (def.capacity) renderHousing(body, index, b, def);
    else if (b.queue) renderProcessor(body, index, b, def);
    else if (b.type === 'mill') renderMill(body);
    else {
      const e = document.createElement('div');
      e.className = 'empty-note';
      e.textContent = def.desc;
      body.appendChild(e);
    }

    // sell-back option (a lifeline when cash runs dry)
    if (b.type !== 'well' || Game.buildingsOf('well').length > 1) {
      const refund = Math.floor(def.cost / 2);
      const sellRow = document.createElement('div');
      sellRow.className = 'row-card';
      sellRow.style.marginTop = '14px';
      sellRow.innerHTML = `
        <div class="emoji">${I.icon('tag')}</div>
        <div class="info"><div class="name">Sell this ${def.name}</div><div class="sub">Get back ${$$(refund)} (50% of cost)${def.capacity ? ' · must be empty' : ''}</div></div>
        <div class="actions"><button class="mini danger">Sell</button></div>`;
      sellRow.querySelector('button').onclick = e => {
        const r = e.currentTarget.getBoundingClientRect();
        confirmBox('🏷️', `Sell the ${def.name} for ${$$(refund)}?`, 'Sell it', () => {
          if (Game.sellBuilding(index)) { coinFlight(r); closeSheet(); updateHud(); }
        });
      };
      body.appendChild(sellRow);
    }
  }

  function renderHousing(body, index, b, def) {
    const s = Game.state;
    const residents = s.animals.map((a, i) => ({ a, i })).filter(e => e.a.home === index);
    const ready = Game.readyIn(index);

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;gap:8px;margin-bottom:12px';
    top.innerHTML = `
      <button class="chunky green" style="flex:1">${I.item('wheat')} Feed all</button>
      <button class="chunky gold" style="flex:1" ${ready ? '' : 'disabled'}>${I.icon('crate')} Collect${ready ? ' (' + ready + ')' : ''}</button>`;
    const [feedBtn, collectBtn] = top.querySelectorAll('button');
    feedBtn.onclick = () => { Game.feedAll(index); updateHud(); renderSheet(); };
    collectBtn.onclick = () => { Game.collectBuilding(index); updateHud(); renderSheet(); };
    body.appendChild(top);

    if (Game.hasBuilding('mill')) {
      const n = document.createElement('div');
      n.className = 'empty-note';
      n.style.padding = '0 4px 10px';
      n.id = 'feed-credit-note';
      n.innerHTML = `${I.item('wheat')} Feed credits: ${s.feedCredits || 0} — feeding uses 1 credit before cash. Grind wheat &amp; corn at the Feed Mill (1 grain → 3 feeds).`;
      body.appendChild(n);
    }

    if (!residents.length) {
      const e = document.createElement('div');
      e.className = 'empty-note';
      e.textContent = `No animals yet — buy some below! (capacity ${b.capacity})`;
      body.appendChild(e);
    }

    for (const { a, i } of residents) {
      const adef = D.ANIMALS[a.type];
      const fed = s.now < a.fedUntil;
      const cost = Game.feedCostFor(a);
      const costLabel = cost.credits ? `1 feed ${I.item('wheat')}` : $$(cost.coins);
      const vetCost = Math.ceil(adef.cost * D.VET_RATE);
      const sellPrice = Math.floor(adef.cost * 0.6 * (a.sick ? 0.5 : 1));
      const status = a.sick
        ? '🤒 sick — needs the vet before producing again'
        : fed
          ? (a.prodProg >= 1 ? `${I.item(adef.product)} ready!` : `making ${I.item(adef.product)} · ${Math.round(a.prodProg * 100)}%`)
          : '😋 hungry — feed to produce';
      const row = document.createElement('div');
      row.className = 'row-card';
      row.innerHTML = `
        <div class="emoji">${I.animal(a.type, 'lg')}${a.sick ? '<span class="hot-badge">🤒</span>' : ''}</div>
        <div class="info">
          <div class="name">${a.name} <span class="name-soft">· ${adef.name}</span></div>
          <div class="sub">${status}</div>
          <div class="minibar ${a.prodProg >= 1 ? '' : 'blue'}"><div style="width:${Math.round(a.prodProg * 100)}%"></div></div>
          <div class="sub" style="margin-top:4px">${a.sick ? '🤒' : a.happiness >= 80 ? '😍' : a.happiness >= 50 ? '🙂' : '😟'} condition ${a.happiness}%</div>
        </div>
        <div class="actions">
          ${a.sick ? `<button class="mini">🩺 Vet ${$$(vetCost)}</button>` : `<button class="mini" ${fed ? 'disabled' : ''}>Feed ${costLabel}</button>`}
          <button class="mini quiet">Sell ${$$(sellPrice)}</button>
        </div>`;
      const btns = row.querySelectorAll('button');
      btns[0].onclick = () => {
        if (a.sick) { if (Game.vetAnimal(i)) { updateHud(); renderSheet(); } }
        else if (Game.feedAnimal(i)) { SOUNDS.plant(); updateHud(); renderSheet(); }
      };
      btns[1].onclick = e => {
        const r = e.currentTarget.getBoundingClientRect();
        confirmBox('🏷️', `Sell ${a.name} the ${adef.name.toLowerCase()} for ${$$(sellPrice)}?`, 'Sell', () => {
          if (Game.sellAnimal(i)) { coinFlight(r); updateHud(); renderSheet(); }
        });
      };
      body.appendChild(row);
    }

    // buy more
    const options = Object.entries(D.ANIMALS).filter(([, a]) => a.home === b.type);
    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = `Buy animals (${residents.length}/${b.capacity})`;
    body.appendChild(label);
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    for (const [id, a] of options) {
      const full = residents.length >= b.capacity;
      const card = document.createElement('div');
      card.className = 'item-card' + (full ? ' disabled' : '');
      card.innerHTML = `
        <span class="plate">${I.animal(id)}</span>
        <div class="name">${a.name}</div>
        <div class="sub">${I.item(a.product)} every ${a.prodTime}s</div>
        ${chip(a.cost, full ? 'muted' : '')}`;
      card.onclick = () => {
        if (Game.buyAnimal(id, index)) { updateHud(); renderSheet(); }
      };
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  function renderProcessor(body, index, b, def) {
    const s = Game.state;
    const slots = b.slots || 1;
    const done = b.queue.filter(j => j.left <= 0).length;

    if (done) {
      const btn = document.createElement('button');
      btn.className = 'chunky gold';
      btn.style.cssText = 'width:100%;margin-bottom:12px';
      btn.innerHTML = `${I.icon('crate')} Collect ${done} finished good${done > 1 ? 's' : ''}`;
      btn.onclick = () => { Game.collectRecipes(index); updateHud(); renderSheet(); };
      body.appendChild(btn);
    }

    if (b.queue.length) {
      const label = document.createElement('div');
      label.className = 'section-label';
      label.textContent = `In progress (${b.queue.length}/3) · ${slots} craft slot${slots > 1 ? 's' : ''}`;
      body.appendChild(label);
      const running = new Set(Game.runningJobs(b));
      for (const job of b.queue) {
        const r = D.RECIPES[job.r];
        const item = D.ITEMS[r.out];
        const left = Math.max(0, job.left);
        const pct = Math.round((1 - left / r.time) * 100);
        const status = left <= 0 ? '✅ Ready!' : running.has(job) ? Math.ceil(left) + 's left' : '⏸️ queued — waiting for a free slot';
        const row = document.createElement('div');
        row.className = 'row-card';
        row.innerHTML = `
          <div class="emoji">${I.item(r.out, 'lg')}</div>
          <div class="info">
            <div class="name">${item.name}</div>
            <div class="sub">${status}</div>
            <div class="minibar pink"><div style="width:${pct}%"></div></div>
          </div>`;
        body.appendChild(row);
      }
    }

    // purchasable parallel craft lanes (slot 2 / slot 3)
    if (slots < 3) {
      const cost = D.SLOT_COSTS[slots + 1];
      const slotRow = document.createElement('div');
      slotRow.className = 'row-card';
      slotRow.innerHTML = `
        <div class="emoji">${I.icon('gear')}</div>
        <div class="info">
          <div class="name">Add craft slot ${slots + 1}</div>
          <div class="sub">Recipes craft one at a time — an extra slot runs another in parallel.</div>
        </div>
        <div class="actions"><button class="mini gold">${I.icon('coin')}${fmt(cost)}</button></div>`;
      slotRow.querySelector('button').onclick = () => { if (Game.buySlot(index)) { updateHud(); renderSheet(); } };
      body.appendChild(slotRow);
    }

    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = 'Recipes';
    body.appendChild(label);
    for (const [id, r] of Object.entries(D.RECIPES)) {
      if (r.building !== b.type) continue;
      const out = D.ITEMS[r.out];
      const ins = Object.entries(r.in).map(([i, q]) => `${q} ${I.item(i)}`).join(' + ');
      const can = Game.canCraft(id) && b.queue.length < 3;
      const row = document.createElement('div');
      row.className = 'row-card';
      row.innerHTML = `
        <div class="emoji">${I.item(r.out, 'lg')}</div>
        <div class="info">
          <div class="name">${out.name} <span class="name-price">· ~${$$(out.base)}</span></div>
          <div class="sub">${ins} · ${r.time}s</div>
        </div>
        <div class="actions"><button class="mini blue" ${can ? '' : 'disabled'}>Craft</button></div>`;
      row.querySelector('button').onclick = () => { if (Game.startRecipe(index, id)) { updateHud(); renderSheet(); } };
      body.appendChild(row);
    }
  }

  // ---------------- feed mill panel ----------------
  function renderMill(body) {
    const s = Game.state;
    const credits = document.createElement('div');
    credits.className = 'order-card';
    credits.innerHTML = `<div style="font-weight:800;font-size:0.8125rem" id="feed-credits">${I.item('wheat')} Feed credits: <b>${s.feedCredits || 0}</b> — feeding an animal spends 1 credit before dipping into cash.</div>`;
    body.appendChild(credits);

    for (const grain of ['wheat', 'corn']) {
      const have = s.inventory[grain] || 0;
      const row = document.createElement('div');
      row.className = 'row-card';
      row.innerHTML = `
        <div class="emoji">${I.item(grain, 'lg')}</div>
        <div class="info">
          <div class="name">Grind ${D.ITEMS[grain].name}</div>
          <div class="sub">1 ${D.ITEMS[grain].name.toLowerCase()} → 3 feed credits · you have ${have}</div>
        </div>
        <div class="actions">
          <button class="mini blue" ${have ? '' : 'disabled'}>Grind 1</button>
          <button class="mini gold" ${have > 1 ? '' : 'disabled'}>All (${have})</button>
        </div>`;
      const [one, all] = row.querySelectorAll('button');
      one.onclick = () => { if (Game.grindGrain(grain, 1)) { updateHud(); renderSheet(); } };
      all.onclick = () => { if (Game.grindGrain(grain, have)) { updateHud(); renderSheet(); } };
      body.appendChild(row);
    }
  }

  // ---------------- menu ----------------
  function applyTextScale() {
    const big = Game.state && Game.state.settings && Game.state.settings.bigText;
    document.documentElement.style.fontSize = big ? '18px' : '';
  }

  function renderLog(body) {
    setSheetHeader(I.icon('clipboard'), 'Message log', 'The last ' + toastLog.length + ' farm messages');
    setTabs(null);
    if (!toastLog.length) {
      const e = document.createElement('div');
      e.className = 'empty-note';
      e.textContent = 'Nothing yet — get farming!';
      body.appendChild(e);
      return;
    }
    for (let i = toastLog.length - 1; i >= 0; i--) {
      const t = toastLog[i];
      const row = document.createElement('div');
      row.className = 'row-card log-row';
      const plate = t.kind === 'good' ? 'check' : t.kind === 'bad' ? 'bang' : 'info';
      row.innerHTML = `
        <span class="t-plate ${t.kind}">${I.icon(plate)}</span>
        <div class="info"><div class="sub log-msg"></div></div>
        <div class="log-day">Day ${t.day}</div>`;
      row.querySelector('.log-msg').textContent = t.msg;
      body.appendChild(row);
    }
  }

  function renderMenu(body) {
    const s = Game.state;
    setSheetHeader(I.icon('gear'), 'Menu', s.farmName);
    setTabs(null);
    const diffDef = D.DIFFICULTIES.find(d => d.id === s.diff) || D.DIFFICULTIES[1];

    const stats = document.createElement('div');
    stats.className = 'order-card';
    stats.innerHTML = `
      <div style="font-weight:900;font-size:0.9375rem;margin-bottom:6px">👑 ${esc(s.farmName)} — Year ${s.year} · ${diffDef.emoji} ${diffDef.name}</div>
      <div style="font-weight:800;font-size:0.8125rem;line-height:1.9">
        💰 Farm value: <b>${$$(Game.farmValue())}</b> · lifetime earned: <b>${$$(s.stats.earned)}</b><br>
        ⭐ Reputation: <b>level ${s.level}</b> (+${Math.round(D.repBonus(s.level) * 100)}% sell prices)<br>
        🧺 Harvested: <b>${s.stats.harvested.toLocaleString()}</b> · 🥀 crops lost: <b>${s.stats.lost}</b><br>
        ⛽ Fuel: <b>${s.fuel.toFixed(1)} gal</b> · ✨ fertilized: <b>${s.stats.fertilized}</b><br>
        🐔 Animals: <b>${s.animals.length}</b> · 🏠 Buildings: <b>${s.buildings.filter(Boolean).length}</b><br>
        🚧 Land parcels: <b>${s.unlockedParcels.length}/${D.PARCELS.length}</b> · 📋 Orders done: <b>${s.stats.orders}</b>
      </div>`;
    body.appendChild(stats);

    const jobs = document.createElement('div');
    jobs.className = 'row-card';
    const jobsFree = Game.oddJobsAvailable();
    const jobsPay = Game.oddJobsPay();
    jobs.innerHTML = `
      <div class="emoji">💪</div>
      <div class="info"><div class="name">Work odd jobs</div><div class="sub">Earn ${$$(jobsPay)} helping in town — once per day, +${$$(5)} per consecutive day (max ${$$(60)}). A farmer is never truly broke.</div></div>
      <div class="actions"><button class="mini gold" ${jobsFree ? '' : 'disabled'}>${jobsFree ? '+' + $$(jobsPay) : 'Done today'}</button></div>`;
    jobs.querySelector('button').onclick = () => { if (Game.workOddJobs()) { updateHud(); renderSheet(); } };
    body.appendChild(jobs);

    // season outlook: reopen the care sheet any time
    const care = document.createElement('div');
    care.className = 'row-card';
    const atRisk = Game.atRiskCrops().length;
    care.innerHTML = `
      <div class="emoji">🍂</div>
      <div class="info"><div class="name">Season care</div><div class="sub">${atRisk ? atRisk + ' planted crop' + (atRisk > 1 ? 's' : '') + ' won\'t survive the next season!' : 'Every planted crop survives the next season.'}</div></div>
      <div class="actions"><button class="mini${atRisk ? ' danger' : ''}">Review</button></div>`;
    care.querySelector('button').onclick = () => { SOUNDS.tap(); openSheet('care'); };
    body.appendChild(care);

    // ---- Realtor: buy land / switch farms ----
    const realtor = document.createElement('div');
    realtor.className = 'row-card';
    const farmN = Game.ownedFarms().length;
    realtor.innerHTML = `
      <div class="emoji">🏡</div>
      <div class="info"><div class="name">Realtor</div><div class="sub">${farmN > 1 ? 'Hop between your ' + farmN + ' farms, or buy' : 'Buy'} more land — cozy plots up to massive frontier.</div></div>
      <div class="actions"><button class="mini gold">Open</button></div>`;
    realtor.querySelector('button').onclick = () => { SOUNDS.tap(); openSheet('realtor'); };
    body.appendChild(realtor);

    // ---- Farmhands: hire a crew to work the land ----
    const hands = document.createElement('div');
    hands.className = 'row-card';
    const crew = (s.workers || []).length;
    const bill = Game.workerWageBill();
    hands.innerHTML = `
      <div class="emoji">👷</div>
      <div class="info"><div class="name">Farmhands${crew ? ' · ' + crew : ''}</div><div class="sub">${crew ? 'Your crew works the fields for ' + $$(bill) + '/day. Manage jobs, patches & training.' : 'Hire workers to till, plant, water, harvest & tend animals for you — a farm that runs itself.'}</div></div>
      <div class="actions"><button class="mini gold">${crew ? 'Manage' : 'Hire'}</button></div>`;
    hands.querySelector('button').onclick = () => { SOUNDS.tap(); openSheet('farmhands'); };
    body.appendChild(hands);

    // ---- automation & comfort ----
    const comfortLabel = document.createElement('div');
    comfortLabel.className = 'section-label';
    comfortLabel.textContent = '⚙️ Automation & comfort';
    body.appendChild(comfortLabel);

    const toggleRow = (emoji, name, sub, on, onFlip) => {
      const row = document.createElement('div');
      row.className = 'row-card';
      row.innerHTML = `
        <div class="emoji">${emoji}</div>
        <div class="info"><div class="name">${name}</div><div class="sub">${sub}</div></div>
        <div class="actions"><button class="mini toggle${on ? ' on gold' : ''}">${on ? 'On' : 'Off'}</button></div>`;
      row.querySelector('button').onclick = () => { SOUNDS.tap(); onFlip(); renderSheet(); };
      body.appendChild(row);
    };
    toggleRow('🧺', 'Auto-harvest', 'Ripe crops harvest themselves into your barn the moment they’re ready — nothing rots waiting.', !!s.autoHarvest, () => { s.autoHarvest = !s.autoHarvest; Game.save(); });
    toggleRow('⛽', 'Auto-fuel', 'Top the tank up from coins each dawn so drones never strand themselves.', !!s.autoFuel, () => { s.autoFuel = !s.autoFuel; Game.save(); });
    toggleRow('💰', 'Auto-sell surplus', 'Sell spare produce each dawn (keeps a small buffer, never mythics).', !!s.autoSell, () => { s.autoSell = !s.autoSell; Game.save(); });

    const compRow = document.createElement('div');
    compRow.className = 'row-card';
    compRow.innerHTML = `
      <div class="emoji">📚</div>
      <div class="info"><div class="name">Compendium</div><div class="sub">Track your progress: crops, recipes, animals & buildings collected.</div></div>
      <div class="actions"><button class="mini">Open</button></div>`;
    compRow.querySelector('button').onclick = () => { SOUNDS.tap(); openSheet('compendium'); };
    body.appendChild(compRow);

    // ---- Legacy (prestige): only once the whole valley is yours ----
    if (Game.canPrestige()) {
      const legRow = document.createElement('div');
      legRow.className = 'row-card backup-due';
      const stars = Game.legacyStars();
      legRow.innerHTML = `
        <div class="emoji">🌟</div>
        <div class="info"><div class="name">Start a New Legacy</div><div class="sub">You own the whole valley! Retire this farm to begin a fresh one — and keep a permanent <b>+10% sell price</b> per Legacy Star, forever.${stars ? ' You have ' + stars + ' ⭐.' : ''}</div></div>
        <div class="actions"><button class="mini gold">Retire →</button></div>`;
      legRow.querySelector('button').onclick = () => {
        SOUNDS.tap();
        confirmBox('🌟', 'Retire this farm and start a New Legacy? You keep a permanent +10% sell bonus, but this valley is reset.', 'Start New Legacy', () => {
          Game.startNewLegacy();
          location.reload();
        });
      };
      body.appendChild(legRow);
    }

    // ---- farm safety: backup & restore ----
    const safetyLabel = document.createElement('div');
    safetyLabel.className = 'section-label';
    safetyLabel.textContent = '💾 Keep your farm safe';
    body.appendChild(safetyLabel);

    const backupRow = document.createElement('div');
    const lb = s._flags.lastBackupAt;
    const lbDays = lb ? Math.floor((Date.now() - lb) / 86400000) : null;
    const lbTxt = lb == null ? 'never' : lbDays === 0 ? 'today' : lbDays === 1 ? '1 day ago' : `${lbDays} days ago`;
    backupRow.className = 'row-card' + (Game.backupDue() ? ' backup-due' : '');
    backupRow.innerHTML = `
      <div class="emoji">🔐</div>
      <div class="info">
        <div class="name">Backup this farm</div>
        <div class="sub">Your farm autosaves with 3 rotating safety snapshots. For extra safety, copy a farm code or download a file you can restore anywhere.</div>
        <div class="sub">Last backup: ${lbTxt}</div>
      </div>
      <div class="actions">
        <button class="mini blue">Copy code</button>
        <button class="mini">Download</button>
      </div>`;
    const [copyBtn, dlBtn] = backupRow.querySelectorAll('button');
    copyBtn.onclick = async () => {
      const code = Game.exportCode();
      updateHud();
      try {
        await navigator.clipboard.writeText(code);
        toast('🔐 Farm code copied — store it somewhere safe!', 'good');
      } catch (e) {
        window.prompt('Copy your farm code:', code);
      }
      if (sheetOpen === 'menu') renderSheet(); // refresh the last-backup line
    };
    dlBtn.onclick = () => {
      const code = Game.exportCode();
      updateHud();
      const a = document.createElement('a');
      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(code);
      a.download = `${Game.state.farmName.replace(/[^a-z0-9]+/gi, '-')}-day${Game.state.day}-y${Game.state.year}.harvestfarm.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('🔐 Backup file downloaded!', 'good');
      if (sheetOpen === 'menu') renderSheet();
    };
    body.appendChild(backupRow);

    const restoreRow = document.createElement('div');
    restoreRow.className = 'row-card';
    restoreRow.style.flexWrap = 'wrap';
    restoreRow.innerHTML = `
      <div class="emoji">📥</div>
      <div class="info"><div class="name">Restore a farm</div><div class="sub">Paste a farm code below — it replaces the current farm.</div></div>
      <textarea class="restore-input" placeholder="HE1.…" rows="2"></textarea>
      <button class="mini blue" style="margin-top:8px">Restore</button>`;
    const ta = restoreRow.querySelector('textarea');
    restoreRow.querySelector('button').onclick = () => {
      const code = ta.value;
      if (!code.trim()) { toast('Paste a farm code first!', 'bad'); return; }
      confirmBox('📥', 'Restore this farm code? Your current farm will be replaced.', 'Restore', () => {
        const r = Game.importCode(code);
        if (r.ok) { toast('📥 Farm restored — welcome back!', 'good'); closeSheet(); updateHud(); }
        else toast(r.why, 'bad');
      });
    };
    body.appendChild(restoreRow);

    const persistRow = document.createElement('div');
    persistRow.className = 'row-card';
    persistRow.innerHTML = `
      <div class="emoji">🛡️</div>
      <div class="info"><div class="name">Protected storage</div><div class="sub" id="persist-status">Checking…</div></div>`;
    body.appendChild(persistRow);
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(on => {
        const el = document.getElementById('persist-status');
        if (el) el.textContent = on
          ? 'On — the browser has promised not to evict this farm\'s data.'
          : 'Standard — add this game to your Home Screen to strengthen protection, and keep a farm code as backup.';
      });
    }

    const soundRow = document.createElement('div');
    soundRow.className = 'row-card';
    soundRow.innerHTML = `
      <div class="emoji">${s.settings.sound ? '🔊' : '🔇'}</div>
      <div class="info"><div class="name">Sound effects</div></div>
      <div class="actions"><button class="mini">${s.settings.sound ? 'Turn off' : 'Turn on'}</button></div>`;
    soundRow.querySelector('button').onclick = () => { s.settings.sound = !s.settings.sound; SOUNDS.tap(); renderSheet(); };
    body.appendChild(soundRow);

    // developer preview: the full Toni arc, compressed to ~10 seconds
    const devRow = document.createElement('div');
    devRow.className = 'row-card';
    devRow.innerHTML = `
      <div class="emoji">🛠️</div>
      <div class="info"><div class="name">Developer</div><div class="desc">Sunflower demo: plants a crop that rises in ~10s</div></div>
      <div class="actions"><button class="mini">Run</button></div>`;
    devRow.querySelector('button').onclick = () => {
      const r = Game.devToniDemo();
      if (r) { SOUNDS.tap(); closeSheet(); Renderer.centerOn(r.x + 0.5, r.y + 0.5); }
    };
    body.appendChild(devRow);

    // Comfy Mode: large-text toggle (rem-based type scales the whole UI)
    const bigRow = document.createElement('div');
    bigRow.className = 'row-card';
    bigRow.innerHTML = `
      <div class="emoji">🔍</div>
      <div class="info"><div class="name">Large text</div><div class="sub">Comfy Mode — bigger type across every panel</div></div>
      <div class="actions"><button class="mini">${s.settings.bigText ? 'Turn off' : 'Turn on'}</button></div>`;
    bigRow.querySelector('button').onclick = () => {
      s.settings.bigText = !s.settings.bigText;
      applyTextScale();
      SOUNDS.tap();
      resetSheetSession(); // the type scale changed — remeasure the sheet
      renderSheet();
    };
    body.appendChild(bigRow);

    // Message log — nothing a toast says is ever lost
    const logRow = document.createElement('div');
    logRow.className = 'row-card';
    logRow.innerHTML = `
      <div class="emoji">${I.icon('clipboard')}</div>
      <div class="info"><div class="name">Message log</div><div class="sub">${toastLog.length ? toastLog.length + ' recent message' + (toastLog.length > 1 ? 's' : '') : 'Recent farm messages'}</div></div>
      <div class="actions"><button class="mini">View</button></div>`;
    logRow.querySelector('button').onclick = () => { SOUNDS.tap(); openSheet('log'); };
    body.appendChild(logRow);

    const help = document.createElement('div');
    help.className = 'row-card';
    help.innerHTML = `
      <div class="emoji">💡</div>
      <div class="info">
        <div class="name">How to play</div>
        <div class="sub">Tap any tile to see what it can do — till, plant, water, fertilize, harvest. Keep crops watered or they die; harvest before they rot; plant in the right season. Feed your animals or they get sick. Powered equipment needs fuel!</div>
      </div>`;
    body.appendChild(help);

    const reset = document.createElement('div');
    reset.className = 'row-card';
    reset.innerHTML = `
      <div class="emoji">🗑️</div>
      <div class="info"><div class="name">Start over</div><div class="sub">Erase this farm forever</div></div>
      <div class="actions"><button class="mini danger">Reset</button></div>`;
    reset.querySelector('button').onclick = () => {
      confirmBox('⚠️', 'Really erase your farm and start over?\nThis cannot be undone!', 'Erase', () => {
        Game.resetGame();
        location.reload(); // back to the setup screen
      });
    };
    body.appendChild(reset);
  }

  // ---------------- farmhands sheet ----------------
  function renderFarmhands(body) {
    const s = Game.state;
    setSheetHeader('👷', 'Farmhands', 'Hire a crew to work your land');
    setTabs(null);
    const workers = s.workers || [];
    const bill = Game.workerWageBill();

    const head = document.createElement('div');
    head.className = 'order-card';
    head.innerHTML = `
      <div style="font-weight:900;font-size:0.9375rem;margin-bottom:4px">👷 Your crew: ${workers.length}/${D.WORKER.maxCrew}</div>
      <div style="font-weight:800;font-size:0.8125rem;line-height:1.7">
        💵 Daily wage bill: <b>${$$(bill)}</b> (paid at dawn)<br>
        Each hand works one job on one patch. Train a hand to work faster — for a higher wage.
      </div>`;
    body.appendChild(head);

    const canHire = workers.length < D.WORKER.maxCrew;
    const hireRow = document.createElement('div');
    hireRow.className = 'row-card';
    hireRow.innerHTML = `
      <div class="emoji">🤝</div>
      <div class="info"><div class="name">Hire a farmhand</div><div class="sub">Signing fee ${$$(D.WORKER.hireCost)}, then ${$$(D.WORKER.baseWage)}/day. Starts as a Harvester on the whole farm — reassign below.</div></div>
      <div class="actions"><button class="mini gold" ${canHire ? '' : 'disabled'}>${canHire ? 'Hire ' + $$(D.WORKER.hireCost) : 'Crew full'}</button></div>`;
    hireRow.querySelector('button').onclick = () => { if (Game.hireWorker('harvest')) { updateHud(); renderSheet(); } };
    body.appendChild(hireRow);

    if (!workers.length) {
      const tip = document.createElement('div');
      tip.className = 'row-card';
      tip.innerHTML = `<div class="emoji">💡</div><div class="info"><div class="sub">Farmhands run a big farm hands-free: a <b>Harvester</b> brings in ripe crops, a <b>Waterer</b> keeps them alive, a <b>Planter</b> re-sows empty beds, a <b>Tiller</b> opens new ground, and a <b>Rancher</b> collects from your animals. Point each at the whole farm or a single plot.</div></div>`;
      body.appendChild(tip);
      return;
    }

    const jobKeys = Object.keys(D.WORKER_JOBS);
    const ownedZones = ['all', ...s.unlockedParcels.slice().sort((a, b) => a - b)];
    const zoneLabel = z => z === 'all' ? 'the whole farm' : 'plot ' + (z + 1);
    const cropKeys = Object.keys(D.CROPS);

    for (const w of workers) {
      const jd = D.WORKER_JOBS[w.job] || D.WORKER_JOBS.harvest;
      const card = document.createElement('div');
      card.className = 'row-card' + (w.unpaid ? ' backup-due' : '');
      const wage = Game.workerWage(w);
      const maxed = w.level >= D.WORKER.maxLevel;
      const seedLine = w.job === 'plant' ? ` · sowing <b>${esc(D.ITEMS[w.seed] ? D.ITEMS[w.seed].name : w.seed)}</b>` : '';
      const verb = jd.verb.charAt(0).toUpperCase() + jd.verb.slice(1);
      card.innerHTML = `
        <div class="emoji">${jd.emoji}</div>
        <div class="info">
          <div class="name">${esc(w.name)} · Lv ${w.level} ${jd.name}</div>
          <div class="sub">${w.unpaid ? '⚠️ Unpaid — resting until payday. ' : ''}${verb} <b>${zoneLabel(w.zone)}</b>${seedLine} · wage ${$$(wage)}/day</div>
        </div>`;
      const acts = document.createElement('div');
      acts.className = 'actions';
      acts.style.flexWrap = 'wrap';

      const cycleBtn = (label, cls, onTap) => {
        const b = document.createElement('button');
        b.className = 'mini' + (cls ? ' ' + cls : '');
        b.textContent = label;
        b.onclick = () => { SOUNDS.tap(); onTap(); renderSheet(); };
        acts.appendChild(b);
        return b;
      };
      cycleBtn('Job: ' + jd.name, '', () => {
        const i = jobKeys.indexOf(w.job);
        Game.assignWorker(w.uid, { job: jobKeys[(i + 1) % jobKeys.length] });
      });
      cycleBtn('Patch: ' + (w.zone === 'all' ? 'all' : 'plot ' + (w.zone + 1)), '', () => {
        const i = ownedZones.indexOf(w.zone);
        Game.assignWorker(w.uid, { zone: ownedZones[(i + 1) % ownedZones.length] });
      });
      if (w.job === 'plant') {
        cycleBtn('Seed: ' + (D.ITEMS[w.seed] ? D.ITEMS[w.seed].emoji : '🌱'), '', () => {
          const i = cropKeys.indexOf(w.seed);
          Game.assignWorker(w.uid, { seed: cropKeys[(i + 1) % cropKeys.length] });
        });
      }
      const upBtn = document.createElement('button');
      upBtn.className = 'mini gold';
      upBtn.textContent = maxed ? 'Max Lv' : 'Train ' + $$(Game.workerUpCost(w));
      upBtn.disabled = maxed;
      upBtn.onclick = () => { if (Game.upgradeWorker(w.uid)) { updateHud(); renderSheet(); } };
      acts.appendChild(upBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'mini danger';
      delBtn.textContent = 'Let go';
      delBtn.onclick = () => {
        SOUNDS.tap();
        confirmBox(jd.emoji, `Let ${w.name} go? There's no refund on the signing fee.`, 'Let go', () => { Game.dismissWorker(w.uid); renderSheet(); });
      };
      acts.appendChild(delBtn);
      card.appendChild(acts);
      body.appendChild(card);
    }
  }

  // ---------------- build placement ----------------
  function buildLabelFor(type, n) {
    const def = D.BUILDINGS[type];
    const tail = n ? `${def.name} ×${n} placed — tap ✕ when done` : `Place the ${def.name}`;
    return `${I.building(type)} <span>${tail}</span>`;
  }

  function startBuild(type) {
    buildType = type;
    placedCount = 0;
    closeSheet();
    closeBubble();
    const def = D.BUILDINGS[type];
    // start ghost near the camera focus
    const c = Renderer.screenToTile(Renderer.vw / 2, Renderer.vh / 2);
    Renderer.setGhost({ type, x: Math.round(c.x - def.w / 2), y: Math.round(c.y - def.h / 2) });
    $('build-label').innerHTML = buildLabelFor(type, 0);
    $('buildbar').classList.remove('hidden');
    toast('Tap the map to move it, press ✓ to drop. Keep dropping more — tap ✕ when done.');
  }

  function endBuild() {
    buildType = null;
    placedCount = 0;
    Renderer.setGhost(null);
    $('buildbar').classList.add('hidden');
  }

  // re-arm a fresh ghost after a drop, so the player keeps placing without
  // reopening the shop. Nudge one footprint to the right; if that's off-land,
  // try below, else keep the spot (the ghost stays visible; a tap repositions).
  function armNext(type, x, y) {
    const def = D.BUILDINGS[type];
    let nx = x + def.w, ny = y;
    if (Game.placeCheck(type, nx, ny).state === 'blocked') { nx = x; ny = y + def.h; }
    if (Game.placeCheck(type, nx, ny).state === 'blocked') { nx = x; ny = y; }
    Renderer.setGhost({ type, x: nx, y: ny });
    $('build-label').innerHTML = buildLabelFor(type, placedCount);
  }

  // place exactly one building at the ghost; on success STAY in build mode and
  // arm the next ghost. `force` clears crops/soil (passed by the confirm accept).
  function tryPlace(force) {
    const ghost = Renderer.getGhost();
    if (!ghost) return;
    const { type, x, y } = ghost;
    const def = D.BUILDINGS[type];
    const chk = Game.placeCheck(type, x, y);
    if (chk.state === 'ok' || (chk.state === 'replace' && force)) {
      if (Game.placeBuilding(type, x, y, force)) { placedCount++; updateHud(); armNext(type, x, y); }
      return; // false = not enough cash (sim toasted) — stay put, wait for next tap or ✕
    }
    if (chk.state === 'replace') {
      const parts = [];
      if (chk.crops) parts.push(`${chk.crops} crop${chk.crops > 1 ? 's' : ''}`);
      if (chk.soil) parts.push(`${chk.soil} tilled plot${chk.soil > 1 ? 's' : ''}`);
      confirmBox(def.emoji, `Build the ${def.name} here? It will clear ${parts.join(' and ')} underneath.`, 'Build here', () => tryPlace(true));
      return;
    }
    toast('Can’t build there — the flower, a sprout, another building or unowned land is in the way.', 'bad');
  }

  /* ---------------- tile action bubble ----------------
     Tapping a plain farmable tile pops a small bubble anchored to it, listing
     only what that tile can do right now. One bubble at a time; a pan, pinch,
     outside tap or executed action puts it away. Pure DOM — no canvas work. */
  let bubbleAt = null;        // tile {x,y} the open bubble belongs to
  let bubbleHideTimer = null;

  function closeBubble() {
    bubbleAt = null;
    const el = $('bubble');
    if (el.classList.contains('hidden') || bubbleHideTimer) return;
    el.classList.add('closing');
    bubbleHideTimer = setTimeout(() => {
      bubbleHideTimer = null;
      el.classList.add('hidden');
      el.classList.remove('closing');
      el.innerHTML = ''; // no stale actions linger in the DOM
    }, 150);
  }

  // action list for a farmable tile — buildings, sprouts, locked land and the
  // The bubble is only ever shown for a GROWING crop that still has a genuine
  // choice left — every other tile type resolves to a one-tap auto-action or
  // the seed picker in handleTap. Actions here: Water (only when the can is
  // empty — a full can auto-waters), Fertilize (an optional spend), Dig up
  // (deliberate/destructive). Validity mirrors Game.applyTool rules.
  function tileActions(x, y) {
    const t = Game.tileAt(x, y);
    const c = t && t.crop;
    if (!c || c.dead) return [];
    const s = Game.state;
    const acts = [];
    if (c.water <= 0.55) { // reached here only with an empty can (else auto-watered)
      const empty = s.can.water <= 0;
      acts.push({
        cls: 'act-water', icon: I.icon('drop'), label: 'Water',
        chip: empty ? null : `💧${s.can.water}`,
        disabled: empty,
        hint: empty ? 'refill at the well' : null,
        attention: !empty && ((c.wilt || 0) > 0.3 || !Game.seasonOK(c.id, x, y)),
        run: () => { if (Game.applyTool('water', x, y) === 'empty') toast('Watering can is empty — tap the Well! 💧', 'bad'); },
      });
    }
    if (!c.fert && !Game.isBlessed(x, y)) {
      const cost = D.fertCost(c.id);
      acts.push({
        cls: 'act-fert', icon: I.icon('sparkle'), label: 'Fertilize',
        chip: I.icon('coin') + fmt(cost), chipCls: 'gold',
        run: () => { if (Game.applyTool('fert', x, y) === 'broke') toast(`Fertilizer costs ${$$(cost)} for this crop (30% of its seed price)!`, 'bad'); },
      });
    }
    acts.push({ cls: 'act-dig', icon: I.icon('shovel'), label: 'Dig up', run: () => Game.applyTool('shovel', x, y) });
    return acts;
  }

  function openBubble(x, y, acts) {
    const el = $('bubble');
    if (bubbleHideTimer) { clearTimeout(bubbleHideTimer); bubbleHideTimer = null; }
    el.classList.remove('closing');
    bubbleAt = { x, y };
    el.innerHTML = `<div class="bubble-card">${acts.map(a => `
      <button class="bubble-act ${a.cls}${a.primary ? ' primary' : ''}${a.attention ? ' attention' : ''}"${a.disabled ? ' disabled' : ''} aria-label="${a.label}">
        <span class="ba-btn">${a.icon}${a.chip ? `<span class="ba-chip${a.chipCls ? ' ' + a.chipCls : ''}">${a.chip}</span>` : ''}</span>
        <span class="ba-label">${a.label}</span>${a.hint ? `<span class="ba-hint">${a.hint}</span>` : ''}
      </button>`).join('')}</div><div class="bubble-tail"></div>`;
    el.querySelectorAll('.bubble-act').forEach((b, i) => {
      b.onclick = () => { acts[i].run(); updateHud(); closeBubble(); };
    });
    // anchor above the tile, clamped to the viewport; flip below near the top
    el.classList.remove('hidden');
    el.style.left = '0px';
    el.style.top = '0px';
    const a = Renderer.tileToScreen(x + 0.5, y + 0.5);
    const M = 12, w = el.offsetWidth, h = el.offsetHeight;
    const lift = 12 + 18 * Renderer.cam.z; // clear the tile art at any zoom
    const left = Math.max(M, Math.min(a.x - w / 2, Renderer.vw - M - w));
    let top = a.y - lift - h;
    const below = top < M;
    if (below) top = Math.min(a.y + lift * 0.75, Renderer.vh - M - h);
    el.classList.toggle('below', below);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    const tailX = Math.max(28, Math.min(a.x - left, w - 28)); // clear of the corner radius
    el.querySelector('.bubble-tail').style.left = tailX + 'px';
    el.style.transformOrigin = `${tailX}px ${below ? '-8px' : (h + 8) + 'px'}`;
    // restart the pop-in even when hopping tile to tile
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    SOUNDS.tap();
  }

  // ---------------- pointer input ----------------
  const pointers = new Map();
  let pinchDist = 0;
  let dragStart = null;
  let moved = false;

  function bindInput(canvas) {
    // stop the browser from synthesizing a click after canvas touches —
    // it would land on UI that opened underneath the finger
    canvas.addEventListener('touchend', e => e.preventDefault(), { passive: false });

    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      if (pointers.size === 1) dragStart = { x: e.clientX, y: e.clientY, camX: Renderer.cam.x, camY: Renderer.cam.y };
      if (pointers.size === 2) {
        closeBubble(); // a pinch is starting
        const [p1, p2] = [...pointers.values()];
        pinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      }
    });

    canvas.addEventListener('pointermove', e => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;

      if (pointers.size === 2) { // pinch zoom
        const [p1, p2] = [...pointers.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (pinchDist > 0) {
          Renderer.cam.z *= d / pinchDist;
          Renderer.clampCam();
        }
        pinchDist = d;
        moved = true;
        return;
      }

      if (!dragStart) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.hypot(dx, dy) > 9) moved = true;

      if (buildType) { // dragging moves the ghost
        if (moved) moveGhost(e.clientX, e.clientY);
        return;
      }

      // one finger pans the camera
      if (moved) closeBubble();
      Renderer.cam.x = dragStart.camX - dx / Renderer.cam.z;
      Renderer.cam.y = dragStart.camY - dy / Renderer.cam.z;
      Renderer.clampCam();
    });

    const upHandler = e => {
      const wasTap = !moved && pointers.size === 1;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (wasTap) handleTap(e.clientX, e.clientY);
      if (pointers.size === 0) dragStart = null;
    };
    canvas.addEventListener('pointerup', upHandler);
    canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); if (pointers.size === 0) dragStart = null; });

    // desktop niceties
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      closeBubble();
      Renderer.cam.z *= e.deltaY < 0 ? 1.1 : 0.9;
      Renderer.clampCam();
    }, { passive: false });
  }

  function tileFromScreen(sx, sy) {
    const w = Renderer.screenToTile(sx, sy);
    return { x: Math.floor(w.x), y: Math.floor(w.y) };
  }

  function moveGhost(sx, sy) {
    const def = D.BUILDINGS[buildType];
    const w = Renderer.screenToTile(sx, sy);
    Renderer.setGhost({
      type: buildType,
      x: Math.round(w.x - def.w / 2),
      y: Math.round(w.y - def.h / 2),
    });
  }

  function handleTap(sx, sy) {
    if (buildType) { moveGhost(sx, sy); return; }
    const wpt = Renderer.screenToTile(sx, sy);
    Renderer.addStartle(wpt.x, wpt.y);
    const { x, y } = tileFromScreen(sx, sy);

    // THE Sunflower: its tile opens the story/blessing — never a bubble
    const toni = Game.toniAt(x, y);
    if (toni) { closeBubble(); openToni(toni); return; }

    // a second tap on the bubbled tile just puts the bubble away
    if (bubbleAt && bubbleAt.x === x && bubbleAt.y === y) { closeBubble(); return; }
    closeBubble();

    const t = Game.tileAt(x, y);
    if (!t) return;

    if (t.obj && t.obj.t === 'b') { // buildings keep their tap behaviors
      const b = Game.state.buildings[t.obj.i];
      if (!b) return;
      if (D.BUILDINGS[b.type] && D.BUILDINGS[b.type].decor) {
        toast('🏡 Home sweet home.'); SOUNDS.tap(); return; // decorative — no panel
      }
      if (b.type === 'well') {
        // refill when there's room; a tap on an idle well opens its panel
        // (info + the sell-back row — otherwise unreachable)
        if (!Game.refillCan()) { openSheet('b:' + t.obj.i); SOUNDS.tap(); }
      } else {
        showBuildingCoverage(b);
        openSheet('b:' + t.obj.i);
        SOUNDS.tap();
      }
      updateHud();
      return;
    }

    if (!Game.isUnlocked(x, y)) { // FOR SALE land keeps its confirm
      const p = Game.parcelAt(x, y);
      if (p >= 0) {
        const def = D.PARCELS[p];
        confirmBox('🚧', `Buy this ${def.w}×${def.h} parcel of land for ${$$(def.cost)}?`, 'Buy land', () => {
          if (Game.buyParcel(p)) updateHud();
        });
      }
      return;
    }

    if (Game.sproutAt(x, y)) { toast('🌟 Something is glowing beneath the soil…'); return; }

    // One tap does the obvious thing. A chooser appears ONLY when there is a
    // real decision to make (which seed) or a real choice/deliberate action
    // (spend on fertilizer, or dig up a living crop).
    const c = t.crop;
    if (c && !c.dead && c.prog >= 1) { Game.applyTool('harvest', x, y); updateHud(); return; } // Harvest
    if (c && c.dead) { Game.smartAction(x, y); updateHud(); return; }                           // Clear (explains first)
    if (!c && t.k === 'grass') {                                                                // Till
      if (Game.applyTool('hoe', x, y) === 'nofuel') toast('⛽ Out of fuel — hand-tilling one plot. Buy diesel in the Shop!', 'bad');
      updateHud(); return;
    }
    if (!c && t.k === 'soil') { plantTarget = { x, y }; openSheet('seeds'); return; }           // choose a seed
    if (c && c.water <= 0.55 && Game.state.can.water > 0) {                                     // thirsty → just water it
      Game.applyTool('water', x, y); updateHud(); return;
    }

    // what's left is a growing crop with a genuine choice (fertilize / dig, or
    // a refill-the-can hint) → the bubble
    const acts = tileActions(x, y);
    if (acts.length) openBubble(x, y, acts);
  }

  // tapping a greenhouse flashes its sheltered 6×6 zone on the map
  function showBuildingCoverage(b) {
    if (b && b.type === 'greenhouse' && Renderer.flashCoverage) {
      Renderer.flashCoverage(b.x - 2, b.y - 2, b.x + 4, b.y + 4, 2);
    }
  }

  // ---------------- new farm setup ----------------
  function showSetup(onDone) {
    $('setup').classList.remove('hidden');
    const cards = $('diff-cards');
    cards.innerHTML = '';
    let chosen = 'classic';
    for (const d of D.DIFFICULTIES) {
      const card = document.createElement('button');
      card.className = 'diff-card' + (d.id === chosen ? ' selected' : '');
      card.innerHTML = `
        <span class="d-emoji">${d.emoji}</span>
        <span class="d-info">
          <span class="d-name">${d.name}</span><br>
          <span class="d-blurb">${d.blurb}</span>
        </span>
        <span class="d-coins">${$$(d.coins)}</span>`;
      card.onclick = () => {
        chosen = d.id;
        SOUNDS.tap();
        cards.querySelectorAll('.diff-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      };
      cards.appendChild(card);
    }
    $('setup-start').onclick = () => {
      const name = $('farm-name').value.trim() || 'My Farm';
      Game.applySetup(name, chosen);
      $('setup').classList.add('hidden');
      SOUNDS.levelup();
      toast(`🌱 Welcome to ${Game.state.farmName}! Tap a grassy tile to till it.`);
      updateHud();
      onDone && onDone();
    };
  }

  // ---------------- level up splash ----------------
  // never splash over an open sheet — park it until the sheet closes
  let pendingLevelUp = null;
  function showLevelUp(level) {
    if (sheetShowing()) { pendingLevelUp = Math.max(pendingLevelUp || 0, level); return; }
    SOUNDS.levelup();
    $('levelup-num').textContent = level;
    const bonus = Math.round(D.repBonus(level) * 100);
    $('levelup-unlocks').innerHTML =
      `Your farm's reputation is growing!<br><span class="unlock">⚖️ All goods now sell for +${bonus}%</span>`;
    $('levelup').classList.remove('hidden');
    // tap to dismiss — but ALSO auto-hide after a few seconds so a splash left
    // undismissed can never sit on top of the season-care rescue sheet (playtest bug)
    let autoHide = null;
    const dismiss = () => {
      if (autoHide) { clearTimeout(autoHide); autoHide = null; }
      $('levelup').classList.add('hidden');
      document.removeEventListener('pointerdown', dismiss, true);
    };
    document.addEventListener('pointerdown', dismiss, true);
    autoHide = setTimeout(dismiss, 4500);
  }

  /* ---------------- THE Sunflower (the Toni Variety) ----------------
     First tap → a 1930s front page. Closing it (and any later tap) → the
     blessing card. Fresh ids (#toni-paper / #toni-card) inside one overlay
     container — #modal is never repurposed. */
  let toniOpen = null; // {x, y} of the flower whose story is on screen

  function closeToni() {
    const o = $('toni-overlay');
    o.classList.add('hidden');
    o.innerHTML = '';
  }

  // the bloom cinematic: the renderer owns the camera push-in, the soil stir, the
  // slow rise and the golden spotlight. Here we score it — a curious "huh?" as the
  // dirt trembles, a rising chime as she crests, and a title card as she basks.
  // Deliberately NOT a toast: she announces herself with a scene, not a stack line.
  const toniTimers = [];
  function toniRevealScene(x, y) {
    Renderer.revealToni(x, y);
    toniTimers.forEach(clearTimeout); toniTimers.length = 0;
    toniTimers.push(setTimeout(() => SOUNDS.huh(), 2350));   // the soil stirs (camera settled)
    toniTimers.push(setTimeout(() => SOUNDS.toni(), 3950));  // she begins to rise
    toniTimers.push(setTimeout(() => {                       // she basks — the title card
      let el = $('toni-reveal');
      if (!el) { el = document.createElement('div'); el.id = 'toni-reveal'; document.body.appendChild(el); }
      el.innerHTML = '<div class="tr-kicker">a once-in-a-lifetime bloom</div>'
        + '<div class="tr-title">The Sunflower</div>'
        + '<div class="tr-variety">Toni’s Variety</div>'
        + '<div class="tr-sub">tap her to read the tale</div>';
      el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
      clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3400);
    }, 8600));
  }

  function openToni(toni) {
    SOUNDS.tap();
    toniOpen = { x: toni.x, y: toni.y };
    if (!toni.seen) {
      toni.seen = true; // the story keeps, even if the page is closed mid-read
      Game.save();
      showToniPaper();
    } else {
      showToniCard();
    }
  }

  // engraving-style sunflower: sepia strokes only, like a period woodcut
  const TONI_ENGRAVING = `
    <svg viewBox="0 0 120 150" class="tp-engraving" aria-hidden="true">
      <g fill="none" stroke="#5f4626" stroke-width="1.3" stroke-linecap="round">
        <path d="M60 142 C57 110 62 88 60 62"/>
        <path d="M60 118 C48 112 40 114 34 106 C46 104 54 108 60 114"/>
        <path d="M60 98 C72 92 80 94 87 86 C75 84 66 88 60 94"/>
        ${[...Array(14)].map((_, i) => {
          const a = (i / 14) * Math.PI * 2;
          const x1 = 60 + Math.cos(a) * 14, y1 = 44 + Math.sin(a) * 14;
          const x2 = 60 + Math.cos(a) * 30, y2 = 44 + Math.sin(a) * 30;
          const px = -Math.sin(a) * 4.6, py = Math.cos(a) * 4.6;
          return `<path d="M${(x1 + px).toFixed(1)} ${(y1 + py).toFixed(1)} Q${x2.toFixed(1)} ${y2.toFixed(1)} ${(x1 - px).toFixed(1)} ${(y1 - py).toFixed(1)}"/>`;
        }).join('')}
        <circle cx="60" cy="44" r="14"/>
        <path d="M50 38 Q60 34 70 38 M48 44 Q60 40 72 44 M50 50 Q60 46 70 50 M54 55 Q60 52 66 55" stroke-width="0.9"/>
        <path d="M22 142 h76 M30 146 h60" stroke-width="0.9"/>
        <path d="M14 60 l7 3 M104 52 l-7 3 M20 90 l7 1 M100 96 l-7 1" stroke-width="0.8"/>
      </g>
    </svg>`;

  function showToniPaper() {
    const o = $('toni-overlay');
    o.innerHTML = `
      <div id="toni-paper" role="dialog" aria-label="The Valley Herald" style="background:rgba(24,16,6,.62)">
        <div class="tp-sheet">
          <div class="tp-page" id="toni-page1">
            <div class="tp-ears"><span>est. 1897</span><span>Thursday Morning, August 14, 1930</span><span>TWO CENTS</span></div>
            <h1 class="tp-masthead">The Valley Herald</h1>
            <div class="tp-rule"></div>
            <h2 class="tp-headline">THE GOLDEN GIANT BLOOMS AGAIN</h2>
            <div class="tp-subhead">“I planted turnips,” says Harlan Voss. “I got the whole sky.” — The Toni Variety returns after a generation</div>
            <div class="tp-cols">
              <p><span class="tp-lede">VALLEY COUNTY —</span> The Toni sunflower stands again. It rose Tuesday in a turnip row on the Voss place, and men who never left their fields have driven forty miles to look at it.</p>
              <p>No man planted it. The elders tell it plain: the seed falls from the hand of the big man upstairs, and no prayer steers it. It lands where it lands. That is the whole of the law.</p>
              <p>Harlan Voss, 34, swears it came up ordinary. “It looked like every turnip in the row,” he said. “I near pulled it twice. Then one morning it rose, and I understood I had never grown anything before in my life.”</p>
              <figure class="tp-figure">
                ${TONI_ENGRAVING}
                <figcaption>Artist’s rendering. No photograph has ever done it justice.</figcaption>
              </figure>
              <p>There is only ever one. Not one to a county — one to the world. When it stands in a man’s field, it stands in no other.</p>
              <h3 class="tp-crosshead">THE BLESSED GROUND</h3>
              <p>The field that holds her wants for nothing. Rain comes when the ground asks. The sun stays soft. Frost keeps out at the fence line as if told to. Everything near her thrives, and no plow may touch that land while she stands. She is the biggest and brightest thing ever to come out of plain dirt.</p>
              <p>Farmers here put her in their prayers at night. Not for rain. Not for prices. Just for the chance.</p>
              <p class="tp-note">You cannot hunt her. You can only keep your rows and hope, and know her when she rises.</p>
            </div>
            <button id="toni-flip" class="tp-btn">— flip the page —</button>
          </div>
          <div class="tp-page tp-blank hidden" id="toni-page2">
            <p class="tp-l1">Some farmers</p>
            <p class="tp-l2">never</p>
            <p class="tp-l3">even see it.</p>
            <p class="tp-l4">But some are lucky enough to have it.</p>
            <button id="toni-fold" class="tp-btn">fold the paper away</button>
          </div>
        </div>
      </div>`;
    o.classList.remove('hidden');
    $('toni-flip').onclick = () => {
      SOUNDS.tap();
      $('toni-page1').classList.add('hidden');
      $('toni-page2').classList.remove('hidden');
    };
    $('toni-fold').onclick = () => { SOUNDS.tap(); showToniCard(); };
  }

  function showToniCard() {
    const o = $('toni-overlay');
    o.innerHTML = `
      <div id="toni-card" role="dialog" aria-label="The Sunflower — Toni’s Variety" style="background:rgba(24,16,6,.62)">
        <div class="tc-inner">
          <div class="tc-flower">🌻</div>
          <h2>The Sunflower<span class="tc-var">— Toni’s Variety —</span></h2>
          <div class="tc-attrs">☀️ Endless sun · 🌧️ Rain when it’s needed · 💛 Love · ✨ Growth</div>
          <p class="tc-thrive">Everything on this land will thrive, forever.</p>
          <p class="tc-plain">This parcel is now blessed — crops here water themselves, never fail, and harvest themselves into your barn.</p>
          <button id="toni-ok" class="chunky green">Keep her standing</button>
          <button id="toni-harvest" class="chunky tc-harvest">🌻 Harvest her for a Glowing Seed</button>
          <button id="toni-story" class="tc-link">read the old story again</button>
        </div>
      </div>`;
    o.classList.remove('hidden');
    $('toni-ok').onclick = () => { SOUNDS.tap(); closeToni(); };
    $('toni-story').onclick = () => { SOUNDS.tap(); showToniPaper(); };
    $('toni-harvest').onclick = () => { SOUNDS.tap(); startToniHarvest(); };
  }

  // harvesting the flower: two confirms, on purpose — this is goodbye
  function startToniHarvest() {
    const at = toniOpen;
    if (!at) return;
    closeToni();
    confirmBox('🌻', 'Are you sure you want to harvest THE Sunflower?\nThe blessing will end, and the land will wake.', 'Harvest…', () => {
      confirmBox('🌟', 'This is goodbye — the flower becomes a single Glowing Seed, and this parcel returns to ordinary time.\n\nHarvest it, forever?', 'Harvest it', () => {
        if (Game.harvestToni(at.x, at.y)) updateHud();
      });
    });
  }

  function showAwaySummary(away) {
    const secs = away.seconds || 0;
    const h = Math.floor(secs / 3600);
    const m = Math.round((secs % 3600) / 60);
    const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
    const plural = (v, w) => `${v} ${w}${v === 1 ? '' : 's'}`;
    const lines = []; // itemized — only what actually happened
    if (away.crops > 0) lines.push(`🌾 ${plural(away.crops, 'crop')} finished growing`);
    if (away.produce > 0) lines.push(`📦 ${plural(away.produce, 'animal product')} ready`);
    if (away.droneHarvest > 0) {
      // on a toni farm the blessing does the tending — say so (drones otherwise)
      const blessed = Game.state && (Game.state.tonis || []).length > 0;
      lines.push(blessed ? `🌻 the land tended itself — ${plural(away.droneHarvest, 'harvest')} banked`
        : `🤖 drones banked ${plural(away.droneHarvest, 'harvest')}`);
    }
    if (away.expiredOrders > 0) lines.push(`📋 ${plural(away.expiredOrders, 'order')} expired — fresh ones arrived`);
    if (away.lost > 0) {
      const by = away.lostBy || {};
      const parts = [];
      if (by.dry) parts.push(`${by.dry} to thirst`);
      if (by.rot) parts.push(`${by.rot} to rot`);
      if (by.season) parts.push(`${by.season} to the season change`);
      lines.push(`🥀 ${plural(away.lost, 'crop')} didn't make it${parts.length ? ` (${parts.join(', ')})` : ''} — easy to replant!`);
    }
    const name = Game.state ? Game.state.farmName : 'your farm';
    const msg = `Welcome back to ${name}!\n\nWhile you were away (${dur}):\n\n`
      + (lines.length ? lines.join('\n') : 'Your farm rested peacefully.');
    confirmBox('🌙', msg, 'Let\'s farm!');
    const no = $('modal-no'), yes = $('modal-yes');
    const restore = () => { no.style.display = ''; no.textContent = 'Cancel'; }; // never leak into the next dialog
    const closeYes = yes.onclick;
    yes.onclick = () => { restore(); closeYes(); };
    const risk = Game.state ? Game.atRiskCrops() : [];
    if (risk.length) {
      // repurpose Cancel as the one-tap season rescue
      const ripe = risk.filter(e => e.ripe).length;
      no.textContent = `Rescue harvest${ripe ? ` (${ripe} ready)` : ''}`;
      no.onclick = () => {
        Game.harvestAtRisk();
        restore();
        $('modal-backdrop').classList.add('hidden');
        updateHud();
      };
    } else {
      no.style.display = 'none';
    }
  }

  // ---------------- init ----------------
  function init(canvas) {
    bindInput(canvas);
    applyTextScale(); // restore Comfy Mode large text

    // any tap outside the bubble (HUD, side buttons, sheets) puts it away;
    // canvas taps decide for themselves in handleTap (toggle / move / action)
    document.addEventListener('pointerdown', e => {
      if (!bubbleAt) return;
      if (e.target === canvas || $('bubble').contains(e.target)) return;
      closeBubble();
    }, true);

    $('btn-shop').onclick = () => { SOUNDS.tap(); sheetTab = null; openSheet('shop'); };
    $('btn-market').onclick = () => { SOUNDS.tap(); openSheet('market'); };
    $('btn-orders').onclick = () => { SOUNDS.tap(); openSheet('orders'); };
    $('btn-menu').onclick = () => { SOUNDS.tap(); openSheet('menu'); };
    $('sheet-close').onclick = () => { SOUNDS.tap(); closeSheet(); };
    $('sheet-backdrop').onclick = closeSheet;
    // tapping the dark backdrop of a confirm = Cancel (never the destructive OK)
    $('modal-backdrop').addEventListener('click', e => {
      if (e.target !== e.currentTarget) return;
      const no = $('modal-no');
      if (no.style.display !== 'none') no.click(); // away-summary hides Cancel — keep it modal
    });
    // desktop: Escape closes the top-most layer (modal > splash > sheet > build)
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('toni-overlay').classList.contains('hidden')) {
        // primary close: the paper folds to the blessing card; the card closes
        if (document.getElementById('toni-paper')) showToniCard();
        else closeToni();
      } else if (!$('modal-backdrop').classList.contains('hidden')) {
        const no = $('modal-no');
        if (no.style.display !== 'none') no.click();
      } else if (!$('levelup').classList.contains('hidden')) {
        $('levelup').classList.add('hidden');
      } else if (sheetShowing()) {
        closeSheet();
      } else if (bubbleAt) {
        closeBubble();
      } else if (buildType) {
        endBuild();
      }
    });
    $('sheet-tabs').addEventListener('scroll', updateTabFade, { passive: true });
    window.addEventListener('resize', updateTabFade);
    $('goal-chip').onclick = () => { SOUNDS.tap(); Game.cycleGoal(); updateGoalChip(); };

    // pause the 0.5s live-refresh while a finger is down inside the sheet —
    // rebuilding innerHTML replaces the very button being pressed (dropped taps)
    $('sheet').addEventListener('pointerdown', () => { sheetHeld++; }, true);
    const sheetRelease = () => {
      if (!sheetHeld) return;
      sheetHeld = 0;
      // let the tap's click event land on the old DOM first, then catch up
      if (renderQueued) setTimeout(() => {
        if (renderQueued && !sheetHeld && sheetOpen) { renderQueued = false; renderSheet(); }
      }, 60);
    };
    document.addEventListener('pointerup', sheetRelease, true);
    document.addEventListener('pointercancel', sheetRelease, true);

    $('build-ok').onclick = () => tryPlace(false);
    $('build-cancel').onclick = () => {
      SOUNDS.tap();
      if (placedCount) toast(`Done — ${placedCount} placed.`, 'good');
      endBuild();
    };

    // game events
    Game.on('toast', toast);
    Game.on('sound', name => SOUNDS[name] && SOUNDS[name]());
    Game.on('fx', f => {
      switch (f.kind) {
        case 'float':     Renderer.addFloat(f.x, f.y, f.text, f.color); break;
        case 'till':      Renderer.fxTill(f.x, f.y); break;
        case 'plant':     Renderer.fxPlant(f.x, f.y, f.color); break;
        case 'water':     Renderer.fxWater(f.x, f.y); break;
        case 'harvest':   Renderer.fxHarvest(f.x, f.y, f.data); break;
        case 'clear':     Renderer.fxClear(f.x, f.y); break;
        case 'lightning': Renderer.fxLightning(f.x, f.y); break;
        case 'toni':      toniRevealScene(f.x, f.y); break;
        default:          Renderer.addBurst(f.x, f.y, f.color);
      }
    });
    Game.on('levelup', showLevelUp);
    Game.on('goal', () => { updateGoalChip(); Renderer.addGlintBurst(); });
    Game.on('orders', () => { if (sheetOpen === 'orders') renderSheet(); });
    Game.on('season', () => { if (sheetOpen === 'seeds') renderSheet(); });
    // dawn of a season's last day: banner + auto-open the Season Care sheet
    Game.on('care', info => {
      $('levelup').classList.add('hidden'); // a reward splash must never bury the rescue sheet
      toast(`⏳ Last day of ${info.season}! ${info.n} crop${info.n > 1 ? 's' : ''} won't survive ${info.next} — here's the rescue list (also in the ⚙️ Menu).`, 'bad');
      // don't clobber a sheet the player is using (typing a farm code, mid-
      // purchase…) — the toast already points at the Menu entry
      if (!sheetShowing()) openSheet('care');
    });

    // switching / buying a farm swaps the whole world — recenter and refresh
    const onFarmChange = () => {
      closeBubble();
      const s = Game.state;
      Renderer.centerOn((s.w || 20) / 2, (s.h || 15) / 2);
      updateHud(); updateGoalChip();
    };
    Game.on('farmbought', onFarmChange);
    Game.on('farmswitch', (i, digest) => {
      onFarmChange();
      // one gentle "while you were away" digest for the farm you just returned to
      if (digest && (digest.banked > 0 || digest.grew > 0)) {
        const s = Game.state;
        const name = (s.farmName || 'This farm');
        const parts = [];
        if (digest.banked > 0) parts.push(`banked ${digest.banked} harvest${digest.banked > 1 ? 's' : ''}`);
        if (digest.grew > 0) parts.push(`${digest.grew} crop${digest.grew > 1 ? 's' : ''} ripened`);
        setTimeout(() => Game.toast(`🌻 While you were away, ${name} ${parts.join(' & ')}.`, 'good'), 350);
      }
    });

    updateHud();
  }

  // periodic refresh of open panels with live timers
  let refreshAcc = 0;
  function update(dt) {
    refreshAcc += dt;
    if (refreshAcc > 0.5) {
      refreshAcc = 0;
      updateAmbience();
      updateHud();
      if (sheetOpen && (sheetOpen.startsWith('b:') || sheetOpen === 'orders' || sheetOpen === 'care')) {
        if (sheetHeld) renderQueued = true; // never rebuild under a finger
        else renderSheet();
      }
    }
  }

  return { init, update, toast, updateHud, showAwaySummary, showSetup, fxArrive };
})();
