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
  const FERT_COST = 20;       // coins per fertilizer application

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
    [['sun', 45], ['rain', 30], ['cloud', 18], ['storm', 7]],                  // spring
    [['sun', 45], ['drought', 22], ['cloud', 15], ['rain', 10], ['storm', 8]], // summer
    [['sun', 34], ['cloud', 26], ['rain', 26], ['storm', 14]],                 // fall
    [['snow', 50], ['cloud', 28], ['sun', 22]],                                // winter
  ];

  // ---- Difficulty (chosen at farm creation — sets starting capital & event harshness) ----
  const DIFFICULTIES = [
    { id: 'cozy',    name: 'Cozy',    emoji: '🌤️', coins: 6000, eventMult: 0.5, sellBonus: 1,    blurb: 'A big nest egg and gentle weather. Relax and build.' },
    { id: 'classic', name: 'Classic', emoji: '🌾', coins: 3000, eventMult: 1,   sellBonus: 1,    blurb: 'A solid grubstake. Weather and crows play fair… mostly.' },
    { id: 'tycoon',  name: 'Tycoon',  emoji: '⛈️', coins: 1500, eventMult: 1.4, sellBonus: 1.1,  blurb: 'Thin wallet, harsh skies — but goods sell for +10%.' },
  ];

  // ---- Items (everything sellable / storable) ----
  const ITEMS = {
    // crops
    turnip:     { name: 'Turnip',      emoji: '🥬', base: 17 },
    wheat:      { name: 'Wheat',       emoji: '🌾', base: 13 },
    carrot:     { name: 'Carrot',      emoji: '🥕', base: 27 },
    potato:     { name: 'Potato',      emoji: '🥔', base: 40 },
    rice:       { name: 'Rice',        emoji: '🍚', base: 54 },
    garlic:     { name: 'Garlic',      emoji: '🧄', base: 70 },
    strawberry: { name: 'Strawberry',  emoji: '🍓', base: 36 },
    tomato:     { name: 'Tomato',      emoji: '🍅', base: 44 },
    pepper:     { name: 'Pepper',      emoji: '🫑', base: 62 },
    corn:       { name: 'Corn',        emoji: '🌽', base: 98 },
    melon:      { name: 'Melon',       emoji: '🍉', base: 165 },
    sunflower:  { name: 'Sunflower',   emoji: '🌻', base: 128 },
    grapes:     { name: 'Grapes',      emoji: '🍇', base: 88 },
    cabbage:    { name: 'Cabbage',     emoji: '🥗', base: 132 },
    yam:        { name: 'Yam',         emoji: '🍠', base: 150 },
    pumpkin:    { name: 'Pumpkin',     emoji: '🎃', base: 190 },
    kale:       { name: 'Winter Kale', emoji: '🥦', base: 95 },
    frostberry: { name: 'Frostberry',  emoji: '🫐', base: 196 },
    // animal products
    egg:        { name: 'Egg',         emoji: '🥚', base: 24 },
    duck_egg:   { name: 'Duck Egg',    emoji: '🪺', base: 46 },
    milk:       { name: 'Milk',        emoji: '🥛', base: 62 },
    goat_milk:  { name: 'Goat Milk',   emoji: '🍶', base: 98 },
    wool:       { name: 'Wool',        emoji: '🧶', base: 150 },
    truffle:    { name: 'Truffle',     emoji: '🍄', base: 265 },
    // artisan goods
    bread:      { name: 'Bread',       emoji: '🍞', base: 110 },
    cookies:    { name: 'Cookies',     emoji: '🍪', base: 240 },
    pie:        { name: 'Pumpkin Pie', emoji: '🥧', base: 420 },
    cake:       { name: 'Berry Cake',  emoji: '🍰', base: 780 },
    cheese:     { name: 'Cheese',      emoji: '🧀', base: 140 },
    butter:     { name: 'Butter',      emoji: '🧈', base: 255 },
    goat_cheese:{ name: 'Goat Cheese', emoji: '🫕', base: 225 },
    yogurt:     { name: 'Yogurt',      emoji: '🍦', base: 310 },
    grape_juice:{ name: 'Grape Juice', emoji: '🧃', base: 410 },
    smoothie:   { name: 'Smoothie',    emoji: '🥤', base: 300 },
    melon_juice:{ name: 'Melon Juice', emoji: '🍹', base: 560 },
    cloth:      { name: 'Fine Cloth',  emoji: '🧵', base: 650 },
    quilt:      { name: 'Wool Quilt',  emoji: '🛏️', base: 1500 },
  };

  // ---- Crops ----
  // Everything is available from day one — seed price is the only gate.
  // regrow: seconds to regrow after each harvest (multi-harvest crops).
  const CROPS = {
    turnip:     { seed: 8,  grow: 35,  seasons: [0],       xp: 4,  tpl: 'root',    color: '#e8d9f1', leaf: '#66bb6a' },
    wheat:      { seed: 6,  grow: 45,  seasons: [0, 1, 2], xp: 4,  tpl: 'grain',   color: '#e8c35a', leaf: '#9ccc65', grain: true },
    carrot:     { seed: 12, grow: 50,  seasons: [0, 2],    xp: 6,  tpl: 'root',    color: '#f57c00', leaf: '#7cb342' },
    potato:     { seed: 18, grow: 70,  seasons: [0, 2],    xp: 8,  tpl: 'root',    color: '#c49a6c', leaf: '#558b2f' },
    rice:       { seed: 24, grow: 65,  seasons: [0, 1],    xp: 8,  tpl: 'grain',   color: '#f5f0dc', leaf: '#4db6ac', grain: true },
    garlic:     { seed: 30, grow: 85,  seasons: [0, 3],    xp: 10, tpl: 'root',    color: '#f5f2ea', leaf: '#7cb342' },
    strawberry: { seed: 42, grow: 85,  seasons: [0],       xp: 9,  tpl: 'bush',    color: '#e53935', leaf: '#43a047', regrow: 40 },
    tomato:     { seed: 48, grow: 95,  seasons: [1],       xp: 10, tpl: 'bush',    color: '#e53935', leaf: '#2e7d32', regrow: 45 },
    pepper:     { seed: 55, grow: 105, seasons: [1],       xp: 11, tpl: 'bush',    color: '#ff7043', leaf: '#33691e', regrow: 50 },
    corn:       { seed: 45, grow: 120, seasons: [1, 2],    xp: 16, tpl: 'grain',   color: '#fdd835', leaf: '#558b2f', tall: true, grain: true },
    melon:      { seed: 70, grow: 140, seasons: [1],       xp: 22, tpl: 'vine',    color: '#66bb6a', leaf: '#33691e', stripe: '#2e7d32' },
    sunflower:  { seed: 60, grow: 130, seasons: [1],       xp: 18, tpl: 'flower',  color: '#fdd835', leaf: '#558b2f' },
    grapes:     { seed: 95, grow: 150, seasons: [2],       xp: 16, tpl: 'trellis', color: '#7e57c2', leaf: '#558b2f', regrow: 65 },
    cabbage:    { seed: 62, grow: 110, seasons: [2],       xp: 18, tpl: 'leafy',   color: '#81c784', leaf: '#388e3c' },
    yam:        { seed: 68, grow: 125, seasons: [2],       xp: 20, tpl: 'root',    color: '#b5654d', leaf: '#6d8b3a' },
    pumpkin:    { seed: 85, grow: 150, seasons: [2],       xp: 26, tpl: 'vine',    color: '#ef6c00', leaf: '#33691e', stripe: '#bf5f02' },
    kale:       { seed: 42, grow: 90,  seasons: [3],       xp: 14, tpl: 'leafy',   color: '#4db6ac', leaf: '#00796b' },
    frostberry: { seed: 90, grow: 135, seasons: [3],       xp: 24, tpl: 'bush',    color: '#7986cb', leaf: '#37474f' },
  };

  // ---- Animals ----
  const ANIMALS = {
    chicken: { name: 'Chicken', emoji: '🐔', cost: 150,  home: 'coop', product: 'egg',       prodTime: 90,  feedCost: 5 },
    duck:    { name: 'Duck',    emoji: '🦆', cost: 420,  home: 'coop', product: 'duck_egg',  prodTime: 130, feedCost: 8 },
    cow:     { name: 'Cow',     emoji: '🐄', cost: 850,  home: 'barn', product: 'milk',      prodTime: 150, feedCost: 12 },
    goat:    { name: 'Goat',    emoji: '🐐', cost: 1300, home: 'barn', product: 'goat_milk', prodTime: 190, feedCost: 14 },
    sheep:   { name: 'Sheep',   emoji: '🐑', cost: 1900, home: 'barn', product: 'wool',      prodTime: 240, feedCost: 16 },
    pig:     { name: 'Pig',     emoji: '🐖', cost: 3200, home: 'barn', product: 'truffle',   prodTime: 300, feedCost: 22 },
  };

  const ANIMAL_NAMES = ['Clover', 'Biscuit', 'Daisy', 'Peanut', 'Maple', 'Waffles', 'Poppy', 'Marshmallow', 'Pickles', 'Sunny', 'Bubbles', 'Nugget', 'Cocoa', 'Buttons', 'Ginger', 'Olive', 'Pepper', 'Mochi', 'Toffee', 'Pumpernickel'];

  // ---- Buildings ----
  // No unlock levels anywhere — if you can afford it, you can build it.
  const BUILDINGS = {
    well:       { name: 'Well',         emoji: '💧', w: 1, h: 1, cost: 300,   desc: 'Tap to refill your watering can.' },
    scarecrow:  { name: 'Scarecrow',    emoji: '🎃', w: 1, h: 1, cost: 350,   desc: 'Protects crops nearby (5×5) from crows and storms.' },
    sprinkler:  { name: 'Sprinkler',    emoji: '🚿', w: 1, h: 1, cost: 600,   desc: 'Waters crops around it (3×3) every morning.' },
    coop:       { name: 'Coop',         emoji: '🐔', w: 2, h: 2, cost: 500,   desc: 'Houses up to 6 chickens & ducks.', capacity: 6, roof: '#e5533d' },
    barn:       { name: 'Barn',         emoji: '🐄', w: 2, h: 2, cost: 1500,  desc: 'Houses up to 6 cows, goats, sheep or pigs.', capacity: 6, roof: '#8d5524' },
    mill:       { name: 'Feed Mill',    emoji: '🌾', w: 2, h: 2, cost: 2200,  desc: 'Feed animals with your wheat & corn instead of coins.', roof: '#a1887f' },
    bakery:     { name: 'Bakery',       emoji: '🍞', w: 2, h: 2, cost: 3200,  desc: 'Bakes bread, cookies, pies and cakes.', roof: '#d4a04c' },
    creamery:   { name: 'Creamery',     emoji: '🧀', w: 2, h: 2, cost: 4800,  desc: 'Cheese, butter and yogurt from fresh milk.', roof: '#f5f0e1' },
    press:      { name: 'Juice Press',  emoji: '🧃', w: 2, h: 2, cost: 5500,  desc: 'Presses fruit into premium juices.', roof: '#aed581' },
    loom:       { name: 'Loom House',   emoji: '🧵', w: 2, h: 2, cost: 6500,  desc: 'Weaves wool into fine cloth and quilts.', roof: '#9575cd' },
    drone:      { name: 'Harvest Drone',emoji: '🤖', w: 1, h: 1, cost: 7500,  desc: 'Auto-harvests AND replants a 5×5 area every morning.' },
    greenhouse: { name: 'Greenhouse',   emoji: '🪴', w: 2, h: 2, cost: 12000, desc: 'Grow any crop in any season, and frost never kills.', roof: '#b3e5fc' },
  };

  // ---- Recipes (processing buildings) ----
  const RECIPES = {
    bread:       { building: 'bakery',   in: { wheat: 2, egg: 1 },                          time: 50,  out: 'bread' },
    cookies:     { building: 'bakery',   in: { wheat: 2, egg: 1, milk: 1 },                 time: 70,  out: 'cookies' },
    pie:         { building: 'bakery',   in: { pumpkin: 1, wheat: 1, egg: 1 },              time: 90,  out: 'pie' },
    cake:        { building: 'bakery',   in: { wheat: 3, egg: 2, milk: 2, strawberry: 1 },  time: 120, out: 'cake' },
    cheese:      { building: 'creamery', in: { milk: 1 },                                   time: 60,  out: 'cheese' },
    butter:      { building: 'creamery', in: { milk: 2 },                                   time: 90,  out: 'butter' },
    goat_cheese: { building: 'creamery', in: { goat_milk: 1 },                              time: 75,  out: 'goat_cheese' },
    yogurt:      { building: 'creamery', in: { milk: 1, strawberry: 2 },                    time: 80,  out: 'yogurt' },
    grape_juice: { building: 'press',    in: { grapes: 2 },                                 time: 70,  out: 'grape_juice' },
    smoothie:    { building: 'press',    in: { strawberry: 3 },                             time: 60,  out: 'smoothie' },
    melon_juice: { building: 'press',    in: { melon: 2 },                                  time: 80,  out: 'melon_juice' },
    cloth:       { building: 'loom',     in: { wool: 2 },                                   time: 100, out: 'cloth' },
    quilt:       { building: 'loom',     in: { cloth: 2 },                                  time: 150, out: 'quilt' },
  };

  // ---- Tools (cost is the only gate) ----
  const CAN_TIERS = [
    { name: 'Rusty Can',  cap: 6,  area: 1, cost: 0 },
    { name: 'Copper Can', cap: 12, area: 2, cost: 400 },
    { name: 'Iron Can',   cap: 22, area: 2, cost: 1600 },
    { name: 'Golden Can', cap: 40, area: 3, cost: 5000 },
  ];
  const HOE_TIERS = [
    { name: 'Rusty Hoe',  area: 1, cost: 0 },
    { name: 'Copper Hoe', area: 2, cost: 350 },
    { name: 'Golden Hoe', area: 3, cost: 2800 },
  ];

  // ---- Land parcels (cost only, no level requirements) ----
  const PARCELS = [
    { x: 7,  y: 5,  w: 6, h: 6, cost: 0 },
    { x: 13, y: 5,  w: 5, h: 6, cost: 1000 },
    { x: 2,  y: 5,  w: 5, h: 6, cost: 2500 },
    { x: 7,  y: 11, w: 6, h: 3, cost: 6000 },
    { x: 7,  y: 2,  w: 6, h: 3, cost: 12000 },
    { x: 13, y: 11, w: 5, h: 3, cost: 20000 },
    { x: 13, y: 2,  w: 5, h: 3, cost: 32000 },
    { x: 2,  y: 11, w: 5, h: 3, cost: 45000 },
    { x: 2,  y: 2,  w: 5, h: 3, cost: 60000 },
  ];

  // ---- Goals (a guiding arc — rewards, never gates) ----
  // check(state) => [current, needed]
  const GOALS = [
    { id: 'till',    icon: '⛏️', title: 'Till 4 plots',                 reward: 40,    check: s => [s.stats.tilled, 4] },
    { id: 'plant',   icon: '🌱', title: 'Plant 4 crops',                reward: 40,    check: s => [s.stats.planted, 4] },
    { id: 'water',   icon: '💧', title: 'Water 4 crops',                reward: 40,    check: s => [s.stats.watered, 4] },
    { id: 'harvest', icon: '🧺', title: 'Harvest 6 crops',              reward: 60,    check: s => [s.stats.harvested, 6] },
    { id: 'earn1',   icon: '⚖️', title: 'Earn 300 coins selling goods', reward: 80,    check: s => [Math.floor(s.stats.earned), 300] },
    { id: 'coop',    icon: '🐔', title: 'Build a Coop & buy a bird',    reward: 120,   check: s => [s.animals.length >= 1 ? 1 : 0, 1] },
    { id: 'collect', icon: '🥚', title: 'Collect 5 animal products',    reward: 100,   check: s => [s.stats.collected, 5] },
    { id: 'order',   icon: '📋', title: 'Complete 2 orders',            reward: 180,   check: s => [s.stats.orders, 2] },
    { id: 'equip',   icon: '🎃', title: 'Place a Scarecrow',            reward: 150,   check: s => [s.buildings.some(b => b.type === 'scarecrow') ? 1 : 0, 1] },
    { id: 'expand',  icon: '🚧', title: 'Buy your 2nd land parcel',     reward: 250,   check: s => [s.unlockedParcels.length - 1, 1] },
    { id: 'fert',    icon: '✨', title: 'Fertilize 5 crops',            reward: 150,   check: s => [s.stats.fertilized, 5] },
    { id: 'craft',   icon: '🍞', title: 'Craft 4 artisan goods',        reward: 300,   check: s => [s.stats.crafted, 4] },
    { id: 'herd',    icon: '🐄', title: 'Own 8 animals',                reward: 400,   check: s => [s.animals.length, 8] },
    { id: 'earn2',   icon: '💰', title: 'Earn 10,000 coins lifetime',   reward: 600,   check: s => [Math.floor(s.stats.earned), 10000] },
    { id: 'auto',    icon: '🤖', title: 'Automate: drone + sprinkler',  reward: 500,   check: s => [(s.buildings.some(b => b.type === 'drone') ? 1 : 0) + (s.buildings.some(b => b.type === 'sprinkler') ? 1 : 0), 2] },
    { id: 'land3',   icon: '🗺️', title: 'Own 4 land parcels',           reward: 1000,  check: s => [s.unlockedParcels.length, 4] },
    { id: 'value',   icon: '🏦', title: 'Reach 60,000 farm value',      reward: 2000,  check: s => [Game.farmValue(), 60000] },
    { id: 'empire',  icon: '👑', title: 'Own the whole valley',         reward: 10000, check: s => [s.unlockedParcels.length, PARCELS.length] },
  ];

  // reputation: xp needed to go from `level` to the next
  function xpForLevel(level) {
    return Math.round(30 * level * Math.pow(1.22, level));
  }

  // reputation perk: +1% sell price per level, capped at +30%
  function repBonus(level) {
    return Math.min(0.30, (level - 1) * 0.01);
  }

  return {
    TILE, WORLD_W, WORLD_H, DAY_LEN, SEASON_DAYS, NIGHT_START, FERT_COST,
    SEASONS, WEATHERS, WEATHER_TABLE, DIFFICULTIES,
    ITEMS, CROPS, ANIMALS, ANIMAL_NAMES, BUILDINGS, RECIPES,
    CAN_TIERS, HOE_TIERS, PARCELS, GOALS,
    xpForLevel, repBonus,
  };
})();
