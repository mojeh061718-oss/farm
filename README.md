# 🌾 Harvest Empire

A farming-empire simulation in a beautiful 45° isometric view, running in any browser — no
install, no build step, and **no artificial gates**: you pick your starting capital in US
dollars, and from minute one everything in the game is for sale. If you can afford it, it's
yours. Money is the only ladder — and a farm you neglect will fail.

## ✨ What makes it tick

- **A stunning 45° isometric farm** — "Golden Hour Storybook" art direction: sun-driven
  lighting with colored shadows, glowing windows and fireflies at night, shingled roofs and
  plank walls, crafted soil beds, worn paths, a living pond, seasonal transformations (blossoms,
  amber falls, snow-lined winters), animated harvest/till/water effects, animal behaviors, real
  lightning strikes, and a pentatonic sound system — all procedural Canvas 2D, zero assets,
  60fps-tuned with sprite baking and a night lightmap.
- **Start with a stake, not a grind** — name your farm and choose your starting capital:
  🌤️ *Cozy* ($6,000, gentle weather), 🌾 *Classic* ($3,000), or ⛈️ *Tycoon* ($1,500, harsher
  weather, but +10% sell prices). No levels to wait for, no unlock walls — strategy decides
  what you can afford next.
- **Real ways to fail** — dry crops wilt and die; ripe crops rot in the field if you don't
  harvest; planting out of season wastes your seed money; neglected animals get sick and stop
  producing until you pay a vet bill. Sell buildings or animals back (at a loss) to recover
  from a cash crunch.
- **Fuel economy** — the rototiller, tractor and harvest drones burn diesel, and the price per
  gallon changes daily. An empty tank grounds your automation.
- **Fast, satisfying farming** — 18 crops growing in 35s–150s, including **multi-harvest crops**
  (strawberries, tomatoes, peppers, grapes) that regrow after every pick. Smart "Auto" tap does
  the right thing; select a tool and **drag to paint** whole rows.
- **Fertilizer** — ✨ $20 per crop: +25% growth speed and a 45% chance of a double harvest.
- **Seasons & weather with teeth** — every season has its own crops and palette. Rain waters for
  free, heatwaves dry fields 3× faster, storms flatten unprotected crops, crows steal ripe
  harvests, winter frost kills anything that isn't winter-hardy. The HUD shows **tomorrow's
  forecast** so you can plan around it.
- **Six animals** — chickens, ducks, cows, goats, sheep and pigs. Feed them (with coins, or free
  grain once you own a Feed Mill), keep them happy for faster production and double yields.
- **A real production economy** — 12 buildings and 13 artisan recipes: bakery (bread → berry
  cake), creamery (cheese, butter, yogurt), juice press, loom house (wool → quilts worth $1,500).
  Raw goods are fine; processed goods build empires.
- **Automation end-game** — sprinklers water every dawn, and the 🤖 **Harvest Drone**
  auto-harvests *and replants* a 5×5 field every morning. Fully automated plots are the goal.
- **A living market** — prices drift daily, a rotating hot item pays +50%, and a delivery-order
  board pays a premium that scales with your success.
- **Reputation, not gates** — XP levels are pure upside: each level adds +1% to every sale
  (up to +30%). Nothing is ever locked behind them.
- **9 land parcels** — from $1,000 to $60,000. Own the whole valley.
- **Mobile-first** — touch controls (tap, drag-paint, pinch-zoom), autosave, offline progress
  with a welcome-back summary, day/night cycle, ambient butterflies and falling leaves.

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
| Work fast | Pick a tool (Till/Plant/Water/Fert/Harvest) and drag across tiles |
| Refill the watering can | Tap the **Well** |
| Pan / zoom | Drag in Auto mode / pinch (mouse-wheel on desktop) |
| Buy seeds | Tap tilled soil, or the Plant tool |
| Animals | Tap a Coop/Barn to feed, collect and buy |
| Sell goods | ⚖️ Market — prices change daily, hot items pay +50% |
| Big payouts | 📋 Orders — deliver goods for premium coins |
| Expand | Tap a "for sale" sign or Shop → Land |

**Tips:** regrowing crops + a drone + sprinklers = a self-running money printer · wheat feeds
animals for free once you own a Feed Mill · scarecrows protect a 5×5 area from crows *and*
storms · plant winter kale and frostberries (or build a greenhouse) before winter · wool → cloth
→ quilt multiplies value at every step.

## 🗂 Project structure

```
index.html      app shell & UI overlays (incl. farm-setup screen)
css/style.css   mobile-first UI styling
js/data.js      all game data: crops, animals, buildings, recipes, weather, difficulties, goals
js/game.js      simulation: time, seasons, weather events, economy, automation, save/load
js/render.js    canvas renderer: baked sprites, lighting/lightmap, tweens/particles, weather, world art
js/ui.js        touch input, panels, toasts, motion, sounds (WebAudio)
js/icons.js     inline SVG icon system (48 hand-drawn symbols)
fonts/          bundled Nunito variable font
js/main.js      bootstrap & game loop
```

No frameworks, no dependencies — plain HTML5 canvas + vanilla JS, easy to wrap with
Capacitor/Cordova for app stores later.
