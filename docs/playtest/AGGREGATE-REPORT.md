# Harvest Empire — Playability & Fun Review: Aggregate Report

*Five blind playtesters + one first-hand engineering review. Every finding below is grounded in a real, instrumented play session — not opinion. Prepared 2026-07-11.*

---

## Executive summary

Six independent playthroughs (five persona testers who never saw each other's notes, plus my own live review from the setup screen) converge on a clear verdict:

> **Harvest Empire has an exceptional first four minutes and a beautiful, polished world — but its guidance freezes, its notifications drown the signal, and its economy is solved by the mid-game.** The fun is real; it leaks out through a handful of systems that every tester hit independently.

The strongest evidence is **agreement without collusion**. Testers played different difficulties, strategies, and lengths, yet the same four problems surfaced in five separate journals:

| Cross-validated problem | Who hit it independently | Hard number |
|---|---|---|
| **Goal chip freezes / no mid-late goals** | Fern, Rex, Milo, Claude (4/6) | Fern's chip stuck on "Place a Scarecrow" for **80 of 90 days**; Rex had **no goal from day 34→87**; Milo froze at 17/18 on day 48; my run froze day 6→41 |
| **Order board is noise, not a system** | Fern, Rex, Sasha, June, Milo (5/5 who tracked it) | **67–96 "order expired" toasts per run**; Rex completed **7 of ~74**, Sasha **12 of ~89** |
| **Out-of-season death is unforgivably silent** | Milo, June, Claude | Milo lost **292 crops out of season (85% of all his losses)**; the only warning is one post-spend toast that vanishes |
| **Notification overload buries urgent info** | Fern, June, Claude | 3+ toasts stack at once; routine chatter (feed, refill, order-expiry) competes with crop-death alerts |

Two more themes appeared in the difficulty-focused runs:

- **The economy is trivially solved.** Everyone but the deliberate idler passed **six-figure coins**; Rex hit **$331k farm value** with `goal: null` and nothing able to threaten him for 56 days. (Rex, Sasha, Milo)
- **Automation is a paper tiger.** Rex's "end-game" drone ran 22 times on **$87 of fuel all game**; June (an idler who *needs* automation) found sprinklers don't cover a plot and every drone needs fuel she'll forget. (Rex, June, Sasha)

None of this is fatal — it's tuning and UX. The world, art, onboarding, and core loop are genuinely strong. Fixing the four cross-validated issues would move the game from "charming" to "hard to put down."

---

## Methodology

I built an **instrumented playtest harness** (`tests/playtest-driver.js`) that boots the *real* game headless in mobile Chromium, plays it with a persona strategy, and records every toast plus a full per-day state snapshot (coins, level, farm value, inventory, animals, buildings, losses-by-cause, active goal). RNG is seeded per persona for reproducibility. **Zero page/JS errors** occurred across ~2,400 captured messages and 470 simulated in-game days.

Five testers each received **only their own data file** and were explicitly told not to read any other tester's notes — genuinely blind. Each read the source to explain *why* things happened, then wrote a detailed day-by-day journal ending in **≥15 concrete, data-tied suggestions**. Separately, I played the game live from the setup screen through day 41, capturing 11 screenshots (`docs/playtest/review-shots/`).

**The roster and their real outcomes:**

| Tester | Persona | Diff | Days | Final level | Coins | Farm value | Crops lost | Suggestions |
|---|---|---|---|---|---|---|---|---|
| **Fern** | Busy parent, 10-min sessions, hoards | Cozy | 90 | 13 | $125,980 | $132,988 | 26 | 17 |
| **Rex** | Min-maxing optimizer | Classic | 90 | 16 | $121,462 | $331,714 | 69 | 17 |
| **Sasha** | Hardcore challenge-seeker | Tycoon | 90 | 15 | $100,312 | $235,878 | 66 | 16 |
| **Milo** | Completionist, touch everything | Classic | 100 | 14 | $48,614 | $114,591 | 343 | 17 |
| **June** | Low-attention idler | Cozy | 100 | 10 | $27,577 | $45,317 | 81 | 17 |
| **Claude** | First-hand engineering review | Classic | 41 | 9 | $28,346 | $31,446 | 29 | 5 headline |

Full journals: [`fern.md`](fern.md) · [`rex.md`](rex.md) · [`sasha.md`](sasha.md) · [`milo.md`](milo.md) · [`june.md`](june.md) · [`claude-review.md`](claude-review.md)

---

## The findings, ranked by consensus

### P0 — the four everyone hit

**1. The goal chip is a single linear queue that freezes.**
The chip shows one goal at a time from a fixed order (`Game.currentGoal()` returns `todo[cursor]`). If you skip that goal, *all* forward guidance stops.
- Fern's chip sat on "Place a Scarecrow" **days 10–90** while she silently completed "Earn $10k" and "Reach $60k value" — the chip never acknowledged them.
- I watched it freeze on the same goal **day 6→41** while the game simultaneously nagged "Build a Scarecrow" via crow/storm losses — the same advice as both a frozen goal *and* recurring punishment, with no one-tap fix.
- Rex (optimizer) had **no active goal at all from day 34 to day 87**; Milo (completionist) ran dry at goal 17/18 on day 48.
- **Fix:** surface the 2–3 goals the player is *closest* to (not fixed queue order); credit out-of-order completions; and add mid/late goals (see P1-economy). Link the Scarecrow goal straight to its shop entry, surfaced *after* the first crow attack.

**2. The order board generates failure spam instead of gameplay.**
Every tester who engaged the board drowned in it: **93, 67, 77, 81, 96** "order expired" toasts across the five runs. Completion rates were dismal for productive farms — Rex **7/~74**, Sasha **12/~89** — because order quantities scale with recent production *while you're simultaneously selling that production*, so the asks are chronically unfulfillable.
- **Fix:** cap order asks against current inventory, add a "reserve stock for orders" toggle, highlight orders you can already fill, and stop toasting expiries for players who haven't opened the board in N days (fold into a daily digest).

**3. Out-of-season planting kills silently and instantly.**
A crop planted out of season dies within ~a day, and the *only* warning is a single toast fired *after* the seed money is spent — which vanishes in seconds and doesn't survive drag-planting a row. Milo, experimenting like a real completionist, lost **292 crops this way — 85% of his 343 total losses.** June lost crops to silent *season-flip* deaths (legally-planted crops executed the morning a new season arrives). This exactly reproduces a known pattern (see prior `rose.md`: 76% of her losses were season-related).
- **Fix:** render doomed crops with a red/wilting tint + 🍂 badge from the moment they're planted; gray out out-of-season seeds in the buy menu; add a plant-time confirm ("dies within a day, $48 lost") until the player learns; and warn *loudly* on season flips ("Fall ends tomorrow — 8 crops won't survive. Harvest or shelter them?").

**4. Notifications don't prioritize.**
Toasts stack 3+ deep on a 390px screen with no tiering — a crop-death alert you must act on sits in the same brown pile as "Fed 6 animals" (66–69×/run), "Watering can refilled" (70×), and order-expiry churn. Fern and June (the two casual/older personas) both flagged it as making ignorable systems *feel* like constant failure. I hit it live (heatwave + 2× crow + storm stacked at once).
- **Fix:** cap on-screen toasts, tier them (loss > reward > routine), route routine chatter into a scrollable log + an end-of-day/welcome-back summary card, and add a larger-text/slower option for accessibility.

### P1 — the difficulty-and-depth cluster

**5. The economy is solved by the mid-game; there's no end-game pull.**
Five of six runs passed six figures. Rex's farm value hit **$60k by day 34 and $331k by day 90 with nothing able to threaten it** — 54% of that was just *purchased land*, not compounding income, which flatlined at ~$4,200/day after day 40. Sasha's Tycoon tension "effectively ended around day 20." Milo's "own the whole valley" goal is unreachable in 100 days, so the ladder just... stops.
- **Fix:** add a prestige / second-valley reset-for-multiplier; insert farm-value goals at $100k/$150k/$250k/$500k and production milestones (500 crafts, 10k harvests); add functional megaprojects as spend sinks above $50k (irrigation network, cold storage that prevents rot, auto-sell rail line); uncap or add per-level reputation perks beyond the +30% sell cap.

**6. Automation and fuel are decorative.**
Rex: the drone (the advertised "automation end-game") ran 22 times for ~$87 of fuel *all game*; animals froze at the 12 cap on day 22; tiller/can never left tier 1. June (an idler who lives or dies by automation): sprinklers are 3×3 and need two units for a 16-tile field, and every drone needs fuel she'll forget — "hostile to the very idler they're built for." Sasha: fuel was "decorative once you clear the opening."
- **Fix:** scale drone coverage and fuel burn with land owned (make fuel-price volatility a real hedging game); offer a bigger-radius "Irrigation Line" and a fuel-free (higher-upfront) automation tier; add mega-barns to keep herd size a lever; add an auto-buy-fuel / auto-sell-surplus toggle.

**7. Difficulty modes don't hold their promise.**
Sasha (who *picked the storm cloud hoping to lose*) found Tycoon is "a brilliant 14-day thriller inside a 90-day cakewalk": harsh weather cost **66 crops = 3.3%**, cosmetic against $261k earned, and the "+5%" edge added only ~$12,450 all game (the README even promises +10%). Meanwhile June found Cozy's `WILT_DAYS = 1.5` too harsh for a true idler — she lost **59 crops to thirst across 48 forgotten days**.
- **Fix:** scale `eventMult` up with farm value so late skies threaten a fat bank; make harsh weather cost *dollars* (building repair bills, vet spikes) not just crops; honor or condition the Tycoon sell bonus; and on Cozy specifically, stretch drought survival to ~3 days and treat a long tab-open idle like offline (gentle) rules.

### P2 — polish, discoverability, retention

- **Level-up splash has no auto-dismiss** and can end up layered over the season-care rescue sheet (I traced this in `js/ui.js`); give it a timeout and demote frequent early level-ups to a non-blocking banner. *(Claude)*
- **Selling is never taught.** Fern hoarded to a declining-cash slump because nothing says "go sell"; and dumping a big stack silently crashes the price (she learned by losing on 340 carrots). Add a "your barn is filling — visit Market" nudge and a pre-dump "sell in batches?" warning. *(Fern, Rex)*
- **Automation is discoverable too late.** June had the money for a sprinkler 13× over while bleeding crops and never saw the offer; put the "water your whole farm automatically" milestone in week one and offer the sprinkler *inside* the "died of thirst" toast. *(June, Milo, Fern)*
- **Features hide from the completionist.** Add a "buildings you don't own yet" checklist with costs + one-line why; show recipe throughput / craft-lane usage in building panels; teach the Feed Mill contextually after N cash-feeds; add a crop/recipe/animal Compendium with a completion tracker. *(Milo)*
- **Mobile/idle retention hooks are missing.** An opt-in push/email nudge ("your crops are thirsty 🥀") before the graveyard, a real welcome-back card ("while you were away: 12 died, 6 waiting, 3 orders expired" + one-tap "water everything"), a "vacation mode," and a re-surfaced one-tap backup-code reminder at the first big milestone. *(Fern, June)*
- **The mystery sunflower needs one introduction.** Fern got 58 silent "land is at peace" repeats and never learned what the (protective, auto-harvesting) Toni flower was; one explanatory toast on first spawn, then throttle the lock message. *(Fern)*

---

## What's genuinely great (keep this)

Every tester led with real affection for the game — the problems above are the exception in otherwise warm reviews:

- **Onboarding is best-in-class.** The goal chip's first six steps teach one verb at a time with an instant cash reward; testers completed several goals in the first day feeling like naturals.
- **The world is beautiful and performant.** Isometric "golden-hour" lighting, per-crop water/harvest FX, animal sprites, seasonal palettes, tomorrow's-forecast HUD — all zero-asset vanilla Canvas, and it *looks* professional (confirmed first-hand in screenshots).
- **Failure is real but the framing is kind** — batched crop-loss messages, named animals you get attached to, rush-order bonuses, and safety nets (odd jobs, sell-back, order decline) exist throughout.
- **The honest "everything's for sale" thesis** is stated up front and the game delivers on it — money genuinely is the only ladder.

---

## Consolidated fix list (priority order)

1. **Break the linear goal chain** — show closest 2–3 goals, credit out-of-order, add mid/late goals. *(P0, 4 testers)*
2. **Repair the order board** — cap asks to inventory, reserve toggle, highlight fillable, stop expiry spam. *(P0, 5 testers)*
3. **Telegraph out-of-season death** — tile tint + badge, buy-menu graying, plant-time confirm, loud season-flip warning. *(P0, 3 testers)*
4. **Tier and coalesce notifications** — priority levels, on-screen cap, digest for routine chatter, larger-text option. *(P0, 3 testers)*
5. **Give the economy an end-game** — prestige/second valley, $100k+ goal ladder, megaproject spend sinks. *(P1, 3 testers)*
6. **Make automation & fuel matter** — coverage/fuel scale with land, fuel-free tier, mega-barns, auto-toggles. *(P1, 3 testers)*
7. **Re-tune the difficulty promise** — event scaling with wealth, weather that costs dollars, Cozy drought/idle leniency. *(P1, 2 testers)*
8. **P2 polish** — splash auto-dismiss, teach selling, surface automation early, completionist checklists, retention nudges, introduce the sunflower.

*Appendix data (loss-by-cause, per-day trajectories, every captured toast) lives in `docs/playtest/data/*.json`; screenshots in `docs/playtest/review-shots/`; the harness in `tests/playtest-driver.js`.*
