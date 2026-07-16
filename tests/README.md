# Harvest Empire — e2e test suites

Twelve Playwright suites drive the real game (via `file://…/index.html`) in headless
Chromium, exercising the engine API, the touch UI, and the data-safety layer.

| Suite | Covers |
|---|---|
| `e2e-gameplay.js` | Appendix-A balance numbers, core farm loop, the shovel (dig / refund / un-till), death causes, season-care sheet + bulk rescue actions, seed-sheet "won't ripen" tags, orders rework (live-price payouts, deadlines, rush bonus, expiry, recent-production scaling), sequential craft queues + purchasable slots (+ legacy-save grandfathering), feed-mill credits, greenhouse 6×6 area (growth + frost), market memory, fractional sell XP, animal-name pool, odd-jobs streak, save round-trip of the 2.0 fields |
| `e2e-ui.js` | Toolbar removal + tap-a-tile bubble basics (Till / Plant / Dig / Un-till), pan-not-paint drags, order card UI (countdown / RUSH tag / "not grown yet" hint), greenhouse coverage flash + placement ghost, mill & processor panels, menu entries, context isolation, reload. Writes screenshots to `tests/out/` |
| `e2e-safety.js` | Fuel-purchase exploit guards, last-well guard, goal-chain ordering, farm-code export/import + tamper rejection, **pre-2.0 v3 save migration** (orders gain deadlines, queues gain slots + legacy jobs, defaulted fields, one-time greenhouse notice), backup-snapshot corruption recovery |
| `e2e-ui2.js` | UI debug-pass regressions: stable sheet geometry under rapid taps (no sell-everything trap, sold-out placeholder rows, no-shrink height lock), farm-name HTML escaping, well panel reachability + second-well sell-back, away-summary modal hygiene (Cancel never leaks hidden), order expiry/delivery stubs mid-view, auto-refresh finger freeze, off-season seed-pick safety, single-line "won't ripen" tag, text-input `user-select`, 320px HUD fit |
| `e2e-return.js` | 3.0 return-friendliness: away-time rescale + 2.5-day cap, offline decay pause, season-flip rescue window, welcome-back digest (+ one-tap rescue harvest), toast quiet window, backup nudge |
| `e2e-toni.js` | THE Sunflower (the Toni Variety): rarity constants, dawn/action spawn rolls (never offline, never announced), parcel blessing (pinned water/wilt/rot, love-speed growth, storm/crow/frost immunity, self-harvest + frozen-snapshot replant, offline production), parcel lock, the 1930s newspaper → blessing card flow, two-step harvest → Glowing Seed (unsellable, mythic seed card), 1-in-25 seed reveal (both outcomes forced by stubbing `Math.random` — the spawn/reveal rolls read it live at roll time) |
| `e2e-retention.js` | 3.0 Return Update: single-harvest crop rebalance + recipe margins, multiplicative market-crash fix (processed-goods exemption, multi-day drift recovery), produced-weighted orders + expiry floors (makeOrder & migration), goal-chip cycling (no false celebrate), daily tasks + streak (deterministic per local date via a shimmed `Date`, claims, reload persistence, day-7 jackpot), Market Day (deterministic picks, ×1.5, banner + sheet badges), quick fixes (backdrop-cancel, deferred level-up splash, disabled Deliver, type-count market badge, bubble seed-pick planting, Escape-to-close) |
| `e2e-bubble.js` | The contextual tile action bubble: context rules per tile state (grass → Till; soil → Plant/Un-till; growing → Water 💧chip / Fertilize cost chip / Dig up; ripe → Harvest first; dead → Clear), empty-can disable + refill hint, wilt attention pulse, execute-and-close, toggle / outside-tap / pan dismissal, viewport clamping at 320×568, buildings & the toni keep their own tap behaviors |
| `e2e-bigfarm.js` | Multi-farm Realtor flow: buying/switching whole properties, per-farm state isolation, home-valley layout migrations (20×15 and 34×26 → 40×30) |
| `e2e-catchup.js` | Frozen-farm catch-up: crops fast-forward by the time you were away tending another farm, never for free |
| `e2e-workers.js` | Farmhands: hire cost/cap, every job, zone restriction, dawn payroll (pay / can't-pay downs tools / resume), training, dismissal, save round-trip, per-farm isolation, offline no-op |
| `e2e-meat.js` | The unified barnyard meat path (any animal sells for meat, bigger = more), the shop staying clean of the retired Pasture/Slaughterhouse, and the S3b migration that retires legacy pastures (stock banked as meat, buildings refunded) |

## Running

The suites need `playwright-core` resolvable from this directory and a Chromium
binary at `/opt/pw-browsers/chromium` (edit the `executablePath` at the top of each
suite if yours lives elsewhere).

```sh
cd tests
npm i playwright-core        # or: ln -s /path/to/existing/node_modules node_modules
node e2e-gameplay.js
node e2e-ui.js
node e2e-safety.js
node e2e-ui2.js
node e2e-return.js
node e2e-retention.js
node e2e-toni.js
node e2e-bubble.js
node e2e-bigfarm.js
node e2e-catchup.js
node e2e-workers.js
node e2e-meat.js
```

Each suite prints a ✔/✘ line per check, reports any page JS errors, and exits
non-zero on failure. Screenshots land in `tests/out/` (git-ignored).

Determinism: the suites drive the clock (`Game.tick`) directly, pin `state.t`
before day crossings, force `forecast = 'rain'` where storms/crows could
interfere, and retry the (intentionally random) frost roll until it fires — so
runs are stable despite the game's live RNG.
