# Harvest Empire — Graphics Excellence Report

*Findings and unified roadmap from a five-consultant game-studio art review: Art Director,
Environment & Prop Artist, Technical Artist, UI/UX Visual Designer, and Animation & VFX
Director. Each consultant examined the live game, its full rendering source, and a standard
15-screenshot pack (all seasons, weather, day/night, close-up/far zoom, all UI panels). Four of
the five built working visual prototypes proving their recommendations in our exact engine.
Full individual reports are archived in `docs/artreview/`.*

---

## 1. Executive summary

**Scores today:** world rendering **4.5/10**, UI **5.5/10** (vs. Hay Day / Township / FarmVille 2
production quality). Every consultant independently reached the same two conclusions:

1. **The bones are genuinely professional.** Correct isometric projection, proper depth
   sorting, deterministic world generation, a coherent warm palette, a real UI component
   system. Nobody recommended starting over; everybody recommended *finishing* it.

2. **One architectural decision is holding back both beauty and speed.** The renderer
   re-draws every tree, building, crop and grass speckle from ~2,000 vector path operations
   *every frame*. Measured on a mid-tier-phone proxy: **~15 fps**. Because every detail costs
   forever, the art stays minimal. The fix — **bake each asset once into cached sprites, then
   stamp them** — simultaneously returns 60 fps with headroom *and* makes rich art nearly free
   (a barn drawn with 120 operations instead of 30 costs nothing at runtime once baked).

3. **The signature look is within reach, procedurally.** The Art Director's prescription —
   **"Golden Hour Storybook"** (a sunlit miniature diorama: high-key saturated color, one warm
   sun, cool violet shadows, cream rim light) — was demonstrated in a side-by-side mock using
   the same engine capabilities. The single biggest emotional upgrade across all five reports:
   **make night beautiful** (glowing windows, lamp pools, fireflies) — today night is the
   game's worst screenshot; in genre leaders it's the marketing shot.

**Verdict on switching engines (Phaser/WebGL/Pixi):** *don't — yet.* The Technical Artist's
rubric: Canvas 2D with sprite baking + a lightmap gets ~90% of the visual ceiling for ~15% of
the cost (a 3–5 week rewrite just to reach parity in Pixi vs. ~1 week for baking+lighting).
The baking pipeline is also the on-ramp if we ever do migrate.

---

## 2. The panel and their proof

| Consultant | Verdict | Prototype delivered |
|---|---|---|
| **Art Director** | 4.5/10 — "tasteful programmer art; the world hasn't been *lit* yet" | `style-mock.png` — same tile cluster, current style vs. Golden Hour Storybook, side by side |
| **Environment Artist** | "A blockout, not a place — the gap is edges, occlusion, and storytelling clutter" | `proto-barn.png` — plank-and-shingle barn, stone foundation, glowing window, worn path, props, at target quality in our exact iso math |
| **Technical Artist** | "Change *when work happens*, not engines" — measured ~15fps on mid-tier proxy; bake-and-blit returns 60fps + rich art | `proto-before.png` / `proto-after.png` — working bake + lightmap night scene with warm windows, lamp pools, colored shadows, grain (22ms one-time bake) |
| **UI Designer** | 5.5/10 — "strong bones; emoji icons, phantom fonts, and flat text prices cap the quality" | `mockup-shop.png` — redesigned shop with 22 hand-drawn SVG icons, token system, gold price-chip buttons |
| **Animation Director** | "Nothing in this game has ever been *tweened* — every verb resolves in zero frames" | `harvest-demo.html` + frames — the full harvest juice chain (squash → burst → flier to wallet → tick-up) running on a 40-line tween engine |

---

## 3. Consensus findings (flagged independently by 3+ consultants)

1. **Night/dusk is the biggest missed opportunity.** No light source exists in the world;
   dusk is a 13%-alpha wash. Fix: lightmap pass + emissive windows/lamps + long warm shadows.
2. **The checkerboard grass must die.** The `(x+y)%2` tile alternation reads as dev-grid in
   every season and becomes bathroom tile in winter.
3. **One sun, colored shadows.** All shadows today are identical gray ellipses with no
   direction. A single global light vector driving skewed violet shadows + lit/shade faces is
   the "miniature diorama" switch.
4. **Bake static art to sprites.** Flagged by tech-art (for speed), environment (for detail
   density), and art direction (for asset variants). The unlock for everything else.
5. **Replace OS emoji with owned iconography** (UI + world plates) — per-platform emoji caps
   perceived quality and brand.
6. **Seasons should transform the world, not just recolor grass** — snow should accumulate on
   roofs/fences/beds, fall should be crimson/amber, spring/summer are currently identical.
7. **Feedback is missing from the core loop** — plant (the most-repeated verb) has zero visual
   feedback; harvest teleports items into an invisible inventory.

---

## 4. Unified roadmap

Ordered so each phase pays for the next. Estimates assume one focused engineer.

### Phase 0 — Performance hygiene *(hours; do immediately)*
- Kill per-frame gradient allocations (vignette, ripe-crop glow → cached sprites)
- Viewport culling (currently all 300 tiles + all entities draw at every zoom)
- Pool entity records & particles (removes GC hitches measured at 240–300ms spikes)
- Cap DPR at 2.0; half-resolution weather/light layers
- **Outcome: stable 60fps on mid-tier phones before any art changes**

### Phase 1 — Light the world *(~1 week: the 4.5 → 6.5 jump)*
- HSL color ramps replace RGB-multiply shading (shadows go cool+saturated, highlights warm)
- Re-keyed four-season palettes (spring ≠ summer; fall amber not khaki; winter with warm pops)
- Global sun struct: lit/shade faces by time of day, skewed **colored directional shadows**,
  contact shadows under crops
- De-grid the ground: smoothed-noise meadow variation, clustered tufts, macro patches
- Sky/horizon backdrop + diorama edge (soil cliff + treeline) — no more flat void
- Dusk gradient + lengthened shadows; night lightmap with glowing windows, lamp posts,
  fireflies

### Phase 2 — Craft the world *(~2 weeks)*
- **Sprite atlas cache** (bake per asset × variant × season × LOD; invalidate on season change)
- Building material pass: stone foundations, plank/siding walls, shingled roofs with ridge
  caps + eave shadows, recessed doors, framed windows, chimneys (smoke while processing),
  per-building silhouettes + prop dressing (hay bales, churns, sacks, crates)
- Soil bed rebuild: lit/shadow lips, ridged furrows, real moisture sheen, mulch, row shadows
- Pond rebuild (organic banks, depth gradient, reeds, lilies) + worn path network between
  buildings + first prop wave (lamp posts, mailbox, laundry line, log pile, troughs)
- 3 tree variants with true seasonal states; locked parcels become "wild land with survey
  rope" instead of gray police-tape overlay

### Phase 3 — Make it feel alive *(~1 week)*
- Ship the 40-line tween engine; adopt it everywhere sin() is faking motion
- Full juice chain per verb (the harvest chain from the working demo is the reference:
  squash → flash → 14-particle burst → tile dip → item flies to the wallet → badge pop →
  counter tick-up)
- Quantized crop growth stages with "pop" moments; animal behavior states (peck, graze,
  sleep, startle-hop)
- Celebrations: fence builds itself post-by-post on land purchase, building drop+settle,
  goal-complete coin flight, season-transition petal/leaf storm with palette crossfade
- Weather set-pieces: rain splashes + wet sheen + reflections, snow accumulation + footprints,
  lightning that visibly strikes the crops storms destroy, gust waves rolling across fields
- Audio: three synth voice families (pluck/thock/chime) in one pentatonic key, combo pitch
  ladders on consecutive harvests, weather ambience loops

### Phase 4 — Interface polish *(~1 week)*
- Actually load the rounded font (currently declared but never bundled — every player sees a
  fallback)
- Design tokens: 3-level elevation, bevel language, wood-rail sheet caps, parchment wells
- SVG icon system replacing emoji (3-phase migration, ~90 symbols; 22 already drawn in the
  mockup); prices become gold coin-chip buttons; save-up progress bars on unaffordable items
- Motion pack: button press physics, sheet spring, purchase morph, coin flight, tick-ups
- Accessibility ("Comfy Mode"): 12px text floor, contrast fixes (several current colors fail
  WCAG), 44px tap targets, reading-rate toast durations + tappable, event journal, large-text
  toggle, reduced-motion support — a genuine differentiator for the older cozy audience

### Phase 5 — The marketing pass *(ongoing)*
- Dawn god-rays + delivery cart at sunrise; hero set-pieces per parcel (windmill, orchard,
  stream) so zoomed-out shots have focal landmarks; screenshot-mode camera

**Projected result:** world 4.5 → **8.5+**, UI 5.5 → **8.5+**, at a *higher* frame rate than
today. Everything above is procedural Canvas 2D — no engine change, no asset downloads, no
build step.

---

## 5. Prototype gallery (all in `docs/artreview/prototypes/`)

| File | What it proves |
|---|---|
| `style-mock.png` | Golden Hour Storybook vs. current, same engine, same cost |
| `proto-barn.png` | Township-tier building/terrain quality in our exact iso renderer |
| `proto-before.png` / `proto-after.png` | The bake+lightmap night: from dead-dark to marketing shot |
| `mockup-shop.png` (vs `12-shop.png`) | The shop with owned icons, tokens, and coin-chip buttons |
| `demo-frame-impact.png` / `demo-frame-arc.png` / `demo-frame-arrival.png` | The harvest juice chain in motion |

## 6. Archived consultant reports

`docs/artreview/art-director.md` · `environment.md` · `tech-art.md` · `ui.md` · `animation.md`
