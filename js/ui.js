/* ============ Harvest Empire — UI, input & sound ============ */
'use strict';

const UI = (() => {
  const D = DATA;
  const $ = id => document.getElementById(id);
  const $$ = D.$; // money formatter
  const I = window.Icons;
  const REDUCED = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const fmt = n => Math.round(n).toLocaleString();
  // gold coin-chip price button (tabindex -1: the card/row is the tap target)
  const chip = (cost, extra) => `<button class="buy${extra ? ' ' + extra : ''}" tabindex="-1">${I.icon('coin')}<span>${fmt(cost)}</span></button>`;
  // idempotent innerHTML writer (renderSheet & updateHud rerun constantly)
  function setIcon(el, html) { if (el._ih !== html) { el._ih = html; el.innerHTML = html; } }

  let tool = 'auto';
  let seed = 'turnip';          // currently selected seed for plant tool
  let buildType = null;         // building being placed
  let sheetOpen = null;         // current sheet id
  let sheetTab = null;
  let lastPaint = null;         // last tile painted during drag

  // ---------------- sound (tiny WebAudio synth) ----------------
  let actx = null;
  function beep(freq, dur, type, vol, delay) {
    if (!Game.state || !Game.state.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime + (delay || 0);
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(actx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  const SOUNDS = {
    tap:     () => beep(500, 0.06, 'square', 0.04),
    till:    () => beep(160, 0.12, 'triangle', 0.12),
    plant:   () => { beep(420, 0.08, 'sine', 0.08); beep(560, 0.08, 'sine', 0.07, 0.06); },
    water:   () => { beep(300, 0.1, 'sine', 0.07); beep(360, 0.12, 'sine', 0.06, 0.05); },
    harvest: () => { beep(660, 0.09, 'triangle', 0.09); beep(880, 0.1, 'triangle', 0.09, 0.07); },
    coin:    () => { beep(990, 0.07, 'square', 0.05); beep(1320, 0.12, 'square', 0.05, 0.06); },
    build:   () => { beep(220, 0.12, 'triangle', 0.11); beep(330, 0.14, 'triangle', 0.1, 0.1); },
    error:   () => beep(140, 0.18, 'sawtooth', 0.07),
    goal:    () => { beep(660, 0.1, 'triangle', 0.09); beep(830, 0.1, 'triangle', 0.09, 0.09); beep(990, 0.16, 'triangle', 0.09, 0.18); },
    levelup: () => { [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.16, 'triangle', 0.1, i * 0.11)); },
  };

  // ---------------- toasts / modal ----------------
  const toastLog = []; // ring buffer of the last 50 messages (read from Menu)

  function toast(msg, kind) {
    toastLog.push({ msg, kind: kind || 'info', day: Game.state ? Game.state.day : 0, at: Date.now() });
    if (toastLog.length > 50) toastLog.shift();

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
  function setCoins(v) {
    const el = $('coins');
    if (v === coinTarget) return;
    coinTarget = v;
    if (coinRaf) { cancelAnimationFrame(coinRaf); coinRaf = null; }
    if (coinShown === null || v <= coinShown || v - coinShown < 20 || REDUCED.matches) {
      coinShown = v;
      el.textContent = v.toLocaleString();
      return;
    }
    const from = coinShown, t0 = performance.now(), dur = 600;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      coinShown = Math.round(from + (v - from) * e);
      el.textContent = coinShown.toLocaleString();
      coinRaf = t < 1 ? requestAnimationFrame(step) : null;
    };
    coinRaf = requestAnimationFrame(step);
  }

  function pulseCoinsPill() {
    const p = $('pill-coins');
    p.classList.remove('pop');
    void p.offsetWidth;
    p.classList.add('pop');
  }

  // 3–5 coin clones arc from the purchase/sale point to the coins pill
  function coinFlight(src) {
    if (!src) { pulseCoinsPill(); return; }
    if (REDUCED.matches) { pulseCoinsPill(); return; }
    const r = src.getBoundingClientRect ? src.getBoundingClientRect() : src;
    const dst = $('pill-coins').getBoundingClientRect();
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
    $('day-label').textContent = 'Day ' + s.day;
    setIcon($('weather-emoji'), I.weather(s.weather));
    setIcon($('forecast'), '→' + I.weather(s.forecast));
    $('dayfill').style.width = (s.t * 100) + '%';
    $('water-fill').style.width = (s.can.water / D.CAN_TIERS[s.can.tier].cap * 100) + '%';

    // fuel gauge appears once you own powered equipment
    const showFuel = Game.ownsPoweredGear() || s.fuel > 0;
    $('pill-fuel').classList.toggle('hidden', !showFuel);
    if (showFuel) {
      $('fuel-amount').textContent = s.fuel.toFixed(1);
      $('pill-fuel').classList.toggle('fuel-low', s.fuel < 1);
    }

    const fulfillable = s.orders.filter(o => Game.canFulfill(o)).length;
    $('orders-badge').classList.toggle('hidden', fulfillable === 0);
    $('orders-badge').textContent = fulfillable;

    const invCount = Object.values(s.inventory).reduce((a, b) => a + b, 0);
    $('market-badge').classList.toggle('hidden', invCount === 0);
    $('market-badge').textContent = invCount > 99 ? '99+' : invCount;

    updateGoalChip();
  }

  let lastGoalId = null;
  function updateGoalChip() {
    const g = Game.currentGoal();
    const chipEl = $('goal-chip');
    if (!g) { chipEl.classList.add('hidden'); lastGoalId = null; return; }
    const wasVisible = !chipEl.classList.contains('hidden');
    chipEl.classList.remove('hidden');
    if (wasVisible && lastGoalId && g.id !== lastGoalId) celebrateGoal(chipEl);
    lastGoalId = g.id;
    const [cur, need] = g.check(Game.state);
    setIcon($('goal-icon'), I.fromEmoji(g.icon));
    $('goal-title').textContent = g.title;
    $('goal-progress').textContent = Math.min(cur, need) + ' / ' + need;
    setIcon($('goal-reward'), I.icon('coin') + '<span>+' + fmt(g.reward) + '</span>');
  }

  // ---------------- sheet framework ----------------
  let sheetHideTimer = null;

  function openSheet(id, tab) {
    sheetOpen = id;
    sheetTab = tab || null;
    if (sheetHideTimer) { clearTimeout(sheetHideTimer); sheetHideTimer = null; }
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
  }

  // sheet header: icon plate + title + one-line promise
  function setSheetHeader(iconHtml, title, sub) {
    const badge = $('sheet-badge');
    setIcon(badge, iconHtml || '');
    badge.classList.toggle('on', !!iconHtml);
    $('sheet-title').textContent = title;
    $('sheet-sub').textContent = sub || '';
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
      b.onclick = () => { SOUNDS.tap(); sheetTab = t.id; renderSheet(); };
      bar.appendChild(b);
    }
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
    else if (sheetOpen.startsWith('b:')) renderBuilding(body, parseInt(sheetOpen.slice(2), 10));
  }

  // ---------------- seeds sheet ----------------
  let plantTarget = null; // tile to plant immediately on pick
  function renderSeeds(body) {
    setSheetHeader(I.icon('sprout'), 'Choose a seed', 'Right season + steady water = happy crops');
    setTabs(null);
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.style.padding = '0 6px 10px';
    note.textContent = 'Dry crops wilt and die; ripe ones rot if left standing.';
    body.appendChild(note);

    const grid = document.createElement('div');
    grid.className = 'card-grid';
    const entries = Object.entries(D.CROPS).sort((a, b) => a[1].seed - b[1].seed);
    for (const [id, c] of entries) {
      const item = D.ITEMS[id];
      const off = !Game.seasonOK(id);
      const card = document.createElement('div');
      card.className = 'item-card' + (off ? ' off-season' : '') + (seed === id ? ' selected' : '');
      card.innerHTML = `
        <span class="season-tag">${c.seasons.map(i => I.season(i)).join('')}</span>
        ${off ? '<span class="lock-tag warn">off-season</span>'
          : seed === id ? `<span class="owned-tick">${I.icon('check')}</span>`
          : c.regrow ? '<span class="lock-tag regrow">regrows</span>' : ''}
        <span class="plate">${I.item(id)}</span>
        <div class="name">${item.name}</div>
        <div class="sub">${c.grow}s${c.regrow ? ' · then ' + c.regrow + 's' : ''} · sells ~${$$(item.base)}</div>
        ${chip(c.seed, off ? 'muted' : '')}`;
      card.onclick = () => {
        if (off) {
          toast(`⚠️ ${item.name} grows in ${c.seasons.map(i => D.SEASONS[i].name).join(' & ')} — planting now wastes the seed money!`, 'bad');
        }
        seed = id;
        SOUNDS.tap();
        if (plantTarget) {
          if (Game.plant(plantTarget.x, plantTarget.y, id)) SOUNDS.plant();
          plantTarget = null;
        }
        setTool('plant');
        closeSheet();
        if (!off) toast(`${item.emoji} Planting ${item.name} — drag across tilled soil!`);
      };
      grid.appendChild(card);
    }
    body.appendChild(grid);
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
      const entries = Object.entries(D.BUILDINGS).sort((a, b) => a[1].cost - b[1].cost);
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
            <div class="sub">Makes ${D.ITEMS[a.product].emoji} ${D.ITEMS[a.product].name} (~${$$(D.ITEMS[a.product].base)}) every ${a.prodTime}s · lives in a ${D.BUILDINGS[a.home].name}</div>
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
          <div class="name">Fertilizer · ${$$(D.FERT_COST)} per use</div>
          <div class="sub">Use the Fert tool on growing crops: +25% growth speed and a 45% chance of a double harvest.</div>
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
  function renderMarket(body) {
    setSheetHeader(I.icon('scales'), 'Market', 'Prices move daily — sell high!');
    setTabs(null);
    const s = Game.state;
    const items = Object.entries(s.inventory).filter(([, q]) => q > 0);

    const hot = s.market.hot;
    const note = document.createElement('div');
    note.className = 'order-card';
    note.innerHTML = `<div style="font-weight:800;font-size:0.8125rem">${I.icon('flame')} Today's hot item: ${I.item(hot)} <b>${D.ITEMS[hot].name}</b> sells for <b>+50%</b>! Prices change daily.</div>`;
    body.appendChild(note);

    if (!items.length) {
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
    sellAll.innerHTML = `${I.icon('coin')} Sell everything · +${$$(total)}`;
    sellAll.onclick = () => {
      const rect = sellAll.getBoundingClientRect();
      confirmBox('⚖️', `Sell your entire inventory for ${$$(total)}?`, 'Sell all', () => {
        for (const [id, qty] of items) Game.sellItem(id, qty);
        coinFlight(rect);
        updateHud(); renderSheet();
      });
    };
    body.appendChild(sellAll);

    for (const [id, qty] of items.sort((a, b) => Game.sellPrice(b[0]) * b[1] - Game.sellPrice(a[0]) * a[1])) {
      const item = D.ITEMS[id];
      const price = Game.sellPrice(id);
      const mult = s.market.mults[id] * (hot === id ? 1.5 : 1);
      const dir = mult >= 1.12 ? `<span class="price-up">▲ high</span>` : mult <= 0.85 ? `<span class="price-down">▼ low</span>` : 'steady';
      const row = document.createElement('div');
      row.className = 'row-card';
      row.innerHTML = `
        <div class="emoji">${I.item(id, 'lg')}${hot === id ? `<span class="hot-badge">${I.icon('flame')}</span>` : ''}</div>
        <div class="info">
          <div class="name">${item.name} × ${qty}</div>
          <div class="sub">${$$(price)} each · ${dir}</div>
        </div>
        <div class="actions">
          <button class="mini">Sell 1 · ${$$(price)}</button>
          ${qty > 1 ? `<button class="mini gold">All · ${$$(price * qty)}</button>` : ''}
        </div>`;
      const btns = row.querySelectorAll('button');
      btns[0].onclick = e => { const r = e.currentTarget.getBoundingClientRect(); Game.sellItem(id, 1); coinFlight(r); updateHud(); renderSheet(); };
      if (btns[1]) btns[1].onclick = e => { const r = e.currentTarget.getBoundingClientRect(); Game.sellItem(id, qty); coinFlight(r); updateHud(); renderSheet(); };
      body.appendChild(row);
    }
  }

  // ---------------- orders ----------------
  function renderOrders(body) {
    setSheetHeader(I.icon('clipboard'), 'Orders', 'Townsfolk pay a premium for deliveries');
    setTabs(null);
    const s = Game.state;
    const intro = document.createElement('div');
    intro.className = 'empty-note';
    intro.style.padding = '4px 10px 14px';
    intro.textContent = 'Fill orders to grow your empire!';
    body.appendChild(intro);

    if (!s.orders.length) {
      const e = document.createElement('div');
      e.className = 'empty-note';
      e.innerHTML = `<div class="empty-art">${I.icon('clipboard')}</div>New orders arriving soon…`;
      body.appendChild(e);
    }

    for (const o of s.orders) {
      const card = document.createElement('div');
      card.className = 'order-card';
      const items = Object.entries(o.reqs).map(([id, qty]) => {
        const have = s.inventory[id] || 0;
        return `<div class="order-item ${have >= qty ? 'ok' : ''}">${I.item(id)} ${Math.min(have, qty)}/${qty}</div>`;
      }).join('');
      const can = Game.canFulfill(o);
      card.innerHTML = `
        <div class="order-items">${items}</div>
        <div class="order-foot">
          <div class="order-reward">+${$$(o.coins)} · +${o.xp} XP</div>
          <div style="display:flex;gap:6px">
            <button class="mini quiet">Skip</button>
            <button class="mini gold" ${can ? '' : 'disabled'}>Deliver 🚚</button>
          </div>
        </div>`;
      const btns = card.querySelectorAll('button');
      btns[0].onclick = () => confirmBox('🗑️', 'Skip this order? A new one will arrive soon.', 'Skip', () => { Game.skipOrder(o.id); renderSheet(); });
      btns[1].onclick = e => {
        const r = e.currentTarget.getBoundingClientRect();
        if (Game.fulfillOrder(o.id)) { coinFlight(r); updateHud(); renderSheet(); }
      };
      body.appendChild(card);
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
      <button class="chunky green" style="flex:1">🌾 Feed all</button>
      <button class="chunky gold" style="flex:1" ${ready ? '' : 'disabled'}>${I.icon('crate')} Collect${ready ? ' (' + ready + ')' : ''}</button>`;
    const [feedBtn, collectBtn] = top.querySelectorAll('button');
    feedBtn.onclick = () => { Game.feedAll(index); updateHud(); renderSheet(); };
    collectBtn.onclick = () => { Game.collectBuilding(index); updateHud(); renderSheet(); };
    body.appendChild(top);

    if (Game.hasBuilding('mill')) {
      const n = document.createElement('div');
      n.className = 'empty-note';
      n.style.padding = '0 4px 10px';
      n.textContent = '🌾 Feed Mill active: feeding uses your wheat & corn first, then cash.';
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
      const costLabel = cost.grain ? `1 ${D.ITEMS[cost.grain].emoji}` : $$(cost.coins);
      const vetCost = Math.ceil(adef.cost * D.VET_RATE);
      const sellPrice = Math.floor(adef.cost * 0.6 * (a.sick ? 0.5 : 1));
      const status = a.sick
        ? '🤒 sick — needs the vet before producing again'
        : fed
          ? (a.prodProg >= 1 ? `${D.ITEMS[adef.product].emoji} ready!` : `making ${D.ITEMS[adef.product].emoji} · ${Math.round(a.prodProg * 100)}%`)
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
        <div class="sub">${D.ITEMS[a.product].emoji} every ${a.prodTime}s</div>
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
    const done = b.queue.filter(j => s.now >= j.done).length;

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
      label.textContent = `In progress (${b.queue.length}/3)`;
      body.appendChild(label);
      for (const job of b.queue) {
        const r = D.RECIPES[job.r];
        const item = D.ITEMS[r.out];
        const left = Math.max(0, job.done - s.now);
        const pct = Math.round((1 - left / r.time) * 100);
        const row = document.createElement('div');
        row.className = 'row-card';
        row.innerHTML = `
          <div class="emoji">${I.item(r.out, 'lg')}</div>
          <div class="info">
            <div class="name">${item.name}</div>
            <div class="sub">${left <= 0 ? '✅ Ready!' : Math.ceil(left) + 's left'}</div>
            <div class="minibar pink"><div style="width:${pct}%"></div></div>
          </div>`;
        body.appendChild(row);
      }
    }

    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = 'Recipes';
    body.appendChild(label);
    for (const [id, r] of Object.entries(D.RECIPES)) {
      if (r.building !== b.type) continue;
      const out = D.ITEMS[r.out];
      const ins = Object.entries(r.in).map(([i, q]) => `${q} ${D.ITEMS[i].emoji}`).join(' + ');
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
      <div style="font-weight:900;font-size:0.9375rem;margin-bottom:6px">👑 ${s.farmName} — Year ${s.year} · ${diffDef.emoji} ${diffDef.name}</div>
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
    jobs.innerHTML = `
      <div class="emoji">💪</div>
      <div class="info"><div class="name">Work odd jobs</div><div class="sub">Earn ${$$(40)} helping in town — once per day. A farmer is never truly broke.</div></div>
      <div class="actions"><button class="mini gold" ${jobsFree ? '' : 'disabled'}>${jobsFree ? '+' + $$(40) : 'Done today'}</button></div>`;
    jobs.querySelector('button').onclick = () => { if (Game.workOddJobs()) { updateHud(); renderSheet(); } };
    body.appendChild(jobs);

    // ---- farm safety: backup & restore ----
    const safetyLabel = document.createElement('div');
    safetyLabel.className = 'section-label';
    safetyLabel.textContent = '💾 Keep your farm safe';
    body.appendChild(safetyLabel);

    const backupRow = document.createElement('div');
    backupRow.className = 'row-card';
    backupRow.innerHTML = `
      <div class="emoji">🔐</div>
      <div class="info">
        <div class="name">Backup this farm</div>
        <div class="sub">Your farm autosaves with 3 rotating safety snapshots. For extra safety, copy a farm code or download a file you can restore anywhere.</div>
      </div>
      <div class="actions">
        <button class="mini blue">Copy code</button>
        <button class="mini">Download</button>
      </div>`;
    const [copyBtn, dlBtn] = backupRow.querySelectorAll('button');
    copyBtn.onclick = async () => {
      const code = Game.exportCode();
      try {
        await navigator.clipboard.writeText(code);
        toast('🔐 Farm code copied — store it somewhere safe!', 'good');
      } catch (e) {
        window.prompt('Copy your farm code:', code);
      }
    };
    dlBtn.onclick = () => {
      const code = Game.exportCode();
      const a = document.createElement('a');
      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(code);
      a.download = `${Game.state.farmName.replace(/[^a-z0-9]+/gi, '-')}-day${Game.state.day}-y${Game.state.year}.harvestfarm.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('🔐 Backup file downloaded!', 'good');
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
        <div class="sub">Tap tiles to till, plant, water & harvest. Drag with a tool to work fast. Keep crops watered or they die; harvest before they rot; plant in the right season. Feed your animals or they get sick. Powered equipment needs fuel!</div>
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

  // ---------------- build placement ----------------
  function startBuild(type) {
    buildType = type;
    closeSheet();
    const def = D.BUILDINGS[type];
    // start ghost near the camera focus
    const c = Renderer.screenToTile(Renderer.vw / 2, Renderer.vh / 2);
    Renderer.setGhost({ type, x: Math.round(c.x - def.w / 2), y: Math.round(c.y - def.h / 2) });
    $('build-label').innerHTML = `${I.building(type)} <span>Place the ${def.name}</span>`;
    $('buildbar').classList.remove('hidden');
    $('toolbar').classList.add('hidden');
    toast('Tap the map to move it, then press ✓');
  }

  function endBuild() {
    buildType = null;
    Renderer.setGhost(null);
    $('buildbar').classList.add('hidden');
    $('toolbar').classList.remove('hidden');
  }

  // ---------------- tools ----------------
  function setTool(t) {
    tool = t;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
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
      lastPaint = null;
      if (pointers.size === 1) dragStart = { x: e.clientX, y: e.clientY, camX: Renderer.cam.x, camY: Renderer.cam.y };
      if (pointers.size === 2) {
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

      if (tool === 'auto') { // pan
        Renderer.cam.x = dragStart.camX - dx / Renderer.cam.z;
        Renderer.cam.y = dragStart.camY - dy / Renderer.cam.z;
        Renderer.clampCam();
      } else if (moved) { // paint with tool
        paintAt(e.clientX, e.clientY);
      }
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
    const { x, y } = tileFromScreen(sx, sy);

    if (tool === 'auto') {
      const r = Game.smartAction(x, y);
      handleSmartResult(r, x, y);
    } else if (tool === 'plant') {
      const t = Game.tileAt(x, y);
      if (t && t.k === 'soil' && !t.crop && !t.obj) {
        if (Game.plant(x, y, seed)) SOUNDS.plant();
      } else tapFallback(x, y);
    } else {
      const n = Game.applyTool(tool, x, y, seed);
      if (n === 'empty') toast('Watering can is empty — tap the Well! 💧', 'bad');
      if (n === 'broke') toast(`Fertilizer costs ${$$(D.FERT_COST)} per crop!`, 'bad');
      if (n === 'nofuel') toast('⛽ Out of fuel — hand-tilling one plot. Buy diesel in the Shop!', 'bad');
      if (!n || typeof n === 'string') tapFallback(x, y);
    }
    updateHud();
  }

  // safe fallback while a tool is selected: only open buildings / land dialogs,
  // never perform a different tool's action
  function tapFallback(x, y) {
    const t = Game.tileAt(x, y);
    if (!t) return;
    if (t.obj && t.obj.t === 'b') {
      const b = Game.state.buildings[t.obj.i];
      if (!b) return;
      if (b.type === 'well') Game.refillCan();
      else { openSheet('b:' + t.obj.i); SOUNDS.tap(); }
    } else if (!Game.isUnlocked(x, y)) {
      const p = Game.parcelAt(x, y);
      if (p >= 0) handleSmartResult({ act: 'parcel', index: p }, x, y);
    }
  }

  function handleSmartResult(r, x, y) {
    switch (r.act) {
      case 'seedsheet':
        plantTarget = { x, y };
        openSheet('seeds');
        SOUNDS.tap();
        break;
      case 'building':
        openSheet('b:' + r.index);
        SOUNDS.tap();
        break;
      case 'parcel': {
        const p = D.PARCELS[r.index];
        confirmBox('🚧', `Buy this ${p.w}×${p.h} parcel of land for ${$$(p.cost)}?`, 'Buy land', () => {
          if (Game.buyParcel(r.index)) updateHud();
        });
        break;
      }
      case 'growing': {
        const t = Game.tileAt(x, y);
        if (t && t.crop) {
          const def = D.CROPS[t.crop.id];
          const c = t.crop;
          let status;
          if (!Game.seasonOK(c.id)) status = '⚠️ wrong season — it\'s withering!';
          else if ((c.wilt || 0) > 0.3) status = '🥀 wilting — water it fast!';
          else {
            const growTime = c.regrown && def.regrow ? def.regrow : def.grow;
            status = `~${Math.ceil((1 - c.prog) * growTime)}s to go`;
          }
          toast(`${D.ITEMS[c.id].emoji} ${D.ITEMS[c.id].name} · ${status}`);
        }
        break;
      }
    }
  }

  function paintAt(sx, sy) {
    const { x, y } = tileFromScreen(sx, sy);
    if (lastPaint && lastPaint.x === x && lastPaint.y === y) return;
    lastPaint = { x, y };
    if (tool === 'plant') {
      if (Game.plant(x, y, seed)) SOUNDS.plant();
    } else {
      const r = Game.applyTool(tool, x, y, seed);
      if (typeof r === 'string' && !paintAt.warned) {
        paintAt.warned = true;
        setTimeout(() => paintAt.warned = false, 1500);
        if (r === 'empty') toast('Watering can is empty — tap the Well! 💧', 'bad');
        if (r === 'nofuel') toast('⛽ Out of fuel — hand-tilling only. Buy diesel in the Shop!', 'bad');
      }
    }
    updateHud();
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
  function showLevelUp(level) {
    SOUNDS.levelup();
    $('levelup-num').textContent = level;
    const bonus = Math.round(D.repBonus(level) * 100);
    $('levelup-unlocks').innerHTML =
      `Your farm's reputation is growing!<br><span class="unlock">⚖️ All goods now sell for +${bonus}%</span>`;
    $('levelup').classList.remove('hidden');
    // tap to dismiss — no auto-hide, and no stolen input: the splash lets
    // pointer events through; the first tap anywhere also dismisses it
    const dismiss = () => {
      $('levelup').classList.add('hidden');
      document.removeEventListener('pointerdown', dismiss, true);
    };
    document.addEventListener('pointerdown', dismiss, true);
  }

  function showAwaySummary(away) {
    const h = Math.floor(away.seconds / 3600);
    const m = Math.round((away.seconds % 3600) / 60);
    const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
    let msg = `Welcome back! While you were away (${dur}):\n\n🌾 ${away.crops} crop${away.crops === 1 ? '' : 's'} finished growing\n📦 ${away.produce} animal product${away.produce === 1 ? '' : 's'} ready`;
    if (away.lost > 0) msg += `\n🥀 ${away.lost} crop${away.lost === 1 ? '' : 's'} were lost — a farm needs its farmer!`;
    confirmBox('🌙', msg, 'Let\'s farm!');
    $('modal-no').style.display = 'none';
    const yes = $('modal-yes');
    const oldClick = yes.onclick;
    yes.onclick = () => { $('modal-no').style.display = ''; oldClick(); };
  }

  // ---------------- init ----------------
  function init(canvas) {
    bindInput(canvas);
    applyTextScale(); // restore Comfy Mode large text

    document.querySelectorAll('.tool-btn').forEach(b => {
      b.addEventListener('click', () => {
        SOUNDS.tap();
        const t = b.dataset.tool;
        if (t === 'plant') { plantTarget = null; openSheet('seeds'); }
        if (t === 'fert' && tool !== 'fert') toast(`✨ Tap growing crops to fertilize (${$$(D.FERT_COST)}): faster growth + double-harvest chance!`);
        setTool(t);
      });
    });

    $('btn-shop').onclick = () => { SOUNDS.tap(); sheetTab = null; openSheet('shop'); };
    $('btn-market').onclick = () => { SOUNDS.tap(); openSheet('market'); };
    $('btn-orders').onclick = () => { SOUNDS.tap(); openSheet('orders'); };
    $('btn-menu').onclick = () => { SOUNDS.tap(); openSheet('menu'); };
    $('sheet-close').onclick = () => { SOUNDS.tap(); closeSheet(); };
    $('sheet-backdrop').onclick = closeSheet;
    $('goal-chip').onclick = () => updateGoalChip();

    $('build-ok').onclick = () => {
      const ghost = Renderer.getGhost();
      if (!ghost) return;
      if (Game.placeBuilding(ghost.type, ghost.x, ghost.y)) { endBuild(); updateHud(); }
      else if (!Game.canPlaceBuilding(ghost.type, ghost.x, ghost.y)) toast('Needs clear, owned grass — move it!', 'bad');
    };
    $('build-cancel').onclick = () => { SOUNDS.tap(); endBuild(); };

    // game events
    Game.on('toast', toast);
    Game.on('sound', name => SOUNDS[name] && SOUNDS[name]());
    Game.on('fx', f => {
      if (f.kind === 'float') Renderer.addFloat(f.x, f.y, f.text, f.color);
      else Renderer.addBurst(f.x, f.y, f.color);
    });
    Game.on('levelup', showLevelUp);
    Game.on('goal', updateGoalChip);
    Game.on('orders', () => { if (sheetOpen === 'orders') renderSheet(); });
    Game.on('season', () => { if (sheetOpen === 'seeds') renderSheet(); });

    updateHud();
  }

  // periodic refresh of open panels with live timers
  let refreshAcc = 0;
  function update(dt) {
    refreshAcc += dt;
    if (refreshAcc > 0.5) {
      refreshAcc = 0;
      updateHud();
      if (sheetOpen && (sheetOpen.startsWith('b:') || sheetOpen === 'orders')) renderSheet();
    }
  }

  return { init, update, toast, updateHud, showAwaySummary, showSetup, get tool() { return tool; } };
})();
