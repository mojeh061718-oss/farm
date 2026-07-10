/* ============ Harvest Empire — UI, input & sound ============ */
'use strict';

const UI = (() => {
  const D = DATA;
  const T = D.TILE;
  const $ = id => document.getElementById(id);

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
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), 3100);
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

  // ---------------- HUD ----------------
  function updateHud() {
    const s = Game.state;
    $('coins').textContent = s.coins.toLocaleString();
    $('level').textContent = s.level;
    $('xpfill').style.width = Math.min(100, (s.xp / D.xpForLevel(s.level)) * 100) + '%';
    $('season-emoji').textContent = D.SEASONS[s.season].emoji;
    $('day-label').textContent = 'Day ' + s.day;
    $('weather-emoji').textContent = D.WEATHERS[s.weather].emoji;
    $('dayfill').style.width = (s.t * 100) + '%';
    $('water-fill').style.width = (s.can.water / D.CAN_TIERS[s.can.tier].cap * 100) + '%';

    const fulfillable = s.orders.filter(o => Game.canFulfill(o)).length;
    $('orders-badge').classList.toggle('hidden', fulfillable === 0);
    $('orders-badge').textContent = fulfillable;

    const invCount = Object.values(s.inventory).reduce((a, b) => a + b, 0);
    $('market-badge').classList.toggle('hidden', invCount === 0);
    $('market-badge').textContent = invCount > 99 ? '99+' : invCount;

    updateGoalChip();
  }

  function updateGoalChip() {
    const g = Game.currentGoal();
    const chip = $('goal-chip');
    if (!g) { chip.classList.add('hidden'); return; }
    chip.classList.remove('hidden');
    const [cur, need] = g.check(Game.state);
    $('goal-icon').textContent = g.icon;
    $('goal-title').textContent = g.title;
    $('goal-progress').textContent = Math.min(cur, need) + ' / ' + need;
    $('goal-reward').textContent = '+' + g.reward + ' 🪙';
  }

  // ---------------- sheet framework ----------------
  function openSheet(id, tab) {
    sheetOpen = id;
    sheetTab = tab || null;
    $('sheet').classList.remove('hidden');
    $('sheet-backdrop').classList.remove('hidden');
    renderSheet();
  }

  function closeSheet() {
    sheetOpen = null;
    $('sheet').classList.add('hidden');
    $('sheet-backdrop').classList.add('hidden');
  }

  function setTabs(tabs, active) {
    const bar = $('sheet-tabs');
    if (!tabs) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
    bar.classList.remove('hidden');
    bar.innerHTML = '';
    for (const t of tabs) {
      const b = document.createElement('button');
      b.className = 'sheet-tab' + (t.id === active ? ' active' : '');
      b.textContent = t.label;
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
    else if (sheetOpen.startsWith('b:')) renderBuilding(body, parseInt(sheetOpen.slice(2), 10));
  }

  // ---------------- seeds sheet ----------------
  let plantTarget = null; // tile to plant immediately on pick
  function renderSeeds(body) {
    $('sheet-title').textContent = '🌱 Choose a seed';
    setTabs(null);
    const s = Game.state;
    const grid = document.createElement('div');
    grid.className = 'card-grid';
    const entries = Object.entries(D.CROPS).sort((a, b) => a[1].level - b[1].level);
    for (const [id, c] of entries) {
      const item = D.ITEMS[id];
      const locked = c.level > s.level;
      const off = !Game.seasonOK(id);
      const card = document.createElement('div');
      card.className = 'item-card' + (locked ? ' locked' : off ? ' disabled' : '');
      card.innerHTML = `
        <span class="season-tag">${c.seasons.map(i => D.SEASONS[i].emoji).join('')}</span>
        ${locked ? `<span class="lock-tag">Lv ${c.level}</span>` : ''}
        <div class="emoji">${item.emoji}</div>
        <div class="name">${item.name}</div>
        <div class="sub">${c.grow}s · sells ~${item.base} 🪙</div>
        <div class="price">${c.seed} 🪙</div>`;
      card.onclick = () => {
        if (locked) { toast(`Reach level ${c.level} to unlock ${item.name}!`, 'bad'); return; }
        if (off) { toast(`${item.name} only grows in ${c.seasons.map(i => D.SEASONS[i].name).join(' & ')}${Game.hasBuilding('greenhouse') ? '' : ' — or build a Greenhouse'}!`, 'bad'); return; }
        seed = id;
        SOUNDS.tap();
        if (plantTarget) {
          if (Game.plant(plantTarget.x, plantTarget.y, id)) SOUNDS.plant();
          plantTarget = null;
        }
        setTool('plant');
        closeSheet();
        toast(`${item.emoji} Planting ${item.name} — drag across tilled soil!`);
      };
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  // ---------------- shop ----------------
  function renderShop(body) {
    $('sheet-title').textContent = '🏪 Shop';
    const tabs = [
      { id: 'build', label: '🏠 Buildings' },
      { id: 'animals', label: '🐔 Animals' },
      { id: 'tools', label: '🛠️ Upgrades' },
      { id: 'land', label: '🚧 Land' },
    ];
    sheetTab = sheetTab || 'build';
    setTabs(tabs, sheetTab);
    const s = Game.state;

    if (sheetTab === 'build') {
      const grid = document.createElement('div');
      grid.className = 'card-grid';
      const entries = Object.entries(D.BUILDINGS).sort((a, b) => a[1].level - b[1].level);
      for (const [id, b] of entries) {
        const locked = b.level > s.level;
        const card = document.createElement('div');
        card.className = 'item-card' + (locked ? ' locked' : '');
        card.innerHTML = `
          ${locked ? `<span class="lock-tag">Lv ${b.level}</span>` : ''}
          <div class="emoji">${b.emoji}</div>
          <div class="name">${b.name}</div>
          <div class="sub">${b.desc}</div>
          <div class="price">${b.cost.toLocaleString()} 🪙</div>`;
        card.onclick = () => {
          if (locked) { toast(`Reach level ${b.level} to unlock the ${b.name}!`, 'bad'); return; }
          if (s.coins < b.cost) { toast('Not enough coins!', 'bad'); return; }
          SOUNDS.tap();
          startBuild(id);
        };
        grid.appendChild(card);
      }
      body.appendChild(grid);
    }

    if (sheetTab === 'animals') {
      const entries = Object.entries(D.ANIMALS).sort((a, b) => a[1].level - b[1].level);
      for (const [id, a] of entries) {
        const locked = a.level > s.level;
        const homes = Game.buildingsOf(a.home).filter(e => Game.animalsIn(e.i).length < e.b.capacity);
        const row = document.createElement('div');
        row.className = 'row-card' + (locked ? ' locked' : '');
        row.innerHTML = `
          <div class="emoji">${a.emoji}</div>
          <div class="info">
            <div class="name">${a.name} ${locked ? `· 🔒 Lv ${a.level}` : ''}</div>
            <div class="sub">Makes ${D.ITEMS[a.product].emoji} ${D.ITEMS[a.product].name} every ${a.prodTime}s · needs a ${D.BUILDINGS[a.home].name}</div>
          </div>
          <div class="actions"><button class="mini gold">${a.cost.toLocaleString()} 🪙</button></div>`;
        row.querySelector('button').onclick = () => {
          if (locked) { toast(`Reach level ${a.level} first!`, 'bad'); return; }
          if (!homes.length) { toast(`You need a ${D.BUILDINGS[a.home].name} with free space!`, 'bad'); return; }
          if (Game.buyAnimal(id, homes[0].i)) { updateHud(); renderSheet(); }
        };
        body.appendChild(row);
      }
    }

    if (sheetTab === 'tools') {
      body.appendChild(toolRow('💧', 'Watering Can', D.CAN_TIERS, s.can.tier,
        t => `Holds ${t.cap} water · waters ${t.area}×${t.area}`, () => Game.buyCanTier()));
      body.appendChild(toolRow('⛏️', 'Hoe', D.HOE_TIERS, s.hoe.tier,
        t => `Tills ${t.area}×${t.area} at once`, () => Game.buyHoeTier()));
    }

    if (sheetTab === 'land') {
      let anyForSale = false;
      D.PARCELS.forEach((p, i) => {
        if (s.unlockedParcels.includes(i)) return;
        anyForSale = true;
        const locked = s.level < p.level;
        const row = document.createElement('div');
        row.className = 'row-card' + (locked ? ' locked' : '');
        row.innerHTML = `
          <div class="emoji">🚧</div>
          <div class="info">
            <div class="name">Land parcel · ${p.w}×${p.h} tiles</div>
            <div class="sub">${locked ? `Unlocks at level ${p.level}` : 'Ready to farm!'}</div>
          </div>
          <div class="actions"><button class="mini gold" ${locked ? 'disabled' : ''}>${p.cost.toLocaleString()} 🪙</button></div>`;
        row.querySelector('button').onclick = () => {
          if (Game.buyParcel(i)) { updateHud(); renderSheet(); }
        };
        body.appendChild(row);
      });
      if (!anyForSale) body.innerHTML = '<div class="empty-note">👑 You own all the land — a true farming empire!</div>';
    }
  }

  function toolRow(icon, name, tiers, cur, describe, buy) {
    const s = Game.state;
    const next = tiers[cur + 1];
    const row = document.createElement('div');
    row.className = 'row-card';
    if (!next) {
      row.innerHTML = `
        <div class="emoji">${icon}</div>
        <div class="info"><div class="name">${tiers[cur].name}</div><div class="sub">${describe(tiers[cur])} · MAX level!</div></div>`;
      return row;
    }
    const locked = s.level < next.level;
    row.innerHTML = `
      <div class="emoji">${icon}</div>
      <div class="info">
        <div class="name">${name}: ${tiers[cur].name} → ${next.name}</div>
        <div class="sub">${describe(next)}${locked ? ` · 🔒 Lv ${next.level}` : ''}</div>
      </div>
      <div class="actions"><button class="mini gold" ${locked ? 'disabled' : ''}>${next.cost.toLocaleString()} 🪙</button></div>`;
    row.querySelector('button').onclick = () => { if (buy()) { updateHud(); renderSheet(); } };
    return row;
  }

  // ---------------- market ----------------
  function renderMarket(body) {
    $('sheet-title').textContent = '⚖️ Market';
    setTabs(null);
    const s = Game.state;
    const items = Object.entries(s.inventory).filter(([, q]) => q > 0);

    const hot = s.market.hot;
    const note = document.createElement('div');
    note.className = 'order-card';
    note.innerHTML = `<div style="font-weight:800;font-size:13px">🔥 Today's hot item: ${D.ITEMS[hot].emoji} <b>${D.ITEMS[hot].name}</b> sells for <b>+50%</b>! Prices change daily.</div>`;
    body.appendChild(note);

    if (!items.length) {
      const e = document.createElement('div');
      e.className = 'empty-note';
      e.textContent = '📦 Your barn is empty — harvest crops or collect from animals!';
      body.appendChild(e);
      return;
    }

    let total = 0;
    for (const [id, qty] of items) total += Game.sellPrice(id) * qty;

    const sellAll = document.createElement('button');
    sellAll.className = 'chunky gold';
    sellAll.style.cssText = 'width:100%;margin-bottom:12px';
    sellAll.textContent = `Sell everything · +${total.toLocaleString()} 🪙`;
    sellAll.onclick = () => {
      confirmBox('⚖️', `Sell your entire inventory for ${total.toLocaleString()} coins?`, 'Sell all', () => {
        for (const [id, qty] of items) Game.sellItem(id, qty);
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
        <div class="emoji">${item.emoji}${hot === id ? '🔥' : ''}</div>
        <div class="info">
          <div class="name">${item.name} × ${qty}</div>
          <div class="sub">${price} 🪙 each · ${dir}</div>
        </div>
        <div class="actions">
          <button class="mini">Sell 1 · ${price} 🪙</button>
          ${qty > 1 ? `<button class="mini gold">All · ${(price * qty).toLocaleString()} 🪙</button>` : ''}
        </div>`;
      const btns = row.querySelectorAll('button');
      btns[0].onclick = () => { Game.sellItem(id, 1); updateHud(); renderSheet(); };
      if (btns[1]) btns[1].onclick = () => { Game.sellItem(id, qty); updateHud(); renderSheet(); };
      body.appendChild(row);
    }
  }

  // ---------------- orders ----------------
  function renderOrders(body) {
    $('sheet-title').textContent = '📋 Orders';
    setTabs(null);
    const s = Game.state;
    const intro = document.createElement('div');
    intro.className = 'empty-note';
    intro.style.padding = '4px 10px 14px';
    intro.textContent = 'Townsfolk pay a premium for deliveries. Fill orders to grow your empire!';
    body.appendChild(intro);

    if (!s.orders.length) {
      const e = document.createElement('div');
      e.className = 'empty-note';
      e.textContent = '⏳ New orders arriving soon…';
      body.appendChild(e);
    }

    for (const o of s.orders) {
      const card = document.createElement('div');
      card.className = 'order-card';
      const items = Object.entries(o.reqs).map(([id, qty]) => {
        const have = s.inventory[id] || 0;
        return `<div class="order-item ${have >= qty ? 'ok' : ''}">${D.ITEMS[id].emoji} ${Math.min(have, qty)}/${qty}</div>`;
      }).join('');
      const can = Game.canFulfill(o);
      card.innerHTML = `
        <div class="order-items">${items}</div>
        <div class="order-foot">
          <div class="order-reward">+${o.coins.toLocaleString()} 🪙 · +${o.xp} XP</div>
          <div style="display:flex;gap:6px">
            <button class="mini" style="background:linear-gradient(180deg,#bcaaa4,#8d6e63)">Skip</button>
            <button class="mini gold" ${can ? '' : 'disabled'}>Deliver 🚚</button>
          </div>
        </div>`;
      const btns = card.querySelectorAll('button');
      btns[0].onclick = () => confirmBox('🗑️', 'Skip this order? A new one will arrive soon.', 'Skip', () => { Game.skipOrder(o.id); renderSheet(); });
      btns[1].onclick = () => { if (Game.fulfillOrder(o.id)) { updateHud(); renderSheet(); } };
      body.appendChild(card);
    }
  }

  // ---------------- building panel ----------------
  function renderBuilding(body, index) {
    const s = Game.state;
    const b = s.buildings[index];
    if (!b) { closeSheet(); return; }
    const def = D.BUILDINGS[b.type];
    $('sheet-title').textContent = `${def.emoji} ${def.name}`;
    setTabs(null);

    if (def.capacity) return renderHousing(body, index, b, def);
    if (b.queue) return renderProcessor(body, index, b, def);

    const e = document.createElement('div');
    e.className = 'empty-note';
    e.textContent = def.desc;
    body.appendChild(e);
  }

  function renderHousing(body, index, b, def) {
    const s = Game.state;
    const residents = s.animals.map((a, i) => ({ a, i })).filter(e => e.a.home === index);
    const ready = Game.readyIn(index);

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;gap:8px;margin-bottom:12px';
    top.innerHTML = `
      <button class="chunky green" style="flex:1">🌾 Feed all</button>
      <button class="chunky gold" style="flex:1" ${ready ? '' : 'disabled'}>📦 Collect${ready ? ' (' + ready + ')' : ''}</button>`;
    const [feedBtn, collectBtn] = top.querySelectorAll('button');
    feedBtn.onclick = () => { Game.feedAll(index); updateHud(); renderSheet(); };
    collectBtn.onclick = () => { Game.collectBuilding(index); updateHud(); renderSheet(); };
    body.appendChild(top);

    if (Game.hasBuilding('mill')) {
      const n = document.createElement('div');
      n.className = 'empty-note';
      n.style.padding = '0 4px 10px';
      n.textContent = '🌾 Feed Mill active: feeding uses your wheat & corn first, then coins.';
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
      const costLabel = cost.grain ? `1 ${D.ITEMS[cost.grain].emoji}` : `${cost.coins} 🪙`;
      const row = document.createElement('div');
      row.className = 'row-card';
      row.innerHTML = `
        <div class="emoji">${adef.emoji}</div>
        <div class="info">
          <div class="name">${a.name} <span style="font-weight:700;color:#97876a">· ${adef.name}</span></div>
          <div class="sub">${fed ? (a.prodProg >= 1 ? `${D.ITEMS[adef.product].emoji} ready!` : `making ${D.ITEMS[adef.product].emoji} · ${Math.round(a.prodProg * 100)}%`) : '😋 hungry — feed to produce'}</div>
          <div class="minibar ${a.prodProg >= 1 ? '' : 'blue'}"><div style="width:${Math.round(a.prodProg * 100)}%"></div></div>
          <div class="sub" style="margin-top:4px">${a.happiness >= 80 ? '😍' : a.happiness >= 50 ? '🙂' : '😟'} happiness ${a.happiness}%</div>
        </div>
        <div class="actions">
          <button class="mini" ${fed ? 'disabled' : ''}>Feed ${costLabel}</button>
        </div>`;
      row.querySelector('button').onclick = () => { if (Game.feedAnimal(i)) { SOUNDS.plant(); updateHud(); renderSheet(); } };
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
      const locked = a.level > s.level;
      const full = residents.length >= b.capacity;
      const card = document.createElement('div');
      card.className = 'item-card' + (locked ? ' locked' : full ? ' disabled' : '');
      card.innerHTML = `
        ${locked ? `<span class="lock-tag">Lv ${a.level}</span>` : ''}
        <div class="emoji">${a.emoji}</div>
        <div class="name">${a.name}</div>
        <div class="sub">${D.ITEMS[a.product].emoji} every ${a.prodTime}s</div>
        <div class="price">${a.cost.toLocaleString()} 🪙</div>`;
      card.onclick = () => {
        if (locked) { toast(`Reach level ${a.level} first!`, 'bad'); return; }
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
      btn.textContent = `📦 Collect ${done} finished good${done > 1 ? 's' : ''}`;
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
          <div class="emoji">${item.emoji}</div>
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
        <div class="emoji">${out.emoji}</div>
        <div class="info">
          <div class="name">${out.name} <span style="color:#8a6100">· ~${out.base} 🪙</span></div>
          <div class="sub">${ins} · ${r.time}s</div>
        </div>
        <div class="actions"><button class="mini blue" ${can ? '' : 'disabled'}>Craft</button></div>`;
      row.querySelector('button').onclick = () => { if (Game.startRecipe(index, id)) { updateHud(); renderSheet(); } };
      body.appendChild(row);
    }
  }

  // ---------------- menu ----------------
  function renderMenu(body) {
    $('sheet-title').textContent = '⚙️ Menu';
    setTabs(null);
    const s = Game.state;

    const stats = document.createElement('div');
    stats.className = 'order-card';
    stats.innerHTML = `
      <div style="font-weight:900;font-size:15px;margin-bottom:6px">👑 Farm Empire — Year ${s.year}</div>
      <div style="font-weight:800;font-size:13px;line-height:1.9">
        💰 Farm value: <b>${Game.farmValue().toLocaleString()} 🪙</b><br>
        🧺 Crops harvested: <b>${s.stats.harvested.toLocaleString()}</b><br>
        🐔 Animals: <b>${s.animals.length}</b> · 🏠 Buildings: <b>${s.buildings.length}</b><br>
        🚧 Land parcels: <b>${s.unlockedParcels.length}/${D.PARCELS.length}</b> · 📋 Orders done: <b>${s.stats.orders}</b>
      </div>`;
    body.appendChild(stats);

    const soundRow = document.createElement('div');
    soundRow.className = 'row-card';
    soundRow.innerHTML = `
      <div class="emoji">${s.settings.sound ? '🔊' : '🔇'}</div>
      <div class="info"><div class="name">Sound effects</div></div>
      <div class="actions"><button class="mini">${s.settings.sound ? 'Turn off' : 'Turn on'}</button></div>`;
    soundRow.querySelector('button').onclick = () => { s.settings.sound = !s.settings.sound; SOUNDS.tap(); renderSheet(); };
    body.appendChild(soundRow);

    const help = document.createElement('div');
    help.className = 'row-card';
    help.innerHTML = `
      <div class="emoji">💡</div>
      <div class="info">
        <div class="name">How to play</div>
        <div class="sub">Tap tiles to till, plant, water & harvest. Drag with a tool to work fast. Pinch to zoom, drag with Auto to pan. Watch the seasons — and beware storms, crows and frost!</div>
      </div>`;
    body.appendChild(help);

    const reset = document.createElement('div');
    reset.className = 'row-card';
    reset.innerHTML = `
      <div class="emoji">🗑️</div>
      <div class="info"><div class="name">Start over</div><div class="sub">Erase this farm forever</div></div>
      <div class="actions"><button class="mini" style="background:linear-gradient(180deg,#ef5350,#d32f2f)">Reset</button></div>`;
    reset.querySelector('button').onclick = () => {
      confirmBox('⚠️', 'Really erase your farm and start over?\nThis cannot be undone!', 'Erase', () => {
        Game.resetGame();
        closeSheet();
        updateHud();
      });
    };
    body.appendChild(reset);
  }

  // ---------------- build placement ----------------
  function startBuild(type) {
    buildType = type;
    closeSheet();
    const def = D.BUILDINGS[type];
    // start ghost at camera center
    const c = Renderer.cam;
    const gx = Math.round(c.x / T - def.w / 2);
    const gy = Math.round(c.y / T - def.h / 2);
    Renderer.setGhost({ type, x: gx, y: gy });
    $('build-label').textContent = `${def.emoji} Place the ${def.name}`;
    $('buildbar').classList.remove('hidden');
    $('toolbar').classList.add('hidden');
    toast('Tap the map to move it, then press ✓', undefined);
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

    const up = e => {
      const wasTap = !moved && pointers.size === 1;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (wasTap) handleTap(e.clientX, e.clientY);
      if (pointers.size === 0) dragStart = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); if (pointers.size === 0) dragStart = null; });

    // desktop niceties
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      Renderer.cam.z *= e.deltaY < 0 ? 1.1 : 0.9;
      Renderer.clampCam();
    }, { passive: false });
  }

  function tileFromScreen(sx, sy) {
    const w = Renderer.screenToWorld(sx, sy);
    return { x: Math.floor(w.x / T), y: Math.floor(w.y / T) };
  }

  function moveGhost(sx, sy) {
    const def = D.BUILDINGS[buildType];
    const w = Renderer.screenToWorld(sx, sy);
    Renderer.setGhost({
      type: buildType,
      x: Math.round(w.x / T - def.w / 2),
      y: Math.round(w.y / T - def.h / 2),
    });
  }

  let ghostPos = null;
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
      if (!n || n === 'empty') tapFallback(x, y);
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
        const s = Game.state;
        if (s.level < p.level) toast(`🔒 This land unlocks at level ${p.level}!`, 'bad');
        else confirmBox('🚧', `Buy this ${p.w}×${p.h} parcel of land for ${p.cost.toLocaleString()} coins?`, 'Buy land', () => {
          if (Game.buyParcel(r.index)) updateHud();
        });
        break;
      }
      case 'growing': {
        const t = Game.tileAt(x, y);
        if (t && t.crop) {
          const def = D.CROPS[t.crop.id];
          const left = Math.ceil((1 - t.crop.prog) * def.grow);
          toast(`${D.ITEMS[t.crop.id].emoji} ${D.ITEMS[t.crop.id].name} · ~${left}s to go`);
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
      if (r === 'empty' && !paintAt.warned) {
        paintAt.warned = true;
        setTimeout(() => paintAt.warned = false, 1500);
        toast('Watering can is empty — tap the Well! 💧', 'bad');
      }
    }
    updateHud();
  }

  // ---------------- level up splash ----------------
  function showLevelUp(level) {
    SOUNDS.levelup();
    $('levelup-num').textContent = level;
    const unlocks = D.unlocksAt(level);
    $('levelup-unlocks').innerHTML = unlocks.length
      ? 'Unlocked:<br>' + unlocks.map(u => `<span class="unlock">${u}</span>`).join('')
      : 'Keep growing your empire!';
    $('levelup').classList.remove('hidden');
    setTimeout(() => $('levelup').classList.add('hidden'), 2600);
    $('levelup').onclick = () => $('levelup').classList.add('hidden');
  }

  function showAwaySummary(away) {
    const h = Math.floor(away.seconds / 3600);
    const m = Math.round((away.seconds % 3600) / 60);
    const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;
    confirmBox('🌙', `Welcome back! While you were away (${dur}):\n\n🌾 ${away.crops} crop${away.crops === 1 ? '' : 's'} finished growing\n📦 ${away.produce} animal product${away.produce === 1 ? '' : 's'} ready`, 'Let\'s farm!');
    $('modal-no').style.display = 'none';
    const yes = $('modal-yes');
    const oldClick = yes.onclick;
    yes.onclick = () => { $('modal-no').style.display = ''; oldClick(); };
  }

  // ---------------- init ----------------
  function init(canvas) {
    bindInput(canvas);

    document.querySelectorAll('.tool-btn').forEach(b => {
      b.addEventListener('click', () => {
        SOUNDS.tap();
        const t = b.dataset.tool;
        if (t === 'plant') { plantTarget = null; openSheet('seeds'); }
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
      else if (!Game.canPlaceBuilding(ghost.type, ghost.x, ghost.y)) toast('Needs clear, unlocked grass — move it!', 'bad');
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

  return { init, update, toast, updateHud, showAwaySummary, get tool() { return tool; } };
})();
