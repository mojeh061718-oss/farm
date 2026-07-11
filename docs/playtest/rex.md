# Harvest Empire — Optimizer's Playtest Journal

**Tester:** Rex, 27, professional min-maxer. I read spreadsheets for fun and I treat "cozy farming sim" as a euphemism for "unsolved optimization problem."
**Farm:** *Maple Yield Co.* · **Difficulty:** Classic ($3,000 start) · **Plot:** ~30 tiles, watered at 0.98 diligence, sold daily, chased orders (0.9), fertilized, bought animals to capacity, built production, pushed automation. **Duration:** 90 in-game days (3 years).

## Final state (from `final`, day 91 snapshot)

| Metric | Value |
|---|---|
| Level | 16 (15 level-ups; xp 7,150) |
| Coins | $121,462 |
| **Farm value** | **$331,714** |
| Animals | 12 (hard-capped) |
| Buildings | 8 |
| Parcels | 9 / 9 — **whole valley owned** |
| Lifetime earned | $345,039 |
| Harvested / lost | 2,567 / 69 |
| Crafted | 76 |
| Watering can / tiller tier | 1 / 1 (never upgraded) |

Headline: I owned the entire map and by roughly **day 34** the game had stopped being able to threaten me. The last 56 days were a victory lap.

---

## Daily / weekly diary

### Week 1 (days 1–7): the ramp is aggressive — maybe too aggressive
Day 1 was a goal-clearing spree. I tilled, planted, watered and fertilized my opening beds and **five goals fired on day one alone** (Till 4, Plant 4, Water 4, Fertilize 5, +$40/$40/$40/$150). By end of day 1 I sat at **$1,964 / farmValue $2,264**. Day 2 closed the Harvest-6 and Earn-$300 goals. The single most striking number in my whole run: I completed **"Earn $10,000 lifetime" on day 9**. Nine days. On the middle difficulty. The early economy has no teeth for an optimizer — seed prices are the "only gate" (turnip $8, wheat $6) and they're rounding error against $265 melons and $320 frostberries.

Day 6 was the first real dopamine hit: my **first delivery order completed for +$325 with a ⚡RUSH +25%**, and I bought my **2nd parcel** the same day (coins $5,876). The rush bonus — `payout = order.coins × 1.25` when delivered within one `DAY_LEN` of posting (`orderRush`) — is a genuinely good mechanic and I chased it hard.

### Week 2 (days 8–14): building out, first losses
By day 8: **$5,909 / fv $10,826**, 2 animals, 4 buildings. I built the coop and bought a bird (goal cleared day 7), then pushed toward a herd. First blood on **day 14: "4 died of thirst."** Despite 0.98 diligence and a can that waters daily, crops still wilted — `WILT_DAYS = 1.5`, so a heatwave (`drought` dries 3× faster) on a day I under-watered a corner of a 30-tile sprawl is unforgiving. Lifetime thirst deaths ended at **25**, my single largest loss cause.

### Week 3 (days 15–21): the herd caps, orders stall
Day 15 placed a scarecrow (goal +$150); day 16 hit **8 animals** (+$400). By day ~22 I was at **12 animals and never grew past it for the remaining 68 days** — two 2×2 houses at `capacity: 6` each = 12, and nothing prompts you to build a third coop/barn. That's a design cul-de-sac for a min-maxer: animal income froze on day 22.

Here's the quiet scandal of my run: **"Complete 2 orders" didn't clear until day 20.** I had `doOrders: 0.9` and a rush bonus I wanted. Final tally: **7 orders completed, 67 order-expired toasts.** I *ignored/whiffed roughly 90% of the order board* — not by choice, but because `makeOrder` quantities scale with `state.stats.recent` (capped at +6× via `1 + min(6, recent/10)`), so a productive farm gets asks I couldn't assemble inside `orderWindow` (max of 3 days or 3× production time) while also selling daily. Orders became background noise.

### Week 4 (days 22–28): automation unlocked, and immediately underwhelmed
Day 22: **$7,407 / fv $29,615**, 8 buildings (the count I'd hold to the end). Day 26 cleared **"Automate: drone + sprinkler" (+$500)** and day 27 fired my first **"Drones harvested 5 crops!"** Five. The drone is a 5×5 footprint that burns `1 gal/day`, but a 5×5 rarely has 25 simultaneously-ripe tiles, so runs were tiny. Over the ~64 days I owned it, I logged only **18 harvest runs + 4 harvest-and-replant runs (22 total)**, and bought a grand total of **25 gallons of fuel all game** (five $16–$20 top-ups; ~$87 lifetime). The entire "fuel economy" pillar the README sells was a sub-$100 non-event.

### Weeks 5–6 (days 29–42): the land-buying spree, and the last real goal
This is where money went vertical. Earned/day jumped from **~$1,685 (d21–30)** to **$5,460 (d31–40)**. Parcels 4→6 fell on days 32, 35, 42. Day 34 cleared **"Reach $60,000 farm value" (+$2,000)** — and that was the **last goal I'd complete for 53 days.** From day 34 the HUD read "Own the whole valley" and simply... waited. Day 39 gave me my only market-crash lesson: **"Dumping 44 Winter Kale at once crashed its price!"** — `crash = max(0.55, 1 − 44×0.004) = max(0.55, 0.824) = 0.824×`, recovering `+0.08/day` below 0.6×. Mild, easily routed around by splitting sales.

### Weeks 7–9 (days 43–63): the plateau
farmValue marched **$112,679 (d43) → $142,819 (d50) → $200,541 (d64)** but earned/day flatlined: **$4,008 / $4,183 / $4,084** across those blocks. Notice that's *lower* than the day 31–40 spike — my income literally stopped growing around day 40 and just held a straight line. Coins piled up ($75k by day 50, $100k by day 64) with nothing to spend them on: all 8 buildings built, animals capped, only distant parcels left. Levels crawled (13→15) because `xpForLevel = 30·level·1.22^level` balloons, but leveling barely matters — `repBonus` caps at +30% (level 21) and I only reached +22.5% (level 16).

### Weeks 10–13 (days 64–90): running out the clock
Parcels 7, 8, 9 on days 53, 68, **87** — the $60k final parcel is a pure coin-sink, not a challenge. Day 87 finally cleared **"Own the whole valley" (+$10,000)** and after that `goal: null` — **no goals left at all.** Final block earned/day $4,230. I ended day 90 at **$121,462 coins, farmValue $326,165**, having spent the back half of the game doing the same daily loop (water, collect, sell, split-sell to dodge crashes) with zero new decisions.

---

## What I loved

1. **The rush bonus is a real optimization lever.** `orderRush` double-dipping the 1.25× (an order delivered same-day pays 1.5625× its spot value) gave me something to *sprint* for in week 1. Five of my seven completed orders were rushes.
2. **Multi-harvest regrow crops are the correct economic engine.** 511 plantings produced **2,567 harvests** — a ~5× multiplier from strawberry/tomato/pepper/grape `regrow` timers (40–65s). Discovering that a strawberry bush is an annuity, not a one-shot, was the best "aha" of the run.
3. **Processed-goods price protection is elegant.** `PROCESSED` items skip the crash mechanic entirely (`if (!PROCESSED.has(item))`), so bread/cheese/quilt hold price no matter how many I dump. That's a clean, discoverable incentive to run the bakery/creamery chains — 76 crafts by endgame.
4. **The dump-crash mechanic itself is smart.** Multiplicative `max(0.55, 1 − qty×0.004)` punishing panic-selling, with gradual recovery, is exactly the anti-exploit an optimizer respects. It made me *want* to spread sales across days.
5. **Market Day + hot item stacking.** `sellPrice` multiplies `×1.5` for hot **and** another `×1.5` for a market-day item — a 2.25× window. Timing a harvest into a stacked window felt genuinely clever (day 5: "Yogurt & Truffle Oil +50%").
6. **No unlock walls.** Everything purchasable from minute one is a great fit for my playstyle — strategy, not grind, decides what I can afford.

## What confused or frustrated me

1. **Orders are unfulfillable at scale.** 67 expired vs 7 completed. `makeOrder` scales quantity by recent production but doesn't account for me *also selling that production daily*, so the ask and my stock never overlap. The board became spam — "67 order expired" was my 3rd most common toast.
2. **The drone is a paper tiger.** 22 runs in 64 days, harvesting ~5 crops each. A 5×5 that only fires "every morning" on already-ripe tiles can't keep up with a 30-tile farm, and there's no way to buy more drones-per-area or widen the footprint. It cleared a goal and then sat there.
3. **Fuel economics don't exist.** $87 of fuel across 90 days. The tiller/tractor upgrades (`TILL_TIERS` burning 0.05–0.12 gal) I never bought because hand-tilling a 30-tile farm at 0.98 diligence was fine. `fuelPrice` drifting $2.6–$5.6 is a stat I never once cared about.
4. **Animal income freezes at 12.** Nothing signals "build a third coop." My egg/milk/wool throughput was identical on day 22 and day 90.
5. **The 53-day goal drought.** After "$60k farm value" on day 34, the *only* remaining goal was "Own the whole valley," gated behind $178,500 of land I bought passively. A guiding arc that goes silent for 59% of the session isn't guiding.
6. **Slot costs are a rounding error late.** `SLOT_COSTS = [0, 0, 2000, 6000]` — a 3rd/4th craft lane for $8k total is trivial when I'm sitting on $100k+ with nothing to buy. The whole cost curve tops out far below my cash.
7. **Level-ups stopped mattering.** repBonus caps at +30% and I only hit +22.5%; the 1.22^level xp curve means the cap is effectively unreachable in 90 days, so late levels felt like confetti with no payload.

## Suggestions (≥15, each tied to a real observation)

1. **Add a prestige / "buy the next valley" layer.** By day 34 farmValue was $60k and *nothing* threatened it; by day 90 it was $326k with `goal: null`. Give the endgame a reset-for-multiplier or a second map so accumulated coins buy escalating challenge.
2. **Make orders assemble-able.** Cap order quantity against *current inventory capacity*, or add a "reserve for orders" toggle so daily-sellers can still fulfill. 67 expired / 7 completed means the board is broken for productive farms.
3. **Scale order value harder for whales, not just quantity.** The `min(0.3, recent/40)` fatness cap tops out fast. Let elite farms opt into rare high-tier orders (5–10× payout, tight window) as a genuine optimization puzzle.
4. **Buff the drone or let me buy drone density.** 22 runs harvesting ~5 crops in 64 days is not "automation end-game." Allow multiple drones per parcel, a widening footprint, or a "tractor-drone" that sweeps a whole parcel — and make fuel actually bite when it does.
5. **Give fuel real weight.** I spent $87 on fuel in 90 days. Either make automation fuel-hungry enough to matter (so `fuelPrice` volatility becomes a hedging game) or drop the pillar. Right now it's dead weight.
6. **Raise animal caps or add mega-barns.** Income froze at 12 animals on day 22. Add a $8k "Ranch" (capacity 20) or stackable barns so herd size stays a lever into the midgame.
7. **Fill the day-34-to-87 goal gap.** Insert farmValue goals at $100k, $150k, $250k, $500k with escalating rewards, plus production milestones (500 crafts, 10k harvests) so the arc never goes silent.
8. **Uncap or extend reputation.** repBonus maxing at +30% (level 21) that I can't reach in 90 days means levels 13–16 gave nothing. Either flatten the `1.22^level` curve or add per-level perks beyond sell price (faster regrow, cheaper fuel, extra craft slot).
9. **Add spend sinks above $50k.** By day 50 I had $75k and everything built. Introduce luxury/vanity or *functional* megaprojects (irrigation network, cold storage that prevents rot, a rail line that auto-sells) priced $50k–$200k.
10. **Rework crashes into a market to trade, not just avoid.** The crash mechanic is good but purely defensive. Add futures/contracts or a bulk buyer who pays premium for volume, turning "don't dump" into "when to dump."
11. **Tune early-game difficulty up on Classic.** "$10k earned by day 9" and 5 goals cleared on day 1 means Classic has no ramp for an optimizer. Consider a "Tycoon+" or scaling seed/land costs with wealth.
12. **Make out-of-season planting less of a silent tax, or a strategy.** 23 crops lost to season — I'd love a greenhouse-driven off-season *arbitrage* loop instead of just "wasted seed money."
13. **Surface efficiency UX: a $/tile/day and $/hour readout.** I want the spreadsheet in-game. Show per-crop ROI, per-building throughput, and marginal value of the next parcel so optimization is informed, not eyeballed.
14. **Auto-sell / standing-order automation for the plateau.** The back 56 days were manual repetition of a solved loop. Let me set sell rules ("sell surplus above N, never below X price") so the endgame is *managing* automation, not clicking it.
15. **Fix the automation payoff curve.** Sprinkler (3×3) + drone (5×5) can't cover a 30-tile farm bought across 9 parcels. Automation coverage should scale with land owned, or land should be cheaper so coverage keeps pace.
16. **Add rot/spoilage pressure at scale.** `ROT_DAYS = 2` and I lost **zero** to rot because I sold daily. A cold-storage/logistics layer would make big farms a genuine juggling act instead of a monotone loop.
17. **Escalate the craft chains.** Quilt at $1,500 (wool→cloth→quilt) is the ceiling. Add a 4th tier (tapestry? artisan hamper bundling 3 goods?) worth $3k–$5k so processing stays the best strategy into the endgame.

## Balance / economy analysis

**The money curve is a hockey stick that flatlines.** Earned/day by 10-day block: **$1,172 → $2,000 → $1,685 → $5,460 → $4,008 → $4,183 → $4,084 → $4,707 → $4,230.** The single inflection is days 31–40 (land unlocking more soil). After that, income is a **dead-flat ~$4,200/day plateau** — I stopped *growing* around day 40 even as farmValue climbed, because that growth was almost entirely me converting coins into land. Of the final $331,714 farmValue, **$178,500 (54%) is parcel cost** — land I bought, not an economy that compounded. `farmValue = coins + fuel×price + Σinv.base + Σbuilding.cost + Σanimal.cost + Σparcel.cost` rewards hoarding, not efficiency.

**Best money strategy:** regrow crops (5× harvest multiplier) → process into `PROCESSED` goods that dodge crashes → split-sell across days to avoid the `1 − qty×0.004` penalty → stack hot + market-day 2.25× windows. Orders are a *situational* bonus (best as same-day rushes at 1.5625× spot) but unreliable at scale. **Worst strategy:** dump-selling raw crops (crashes), and — surprisingly — **automation and fuel gear**, which cost setup for near-zero marginal return in my run.

**Are orders/recipes/automation worth it?** Recipes: yes, clearly (crash immunity + margin). Orders: marginally, and broken above midgame (7 of 74 fulfilled). Automation: **no** — the drone cleared one goal and produced ~110 crops over 64 days.

**Classic difficulty for an optimizer:** far too soft. I never had a cash crisis, never paid a vet bill, lost only 69 crops (0.026 loss rate against 2,636 outcomes), and cleared the "hard" $60k goal on day 34. The failure states the README advertises — wilting, rot, sick animals — barely registered. Classic needs a steeper cost curve or a true endgame; right now the optimization problem is *solved by day 40* and the remaining 50 days are administration.

---

### Top 3 suggestions
1. Add a prestige / second-valley endgame — by day 34 farmValue was $60k and nothing could threaten it, leaving 56 days of victory lap.
2. Fix the order board — 67 expired vs 7 completed because ask-quantities scale with production I'm simultaneously selling; let me reserve stock or cap asks to inventory.
3. Make automation and fuel actually matter — the drone ran 22 times for ~$87 of fuel all game; scale drone coverage and fuel burn with land owned so the "automation end-game" earns its name.
