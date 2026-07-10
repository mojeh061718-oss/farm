# Harvest Empire — Return-to-Play Plan (the "3.0" study)

**Date:** July 10, 2026
**Method:** 11-agent study — 7 persona playtesters (a Hay Day veteran, a 5-minute commuter, a
spreadsheet min-maxer, an idle-game regular, a Stardew purist, a 10-year-old profile, and a
relaxed retiree) each genuinely played 44–69 in-game days in a real browser and filed a
structured survey; 4 market analysts profiled Hay Day, FarmVille 2: Country Escape, Township,
Family Farm Adventure, Family Island, Klondike Adventures, Stardew Valley, Dinkum, Coral
Island, Fields of Mistria, and Sun Haven, with industry retention benchmarks.
(8 further personas were dismissed mid-queue at the owner's request; the 7 returned surveys
were already unanimous on every major finding.)

---

## 1. The verdict on difficulty: not too easy, not too hard — **aimed at the wrong target**

Survey vote: **6 of 7 said "wrong kind of difficulty," 1 said "too easy." Zero said "about
right" or "too hard."** This is the study's central finding and every other number hangs off it.

- **While you're playing, you cannot lose.** Multiple testers logged 44–61 attended days with
  *zero* crop deaths. The min-maxer on the hardest wallet ($1,500 Tycoon) called the game
  "solved" by day ~20-22: one regrow crop per season dominates everything, fertilizer + market
  timing makes money snowball unstoppably ($9.7k by day 7 → $189k by day 30 for the Hay Day
  vet). Failure states (wilt, rot, frost, crows) are all neutralized by cheap one-time
  purchases.
- **While you're away, you can't win.** A day is 84 real seconds, and the sim keeps running
  (capped at 4 real hours = **171 in-game days**). Every single tester's churn moment was the
  same moment: *coming back.* The retiree left a healthy farm overnight and returned to 26 dead
  crops and a modal that scolded "a farm needs its farmer!" The idle-fan's calendar jumped from
  Year 1 to Year 8 overnight. The commuter lost 67 strawberries to a season flip that happened
  while she was on the train.

**The one-line diagnosis: the game punishes absence and rewards presence — the exact opposite
of how every successful mobile farm game is built.** Hay Day's cardinal rule is that crops
*never* die; being away for a week costs nothing and coming back feels like opening presents.
Ours makes the return trip the scariest moment in the game — and return trips are the entire
business.

### Survey scores (avg of 7, scale 1–10)

| Metric | Avg | Reading |
|---|---|---|
| Fun | 6.4 | good first sessions, fades |
| Difficulty | 3.7 | too easy when present |
| Clarity | 8.1 | genuinely excellent |
| Depth | 5.3 | thinner than it looks |
| Session fit | 4.7 | the wall-clock coupling hurts every persona differently |

### Self-reported return likelihood (avg %, honest per-persona estimates)

| Day 1 | Day 7 | Day 30 |
|---|---|---|
| **74%** | **33%** | **9%** |

Industry simulation-genre benchmarks (AppsFlyer): D1 30%, D7 8.7%, D30 3.0%. Our *shape* is
the story: a first session far above genre norm (no paywalls + fast loop + polish genuinely
land), then a collapse — because there is no reason to return and a punishment waiting when
you do. We have a **great game with no retention layer**, which is the easiest problem in this
genre to have. The content is good; the calendar is empty.

Second unanimous finding: **the content cliff.** Economy solved by ~day 22, all 9 parcels and
all 18 goals finished by day 42–61 for every tester who stayed. After "Own the whole valley"
there is nothing to want — no events, no dailies, no collections, no prestige, no decorations.

---

## 2. How the competition beats us

| Lever | They do | We do |
|---|---|---|
| Appointments | Hay Day boat (18h), Derby (weekly), Township events (every 2–3 wks), FV2 prized-animal (18h) | none — nothing in the game is anchored to the real calendar |
| Daily ritual | ~95% of mobile games run daily rewards/tasks; streaks make players 2.3× likelier to return | none |
| Absence | Hay Day/FV2: **nothing dies, ever**; timers keep working for you offline | crops die, animals sadden, guilt modal |
| Progression axes | materials, essence, permit points, hearts, bundles — always a second earned-only track | money only |
| Orders | *the* session script: tiered channels (instant/hours/daily), escalating slots, chains | 3 small slots, mismatched to production, ignorable (and one goal hard-blocks on them) |
| Collections | shipping logs, museums, Perfection % — triples engaged playtime (Stardew: 52h → 147h) | none |
| Expression | decorations, town growth, visible world change | only utilitarian buildings; reputation is an invisible % |
| Events | year-round calendar, everything reruns ("nothing is missable") | none |
| Sync | cloud saves everywhere | local save + manual export codes |

Key strategic insight from the analysts: **all of the retention machinery above is fakeable
client-side with zero server.** Seed a PRNG with the ISO week number / calendar date and every
player worldwide sees the same weekly derby board, the same festival day, the same daily
tasks, the same traveling merchant — deterministic live-ops with no live-ops team. And because
we have no IAP, we can tune every timer for fun instead of for skip-selling — competitors
*can't* copy that without cannibalizing revenue. No-IAP is our moat, not just a virtue.

---

## 3. The plan

### Phase A — Fix the difficulty axis (stop the bleeding)

The single highest-leverage release. Everything else is wasted if returning players keep
finding corpses.

1. **Away-time rescale.** While away: 1 real hour ≈ 1 in-game day (instead of ~43), capped at
   2–3 days. Wilt/rot pause offline; season flips that happen while away hold their
   crop-wipe until the player returns and gets a one-tap "rescue harvest" window. Absence
   becomes a gift: crops finished, animals ready, drones banked — the Hay Day reopening.
2. **Welcome-back redesign.** One warm digest card, accurate accounting (the current one
   undercounts drone harvests and skips pure-loss returns), rescue actions inline, never
   guilt-language.
3. **In-session day to ~2 minutes, seasons to 8–10 days.** The 84s day makes "a day" a UI
   tick; a 2-min day keeps the fast empire feel while letting a season hold a real plan.
   (Also fixes "my crop went off-season mid-session".)
4. **Move difficulty into decisions.** Nerf the regrow-crop dominance (single-harvest crops
   +40–80% value), make the market crash multiplicative below the floor (kills the
   dump-exploit the min-maxer verified), weight order generation 70% toward what the player
   actually produces, buff animals/artisan chains (processed goods exempt from market crash),
   and scale order size/pay with farm scale so orders become the difficulty ramp.
5. **Trust: automatic save export.** Weekly auto-download of the farm code + a visible "last
   backup" indicator. (True cloud sync needs a backend — flagged as the only item on this
   plan that does; a free-tier KV store could carry it later.)

### Phase B — Reasons to return (the retention layer, all client-side)

6. **Daily tasks + streak.** 3 date-seeded tasks that expire at local midnight; 7-day
   escalating streak calendar (day 7 = premium seed pack).
7. **Market Day festival.** Every season's day 5 (deterministic): 2–3 special buyers pay
   +40–60% for specific goods. Weekly ritual, zero new art required.
8. **Weekly solo Derby.** ISO-week-seeded board of 9 farming tasks with reward tiers — same
   board for every player worldwide, bragging-rights screenshot at the end.
9. **The 18-hour boat.** A real-time contract (independent of sim days): a barge docks
   asking for 3 goods bundles; fill all crates for a bonus. The genre's most elegant
   appointment — slightly less than a day, so it drifts across your schedule.
10. **PWA push notifications, opt-in, player-caused only** ("your boat leaves in 2 hours",
    "construction finished") — never nagging.
11. **Monthly event crop + seasonal event zones.** October pumpkins, winter ice-fishing pond —
    date-seeded, and everything reruns next year: *nothing is ever missable.*

### Phase C — Depth and the post-valley game (kill the content cliff)

12. **Second progression axis: Permit Points.** Every action drips milestone progress;
    points spend on a visible-from-hour-one perk board (capability, not just cash).
13. **Collections.** Shipping log with silhouettes ("sell one of everything"), crop quality
    tiers, animal album, year-end farm evaluation, and a Perfection %. Cheapest long-arc
    depth possible — the content already exists.
14. **Order overhaul.** Escalating slots (3 → 9), untimed wishlist board alongside timed
    premium orders, sequential order chains, named NPC order-givers with two lines of
    dialogue and an occasional thank-you letter.
15. **Post-valley arc.** Prestige ("sell the valley" → new valley, permanent perks),
    decorations as an expression money-sink, discounted "overgrown" parcels cleared
    tile-by-tile, one multi-week construction megaproject.
16. **Visible world feedback.** Reputation levels visibly restore the town backdrop; secrets
    and 12 sealed letters unlocking at milestones (zero-budget curiosity retention).
17. **Real foley audio pack** (CC0 recorded sounds, still off by default) to replace the
    disliked synth entirely.

### Suggested release slicing

- **3.0 "The Return Update"** = Phase A + items 6–7. This alone addresses every churn moment
  in the study.
- **3.1 "The Calendar Update"** = items 8–11.
- **3.2 "The Forever Update"** = Phase C.

---

## 4. Bug backlog from the surveys

| # | Bug | Severity | Status |
|---|---|---|---|
| 1 | Game-freezing crash: negative ellipse radius in `shadow()` at dusk kills the rAF loop permanently | critical | **fixed + deployed** (loop is now crash-proof too) |
| 2 | Away summary undercounts (drone harvests missing; no summary at all on pure-loss returns) | high | Phase A #2 |
| 3 | Goal chain hard-blocks order-ignoring players ("Complete 2 orders" stuck day 15→57 for the kid persona) | high | make goals skippable/branching |
| 4 | Market-dump price floor exploit (unlimited profit at 0.55×) | high | Phase A #4 |
| 5 | Fresh-farm orders can spawn with 22–60s timers asking for crops a new player can't have | medium | order-gen fix |
| 6 | Buy-land confirm modal can't be dismissed by tapping the backdrop | medium | quick fix |
| 7 | Level-up modal stacks on top of open sheets, blocking them | medium | queue modals |
| 8 | Orders "Deliver" button renders enabled at 0/2 items | low | quick fix |
| 9 | Market badge pinned at "99+" from midgame, meaningless | low | quick fix |
| 10 | Plant tool silently remembers last seed with no indicator on the button | low | show armed seed |
| 11 | Toast pile-up on return (crow warnings + losses + season care all at once) | low | Phase A #2 digest |
| 12 | Esc doesn't close sheets on desktop | low | quick fix |
| 13 | Possible save rollback on abrupt browser kill (~4 min lost once, kid persona) | watch | likely fixed by crash fix; monitor |

---

## 5. What the testers loved (protect these)

- **No paywalls / no energy / everything buyable day one** — every persona, unprompted,
  called this the game's soul. It is the moat. Never compromise it.
- Clarity: seed sheet, warnings, one-tap economy ("a tiny masterpiece" — the retiree).
- The market with memory (price drift, hot items, dump-crash) — "deeper economics than Hay
  Day's fixed prices ever were" — the Hay Day veteran of 8 years.
- Named animals with moods; the automation fantasy (can → sprinklers → drones); the
  isometric art and seasonal repaints; save-on-hide durability.
