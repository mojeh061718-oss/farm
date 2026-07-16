# 🌾 Harvest Empire

A farming-empire simulation in a beautiful 45° isometric view, running in any browser — no
install, no build step, and **no artificial gates**: you pick your starting capital in US
dollars, and from minute one everything in the game is for sale. If you can afford it, it's
yours. Money is the only ladder — and the farm never punishes you: **nothing you plant can
ever be lost to neglect.** Step away for a week and come back to a farm that waited for you.

## ✨ What makes it tick

- **A stunning 45° isometric farm** — "Golden Hour Storybook" art direction: sun-driven
  lighting with colored shadows, glowing windows and fireflies at night, shingled roofs and
  plank walls, crafted soil beds, worn paths, a living pond, seasonal transformations (blossoms,
  amber falls, snow-lined winters), animated harvest/till/water effects, animal behaviors, real
  lightning strikes, and a pentatonic sound system — all procedural Canvas 2D, zero assets,
  60fps-tuned with sprite baking, adaptive resolution and a night lightmap.
- **Start with a stake, not a grind** — name your farm and choose your starting capital:
  🌤️ *Cozy* ($6,000, calm skies), 🌾 *Classic* ($3,000), or ⛈️ *Tycoon* ($1,500, busier
  skies, but +5% sell prices). No levels to wait for, no unlock walls — strategy decides
  what you can afford next.
- **A farm that forgives** — dry crops simply pause until watered (or it rains); out-of-season
  crops grow slowly instead of dying; ripe crops wait patiently to be picked. Away time is
  always safe: weather drama never strikes an unattended farm. The only stakes are live ones —
  storms and winter frost can claim unprotected crops and crows steal ripe ones *while you
  play*, and a cheap Scarecrow or Greenhouse shuts even that down.
- **Fuel economy** — the rototiller, tractor and harvest drones burn diesel, and the price per
  gallon changes daily (opt-in Auto-fuel keeps the tank topped so automation never strands).
- **Fast, satisfying farming** — 18 crops growing in 35s–150s, including **multi-harvest crops**
  (strawberries, tomatoes, peppers, grapes) that regrow after every pick, and a lucky 15%
  double-harvest on every crop. Smart "Auto" tap does the right thing; select a tool and
  **drag to paint** whole rows.
- **Seasons & weather with character** — every season has its own crops and palette. Rain
  waters for free, heatwaves dry fields faster, and the HUD shows **tomorrow's forecast** so
  you can plan around it.
- **One friendly barnyard** — chickens, ducks, cows, goats, sheep and pigs. The rule is simple:
  **fed = producing** (eggs, milk, wool, truffles — with a lucky 15% double yield). Every
  animal also grows toward full size while fed, and can be **sold for meat** at any time —
  keep it producing, or raise it up and cash it out.
- **A real production economy** — 12 buildings and 14 artisan recipes: bakery (bread → berry
  cake), creamery (cheese, butter, yogurt), juice press, loom house (wool → quilts worth $1,500).
  Raw goods are fine; processed goods build empires.
- **Automation end-game** — sprinklers keep a 5×5 plot watered, the 🤖 **Harvest Drone**
  auto-harvests *and replants* a 5×5 field every morning, and opt-in **Auto-sell** liquidates
  surplus at dawn. Then hire **Farmhands** — a named crew you assign jobs and patches, pay a
  dawn wage, and train up to run the whole operation.
- **A living market** — prices drift daily, a rotating hot item pays +50%, **Market Day**
  (every season's day 5) brings special buyers at +50%, and a delivery-order board pays a
  premium that scales with your success.
- **Reasons to come back** — three fresh daily tasks with an escalating streak (day 7 pays a
  jackpot), goals that always point at what you're closest to, and a compendium tracking every
  crop, recipe, animal and building you've touched.
- **Reputation, not gates** — XP levels are pure upside: each level adds to every sale
  (up to +30%). Nothing is ever locked behind them.
- **Own the whole valley — then more** — 8 land parcels from $1,500 to $45,000, and a Realtor
  selling whole new properties up to a massive frontier spread. Own it all and **Start a New
  Legacy**: retire the farm for a permanent +10% sell bonus per Legacy Star, forever.
- **Mobile-first** — touch controls (tap, drag-paint, pinch-zoom), autosave with rotating
  backups and an exportable farm code, offline progress with a welcome-back summary, day/night
  cycle, ambient butterflies and falling leaves.

*And old-timers at the market whisper about a sunflower that glows. Probably just a story.*

## ▶️ Play it

Any static file server works:

```bash
cd farm
python3 -m http.server 8000
# open http://localhost:8000 (or your phone via your LAN IP)
```

Or enable **GitHub Pages** for this repo (Settings → Pages → Source: *GitHub Actions*) and the
included workflow will publish the game on every push to `main` — then open the Pages URL on your
phone and "Add to Home Screen" for a full-screen, app-like experience.

## 🎮 How to play

| Action | How |
|---|---|
| Till / plant / water / harvest | Tap tiles in **Auto** mode — it does the right thing |
| Work fast | Pick a tool (Till/Plant/Water/Harvest) and drag across tiles |
| Refill the watering can | Tap the **Well** |
| Pan / zoom | Drag in Auto mode / pinch (mouse-wheel on desktop) |
| Buy seeds | Tap tilled soil, or the Plant tool |
| Animals | Tap a Coop/Barn to feed, collect, buy — or sell for meat |
| Sell goods | ⚖️ Market — prices change daily, hot items pay +50% |
| Big payouts | 📋 Orders — deliver goods for premium coins |
| Daily tasks | 🔥 Three fresh tasks a day — clear all three to grow your streak |
| Expand | Tap a "for sale" sign, Shop → Land, or visit the Realtor |
| Hire help | Menu → Farmhands — assign jobs and patches, pay dawn wages |

**Tips:** regrowing crops + a drone + sprinklers = a self-running money printer · wheat feeds
animals for free once you own a Feed Mill · scarecrows protect a 5×5 area from crows *and*
storms · a Greenhouse lets any crop grow in any season (and laughs at frost) · wool → cloth
→ quilt multiplies value at every step · a fully-grown animal is worth the most meat.

## 🗂 Project structure

```
index.html      app shell & UI overlays (incl. farm-setup screen)
css/style.css   mobile-first UI styling
js/data.js      all game data: crops, animals, buildings, recipes, weather, difficulties, goals
js/game.js      simulation: time, seasons, weather events, economy, workers, automation, save/load
js/render.js    canvas renderer: baked sprites, lighting/lightmap, tweens/particles, weather, world art
js/ui.js        touch input, panels, toasts, motion, sounds (WebAudio)
js/icons.js     inline SVG icon system (48 hand-drawn symbols)
fonts/          bundled Nunito variable font
js/main.js      bootstrap & game loop
tests/          12 Playwright e2e suites that drive the real game headless
```

No frameworks, no dependencies — plain HTML5 canvas + vanilla JS, easy to wrap with
Capacitor/Cordova for app stores later.
