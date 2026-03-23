# Farm Merge Valley — Simulator Implementation Guide

Build a single `index.html` (with linked or embedded `styles.css` and `simulator.js`) that simulates a full 50-day Farm Merge Valley sticker season. All mechanics, probabilities, and numeric values come exclusively from the attached `README.md`.

---

## Tech stack

- Vanilla JavaScript or TypeScript compiled to JS
- No UI frameworks, no charting libraries
- Google Fonts allowed
- All charts hand-built with SVG or Canvas

---

## Layout

### Top section — exactly 100svh, no overflow, no internal scroll

Two side-by-side panels.

---

**Left panel — controls**

*Simulation controls*
- Day counter: "Day X / 50"
- Star balance counter — animates on every change
- Run / Pause / Reset buttons
- Speed: 1× / 2× / 5× / 10× / Max (segmented buttons). At 1×–10×, each simulated day advances with a real-time delay (1× = 800ms, 2× = 400ms, 5× = 160ms, 10× = 80ms) and card animations play. At Max, the simulation runs as a synchronous loop and the UI updates once when it finishes — no animations.
- Seed: number input, random default, user-editable. The same seed with the same settings always produces identical output.

*Daily challenges*
Selector with four options — default is **All 10 tasks**:
- All 10 tasks (1×1★ + 4×2★ + 2×3★ + 3×4★ per day)
- Tasks 1–7 (1×1★ + 4×2★ + 2×3★ per day)
- Tasks 1–5 (1×1★ + 4×2★ per day)
- None

Challenges never produce 5★ packs under any setting.

*Star Vault configuration*

This is the most important customization surface. It consists of **preset buttons** that instantly populate all fields below, plus individually editable controls for every parameter.

**Preset buttons** (each sets all fields):
- **Spend Greedily** — all tiers enabled, priority 5★→4★→3★, start day 1, end day 50, reserve 0, unlimited purchases/day
- **5★ Priority** — only 5★ enabled (4★ and 3★ unchecked), start day 1, end day 50, reserve 0, unlimited
- **Hoard Then Spend** — all tiers enabled, priority 5★→4★→3★, start day 26, end day 50, reserve 0, unlimited
- **Never Spend** — all tiers disabled

**Editable fields** (presets populate these; user can freely adjust after):
- **Enabled tiers**: three independent checkboxes — ☑ 3★ (250 stars) / ☑ 4★ (500 stars) / ☑ 5★ (800 stars)
- **Purchase priority**: a drag-to-reorder list of the enabled tiers. The engine tries tiers in this order each day.
- **Start spending on day**: number input, 1–50
- **Stop spending after day**: number input, 1–50
- **Minimum star reserve**: number input, default 0. The engine will never make a purchase if `current_stars - pack_cost < reserve`.
- **Max vault purchases per day**: number input or "Unlimited" toggle, default unlimited.

*Live event log*
Small auto-scrolling panel showing the last 6 events. Format: "Day 5 — 5★ login → ★5 ★3 ★2 ★1 ★1 ★2" or "Day 7 — 5★ vault purchase → new ★5 + ★3 ★1 ★1 (dupe ×2 → +4 stars)".

---

**Right panel — sticker album**

- All 108 sticker cards always visible in a CSS grid
- Grouped into 5 rarity sections with a colored section header strip
- Section sizes: 1★ = 27 cards, 2★ = 21, 3★ = 18, 4★ = 18, 5★ = 24
- Uncollected cards: greyed out, "?" label
- Collected cards: colored, glowing, shows star count badge
- New collection at non-max speed: card pops in with a spring overshoot animation and glow burst
- Duplicate at non-max speed: card briefly flashes gold (stars awarded)
- Progress bar per rarity section and a total progress bar at top ("X / 108")
- Cards size adaptively using `clamp()` and viewport units so all 108 fit within this panel at 1080p+

---

### Bottom section — scrollable stats

Reached by scrolling past the 100svh top. Updates after simulation ends. Seven subsections:

1. **Season Summary** — total packs opened split by source (login / challenge / vault per tier), total raw stickers drawn, total duplicates, stars earned from duplicates (including vault remainder-slot duplicates), stars spent per vault tier, final unique sticker count and %, earliest day a 5★ sticker was collected (display "—" if none were collected across all 50 days), total vault purchases per tier.

2. **Daily Timeline** — horizontally scrollable strip, one column per day. Each column: day number, login pack tier, challenge packs opened, vault purchases (tier + count), net new unique stickers, stars earned, stars spent.

3. **Cumulative Progress Chart** — SVG or Canvas line chart. X-axis: Day 1–50. Two lines: (1) unique stickers collected, (2) star balance. Use dual Y-axes: left axis for unique stickers (fixed 0–108), right axis for star balance (0–dynamic max). Both lines are drawn against their respective axes and both animate drawing left-to-right after simulation. Label each axis clearly. Only render the vault spending start day as a vertical indicator line if at least one vault tier is enabled and the start day falls within 1–50; omit it entirely when no tiers are enabled (e.g. Never Spend).

4. **Pack Yield Breakdown** — for each pack type opened during the season, a horizontal stacked bar showing actual rarity distribution received alongside a second bar showing the theoretical expected distribution calculated analytically from the README probabilities (not simulated).

5. **Rarity Heatmap** — five rows, one per rarity, exactly as many cells as stickers of that rarity (27 / 21 / 18 / 18 / 24). Cell color intensity = day first collected (bright = early, faded = late, grey = never). Hover tooltip: "Sticker #X (★★★) — collected Day 14, seen 3× total (2 duplicates)".

6. **Star Economy Waterfall** — fully reconciled ledger. Inflows (mutually exclusive, broken down by pack source): stars from duplicates drawn in login packs; stars from duplicates drawn in challenge packs; stars from duplicates drawn in vault remainder slots. Each inflow category is further broken down by sticker rarity (1★–5★). Outflows: stars spent on 3★, 4★, and 5★ vault packs. Final: stars remaining. Total inflows minus total outflows must equal stars remaining.

7. **Strategy Comparison** — using the same seed and challenge setting as the main simulation, run all four presets (Spend Greedily, 5★ Priority, Hoard Then Spend, Never Spend) as synchronous background runs. Display a comparison table: preset name, unique stickers collected, stars spent, vault purchases per tier, stars remaining. Highlight the row with the highest sticker count.

---

## Simulation engine

Implement a `SimulatorEngine` class:

```js
class SimulatorEngine {
  constructor(config)   // seed, challengeSetting, vaultConfig
  reset()
  runDay()              // advance one day, return DayResult
  runAll()              // synchronous full 50-day run, return SeasonResult
  getState()            // return full current SimulatorState
}
```

**Sticker identity**: Track all 108 stickers individually. IDs 1–27 = 1★, 28–48 = 2★, 49–66 = 3★, 67–84 = 4★, 85–108 = 5★. A `Map<id, drawCount>` tracks how many times each has been drawn. First draw = collected. Every subsequent draw = duplicate → award stars equal to the sticker's rarity number.

**Login pack tier per day**: `((day - 1) % 5) + 1`. Day 1=1★ through Day 5=5★, then repeating.

**Challenge packs per day**: Derived directly from the README task table per the selected challenge setting. Challenges never produce 5★ packs under any setting.

**Pack opening**: One guaranteed sticker drawn uniformly at random from all stickers of the pack's rarity (may be a duplicate). Each additional slot drawn independently using the exact probability table from the README for that pack tier. Every drawn sticker: if first time → mark collected; else → award stars.

**Vault pack opening**: Only 3★, 4★, and 5★ vault packs exist. Before buying, all of the following must be true: the tier is in the user's enabled list; the vault for that tier is still open (at least one uncollected sticker of that rarity remains); the current day is within [start day, end day]; `current_stars - pack_cost >= minimum_reserve`; daily purchase count has not reached the per-day maximum. If all pass: deduct stars, draw the guaranteed sticker uniformly at random from uncollected stickers of that rarity (mark collected), then draw remaining slots using the same odds as a normal pack of that tier. Remainder-slot duplicates award stars immediately.

**Daily loop order**:
1. Open login pack → process all drawn stickers (collect or award stars)
2. Open all challenge packs for the day → process stickers
3. Vault purchase loop: iterate through the user's priority list. For each tier, if all purchase conditions pass, buy one pack, process it (including awarding stars from remainder-slot duplicates), then restart the priority list from the top. Continue until no tier passes all conditions or the per-day maximum is reached.
4. Record all events (stickers drawn, stars earned, stars spent, vault purchases) for the log and timeline.

**Seeded PRNG**: Use mulberry32 or xoshiro128**. All random draws flow through it. Results are fully reproducible from seed alone.

**Strategy comparison background runs**: For each of the four presets, construct a fresh engine with the same seed and challenge setting, call `runAll()` synchronously, collect results. Because login and challenge packs consume the same PRNG steps in the same order across all runs, their contents are identical. Vault packs introduce additional draws on top, causing divergence only at the point of purchase.

---

## Visual design

Warm storybook farm aesthetic. Palette: wheat gold, barn red, sage green, cream, soil brown. Fredoka One for headings and card labels, Nunito for body text. CSS SVG noise filter for grain texture (no image files). Cards feel tactile with rounded corners and a subtle shimmer on collected state. Animations are springy and satisfying at lower speeds, completely absent at Max speed.