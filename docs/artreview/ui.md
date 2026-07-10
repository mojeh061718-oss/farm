# Harvest Empire — UI/UX Visual Design Review
**Reviewer:** Lead UI/UX Visual Designer (mobile F2P, top-grossing farm/sim portfolio)
**Date:** 2026-07-10
**Scope:** DOM/CSS interface only — HUD, sheets, shop, toasts, modals, setup, motion, accessibility. Not world art, not gameplay.
**Material reviewed:** live game (`/home/user/farm/index.html`), `css/style.css` (610 lines), `js/ui.js` (1,100 lines), `js/data.js`; screenshot pack 01–15 plus four states I captured myself (16-orders, 17-menu, 18-toasts, 19-levelup, in `../shots/`).

---

## 1. Verdict vs. genre leaders

**Score: 5.5 / 10** against Hay Day / Township production quality. That is a *good* score for a hand-rolled DOM UI — the bones are genuinely strong — but the missing 4 points are exactly what players subconsciously price as "premium."

**What already reads as premium**
- **Information architecture is shippable as-is.** Pills top, goal chip below, side buttons right, 6-slot toolbar bottom, bottom sheets for depth — this is the correct genre grammar and it's all in the right place.
- The **toolbar** is the best surface in the game: dark wood plate, warm gold active state, inset water gauge on the Water tool. That gauge-in-button is a genuinely Supercell-grade detail.
- **Bottom-sheet pattern** with grabber, backdrop, tabs, and consistent card/row components. `ui.js` builds everything from two components (`item-card`, `row-card`) — a real system, not ad-hoc markup.
- Consistent warm palette (cream / brown / green / gold), chunky bevel buttons (`inset 0 -3px`), pill radii — a coherent voice.
- Smart product touches leaders would keep: fuel pill only appears once you own powered gear; off-season seeds get a warning treatment; "hot item" market banner; animal condition bars.

**What reads as "web page"**
1. **Emoji everywhere.** The single hardest quality cap. A 7-Eleven storefront 🏪 for Shop, a jack-o'-lantern 🎃 for Scarecrow, a bowl of cooked rice 🍚 for a rice *crop*, ⚖️ for Market, 🥬 for Turnip. Emoji render differently on iOS/Android/Windows, can't be recolored, can't take state, and semantically misfire. (See §2.)
2. **The declared fonts never load.** `font-family: 'Nunito', 'Quicksand', …` but there is no `@font-face` and no bundled file — every player falls through to a different system sans. The friendly rounded voice the CSS *intends* doesn't exist on-device.
3. **Flat single-layer surfaces.** Cards are white with one hairline border and a 6px shadow; sheets are one flat cream. No recessed wells, no material accents, no light logic (highlight top / shade bottom). Leaders build 3 layers minimum: surface → plate → control.
4. **Prices are text, not buttons.** `$500` in brown text at the bottom of a card is a spreadsheet; a gold coin-chip button is a game.
5. **No motion system.** Everything is a 0.1–0.3s one-shot CSS animation on open. Nothing celebrates a purchase, nothing flies to the wallet, numbers snap instead of ticking.

**Before / after:** compare `../shots/12-shop.png` (current) with **`mockup-shop.png`** in this folder (built from `mockup-shop.html`, same real content, zero external assets). Same layout, same data — the delta is icons, tokens, layering, and price buttons. That's the whole gap in one image.

---

## 2. The emoji problem — replacement strategy

### Inventory (from `data.js`)
| Category | Count | Notes |
|---|---|---|
| Items (crops + animal products + artisan) | 35 | `ITEMS` — the master set; crops (18) reuse these icons in the seed sheet |
| Buildings | 12 | `BUILDINGS` |
| Animals | 6 | `ANIMALS` |
| Tools / equipment | ~9 | 6 toolbar tools + tilling/watering tiers + fertilizer |
| Seasons + weather | 10 | 4 seasons, 6 weathers |
| UI utility | ~18 | coin, fuel, star/XP, storefront, scales, clipboard, gear, close, check, lock, warning, truck, sick/happy/sad condition faces, land sign, box |
| **Total unique symbols** | **~80–90** | Goal icons (`GOALS`) reuse the above |

### Recommendation: **inline SVG symbol sprite** (not canvas-drawn icons)
The UI is DOM; keep the icons DOM-native.

- **Crisp at every DPR and size** (20px tab glyph → 60px shop plate from one asset). Canvas icons need re-raster per size/DPR.
- **CSS-stylable:** `currentColor` accents, state via CSS (`filter: grayscale()` for locked already works), no JS redraw on theme/state change.
- **Composable:** badges, checkmarks, ribbons layer in DOM.
- **Zero runtime cost / zero network:** one hidden `<svg><defs>` block injected at boot, referenced via `<use href="#i-wheat">` — satisfies the no-external-assets constraint.
- The world art is flat vector canvas; flat 2-tone SVG with soft outlines matches it *better* than rasterized canvas icons would — the mockup proves the style match.

Canvas-drawn icons would only win if you generated icons literally from the same draw functions as world sprites. **Hybrid worth considering later:** generate the 18 *crop* icons at boot from the `render.js` crop templates onto small canvases → data-URIs, so field art and UI art can never drift. Everything else: SVG.

### Migration plan (3 phases, each independently shippable)
1. **Phase 1 — currency, HUD, chrome (~15 symbols, 1–2 days).** Coin, fuel can, XP star, calendar/day, weather set, storefront, market stall, clipboard, gear, close/check/warning. Add `js/icons.js` exporting `icon(id, cls)` → `'<svg class="ic '+cls+'"><use href="#i-'+id+'"/></svg>'`; inject sprite once at boot. Replace `.picon`, side buttons, sheet titles.
2. **Phase 2 — shop & toolbar (~30 symbols).** 12 buildings, 6 animals, tools. Add an optional `icon` field beside `emoji` in `data.js`; `icon()` falls back to the emoji when a symbol doesn't exist yet, so migration never blocks a release.
3. **Phase 3 — items (~35 symbols).** Crops, products, artisan goods; used by seed sheet, market, orders, recipes. Retire the emoji fallback. Keep emoji only inside toast *sentences* if desired — fine as flavor in prose, deadly as system iconography.

### Icon language rules
24×24 grid, 1.5px padding safety; filled 2-tone shapes; outline stroke 1.2–1.5px in a **per-hue dark** (wood `#6d4c2e`, barn red `#6d2317`, gold `#8a5b10` — never one global black); round joins/caps; one highlight max; front-facing (no isometric skew at icon scale); silhouette must read at 16px.

### Example icon specs (all implemented in `mockup-shop.html`)
- **Coin (`#i-coin`)** — the most-seen icon in the game: r10.4 circle, vertical gold gradient `#ffd75e→#f0a41c`, rim stroke `#8a5b10` 1.4px, inner ring r7.2 @ 55% opacity, `$` glyph as path (not text). Reads at 14px.
- **Barn (`#i-barn`)** — gambrel silhouette: red body `#b6412c`, dark-red outline `#6d2317`, cream door panel with X cross-brace. Replaces 🐄-used-as-a-building.
- **Fuel can (`#i-fuel`)** — jerrycan rounded rect `#d2402c`, handle, spout, gold diamond emblem; works at pill size (20px) and shop row (40px). Replaces ⛽.
- **Well (`#i-well`)** — stone basin + red gabled roof + oversized water drop `#57c1f0`; the drop is the "what it does" cue, sized to survive 16px.

---

## 3. Design system prescription

### Typography
Self-host **Nunito** (or Baloo 2) as a single variable woff2 (~90KB, local file or base64 — still "no network at runtime"), with an honest fallback stack:
`ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif`.

Scale (rem-based so large-text mode is one line, §7):
| Token | Size | Weight | Use |
|---|---|---|---|
| `display` | 28 | 900 | setup title, level-up |
| `title` | 22–24 | 900 | sheet titles |
| `body-lg` | 16 | 800 | pills, buttons, card names |
| `body` | 14 | 700–800 | row text, tabs |
| `caption` | 12 | 700 | descriptions, sub-lines — **floor. Nothing below 12px.** (Current CSS has 10px and 11px in nine places.) |

Numbers: `font-variant-numeric: tabular-nums` on coins, prices, timers — mandatory for tick-up animation (§6).

### Spacing
4px base grid: 4/8/12/16/24/32. Current CSS is *almost* there (5, 6, 7, 9, 10px sprinkled in) — snap everything. Card grid gap 10→12; sheet gutter 14→16.

### Radius & elevation
| Token | Value | Use |
|---|---|---|
| `--r-s: 10px` | inputs, mini-buttons |
| `--r-m: 14px` | buttons, icon plates, tabs (or 999 pill) |
| `--r-l: 20px` | cards |
| `--r-xl: 28px` | sheets, modals |

Elevation — 3 levels + bevel, replacing the single `--shadow`:
- `--e1: 0 1px 2px rgba(46,32,19,.14), 0 2px 6px rgba(46,32,19,.10)` (cards)
- `--e2: 0 2px 4px rgba(46,32,19,.16), 0 6px 16px rgba(46,32,19,.14)` (pills, floating buttons)
- `--e3: 0 4px 8px rgba(46,32,19,.18), 0 14px 34px rgba(46,32,19,.22)` (sheets, modals)
- `--bevel: inset 0 1.5px 0 rgba(255,255,255,.55), inset 0 -2.5px 0 rgba(46,32,19,.18)` (every pressable control — this is the "toy" feel)

### Color tokens
```css
--ink:#33261a;  --ink-soft:#6b5740;  --ink-faint:#8a7458;   /* text: ~14:1 / ~6:1 / decorative only */
--cream-hi:#fffdf7; --cream:#faf1dd; --parchment:#f1e4c8;   /* card / sheet / recessed wells */
--line:#e2d1ae; --line-deep:#c9b489;
--wood-9:#2e2013; --wood-7:#4a3522;                          /* toolbar, toasts, wood rail */
--grass-4:#64b953; --grass-5:#4ca03f; --grass-6:#3c8a33;    /* primary */
--gold-4:#ffcf57; --gold-5:#ffb424; --gold-6:#e08900; --gold-ink:#5b3c00;
--danger-5:#d2402c;  --sky-5:#2f9fd8;  --price:#7d5b00;
```
Key change: **retire `#97876a`** (current secondary text, ≈3.5:1 on white — fails WCAG at its 10–11px sizes) in favor of `--ink-soft` (≈6:1).

### Button hierarchy
1. **Primary (green):** grass gradient + bevel + white 900 text — advance actions (Feed, Craft, Place, Start).
2. **Gold (money):** gold gradient + `--gold-ink` text + coin icon — anything that spends or earns. **Every price becomes a gold button** (see mockup). Gold = money, exclusively; stop using it for generic emphasis.
3. **Danger (red):** destructive only (Sell animal, Reset). Current `ui.js` has five ad-hoc inline gradients for sell/vet/skip buttons — collapse to tokens.
4. **Quiet:** parchment bg, `--ink-soft` text, *inset* shadow (recessed = secondary): Cancel, Skip, tabs at rest.
5. **Disabled:** keep shape and label, desaturate fill only — **never grayscale the item art** (current `.item-card.disabled { opacity:.5 }` punishes browsing; §5 affordability).

### Panel material — decision
**Keep the cream sheets. Do not go full wood/parchment.** Full-skeuomorphic wood panels are (a) a readability tax on older players, (b) dated, (c) expensive to keep consistent in DOM. The farm brand comes from *accents* instead: a 7px wood rail capping every sheet (see mockup `.sheet::before`), parchment recessed wells for tabs/gauges, wood-dark plates for toolbar/toasts/wallet, warm cream everywhere else. That's the Hay Day recipe: light panels, wooden trim, gold money.

### Iconography stroke/fill rules
See §2 icon language rules — filled 2-tone, per-hue dark outlines 1.2–1.5px, rounded joins, front-facing, 16px silhouette test.

---

## 4. HUD critique

*(refs: `../shots/02`, `05-winter-snow`, `09-night`, `12`)*

- **Legibility over scenes: the real risk is snow, not night.** Cream pills at `rgba(255,250,235,.95)` with a 25%-alpha border float fine over green/dark scenes but wash into the winter scene (shot 05) where the background is near-white. Night is fine. Fix: border `rgba(88,62,32,.5)`, gradient fill `#fffdf6→#f6ecd4` (gives the pill its own bottom edge), two-part shadow `0 3px 8px rgba(20,14,6,.35), 0 1px 2px rgba(20,14,6,.3)`. No scrim needed.
- **Clock pill is overloaded:** season emoji + "Day 1" + weather emoji + "→⛅" forecast + day progress bar = five data points in ~120px. `→⛅` is cryptic (reads as "windy"). Keep **Day + current weather**; move forecast + season into a tap-to-expand day panel; make day-progress a thin ring around the weather icon instead of a detached 34px bar (which `@media ≤460px` already deletes — proof it isn't earning its space).
- **Level pill:** a 54px XP bar (26px on small phones!) communicates nothing. Make the XP bar a **progress ring around the level badge** — tighter, always visible, and it gives the badge a fill-up celebration moment.
- **Coins pill:** deserves its hero slot, but add a `+` affordance opening Market (mocked up), the SVG coin instead of a CSS circle with `$`, and coin-flight target semantics (§6).
- **Fuel:** progressive disclosure (hidden until powered gear) is genuinely good design — keep. The `fuel-low` box-shadow pulse is the right idea; add a color shift and respect `prefers-reduced-motion`.
- **Goal chip:** right pattern, two flaws. (1) Reward text `+$40` in `#8a6100` on `#ffecb3` ≈ 3.9:1 — darken to `--gold-ink`. (2) No completion payoff — the chip just swaps content in `updateGoalChip()`. Spec: check stamp → chip scales 1.06 → reward pill detaches and flies to coins → new goal slides in (§6).
- **Toasts — the 68-year-old playtester is right.** Current: 13px text, 3.1s fixed lifetime (`fade-out .4s ease 2.6s` + `setTimeout(3100)`), max 3, `pointer-events:none`, then gone forever. Spec:
  - 15px/800 text, min height 40px;
  - duration = `max(3.5s, 2s + 60ms × chars)` — reading-rate-based;
  - pause the queue while a sheet is open (toasts currently z-fight at z50 over sheets, shot 18);
  - tap-to-dismiss (`pointer-events:auto`);
  - **event journal:** every toast pushed to a ring buffer (last 50), readable from a row in Menu — vanished text stops being lost information;
  - severity via icon plate (✓/!/i), not background color alone (colorblind-safe);
  - stack limit 3 with the oldest compressing upward (scale .92, −8px) instead of hard removal.
- **Badges:** red `orders-badge` for fulfillable orders = correct urgency. Red `market-badge` showing *inventory count* is a false alarm (99+ items is normal mid-game, and red should mean "action needed"). Make the market badge gold ("goods to sell"); keep red exclusively for orders.
- **Level-up splash** auto-dismisses in 2.6s — too fast for the demographic and it steals input. Require a tap ("Tap to continue"); celebrate with ring-fill + confetti burst.

---

## 5. Bottom sheets & shop

*(refs: `../shots/12`, `13`, `14`, `15`, `16`; after: `mockup-shop.png`)*

- **Header:** title is naked text with an emoji prefix (`🏪 Shop`). Give every sheet an icon plate (44px green squircle), a 24/900 title, and a one-line subtitle carrying the sheet's promise ("Everything's for sale from day one"). Close button 34px → **44px**.
- **Tabs:** text pills today; clipping ("Equipment" cut at 390px, shot 12) is the *only* scroll cue. Add icon+label tabs, a right-edge fade (`.tab-fade` in mockup), `scroll-snap-type: x proximity`. Active tab: grass gradient + bevel; rest state: *inset* parchment (recessed = not selected — a physical metaphor players parse instantly).
- **Card grid:** `minmax(96px,1fr)` is fine; fix the internals: (1) **icon plate** — 60px rounded-square well behind the icon (radial highlight over parchment) instantly reads "game item" and normalizes visual weight across icons; (2) name 14.5/800; (3) desc 11.5–12/700 `--ink-soft`, clamped to 2 lines (`-webkit-line-clamp:2`) so all cards are equal height — current cards vary 2–4 lines and the grid is ragged (shot 12: Scarecrow 4 lines vs Well 2).
- **Price presentation:** brown text → **gold coin-chip button** (`.buy` in mockup): coin SVG + tabular numerals + bevel, 34px tall (44px hit area). The price *is* the CTA; making it a button raises both perceived quality and tap-through.
- **Affordability states:** currently `opacity:.5` on the whole card — punishes window-shopping and hides the art that motivates saving. Spec: art and name stay full-color; only the price chip mutes (parchment fill, inset shadow); add a **save-up progress bar** under the chip (`coins/cost`, gold fill — mocked on Greenhouse). Tapping shows "Need $4,344 more." Aspiration is retention; don't gray it out.
- **Seed sheet** (shot 13): strongest content already (season tags, regrows badge, off-season treatment — all good calls). Upgrades: a selected-seed state (green border + check — currently *nothing* marks the active seed); season tags as tinted mini-chips rather than raw emoji; "sells ~$13" in `--price`; group by "In season now / Out of season" instead of pure price sort so safe choices come first.
- **Coop/housing panel** (shot 14): Feed-all/Collect chunky pair is right. The gray `Feed $5` disabled-gradient buttons are illegible (~2.8:1) — use the quiet-button spec. Give animal rows portrait plates; make the condition line a 3-state heart meter instead of emoji faces + tiny text.
- **Empty states** (shot 15 market): plain gray text. Spec: 64px illustration (empty crate SVG), one 15px line, **one primary CTA** ("Go harvest" closes the sheet and selects the Harvest tool). Empty states are navigation, not apologies. Same for orders' "New orders arriving soon…" — add a countdown chip.
- **Scroll affordances:** cards happen to cut at the sheet fold (accidental affordance — keep the height so a row always peeks); add a top inset shadow on `#sheet-body` when `scrollTop > 0`; add the sticky **wallet footer** (mockup): balance always visible while shopping = fewer failed purchases, and it's the in-sheet coin-flight target.
- **Sell-back rows** look identical to purchase rows (building panel) — they're destructive; quiet layout + red button, always last.

---

## 6. Motion & microinteractions (UI side)

The game has exactly one interaction curve today (`transform .1s` scale-down). Spec — all CSS/WAAPI, no libraries:

| Moment | Technique | Duration / easing |
|---|---|---|
| **Button press** | `:active { transform: scale(.96) translateY(1px) }`, `transition: transform 60ms ease-out`; on release WAAPI `[scale(.96) → 1.03 → 1]` | press 60ms; release 220ms `cubic-bezier(.34,1.56,.64,1)` |
| **Sheet open (spring)** | transform `translateY(100%) → 0` with overshoot | 380ms `cubic-bezier(.32,1.28,.32,1)`; backdrop fade 200ms linear |
| **Sheet dismiss** | `translateY(0 → 105%)` | 240ms `cubic-bezier(.4,0,1,1)` — exits fast, no bounce |
| **Purchase success** | buy button morphs: fill flips green, label → ✓ (160ms); 6–8 coin-particle burst at the button (absolutely-positioned 12px coin SVGs, random ±40px arcs, WAAPI); then coin-flight | total ≤ 700ms; never blocks input |
| **Coin-flight to wallet** | 3–5 `position:fixed` coin clones fly source → coins pill along a quadratic arc: WAAPI + `offset-path: path('M…Q…')` (or 3-keyframe translate approximation); stagger 40ms; each arrival pulses the pill `scale(1.12→1)` 150ms and starts the tick-up | flight 500ms `cubic-bezier(.5,0,.8,.6)` (accelerates into the wallet) |
| **Number tick-up** | rAF loop, `eased = 1-(1-t)^3`, write `Math.round(lerp)` per frame; requires `tabular-nums`; deltas < $200 snap | 600ms for gains; instant for spends (spending must feel exact) |
| **Goal complete** | chip green flood 200ms → check stamp `scale(1.4→1)` 250ms overshoot → reward pill clone flies to wallet → old text slides out, new goal slides in | ~1.4s total, non-blocking |
| **Toast in/out** | in: `translateY(-12px) scale(.9) → 0/1` 240ms `cubic-bezier(.34,1.56,.64,1)`; out: fade + `translateY(-8px)` 300ms | per-message duration §4 |
| **Level-up** | conic-gradient gold ray disc rotating 8s linear behind card; star drops with bounce 500ms; XP ring fills 400ms | tap-to-dismiss, no auto-close |
| **Tab switch** | content crossfade 120ms + 8px directional slide; active pill background slides between adjacent tabs | 180ms ease-out |

Global rule: `@media (prefers-reduced-motion: reduce)` → durations to 1ms; coin-flight replaced by a wallet pulse.

---

## 7. Accessibility pass

Estimated contrast (from CSS values / screenshots):

| Element | Colors | Ratio (est.) | Verdict |
|---|---|---|---|
| Body/ink on cream | `#3a2e22` / `#fffaf0` | ~12:1 | Pass |
| Secondary text `.sub`, `.empty-note` | `#97876a` / `#fff` | **~3.5:1** | **Fail** at 10–11px → `#6b5740` (~6:1) |
| Goal progress | `#8a7a5e` / cream | **~3.7:1** | **Fail** — same fix |
| Price text | `#8a6100` / `#fff` | ~5.5:1 | Pass (keep ≥14px) |
| Goal reward | `#8a6100` / `#ffecb3` | **~3.9:1** | Fail → `--gold-ink #5b3c00` |
| Gold buttons | `#4c2c00` / gold | ~7:1 | Pass — good |
| Toasts | `#fff` / `rgba(50,36,18,.92)` | ~12:1 | Pass; size/duration are the issue, not contrast |
| Disabled "Feed" buttons | white / gray gradient @ `brightness(.8)` | ~2.8:1 | Fail — quiet-button spec |

- **Text sizes:** eliminate 10px (`.tool-btn label`, `.item-card .sub`, `.lock-tag`) and 11px; floor at 12px, prefer 13–14 for anything informational.
- **Tap targets (44px min):** pass — side buttons (52), tool buttons (52×60). **Fail:** sheet tabs (~31px tall), `#sheet-close` (34), `.mini` row buttons (~30), order Skip/Deliver. `min-height:44px` everywhere (visual can stay smaller via inner padding, but the hit area must be 44).
- **Colorblind-safe status:** market ▲/▼ already pairs arrow + color — good. Off-season cards carry a text tag — fine. Animal condition: add the meter, don't rely on emoji-face hue. Toast good/bad: add ✓/! icon plates (green vs red backgrounds alone don't survive deuteranopia).
- **Large-text mode:** convert type + key paddings to `rem`, then one Menu toggle: `document.documentElement.style.fontSize = '18px'` (≈115%). Pills, cards, sheets scale coherently; the canvas world is untouched. This plus toast duration/journal directly addresses the 68-year-old playtester.
- Add `:focus-visible` rings (`outline: 3px solid #2f9fd8`) — desktop play exists (wheel-zoom is implemented).
- `prefers-reduced-motion` (§6) and `aria-label`s on all icon-only buttons (side buttons currently have `title` only).

---

## 8. Top 10 prioritized recommendations

### Quick wins (≤1 day each)
1. **Fix the font.** Bundle Nunito woff2 via `@font-face` (or accept the `ui-rounded` stack and delete the phantom families). One line of truth for the game's whole voice. *(css/style.css line 22)*
2. **Contrast + size floor.** `#97876a → #6b5740`, `#8a7a5e → #6b5740`, goal reward → `#5b3c00`; kill 10px text. ~10 CSS declarations.
3. **Toast overhaul:** 15px, reading-rate duration, tap-to-dismiss, pause under sheets, severity icons. ~30 lines in `ui.js toast()` + CSS.
4. **Tap-target pass:** `min-height:44px` on `.sheet-tab`, `#sheet-close`, `.mini`; add `aria-label`s.
5. **Prices become gold coin-chip buttons** in `item-card`/`row-card`; disabled cards keep full-color art and mute only the chip. Pure CSS + template tweak in `ui.js`.

### Medium (2–5 days)
6. **Ship the design tokens** (§3): color/radius/elevation/bevel variables, button hierarchy classes, wood rail on sheets, icon plates in cards, sticky wallet footer, tab fade. `mockup-shop.html` is the reference implementation — its CSS block is copy-adaptable into `style.css`.
7. **SVG icon system, phases 1–2** (§2): sprite + `icon()` helper with emoji fallback; HUD, chrome, shop, toolbar. The mockup already contains 22 production-quality symbols to seed the set.
8. **Motion pack #1:** press physics, sheet spring, purchase morph, coin-flight, number tick-up (§6). One ~150-line `fx.js` with WAAPI helpers; `prefers-reduced-motion` respected.

### Big bets (1–2 weeks each)
9. **Full icon migration (phase 3) + HUD recomposition:** all 35 items as SVG (or canvas-generated from crop render templates), XP ring around level badge, weather ring for day progress, simplified clock pill, goal-complete flight sequence.
10. **Accessibility & comfort suite as a feature:** large-text mode, event journal in Menu, colorblind-safe meters, tap-to-continue level-up. Market it ("Comfy Mode") — the cozy-farm demographic skews older, and this is a differentiator the leaders neglect.

---

## 9. Deliverables in this folder

| File | What it is |
|---|---|
| `report.md` | This review |
| `mockup-shop.html` | Standalone redesigned Shop sheet + HUD, real game content, inline-SVG icon sprite (22 symbols), full token system — no external assets |
| `mockup-shop.png` | Headless screenshot of the mockup (390×844 @2x) — the "after" |
| `shot-mockup.js` | Playwright script that produced it |
| `../shots/12-shop.png` | The "before" for direct comparison |
| `../shots/16–19` | Extra states captured for this review (orders, menu, toast stack, level-up) |
