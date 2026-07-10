# Harvest Empire — Technical Art & Rendering Pipeline Review

**Reviewer:** Principal Technical Artist / Graphics Engineer (2D mobile rendering)
**Scope:** `/home/user/farm/js/render.js` (1,231 lines), palettes in `js/data.js`, screenshot pack, headless profiling. Rendering techniques and pipeline only — art direction and UI are covered by colleagues.
**Date:** 2026-07-10

---

## 0. Executive summary

The renderer is clean, disciplined, and well-organized — one IIFE, a correct 2:1 iso projection, deterministic per-tile hashing, a proper depth-sorted entity pass. As *code* it's a pleasure to read. As a *pipeline* it is a 2010-era immediate-mode vector renderer: **every tree, building, crop, and grass speckle is re-tessellated from path commands every frame** (~1,700 `beginPath`, ~1,940 fills/strokes, ~1,160 `fillStyle` sets, **zero** `drawImage` calls per frame — measured). That architecture caps both performance *and* art quality: you can't afford richer assets because every extra detail costs per-frame, forever.

Profiling on a mid-tier-phone proxy (Chromium, 390×844 @ DPR 2, 4× CPU throttle) puts the current frame at **~58–73 ms (~15 fps)** — the game does not actually hold 60fps on the hardware it targets, and the flat look and the slow frame have the *same root cause*.

The single highest-leverage change is a **bake-once, blit-forever pipeline**: render each asset variant into offscreen canvases once (invalidate on season change), stamp them with `drawImage`, and spend the freed budget on a real lighting stack — lightmap multiply pass, additive window/lamp glows, colored directional shadows. I built a working prototype of exactly that (`proto-bake-lightmap.html`, screenshots `proto-before.png` / `proto-after.png`): the whole asset set bakes in **22 ms once**, and the night scene goes from "dark green screenshot" to something you'd put on an app-store page.

Recommendation on WebGL: **don't migrate yet.** Canvas 2D with baking + a lightmap gets you 90% of the visual upgrade for ~15% of the engineering cost. Full rubric in §7.

---

## 1. What's on screen today (blunt assessment)

From the screenshot pack and code:

* **Night (shot 09) is the weakest moment in the game.** `drawDayNight()` (render.js:1077) is a single `rgba(10,16,42,.45)` full-screen fill plus 24 twinkling star dots. Nothing emits light: windows stay the same beige `rgba(240,240,215,.75)` quad they are at noon (drawBarnLike, render.js:589), the well, the drone pad, nothing glows. Night in a farming sim should be the *best* screenshot, not the worst — it's where cozy lives.
* **Dusk (shot 08) is nearly invisible.** A 13%-alpha orange wash (`render.js:1085`). No long shadows, no warm/cool split, no rim light. Golden hour is free production value and it's being skipped.
* **Lighting model is "none."** Buildings have a fixed 0.96/0.74 wall-shade split (`isoBox`, render.js:531-541) which is a good start, but nothing else in the scene acknowledges a sun: trees, crops, animals, and ground are shaded identically at 6am, noon, and midnight, in all four seasons. All shadows are the same gray ellipse (`shadow()`, render.js:137) with no direction, no color, no time-of-day length.
* **Ground reads as flat vector wallpaper.** The checkerboard `(x+y)%2` tile alternation (render.js:152) is visible banding at every zoom (very obvious in shot 11), and "texture" is two 2-px ellipses per tile (render.js:157-165). At DPR 2 on a 6" screen this reads as a diagram, not a field.
* **Weather is data, not drama.** Rain (shot 06/07) is 70 identical 14-px strokes with no splash, no ground darkening/wetness, no reflections. Storm's lightning is a full-screen 30%-white `fillRect` — reads as a rendering glitch, not a strike. Snow (shot 05) falls but never *lands*: no accumulation on roofs (trees get one hardcoded white arc, render.js:791-794), no drifts against fences.
* **Weather/sky particles are screen-space** (`drawWeather` resets the transform, render.js:1027), so rain/snow don't parallax with the world when you pan — they're stuck to the glass. Acceptable for rain, wrong for leaves (drawAmbient leaves are world-space — good — but birds/leaves pop as they wrap).
* **Post stack is one vignette** (`drawGrade`, render.js:1102) that allocates a new `createRadialGradient` **every frame** — a canonical canvas anti-pattern (see §8; per-frame gradient allocation measurably costs ms). Same bug in `drawCrop`'s mature-crop glow (render.js:327): one gradient allocation *per mature crop per frame*.

What's *good* and must be preserved: deterministic `hash(x,y)` decor placement, the entity-closure depth sort (correct painter's algorithm), tile-anchored crops with wilt/sway state driving pose, palette-per-season indirection, and the restraint of the muted palette. The bones are right. The pipeline is wrong.

---

## 2. Measured baseline (methodology + numbers)

Headless Chromium via playwright-core, 390×844 CSS @ DPR 2 (780×1688 backing store), showcase farm from `artreview/shots.js`. Scripts: `profile.js` (op counting + tight-loop), `profile2.js` (rAF-cadence + CDP 4× CPU throttle ≈ mid-tier Android). **Caveat:** this environment has no GPU (`/dev/dri` absent → software raster), so raster-side numbers are worst-case; JS-side numbers are reliable. Real phones GPU-raster canvas, but ~2,000 anti-aliased paths per frame is heavy even for GPU raster (tessellation + overdraw per path).

**Canvas API calls in ONE frame** (zoom 0.75, sunny day):

| op | count | | op | count |
|---|---|---|---|---|
| `beginPath` | 1,708 | | `lineTo` | 1,838 |
| `fill` | 1,275 | | `arc` | 533 |
| `stroke` | 465 | | `ellipse` | 354 |
| `fillRect` | 200 | | `fillStyle` sets | 1,159 |
| `fillText` | 15 | | **`drawImage`** | **0** |

**Frame cost** (`Renderer.render()` instrumented inside the live rAF loop):

| scenario | render() JS | full frame (rAF delta) |
|---|---|---|
| zoom 0.75 sunny, no throttle | 1.26 ms | 16.7 ms (vsync-bound) |
| zoomed out 0.42, no throttle | 1.26 ms | 16.7 ms |
| zoom 0.75 sunny, **4× throttle** | 5.24 ms | **64.4 ms p50 / 70.4 p95** |
| zoom 0.75 storm, 4× | 5.48 ms | 66.8 ms |
| zoomed out 0.42, 4× | 5.32 ms | 58.5 ms |

Two conclusions. (1) On a mid-tier phone proxy the game runs ~15 fps, and the gap between 5 ms of JS and a 64 ms frame is raster: the browser is repainting every pixel of a DPR-2 screen through ~2,000 vector paths per frame. (2) Cost is flat vs. zoom because there is **no culling** — `render()` iterates all 300 tiles and all entities regardless of viewport (render.js:1178-1197), so close-up zoom draws everything you can't see.

---

## 3. Lighting model — spec for a cheap, correct 2D stack

Goal: one coherent light rig, computed **once per frame** as scalars/colors, consumed by cheap operations. Five layers, back to front:

### 3.1 Global sun state (one struct per frame)
Add to the top of `render()`:

```js
// computed once per frame from state.t (0..1 day) and state.season
function computeSun(state) {
  const a = (state.t - 0.5) * Math.PI * 1.9;      // sun arc
  return {
    elev: Math.max(0, Math.cos(a)),                // 0 night .. 1 noon
    dirX: Math.sin(a),                             // -1 dawn(E) .. +1 dusk(W)
    // shadow skew/scale for the silhouette pass (§3.4)
    skewX: -Math.sin(a) * 1.4, scaleY: 0.35 + 0.25 * Math.cos(a),
    warm:  duskiness(state.t),                     // 0..1, peaks at dawn/dusk
    ambient: seasonAmbient[state.season],          // {r,g,b} multiplier
  };
}
```

### 3.2 Per-asset lit/shade faces driven by the light vector
`isoBox()` hardcodes SW=0.96 / SE=0.74. Parameterize by `sun.dirX`: morning light should flip which wall is bright, and `shade()` should shift hue, not just value — lit faces toward `1.05–1.12 ×` and warm-tinted (`+8 R, −6 B` at high `warm`), shaded faces `0.72 ×` **plus a cool overlay** (`rgba(40,50,110,.12)` fill on the same poly — two extra ops per wall, or free once baked, §5). This one change makes every building sit in the same world. Apply the identical factors inside the tree/crop bakes so foliage gets a lit side.

### 3.3 Warm/cool ambient per time+season — one full-screen multiply
Replace the dusk/dark `fillRect`s in `drawDayNight()` with a single multiply pass whose color comes from a 6-stop keyframed ramp (per season): e.g. noon-summer `rgb(255,252,245)`, dusk `rgb(255,196,150)→rgb(120,124,190)` vertical gradient, night `rgb(64,70,128)`. Implementation detail that matters: **put this gradient into the lightmap canvas base fill (§3.5) so ambient + local lights composite to the screen in ONE multiply pass, not two.** (Bisected in the prototype: each extra full-screen blend pass cost ~4–7 ms in software raster.)

### 3.4 Colored directional shadows (replace `shadow()` ellipses)
One extra `drawImage` per entity, only sensible after baking (§5): draw the asset's pre-baked **silhouette** (bake once: draw sprite → `source-in` fill with `#2a2060`) anchored at the entity's ground point with `ctx.transform(1, 0, sun.skewX, -sun.scaleY, 0, 0)`, `globalAlpha ≈ 0.45 × sun.elev`, composite `multiply`. You get long violet dawn/dusk shadows, short noon shadows, vanishing night shadows — all from the §3.1 struct. Keep the old ellipse as the LOD for `cam.z < 0.5`. This is *the* signature look upgrade for dusk (shot 08).

### 3.5 Night local lights — offscreen lightmap + `globalCompositeOperation`
The prototype implements the exact spec:

1. Keep a **half-resolution** offscreen canvas `lm` (`vw*dpr/2 × vh*dpr/2`).
2. Per frame at night/dusk: fill `lm` with the ambient color/gradient (§3.3).
3. Set `lmx.globalCompositeOperation = 'lighter'`; for each emitter (building windows, door cracks, lamp posts, the drone's LED at render.js:734, fireflies) stamp a **pre-baked radial light sprite** — *never* `createRadialGradient` per light per frame (measured: ~50 per-frame gradient allocations cost ~2 ms; a 256² baked sprite per color is one `drawImage`).
4. Composite once: `ctx.globalCompositeOperation='multiply'; ctx.drawImage(lm, 0, 0, vw, vh)`.
5. Bloom: small additive halos — `'lighter'` blits of the same light sprites at each emitter position on the main canvas (~10 small blits, cheap) — **not** a second full-screen pass.

Emitter registry: `drawBarnLike` already computes window quads (render.js:588); have building draw functions push `{wx, wy, r, color, flicker}` into a per-frame `lights[]` array that `render()` consumes after the entity pass. Flicker = `1 + 0.04·sin(time*9 + wx)` on the radius — sells "inhabited" for free.

---

## 4. Texture & materials without image assets

All "texture" should be generated **once** into offscreen canvases at load (and cached per season), then stamped. Everything below is procedural — no image assets, consistent with the project's identity.

* **Grass/soil noise tiles** — bake 2–3 grass diamond variants (96×48 @ 2×) each with ~130 one-pixel blade strokes (dark `rgba(48,80,30,.35)` + light `rgba(190,225,140,.3)`), and a soil tile with furrow grooves + highlight edges + ~90 clod ellipses. Replace `drawGroundTile`'s per-frame speckle math with `drawImage` of a variant chosen by `hash(x,y)`. The prototype's ground is exactly this and it reads as *material* at every zoom. Kill the `(x+y)%2` checkerboard while you're in there — vary via 3–4 noise variants instead of parity banding.
* **Whole-ground layer cache** — one step further (prototype does this): stamp all tiles once into a single world-sized offscreen canvas (20×15 tiles ≈ 1780×840 @ 1×, ~6 MB @ 2× — fine), redraw a tile *into the layer* only when it changes (till/water/season), and the per-frame ground pass becomes **one `drawImage`**. Wet soil, watering darkening, and snow accumulation (§6) then become cheap incremental paints into this layer instead of per-frame state branches.
* **Roof shingles / wood siding patterns** — not patterns at runtime: bake them into the building sprites (§5). Shingle courses are 8 strokes per roof face *once*; the prototype barn shows the payoff.
* **Dither/grain overlay** — bake one 128² `ImageData` gray-noise tile, pre-compose it **with the vignette** into a static half-res screen overlay rebuilt only on resize, drawn as one `source-over` blit. (Bisected: a live full-screen `'overlay'` pattern fill cost ~12 ms software / non-trivial even on GPU; the pre-composed static version ~1 ms.) This kills the "flat vector fill" feel on every surface at once, and fixes the per-frame vignette gradient allocation in `drawGrade()`.

---

## 5. Sprite baking pipeline (the big one)

**Design:**

```js
const AtlasCache = (() => {
  const cache = new Map();   // key: `${kind}|${variant}|${season}|${lod}`
  const LODS = [1, 2];       // bake at 1x and 2x world scale; pick by cam.z*dpr
  function get(key, bakeFn, w, h, anchor) { /* lazy-bake into canvas, return {c, ox, oy} */ }
  function invalidate(pred) { /* season change: drop matching keys */ }
})();
```

* **What gets baked:** every `drawTemplate` crop template × growth stage bucket (sprout/mid/mature ≈ 3 stages × 7 templates × colors — the templates are already parameterized, so the bake function *is* the existing code), trees × 3 variants × 4 seasons, all building types, animals × 2 leg poses (or keep animals vector — they're few), fence post/rail segments, rocks/bushes/flowers.
* **What stays dynamic (vector, per-frame):** sway/bounce/droop → `ctx.translate/rotate` around the sprite anchor *then* `drawImage` (transform is free, re-tessellation is not); water-drop and ready badges; floats/bursts; the ghost.
* **LODs:** bake at 2 scales; below `cam.z ≈ 0.5` use the 1× bake, and drop crops to a single 2-color "blob" bake (at shot-11 zoom nobody can see a strawberry's highlight anyway). This bounds memory and stops minified sprites from shimmering.
* **Invalidation:** `season` (palette) change → `invalidate(key.season != s)`; rebake lazily on first use — a season transition rebakes ~40 canvases over a few frames, imperceptible. Prototype measured **22.3 ms** to bake its full set; the real game's larger set stays well under one 100 ms loading beat.
* **Draw-call math:** the measured frame issues ~1,940 path fills/strokes + 1,708 path builds. Post-bake: ~300 tiles → 1 blit (ground layer), ~120 entities → ~240 blits (sprite + shadow), UI/fx unchanged → **~97% fewer path ops, ~5.2 ms → ~1 ms JS at 4× throttle**, and raster switches from path tessellation to texture sampling, which is exactly what mobile GPUs are built for.
* **Why this unlocks better art:** once a barn is a bake, drawing it with 120 ops instead of 30 costs *nothing at runtime*. Siding lines, shingle courses, window mullions, rim light, ambient-occlusion gradient at the base — all free. The prototype barn vs. the live barn (compare `proto-after.png` to shot 02) is the same code budget philosophy, different amortization.

**Sequencing in `render()`:** the structure barely changes — `drawGroundTile` loop becomes one blit; the `ents` array entries change `fn` bodies from path code to `drawImage`. Also: stop allocating ~120 closures per frame in the entity pass; push `{d, kind, x, y, data}` records into a persistent array and switch on `kind` (removes steady GC pressure; the 240–300 ms max-frame spikes seen in tight-loop profiling include GC pauses).

---

## 6. Post-processing within Canvas 2D — what's feasible & what it costs

Budget rule discovered by bisection: **full-screen blend passes are the currency; you get ~1–2 per frame.** Everything else must be small-area or pre-composed.

| effect | technique | cost | verdict |
|---|---|---|---|
| Color grading (time/season) | ambient color **inside the lightmap base**, single `multiply` blit (§3.5) | the 1 allowed full-screen pass (~7 ms software raster, cheap on GPU) | **do it** — this is the whole look |
| Bloom/glow for lights | small `'lighter'` blits of baked light sprites at emitters | ~10 small blits, <0.3 ms | **do it** |
| Grain + vignette | pre-composed static overlay canvas, 1 `source-over` blit, rebuild on resize | ~1 ms | **do it** |
| Wet-ground reflections (rain) | under each building/tree, `drawImage` its sprite flipped (`scale(1,-0.6)`) with `globalAlpha .15` clipped to a few tile diamonds below it; fade in with a per-frame `wetness` scalar | ~1 blit per large entity, only in rain | **do it** — pairs with darkening soil in the ground layer |
| Snow accumulation | winter: paint white gradient caps into the **ground layer** (once) + bake `season=3` sprites with snow on roofs/canopies; storm intensity animates a masked white overlay on N-facing roof faces | bake-time cost only | **do it** — fixes shot 05's "roofs ignore winter" |
| God rays at dawn | 4–6 long skewed translucent warm triangles from screen top, `'screen'` composite, alpha ≈ `sun.warm × 0.2`, drift slowly | ~6 path fills over partial screen | cheap, tasteful — **yes** at dawn only |
| Heat shimmer (drought) | honest answer: real refraction needs per-pixel UV distortion — not feasible in Canvas 2D at 60fps. Fake it: 2–3 horizontal slice `drawImage` self-copies of the horizon band with ±1px sinusoidal offset, plus rising smoke-wisp particles | ~3 narrow self-blits | **fake version only**; skip the slice trick if it dips frames — the orange cast + wilt anim already carries drought |
| Lightning | replace full-screen white flash with: 1-frame **sky gradient** flash + 2-frame lightmap boost + a drawn polyline bolt with `'lighter'` halo | trivial | **do it** — current flash reads as a bug |
| DOF/blur | `ctx.filter='blur()'` is a trap on mobile (per-call raster stall, poor Android support) | — | **don't** |

---

## 7. The WebGL question, answered honestly

**What PixiJS (or raw WebGL) buys you:** true per-pixel lighting w/ normal-mapped sprites; shader post (real heat shimmer, real bloom with downsampled gaussian chains, color-grading LUTs); 10,000+ particles; batched rendering that makes draw-call count a non-issue; render-to-texture chains; no DPR anxiety.

**What it costs:** render.js is 1,231 lines but it's *all* immediate-mode path drawing — there is no scene graph to port, so a Pixi migration means rewriting every draw function as either (a) a `Graphics`→`RenderTexture` bake (i.e., you must build the §5 baking pipeline *anyway*, just with Pixi API), or (b) hand-authored meshes. Plus: input/picking (`screenToTile` is fine, but Pixi interaction is its own system), text (signs use canvas `fillText` — Pixi `Text` re-rasters), the UI layer stays DOM so you now maintain two render worlds, ~450 KB min+gz dependency where the game is currently ~0, and WebGL context-loss handling on Android. Realistic scope: **3–5 weeks** for a solid engineer to reach parity *before* any visual upgrade, vs. **~1 week** for the §5 bake + §3 lighting stack in canvas (prototype was an afternoon).

**Decision rubric — migrate only when you hit ≥2 of these:**
1. A designed feature *requires* per-pixel shading (normal-mapped day/night on sprites, real refraction/water, dynamic soft shadow maps).
2. Sustained particle counts > ~1,000 on screen (canvas `drawImage` particle budget ≈ 400–800 on mid-tier).
3. Entity count grows ~10× (mega-farms, ranch expansions) so blit count itself becomes the bottleneck.
4. You adopt image/atlas art from artists anyway (then Pixi's asset pipeline earns its keep).

**Recommendation: stay Canvas 2D now; build the bake pipeline so a later migration is cheap.** The atlas cache (§5) *is* the migration on-ramp — once assets are baked canvases keyed by `(kind, variant, season, lod)`, swapping the presenter from `drawImage` to Pixi sprites-from-textures is mechanical. Do canvas now, revisit at the next design milestone that trips the rubric. A "hybrid" (WebGL layer under a canvas layer) is the worst of both — two contexts, compositing costs, don't.

---

## 8. Performance budget table

Mid-tier target: Moto G-class / A54-class, DPR 2–3 screen, thermal-limited. Numbers from §2 methodology; "proposed" figures for the real game are engineering estimates from prototype pass-bisection, clearly marked (~).

| pass | current (measured, 4× throttle proxy) | proposed | est. proposed cost |
|---|---|---|---|
| ground (300 tiles, ~900 path ops) | part of 5.2 ms JS + heavy raster | 1 blit of cached ground layer | ~0.2 ms |
| entities (~120, ~1,000 path ops) | part of 5.2 ms JS + heavy raster | ~240 `drawImage` (sprite+shadow) | ~1.0 ms |
| lighting/night | 2 fillRects (flat) | half-res lightmap + 1 multiply + ~10 halos | ~1.5 ms GPU-raster (7 ms software worst-case) |
| weather particles | 70–120 strokes/arcs | pooled sprite particles ≤ 300 (§9.7) | ~0.5 ms |
| post (vignette/grain) | per-frame gradient alloc | 1 static overlay blit | ~0.2 ms |
| **total render** | **5.2 ms JS; 58–73 ms frame (~15 fps)** | | **~3–4 ms JS; 60 fps with headroom** (~16 ms worst-case software raster) |

**DPR / resolution strategy** (do this regardless of everything else):
* Cap DPR at **2.0**, not 2.5 (`resize()`, render.js:73) — at 6", DPR 2.5 is invisible quality and +56% pixels over 2.0.
* **Dynamic resolution:** track an EMA of rAF deltas; if p50 > 19 ms for 60 frames, step the backing store 2.0 → 1.75 → 1.5 (CSS size unchanged, update the `setTransform` scale). Iso vector/sprite art survives 1.5 gracefully. Step back up when p50 < 15 ms for 5 s.
* Render weather/lightmap layers at **half res** always (prototype does; visually indistinguishable for soft phenomena).
* Add **viewport culling** to both passes: precompute the screen-space tile window (`screenToTile` at the 4 corners → clamp loops) — at close-up zoom this alone cuts >60% of work. Currently `render()` draws all 300 tiles at every zoom (render.js:1178).
* When idle (no camera motion, no active animation states like storms), consider frame-skipping the ground/light layers to every other frame; a farm sim spends most of its life idle.

---

## 9. Top 10 recommendations, prioritized

### Quick wins (hours each)

**1. Kill all per-frame gradient/pattern allocations.**
`drawGrade()` (render.js:1103) and `drawCrop`'s mature glow (render.js:327) allocate `createRadialGradient` per call per frame. Cache the vignette gradient on resize; bake one 64² glow sprite for ready crops and `drawImage` it. Also hoist `ctx.font` sets (parsed per `fillText`). *Measured in prototype: per-frame gradient allocs ≈ 2 ms/frame at ~50 lights.*

**2. Viewport culling in `render()`.**
Compute `x0,x1,y0,y1` from `screenToTile(0,0)`/`(vw,vh)`, iterate only that window in the ground and entity loops; skip `ents.push` for off-screen entities (their `d`-sort cost also disappears). ~20 lines.

**3. Stop allocating entity closures per frame.**
Replace `ents.push({d, fn: () => …})` (render.js:1192-1212) with pooled records + a `switch`. Removes GC hitches (observed 240–300 ms worst frames in tight-loop profiling).

**4. Cap DPR at 2.0 + half-res weather layer.** (§8.)

### Medium (days)

**5. Ground-layer cache with incremental invalidation.**
Bake all tiles to one offscreen world canvas; repaint single tiles into it on till/water/unlock/season events; per-frame ground pass = 1 `drawImage`. Prototype-proven. Fold in baked grass/soil noise tiles (§4) — this simultaneously deletes the checkerboard banding and ~900 path ops/frame. Functions touched: `drawGroundTile`, `drawSoil`, new `GroundLayer` module, `render()` lines 1178-1181.

**6. Sprite atlas cache for trees, buildings, crops** (§5).
Wrap existing draw functions as bake functions — `drawTree`/`drawBarnLike`/`drawGreenhouse`/`drawTemplate` already take parameters, so this is mostly moving code behind `AtlasCache.get()` and splitting static (baked) from dynamic (badges, sway transform). Invalidate on season. **This is the enabler for #7, #8, and every future art-quality request.**

**7. Pooled world-space particle system.**
One `Particles` module: fixed-size pool (600), integer type ids (rain-drop, splash-ring, snow, leaf, smoke-puff, spark), integrated in `drawFx`'s loop, all rendered as baked mini-sprites. Convert rain to world-anchored drops that terminate at a tile's ground y with a 3-frame splash ring; snow that lands adds to the accumulation mask (§6); chimneys on lit bakeries emit smoke puffs; harvest bursts (`addBurst`) become sprites. Replaces the screen-space loops in `drawWeather` (render.js:1039-1069).

### Big bets (the look-changers, ~a week together, require #6)

**8. The lighting stack of §3** — sun struct, parameterized lit/shade faces, ambient-in-lightmap multiply pass, emitter registry with baked light sprites, additive halos. Night and dusk become the game's marquee shots. Prototype: `proto-bake-lightmap.html`.

**9. Colored directional shadow pass** (§3.4) — baked silhouettes, skewed by the sun struct, `multiply`-composited. Replaces every `shadow()` ellipse at `cam.z ≥ 0.5`.

**10. Weather set-pieces on the new stack:** wet-ground reflections + soil darkening in rain; snow accumulation via ground-layer paints + winter sprite bakes; polyline lightning with lightmap flash; dawn god rays (§6 table). Each is now a small feature instead of a rewrite because #5-#8 exist.

---

## 10. Prototype: proof of the top recommendation

**Files** (all in this directory):
* `proto-bake-lightmap.html` — standalone, no dependencies; open in any browser. Toggle button switches BEFORE (current pipeline, faithful re-implementation of render.js's ground/tree/building/night code) ↔ AFTER (baked sprites, 1-blit ground layer, colored skew shadows, half-res lightmap w/ multiply composite, baked light sprites for windows/lamp, additive halos, pre-composed grain+vignette, 140 pooled fireflies).
* `proto-before.png` / `proto-after.png` — same scene, same camera, same time-of-night.
* `profile.js`, `profile2.js`, `proto-shots.js` — the measurement harnesses used in this report.

**Visual delta:** BEFORE is the live game's night: a uniformly dark scene where windows don't glow and every asset floats on a gray ellipse. AFTER: warm windows with bloom, a lamp post pooling light onto textured grass, violet directional shadows, dusk-graded sky-to-ground ambient, film grain — *with zero image assets, everything still procedural*, and a 22.3 ms one-time bake.

**Measured (same harness as §2):**

| | JS/frame (no throttle) | JS/frame (4×) | notes |
|---|---|---|---|
| BEFORE (small demo scene) | 0.46 ms | 2.0 ms | scene is ~10× smaller than the live game (live game: 5.2 ms JS at 4×) |
| AFTER (adds full lighting stack) | 2.5 ms | 10.3 ms | dominated by the one full-screen multiply, which is software-rasterized here (no GPU in the test env); on GPU-backed mobile canvas this is a blend quad |

**Honest engineering findings from building it** (baked into §3/§6 specs): (a) per-frame `createRadialGradient` for lights cost ~2 ms — bake light sprites; (b) per-frame `createPattern` for grain — cache it; (c) full-screen blend passes were 4–12 ms *each* in software raster — merged four passes (ambient, lightmap, glow, grain/vignette) down to one full-screen multiply + small local blits, taking the AFTER frame from 46 ms → 22 ms in the software-raster environment. The discipline transfers directly to production: **one full-screen blend pass per frame, everything else baked or local.**

---

*Bottom line: don't change engines — change when work happens. Move ~2,000 per-frame path operations to load-time bakes, spend the reclaimed budget on a lightmap, directional colored shadows, and grounded weather, and Harvest Empire's night shot becomes the reason people download it — at 60fps on the phones that matter.*
