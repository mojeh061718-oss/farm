# Harvest Empire — State-of-the-Game Review & the 4.0 Plan

**Date:** July 16, 2026
**Method:** full read of the design docs (`RETURN-TO-PLAY-PLAN.md`, playtest
`AGGREGATE-REPORT.md` + `FIXES-APPLIED.md`), archaeology across all 46 merged PRs,
a code audit of `js/data.js` / `js/game.js` / `js/ui.js` against what those docs
promised, and a fresh run of the full e2e gate.

---

## Part 1 — Review: where the game stands

### 1.1 The journey so far

Seventy-nine commits tell a remarkably coherent story in six eras:

| Era | PRs | What happened |
|---|---|---|
| **Foundation** | #1–#9 | The isometric sim, Graphics 2.0 ("Golden Hour Storybook"), data-safety layer, first trust fixes |
| **3.0 "The Return Update"** | #10–#11 | The 11-agent study found the game *punished absence and rewarded presence* — the opposite of the genre. Away-time rescale, welcome-back digest, 2-min days, economy rebalance, daily tasks + streak, Market Day |
| **The Toni saga** | #12–#17 | THE Sunflower (Toni Variety) — a genuinely-random mythic with its own newspaper lore, blessing mechanics and no pity timer. The game's soul |
| **UI rethink** | #18–#21 | Toolbar → contextual action bubble; one-tap auto-actions; ripe crops harvest on a single tap |
| **Instrumented playtest & fixes** | #22–#38 | Five blind persona bots + first-hand review → every P0/P1 finding fixed (ranked goal chip, fillable orders, telegraphed season death, tiered notifications, Legacy prestige, auto-fuel/auto-sell, 5×5 sprinklers, wealth-scaled weather, compendium). Then two deep performance passes (baked-ground signature fix: ~2,000 ms → ~5 ms frames; adaptive resolution + crop LOD) |
| **Scale & the Rethink** | #39–#46 | 40×30 clean-grid valley, Farmhands (hired crews + payroll), meat livestock — then a sharp design pivot: **S1** crops never die (pause/slow instead), **S2a** fertilizer removed, **S2b** animals simplified (fed = producing; no sickness/vet/happiness), **S3a** one barnyard (any animal sellable for meat; standalone Pasture/Slaughterhouse pulled from the shop) |

### 1.2 What's genuinely strong (protect these)

- **The world.** Zero-asset procedural Canvas art that testers repeatedly called
  professional; 60fps-tuned after two real profiling passes; seasons, lighting,
  weather, animal behaviors all land.
- **Onboarding.** "Best-in-class" per the aggregate report — one verb at a time,
  instant rewards, and the ranked goal chip no longer freezes.
- **The honest thesis.** No unlock gates, money is the only ladder — stated up
  front and delivered throughout.
- **The Toni.** A mythic that most farms will never see, with real lore and zero
  pity mechanics, is a brave, memorable centerpiece.
- **Engineering discipline.** ~12,300 lines of dependency-free JS, 12 e2e suites
  (315 checks — rerun for this review: **all green, zero failures**) driving the
  real game in headless Chromium, save migrations that
  never strand a crop, an instrumented persona playtest harness. This codebase is
  in unusually good health for its size.

### 1.3 The identity pivot — and why it's the right one

The Rethink (S1–S3a) quietly changed what this game *is*. The README still says
"a farm you neglect will fail" — but as of S1, **nothing you plant can ever be
lost**. Dry crops pause. Out-of-season crops grow slowly. Ripe crops wait. Unfed
animals just stop producing. This is the Hay Day cardinal rule the 3.0 study
recommended, taken to its logical end.

That pivot is correct — every retention datapoint in both studies supports it —
but it is **half-finished**, and the seams show:

### 1.4 Open debt found in this audit

1. **S3b never landed.** S3a's own commit message promises "the legacy livestock
   system is retired fully in the S3b follow-up." It wasn't: `MEAT_ANIMALS`,
   `FATTEN_SLOWDOWN`, the `pasture` and `slaughterhouse` buildings, their render
   art, panels and the `e2e-livestock` suite all still ship, hidden from the shop
   by a UI filter (`ui.js:648`).
2. **The Feed Mill "Workshops cleanup"** (flagged in S2b's commit) is also
   pending — feed credits are a leftover of the removed animal-care layer.
3. **Dead constants.** `WILT_DAYS`, `ROT_DAYS`, `VET_RATE` and the per-difficulty
   `wiltDays` fields are defined in `data.js` but no longer read anywhere.
4. **Difficulty modes have drifted from their pitch.** Tycoon promises "harsh
   skies" but post-S1 weather is light live-play stakes only; Cozy's forgiveness
   (longer wilt survival) now protects against a death that can't happen. The
   modes still differ meaningfully (capital, event frequency, sell bonus) but
   their blurbs sell the old game.
5. **The README sells the old game too** — fertilizer (removed), wilt/rot/vet
   bills (removed), +10% Tycoon bonus (actual: +5%), 3×3-era sprinkler tips,
   "9 land parcels" (now 8), no mention of farmhands, meat, prestige, daily
   tasks, Market Day, or the Realtor. First impressions run through this file.
6. **`/dev` is a stale fork** of the HD-graphics preview — three files have
   drifted from the live game. Keep it deliberately or delete it.
7. **The tests README says eight suites; there are twelve.**

None of this is hard to fix — but a "biggest update yet" built on an
inconsistent foundation would compound all of it.

### 1.5 Where the fun still leaks (design view)

With the playtest P0s fixed and failure removed, the remaining gaps are exactly
the ones both studies predicted:

- **The calendar is still mostly empty.** Daily tasks + streak and Market Day
  shipped (3.0), but the rest of the retention plan — weekly Derby, the 18-hour
  boat, monthly event crops, opt-in push — never did. Self-reported return
  likelihood collapsed from 74% (day 1) to 9% (day 30) precisely because
  *nothing is scheduled to happen tomorrow*.
- **The world has no people.** Orders are faceless line items; the town backdrop
  never changes; nobody says thank you. The game has systems and beauty but no
  heart to attach to (the Toni excepted — and testers loved it for exactly this).
- **The economy is still solved by mid-game.** Farmhands, Legacy stars and the
  late goal ladder added sinks, but a $300k+ farm has nowhere expressive to put
  money — no decorations, no megaproject, nothing to *show* for wealth.
- **Completion has a scoreboard but no arc.** The compendium counts; it doesn't
  pull. No shipping log, no quality tiers, no perfection %, no year-end review.

---

## Part 2 — The 4.0 Plan: **"The Living Valley"**

**The pitch:** finish the identity pivot, then give the valley a heartbeat —
people who know your name, a calendar that fills itself, and a farm that becomes
a *place* you decorate and perfect rather than a spreadsheet you solve. Nothing
is ever missable, nothing ever punishes, everything reruns.

Four phases, strictly ordered. Phases 0–2 are the 4.0 release; 3 and 4 are the
follow-on updates already scoped.

### Phase 0 — Pay the debt (the foundation, ~1 short cycle)

*Nothing new ships until the game we have is the game we say we have.*

- **S3b:** delete `MEAT_ANIMALS`/`FATTEN_SLOWDOWN`, the pasture/slaughterhouse
  buildings + art + panels + suite; migrate existing pastures gracefully (sell
  stock at fair meat value, refund the buildings, one warm toast).
- **Workshops cleanup:** fold the Feed Mill into the simplified animal loop —
  grain in silo = cheaper/free feeding, no separate credit currency.
- Strip dead constants; re-blurb the three difficulties around what they really
  are now (starting capital · event liveliness · sell bonus); consider renaming
  to **Cozy / Classic / Bootstrap** so "harsh skies" stops overpromising.
- **Rewrite the README** around the true identity: *"a farm that never punishes
  you — but always misses you."* Document farmhands, meat, Legacy, daily tasks,
  Market Day, the Realtor.
- Delete or re-sync `/dev`; update `tests/README.md` to the twelve suites.

**Exit gate:** full e2e green; a fresh reader of the README finds zero claims the
game doesn't keep.

### Phase 1 — The Calendar (reasons to return)

The 3.1 layer that never shipped, adapted to the no-fail identity. All
client-side, all date-seeded, all rerun forever.

1. **The Weekly Derby.** ISO-week-seeded board of 9 farming tasks (same board
   for every player worldwide), bronze/silver/gold reward tiers, a shareable
   end-of-week results card. A new board every Monday, forever.
2. **The 18-hour Boat.** A barge docks at the pond asking for 3 crates of goods;
   real-time countdown independent of sim days. Fill all three for a bonus.
   No-fail rule: an unfilled boat just sails away and another comes — the loss
   is only the missed bonus.
3. **Seasonal festivals.** Market Day (exists, day 5) grows into a proper
   festival: 2–3 named special buyers paying +40–60%, bunting on the farmhouse,
   festival music. One per season, deterministic, reruns yearly.
4. **Monthly event crop.** One real-calendar-month crop (October pumpkins-gone-
   giant, February love-apples…) with a compendium entry; missable never — same
   month next year, same crop.
5. **Opt-in PWA push, player-caused only.** "Your boat sails in 2 hours" ·
   "The Derby ends tonight — you're 1 task from gold." Never guilt, never spam.
6. **Kind streaks.** One missed day per week auto-repairs (a "rain day"), so the
   streak system matches the game's forgiveness values.

**Exit gate:** a new `e2e-calendar` suite (deterministic via shimmed `Date`);
persona-harness reruns show idler/casual bots completing ≥1 boat and ≥1 Derby
tier per week.

### Phase 2 — The Living Valley (the heart — 4.0's headline)

1. **Named order-givers.** Every order comes from one of ~10 procedurally-drawn
   townsfolk (zero-asset portraits in the established art style) with two lines
   of personality. Filling orders grows a per-NPC friendship meter.
2. **Friendship pays in character, not power:** thank-you letters (a mailbox on
   the farmhouse), occasional gifts, standing weekly orders from best friends,
   and 2–3 step order *chains* ("that cheese was for my daughter's wedding —
   now we need a cake").
3. **The town wakes up.** Reputation levels visibly restore the valley backdrop
   — lamps light, a market stall appears, the chapel gets its bell. The
   world-feedback item both studies asked for, now tied to the NPCs who live
   there.
4. **Twelve sealed letters** unlocking at milestones (first Legacy star, first
   gold Derby, valley owned…) that slowly tell the valley's story — and finally
   give the Toni's newspaper a narrative home.
5. **Animal bonding.** Animals already have names; add a pet interaction and a
   bond level per animal with a tiny (+cosmetic, +compendium) payoff. Attachment,
   not optimization.

**Exit gate:** orders-completed-per-run rises in persona reruns (the aggregate
report's worst engagement number); zero new toast spam (friendship chatter goes
to the mailbox, not toasts).

### Phase 3 — Collections & Perfection (4.1, the forever arc)

- **Shipping log** with silhouettes — sell one of everything, ever.
- **Crop quality tiers** (normal/silver/gold from care: watered streak, in-season,
  blessed soil) that flow through recipes and orders.
- **Permit Points:** a second progression axis visible from hour one — every
  milestone drips points spent on a perk board of *capabilities* (wider water
  arc, a fourth craft lane, cheaper wages, dawn auto-collect), not just cash.
- **Year-end evaluation** (Stardew's grandpa, but kind) and a **Perfection %**
  aggregating every collection — the number completionists play for.

### Phase 4 — Wealth with somewhere to go (4.2)

- **Decorations catalog** — paths, fences, flowerbeds, trees, a gazebo. Pure
  expression money-sink for the solved-economy endgame; the playtest's $300k
  banks finally have a purpose.
- **Overgrown parcels** — discounted land cleared tile-by-tile (satisfying work,
  not a paywall).
- **One megaproject** — a multi-real-day construction (the Grand Granary or a
  rail spur that auto-ships goods at +10%); farmhands visibly build it.
- **Legacy 2.0** — prestige keeps stars and adds one *heirloom* choice per run
  (start the next valley with your best building, your bond-max animal, or a
  Glowing Seed).

### What 4.0 deliberately does **not** do

- No backend, accounts or cloud sync (save-code export stays the trust story).
- No multiplayer, no monetization, no WebGL port (the PoC stays a PoC).
- No new failure states of any kind — the Rethink is the identity now.
- No new dependencies; everything stays procedural, zero-asset, offline-first.

### Sequencing & measurement

| Release | Contents | Test surface |
|---|---|---|
| **4.0 "The Living Valley"** | Phases 0 + 1 + 2 | e2e: S3b migration, calendar suite, NPC/order-chain suite; persona harness rerun |
| **4.1 "The Perfection Update"** | Phase 3 | collections/quality/permits suite |
| **4.2 "The Homestead Update"** | Phase 4 | decorations/megaproject suite |

Success is measured the way this project already measures: rerun the five blind
persona bots after 4.0 and compare — orders completed per run (was 7–12 of ~80),
days with an active reachable goal (was gaps of 50+), toasts per run (should stay
≤ ~110), and a new metric: *calendar events engaged per simulated week*. The
retention proxy to beat is the studies' shape — great day 1, dead day 30.

---

*The one-line thesis of 4.0: the Rethink made the farm safe to leave;
The Living Valley makes it hard to stay away.*
