# Harvest Empire — Art Direction Review
**Reviewer:** Art Director (mobile farm/sim, Hay Day / Township / FarmVille 2 caliber)
**Date:** 2026-07-10
**Scope:** Visual identity only. Terrain detail, tech rendering, UI systems and animation are covered by the other discipline leads; where I touch them it is strictly through the lens of the look.
**Materials reviewed:** all 15 screenshots, `js/render.js` (full), `js/data.js` (palette/color data), `css/style.css` + `index.html`.
**Companion mock:** `style-mock.html` / `style-mock.png` in this folder — one tile cluster re-art-directed side-by-side with the current look.

---

## 1. Where this sits today: 4.5 / 10

Scored against the top of the genre — Hay Day's clean saturated readability, Township's polished depth, FarmVille 2's painterly warmth, Stardew's hand-crafted charm.

**What's already genuinely good (and why this isn't a 3):**
- The bones are professional. True 2:1 isometric projection, correct depth sorting, two-tone building walls with a lit/shaded convention, hip roofs with eave overhang, hand-vectored animal sprites with bob/step cycles, a day/night cycle, per-season palettes, deterministic per-tile hashing for decor. This is a coherent renderer, not a hack.
- The UI shell (shots 01, 12, 13, 14) is honestly the strongest visual element in the product: warm cream cards, generous radii, confident Nunito weights, good spacing. It's within striking distance of Hay Day's HUD quality.
- Smart readability instincts exist in embryo: ripe-crop glow, thirst droplet indicator, wilt droop, rot flies, sick bubble, ready badges. The *systems* for a readable farm are designed; the *drawing* underneath them is not yet worthy of them.

**Why it's not a 6:**
- The world reads as **tasteful programmer art**. Muted palette (the code literally comments "muted, natural palettes"), flat single-color fills, stroke-based crops, lollipop trees, checkerboard grass, a dead flat olive void around the entire world (shots 02, 11), and a darkening vignette on top of an already midtone-heavy scene. Hay Day would never ship a frame this murky.
- There is no signature. If you cropped the HUD off shot 02 and put it in a lineup with fifty HTML5 farm prototypes, nothing would identify it.

Genre leaders are a 9–10 on craft. This is a 4.5: competent structure, undernourished surface.

---

## 2. Visual identity diagnosis

### 2.1 Does it have a signature look? No — it has a signature *layout*.
The diamond farm plots, fence lines and village cluster compose nicely (shot 11 is the best frame of the set). But the rendering vocabulary — flat fill + 1px dark stroke + RGB-multiply shading — is the default vocabulary of canvas demos. A signature look needs an opinion about **light**, and this game currently has none: no sun direction you can feel, no color in the shadows, no warmth in the highlights.

### 2.2 Color script — strengths and weaknesses

The entire world palette is 5 colors per season (`PALETTES` in render.js) plus per-crop hexes in data.js, shaded by `shade()` — a plain RGB multiply. That function is the root of half the murk: multiplying RGB darkens *and* desaturates toward grey, so every "shadow" side of every building drifts toward dishwater. Painters (and Hay Day's art team) shift shadows **cooler and more saturated**, highlights **warmer**.

Season by season:

- **Spring (02) vs Summer (03): visually identical.** Grass goes from `#79a854` to `#8aa04e` — a difference no player will ever register. The heatwave is an 8%-alpha orange rect. Two of your four seasons are the same painting. That's a wasted quarter of your content calendar.
- **Fall (04): the weakest frame in the set.** Grass `#a89355` is khaki — low saturation, mid value — and because buildings, soil and crops don't respond to season at all, the whole frame collapses into brown-on-brown mud. Fall should be your *most* beautiful season (FarmVille 2's autumn is a marketing asset): amber grass, crimson/orange/gold tree variance, long warm light.
- **Winter (05): the checkerboard disaster.** The parity-based grass alternation (`(x+y) % 2` in `drawGroundTile`) that reads as a faint checker in other seasons becomes literal white/grey bathroom tiling in winter. Trees keep their dark summer canopy with a white semicircle "cap" that doesn't follow the canopy silhouette. Crops stay lush green in the snow. No snow accumulates on roofs, fences or soil beds. Winter currently looks like a grey filter, not a season.
- **Dusk (08): nearly invisible.** A 13%-alpha orange wash. Dusk in this genre is *the* screenshot moment — long shadows, pink-orange sky gradient, warm windows. Missed entirely.
- **Night (09): dead.** A flat navy multiply at 45% with a few blinking star dots. Not one light source in the world: no window glow, no lamp, no firefly. Night in Township/Hay Day is when the art team shows off. Here it's when the game turns off.
- **Rain/storm (06, 07):** rain streaks are serviceable; the storm is a dark rect plus a full-screen white flash rect — harsh and cheap-feeling. Nothing in the *world* gets wet: soil doesn't darken (it only responds to crop water state), no puddles, no drips from eaves.

### 2.3 Shape language — inconsistent across asset classes
- **Buildings:** geometric, hard-edged, correct iso boxes. Language: "architectural diagram."
- **Crops:** stroke-based curves and blobs, billboarded upright. Language: "whiteboard marker." At close zoom (shot 10) the growing crops are literally green tick-marks on brown diamonds.
- **Animals:** the best-drawn assets in the world layer — rounded, chunky, charming little vectors. Language: "cute sticker." This is the language the whole game should speak.
- **Trees:** three overlapping circles + a highlight circle. The canonical lollipop programmer tree, repeated ~80 times with only scale variance, forming polka-dot forest rings (shot 11).
- **UI:** rounded cream cards + **OS emoji** for every item icon (shots 12, 13). Emoji is a fifth language, and it isn't even yours — it renders differently on every device and clashes with the hand-vector world.

Five vocabularies, one game. The animals prove the team can draw; the rest of the world doesn't yet match them.

### 2.4 Readability hierarchy — half-designed
- **Ripe vs growing:** at mid zoom, decent — the warm radial glow + fruit color works (shot 02, tomato/turnip tiles). At far zoom (11), ripe crops vanish into noise; growth stages between sprout and mature are barely differentiated silhouettes (compare the identical-looking stroke fans in shot 10).
- **Wilting:** droop + alpha fade. Alpha fade is the wrong tool — a *transparent* plant reads as a rendering bug, not a thirsty plant. Wilting should be a **color** story (green → ochre/yellow, desaturated) plus droop.
- **Thirst droplet:** good idea, tiny, blinks. Keep, enlarge, give it a soft dark halo so it survives any backdrop.
- **Owned vs unowned land:** the strongest hierarchy in the game (dark overlay + dashed white border + FOR SALE signs). Genuinely good.
- **Buildings' ready badge:** drawn (not emoji), bounces — good — but it's a generic orange dot; at a glance it competes with the coop's red roof (shot 02, top-right of coop).

### 2.5 Where it looks "programmer art," precisely
1. `shade()` RGB-multiply ramps → grey, lifeless shadow faces on every building (all shots).
2. `(x+y)%2` checkerboard grass → dev-grid, worst in winter (05).
3. Flat `shade(pal.edge, 0.82)` void around the world → the farm floats in olive nothing (02, 11); zoomed out, more than half the frame is empty flat color.
4. Uniform-width stroked crops with no ground contact (no mound, no contact shadow) → stickers hovering over dirt (10).
5. Perfect-circle tree canopies with hard tangent intersections (all outdoor shots).
6. One blob-ellipse shadow recipe (`rgba(25,18,8,.22)`) for everything, with no consistent cast direction and no color → objects sit *on* the world, not *in* it.
7. A **darkening** vignette (`drawGrade`) over a midtone scene → corners go muddy; grading should add light and warmth, not soot.
8. Full-screen `fillRect` washes for dusk/night/heatwave/storm → "filter" look instead of lighting.
9. OS emoji as product art in shop/seed/coop sheets (12, 13, 14).
10. Pond: two screen-space ellipses that ignore the iso plane (11, left edge) — reads as a blue puddle sticker.

---

## 3. The prescription: **"Golden Hour Storybook"**

*A sunlit miniature diorama painted like a children's picture book: high-key saturated color, one low warm sun, cool violet shadows, cream rim light on every hero silhouette, chunky rounded shapes you want to pick up.*

Why this direction and not others:
- **It matches your strongest existing assets.** The animals and the cream UI are already storybook. We're promoting the winning language, not inventing a new one.
- **It's achievable procedurally.** Gouache/painterly (FarmVille 2) needs texture; pixel charm (Stardew) needs a full re-proportioning. Golden Hour Storybook is *shape + ramp + light* — exactly what Canvas 2D vector drawing is good at, at 60fps.
- **It differentiates.** Hay Day is clean noon daylight; Township is cool and architectural. A perpetual late-afternoon warmth — "the farm you remember from a summer childhood" — is an ownable emotional position, and it doubles as a natural frame for the day/night cycle you already simulate.

See `style-mock.png`: left panel is the current recipe faithfully reproduced; right panel is the same tile cluster under this style guide. Same renderer capabilities, ~same draw cost.

### 3.1 Master palette rules
- **Work in HSL, not hex-multiply.** Replace `shade(hex, f)` with a `ramp(h, s, l, step)` helper: each ±1 step = **±8 L**, shadows shift hue **+8–15° toward blue/violet** and **+5–10 sat**, highlights shift **−8° toward yellow** and −4 sat. Every material gets a 5-step ramp (deep shadow / shadow / base / light / highlight). This one change re-keys the whole game.
- **Value ranges:** playable ground lives at L 50–62 (currently ~45–49). Nothing in the world below L 18 or above L 92 except accents; reserve near-white for UI, snow, sparkles, rim light.
- **Saturation floor:** hero gameplay objects (ripe fruit, roofs, animals-ready badges) ≥ 65 sat; ground 45–60; background/decor 35–50. Current grass sits ~33 — lift it.
- **Season = a global ambient tint + per-season key colors**, not just new grass hexes. Define per-season `{ambient hue-shift, sat mult, key accents}`: spring (+mint, blossom pink accents), summer (+gold, deeper greens), fall (amber ambient, crimson/orange/gold tree triad — never khaki), winter (cool blue ambient, warm accents *pop* — the red coop roof against snow is your winter poster).
- **Time of day tints the same way:** morning +cool gold, noon neutral, dusk strong amber/pink, night deep blue-violet multiply *plus* warm emissive sources. Cheapest robust implementation: precompute tinted palette lookups per (season, time-bucket) once per frame — do not per-pixel filter.

### 3.2 Outline / rim-light policy
- **No black outlines anywhere.** Hero silhouettes (buildings, trees, animals, mature crops, props) get a 1.5–2px stroke of their own base color at −25 L, +10° cool. Ground gets none.
- **Rim light:** a cream (`rgba(255,246,200,.5–.65)`) arc/edge on the **upper-left (sun-facing) contour** of every hero object during day; swap to pale blue at night. This single cue is what makes "miniature diorama" read.

### 3.3 Shadow policy
- **One sun. Period.** Sun sits upper-left in screen space; **every** cast shadow is a skewed ellipse/parallelogram falling lower-right at a consistent angle (transform: skewX ≈ 0.55, squash 0.5).
- **Color:** `rgba(64, 52, 124, 0.20–0.26)` — cool violet, never neutral black. Shadows at dusk lengthen (increase skew and width ×1.8) and warm slightly; at night they nearly vanish and light pools take over.
- Crops get small **contact shadows** (this alone glues them to the soil — see mock, right panel).
- Cloud shadows: keep the idea, but make them big soft *shapes* drifting across the world layer (drawn before entities, in world space), not screen-space smears over the HUD (shot 04, top-left blob crossing the UI).

### 3.4 Material language
- **Wood** (fences, well, trellises, sign posts): 2-tone planks — dark base + lit face strip + sunlit top cap ellipse; occasional knot dot. No single-color rects.
- **Roofs:** per-building silhouette identity (see 3.5) + 2–3 shingle/board seam lines following the roof pitch + eave shadow strip cast onto the wall below the roofline (biggest cheap upgrade to the village).
- **Stone** (well ring, rocks): cool grey base with warm bounce light on the underside, 2–3 cobble seams, moss fleck.
- **Glass** (greenhouse): keep the translucency, add one diagonal cream sheen streak and slightly green-tinted panes; glow warmly from inside at night.
- **Foliage:** always 3-value scalloped cluster masses (deep base blob underneath, mid mass, offset lit crown) — never single circles; canopy silhouettes get bumps (arcs), not perfect radii.
- **Soil:** warm chocolate (hue 22–26), sun-lit rim on the two upper edges of the bed, ridged furrows (paired dark line + offset light line = 3D ridge, see mock), pebble flecks; **darkens and cools 2 steps when wet** with 2–3 specular sky-blue speckles.
- **Water** (pond, well): iso-aligned shape (ellipse squashed to the ground plane), 3 depth bands, animated highlight ribbons, warm sand shoreline ring — never a screen-space circle.

### 3.5 Silhouette rules per asset class
- **Buildings:** identifiable by roofline alone at 10% zoom. Barn = gambrel + hayloft door; mill = attached silo or fan wheel; bakery = chimney with idle smoke puffs; creamery = milk-can finial; greenhouse = arched glass; loom = A-frame. Max footprint stays 2×2 — identity comes from the roof, not size.
- **Crops:** each template must have **4 distinct silhouettes** (sprout → juvenile → mature-unripe → ripe) with the height/width profile changing at each stage, plus wilt (drooped, ochre) and dead (grey husk — current one is fine). A player skimming at min zoom should parse the field by silhouette + color alone.
- **Animals:** current language is correct — keep chunky 60/40 body-to-head proportions; add the cool cast shadow + 1px self-color outline so they pop from grass.
- **Props** (well, scarecrow, sprinkler, drone): one memorable accent color each (well = teal water + red roof; scarecrow = straw gold; sprinkler = brass; drone = cream + brand accent).
- **UI:** already on-language; its icons must become game-drawn (see directive 10).

---

## 4. Top 10 prioritized directives

**1. Replace `shade()` with hue-shifting ramps and re-key all four season palettes.**
*Why:* the RGB multiply is the single largest source of the "murky prototype" feel; spring/summer are indistinguishable (02 vs 03) and fall is khaki mud (04). *How:* add `ramp()`/`hsl()` helpers in render.js; rebuild `PALETTES` with saturated high-key bases (grass L 55+, sat 55+); route every `shade()` call through the new ramp. One day of work, transforms every frame.

**2. Kill the void — give the world an edge and a sky.**
*Why:* shots 02 and 11: more than half the frame is flat olive nothing; no genre leader ever shows raw background. *How (canvas-cheap):* vertical gradient backdrop (sky → distant scalloped treeline band → meadow tone matched to grass base), plus an irregular grass-fringe/cliff-edge skirt around the world diamond so the map reads as a place, not a floating board. See mock backdrop.

**3. One sun, colored cast shadows, contact shadows.**
*Why:* nothing sits in the world; shadow blobs are neutral grey and directionless (all shots). *How:* single `castShadow()` helper (skewed ellipse, `rgba(64,52,124,.24)`), applied to trees, buildings, fences, animals, props; small contact shadows under every crop. Lengthen + warm at dusk. This is the "miniature diorama" switch.

**4. Break the checkerboard; paint a meadow.**
*Why:* the parity grid reads as dev-art in every shot and becomes bathroom tile in winter (05). *How:* hash-driven ±2 L tone variance with organic light blotches crossing tile borders, two-value grass blade tufts, sparse wildflowers; keep the subtle grid stroke **only** on owned, tillable land where it's gameplay information.

**5. Storybook trees (3 variants) + seasonal tree behavior.**
*Why:* lollipop circles ×80 are the most-repeated asset on screen (02, 11); winter's white cap looks unfinished (05). *How:* 3-value scalloped canopy clusters with rim light and 2–3 silhouette variants chosen by tile hash; spring = blossom dots, summer = deep green + fruit dots, fall = per-tree crimson/orange/gold pick, winter = bare branch skeleton with snow lining the canopy masses. Draw once to offscreen sprites per (variant, season) and blit — cheaper than today's per-frame path drawing.

**6. Building facelift: eave shadows, trim, roofline identity, night windows.**
*Why:* the village is brown-on-brown boxes (02); at night buildings go dead (09). *How:* eave shadow strip under every roof; per-building trim color + roof seam lines; unique roof silhouettes (3.5); warm window glow + soft light pool on the ground after `NIGHT_START` — night flips from "filter" to "cozy" with ~20 lines.

**7. Make dusk and night scenes, not filters.**
*Why:* 08 and 09 are your would-be marketing shots and they're washes. *How:* dusk = screen-top gradient (pink→amber) + lengthened warm shadows + oranged palette tint; night = deep blue-violet tint + emissive pass (windows, well lantern, fireflies in summer, drone LED) drawn additively (`globalCompositeOperation: 'lighter'` radial gradients — cheap, bounded count).

**8. Crop readability ramp: 4 silhouettes, mound + contact shadow, color-coded stress.**
*Why:* close-up (10) shows tick-mark crops; growth stages don't read; wilt = alpha ghost. *How:* per-template staged silhouettes (filled tapered leaves, not bare strokes — see mock), soil mound at sprout, ripe = saturated gradient fruit + white sparkle ticks + existing glow/bounce; wilt = hue shift to ochre + droop (no alpha); keep husk and flies.

**9. Weather that touches the world.**
*Why:* rain never wets anything, storm is a slam of rects, heatwave is invisible (03, 06, 07). *How:* rain → soil/roof tones shift to their "wet" ramp step + occasional splash rings on ground + drips from eaves; storm → clouds darken world layer (not HUD), lightning = 2-frame sky-only flash with a 1-frame cool rim on silhouettes; heatwave → warm amber grade + 2–3 slow heat-shimmer sine bands near the horizon + paler, dried grass tint; snow → accumulation wedges on roof tops, fence rails, soil bed rims, canopy masses.

**10. One art language for icons: replace OS emoji with runtime-drawn sprites.**
*Why:* shop/seed/coop sheets (12, 13, 14) put Apple/Google's art style inside your product; per-platform inconsistency, zero brand. *How:* you already have vector painters for crops, animals and buildings — render each once into an offscreen canvas icon atlas at 2× (rounded-square cream tile + drawn item + soft shadow) and use as `<img>`/background in the DOM UI. Also swap the in-world "!"-badge emoji-adjacent cues to the same family. This makes the whole product feel authored by one hand.

---

## 5. Effort buckets

**Quick wins (hours each):**
- Ramp/HSL helpers + palette re-key (directive 1 core)
- Delete parity checkerboard; hash tone variance + tufts (4)
- `castShadow()` helper rolled out to trees/buildings/animals (3)
- Vignette → warm-center/cool-corner grade (replace `drawGrade` colors)
- Dusk gradient sky + longer shadows (7, part)
- Soften storm flash (sky-band flash instead of full white rect)
- Ripe sparkle ticks + bigger thirst droplet with halo (8, part)
- Backdrop gradient + distant treeline band instead of flat void (2, part)
- Wet-soil tone shift during rain (9, part)

**Medium (days each):**
- Tree redesign + 3 variants + seasonal states, cached to offscreen sprites (5)
- Building facelift: eaves, trim, seams, night windows (6)
- Crop staged silhouettes across all 7 templates (8)
- Emoji → drawn icon atlas for shop/seed/coop/market sheets (10)
- World-edge skirt + pond rebuilt on the iso plane (2, finish)
- Weather-in-world pass: splashes, snow accumulation wedges, heat shimmer (9)

**Big bets (weeks):**
- Full ambient light pipeline: (season × time-of-day) tinted palette LUTs driving every ramp, so 6am fall and noon summer are different *paintings* — this is the engine of the "Golden Hour" identity
- Emissive night pass with light pools, fireflies, window flicker — makes night a retention feature (players log in to *see* their farm at night)
- Offscreen sprite atlas caching for all repeated assets (trees, buildings, crop stages) — buys the fill-rate headroom on mid-tier phones to afford all of the above at 60fps
- Hero set pieces per parcel (windmill with turning blades, orchard corner, stream with bridge) so zoomed-out screenshots (11) have focal landmarks like Township's

---

## 6. Closing note

The game underneath is charming and the UI shell is already near genre-grade. The world just hasn't been *lit* yet. Directives 1–4 are a week of work and would move this from 4.5 to ~6.5 on their own; the full Golden Hour Storybook program is what takes it to "stunning" — a farm that looks like late-afternoon sunlight on a picture-book miniature, on every phone, from procedural canvas alone.

**Deliverables in this folder:**
- `report.md` — this document
- `style-mock.html` — standalone canvas mock (current recipe vs. prescribed style, one tile cluster)
- `style-mock.png` — headless screenshot of the mock
- `shot-mock.js` — the script used to capture it
