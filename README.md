# 🌾 Harvest Empire

A beautiful 2D mobile farming-empire game that runs in any browser — no install, no build step.
Till, plant, water and harvest in seconds, then grow from four dirt plots into a sprawling farm
empire with animals, artisan goods, and a whole valley of land.

## ✨ Features

- **Fast, satisfying farming** — crops grow in 35s–150s. Tap to till/plant/water/harvest
  (smart "Auto" mode picks the right action), or select a tool and **drag to paint** whole rows.
- **Seasons & weather that matter** — spring, summer, fall and winter each have their own crops.
  Rain waters for free, heatwaves dry your fields 3× faster, storms flatten unprotected crops,
  crows steal ripe harvests, and winter frost kills anything that isn't winter-hardy.
- **Equipment & upgrades** — upgrade your hoe and watering can (bigger area, bigger tank), place
  sprinklers, scarecrows, a feed mill, and eventually a greenhouse that beats the seasons.
- **Farm animals** — chickens, cows, sheep and pigs. Feed them, keep them happy (happy animals
  produce faster and sometimes double), and collect eggs, milk, wool and truffles.
- **Build an empire** — a dynamic market with daily prices and hot items, delivery orders with
  premium payouts, a bakery and creamery for high-value artisan goods, and 9 land parcels to buy.
- **Progression** — XP levels unlock new crops, animals, buildings and tools; a goal chain guides
  you from your first turnip to a farming empire.
- **Mobile-first** — touch controls (tap, drag, pinch-zoom), autosaves locally, and grants
  offline progress while you're away.

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
| Animals | Tap a Coop/Barn to feed, collect and buy |
| Sell goods | ⚖️ Market — prices change daily, hot items pay +50% |
| Big payouts | 📋 Orders — deliver goods for premium coins & XP |
| Expand | Tap a "for sale" sign or Shop → Land |

**Tips:** wheat feeds animals for free once you own a Feed Mill · scarecrows protect a 5×5 area
from crows *and* storms · plant winter kale (or build a greenhouse) before winter hits · pumpkins
+ a bakery = pumpkin pie, the most valuable good in the game.

## 🗂 Project structure

```
index.html      app shell & UI overlays
css/style.css   mobile-first UI styling
js/data.js      all game data: crops, animals, buildings, recipes, weather, goals
js/game.js      simulation: time, seasons, weather events, economy, save/load
js/render.js    canvas renderer: terrain, crops, buildings, animals, weather, day/night
js/ui.js        touch input, panels, toasts, sounds (WebAudio)
js/main.js      bootstrap & game loop
```

No frameworks, no dependencies — plain HTML5 canvas + vanilla JS, easy to wrap with
Capacitor/Cordova for app stores later.
