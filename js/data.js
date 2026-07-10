/* ============ Harvest Empire — game data ============ */
'use strict';

const DATA = (() => {

  // ---- World / time ----
  const TILE = 64;
  const WORLD_W = 20;         // tiles
  const WORLD_H = 15;
  const DAY_LEN = 48;         // real seconds per in-game day
  const SEASON_DAYS = 6;      // days per season
  const NIGHT_START = 0.76;   // fraction of day when night falls

  const SEASONS = [
    { id: 'spring', name: 'Spring', emoji: '🌸' },
    { id: 'summer', name: 'Summer', emoji: '☀️' },
    { id: 'fall',   name: 'Fall',   emoji: '🍂' },
    { id: 'winter', name: 'Winter', emoji: '❄️' },
  ];

  const WEATHERS = {
    sun:     { name: 'Sunny',    emoji: '☀️' },
    cloud:   { name: 'Cloudy',   emoji: '⛅' },
    rain:    { name: 'Rain',     emoji: '🌧️' },
    storm:   { name: 'Storm',    emoji: '⛈️' },
    drought: { name: 'Heatwave', emoji: '🔥' },
    snow:    { name: 'Snow',     emoji: '🌨️' },
  };

  // weighted weather table per season
  const WEATHER_TABLE = [
    [['sun', 45], ['rain', 30], ['cloud', 18], ['storm', 7]],            // spring
    [['sun', 45], ['drought', 22], ['cloud', 15], ['rain', 10], ['storm', 8]], // summer
    [['sun', 34], ['cloud', 26], ['rain', 26], ['storm', 14]],           // fall
    [['snow', 50], ['cloud', 28], ['sun', 22]],                          // winter
  ];

  // ---- Items (everything sellable / storable) ----
  // base = base market value
  const ITEMS = {
    turnip:     { name: 'Turnip',      emoji: '🥬', base: 16 },
    wheat:      { name: 'Wheat',       emoji: '🌾', base: 12 },
    carrot:     { name: 'Carrot',      emoji: '🥕', base: 26 },
    potato:     { name: 'Potato',      emoji: '🥔', base: 38 },
    strawberry: { name: 'Strawberry',  emoji: '🍓', base: 58 },
    tomato:     { name: 'Tomato',      emoji: '🍅', base: 72 },
    corn:       { name: 'Corn',        emoji: '🌽', base: 95 },
    sunflower:  { name: 'Sunflower',   emoji: '🌻', base: 115 },
    cabbage:    { name: 'Cabbage',     emoji: '🥗', base: 125 },
    pumpkin:    { name: 'Pumpkin',     emoji: '🎃', base: 175 },
    kale:       { name: 'Winter Kale', emoji: '🥦', base: 90 },
    egg:        { name: 'Egg',         emoji: '🥚', base: 22 },
    milk:       { name: 'Milk',        emoji: '🥛', base: 58 },
    wool:       { name: 'Wool',        emoji: '🧶', base: 92 },
    truffle:    { name: 'Truffle',     emoji: '🍄', base: 150 },
    bread:      { name: 'Bread',       emoji: '🍞', base: 95 },
    pie:        { name: 'Pumpkin Pie', emoji: '🥧', base: 380 },
    cheese:     { name: 'Cheese',      emoji: '🧀', base: 130 },
    butter:     { name: 'Butter',      emoji: '🧈', base: 230 },
  };

  // ---- Crops ----
  // seasons: indices into SEASONS. grow: seconds. tpl: draw template.
  const CROPS = {
    turnip:     { seed: 8,  grow: 35,  seasons: [0],       level: 1, xp: 4,  tpl: 'root',  color: '#e8d9f1', leaf: '#66bb6a' },
    wheat:      { seed: 6,  grow: 45,  seasons: [0, 1, 2], level: 1, xp: 4,  tpl: 'grain', color: '#e8c35a', leaf: '#9ccc65', grain: true },
    carrot:     { seed: 12, grow: 50,  seasons: [0, 2],    level: 2, xp: 6,  tpl: 'root',  color: '#f57c00', leaf: '#7cb342' },
    potato:     { seed: 18, grow: 70,  seasons: [0, 2],    level: 3, xp: 8,  tpl: 'root',  color: '#c49a6c', leaf: '#558b2f' },
    strawberry: { seed: 30, grow: 80,  seasons: [0],       level: 4, xp: 11, tpl: 'bush',  color: '#e53935', leaf: '#43a047' },
    tomato:     { seed: 35, grow: 95,  seasons: [1],       level: 4, xp: 12, tpl: 'bush',  color: '#e53935', leaf: '#2e7d32' },
    corn:       { seed: 45, grow: 120, seasons: [1],       level: 5, xp: 16, tpl: 'grain', color: '#fdd835', leaf: '#558b2f', tall: true, grain: true },
    sunflower:  { seed: 55, grow: 130, seasons: [1],       level: 6, xp: 18, tpl: 'flower', color: '#fdd835', leaf: '#558b2f' },
    cabbage:    { seed: 60, grow: 110, seasons: [2],       level: 7, xp: 18, tpl: 'leafy', color: '#81c784', leaf: '#388e3c' },
    pumpkin:    { seed: 80, grow: 150, seasons: [2],       level: 8, xp: 26, tpl: 'vine',  color: '#ef6c00', leaf: '#33691e' },
    kale:       { seed: 40, grow: 90,  seasons: [3],       level: 6, xp: 14, tpl: 'leafy', color: '#4db6ac', leaf: '#00796b' },
  };

  // ---- Animals ----
  const ANIMALS = {
    chicken: { name: 'Chicken', emoji: '🐔', cost: 120,  level: 2, home: 'coop', product: 'egg',     prodTime: 90,  feedCost: 5 },
    cow:     { name: 'Cow',     emoji: '🐄', cost: 500,  level: 4, home: 'barn', product: 'milk',    prodTime: 150, feedCost: 12 },
    sheep:   { name: 'Sheep',   emoji: '🐑', cost: 900,  level: 6, home: 'barn', product: 'wool',    prodTime: 240, feedCost: 15 },
    pig:     { name: 'Pig',     emoji: '🐖', cost: 1400, level: 8, home: 'barn', product: 'truffle', prodTime: 300, feedCost: 20 },
  };

  const ANIMAL_NAMES = ['Clover', 'Biscuit', 'Daisy', 'Peanut', 'Maple', 'Waffles', 'Poppy', 'Marshmallow', 'Pickles', 'Sunny', 'Bubbles', 'Nugget', 'Cocoa', 'Buttons', 'Ginger', 'Olive'];

  // ---- Buildings ----
  const BUILDINGS = {
    well:       { name: 'Well',       emoji: '💧', w: 1, h: 1, cost: 250,  level: 1,  desc: 'Tap to refill your watering can.' },
    coop:       { name: 'Coop',       emoji: '🐔', w: 2, h: 2, cost: 350,  level: 2,  desc: 'Houses up to 4 chickens.', capacity: 4, roof: '#e5533d' },
    scarecrow:  { name: 'Scarecrow',  emoji: '🎃', w: 1, h: 1, cost: 250,  level: 3,  desc: 'Protects crops nearby (5×5) from crows and storms.' },
    barn:       { name: 'Barn',       emoji: '🐄', w: 2, h: 2, cost: 900,  level: 4,  desc: 'Houses up to 4 cows, sheep or pigs.', capacity: 4, roof: '#8d5524' },
    sprinkler:  { name: 'Sprinkler',  emoji: '🚿', w: 1, h: 1, cost: 400,  level: 5,  desc: 'Waters crops around it (3×3) every morning.' },
    mill:       { name: 'Feed Mill',  emoji: '🌾', w: 2, h: 2, cost: 800,  level: 5,  desc: 'Feed animals with your wheat & corn instead of coins.', roof: '#a1887f' },
    bakery:     { name: 'Bakery',     emoji: '🍞', w: 2, h: 2, cost: 1200, level: 6,  desc: 'Bakes bread and pies from your harvest.', roof: '#d4a04c' },
    creamery:   { name: 'Creamery',   emoji: '🧀', w: 2, h: 2, cost: 1800, level: 7,  desc: 'Turns milk into cheese and butter.', roof: '#f5f0e1' },
    greenhouse: { name: 'Greenhouse', emoji: '🪴', w: 2, h: 2, cost: 5000, level: 9,  desc: 'Grow any crop in any season, and frost never kills.', roof: '#b3e5fc' },
  };

  // ---- Recipes (processing buildings) ----
  const RECIPES = {
    bread:  { building: 'bakery',   in: { wheat: 2, egg: 1 },              time: 50, out: 'bread' },
    pie:    { building: 'bakery',   in: { pumpkin: 1, wheat: 1, egg: 1 },  time: 90, out: 'pie' },
    cheese: { building: 'creamery', in: { milk: 1 },                       time: 60, out: 'cheese' },
    butter: { building: 'creamery', in: { milk: 2 },                       time: 90, out: 'butter' },
  };

  // ---- Tools ----
  const CAN_TIERS = [
    { name: 'Rusty Can',  cap: 6,  area: 1, cost: 0,    level: 1 },
    { name: 'Copper Can', cap: 12, area: 2, cost: 300,  level: 3 },
    { name: 'Iron Can',   cap: 22, area: 2, cost: 1200, level: 6 },
    { name: 'Golden Can', cap: 40, area: 3, cost: 4000, level: 10 },
  ];
  const HOE_TIERS = [
    { name: 'Rusty Hoe',  area: 1, cost: 0,    level: 1 },
    { name: 'Copper Hoe', area: 2, cost: 250,  level: 3 },
    { name: 'Golden Hoe', area: 3, cost: 2200, level: 8 },
  ];

  // ---- Land parcels ----
  const PARCELS = [
    { x: 7,  y: 5,  w: 6, h: 6, cost: 0,     level: 1 },
    { x: 13, y: 5,  w: 5, h: 6, cost: 1500,  level: 3 },
    { x: 2,  y: 5,  w: 5, h: 6, cost: 4000,  level: 5 },
    { x: 7,  y: 11, w: 6, h: 3, cost: 9000,  level: 7 },
    { x: 7,  y: 2,  w: 6, h: 3, cost: 12000, level: 8 },
    { x: 13, y: 11, w: 5, h: 3, cost: 16000, level: 9 },
    { x: 13, y: 2,  w: 5, h: 3, cost: 20000, level: 10 },
    { x: 2,  y: 11, w: 5, h: 3, cost: 25000, level: 11 },
    { x: 2,  y: 2,  w: 5, h: 3, cost: 30000, level: 12 },
  ];

  // ---- Goals (tutorial / direction) ----
  // check(state) => [current, needed]
  const GOALS = [
    { id: 'till',    icon: '⛏️', title: 'Till 4 plots',            reward: 30,  check: s => [s.stats.tilled, 4] },
    { id: 'plant',   icon: '🌱', title: 'Plant 4 crops',           reward: 30,  check: s => [s.stats.planted, 4] },
    { id: 'water',   icon: '💧', title: 'Water 4 crops',           reward: 30,  check: s => [s.stats.watered, 4] },
    { id: 'harvest', icon: '🧺', title: 'Harvest 4 crops',         reward: 50,  check: s => [s.stats.harvested, 4] },
    { id: 'sell',    icon: '⚖️', title: 'Sell 4 goods at market',  reward: 60,  check: s => [s.stats.sold, 4] },
    { id: 'coop',    icon: '🐔', title: 'Build a Coop & buy a chicken', reward: 100, check: s => [s.animals.length >= 1 ? 1 : 0, 1] },
    { id: 'eggs',    icon: '🥚', title: 'Collect 3 animal products', reward: 80, check: s => [s.stats.collected, 3] },
    { id: 'order',   icon: '📋', title: 'Complete 2 orders',        reward: 150, check: s => [s.stats.orders, 2] },
    { id: 'scare',   icon: '🎃', title: 'Place a Scarecrow',        reward: 100, check: s => [s.buildings.some(b => b.type === 'scarecrow') ? 1 : 0, 1] },
    { id: 'expand',  icon: '🚧', title: 'Expand your land',         reward: 200, check: s => [s.unlockedParcels.length - 1, 1] },
    { id: 'craft',   icon: '🍞', title: 'Craft 3 artisan goods',    reward: 250, check: s => [s.stats.crafted, 3] },
    { id: 'herd',    icon: '🐄', title: 'Own 6 animals',            reward: 300, check: s => [s.animals.length, 6] },
    { id: 'lvl10',   icon: '⭐', title: 'Reach level 10',           reward: 1000, check: s => [s.level, 10] },
    { id: 'empire',  icon: '👑', title: 'Own 5 land parcels',       reward: 2500, check: s => [s.unlockedParcels.length, 5] },
  ];

  // xp needed to go from `level` to the next
  function xpForLevel(level) {
    return Math.round(30 * level * Math.pow(1.22, level));
  }

  // everything unlocked exactly at `level` (for the level-up splash)
  function unlocksAt(level) {
    const out = [];
    for (const [id, c] of Object.entries(CROPS)) if (c.level === level) out.push(ITEMS[id].emoji + ' ' + ITEMS[id].name);
    for (const [id, a] of Object.entries(ANIMALS)) if (a.level === level) out.push(a.emoji + ' ' + a.name);
    for (const [id, b] of Object.entries(BUILDINGS)) if (b.level === level) out.push(b.emoji + ' ' + b.name);
    for (const t of CAN_TIERS) if (t.level === level && t.cost > 0) out.push('💧 ' + t.name);
    for (const t of HOE_TIERS) if (t.level === level && t.cost > 0) out.push('⛏️ ' + t.name);
    for (const p of PARCELS) if (p.level === level && p.cost > 0) { out.push('🚧 New land for sale'); break; }
    return out;
  }

  return {
    TILE, WORLD_W, WORLD_H, DAY_LEN, SEASON_DAYS, NIGHT_START,
    SEASONS, WEATHERS, WEATHER_TABLE,
    ITEMS, CROPS, ANIMALS, ANIMAL_NAMES, BUILDINGS, RECIPES,
    CAN_TIERS, HOE_TIERS, PARCELS, GOALS,
    xpForLevel, unlocksAt,
  };
})();
