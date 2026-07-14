/* ============ Harvest Empire — game data ============ */
'use strict';

const DATA = (() => {

  // ---- World / time ----
  const WORLD_W = 40;         // tiles — the home valley is a big, roomy homestead
  const WORLD_H = 30;
  const DAY_LEN = 120;        // real seconds per in-game day (slower, calmer cycle)
  const SEASON_DAYS = 10;     // days per season
  const NIGHT_START = 0.87;   // fraction of day when night falls
  const WILT_DAYS = 1.5;      // days a bone-dry crop survives before dying
  const ROT_DAYS = 2;         // days a ripe crop lasts before rotting in the field
  const VET_RATE = 0.4;       // vet bill as a fraction of the animal's price

  // money formatting
  const $ = n => '$' + Math.round(n).toLocaleString();

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
  // wiltDays: drought-survival window per mode (Cozy is forgiving for idlers);
  // escalate: does weather harshness ramp up as the farm gets rich?
  const DIFFICULTIES = [
    { id: 'cozy',    name: 'Cozy',    emoji: '🌤️', coins: 6000, eventMult: 0.5, sellBonus: 1,   wiltDays: 3,   escalate: false, blurb: 'A big nest egg and gentle weather. Relax and build.' },
    { id: 'classic', name: 'Classic', emoji: '🌾', coins: 3000, eventMult: 1,   sellBonus: 1,   wiltDays: 1.5, escalate: true,  blurb: 'A solid grubstake. Weather and crows play fair… mostly.' },
    { id: 'tycoon',  name: 'Tycoon',  emoji: '⛈️', coins: 1500, eventMult: 1.4, sellBonus: 1.05, wiltDays: 1.2, escalate: true,  blurb: 'Thin wallet, harsh skies that worsen as you grow — but goods sell for +5%.' },
  ];

  // ---- Fuel (powers the tiller, tractor and drones) ----
  const FUEL = { startPrice: 3.4, min: 2.6, max: 5.6, dronePerDay: 1 };

  // ---- THE Sunflower (the Toni Variety) ----
  // Mythic. Genuinely random — no seeds, no pity timers. Some farms will
  // never see one. That's the point. Harvesting one yields a single Glowing
  // Seed; a planted Glowing Seed reveals a new Toni at seedChance.
  const TONI = { plantChance: 1 / 100, seedChance: 1 / 25 }; // plantChance: silent roll when any seed is planted (1% — 99% of plantings are just the crop); seedChance: Glowing Seed reveal

  // ---- Items (everything sellable / storable) ----
  const ITEMS = {
    // crops — single-harvest values buffed +40-80% so regrow crops don't dominate
    turnip:     { name: 'Turnip',      emoji: '🥬', base: 26 },
    wheat:      { name: 'Wheat',       emoji: '🌾', base: 22 },
    carrot:     { name: 'Carrot',      emoji: '🥕', base: 42 },
    potato:     { name: 'Potato',      emoji: '🥔', base: 62 },
    rice:       { name: 'Rice',        emoji: '🍚', base: 84 },
    garlic:     { name: 'Garlic',      emoji: '🧄', base: 110 },
    strawberry: { name: 'Strawberry',  emoji: '🍓', base: 36 },
    tomato:     { name: 'Tomato',      emoji: '🍅', base: 44 },
    pepper:     { name: 'Pepper',      emoji: '🫑', base: 62 },
    corn:       { name: 'Corn',        emoji: '🌽', base: 145 },
    melon:      { name: 'Melon',       emoji: '🍉', base: 265 },
    sunflower:  { name: 'Sunflower',   emoji: '🌻', base: 200 },
    grapes:     { name: 'Grapes',      emoji: '🍇', base: 88 },
    cabbage:    { name: 'Cabbage',     emoji: '🥗', base: 215 },
    yam:        { name: 'Yam',         emoji: '🍠', base: 240 },
    pumpkin:    { name: 'Pumpkin',     emoji: '🎃', base: 300 },
    kale:       { name: 'Winter Kale', emoji: '🥦', base: 150 },
    frostberry: { name: 'Frostberry',  emoji: '🫐', base: 320 },
    // animal products
    egg:        { name: 'Egg',         emoji: '🥚', base: 24 },
    duck_egg:   { name: 'Duck Egg',    emoji: '🪺', base: 46 },
    milk:       { name: 'Milk',        emoji: '🥛', base: 62 },
    goat_milk:  { name: 'Goat Milk',   emoji: '🍶', base: 98 },
    wool:       { name: 'Wool',        emoji: '🧶', base: 150 },
    truffle:    { name: 'Truffle',     emoji: '🍄', base: 265 },
    truffle_oil:{ name: 'Truffle Oil', emoji: '🫒', base: 620 },
    // meat (from fattened pasture livestock, sold by the unit at market)
    chicken_meat:{ name: 'Chicken',    emoji: '🍗', base: 46 },
    pork:       { name: 'Pork',        emoji: '🥓', base: 96 },
    beef:       { name: 'Beef',        emoji: '🥩', base: 175 },
    // artisan goods
    bread:      { name: 'Bread',       emoji: '🍞', base: 110 },
    cookies:    { name: 'Cookies',     emoji: '🍪', base: 240 },
    pie:        { name: 'Pumpkin Pie', emoji: '🥧', base: 460 },   // keeps ~33% margin over buffed pumpkin
    cake:       { name: 'Berry Cake',  emoji: '🍰', base: 780 },
    cheese:     { name: 'Cheese',      emoji: '🧀', base: 140 },
    butter:     { name: 'Butter',      emoji: '🧈', base: 255 },
    goat_cheese:{ name: 'Goat Cheese', emoji: '🫕', base: 225 },
    yogurt:     { name: 'Yogurt',      emoji: '🍦', base: 310 },
    grape_juice:{ name: 'Grape Juice', emoji: '🧃', base: 410 },
    smoothie:   { name: 'Smoothie',    emoji: '🥤', base: 300 },
    melon_juice:{ name: 'Melon Juice', emoji: '🍹', base: 690 },   // keeps ~30% margin over buffed melons
    cloth:      { name: 'Fine Cloth',  emoji: '🧵', base: 650 },
    quilt:      { name: 'Wool Quilt',  emoji: '🛏️', base: 1500 },
    // mythic — never sold, never ordered, never priced (excluded from market flows)
    toni_seed:  { name: 'Glowing Seed', emoji: '🌟', base: 0, mythic: true },
  };

  // ---- Crops ----
  // Everything is available from day one — seed price is the only gate.
  // regrow: seconds to regrow after each harvest (multi-harvest crops).
  const CROPS = {
    turnip:     { seed: 8,  grow: 35,  seasons: [0],       xp: 4,  tpl: 'root',    color: '#e6ccf2', leaf: '#54a13e' },
    wheat:      { seed: 6,  grow: 40,  seasons: [0, 1, 2], xp: 4,  tpl: 'grain',   color: '#eab93c', leaf: '#93bc47', grain: true },
    carrot:     { seed: 12, grow: 50,  seasons: [0, 2],    xp: 6,  tpl: 'root',    color: '#f27916', leaf: '#66a534' },
    potato:     { seed: 18, grow: 70,  seasons: [0, 2],    xp: 8,  tpl: 'root',    color: '#c69361', leaf: '#549128' },
    rice:       { seed: 24, grow: 65,  seasons: [0, 1],    xp: 8,  tpl: 'grain',   color: '#f4eed4', leaf: '#3eb2a0', grain: true },
    garlic:     { seed: 30, grow: 85,  seasons: [0, 3],    xp: 10, tpl: 'root',    color: '#f4f0e2', leaf: '#66a534' },
    strawberry: { seed: 42, grow: 85,  seasons: [0],       xp: 9,  tpl: 'bush',    color: '#e83a42', leaf: '#39a344', regrow: 40 },
    tomato:     { seed: 48, grow: 95,  seasons: [1],       xp: 10, tpl: 'bush',    color: '#ee4230', leaf: '#2e8a35', regrow: 45 },
    pepper:     { seed: 55, grow: 105, seasons: [1],       xp: 11, tpl: 'bush',    color: '#f66430', leaf: '#3c821c', regrow: 45 },
    corn:       { seed: 45, grow: 120, seasons: [1, 2],    xp: 16, tpl: 'grain',   color: '#f8d22a', leaf: '#549128', tall: true, grain: true },
    melon:      { seed: 70, grow: 140, seasons: [1],       xp: 22, tpl: 'vine',    color: '#54b85c', leaf: '#3c821c', stripe: '#2c6e30' },
    sunflower:  { seed: 60, grow: 130, seasons: [1],       xp: 18, tpl: 'flower',  color: '#ffc93a', leaf: '#549128' },
    grapes:     { seed: 95, grow: 150, seasons: [2],       xp: 16, tpl: 'trellis', color: '#7e50c8', leaf: '#549128', regrow: 65 },
    cabbage:    { seed: 62, grow: 110, seasons: [2],       xp: 18, tpl: 'leafy',   color: '#6cc276', leaf: '#2f8f3e' },
    yam:        { seed: 68, grow: 125, seasons: [2],       xp: 20, tpl: 'root',    color: '#cc5f38', leaf: '#6b9c2e' },
    pumpkin:    { seed: 85, grow: 150, seasons: [2],       xp: 26, tpl: 'vine',    color: '#f57318', leaf: '#3c821c', stripe: '#a85417' },
    kale:       { seed: 42, grow: 90,  seasons: [3],       xp: 14, tpl: 'leafy',   color: '#38c2ac', leaf: '#0c8a76' },
    frostberry: { seed: 90, grow: 135, seasons: [3],       xp: 24, tpl: 'bush',    color: '#7284e0', leaf: '#3a6458' },
  };

  // ---- Animals ----
  // One barnyard, two ways to profit: every animal makes its product on a loop
  // (egg / milk / wool) AND can be sold for meat at any time. It slowly grows to
  // full size while it's fed, and a bigger animal is worth more meat — so you
  // choose: keep it producing, or raise it up and cash it out.
  const ANIMALS = {
    chicken: { name: 'Chicken', emoji: '🐔', cost: 150,  home: 'coop', product: 'egg',       prodTime: 90,  feedCost: 5,  meat: 'chicken_meat', meatBase: 2 },
    duck:    { name: 'Duck',    emoji: '🦆', cost: 420,  home: 'coop', product: 'duck_egg',  prodTime: 130, feedCost: 8,  meat: 'chicken_meat', meatBase: 3 },
    cow:     { name: 'Cow',     emoji: '🐄', cost: 850,  home: 'barn', product: 'milk',      prodTime: 100, feedCost: 12, meat: 'beef',         meatBase: 6 },
    goat:    { name: 'Goat',    emoji: '🐐', cost: 1300, home: 'barn', product: 'goat_milk', prodTime: 190, feedCost: 14, meat: 'beef',         meatBase: 5 },
    sheep:   { name: 'Sheep',   emoji: '🐑', cost: 1900, home: 'barn', product: 'wool',      prodTime: 240, feedCost: 16, meat: 'beef',         meatBase: 6 },
    pig:     { name: 'Pig',     emoji: '🐖', cost: 2400, home: 'barn', product: 'truffle',   prodTime: 300, feedCost: 22, meat: 'pork',         meatBase: 7 },
  };
  // seconds of feeding for a young animal to reach full size (best meat value)
  const ANIMAL_GROW = 480;

  const ANIMAL_NAMES = ['Clover', 'Biscuit', 'Daisy', 'Peanut', 'Maple', 'Waffles', 'Poppy', 'Marshmallow', 'Pickles', 'Sunny', 'Bubbles', 'Nugget', 'Cocoa', 'Buttons', 'Ginger', 'Olive', 'Pepper', 'Mochi', 'Toffee', 'Pumpernickel'];

  // ---- Farmhands (hired workers who tend the farm for a daily wage) ----
  // The late-game answer to "the farm runs itself, now what?": you hire a crew,
  // assign each hand a job + a patch of land, and run a payroll. They walk the
  // fields and do the work; wages (paid at dawn) are a real money sink, and a
  // hand you can't pay downs tools until you make payroll. Upgrading a hand
  // makes them work faster — somewhere for a fat late-game bank to go.
  const WORKER_JOBS = {
    harvest: { name: 'Harvester', emoji: '🧺', verb: 'harvesting', desc: 'Brings in every ripe crop in their patch.' },
    water:   { name: 'Waterer',   emoji: '💧', verb: 'watering',   desc: 'Keeps thirsty crops watered — no hand-watering.' },
    plant:   { name: 'Planter',   emoji: '🌱', verb: 'planting',   desc: 'Sows a chosen seed on any empty tilled soil (in season).' },
    till:    { name: 'Tiller',    emoji: '⛏️', verb: 'tilling',    desc: 'Breaks open grass into fresh soil, ready to plant.' },
    tend:    { name: 'Rancher',   emoji: '🐄', verb: 'tending',    desc: 'Collects animal produce the moment it\'s ready.' },
  };
  const WORKER = {
    hireCost: 2500,   // one-time signing fee
    baseWage: 120,    // $/day at level 1 (paid at dawn); +this again per extra level
    maxLevel: 5,
    upBase: 3000,     // upgrade to level N costs upBase × (N-1)
    baseRate: 0.85,   // actions per second at level 1
    ratePerLevel: 0.5,
    maxCrew: 8,
  };
  const WORKER_NAMES = ['Sam', 'Rosa', 'Ida', 'Gus', 'Pip', 'Nell', 'Cole', 'Bea', 'Milo', 'Fern', 'Otis', 'Hank', 'Lucy', 'Cass', 'Wade', 'June', 'Rye', 'Tess', 'Abe', 'Dot'];

  // ---- Meat livestock (raised in the Pasture, sold as meat via the Slaughterhouse) ----
  // A separate loop from the dairy/egg animals: you buy them young and cheap, feed
  // them so they fatten (weight climbs), and once they hit market weight you either
  // send them to slaughter for meat now, or keep feeding for a bigger payout — up to
  // a max weight where gains taper off. Slaughtering yields meat by the unit
  // (≈ the animal's weight), which sells at market and fills orders like any good.
  const MEAT_ANIMALS = {
    broiler: { name: 'Broiler',  emoji: '🐔', sprite: 'chicken', home: 'pasture', buyCost: 45,  growTime: 55,  startWt: 0.6, marketWt: 2,  maxWt: 3.4, meat: 'chicken_meat', feedCost: 4  },
    hog:     { name: 'Hog',      emoji: '🐖', sprite: 'pig',     home: 'pasture', buyCost: 260, growTime: 130, startWt: 1,   marketWt: 4,  maxWt: 7,   meat: 'pork',         feedCost: 10 },
    steer:   { name: 'Steer',    emoji: '🐄', sprite: 'cow',     home: 'pasture', buyCost: 720, growTime: 210, startWt: 1.2, marketWt: 6,  maxWt: 11,  meat: 'beef',         feedCost: 16 },
  };
  // fattening past market weight is slower (diminishing returns): the stretch to
  // max weight takes this many × the base grow time.
  const FATTEN_SLOWDOWN = 2.4;

  // ---- Buildings ----
  // No unlock levels anywhere — if you can afford it, you can build it.
  const BUILDINGS = {
    well:       { name: 'Well',         emoji: '💧', w: 1, h: 1, cost: 300,   desc: 'Tap to refill your watering can.' },
    scarecrow:  { name: 'Scarecrow',    emoji: '🎃', w: 1, h: 1, cost: 350,   desc: 'Protects crops nearby (5×5) from crows and storms.' },
    sprinkler:  { name: 'Sprinkler',    emoji: '🚿', w: 1, h: 1, cost: 600,   desc: 'Keeps crops around it (5×5) watered — no hand-watering needed.' },
    coop:       { name: 'Coop',         emoji: '🐔', w: 2, h: 2, cost: 500,   desc: 'Houses up to 6 chickens & ducks.', capacity: 6, roof: '#a8432f', wall: '#b98a5c', sign: 'COOP' },
    barn:       { name: 'Barn',         emoji: '🐄', w: 2, h: 2, cost: 1500,  desc: 'Houses up to 6 cows, goats, sheep or pigs.', capacity: 6, roof: '#7a4a24', wall: '#9e3d2d', sign: 'BARN' },
    mill:       { name: 'Feed Mill',    emoji: '🌾', w: 2, h: 2, cost: 2200,  desc: 'Grinds wheat & corn into animal feed — 1 grain becomes 3 feed credits.', roof: '#8d7a68', wall: '#a8977f', sign: 'MILL' },
    bakery:     { name: 'Bakery',       emoji: '🍞', w: 2, h: 2, cost: 3200,  desc: 'Bakes bread, cookies, pies and cakes.', roof: '#b8863b', wall: '#cbb391', sign: 'BAKERY' },
    creamery:   { name: 'Creamery',     emoji: '🧀', w: 2, h: 2, cost: 4800,  desc: 'Cheese, butter and yogurt from fresh milk.', roof: '#d9d2bd', wall: '#e8e0ca', sign: 'DAIRY' },
    press:      { name: 'Juice Press',  emoji: '🧃', w: 2, h: 2, cost: 5500,  desc: 'Presses fruit into premium juices.', roof: '#8fae62', wall: '#b3a06e', sign: 'PRESS' },
    loom:       { name: 'Loom House',   emoji: '🧵', w: 2, h: 2, cost: 6500,  desc: 'Weaves wool into fine cloth and quilts.', roof: '#7d6a9e', wall: '#b0a4c4', sign: 'LOOM' },
    drone:      { name: 'Harvest Drone',emoji: '🤖', w: 1, h: 1, cost: 7500,  desc: 'Auto-harvests AND replants a 5×5 area every morning. Burns 1 gal of fuel per run.' },
    greenhouse: { name: 'Greenhouse',   emoji: '🪴', w: 2, h: 2, cost: 6000,  desc: 'Shelters a 6×6 zone around it: any crop grows there in any season, and frost never kills. Build several!', roof: '#9cc4d4' },
    pasture:    { name: 'Pasture',      emoji: '🐄', w: 2, h: 2, cost: 1800,  capacity: 6, pasture: true, desc: 'Raise cattle, hogs & broilers for meat — buy them young and feed them to fatten up.', roof: '#6f9440', wall: '#cdbd8e', sign: 'PASTURE' },
    slaughterhouse: { name: 'Slaughterhouse', emoji: '🔪', w: 2, h: 2, cost: 5000, desc: 'Processes fattened livestock into Beef, Pork & Chicken. Build one before you can send stock to slaughter.', roof: '#8a3d3d', wall: '#b9b0a6', sign: 'MEAT' },
    // decorative home — placed on the starting farm, never sold in the Shop
    farmhouse:  { name: 'Farmhouse',    emoji: '🏡', w: 2, h: 2, cost: 0, decor: true, desc: 'Your homestead — just for the view.', roof: '#b45c3a', wall: '#ecdcb8', sign: 'HOME' },
  };

  // ---- Realtor: whole properties for sale, small → massive (bought outright) ----
  // Sizes kept moderate so the ground bake stays memory-safe on phones.
  const FARM_TEMPLATES = [
    { id: 'meadow',   name: 'Bluebell Meadow',  w: 14, h: 11, price: 12000,  blurb: 'A snug little plot — cozy and quick to fill.' },
    { id: 'grove',    name: 'Willow Grove',     w: 24, h: 18, price: 45000,  blurb: 'A roomy spread with space for a real operation.' },
    { id: 'estate',   name: 'Goldfield Estate', w: 46, h: 32, price: 120000, blurb: 'A grand estate — acres of open land, bigger than the home valley.' },
    { id: 'frontier', name: 'Big Sky Frontier', w: 50, h: 34, price: 300000, blurb: 'Massive frontier land as far as the eye can see.' },
  ];

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
    truffle_oil: { building: 'press',    in: { truffle: 1 },                                time: 90,  out: 'truffle_oil' },
    cloth:       { building: 'loom',     in: { wool: 2 },                                   time: 100, out: 'cloth' },
    quilt:       { building: 'loom',     in: { cloth: 2 },                                  time: 150, out: 'quilt' },
  };

  // ---- Equipment (cost is the only gate; powered gear burns fuel) ----
  const CAN_TIERS = [
    { name: 'Watering Can',   cap: 6,  area: 1, cost: 0 },
    { name: 'Hose Cart',      cap: 12, area: 2, cost: 400 },
    { name: 'Water Wagon',    cap: 22, area: 2, cost: 1600 },
    { name: 'Irrigation Rig', cap: 40, area: 3, cost: 5000 },
  ];
  const TILL_TIERS = [
    { name: 'Hand Hoe',        area: 1, cost: 0,    fuel: 0 },
    { name: 'Rototiller',      area: 2, cost: 450,  fuel: 0.05 },
    { name: 'Compact Tractor', area: 3, cost: 2800, fuel: 0.12 },
  ];

  // ---- Land parcels (cost only, no level requirements) ----
  // The home valley: a big 40×30 world laid out as a clean, gap-free grid so the
  // farm reads deliberate instead of a patchwork of odd bands. The free starting
  // plot (index 0) is a generous 20×12 homestead in the top-left; the other seven
  // parcels tile the rest of the interior on aligned edges (x: 2·12·22·38,
  // y: 2·11·14·20·21·28). Fully owned, the valley is a perfect 36×26 rectangle.
  // The layout is a strict superset of every older home (20×15 and 34×26), so the
  // migration re-owns whatever covers your old land and never strands a crop.
  const PARCELS = [
    { x: 2,  y: 2,  w: 20, h: 12, cost: 0 },     // free starting homestead — big top-left block
    { x: 22, y: 2,  w: 16, h: 9,  cost: 1500 },  // right, upper
    { x: 2,  y: 14, w: 10, h: 7,  cost: 3000 },  // below home, left
    { x: 12, y: 14, w: 10, h: 7,  cost: 5000 },  // below home, right
    { x: 22, y: 11, w: 16, h: 9,  cost: 9000 },  // right, middle
    { x: 2,  y: 21, w: 10, h: 7,  cost: 16000 }, // far bottom-left
    { x: 12, y: 21, w: 10, h: 7,  cost: 28000 }, // far bottom-centre
    { x: 22, y: 20, w: 16, h: 8,  cost: 45000 }, // right, lower
  ];

  // ---- Goals (a guiding arc — rewards, never gates) ----
  // check(state) => [current, needed]
  const GOALS = [
    { id: 'till',    icon: '⛏️', title: 'Till 4 plots',                  reward: 40,    check: s => [s.stats.tilled, 4] },
    { id: 'plant',   icon: '🌱', title: 'Plant 4 crops',                 reward: 40,    check: s => [s.stats.planted, 4] },
    { id: 'water',   icon: '💧', title: 'Water 4 crops',                 reward: 40,    check: s => [s.stats.watered, 4] },
    { id: 'harvest', icon: '🧺', title: 'Harvest 6 crops',               reward: 60,    check: s => [s.stats.harvested, 6] },
    { id: 'earn1',   icon: '⚖️', title: 'Earn $300 selling goods',       reward: 80,    check: s => [Math.floor(s.stats.earned), 300] },
    { id: 'coop',    icon: '🐔', title: 'Build a Coop & buy a bird',     reward: 120,   check: s => [s.animals.length >= 1 ? 1 : 0, 1] },
    { id: 'collect', icon: '🥚', title: 'Collect 5 animal products',     reward: 100,   check: s => [s.stats.collected, 5] },
    { id: 'order',   icon: '📋', title: 'Complete 2 orders',             reward: 180,   check: s => [s.stats.orders, 2] },
    { id: 'equip',   icon: '🎃', title: 'Place a Scarecrow',             reward: 150,   check: s => [s.buildings.some(b => b && b.type === 'scarecrow') ? 1 : 0, 1] },
    { id: 'expand',  icon: '🚧', title: 'Buy your 2nd land parcel',      reward: 250,   check: s => [s.unlockedParcels.length - 1, 1] },
    { id: 'water10', icon: '💧', title: 'Water 10 crops',               reward: 150,   check: s => [s.stats.watered, 10] },
    { id: 'craft',   icon: '🍞', title: 'Craft 4 artisan goods',         reward: 300,   check: s => [s.stats.crafted, 4] },
    { id: 'herd',    icon: '🐄', title: 'Own 8 animals',                 reward: 400,   check: s => [s.animals.length, 8] },
    { id: 'earn2',   icon: '💰', title: 'Earn $10,000 lifetime',         reward: 600,   check: s => [Math.floor(s.stats.earned), 10000] },
    { id: 'auto',    icon: '🤖', title: 'Automate: drone + sprinkler',   reward: 500,   check: s => [(s.buildings.some(b => b && b.type === 'drone') ? 1 : 0) + (s.buildings.some(b => b && b.type === 'sprinkler') ? 1 : 0), 2] },
    { id: 'land3',   icon: '🗺️', title: 'Own 4 land parcels',            reward: 1000,  check: s => [s.unlockedParcels.length, 4] },
    { id: 'value',   icon: '🏦', title: 'Reach $60,000 farm value',      reward: 2000,  check: s => [Game.farmValue(), 60000] },
    { id: 'empire',  icon: '👑', title: 'Own the whole valley',          reward: 10000, check: s => [s.unlockedParcels.length, PARCELS.length] },
    // ---- late-game ladder: the arc no longer runs dry after the valley ----
    { id: 'harvest500', icon: '🌽', title: 'Harvest 500 crops',           reward: 1500,  check: s => [s.stats.harvested, 500] },
    { id: 'zoo',     icon: '🐖', title: 'Own one of every animal',        reward: 2200,  check: s => [new Set(s.animals.map(a => a.type)).size, Object.keys(ANIMALS).length] },
    { id: 'craft50', icon: '🥧', title: 'Craft 50 artisan goods',         reward: 1800,  check: s => [s.stats.crafted, 50] },
    { id: 'rep15',   icon: '⭐', title: 'Reach reputation level 15',       reward: 3000,  check: s => [s.level, 15] },
    { id: 'value150',icon: '🏰', title: 'Reach $150,000 farm value',      reward: 5000,  check: s => [Game.farmValue(), 150000] },
    { id: 'value300',icon: '💎', title: 'Reach $300,000 farm value',      reward: 12000, check: s => [Game.farmValue(), 300000] },
  ];

  // reputation: xp needed to go from `level` to the next
  function xpForLevel(level) {
    return Math.round(30 * level * Math.pow(1.22, level));
  }

  // reputation perk: +1.5% sell price per level, capped at +30% (level 21)
  function repBonus(level) {
    return Math.min(0.30, (level - 1) * 0.015);
  }

  // processing buildings: extra parallel craft lanes (index = slot number)
  const SLOT_COSTS = [0, 0, 2000, 6000];

  return {
    WORLD_W, WORLD_H, DAY_LEN, SEASON_DAYS, NIGHT_START,
    WILT_DAYS, ROT_DAYS, VET_RATE, FUEL, TONI, $,
    SEASONS, WEATHERS, WEATHER_TABLE, DIFFICULTIES,
    ITEMS, CROPS, ANIMALS, ANIMAL_NAMES, ANIMAL_GROW, BUILDINGS, RECIPES,
    WORKER_JOBS, WORKER, WORKER_NAMES,
    MEAT_ANIMALS, FATTEN_SLOWDOWN,
    CAN_TIERS, TILL_TIERS, PARCELS, GOALS, SLOT_COSTS, FARM_TEMPLATES,
    xpForLevel, repBonus,
  };
})();
