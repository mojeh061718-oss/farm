# Tycoon Playtest Journal — "Ironhoof Ranch"

**Tester:** Sasha, 41, hardcore challenge-seeker
**Mode:** ⛈️ Tycoon — $1,500 start, weather events ×1.4, +5% sell prices (`data.js`: `eventMult: 1.4, sellBonus: 1.05`)
**Plot:** ~20 tiles · high diligence (0.95) · sell on Market/hot items · fuel-aware · order-focused
**Run length:** 90 in-game days (seed 3033)

## Final state (from `final`)

- **Day 91, Year 3, Summer** — survived the full run.
- **Coins: 100,312** · Farm value: **235,878** · Level **15** (+30% cap on the rep bonus, effectively maxed).
- **8 of 9 land parcels** owned · 12 animals · 6 buildings · 39 artisan goods crafted.
- Lifetime **earned $261,453**, lifetime **crops lost: 66** (`lostBy` closed the game at dry 0 / rot 0 / season 0 — everything I lost, I lost in the moment, and I never let a field rot).
- **12 orders completed** — and, tellingly, **77 orders expired** on the board behind me.

I picked Tycoon because I wanted a knife fight. What I got was a terrifying first two weeks bolted onto a game that turns into a money printer the moment you clear them.

---

## The diary

### Week 1 (Days 1–7, Spring) — the $1,500 does NOT last

This is the only stretch where Tycoon earns its thunderstorm emoji, and it earns it hard. The $1,500 stake is gone before the first sunrise finishes. **Day 1 and Day 2 both close at 186 coins** — that is the lowest my wallet ever got in 90 days, and it happened *immediately*. Seeds, a coop, a first bird, tilling 17 plots: the stake evaporates into infrastructure and I'm staring at three digits with 20 planted tiles and nothing to sell yet. That is a fantastic, stomach-tight opening. I genuinely didn't know if I'd make rent.

**Day 3** is the exhale: first real harvest lands, 23 crops sold, and coins rocket **186 → 2,892**. Two level-ups in a single day. The whiplash from "I have $186" to "I have $2,892" is the best feeling in the entire run, precisely *because* the floor was so low.

Then it stays honest for a while. **Day 5** dips to **1,945** — my first fuel buy (5 gal shows up in the tank) plus a third animal. **Day 6** an order pays **+$585**, which on a ~$3k wallet is enormous — that single delivery was ~20% of my net worth. Day 5 also gave me my first **crow** and my first **Market Day** (Yogurt & Truffle Oil +50%), neither of which I could really capitalize on yet.

### Week 2 (Days 8–14, Spring→Summer) — the heatwave gauntlet

Coins climb into the 3k–5k band (Day 8 spikes to 5,120 on a fat sell) but Summer arrives on Day 11 and immediately shows its teeth. **Days 12, 13, and 15 are all droughts/heatwaves** — `game.js` drops field moisture from 65s to 22s, "dry out three times faster," and Tycoon's ×1.4 makes the death rolls bite:

- **Day 12: 8 crops died of thirst.** Coins 2,829.
- **Day 13: 12 crops died of thirst** — my single worst crop-loss day of the whole game. Cumulative losses jumped from 2 to 10 in 48 hours. Coins 3,099.
- **Day 15: 6 more died of thirst**, but a **RUSH order paid +$260 (+25%)** the same day, softening the blow.

**Day 14 is the true survival low of the mid-game: 2,088 coins** while the heat is cooking my fields and I'm 22 crops in the hole. This week is Tycoon at its best — I was rationing waterings, timing sells for the Day 15 Market Day (Duck Egg & Pepper), and genuinely sweating whether a bad roll would wipe a planting I couldn't afford to replace.

### Week 3 (Days 15–21, Summer→Fall) — clawing above water

The storms start now. **Day 16** is my first storm (no crops lost — scarecrow-less luck), **Day 19** a storm **destroys 3 crops**. But this is also where the thin wallet stops being lethal: **Day 20 jumps to 8,867** on a big sell wave, **Day 21 to 9,487**, and I buy my 2nd land parcel. Once I'm past ~$8k the disasters stop being existential and start being annoyances. The tension curve, honestly, peaks at Day 14 and never returns to that pitch.

### Weeks 4–5 (Days 22–35, Fall→Winter) — the snowball forms

Fall is where processing kicks in (first craft logged Day 23). **Day 22** drops -5,125 to 4,362 — a reinvestment dip, not a disaster. From there it's a staircase: Day 27 breaks **11,174**, Day 28 **13,371**, Day 30 **14,563**. **Day 26** storm destroys 6 crops (my biggest storm hit) and I barely notice — coins went *up* that day to 8,575. Winter lands Day 31 with snow; I "forgot" a day (Day 17 and Day 31 are my two idle days), and frost never actually killed anything all game (`frost: 0` in lossCauses) because I'd stopped planting non-hardy crops out of season by then. Day 33 dips to 10,582 (parcel #4), Day 35 hits **21,603**.

### Weeks 6–8 (Days 36–56, Winter→Y2 Summer) — safe, and I felt it

By **Day 39 I'm at 32,031** and the game is effectively won on Tycoon's own terms. Year 2 Spring is a gentle climb from ~30k to ~40k — I was never below $30k again after Day 41. The Day 52 heatwave killed 8 crops and I didn't flinch. The real events here are *voluntary*: **Day 56 an order pays a monster +$2,435** (coins 47,945), the biggest single non-land swing of the run.

### Weeks 9–13 (Days 57–90, Y2 Summer→Y3 Summer) — empire mode

From here the only things that move my wallet meaningfully are land buys and craft orders. The three big "dips" are all me spending on expansion, which is the comeback/reinvestment loop working as intended:

- **Day 58: -15,789** → parcel #6 (37,949).
- **Day 66: -27,653** → parcel #7 (53,337).
- **Day 83: -41,130** → parcel #8 (73,348).

**Day 77 lands the run's best payout: an order for +$3,260 with a RUSH +25%.** Wool→cloth→quilt and the creamery chain are printing money; crafted goods go from 5 (Day 56) to **39** by the end. Day 80 tops **105,598**. The last storms — Day 88 destroys a single crop — are pure cosmetics against a six-figure bank. I close Year 3 Summer at **100,312 coins and a $235,878 farm.**

---

## What I loved

1. **The Day 1–2 wallet at $186 is the best hook in the game.** Spending the entire $1,500 stake on setup and immediately staring at three digits is a *masterful* cold open for a hardcore mode. Real, immediate, self-inflicted-yet-fair tension.
2. **The Day 3 whiplash (186 → 2,892).** The low floor makes the first harvest feel like a jailbreak. No other moment in 90 days matched it, and that's a compliment to how low Tycoon lets you start.
3. **The Summer heatwave gauntlet (Days 12–15) is genuinely scary at low bankroll.** Losing 8 then 12 then 6 crops to thirst while sitting at ~$2,000 forced actual triage. The ×1.4 multiplier on top of the 3× moisture drain made watering order a real decision.
4. **Clutch orders as a lifeline.** The +$585 on Day 6 and the +$260 RUSH on Day 15 arrived exactly when a few hundred coins mattered. When the wallet is thin, the order board is the most exciting UI in the game.
5. **Market Day + hot-item stacking rewards patience.** Holding inventory for the Day 15 / Day 55 / Day 65 hot items (+50%) instead of dumping daily was the single most impactful *strategic* lever — far more than the +5%.
6. **Reinvestment as the real end-game.** Once safe, the tension I *chose* — spending 41k on parcel #8 on Day 83 — replaced the tension the game imposed. The land ladder ($1k→$60k) gives the snowball somewhere to go.
7. **Losses stay legible.** Every one of my 66 losses came with a toast telling me exactly what and why. For a min-maxer, that transparency is gold.

## What confused or frustrated me

1. **Tycoon stops being Tycoon around Day 20.** My coin low after Day 3 was Day 14's $2,088; from Day 20 on I never dropped below ~$8k except on voluntary land buys, and never below $30k after Day 41. The "harsh mode" is really a harsh *first two weeks* stapled to Classic. For a challenge-seeker, that's the biggest letdown — the difficulty has no third act.
2. **Harsh weather is scarier than it is expensive.** Total crops lost across 90 days: **66**, against **1,994 harvested** — a **3.3% lifetime loss rate**. The ×1.4 multiplier made the *toasts* frequent and the *heatwave days* tense, but in dollars it barely dented a run that earned $261k. Storms flattening "6 crops" on Day 26 while my coins rose that same day is emblematic: the threat is theatrical, not economic.
3. **The +5% is nearly invisible.** Over $261,453 earned, the `sellBonus: 1.05` contributed roughly **$12,450**. That's real, but it's a rounding error next to a single +50% hot-item window or one $3,260 order. As the *marketed* upside for choosing the hardest mode, +5% feels tokenistic. (Side note: the README advertises "+10%" but `data.js` ships `1.05` — the code gives half what the box promises.)
4. **77 orders expired vs 12 completed.** I played order-focused (`doOrders 0.8`) and still watched the board churn 77 expirations past me. On a thin wallet the orders are your lifeline, so a board that expires 6:1 against you feels like missed money more than meaningful choice — especially early, when I couldn't fill high-value orders because I couldn't afford the inputs.
5. **Crows nibbled all game and I never got told to *build* the fix effectively.** "Place a Scarecrow" sat as my goal from Day 6, yet crows ate crops on 12 separate days through Day 85. 12 crows + 11 storms = 23 crops a single scarecrow's 5×5 would have largely prevented, and the game never made building one feel urgent enough to change my behavior. That's a telegraphing gap, not a difficulty one.
6. **Fuel never bit after Day 5.** I sat on exactly **5 gallons for ~85 straight days.** The "empty tank grounds automation" threat never materialized — I *expected* fuel to be a cruel recurring tax; instead it was a one-time Day-5 speed bump.

## Suggestions (weighted to difficulty, risk/reward, fairness & comebacks)

1. **Give Tycoon a third act.** Scale `eventMult` *up* over time or with farm value (e.g. 1.4 → 1.8 past $50k), so late-game storms and heat actually threaten a fat bank. My run had zero tension after Day 41 — the mode needs escalating skies, not just a harsh open.
2. **Make harsh weather cost dollars, not just crops.** A 3.3% lifetime loss rate is cosmetic. Let Tycoon storms damage *buildings* (a repair bill) or let heatwaves spike animal vet/feed costs, so a bad-weather week dents the wallet even when the fields survive.
3. **Rework the +5% into something a hardcore player feels.** Either honor the README's +10%, or better: make Tycoon's edge *conditional* — e.g. +15% on hot items specifically, or +10% only above a coin threshold — so the reward rewards *skilled* selling instead of dribbling $12k across 90 days.
4. **Fix the fuel toothlessness on the hard mode.** Raise `dronePerDay` or widen the daily price swing on Tycoon so an empty tank is a real threat. Sitting on 5 gal for 85 days means the whole fuel economy is decorative once you clear the opening.
5. **Cap or slow order expiration when the board is your lifeline.** 77 expired vs 12 done. Early-game especially, let low-value "starter" orders linger longer, or guarantee one always-fillable order so a thin-wallet player can always claw a payout.
6. **Escalate order value with farm value more aggressively — but gate the premium behind risk.** My best order ($3,260, Day 77) came when I least needed it. Offer high-stakes orders with *penalties* for failure (forfeit a deposit), so a challenge-seeker can gamble for big coin.
7. **Telegraph the scarecrow harder.** Crows hit me on 12 days with a persistent "Place a Scarecrow" goal I ignored. When crows eat 2+ crops in a week, escalate the toast to a red warning with a one-tap "Build Scarecrow ($X)" button. Make the counter obvious.
8. **Add a comeback mechanic that only triggers when broke.** My scariest moment was $186 on Day 2. A "hardship" event — a neighbor loan, a one-time relief order — that *only* appears below, say, $300 would make near-death moments dramatic instead of silently game-ending for less diligent players.
9. **Front-load the danger differently so it recurs.** The heatwave gauntlet (Days 12–15) was the highlight. Guarantee a comparable "disaster season" once per year (a Year-2 and Year-3 heat/storm cluster) scaled to current bankroll, so the tension returns in Fall/Winter of later years.
10. **Show a running "lost to weather" dollar counter.** I only learned my real loss rate (66 crops) by mining the data. Surface "weather has cost you $X this season" so the harsh-mode player can actually feel the trade they signed up for.
11. **Tie starting infrastructure spend to a choice.** The $1,500→$186 collapse on Day 1 is great but *automatic*. Let me choose how to spend the stake (all seeds? a coop? banked cash?), turning the terrifying open into a real opening gambit.
12. **Punish the two "forgot" days.** I idled Days 17 and 31 with no consequence (rot stayed 0). On Tycoon, an unattended day should risk thirst/rot losses so diligence is genuinely rewarded — right now high diligence and mediocre diligence converge once you're rich.
13. **Add storm insurance / scarecrow-network trade-offs.** Let me spend to protect, creating a risk/reward money sink: pay for coverage vs. gamble the ×1.4 rolls. Right now protection is a single cheap building I forgot to place.
14. **Make hot-item timing riskier.** Hoarding for Market Day was strictly optimal with zero downside. Add spoilage or a price-crash risk to held inventory so the +50% play is a *gamble*, not a free lunch.
15. **Rebalance the difficulty label expectations.** Rename or re-tune so "Tycoon" reads as *sustained* hard. Consider a true hardcore toggle: permadeath below $0, no selling buildings back, ×2 events — for players who, like me, picked the storm cloud *hoping* to lose.
16. **Add milestone "empire threats."** Late game (parcels 6–8, Days 58–83) was pure spending with no adversity. A rival-farm or market-crash event at high net worth would give the six-figure phase stakes.

## Balance analysis — is Tycoon tuned right?

**Half right.** The *shape* of Tycoon's difficulty is a spike, not a curve. My coin trajectory tells the whole story: **186 (Day 1) → 2,088 low water mark (Day 14) → 8,867 (Day 20) → 32,031 (Day 39) → 100,312 (Day 90).** All the danger lives in the first ~14 days, when $186–$2,088 wallets meant a single heatwave roll could set me back a planting I couldn't replace. That opening is genuinely excellent and I'd hate to see it softened.

But the ×1.4 event multiplier and the +5% bonus — the two things that *define* Tycoon versus Classic — are both underpowered against the wallet. `lossCauses` totals **66 crops (thirst 34, crow 12, storm 11, season 9)** against 1,994 harvested: a **3.3% loss rate** that the game snowballs past effortlessly. The harsh skies are a scare, not a sink. And the +5% netted about **$12,450 of $261,453** — I felt the *hot-item +50%* and the *big orders* ($2,435, $3,260) run the economy, not my hard-mode bonus.

So the trade the mode offers — "thin wallet + harsh weather, for +5%" — is really "thin wallet for two weeks, then Classic with slightly better margins and scarier toasts." The thin wallet is real but *temporary*; the harsh weather permanent but *toothless*; the +5% permanent but *negligible*. The fix isn't to nerf the great opening — it's to give the middle and end game teeth: events scaled to net worth, weather that costs dollars, and a bonus I can feel. Right now Tycoon is a brilliant 14-day thriller inside a 90-day cakewalk.

---

**Top 3 suggestions:**
1. Give Tycoon a third act — scale `eventMult` up with farm value so late-game skies still threaten a fat bank (my run had zero tension after Day 41).
2. Make harsh weather cost *dollars*, not just crops — 66 lost crops (3.3%) was cosmetic against $261k earned; add building damage or vet-bill spikes.
3. Make the hard-mode reward felt — honor +10% or make it conditional on hot-items/thresholds, because +5% contributed only ~$12,450 of my lifetime earnings.
