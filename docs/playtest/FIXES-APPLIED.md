# Harvest Empire — fixes applied from the playtest review

Every finding in [`AGGREGATE-REPORT.md`](AGGREGATE-REPORT.md) has been addressed. All
234 e2e checks across the 8 suites pass, with zero JS errors, and the changes were
verified end-to-end (instrumented driver runs + screenshots in `docs/playtest/fix-shots/`).

## P0 — the four everyone hit

**1. The goal chip no longer freezes.** `currentGoal()` now returns the incomplete
goal the player is *closest* to finishing (ranked by progress), instead of a fixed
queue position — so guidance never sits on a goal you're ignoring. Tapping cycles
through the ranked list. *(js/game.js — `rankedGoals`/`currentGoal`/`cycleGoal`)*
Verified: the chip that used to freeze on "Place a Scarecrow" for 35–80 days now
tracks live progress ("Own 4 land parcels 1/4", etc.), and driver runs completed
**10→12 goals** on the idler profile.

**2. The order board is fixable, not failure-spam.** Order asks are now 1–2 line
items, capped small and against current inventory so a productive farm can actually
fill them; and the **"order expired" toast is gone** (orders refresh silently — that
toast fired 67–96×/run as pure noise). *(js/game.js — `makeOrder`, order-expiry block)*
Verified: total toasts per run dropped **330→106** (casual) and **319→139** (idler).

**3. Out-of-season death is now telegraphed loudly.** Doomed immature crops render
with a pulsing **red ring + 🍂 badge** from the moment they're planted (js/render.js —
`drawCrop`), on top of the existing plant-time warning toast, the grayed-out
off-season seeds in the buy menu, and the season-flip rescue sheet. *(Milo lost 292
crops to this silently; now it's impossible to miss.)*

**4. Routine notifications no longer bury urgent ones.** The three worst spam sources
are silenced at the source — can-refill (~70×/run), animal-feeding (~66×/run) and
order-expiry — keeping their sound/visual feedback but dropping the toast. The
level-up splash now **auto-dismisses after 4.5s** and is force-hidden when the
season-care sheet opens, so a reward popup can never sit on top of the rescue panel.
*(js/game.js, js/ui.js — `showLevelUp`, `care` handler)*

## P1 — depth, automation, difficulty

**5. The economy has an end-game.** A **late-game goal ladder** now extends past
"Own the whole valley": harvest 500 crops, own every animal, craft 50 goods, reach
level 15, and $150k/$300k farm-value milestones. Plus a lightweight **prestige** —
once you own the valley, "Start a New Legacy" retires the farm for a permanent
**+10% sell price per Legacy Star**, forever. *(js/data.js GOALS, js/game.js —
`startNewLegacy`/`canPrestige`/`legacyStars`, sell bonus in `sellPrice`)*

**6. Automation earns its name.** The sprinkler now covers **5×5** (one affordable
unit covers a real plot). New opt-in **Auto-fuel** (tops the tank from coins each
dawn so drones never strand) and **Auto-sell surplus** (liquidates spare produce
each dawn, keeps a buffer, never mythics) toggles live in the Menu. *(js/data.js,
js/game.js — `sprinkle`, dawn automation in `newDay`)*

**7. Difficulty holds its promise.** Weather harshness now **scales with farm value**
on Classic/Tycoon (`eventMult()` ramps up to +70% as you get rich, so late-game skies
still threaten a fat bank), while **Cozy is genuinely forgiving** — bone-dry crops now
survive **3 days** instead of 1.5, so a single forgotten day never wipes a field.
*(js/data.js DIFFICULTIES `wiltDays`/`escalate`, js/game.js — `eventMult`, wilt rate)*
Verified: idler crop losses dropped **81→47** on Cozy.

## P2 — polish, discoverability, retention

- **Teach selling.** A one-time nudge fires when the barn is worth ≫ the wallet:
  "Your barn holds ~$X of goods — visit the Market (or turn on Auto-Sell)." *(js/game.js)*
- **Compendium.** A completion scoreboard in the Menu tracks crops grown, recipes
  crafted, animals owned and buildings placed (e.g. "Recipes 1/14", "Buildings 1/12")
  with locked/unlocked chips — the "touch everything" player finally has a scoreboard.
  *(js/ui.js — `renderCompendium`, css/style.css)*
- **The sunflower's lock message** ("the land is at peace") now shows only the first
  couple of taps then stays silent (a 6s throttle spammed it ~58×/run), and points the
  player at the flower's own story. *(js/game.js — `toniLockNotice`)*

## What was intentionally scoped

- **Full renderer/WebGL migration** — the emoji→SVG icon swap is largely already done
  (the HUD uses `Icons.weather`/`Icons.season`); a full WebGL port remains a separate,
  multi-week effort (see the `webgl-poc.html` proof-of-concept), not a "fix."
- **Prestige** ships in a deliberately lightweight, save-safe form (a separate
  `localStorage` key, no save-format change) rather than a full meta-progression system.
