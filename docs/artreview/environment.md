# Harvest Empire — Environment & Prop Art Review
**Reviewer:** Senior Environment & Prop Artist (mobile farm-sim)
**Scope:** terrain, ground materials, buildings, props, foliage, water, edges. (UI, animation, and overall art direction covered by colleagues.)
**Sources:** screenshot pack (esp. `10-closeup.png`, `11-zoomed-out.png`), `/home/user/farm/js/render.js`, `/home/user/farm/js/data.js`.
**Proof-of-concept:** `proto-barn.html` / `proto-barn.png` in this directory — one vignette re-rendered at target quality using the exact same iso math and plain Canvas 2D.

---

## 0. The one-paragraph verdict

The bones are genuinely good: correct 2:1 iso projection, deterministic per-tile `hash()`, seasonal palettes, depth-sorted entity pass, a vignette grade. But the world reads as a **prototype blockout, not a place**. Every tile is a flat 2-tone diamond, every building is the same box with a different fill color, every tree is the same tree on a near-uniform lattice, and the map floats on a void of flat dark green. Nothing in the world touches anything else — no blended edges, no contact shadows worth the name, no wear, no dressing. Township/Hay Day quality is not about more colors; it is about **edges, occlusion, and storytelling clutter**, and all three are missing. Everything below is achievable in this renderer at 60fps if you adopt one structural change first: **stop re-drawing static art every frame — bake it to offscreen canvases** (details in §7).

---

## 1. Terrain

### 1.1 Why the ground reads as flat and empty (diagnosis)

Looking at `drawGroundTile()`:

1. **The checkerboard.** `(x + y) % 2 === 0 || h > 0.75 ? pal.grass2 : pal.grass` produces a literal parity checkerboard. Two flat tones alternating on the diamond grid is the single strongest "programmer art" signal in the game. In winter (`05-winter-snow.png`) it becomes a glaring gray/white chessboard because the winter palette has the highest contrast between `grass`/`grass2`.
2. **The grid stroke.** The faint `rgba(0,0,0,.06)` diamond stroke on every owned tile turns farmland into a spreadsheet. Grid feedback belongs to *tool modes* (tilling/placing), not to the idle view.
3. **Speckles are noise, not texture.** Two 2px ellipses per ~65% of tiles, uniformly scattered by hash, read as compression artifacts at `cam.z <= 0.8`, and as random dots at close-up. Real grass reads through *clumps* (tufts, clover patches, mown vs unmown value shifts), not isolated freckles.
4. **No macro variation.** There is no low-frequency structure — no lighter dry knolls, no darker damp hollows, no worn ground near buildings. The eye has nothing to travel across; the field is one value from edge to edge (very visible in `11-zoomed-out.png`).
5. **Nothing overlaps a tile boundary.** Every element is authored inside its own diamond. Nature never respects a grid; the moment grass laps over a path edge or a soil bed's lip breaks the diamond line, the grid disappears perceptually.

### 1.2 Prescriptions

**a) Kill the checker, add macro patches.** Replace the parity test with 3–4 grass value variants chosen by *smoothed* noise (bilinear-interpolated `hash`, i.e. a `vnoise(x*0.35, y*0.35)`), so tone changes in soft 3–6-tile islands instead of per tile. Then overlay 10–20 large radial-gradient meadow blobs (radius 1.5–3 tiles, alpha 0.15–0.25, squashed 2:1) per season — see the proto's "macro patches" block. Cost is zero at runtime if the ground layer is baked (§7).

**b) Tile transitions (grass↔dirt↔field).** Right now `drawSoil` beds simply sit on grass with a hard 1.5px stroke. Add a **transition skirt**: when a soil tile borders grass, draw 4–6 small grass-colored ellipses lapping over the bed's lip on that edge (and inversely a few dirt crumbs on the grass). Same trick for path edges and the pond bank. This is the highest-leverage 30 lines of code in this review: overlap is what deletes the grid. Use the tile's `hash` so the scallops are stable frame to frame.

**c) Worn paths between buildings.** The farm's buildings (coop, barn, bakery, dairy, mill cluster in `02-spring-day.png`) have no circulation — nobody apparently walks anywhere. Generate a path network once at farm creation: a polyline from the field centroid to each building door, plus one "main lane" to the map edge. Render each as layered blob-strokes: wide dark moist edge → mid tone → narrow dry light center, plus two faint wheel-rut curves and a few pebbles (see proto path). Store it in state, draw it in the ground pass after tiles, before parcels. Re-derive when a building is placed/moved. Even 2 paths instantly make the farm read as *inhabited*.

**d) Clustered organic decor, not uniform scatter.** `drawDecorTile()` currently rolls `hash(x,y) < 0.38 → tree` per tile, which yields the "tree lawn" in `11-zoomed-out.png`: near-lattice spacing, uniform density, same 3-circle tree everywhere. Replace per-tile rolls with **cluster seeds**: pick ~N seed points per unused region (deterministic from parcel index), and around each seed spawn 3–7 items with falloff (trees + 1–2 bushes + a stump or rock + flowers at the sunny edge). Leave deliberate *empty meadows* — negative space is what makes clusters read. Add 2–3 tree size/shape variants (tall/lean, round, double-trunk) and let `hash` pick; vary canopy hue ±6%. Keep the existing `drawTree` sway.

**e) Edge-of-world treatment.** `render()` fills the screen with `shade(pal.edge, 0.82)` — a flat void; the map floats like a game board (`11-zoomed-out.png`). Two-step fix:
   1. **Soil cliff rim** on the two south-facing map edges: a 12–16px dark earth face below the last tile row, with a scalloped grass lip overhanging it, fading to shadow at the bottom (implemented in the proto — instantly grounds the world as a "diorama on a hill", which suits the game's toy scale).
   2. **Context ring** beyond the rim: cheap silhouette bands — a darker meadow gradient, then 2 rows of blurred canopy blobs (a forest treeline) drawn once into the baked ground canvas, plus a horizon fog gradient toward the screen background color. Never show flat untextured color adjacent to the playfield.

**f) The pond — spec for a beautiful one.** `drawPond()` is two ellipses + 3 ripple arcs + a duck, hardcoded at `proj(1.6, 7.8)` where it currently *clips through the map edge* (see `11-zoomed-out.png` — half the pond hangs over the void). Target spec, all Canvas-2D-cheap:
   - **Organic bank polygon**: 10–12 points around an ellipse with `hash`-jittered radii (stable), not a perfect ellipse.
   - **Bank build-up (outside→in):** grass overhang scallops → a 4–6px wet-sand/mud ring (`#a08a62` → `#6f5a3e`) → water.
   - **Depth gradient:** radial gradient from warm shallow teal (`#7fb8c9`) at the rim to deep blue-green (`#2e5d7d`) center. This one gradient is 70% of "beautiful water".
   - **Inner bank AO:** a dark soft stroke just inside the waterline so the bank lip casts onto the water.
   - **Reeds & cattails:** 2–3 clumps on the far (north) bank — 5–7 tapered strokes each with brown cattail heads; they overlap the water and break the outline.
   - **Lily pads:** 2–3 notched ellipses with one pink blossom, drifting ±2px on `sin(time)`.
   - **Sparkle:** 4–6 tiny white dashes near the sun side, opacity keyed to `sin(time*3 + i)`; skip when weather is rain/snow.
   - **Ripple rings** that expand and fade from the duck's position instead of the current three concentric static arcs.
   - **Seasonal states:** winter = pale frozen fill + 2 crack strokes + snow rim; drought = shrink water radius 12%, widen the mud ring.
   - Make the pond occupy actual tiles (mark them `k:'water'`) so decor/buildings can't spawn in it and the bank transitions can use the standard tile-edge logic.

---

## 2. Soil & crop beds

`drawSoil()` today: two stacked 90%-size diamonds (side + top) + a 1.5px outline + 3 straight furrow lines + a 10%-alpha blue film when wet. Problems: the furrows read as *planks* (uniform straight strokes), there is no lit/shadow side (the "raised" bed has no light logic — the side is a uniform darker diamond all the way round), wet vs dry is nearly invisible in screenshots, and beds don't cast contact shadow on the surrounding grass.

Target spec (all demonstrated in the proto's `soilBed()`):

1. **Lit/shadow sides.** Split the raised lip into two faces matching the buildings' light: SW face lighter, SE face darker. The game already commits to SW-lit in `isoBox()`; the ground must obey the same sun.
2. **Contact AO.** A soft dark diamond 6% larger under the whole bed (alpha ~0.28). Beds instantly sit *in* the grass instead of on it.
3. **Ridged furrows, not lines.** Each furrow = paired strokes: a 3px dark trench + a 1.8px warm lit crest offset 3px toward the light, with slight sine wobble so they read hand-dug. 4 rows per tile, drawn inside a clip of the bed top. Crop sprites should then sit **on the ridges**, and each plant gets a tiny 4×1.6px ground shadow ellipse — crop-row shadowing is what makes planted fields read at world scale (`11-zoomed-out.png` currently shows floating green glyphs on brown).
4. **Moist sheen.** Replace the flat blue film with a *linear* cool gradient swept across the top (two soft specular bands, alpha 0.12–0.16) plus darkening the base soil ~20%. Dry–wet difference must be readable at `cam.z 0.5` because watering is a core verb. Optionally 2–3 darker splash blobs right after watering that fade over 10s.
5. **Mulch texture.** ~20 tiny 1–2px flecks (dark clods + a few light straw bits) from `hash`, clipped to the top. Bake dry and wet variants; this costs nothing per frame.
6. **State readability at world scale (rules, not decorations):**
   - *Fertilized:* keep the gold flecks but also warm the soil tone +5% — a whole-tile cue survives zoom-out; three orbiting dots don't.
   - *Wilting:* desaturate the bed top toward gray-brown and add 2–3 crack strokes; the current cue lives only on the plant.
   - *Ripe:* the existing radial glow in `drawCrop` is good — additionally lighten the bed rim 8% so ready tiles pop as a *field pattern* when zoomed out (players harvest by scanning color blocks, like Hay Day).
   - *Dead:* gray soil + the existing withered sprite.
7. **Winter:** beds should get snow caught in furrow troughs (white strokes in the trench positions) rather than staying summer-chocolate under falling snow as now.

---

## 3. Buildings

### 3.1 Diagnosis

`drawBarnLike()` renders **every** production building — coop, barn, mill, bakery, creamery, press, loom — as the *identical* silhouette: same `isoBox` + `hipRoof` + door quad + window quad + text label. Only the palette and the sign string change (`data.js BUILDINGS`). In `11-zoomed-out.png` the farm looks like a housing subdivision: five same-shaped houses. Specific gaps:

- Walls are single flat fills (`shade(wall, 0.96/0.74)`); no material read (planks? stucco? stone?).
- Roofs are 4 flat triangles; no shingles, ridge caps, chimneys, or eave shadow, so roofs look like folded paper.
- The window is a flat cream quad that never lights up — at night (`09-night.png`) the whole farm is dead; the day/night pass just multiplies everything darker.
- The door is a flat dark quad with no frame, recess, or lintel — zero depth.
- The sign is a floating white rounded-rect with text; charming idea, but it needs brackets/posts to belong to the wall.
- `shadow()` gives every building the same centered ellipse; light direction says SW-lit walls, but the shadow doesn't agree, and there is no ambient occlusion where walls meet grass.

### 3.2 Upgrade path (Township-tier within procedural canvas)

All of the following is in the proto barn (`proto-barn.png`) and is a direct drop-in around the existing `isoBox`/`hipRoof` scaffolding:

1. **Stone foundation course** (~9px): two gray faces with staggered joint strokes and a light top edge. Universal across buildings; instantly adds "construction".
2. **Plank walls.** Divide each wall face into 8–10 vertical boards; per-board value jitter ±7% via `hash`, thin dark seams, then two gradients: grime up from the ground (alpha .28→0) and eave light at the top. Material variants per building: planks (barn/coop), horizontal siding (bakery/dairy — swap board direction), plaster + timber frame (mill — flat fill + 3 dark beam strokes), so silhouette stays shared but *material* differentiates. **Note the bug class I hit while prototyping:** `shade()` only parses hex, so never feed its `rgb(...)` output back into itself — precompute lit/shaded hex constants per wall.
3. **Roof materials.** Inside each `hipRoof` face (clip to the triangle): 6–8 shingle course lines lerped from eave to apex (dark line + 1px highlight above), staggered vertical ticks per course, and a sun gradient down the face. Add **ridge caps** (thick light strokes apex→corners), a **fascia board** along the eaves, a 6px **eave shadow** cast onto the wall tops, a stone **chimney** on one slope (creamery/bakery get smoke puffs from your particle system when a recipe is running — free "this building is working" feedback), and a **weathervane** on the barn apex.
4. **Doors with depth:** dark recess fill → inset door leaf 2px smaller → white frame stroke → lintel shadow band at top → X-brace strokes for barn/coop, panel lines for shops. A straw spill ellipse at the barn threshold ties the door to the ground.
5. **Windows with night glow.** White frame + mullion cross + sill; glass = warm two-stop gradient plus one diagonal white reflection streak (alpha .28). At night: register each window quad in a `lights[]` array while drawing; after `drawDayNight`'s dark overlay, re-fill the glass with bright warm color and stamp a radial warm halo (`globalCompositeOperation='lighter'`, radius ~40px) plus a faint light pool parallelogram on the ground below. This single feature makes night the prettiest time of day instead of the dimmest — the #1 emotional upgrade available.
6. **Awnings** for retail-flavored buildings (bakery, press): a two-color striped canvas quad over the door at 30°, with scalloped bottom edge — 15 lines, huge charm.
7. **Ambient occlusion at ground contact.** Replace the single `shadow()` ellipse with (a) a soft directional radial gradient offset NE (sun from SW), and (b) a tight dark strip hugging the wall base line, plus 3–4 grass tufts overlapping the base (proto shows both). Buildings stop hovering.
8. **Prop dressing per building type** (see §4 list): 2–3 fixed props drawn as part of the building's render at deterministic offsets — hay bales + trough by the barn, nest boxes + feed scatter by the coop, flour sacks + bread crate by the bakery, milk churns by the dairy, grain sacks by the mill, fruit barrels by the press, yarn spools + drying rack by the loom. This is *the* Playrix trick: buildings are dioramas, not boxes.
9. **Greenhouse & well polish.** Greenhouse (`drawGreenhouse`): add a vertical glass gradient (sky-blue top → warm green bottom from the plants inside), one diagonal reflection streak per face, a proper ridge beam, and 3–4 visible potted-plant silhouettes through the glass; at night give it a magical cool-green glow. Well (`drawWell`): give the roof shingle strokes, hang the bucket off-center on a visible rope, add a puddle + 2 stones at the base.

---

## 4. Props & storytelling scatter

Fifteen-plus new procedural props, priority-ordered. Each is 15–40 lines in the style of `drawScarecrow`, drawable once into a cached sprite. The rule: **props cluster around buildings and path junctions** (stories), never uniform-scattered.

| # | Prop | Notes |
|---|------|-------|
| 1 | **Hay bale** (round, on side) | Barn/field dressing; cylinder + spiral end + twine straps (in proto). Stackable pairs. |
| 2 | **Wooden crate / crate stack** | Universal dressing near every production building (in proto). Optionally show the building's product emoji peeking out. |
| 3 | **Lamp post** | Along paths + at building doors; wooden post, iron arm, glass lantern. **Lights at night** via the same `lights[]` system as windows — transforms the night scene. |
| 4 | **Barrel** (with rainwater sheen) | Press/bakery corners; catch a reflective ellipse on top (in proto). |
| 5 | **Mailbox on a post** | At the main-lane entrance; red flag up when an order is ready = free gameplay signal. |
| 6 | **Hand cart / wheelbarrow** | Path junctions; tilted body + one big spoked wheel; can hold produce. |
| 7 | **Milk churns** (2–3) | Dairy/barn door (in proto). |
| 8 | **Flour/feed sacks** (leaning trio) | Mill + bakery; rounded rects with tie-off knots and a stencil mark. |
| 9 | **Water trough** | Barn/coop paddock; wood box + water gradient + drip; animals wander near it (they already wander via `animalEntities`). |
| 10 | **Laundry line** | Between farmhouse-ish buildings; two posts, sagging rope, 3 colored shirts with existing `sway` math — instant "someone lives here". |
| 11 | **Log pile + chopping stump with axe** | Near barn; circles with ring strokes; classic cozy signifier. |
| 12 | **Beehive** (white box or skep) | Near flower clusters; 2–3 orbiting bee dots in summer (reuse fert-fleck orbit code). |
| 13 | **Stepping stones** | 3–5 flat stones along path forks. |
| 14 | **Compost heap** | Behind coop; dark mound + straw flecks + 1 fly from the rot-fly code. |
| 15 | **Birdhouse on pole** | Decor clusters; occasional ambient bird (reuse `drawAmbient` butterflies) perching. |
| 16 | **Produce stand / display crates** | Next to the FOR SALE→SOLD parcel sign posts; ties economy fantasy into the world. |
| 17 | **Dog house + sleeping dog** | Near farmhouse; the pet is a retention icon in every Playrix title. |
| 18 | **Rain puddles** | 2–3 sky-tinted ellipses at path low points during/after rain, fading over a day — weather leaves a trace. |
| 19 | **Signpost with 2–3 direction fingers** | Main path fork; "MARKET →". |
| 20 | **Seasonal set dressing** | Pumpkin pile (fall), snowman + sled (winter), flower cart (spring). One prop per season, swapped by `state.season`. |

---

## 5. Fences, parcels, signs

- **Fences** (`drawFence`): 4px posts with 2 dead-straight rails, drawn on N/W edges only, and they visibly collide with props (rails cross the well in `10-closeup.png`). Upgrade: chunkier posts with beveled caps and lit/shaded faces, per-post ±1px `hash` jitter and height variance, rails with a 1.6px sag curve and a thin top highlight (all in the proto). Draw all four sides but **auto-gap** segments where a path crosses and drop in a simple gate (two posts + diagonal brace); skip rails behind buildings. Fence corners get a doubled post. In winter, a snow line on top rails.
- **Locked parcels** (`drawParcels`): the flat `rgba(28,22,10,.28)` fill + white dashes reads as police tape and kills the scene's color harmony (it's the dominant feature of `02-spring-day.png`). Replace with: *no dark fill at all* — instead render locked land as **wilder terrain** (denser decor clusters, taller grass tufts, slightly desaturated palette −10%), bounded by a **surveyor's rope fence**: short wooden stakes at intervals with a sagging rope line (solid, thin, `rgba(240,230,200,.6)`). Wild-vs-kept grass is how Township communicates "not yours yet" without painting the world gray. Keep a subtle dashed outline only while the buy-confirm sheet is open.
- **Signs** (`drawSign`): the white-on-wood floating boards are actually charming but oversized and centered mid-parcel (they dominate `11-zoomed-out.png`). Move each to the parcel's front corner post, shrink ~25%, tilt 2–3°, add a second support post, nail heads, a price tag hanging below on a string, and a 2px drop shadow of the board onto the post. On purchase, swap to a brief "SOLD!" board that pops (use `addBurst`) then removes — a tiny ownership ceremony.

---

## 6. Top 10 prioritized recommendations

Each references the actual functions in `/home/user/farm/js/render.js`.

1. **Bake static art into offscreen-canvas sprites** — the enabler for everything else. Terrain layer per season, building sprites per type, prop sprites, tree variants. See §7. *(Touches: `render`, new `SpriteCache` module.)*
2. **Ground de-gridding:** kill the parity checker + per-tile grid stroke in `drawGroundTile`; smoothed-noise value variants + macro gradient patches + clustered tufts/clover/flowers with edge overlap. *(`drawGroundTile`, new `bakeGround()`.)*
3. **Soil bed rebuild:** lit/shadow lip, contact AO, ridged wobbly furrows, real moist sheen, mulch flecks, crop ground-shadows, whole-tile state tints (fert/wilt/ripe/dead). *(`drawSoil`, `drawCrop`.)*
4. **Building material pass:** foundation course, plank/siding/timber walls with grime + eave gradients, shingled roofs with ridge caps + eave shadow, recessed doors, framed windows, chimneys, per-type dressing props. *(`drawBarnLike`, `isoBox`, `hipRoof`; split into `drawWalls`/`drawRoof` helpers so coop/barn/shops share parts but differ in material + one signature prop.)*
5. **Night light system:** collect window/lamp quads into `lights[]` during the entity pass; after the dark overlay in `drawDayNight`, redraw glass bright + stamp `lighter` halos + ground light pools. Dusk gets warm window pre-glow. *(`drawBarnLike`, `drawDayNight`, new `drawLights`.)*
6. **Worn path network** between buildings + main lane, layered blob strokes with ruts and pebbles; regen on building placement. *(new `buildPaths()` in game state, drawn between ground and parcels in `render`.)*
7. **Pond rebuild** per §1.2f: organic bank, mud ring, depth gradient, reeds, lilies, sparkle, expanding duck ripples, seasonal frozen/drought states; occupy real tiles. *(`drawPond`.)*
8. **Edge-of-world diorama rim:** soil cliff + grass lip on south edges, forest silhouette ring + fog gradient beyond; remove flat `shade(pal.edge,0.82)` void. *(`render` background block, baked.)*
9. **Locked-parcel rework:** wild-grass treatment + stake-and-rope boundary + corner-post FOR SALE signs; dashed overlay only during purchase preview. *(`drawParcels`, `drawSign`.)*
10. **Prop set, first wave:** hay bales, crates, barrels, churns, sacks, lamp posts, mailbox, laundry line, water trough, log pile — placed deterministically around buildings and path joints. *(new `drawProp(type, …)` + placement table keyed by building type.)*

### Buckets

**Quick wins (hours each, ship this week)**
- Remove checkerboard + grid stroke; add macro patches (rec 2, partial).
- Soil AO + lit/shadow lip + furrow wobble (rec 3, partial).
- Building contact AO + eave shadow + foundation strip (rec 4, partial).
- Sign shrink/tilt/corner-post move; SOLD pop (rec 9, partial).
- Grass tufts breaking building baselines; snow on rails/roofs in winter.

**Medium (a few days each)**
- Full building material pass with per-type dressing (rec 4).
- Night light system (rec 5).
- Path network (rec 6).
- Pond rebuild (rec 7).
- Fence upgrade with gates + all four sides (§5).
- Prop wave 1 (rec 10).

**Big bets (a week+, transformative)**
- Sprite-cache architecture + per-season baked terrain with transitions and clustered decor (recs 1, 2, 8 complete) — this is the one that lets close-up (`10`) and zoomed-out (`11`) both look rich at 60fps.
- Full seasonal terrain re-theming (snow accumulation on beds/props, fall leaf litter drifts on paths, spring blossom clusters).

---

## 7. Performance architecture note (Canvas 2D, mid-tier phones)

Today `render()` re-issues every path for all 300 ground tiles + all buildings + all decor **every frame**. That caps how much detail you can afford. The fix that unlocks everything above:

- **Terrain layer:** bake the whole static ground (tiles, macro patches, transitions, paths, pond bank, rim, decor shadows) into one offscreen canvas per season at world scale (~1920×840 + margins; one bake on season change, plus dirty-rect rebakes when a tile becomes soil). Per frame it's a single `drawImage`.
- **Sprites:** each building type, tree variant, and prop baked once at max zoom into a sprite atlas canvas (`document.createElement('canvas')`), then `drawImage`d with the world transform. Keep only genuinely dynamic art immediate-mode: crops (sway/growth), animals, water sparkle/ripples, smoke, weather, lights, badges.
- Rough budget after baking: 1 terrain blit + ~40 sprite blits + ~60 dynamic draws per frame — comfortably 60fps on a mid-tier phone, with art density 10x today's.

---

## 8. Proof of concept

`proto-barn.html` (open in any browser) → rendered to `proto-barn.png`. Same 96×48 iso math as `render.js`, pure Canvas 2D, no assets. It demonstrates, side by side in one vignette: macro-varied blended grass, an organic worn path with ruts and pebbles, dry + wet ridged raised beds with sprout rows and row shadows, the full barn upgrade (stone foundation, jittered plank walls with grime/eave gradients, shingled hip roof with ridge caps, chimney, weathervane, recessed X-brace door with straw spill, glowing framed window, hung sign, directional AO, base tufts), fence with beveled sagging rails, prop dressing (hay bales, crate stack, rain barrel, milk churns), and the soil-cliff world edge. Every technique maps 1:1 onto an existing function named above.
