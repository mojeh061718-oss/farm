# Harvest Empire — Animation & VFX Direction Review
**Reviewer:** Animation & VFX Director (game feel / juice), premium mobile
**Scope:** motion, VFX, audio-visual feedback. Canvas 2D world + DOM UI, 60fps mid-tier phones, WebAudio-synth-only.
**Code reviewed:** `js/render.js` (all world animation), `js/game.js` (fx/sound dispatch), `js/ui.js` (input, synth, sheets), `css/style.css` (UI motion), `js/main.js` (loop). Screenshots 02/05/06/07/09/10 studied for context.

---

## 0. Verdict

The bones are genuinely good. The renderer is clean, deterministic, depth-sorted, and already has the right *hooks*: an fx event bus (`game.js:20` → `ui.js:1076-1078`), floating texts and bursts (`render.js:95-105`), per-tile hash randomness, and ambient life (butterflies, leaves, a pond duck). The art direction is cohesive and the ready-crop glow (`drawCrop`, render.js:326) shows someone was thinking about readability.

But **nothing in this game has ever been *tweened*.** Every motion is `Math.sin(time)` — an infinite hum with no beginning, no end, no accent. Sin-based motion is texture, not feedback. The core loop verbs (till/plant/water/harvest) all resolve **in zero frames**: state flips, a tile repaints in its new state, and at best 8 identical dots fly out. Plant — the verb players do a thousand times — has *no* feedback at all except a beep. There is no anticipation, no impact frame, no follow-through anywhere in the codebase. That's the entire gap between "functional" and "Hay Day." The good news: because the fx bus and renderer structure exist, ~80% of the juice below is additive, not surgery.

---

## 1. Game-feel audit — the core loop

### 1.1 TILL
**Today (code):** `Game.till()` (game.js:394-402) flips `t.k='grass'→'soil'` instantly; emits one `burst` (8 dots, `#7d5c3c`) and `SOUNDS.till` = one 160Hz triangle beep (ui.js:37). The soil tile pops fully-formed with furrows. Tractor tiers till a whole NxN in the same frame.
**Missing:** the *act* of tilling. No tool, no soil displacement, no transition between grass and soil. Multi-tile tilling reads as a texture glitch, not a machine pass.
**Juice spec:**
- **Anticipation (0-60ms):** a hoe-blade wedge sprite (2 polys, drawn like the scarecrow arms) appears above the tile, rotated -35°, scales in 0→1 `backOut`.
- **Impact (60ms):** blade strikes: tile does a 3px dip + `elasticOut` settle over 350ms (translate the whole tile draw, same trick as demo `ground.dip`); spawn **10 soil chunks** (dark `#5a4128` 2-4px squares w/ rotation, gravity 900, life 0.5s) + **4 dust puffs** (tan circles that expand 6→22px, alpha .5→0, rise 12px, 0.45s). One-frame `rgba(255,255,255,.25)` flash on the diamond.
- **Follow-through (60-380ms):** furrows draw on progressively — clip the furrow strokes in `drawSoil` (render.js:192-198) by a `tile.bornAt` age: each furrow line lerps its endpoint over 90ms, staggered 60ms apart (a "raked" reveal). Store `bornAt = state.now` when tilled; render-only, no save-format risk.
- **Multi-tile (tractor):** stagger each cell's chain by 40ms in a NE→SW sweep (order by `x+y`), so the tractor tier reads as a *pass* over the field, plus a single longer dust cloud trailing the sweep direction. Sound: one "diesel chug" (see §6) instead of N overlapping beeps.
- **Sound:** low thock — 90Hz triangle w/ pitch bend down + 60ms lowpassed noise burst (see §6). Current single beep is close in register; it needs the noise body.

### 1.2 PLANT
**Today (code):** `Game.plant()` (game.js:404-420) — **zero visual feedback**. No fx call at all. The sprout appears next repaint at `s<0.22` size. Sound: two soft sine beeps (ui.js:38). This is the most-repeated verb in the game and it is completely dry.
**Juice spec:**
- **Anticipation (0-70ms):** 3 seed pips (1.5px, crop's `def.color`) arc from ~20px above tile center down into the soil (simple parabola, 70ms) — the "hand toss."
- **Impact (70ms):** tiny soil puff (3 tan circles, 0.3s) where seeds land; furrow flash line.
- **Follow-through (70-350ms):** sprout **pops** in: scale 0→1.15→1 `backOut` 280ms, with a single 2px green fleck ejected upward. Then a 200ms `quadOut` settle of the sway phase so it doesn't jump into the ambient sin mid-cycle (initialize its sway phase to 0 and blend in).
- **Drag-planting:** keep per-tile chain but drop the seed-toss after 3 consecutive tiles in one drag (rate-limit anticipation, keep the pop) — preserves rhythm without noise.
- **Sound:** pentatonic pluck, pitch stepping up +1 scale degree per consecutive plant in a combo (resets after 800ms idle). This one change makes drag-planting *musical* — the single highest joy-per-line-of-code item in this review.

### 1.3 WATER
**Today (code):** `Game.water()` (game.js:422-431) sets `water=1`, emits one blue burst; soil darkens instantly via the `wet` ternary in `drawSoil` (render.js:179-184). Sound: two sine beeps.
**Missing:** water is a *pour*, not a pop. Nothing falls, nothing soaks.
**Juice spec:**
- **Anticipation (0-80ms):** a small watering-can silhouette tips in above the tile (rotate -0→-40° `quadOut`) — or skip the can and lead with droplets on mobile.
- **Impact (80-400ms):** **12 droplets** (1.5-2.5px, `#7ec3ea`, slight streak: draw as 2px line along velocity) fall from ~28px above in a fan, staggered over 250ms; each spawns a **1-frame splash tick** (two 3px diverging lines) + a fading darker splat ellipse on the soil where it lands.
- **Follow-through (0.4-1.2s):** soil wetness should be a **lerped value, not a boolean render** — add `tile.wetVis += (target - wetVis) * dt * 4` and drive the two soil colors through it; the dark soak spreading over ~600ms is the payoff. Then 2-3 tiny sparkle glints (white 1px, 200ms) on the wet surface. Crop does a happy 6% scale pulse (`backOut`, 250ms) — "the plant drinks."
- **Area watering (upgraded can):** stagger cells 50ms outward from tap point (ring order), one shared sound.
- **Sound:** filtered-noise "pour" 300ms (bandpass ~1.2kHz sweeping down) + 2 sine droplet plinks (randomized 700-900Hz). Current beeps read as UI, not water.

### 1.4 GROW (the passive verb — currently continuous, should be theatrical)
**Today (code):** `c.prog` accrues continuously (game.js:1035-1043); `drawCrop` scales the template continuously `k = 0.5 + 0.6*min(1, s/0.95)` (render.js:342) with a sprout swap at `s<0.22`. Mature = sin bounce (line 319) + radial glow (line 326) + water-drop need icon blinking via `sin(time*5)` (line 361).
**Critique:** continuous scaling means growth is *never witnessed* — it's too slow to see, so the field feels like a progress bar. Stardew/Hay Day quantize growth precisely so that returning to the farm shows visible **steps**, and stepping *is an event* you can juice.
**Juice spec:**
- **Quantize to 4 visual stages** (sprout / young / full / mature) derived from `prog` in the renderer only: `stage = prog>=1?3 : prog>0.66?2 : prog>0.33?1 : 0`. Between stages hold scale constant.
- **Stage pop:** when the renderer sees stage increase (keep `lastStage` in a render-side Map keyed by tile, like `animalAnim`), tween scale from `oldK`→`newK*1.12`→`newK` `backOut` 350ms + emit **3 green flecks** + a 1-frame leaf-colored glint. Cheap, and suddenly the field *lives in steps*.
- **Maturity moment (stage 3):** bigger beat — 400ms `elasticOut` scale-in of the fruit/head elements, glow fades IN over 300ms (currently it hard-pops when `s>=1`), one soft chime. The mature sin-bounce (line 319) stays, but give each crop a hash-based phase so a ripe field shimmers instead of metronoming (`time*3 + x` already varies by x — add `y*2.3` and a hash-based frequency ±15%).
- **Regrow crops** (game.js:463-467 resets `prog=0`): after harvest, the plant should visibly *snap back* to stage 1, not vanish-and-restart — tween down to young scale over 250ms.

### 1.5 HARVEST — the money shot
**Today (code):** `Game.harvest()` (game.js:452-477): crop nulled instantly; one float text `+1 🍅` rising 32px/s for 1.3s (render.js:1124-1139) + one 8-dot burst in `def.color`; two triangle beeps (ui.js:40). The item teleports into a number in a sheet you're not looking at. No inventory destination exists on screen.
**Missing:** everything between "crop exists" and "number went up."
**Full juice spec (this is the flagship — see the working demo, §10):**

| t (ms) | Beat | Spec |
|---|---|---|
| 0 | **Anticipation** | crop squash: `sy 1→0.70, sx 1→1.22`, 80ms `quadOut`. (Squash = your hand grabbing it.) |
| 80 | **Impact** | 1-frame white flash on crop (composite `source-atop`); crop pops to 1.28 `backOut` 90ms then scales out; **14 particles**: 8 leaf flecks (rotating ellipses, leaf color) + 6 fruit chunks (crop color w/ white glint dot), speeds 120-270px/s, gravity 900, spin, life 0.55-0.85s; **soil puff** 6 tan smoke circles expanding+rising; **ground shockwave** ellipse ring 6→46px fading 240ms; tile dips 3.5px, `elasticOut` settle 500ms. Sound: **thock** (noise burst + 120→70Hz triangle). |
| 140 | **Follow-through** | item sprite (drawn, not emoji — reuse the crop template's fruit) launches on a quadratic bezier from tile → HUD inventory/market button, 480ms `quadIn` (slow lift, fast landing), scaling 1→0.55, spinning ~2.5rad, with a 10-sample additive amber trail. The `+N` float rides the first 150ms then releases. |
| 620 | **Arrival** | market/inventory badge (`#market-badge`, ui.js:95-96) squash-pops 1→1.28→1 `backOut` 190ms; counter ticks; **coin glint**: 4-point star sparkle rotating 0→1.6rad fading 500ms; sound: pentatonic **chime** (2 partials, +1 combo step per consecutive harvest, same combo system as plant). |
| — | **Double harvest** (`harvestYield` game.js:446-450) | when `n=2`: double particle count, gold-tinted flash, two fliers 80ms apart, float text already goes `#ffe082` (game.js:472 — keep) + add a ½-scale second chime a fifth up. Fertilized doubles are the game's slot-machine moment; currently indistinguishable except text color. |

- **Fliers to a real destination:** convert last-40px of the arc to screen-space so it lands on the DOM button even while the camera moves (project once at launch, re-aim each frame — cheap).
- **Drone harvest** (game.js:660-676) currently harvests `silent=true` + one toast. Give the drone a **flight**: it already hovers (render.js:729); tween it tile-to-tile along its 5×5 route over ~1.5s at dawn, mini-burst per tile, then return to pad. Even a fake 4-stop tour sells the fantasy of the $7,500 purchase.

---

## 2. Tween/easing micro-framework spec

The renderer's only time primitive is `time += dt` + `Math.sin`. You cannot do anticipation/overshoot/settle with sin. Add this once (≈40 lines), then everything in this report is expressible:

```js
/* tween.js — drop into render.js IIFE or its own file */
const Ease = {
  linear:   t => t,
  quadIn:   t => t*t,
  quadOut:  t => t*(2-t),
  cubicOut: t => 1 - (1-t)**3,
  backOut:  t => { const c=1.70158, u=t-1; return 1+(c+1)*u*u*u+c*u*u; },
  elasticOut: t => t===0||t===1 ? t
    : 2**(-10*t) * Math.sin((t-0.075)*(2*Math.PI)/0.3) + 1,
};
const Tween = (() => {
  const active = [];
  function to(obj, props, dur, ease = Ease.quadOut, onComplete, delay = 0) {
    const tw = { obj, dur, ease, onComplete, t: -delay, from: {}, to: props };
    for (const k in props) tw.from[k] = obj[k];
    active.push(tw);
    return tw;
  }
  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const tw = active[i];
      if ((tw.t += dt) < 0) continue;
      const p = Math.min(1, tw.t / tw.dur), e = tw.ease(p);
      for (const k in tw.to) tw.obj[k] = tw.from[k] + (tw.to[k]-tw.from[k]) * e;
      if (p >= 1) { active.splice(i, 1); tw.onComplete?.(); }
    }
  }
  const kill = obj => { for (let i=active.length-1;i>=0;i--) if (active[i].obj===obj) active.splice(i,1); };
  return { to, update, kill, get count() { return active.length; } };
})();
```

Call `Tween.update(dt)` first thing in `Renderer.render()` (render.js:1164). Rules: tween **plain fx-state objects**, never game state; `kill()` before re-tweening the same object; delayed tweens capture `from` at creation (fine for fx). This is the standard 6-ease set — resist adding more; consistency of easing is a style.

**Adoption map (existing animations → tween):**

| Current (render.js) | Now | Becomes |
|---|---|---|
| crop appear/stage (line 342) | continuous scale | stage-pop `backOut` (§1.4) |
| ready badge bob (765) | endless `sin(time*4)` | pop in `backOut` 300ms when `ready` flips 0→1, then gentle sin; pop OUT `quadIn` 150ms on collect |
| floats (1124) | linear rise, linear fade | rise `cubicOut` (fast then hang), pop-in scale 0.6→1 `backOut` first 120ms |
| bursts (1112) | fixed 0.6s, uniform dots | keep sim, add per-particle `life`, rotation, shape variants (§1.5) |
| ghost placement (1143) | static alpha 0.65 | breathing alpha .55↔.75 sin is fine, but **snap-to-tile** should lerp `quadOut` so the ghost glides between candidate tiles |
| camera (`centerOn`, 35) | teleports | `Tween.to(cam, {x,y}, 0.6, cubicOut)` — used by level-up focus, goal pings, order fulfill |
| day/night bands (1077) | piecewise linear ramps | fine as-is (slow ambient); don't tween |
| animal wander (963) | `+= (t-x)*0.02` per frame | frame-rate-dependent — replace with dt-correct `1-exp(-dt*k)` or tweened hops (§3.1). NB `anim.timer -= 1/60` (line 957) is wrong on 120Hz screens: timers drain 2× fast |
| sheet close (ui.js:122) | instant `hidden` | CSS: add `.closing` class, `slide-down 0.18s quadIn`, remove after `animationend`. Asymmetric in/out (bouncy in, quick out) is correct feel |
| XP bar (`#xpfill`, css:105) | `width .3s` | on xp gain: also pulse the level badge scale 1.15 `backOut`; on fill-to-100%, flash white before reset |

---

## 3. Living-world program

### 3.1 Animal behavior states
`animalEntities()` (render.js:943-992) is one state: drift toward a random point at 2%/frame, constant bob, constant leg-swing even when standing. Animals never *do* anything.
**Spec — a 5-state micro-FSM stored in the existing `animalAnim` map (render-only, no save impact):**
- **idle** (1-3s): stand, no leg swing, occasional head-turn (flip with 10% chance/s).
- **walk** (to new target): tween position with small **hops** for chickens/ducks (y-offset parabola 3px per 0.25s hop) vs smooth amble for cows/sheep; legs animate only in this state (pass a `moving` flag into `drawAnimalSprite` and gate the `legs()` swing, render.js:827).
- **peck/graze** (2-4s): head dips — draw head 3px lower with 2Hz bob; chickens spawn a 1px soil fleck per peck; cows get a slow 0.5Hz munch. 60% of idle exits go here — this single state is most of the "alive" feeling.
- **sleep** (night only, `state.t` in night band): sit (squash body 15%, hide legs), "z" float every 3s. Sick animals (`a.sick`, line 971) should use this pose too instead of just a green bubble.
- **flee-from-tap:** on tap within 1.5 tiles (hook `smartAction` → emit `fx('startle', x, y)`): startled **hop** — 8px vertical parabola 200ms + 2-3 feather/dust flecks + run (walk at 3× speed, hop rate doubled) away for 1.2s, then resume. Pair with a squawk blip (2 fast descending square beeps). Petting-by-tap that yields a heart particle + happiness is the Hay Day move; the startle is the comedy version and needs no design change.

### 3.2 Crop growth pops — covered in §1.4 (quantized stages + backOut pops).

### 3.3 Building activity loops
Buildings (`drawBarnLike`, render.js:575) are 100% static — only the ready badge bobs. Buildings with an active `queue` (bakery/creamery/press/loom/mill, game.js:795-830) should *visibly work*:
- **Chimney smoke while processing:** add a small chimney stub to `drawBarnLike` for bakery/creamery; when `b.queue.some(j => now < j.done)`, spawn 1 smoke puff per 700ms (rising, expanding, alpha .4→0, wind-drifted by weather). Budget: ≤4 puffs alive per building.
- **Feed Mill:** a 4-blade rotor on the roof gable, `rotation += dt * (working ? 1.2 : 0.15)` — idle slow-turn sells wind; work speed sells activity.
- **Bakery/creamery window glow:** the window quad (render.js:588-591) gets a warm `rgba(255,190,90,α)` overlay, α pulsing 0.15↔0.35 at 0.5Hz while working, and **always on at night** (currently windows are identical at midnight — the night screenshot (09) reads as abandoned; lit windows is the cheapest "cozy" in the genre).
- **Completion beat:** when a job finishes, the ready badge (render.js:759-775) should **pop in** `backOut` + 4 gold flecks, and the chimney emits one double-size puff. Sound: soft oven-ding (single 1568Hz sine + noise tick).

### 3.4 NPC-less life
- **Delivery cart at dawn:** at `state.t` crossing 0.02, a 2-frame cart (box + 2 rotating wheel circles + a hitch bob) rolls along the map's south road edge (fixed path in tile coords, ~8s traverse), pauses 1s near the farm gate, drops a puff, rolls off. If an order was fulfilled the previous day, the cart is loaded (crates drawn on top). Pure renderer theater, keyed off `state.t` — zero game-state.
- **Birds:** 2-3 birds land on fences/idle grass (pick from `drawFence` post positions): glide in on a bezier 700ms, hop twice, peck, and **scatter** when the camera pans fast or a tap lands within 2 tiles (launch on `quadIn` up-and-away + 2 feather flecks). Reuse the butterfly draw with a darker palette.
- **Pond life:** the duck (render.js:227) circles on rails forever; give it the same FSM (paddle/dabble — flip upside down 500ms — drift), plus expanding ripple rings behind it while paddling.
- **Fireflies at dusk** (summer): 6-10 warm dots with sin-drift + slow alpha blink inside the dusk band only (`dusk > 0`, render.js:1080-1087). Screenshot 08's dusk tint is lovely and empty.

---

## 4. Weather & seasonal VFX upgrade

Current weather (render.js:1026-1075) is honest but flat: 70 screen-space rain streaks, 50 snow dots, 3 cloud shadow ellipses, storm = darker + whole-screen white flash every 6s (`(time % 6) < 0.14`, line 1054), drought = orange wash. Everything is screen-space; nothing touches the *world*.

- **Rain splashes + wet sheen:** each frame, pick ~6 random visible tiles and spawn a 2-frame splash tick (small white chevron + fading ring) at a hash-jittered point — in **world space**, so rain lands *on the farm*, not on the camera. Roofs: 1 splash/s per visible building roof quad + a subtle white specular line along the roof ridge while raining. Soil already darkens when wet (drawSoil) — extend the `wetVis` lerp (§1.3) globally during rain so the whole field soaks over ~10s and dries over ~60s after. Puddle glints on grass: 3-4 tiles get a light-blue ellipse at 0.15 alpha, fading post-rain.
- **Storm — lightning that strikes something:** replace the flat flash with a 3-beat: (1) pick a real target tile (a tree via `hash<0.38` from `drawDecorTile`, or the tallest building on screen); (2) darken 80ms, then draw a 2-segment jagged **bolt polyline** from sky to the target with 6px glow pass + white core, 2 frames; (3) local radial flash at the strike + 8 spark particles + screen flash at 0.2 alpha *one frame only*, thunder = lowpassed noise rumble 1.2s delayed 300-800ms by "distance." Storms already destroy crops (`middayEvents`, game.js:940-949) with *no visual* — route the destruction fx to those exact tiles: bolt strikes → crop blackens → the existing dead-crop draw. Suddenly scarecrows visibly earn their keep. **Gust waves:** crop sway (render.js:316) gets a storm term: `sway += sin(time*3 - (x+y)*0.6) * 0.22` — the phase offset by `(x+y)` makes wind **travel across the field diagonally** in waves. Trees get the same with 2× amplitude. This one line is the biggest weather upgrade per character typed.
- **Snow accumulation + footprints:** during snow, lerp a per-tile `snowVis` 0→1 over ~2 min; blend grass toward the winter palette *locally* and draw white caps on fence rails, roof tops (a lighter quad inset on the roof faces), and crop leaves. Animal walk states stamp fading footprint ellipses (max 30 alive, 20s fade). Winter screenshot (05) currently reads as "gray palette swap" — accumulation makes it *weather*.
- **Heatwave shimmer:** during `drought`, add 2-3 slow sin-warped horizontal translucent bands (drawn as 1px `rgba(255,255,255,.03)` strips offset by `sin(y*0.05+time*2)*3`) over the lower half + occasional dust devil (5 rotating tan flecks crossing the field). Keep the orange wash but pulse it 0.06↔0.10.
- **Dawn god-rays:** for `state.t < 0.06`, 3-4 wide translucent warm wedges from the top-left screen corner (additive `rgba(255,220,150,.05)`), slowly rotating ±2°, fading out as t rises. Pairs with the delivery cart (§3.4) for a "morning arrival" moment — mobile farmers open the app in the morning; greet them.
- **Season transition moment:** `newDay` season flip currently = a toast (game.js:911). Spec: 2.5s takeover — screen-space burst of ~40 season-emblem particles (spring: petals; summer: pollen glints; fall: leaves — reuse `drawAmbient` leaf draw; winter: flakes) sweeping diagonally, while the palette **crossfades** (lerp `PALETTES[old]→PALETTES[new]` over 2s instead of the hard swap at render.js:1169 — precompute per-frame with `shade`-style channel lerp) + one banner float "🍂 Fall has arrived." The hard palette cut is currently the single most jarring frame in the game.
- **Weather transitions in general:** weather flips at day boundaries with no blend. Add a global `weatherBlend` 0→1 over 3s; scale rain-line count, cloud alpha, snow count by it.

---

## 5. Celebration moments

- **Goal complete** (game.js:895-896: toast + 3-beep): the goal chip (`#goal-chip`) should stamp — scale 1→1.3→1 `backOut`, gold ring wipe around it, **check-mark draw-on** (stroke-dashoffset 200ms), 8 gold flecks, then chip slides out and the next goal slides in 250ms later. Camera does a 200ms 1.02× zoom kiss (world-space, tween `cam.z`). Reward coins fly as 3-5 coin sprites arcing to the HUD coin pill → pill pop + count-up ticker (count numbers up over 400ms, not instant set at ui.js:72).
- **Level-up** (CSS `#levelup`, style.css:506-526 — fade backdrop + pop-in card + wiggling star emoji): keep the card but precede it with a world beat: radial gold shockwave from farm center (screen-space ring, 500ms), 20-particle confetti burst behind the card (DOM spans with random `translate/rotate` keyframes), card in with `backOut` 350ms (already close: `cubic-bezier(.2,.9,.3,1.4)` — good), and the star should **burst in** (scale 0→1 elastic) not just wiggle (`spin-star` loop reads as idle, not event). Auto-dismiss (2.6s timeout, ui.js:1026) should slide the card *up and out* rather than hard-hide.
- **Order delivered** (game.js:353-365: toast + coin beep): goods should *leave*. Spec: order card in the sheet does a stamp ("DELIVERED" rotated -12°, `backOut` in), then the sheet-local goods icons fly *down* off-card; on the farm, the §3.4 cart rolls away along the south road with crates. Coins arc to HUD as in goal-complete. Sound: coin family + a short whistle (two-note slide).
- **Parcel purchase** (game.js:632-641: instant `drawParcels` flip + build beep): **the fence builds itself post-by-post** — on unlock store `unlockAnim = {parcel: i, t: 0}`; `drawFence` (render.js:251-272) already iterates posts/rails in order, so clip: post k appears when `t > k*0.06` with a scale-in `backOut` + a dust tick; rails draw-on between placed posts (lerp endpoint); total ~1.5s for a 6-post edge, camera pans to the parcel first (`Tween.to(cam, …)`). Finish with the FOR SALE sign **falling over** (rotate 90° `quadIn` + dust puff) instead of vanishing. Sound: a little hammer triplet per post (woodblock = short triangle + noise tick, randomized ±20 cents).
- **Building placement** (game.js:597-601: instant): building drops from 24px above at `quadIn` 180ms → **impact**: dust ring (8 tan puffs outward), 4px settle-bounce `elasticOut` 450ms (translate the whole building draw via a per-building `dropOff` fx value), ghost outline flashes white 1 frame. The ghost → real transition currently just swaps alpha; the drop makes placement *decisive*. Sound: thock + short rising confirm pluck.

---

## 6. Audio direction (WebAudio synth only)

The `beep()` synth (ui.js:18-34) is one bare oscillator + exponential decay — every sound is the same *shape*, so the game sounds like a 1978 calculator. You don't need samples; you need **three shapes and one scale**:

1. **One key, one scale.** Put every pitched sound in **C-major pentatonic** (C-D-E-G-A). Current set is nearly random Hz values (500/420/560/660/880/990/1320…). Snap them: tap=E5, plant=D5→A5, water=G4-family, harvest=E5+G5, coin=C6+E6, goal=C5-E5-G5, levelup=C5-E5-G5-C6 (already is — good instinct). Once everything shares a scale, overlapping sounds *harmonize* instead of clashing.
2. **Three voice families:**
   - **Pluck** (UI/positive): triangle osc + fast decay + a quieter sine an octave up (adds "string"). Add ±15 cents random detune per play so repetition doesn't fatigue.
   - **Thock** (physical: till, harvest impact, build, place): 60-90ms **lowpassed noise burst** (create a noise buffer once, reuse) + a low triangle with downward pitch bend (120→70Hz). The demo implements this (`SFX.thock`, harvest-demo.html) — it transforms impact feel more than any particle.
   - **Chime** (reward: harvest arrival, coin, goal): 2-3 sine partials (f, 1.5f, 2f) with long tails (0.2-0.4s) and staggered onsets 40-60ms.
3. **Combo pitch laddering:** consecutive harvests/plants within 800ms step the root up the pentatonic scale (cap +5, reset on idle). This is the Hay Day/Candy Crush trick and costs ~6 lines around `SOUNDS.harvest`.
4. **Weather ambience loops (noise synthesis):** one looping noise source through a biquad per weather: rain = bandpass ~1.5kHz at low gain (+ random droplet plinks every 0.5-2s); storm = add slow gain LFO + the thunder rumbles (§4); wind/heatwave = lowpass ~400Hz with 0.1Hz gain wobble; snow = *near silence* (duck all ambience — silence reads as snow). Crossfade gains 2s on weather change. One reverb-free trick: a short feedback-delay (80ms, 0.25 feedback) on the master gives everything shared space for free.
5. **Mix discipline:** master `GainNode` + simple `DynamicsCompressorNode` at the destination; route everything through it (also gives you one mute point instead of the per-beep settings check). Cap simultaneous voices ~8; drop the oldest.

---

## 7. Performance guardrails (60fps mid-tier, DPR ≤2.5)

- **Particle budgets:** hard-cap the shared pools — world particles 150, screen-space (weather extras, confetti) 200, smoke puffs 24, floats 12. On spawn over cap, kill oldest. Pool objects (pre-allocated array + freelist) — `bursts.splice` (render.js:1115) churns GC at harvest-spam rates; with 14-particle harvests and drag-harvest this becomes measurable.
- **LOD by zoom (`cam.z`, clamped 0.35-2.0 at render.js:85):** below z<0.55: skip splash ticks, stage-pop flecks, footprints, fireflies, drone rotor detail, per-crop glow gradient (`createRadialGradient` per ripe crop *per frame* at render.js:327 is the current worst offender on a ripe field — cache one glow sprite to an offscreen canvas and `drawImage` it always, at any zoom). Below z<0.45: skip crop sway/bounce transforms entirely (save/rotate/restore per crop adds up; a full field is real money).
- **Viewport culling:** the ground pass draws all 20×15 tiles and every entity regardless of visibility (render.js:1178-1197). Compute visible tile bounds from `screenToTile` of the 4 screen corners and clamp both loops. Free 30-50% at high zoom.
- **Offscreen static layer:** ground + fences + parcel overlays change rarely (till/unlock/season/wetness). Render them to an offscreen canvas, redraw only on dirty flag; per-frame cost becomes one `drawImage`. This is the big bet that pays for every effect above.
- **Weather scaling:** rain 70 lines / snow 50 dots are fine; scale counts by `min(1, vw*vh / (390*844))` so tablets don't triple-fill, and by `weatherBlend` (§4).
- **Frame-rate correctness:** fix `anim.timer -= 1/60` (render.js:957) and the `*0.02` lerps (963-964) to dt-based *before* shipping on 120Hz devices — animation speed currently doubles there.
- **Kill-switch:** one `fxLevel` setting (auto-detect: if avg frame >20ms over 5s, drop a level) — level 0 = current game, so the floor is never worse than today.

---

## 8. Top 10 prioritized recommendations

**Quick wins (a day each, huge feel delta)**
1. **Ship the tween manager** (§2) into `render.js` and route `addBurst` particles through per-particle life/rotation/shape. Everything else depends on it. (`Tween.update` at top of `render()`, render.js:1164.)
2. **Harvest juice chain v1** (§1.5): squash→pop→14 mixed particles→tile dip→flier to `#market-badge`→badge pop. Hook: new `fx('harvest',…)` kind in `game.js:472` and handler in `ui.js:1076`. The demo (§10) is the reference implementation.
3. **Plant feedback + pentatonic combo ladder** (§1.2, §6.3): sprout `backOut` pop + seed toss + pitch-stepping pluck in `SOUNDS.plant`/`SOUNDS.harvest` (ui.js:38-40). Cheapest dopamine in the review.
4. **Storm gust wave + real lightning strike** (§4): one added term in the sway expression (render.js:316) + bolt-to-tile replacing the flat flash (render.js:1051-1057), targeting the tiles `middayEvents` actually destroys (game.js:940-949).
5. **Thock/pluck/chime synth voices + pentatonic retune** of the existing `SOUNDS` table (§6) — no new events needed.

**Medium (2-4 days)**
6. **Quantized crop stage-pops + maturity moment** (§1.4): render-side `lastStage` map, `backOut` pops, glow fade-in — kills the "progress bar field" problem and makes every return-to-app show visible change.
7. **Animal FSM** (§3.1): idle/walk/peck/sleep/flee in `animalEntities` (render.js:943), legs gated by movement, startle-hop on tap. Also fixes the dt bugs (render.js:957/963).
8. **Celebration pass** (§5): parcel fence-builds-itself (clip `drawFence` by unlock age), building drop+settle, goal-complete coin flight + HUD count-up ticker (ui.js:72).

**Big bets (a week+, do after the above)**
9. **World-space weather program** (§4): splashes, wet/snow accumulation lerps, palette crossfade + season-transition moment, dawn god-rays + delivery cart (§3.4). This is what screenshots/app-store videos are made of.
10. **Performance foundation** (§7): offscreen static ground layer, viewport culling, particle pooling, cached glow sprite, `fxLevel` autoscaler — the budget that lets items 1-9 run on a mid-tier phone.

---

## 10. Flagship demo (built & captured)

A standalone, dependency-free implementation of the §1.5 harvest chain at target quality — running on the exact tween manager from §2 and the §6 synth voices (thock/pluck/chime):

- **Demo:** `/tmp/claude-0/-home-user-farm/4086709d-47c7-5820-b52d-89a03f570766/scratchpad/artreview/out/animation/harvest-demo.html` (tap the tomato; also auto-loops every 3.2s)
- **Captured frames:**
  - impact + 14-particle burst + shockwave: `.../out/animation/demo-frame-impact.png`
  - flier trail arcing into the inventory chip: `.../out/animation/demo-frame-arc.png`
  - chip squash-pop + glint + regrow sprout: `.../out/animation/demo-frame-arrival.png`

The whole demo's motion code is ~200 lines, of which the reusable framework is 40 — evidence that the full program above fits comfortably in this codebase's style and budget.
