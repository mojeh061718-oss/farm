# Harvest Empire — 100-Day Playtest Report
**Persona:** Priya, 31, software engineer, Factorio problem. **Difficulty:** Classic. **Farm:** "Deterministic Acres."
**Result:** Farm value $104,817 · lifetime earned $108,838 · **0 crops lost in 100 days** · 4 drones, 14 sprinklers, 7 scarecrows, greenhouse, full processing district · field taps/day at end: **0** (12-17 logistics taps remain).

I read the source before planting a single seed. Layout math committed on day 1:

- Drone = 5x5 centered on pad, sprinkler = 3x3, scarecrow = 5x5. Tilling is **irreversible** and buildings require grass — and the four pre-tilled starter plots at (9,7),(10,7),(9,8),(10,8) sit on **all four possible 5x5 drone centers** in the starting parcel. Workaround: a drone **column** at x=10 — pads at (10,6) and (10,11) — covering rows y4-8 and y9-13 with zero gap, zero overlap, spanning three parcels.
- Sprinkler lattice on 2-tile centers, warped around the poisoned tiles: (9,6),(11,6),(8,8),(11,8).
- Regrow crops (strawberry/tomato/grapes) + drone = the perfect machine: harvest keeps the plant, so no seed cost, no replant, and no water gap (see Bug #1).
- 70 automatable crop tiles planned across 5 zones; 6-10 wheat tiles as feedstock for mill/bakery.

---

## 1. Weekly diary

**Week 1 (d1-7, spring y1).** Day 1 was 56 taps: two scarecrows, three sprinklers, till and plant 17 tiles (strawberry + wheat), hand-water everything, $312 left. The goal system showered me with cash for things I was doing anyway — including +$150 for the first scarecrow *before* the tilling goal, which told me goals pay out in any order (checked git log later: they fixed a goal deadlock. Respect). First harvest day 3, two orders filled day 4, parcel 1 ("industrial district") day 5, coop day 6. Ended at $584 and 27.4 taps/day average.

**Week 2 (d8-14).** Steady state: 17-tile regrow engine, ~24 taps/day, only the 6 wheat tiles need replanting (manual — wheat doesn't regrow). Three orders filled, +$2,617. Season flip day 7 was clean: ripe regrow crops harvested at dawn get removed when out of season instead of dying.

**Week 3 (d15-21).** A $990 order on day 17 (best single transaction of the run). Winter arrived day 19 with no greenhouse — kale fallback mode, as planned. Then my one sequencing blunder: the Juice Press finished on day 21, the first day of a season in which it can't press anything (strawberries/grapes/melon only, and it's winter). $5,500 of idle capital. Week cashflow: -$1,861.

**Week 4 (d22-28).** Winter kale economics: plant 17 on d19, harvest+replant d21, harvest d23, then idle because kale (2-day grow) can't mature before season end — my strategy refuses to plant guaranteed losses since the game happily lets you burn seed money on them. Zero frost losses (kale is winter-legal). Spring y2 on d25 restarted the strawberry engine.

**Week 5 (d29-35).** First smoothies; craft goal completed d31. Then a **three-day heatwave** (d31-33). The folklore says sprinkled crops can die on heatwave days. Measured: dawn-sprinkled water dies at the 22s mark, wilt accrues ~0.36, recovers the next watered day. Three *consecutive* heatwaves, zero deaths. Banked to $7,289.

**Week 6 (d36-42).** The grind week. Summer y2: strawberries out of season, tomatoes in — and the press has **no tomato recipe**. Crafts this week: 0. The press is a season hostage without a greenhouse. +$1,033, all raw sales.

**Week 7 (d43-49).** Second winter without a greenhouse (kale, again) — until **day 47: GREENHOUSE**. Week cashflow -$6,856 and worth every penny: it's not a building, it's a global physics patch. `seasonOK()` literally just checks `hasBuilding('greenhouse')` — one 2x2 structure makes all 300 tiles all-season and frost-proof. On winter day 6 my strategy planted 17 strawberries *in the snow* and they grew.

**Week 8 (d50-56).** Peak manual labor (34.7 taps/day) funding the transition, then **day 56: first drone** at (10,6) — "Automate" goal +$500. Day 57: barn. The dawn toast "Drones harvested 15 crops and replanted 6!" is now my alarm clock.

**Week 9 (d57-63).** The payoff line in the telemetry: field taps fell **27/day -> 6/day**. And those 6 are a bug tax, not a choice: sprinklers run *before* drones at dawn, so the 6 wheat tiles the drone replants each morning start the day bone-dry, and I hand-water them or they'd sit at 0.67 wilt by next dawn (Bug #1). Creamery d64.

**Week 10 (d64-70).** Mill d66, bakery d68 — industrial district complete. Crafts jumped to 17/week. But the tap ledger: field 7.3/day, logistics 12.6/day and *rising*. I automated the field and promoted myself to warehouse clerk: collect 3 processors, feed 2 buildings, collect 2 buildings, queue 9 recipes, sell, buy fuel. None of it automatable.

**Week 11 (d71-77).** Herd complete (12 animals, +$400 on d72), an order filled d74 — the *first since day 17*. Wealth-scaled orders demand stockpiles; my farm is a flow system that sells everything at dawn. Day 75: parcel 2 + all six zone-B infra pieces in one morning.

**Week 12 (d78-84).** Drone #2 (d80) — and the $60k farm-value goal (+$2,000) the same day. Day 84: parcel 3 plus zone C's two scarecrows and four sprinklers in a single dawn. Value +$15,449 this week. Compounding has arrived.

**Week 13 (d85-91).** Day 85 was the biggest manual day of the run — 81 taps, tilling/planting 18 zone-C tiles — the correct late-game shape: manual effort now only means *expansion*, never maintenance. Drone #3 d89. Winter y4 started d91 and I didn't notice for a day; the greenhouse deleted the season mechanic. Value +$12,672.

**Week 14 (d92-98).** Parcel 4 (d95), zone E planted (d96), drone #4 (d98). Fuel ledger at d98: 95 gal bought, $268 lifetime — 0.25% of earnings.

**Week 15 (d99-100).** The end state I speced on day 1: **field taps 0.** Both days. Day-101 dawn toast: "Drones harvested 67 crops and replanted 10!" Remaining 12-17 taps are collect/queue/sell/feed ritual. The one goal left on screen: "Fertilize 5 crops — 0/5." My drones can't fertilize. I refuse to do it by hand. We are at an impasse.

---

## 2. What I LOVED

1. **Regrow crops + drones are a synergy you can *derive*.** Harvest keeps a regrowing plant, so drone tiles of strawberry/tomato cost zero seeds, never need replanting, and keep their dawn sprinkler water. Reading that in source and then watching "harvested 15, replanted 6" every dawn for 45 days was peak satisfaction.
2. **The coverage geometry is a real puzzle.** 3x3 sprinklers, 5x5 drones/scarecrows, buildings eating field tiles, pre-tilled soil poisoning placement — designing the x=10 drone column around the blocked centers felt like Factorio ratio work. Proof: **0 crops lost in 100 days** across 5 storms, 5 heatwaves, 8 snow days; crows never scored.
3. **The engine is deterministic and honest.** Every hazard has computable bounds (wilt = 1.5 dry days, rot = 2 days, drought drain = 22s). I predicted the kale winter cycle, the heatwave wilt ceiling, and season-flip behavior on paper; telemetry matched.
4. **Goals pay out in any order** (fixed in a recent commit) — my weird build order was rewarded, not punished.
5. **Processing margins reward planning.** Smoothie: $108 of strawberries -> $300. Grape juice: $176 -> $410. The press changed my entire build order.
6. **Economic safety rails that never patronize:** odd-jobs income floor, sellBuilding at 50% as a lifeline, offline fast-forward at half decay with no disasters.
7. **Fuel is a soft constraint, not busywork** — 1 gal/drone/day, only on days it worked, no charge for idle drones.
8. **Season flips are graceful for ripe crops:** a ripe regrow crop harvested off-season is cleanly removed rather than left to die.

## 3. What I HATED

1. **The dawn ordering bug tax.** Every crop my drones replant starts its first day with zero water because sprinklers fire *before* drones. Weeks 9-14 telemetry shows exactly 6-10 hand-waterings per day, every day, on tiles that are nominally "fully automated." The single biggest betrayal of the automation fantasy.
2. **You cannot remove a living crop. At all.** No shovel. `clearDead` only works on corpses. Pre-greenhouse you wait a day for off-season wilt to kill it; post-greenhouse a misplanted *regrow* crop is **permanent**. The only removal procedure is selling the adjacent sprinkler at 50% loss and letting the plant die of thirst.
3. **Tilling is irreversible and buildings demand grass** — the four starter soil tiles permanently block all four viable drone centers of parcel 0. My best-case layout was crippled on day 1 by the tutorial's welcome gift.
4. **Collecting and restocking has no automation tier.** Endgame floor is 12-17 taps/day of pure ritual. The game's automation ladder ends at "drone + sprinkler" and pretends the second half of the loop doesn't exist.
5. **Orders fight automation.** 7 orders filled in the first 17 days, exactly 1 in the following 83. Wealth-scaled orders want stockpiles; an optimized farm sells everything at dawn. Skipping is free, so the order board rounds to dead content.
6. **The mill force-feeds wheat to chickens at a loss** ($7 net wheat vs $5 cash feed). No toggle, no per-animal policy.
7. **All layout math must be done outside the game.** No coverage overlay, no footprint preview, no blueprint mode.
8. **The press has no recipe for half the crops.** Summer y2, weeks of tomatoes, crafts: 0. A "Juice Press" that can't press a tomato is a personal insult.
9. **Fertilizing is the only field action with no automation path** — and it's a goal. "0/5" forever, on principle.

## 4. Bugs & oddities (with evidence)

1. **Sprinklers run before drones at dawn** (`newDay()`: `sprinkle(b)` loop then `runDrones()`; `plant()` sets `water: 0`). Every drone-*replanted* (non-regrow) crop spends its first day dry — no growth (growth requires `water > 0`) and up to 0.67 wilt by next dawn. Telemetry: `watered 6` every morning the zone-A drone was alive (the 6 wheat tiles); in run 1 (unmitigated) drone-replanted wheat cycled at 2 days instead of 1. Regrow crops are immune because harvest keeps the watered plant — which is *why* my farm is 90% strawberries/tomatoes.
2. **No living-crop removal API.** `clearDead` requires `crop.dead`; `harvest` on a regrow crop re-arms it. With the greenhouse making everything immortal, crop choice per tile is *permanent*. Run-1 evidence of the wait-to-die workaround failing: at winter start, 12 unripe grapes I could neither harvest nor clear were executed by frost ("Frost killed 12 crops!").
3. **Starter soil blocks automation geometry** (`canPlaceBuilding` requires `t.k === 'grass'`; no un-till exists). The 4 pre-tilled tiles occupy the complete set of 5x5 centers inside parcel 0.
4. **Greenhouse is a global flag, not a place.** `seasonOK()` = in-season OR `hasBuilding('greenhouse')`; frost skipped entirely if one exists anywhere. One $12k 2x2 building de-seasonalizes 300 tiles. Telemetry: 17 strawberries planted on winter day 6 grew normally.
5. **Processing "queues" run in parallel.** `startRecipe` sets `done: now + time` at enqueue, so 3 queued smoothies (60s each) all finish 60s later. Throughput is 3x what "queue" implies. I exploited this daily.
6. **Storms/crows are deterministic vs scarecrow radius — and silently punish gaps.** Run 1: four "storm destroyed 1 crop" events, all at the exact 2 tiles outside my Chebyshev-2 lattice ((9,9),(12,10)). Run 2 with a coverage-audit guard: 0 losses across 5 storms. No in-game way to *see* the gap.
7. **Heatwave+sprinkler folklore is (mostly) false.** Dawn-watered crops accrue <=0.36 wilt on a drought day and recover. Survived a 3-day heatwave streak (d31-33) with zero losses. The lethal case requires entering a heatwave already ~0.6+ wilt — exactly the state Bug #1 creates. The two bugs compose.
8. **Mill feeding has inverted economics for cheap animals** (`feedCostFor` always prefers grain when a mill exists): chicken eats $7-net wheat instead of $5 cash.
9. **`refillCan()` works from anywhere** — no proximity check in the engine; the well is UI fiction.
10. **Off-season/too-late planting is allowed with only a throttled toast** — the game takes seed money for crops that mathematically cannot mature before season end. I wrote my own grow-time-vs-days-remaining guard.

## 5. Suggestions for 2.0 (ranked)

1. **Fix the dawn pipeline: drones before sprinklers** (or drone replants inherit water). A one-line reorder in `newDay()` deletes the worst wart in the automation loop.
2. **Add a shovel** — remove a living crop (no refund needed), and let it un-till soil back to grass. Permanent tiles are hostile to iteration, and iteration is the whole point of a layout game.
3. **Auto-collector tier ("Runner Bot", ~$10-15k):** collects animal products and finished crafts, restocks one assigned recipe while inputs exist. My endgame is 14 taps/day of ritual; sell me the machine that eats it. The natural third act after sprinkler -> drone.
4. **Coverage overlays + blueprint/ghost placement:** show 3x3/5x5 footprints during placement and a toggleable union overlay (watered / protected / drone-covered). Run 1 lost crops to a 2-tile scarecrow gap invisible without hand math.
5. **Recipe auto-repeat toggle per building** ("keep crafting X while ingredients exist").
6. **Fuel contracts / auto-buy threshold** ("buy to 20 gal when price < $3.00") plus a farm tank building. Price volatility (2.6-5.6) is a market mechanic nobody can engage with via manual dribbles.
7. **Persistent alert panel for silent automation failures:** grounded drone (the toast fires once), dry replants, tiles outside scarecrow cover, sick animal, idle processor, press-has-no-valid-recipe-this-season.
8. **Drone fertilizer module** (toggle, burns $20/tile). Fertilize is the only field verb with no automation path — and it's a goal.
9. **Standing contracts for late game:** "deliver 6 smoothies/day for 5 days, +40% premium." Flow-shaped demand for flow-shaped farms.
10. **Mill feed policy toggle** (grain / cash / cheapest, per species). Never let an efficiency building lose money silently.
11. **Seasonal viability preview on the seed sheet:** grey out crops that can't mature in the remaining days.
12. **Area-based greenhouse tier:** e.g., $4k climate dome covering 7x7, $18k valley-wide — reachable before day 47 on Classic without being an instant win.

## 6. Balance notes (my data, Classic, 100 days)

**Capex vs return.** Automation capex: 14 sprinklers ($8,400) + 7 scarecrows ($2,450) + 4 drones ($30,000) + greenhouse ($12,000) = **$52,850**, ~50% of final farm value. Lifetime earned $108,838 (~$1,088/day avg; ~$2,200/day by week 13+ as farm-value delta).

**Sprinkler ($600):** income payback = never (watering is free labor); tap payback = immediate (~8 taps/day each). Correctly priced QoL; 4 on day 1 was right.

**Scarecrow ($350):** best ROI in the game. 5 storms x 12%/crop x ~30 crops ~= 18 expected storm deaths avoided, plus ~30%/day crow theft. Run 1 paid 4 crops for a 2-tile gap; run 2 lost zero. Effectively mandatory.

**Drone ($7,500 + ~$3.30/day fuel):** strictly income-neutral vs my finger — same yield, same prices. Its return is ~15-20 field taps/day per zone (zone A: 27 -> 6). Pure labor arbitrage; on Classic's ~$400-500/day early net, the optimal line is "grind taps, bank for greenhouse/press first" — **the automation flagship is a luxury good** (mine arrived day 56 of 100). Suggest $4,500-5,500, or give drones a small yield edge.

**Greenhouse ($12,000):** strongest item in the game by an order of magnitude — deletes seasons globally, deletes frost, unlocks perpetual regrow + year-round press feedstock. Pre: ~$400-500/day net; post: value grew $8-16k/week. Simultaneously underpriced for its power and unreachable early on Classic (I ate two kale winters). The whole difficulty curve pivots on this purchase.

**Press ($5,500):** smoothie nets ~$190/craft, ~3/day = ~$570/day when fed -> ~10-day payback *in season*; but season-hostage without a greenhouse (week 6 crafts: 0). Buying it on winter's eve (day 21) was my worst trade.

**Winter (no greenhouse):** kale nets ~$26/tile-day vs strawberry ~$36 — ~30% income cut, plus a full replant every 2 days (~50-60 taps on cycle days), plus 1-2 dead tile-days per season boundary.

**Animals:** chicken ROI ~20 days (egg ~$13/day gross - $5 feed); cow only pencils with a creamery (yogurt +$176/craft). Mill saves ~$5/cow-day but *loses* ~$2/chicken-day; at my 6+6 herd, net ~= +$18/day on $2,200 -> 122-day payback. Worst building in the game; bought it for the closed-loop aesthetic, regret only the math.

**Fuel:** 95 gal / $268 over 100 days = **0.25% of revenue** (40 gal still in tank). Even at max price a 5-drone fleet costs ~$28/day against ~$2,000/day late income. Fuel is flavor, not logistics.

**Taps/day (core metric):** wk1 27.4 -> wk8 34.7 (peak, funding the transition) -> wk9 14.3 (drone A online) -> wk15 **14.5 with field taps = 0**. Milestones: sprinklers d1-4, press d21, greenhouse d47, drones d56/d80/d89/d98. Persona goal ("by day 60, work = collecting and restocking") — achieved day 57, with the caveat that the remaining ritual has no automation ceiling to break. That's wishlist item #3, and I will pre-order it.
