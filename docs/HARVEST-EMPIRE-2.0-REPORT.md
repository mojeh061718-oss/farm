# Harvest Empire 2.0 — Playtest Findings & Roadmap

*Prepared from a full engine debug plus five 100-day simulated playthroughs by distinct
player personas, each filing weekly diaries and a structured review.*

---

## 1. Executive summary

Five simulated players — a cozy collector, a ruthless min-maxer, an automation engineer, a
chaos/failure tester, and a total newcomer — each played 100 in-game days (over 8,000 combined
actions, ~500 simulated days including debug runs). **The engine is rock solid: zero crashes,
zero corrupted states, zero JS errors across every run.** The core loop (days 1–25) was rated
excellent by every persona, including the harshest critic ("a legitimately excellent
optimization puzzle" — Dex).

The problems are all one layer up, and the panel agreed on them with striking consistency:

1. **You can't undo anything on the land.** No way to remove a living crop or un-till soil.
   Every persona hit this. It is the #1 request across all five reports.
2. **The season system is the deadliest thing in the game and the least explained.** It killed
   more crops than storms, crows, frost, thirst and rot *combined* in four of five runs — and
   it kills silently, overnight, with no warning before planting or before the flip.
3. **The economy is lopsided.** 13 of 18 crops, 4 of 6 animals, and 3 of 12 buildings are
   mathematically never worth buying. One strategy (fertilized cabbage) dominates everything.
4. **The game runs out of things to want.** The min-maxer finished every purchase by day 53 and
   banked $437,000 of dead capital. There is no fourth act.
5. **Orders fail every audience at once**: quantities scale past casual players, payouts fall
   behind optimized market selling, boards deadlock for newcomers, and nothing expires.
6. **The daily tap-tax is real.** 6,181 watering taps in one run; 1,030 "can refilled" toasts.
   Automation covers only half the loop (field work, not collection/restocking/selling).

**Already fixed during this session** (shipped to the branch, verified by test): a negative-fuel
money-printer exploit, a sell-your-only-well guard gap, a goal-chain deadlock that froze rewards
for 50+ days, an off-season warning spam bug, a $0-softlock (added odd-jobs income floor), the
dawn pipeline bug that left drone-replanted crops dry, and the complete **data-safety layer**
(§8).

---

## 2. Method

- **Full debug:** 150-day randomized stress simulation (invalid inputs, random economy actions,
  every-day invariant checks on coins/fuel/tiles/animals/orders), save/reload round-trips,
  performance profiling (0.017 ms/tick, full-map farm), plus targeted edge probes and a manual
  source audit.
- **Panel:** five persona agents, each scripting their own 100-day strategy against the real
  game running in a real browser, receiving full telemetry (per-day snapshots, every toast/event,
  weekly deltas), then reporting in character.

| Persona | Style | Difficulty | Final farm value | Crops lost | Verdict in one line |
|---|---|---|---|---|---|
| **Marisol** (cozy collector) | One of every animal, never lets things die | Cozy | $64,744 | 14 (all forced) | "I'd play again tomorrow… if there were a pet dog." |
| **Dex** (min-maxer) | Read the source, optimized everything | Tycoon | **$877,481** | 27 (0.4%) | "8/10 engine, 6/10 economy, 3/10 endgame." |
| **Priya** (automation engineer) | Zero-manual-work target | Classic | $104,817 | **0** | "Field taps: zero. The remaining ritual has no ceiling to break." |
| **Bubba** (chaos tester) | Deliberately played wrong | Tycoon | $118,846 | 370 (21%) | "Failure is fair, recovery is a catapult, the calendar is the real villain." |
| **Rose** (newcomer) | Followed the goal chip only | Cozy | $21,366 | 88 (76% to seasons) | "Someone should sit this game down and make it explain itself." |

---

## 3. What every player loved (protect these in 2.0)

- **No gates, money is the only ladder.** Unanimous. "Speedrunner heaven" (Dex), "my play order
  was fully respected" (Marisol).
- **Named animals.** Cheap feature, outsized warmth. Every persona mentioned animals by name.
- **Deterministic, honest simulation.** Priya predicted mechanics on paper and telemetry matched.
- **Fertilizer as a genuine decision** (great on expensive crops, a trap on cheap ones — that's
  good design, per the min-maxer).
- **The safety-net stack**: odd jobs, sell-backs, rotating save backups, offline mercy. "You
  cannot brick this save. Respect." (Dex)
- **The forecast**, regrowing crops, rain days off, batched loss messages, the goal cascade.

---

## 4. Consensus findings matrix

| Finding | Marisol | Dex | Priya | Bubba | Rose |
|---|:-:|:-:|:-:|:-:|:-:|
| No shovel / can't remove living crops or un-till | ✅ | ✅ | ✅ | — | — |
| Season flips kill silently & unexplained | ✅ | ✅ | ✅ | ✅ | ✅ |
| Watering is a tap-tax | ✅ | ✅ | ✅ | — | ✅ |
| Orders broken (scaling / payout / deadlock / no expiry) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Crop & animal economy lopsided | — | ✅ | ✅ | — | — |
| No endgame sinks | ✅ | ✅ | ✅ | ✅ | — |
| Coverage areas invisible (scarecrow/sprinkler/drone) | — | ✅ | ✅ | ✅ | ✅ |
| Fuel costs hidden at purchase | — | — | — | ✅ | ✅ |
| Crows/hazards too weak; risk lacks drama | — | ✅ | — | ✅ | — |
| Greenhouse is a global cheat flag | ✅ | ✅ | ✅ | — | — |
| Collection/restocking can't be automated | — | ✅ | ✅ | — | ✅ |
| No message log / toast spam | — | ✅ | — | — | ✅ |

---

## 5. Bugs & exploits

### Fixed this session (already on the branch, each verified by automated test)
| # | Bug | Fix |
|---|---|---|
| 1 | `buyFuel(-10)` **paid the player** and drained the tank (infinite money) | Reject non-positive/NaN/huge amounts |
| 2 | Engine allowed selling the **last well** (UI-only guard) | Engine-level guard |
| 3 | **Goal chain deadlock**: one skipped goal froze all later rewards (54+ days for two personas) | Goals now pay in any order |
| 4 | **$0 + empty farm = softlock** (found in debug) | Odd jobs: +$40 once per day |
| 5 | **Sprinklers ran before drones** at dawn → drone replants spent day one dry | Reordered dawn pipeline |
| 6 | Off-season warning spammed on drag-planting | Throttled |
| 7 | Fuel excluded from farm value (net worth vanished on purchase) | Included at market price |
| 8 | No protection against save loss/corruption | Full data-safety layer (§8) |

### Remaining for 2.0 (verified, documented, not yet fixed)
| # | Bug | Severity |
|---|---|---|
| 9 | Processing "queue" runs **in parallel** — 3 queued 60s jobs all finish in 60s (3× intended throughput) | Balance |
| 10 | `sellItem` grants XP **per call** — selling 1-at-a-time doubles reputation XP | Exploit (minor) |
| 11 | Day 1 starts at t=0.25, silently shorting first-day crops (an 85s crop misses dawn by 1 second) | Fairness |
| 12 | `refillCan()` works from anywhere; the well is decorative at engine level | Design integrity |
| 13 | Greenhouse is a global boolean — one building de-seasonalizes all 300 tiles | Balance (see §6.4) |
| 14 | The 4 pre-tilled starter tiles permanently block all four viable drone centers in parcel 0 | Fixed by shovel/un-till |
| 15 | Duplicate auto-assigned animal names (two "Toffees") | Polish |
| 16 | Heatwave + season boundary composite can wipe a field even with daily care (83 crops in one tick) | Balance |
| 17 | Market has no memory — 652 hoarded items sold in one morning at full price | Balance |

---

## 6. The 2.0 plan

### 6.1 · P0 — Land control: the Shovel *(the #1 unanimous request)*
- **Shovel tool**: dig up any living crop (50% seed refund) and **un-till** soil back to grass.
- Kills five problems at once: forced season-end deaths, permanent misplants, the immortal-bush
  lock-in (regrow crops + greenhouse), blocked building placement on old soil, and the grim
  "execute your crops by deliberate drought" meta.
- UI: 7th tool button; confirm on living crops.

### 6.2 · P0 — Seasons that teach instead of execute
- **"Last day of Spring!"** banner on each season's final day + a countdown pip in the HUD.
- **Seed sheet viability**: grey out / warn on crops that cannot mature before the flip
  ("Needs 3 days — 2 left in Summer").
- **Eve-of-season care sheet**: "These 7 plants won't survive Fall" with one-tap
  harvest-ready/dig-up actions.
- Confirm dialog on out-of-season planting (Rose lost ~$200 learning by toast).
- Tap a dead crop → shows **why** it died (thirst / rot / season / frost / storm).
- Rationale: 76% of the newcomer's losses, 62% of the chaos tester's, and 100% of the cozy
  player's were season-flip deaths.

### 6.3 · P0 — Complete the automation ladder
- **Runner Bot** (~$12,000): collects animal products & finished crafts, restocks one assigned
  recipe while ingredients last. (The endgame floor is currently 12–17 un-automatable taps/day.)
- **Recipe auto-repeat toggle** per processing building.
- **Drone 2.0 modules**: fertilize option (+$20/tile), crop assignment, radius upgrade. (Today
  the drone is negative-EV for daily players and replants unfertilized.)
- **Irrigation upgrade path** beyond sprinklers: well upgrade that auto-waters a whole parcel
  for a daily water bill — the answer to 6,181 watering taps.
- **Fuel auto-buy threshold** ("refill to 20 gal when diesel < $3.00") + farm fuel tank; makes
  the daily fuel price a real minigame instead of a chore ticker.
- **Coverage overlays**: show 3×3/5×5 footprints during placement and on tap; a toggleable
  "watered / protected / drone-covered" map view. Requested by four of five personas.
- **Alert panel** for silent failures: grounded drone, dry replants, uncovered tiles, sick
  animal, idle processor.

### 6.4 · P1 — Economy rebalance (exact numbers in Appendix A)
- **Crop tiers**: rescale so cheap crops are click-efficient and premium crops are
  capital-efficient — today fertilized cabbage ($64/tile/day) beats wheat ($9) 7:1 at identical
  effort. Every crop should be best at *something* (space, clicks, capital, order demand).
- **Animals**: benchmark to sheep→quilt (~$120/day, the only correct animal). Give every animal
  a terminal recipe (truffle→truffle oil, duck egg→pâté...), raise cow/pig rates ~2×.
- **Feed Mill**: currently *loses* money on chickens (burns $14 wheat to save $5 feed). Add a
  per-species feed policy toggle (grain / cash / cheapest).
- **Greenhouse**: convert from global flag to **an area** — plantable interior grid (or radius
  aura), multiple purchasable. Preserves the season game it currently deletes.
- **Fertilizer**: scale cost with seed price (flat $20 is a trap under $50 base, an auto-buy above).
- **Crafting**: make the queue sequential *but* add queue-size and speed upgrades; sub-day times
  on entry recipes. (Fixes bug #9 while making artisan chains a true alternative to monoculture.)
- **Market memory**: dumping >N of an item crushes its price for 2–3 days; hoard-and-spike
  becomes a gamble instead of a strictly-better savings account.
- **Fix** XP-per-call rounding, the day-1 clock, and the pepper 50s-regrow boundary trap
  (regrows should be deliberately ≤48s or ≥65s).
- **Reputation curve**: +30% cap currently needs level 31; the best player reached 20 in 100
  optimal days. Re-curve so the cap is reachable in ~a year of casual play.

### 6.5 · P1 — Orders & contracts rework *(failed all five personas)*
- Payouts **multiply by the player's live price modifiers** (difficulty, reputation, market) —
  flat 1.6× base is a rounding error for optimizers.
- **Deadlines**: standard orders expire in 2–4 days (board never deadlocks); reputation ding on
  expiry; **rush bonus** for same-day delivery.
- **Standing contracts** for automated farms: "6 smoothies/day for 5 days, +40%."
- Scale quantities to **recent production**, not lifetime earnings (casual boards went dead
  after day 36).
- First-time tooltip + "you don't grow this yet" tags (the newcomer's board deadlocked for weeks).

### 6.6 · P1 — Endgame & prestige *(the missing fourth act)*
- **Golden Deed prestige**: sell the whole farm for permanent perks (+3% prices, faster
  crops, keep farm codes as trophies), start over with a new valley layout.
- **The Auction House**: recurring big-ticket sinks — mega-parcel expansions at scaling prices,
  cosmetic estates, a $250k "County Fair" trophy building.
- **Seeded challenge runs + local leaderboard**: fixed-seed "100-day farm value" mode (the
  min-maxer's 584× return is begging to be raced), weekly modifier seeds.
- **Farm Almanac stats page**: lifetime losses by cause, money burned by category, records. (The
  data already exists — the chaos tester specifically asked to see his own autopsy.)

### 6.7 · P2 — Onboarding & accessibility *(Rose's list)*
- **Fuel disclosure**: powered equipment shows "Requires diesel — tank: 0 gal" pre-purchase and
  ships with a starter gallon.
- **Upkeep line on every purchase card**: feed/day, fuel/day, capacity.
- **Hoarder nudge**: inventory value shown next to cash; gentle "market day?" prompt when hoard
  ≥ 5× cash. (Rose felt poor holding $12k of vegetables.)
- **Message journal**: scrollable log of past toasts; larger-text mode; longer toast duration.
- **Batch routine toasts** ("can refilled" ×1,030 in one run) and add a **morning chores**
  one-tap assist (water + feed + collect) for the pre-automation game.
- Goal chip: show 2–3 concurrent goals; reorder scarecrow before the orders goal.
- Confirm on purchases over ~10% of cash; short return window on equipment.

### 6.8 · P2 — Cozy content *(Marisol's list — retention for the biggest audience)*
- **Decorations**: paths, flower beds, fences, benches, ponds, seasonal bunting — pure money
  sinks with placement freedom (also partially solves §6.6).
- **Pets**: a farm dog/cat that follows you; pet the animals; animal renaming and no duplicate
  auto-names.
- **"Slow Living" clock toggle**: longer days/seasons, doubled wilt/rot timers — the cozy
  audience's #1 stress reliever, zero impact on default balance.

### 6.9 · P2 — Risk & drama *(Bubba's list — make failure as fun as success)*
- **Escalating crows**: flock grows each unprotected day (1→2→5), resets on scarecrow. (The
  marquee villain stole 5 crops in 100 days of maximum baiting.)
- **Crop insurance** with premiums and deductibles; **bank loans** against farm value
  (over-leverage = a new, richer way to fail).
- **Animal stakes**: untreated sickness spreads to pen-mates after ~2 days; an animal can run
  away after ~5. Sickness should also occasionally strike well-fed animals (it is currently
  100% avoidable, so the vet is dead code for careful players).
- **Barn Raising comeback event**: if farm value collapses below 25% of the yearly peak,
  neighbors rebuild one sold building free, once per year. Recovery is this game's best
  feeling — give it a scene.
- Tycoon rebalance: +5% sell bonus (not +10%) with genuinely meaner events — the panel proved
  Tycoon is currently "Classic with a better paycheck."

---

## 7. Suggested release sequencing

| Release | Scope | Contents |
|---|---|---|
| **2.0** | The trust release | Shovel + un-till · season telegraphs & viability warnings · coverage overlays · orders rework · economy rebalance pass 1 (crops/animals/greenhouse/queue) · remaining bug fixes (#9–#17) · message journal · fuel disclosure · morning-chores assist |
| **2.1** | The forever release | Runner Bot + drone modules + irrigation endgame · prestige + auction sinks · market memory · standing contracts · Farm Almanac · leaderboard/seeded runs |
| **2.2** | The heart release | Decorations · pets & renaming · Slow Living mode · insurance/loans/escalating hazards · Barn Raising · cloud sync GA (§8) |

Everything in 2.0 builds on existing systems — no engine rework required. The five-file,
no-framework architecture held up under 500 simulated days without a single crash; it will
carry all of the above.

---

## 8. Data safety — never lose a farm

### Shipped this session (live in the codebase, all covered by automated tests)
1. **Autosave** every 5 s + on tab hide/close (already existed) — now backed by:
2. **Three rotating backup snapshots**, timestamped, written every ~2 minutes of play.
3. **Automatic corruption recovery**: if the main save fails to parse or validate, the newest
   valid snapshot is restored silently, with a notice. *(Verified by deliberately destroying a
   save mid-session — full recovery.)*
4. **Portable farm codes**: checksum-verified export via copy-to-clipboard or downloadable
   backup file; restore by pasting the code. Codes are validated (format, checksum, version)
   before they touch the current farm.
5. **Persistent-storage protection**: the game requests `navigator.storage.persist()` so the
   browser commits to not evicting the data; protection status is shown in the menu.
6. **Menu "Keep your farm safe" section** exposing all of the above to the player.

### 2.0/2.1 roadmap
- **IndexedDB mirror** of the last 10 snapshots (survives some localStorage-only clears; larger
  quota).
- **Multi-slot saves** (3 farms) + "new game" no longer requires erasing the old farm.
- **Save versioning & migrations** so future updates never invalidate old farms (today a
  version mismatch falls back to a new game — migration code eliminates that class of loss).
- **Cloud sync (opt-in)**: anonymous account keyed by a recovery phrase (no email required),
  end-to-end save blob upload after each day-change, three server-side versions retained,
  newest-wins conflict resolution with a "keep which farm?" prompt when both changed. Ships
  free-tier friendly (a save is ~14 KB).
- **Native wrappers** (Capacitor) inherit iCloud/Google Play auto-backup for app-store releases.
- **Weekly backup reminder**: if no farm code has been exported in 7 days and farm value grew
  materially, a gentle once-per-week nudge.

---

## Appendix A — Balance change table (proposed numbers)

| Item | Today | Problem | Proposed 2.0 |
|---|---|---|---|
| Wheat | $6 seed / $13 / 45s | $9.4/tile-day — pure trap | $6 / $16 / 40s (+click-efficiency identity: never needs fert) |
| Cabbage + fert | $64.3/tile-day | Dominates everything | Cabbage $62→$68 seed, or fert scaling (below) |
| Fertilizer | flat $20 | Trap on cheap crops, auto-buy on rich | 30% of seed price (min $8) |
| Pepper regrow | 50s (2s over day boundary) | Strictly worse than tomato | 45s regrow |
| Cow | $850, 0.42 milk/day → ~$17/day | 53-day payback | Milk every 100s (~$40/day, 21-day payback) |
| Pig | $3,200 → ~$51/day, dead-end product | 63-day payback | $2,400 + truffle→truffle oil recipe ($265→$620) |
| Sheep→quilt | ~$120/animal/day | The only correct animal | Keep; benchmark others to ~60–80% of it |
| Feed Mill | burns $14 wheat to save $5 | Negative EV for coops | Feed policy toggle + mill grinds 1 grain → 3 feed units |
| Craft queue | 3 parallel slots (bug) | 3× intended output | Sequential + purchasable slots 2/3 ($2k/$6k) + speed upgrade |
| Greenhouse | $12,000 global flag | Deletes seasons farm-wide | $6,000, covers its own 6×6 interior grid; multiple allowed |
| Drone | $7,500 + fuel, no fert, replant-only | Negative EV vs daily play | $5,500 base + fert module $1,500 + radius module $2,500 |
| Orders | flat 1.6× base, no expiry | 1.7% of an optimizer's income; deadlocks | 1.6× × live modifiers, 2–4 day expiry, rush +25%, standing contracts |
| Reputation | +1%/level, cap needs lvl 31 | Cap unreachable ~10× | +1.5%/level, cap +30% at level 20 |
| Tycoon | +10% sell, 1.4× events | Strictly easier than Classic after day 10 | +5% sell, meaner crows/sickness, keep 1.4× weather |
| Odd jobs | $40/day flat | Great floor, boring ladder | $40 + streak bonus to $60; unlocks "market day" gig events |
| Day 1 clock | starts at t=0.25 | Shorts first crops a day | Start at t=0.02 (dawn) |

## Appendix B — Panel artifacts

Full weekly diaries, telemetry JSON (per-day snapshots, every event), final-farm screenshots,
and each persona's strategy script are archived per player:
`playtest/out/{marisol,dex,priya,bubba,rose}/` (report.md, telemetry.json, final-farm.png).
