# Farm Merge Valley — Simulator Implementation Guide

The simulator's core purpose is to answer one question visually: **does it matter when and how you spend your stars?** The user runs seasons, swaps between vault strategies, and the stats panel accumulates evidence across every completed season so the answer becomes unmistakably clear.

All mechanics, probabilities, and numeric values come exclusively from `README.md`. Nothing is invented.

---

## File structure

```
index.html      — entry point; links all scripts and stylesheet
engine.js       — SimulatorEngine class, PRNG, all game logic, SeasonRecord
ui.js           — animation loop, DOM rendering, event listeners, speed control
stats.js        — all stat panels, charts, multi-season history
styles.css      — all visual styling, CSS variables, keyframes
```

No build step. No bundler. No frameworks. Plain ES modules (`type="module"`). Google Fonts is the only external dependency. All charts are hand-built SVG or Canvas — no charting libraries.

**Module contracts:**

- `engine.js` exports: `SimulatorEngine`, `seasonHistory` (mutable array), `clearSeasonHistory()`, `currentSeasonComparison` (mutable, set to `null` before first season, updated after every completed season)
- `ui.js` imports `SimulatorEngine`, `seasonHistory`, and `currentSeasonComparison` from `engine.js`; imports `renderStats` from `stats.js`. It is the only module that touches the DOM directly during simulation.
- `stats.js` imports nothing from `engine.js` directly — it receives a `SeasonResult`, the full `seasonHistory[]` array, the `VaultConfig`, and the `currentSeasonComparison` object as function arguments. Exports: `renderStats(seasonResult, seasonHistory, vaultConfig, currentSeasonComparison)`
- `index.html` loads only `ui.js` as the entry point (`<script type="module" src="ui.js">`)

No circular imports. `stats.js` is a pure renderer — it reads data, writes DOM, does nothing else.

---

## Simulation engine (`engine.js`)

All game logic lives here. The engine is completely decoupled from the DOM — it knows nothing about rendering.

### `SimulatorEngine` class

```js
class SimulatorEngine {
  constructor(config)   // { seed, challengeSetting, vaultConfig }
  reset()               // restore Day 0 state, re-seed PRNG from config.seed; sets this.day = 0
  runDay()              // increment this.day by 1, then execute that day; return DayResult
                        // calling runDay() when this.day === 50 throws — call reset() first
  runAll()              // synchronous 50-day loop (days 1–50); return SeasonResult
  getState()            // return a full SimulatorState snapshot (no mutation)
}
```

### Data structures

**`SimulatorState`**
```js
{
  day: number,                    // 0–50
  stars: number,                  // current star balance
  stickers: Map<id, drawCount>,   // 108 entries; drawCount=0 means uncollected
  uniqueCount: number,            // count of IDs with drawCount >= 1
  log: EventEntry[],              // all events this season so far
}
```

**`DayResult`** — returned by `runDay()`
```js
{
  day: number,
  loginPack: PackResult,          // full draw data for the login pack; tier accessible via loginPack.tier
  challengePacks: PackResult[],
  vaultPurchases: VaultPurchase[],
  newUniques: StickerID[],
  duplicates: { id: StickerID, starsAwarded: number, source: 'login' | 'challenge' | 'vault' }[],
  starsEarned: number,
  starsSpent: number,
  netUniqueGain: number,
  starBalanceAfter: number,
}
```

> **Why `loginPack: PackResult` and not `loginPackTier: number`:** `challengePacks` exposes full `PackResult` objects so `stats.js` can compute per-tier rarity distributions for the Pack Yield Breakdown. The login pack must be consistent — a bare tier number cannot reconstruct which sticker rarities were actually drawn, because `newUniques` carries no source tag and cannot be split between login and challenge origins.

**`SeasonResult`** — returned by `runAll()`
```js
{
  seed: number,
  challengeSetting: string,
  vaultConfigSnapshot: VaultConfig,
  days: DayResult[],              // exactly 50 entries
  finalUniqueCount: number,
  finalStars: number,
  totalPacksOpened: { login: number, challenge: number, vault3: number, vault4: number, vault5: number },
  totalDuplicates: number,
  starsEarnedFromDuplicates: {
    login: { s1: number, s2: number, s3: number, s4: number, s5: number },
    challenge: { s1: number, s2: number, s3: number, s4: number, s5: number },
    vaultRemainder: { s1: number, s2: number, s3: number, s4: number, s5: number },
    // NOTE: vault guaranteed slot is always a new unique — it never contributes here.
    //       Only vault remainder slots (which draw from ALL stickers) can produce duplicates.
  },
  starsSpentByTier: { tier3: number, tier4: number, tier5: number },
  vaultPurchasesByTier: { tier3: number, tier4: number, tier5: number },
  firstFiveStarDay: number | null,
  // Set to the day on which the first 5★ sticker transitioned from drawCount 0→1.
  // null if no 5★ was collected this season. Any source (login, challenge, vault) qualifies.
  stickerDrawCounts: Map<id, drawCount>,  // final snapshot for heatmap
}
```

**`SeasonRecord`** — appended to `seasonHistory[]` after every completed season
```js
{
  seasonIndex: number,            // 1, 2, 3, …
  seed: number,
  presetLabel: string,            // "Spend Greedily" | "5★ Only" | "Hoard Then Spend" | "End-Season Blitz" | "Never Spend" | "Custom"
  vaultConfigSnapshot: VaultConfig,
  challengeSetting: string,
  finalUniqueCount: number,
  finalStars: number,
  starsSpentTotal: number,        // = starsSpentByTier.tier3 + starsSpentByTier.tier4 + starsSpentByTier.tier5 (i.e. the sum of star amounts, not purchase counts)
  vaultPurchasesByTier: { tier3: number, tier4: number, tier5: number },
  firstFiveStarDay: number | null,
  completed: boolean,             // true if finalUniqueCount === 108
}
```

**`PackResult`** — one opened pack
```js
{
  tier: number,                   // 1–5, the pack's rarity tier
  guaranteed: StickerID,          // the guaranteed-slot sticker ID
  additional: StickerID[],        // remainder slot sticker IDs (1–5 entries)
  newUniques: StickerID[],        // IDs that transitioned 0→1 in this pack
  duplicates: { id: StickerID, starsAwarded: number }[], // IDs already ≥1
}
```

**`VaultPurchase`** — one vault pack bought
```js
{
  tier: number,                   // 3, 4, or 5
  cost: number,                   // stars deducted (250 / 500 / 800)
  guaranteedNew: StickerID,       // the forced-unique sticker drawn (always a new unique — never a PackResult)
  remainderStickers: StickerID[], // the additional-slot draws only (same count as a normal pack's additional slots)
  remainderNewUniques: StickerID[],
  remainderDuplicates: { id: StickerID, starsAwarded: number }[],
  starsBalanceAfter: number,      // star balance immediately after this purchase
}
```

> **Why not `PackResult` here:** `PackResult` contains a `guaranteed: StickerID` field drawn from *all* stickers of that rarity, which directly conflicts with the vault rule that the guaranteed slot must draw from *uncollected stickers only* and never award duplicate stars. Storing only the remainder slots avoids this ambiguity.

**`VaultConfig`** — the full vault strategy configuration
```js
{
  tiers: { t3: boolean, t4: boolean, t5: boolean },  // which tiers are enabled
  priority: number[],             // ordered list of enabled tier numbers, e.g. [5,4,3]
  startDay: number,               // first day vault purchases are allowed (1–50)
  endDay: number,                 // last day vault purchases are allowed (1–50)
  reserve: number,                // minimum stars that must remain after any purchase
  maxPerDay: number | Infinity,   // max vault purchases per calendar day
}
```

**`EventEntry`** — one line in the live event log
```js
{
  day: number,
  type: 'login' | 'challenge' | 'vault',
  packTier: number,               // star rating of this specific pack (1–5); one EventEntry is created per pack opened
  stickers: { id: StickerID, rarity: number, isNew: boolean }[],
  starsAwarded: number,           // duplicate stars earned from this pack
  starsSpent: number,             // vault purchase cost (0 for non-vault events)
}
```

> **One `EventEntry` per pack, not per day.** A full-challenge day produces up to 10 individual entries (one per pack opened). `ui.js` is responsible for collapsing same-day same-tier challenge entries into a single display line in the event log (e.g. `4×2★: ★2 ★1 ★2 ★2 ★1 ★1`). `engine.js` always emits one entry per pack and never aggregates.

`seasonHistory` is a module-level array in `engine.js`. It is appended to after every season completes — whether triggered by `runAll()` or by the final `runDay()` call. It is never cleared except by an explicit "Clear History" button or a full page reload.

---

### Sticker identity

108 stickers tracked individually via `Map<id, drawCount>`. IDs are assigned by rarity block:

| Rarity | IDs     | Count |
|--------|---------|-------|
| 1★     | 1–27    | 27    |
| 2★     | 28–48   | 21    |
| 3★     | 49–66   | 18    |
| 4★     | 67–84   | 18    |
| 5★     | 85–108  | 24    |

`drawCount = 0` → uncollected (never drawn). `drawCount = 1` → collected exactly once (first draw, no duplicate awarded). `drawCount ≥ 2` → drawn more than once; award stars equal to the sticker's rarity number on every draw beyond the first.

On `reset()`, all 108 entries must be re-initialised to `drawCount = 0`.

```js
function rarityOf(id) {
  if (id <= 27)  return 1;
  if (id <= 48)  return 2;
  if (id <= 66)  return 3;
  if (id <= 84)  return 4;
  return 5;
}
```

---

### Season reset rules

On `reset()`, the following are restored to their Day 0 state:
- `stars` → `0` (star balance starts at zero each season)
- All 108 `drawCount` entries → `0`
- `uniqueCount` → `0`
- `log` → `[]`
- `day` → `0`
- PRNG is re-seeded from `config.seed`

Stars do **not** carry over between seasons. The Star Vault and Sticker Album both reset completely. This matches the README: *"both the Sticker Album and Star Vault reset at the end of each season."*

---

```js
tier = ((day - 1) % 5) + 1
```

Day 1 = 1★, Day 2 = 2★, Day 3 = 3★, Day 4 = 4★, Day 5 = 5★, Day 6 = 1★, repeating.

---

### Challenge packs per day

The same pack set opens every day — there is no day-dependent variation. The set is determined solely by the challenge setting chosen in the UI:

| Challenge setting | Packs per day              |
|-------------------|----------------------------|
| All 10 tasks      | 1×1★, 4×2★, 2×3★, 3×4★   |
| Tasks 1–7         | 1×1★, 4×2★, 2×3★          |
| Tasks 1–5         | 1×1★, 4×2★                |
| None              | 0 packs                    |

Challenges **never** produce 5★ packs under any setting.

---

### Pack opening — regular packs

Use these exact probability tables from `README.md` for every additional slot draw:

| Pack tier | Slots total | Additional slots | 1★  | 2★  | 3★  | 4★  | 5★  |
|-----------|------------|-----------------|-----|-----|-----|-----|-----|
| 1★ pack   | 2          | 1               | 70% | 30% | —   | —   | —   |
| 2★ pack   | 3          | 2 (each)        | 50% | 40% | 10% | —   | —   |
| 3★ pack   | 4          | 3 (each)        | 40% | 35% | 20% | 5%  | —   |
| 4★ pack   | 5          | 4 (each)        | 30% | 30% | 25% | 10% | 5%  |
| 5★ pack   | 6          | 5 (each)        | 20% | 25% | 25% | 20% | 10% |

**Opening procedure for a regular pack of tier T** (login packs and challenge packs only — vault packs have their own procedure above):
1. Draw the guaranteed sticker: pick one ID uniformly at random from **all** stickers of rarity T (duplicate allowed).
2. For each additional slot: roll the PRNG to determine rarity using the table above, then pick one ID uniformly at random from **all** stickers of that drawn rarity.
3. For every drawn sticker ID: if `drawCount[id] === 0` → set `drawCount[id] = 1`, add to `newUniques`; else → increment `drawCount[id]`, award stars equal to `rarityOf(id)`, add to `duplicates`.

---

### Vault pack opening

Vault packs exist only for 3★, 4★, and 5★ tiers.

**Pack costs**: 3★ = 250 stars, 4★ = 500 stars, 5★ = 800 stars.

Before purchasing one pack of tier T, **all five** conditions must hold:

1. Tier T is enabled in the vault config (checkbox is checked).
2. At least one sticker of rarity T has `drawCount === 0` (vault auto-closes when all stickers of that rarity are collected).
3. `currentDay >= vaultConfig.startDay` and `currentDay <= vaultConfig.endDay`. If `startDay > endDay`, this condition can never be satisfied — no vault purchases occur that season (no error thrown).
4. `stars − packCost(T) >= vaultConfig.reserve` (`stars` is the live balance at evaluation time, updated after every prior purchase or duplicate award this day).
5. `dailyVaultPurchaseCount < vaultConfig.maxPerDay` (or maxPerDay is "unlimited").

**If all five pass:**
1. Deduct `packCost(T)` from `stars`.
2. Draw the guaranteed sticker: pick one ID uniformly at random from **uncollected stickers of rarity T only** (`drawCount === 0` IDs). Set `drawCount[id] = 1`, add to `newUniques`. **Never award duplicate stars for this slot — it is always a new unique by design.**
3. Draw remaining slots (same count as a normal pack of tier T) using the same additional-slot probability table. Each slot: determine rarity via PRNG roll, then pick one ID uniformly from **all** stickers of that rarity (duplicates allowed in remainder slots).
4. Process each remainder-slot sticker: collect or award duplicate stars immediately.
5. Increment `dailyVaultPurchaseCount`.

---

### Daily execution order

Execute in this exact order every day, without deviation:

```
1. Open login pack
   → Compute tier = ((day - 1) % 5) + 1
   → Open one pack of that tier (guaranteed slot + additional slots)
   → Process each sticker: collect or award duplicate stars

2. Open challenge packs
   → For each pack in today's challenge set (determined by challenge setting), open it fully
   → Process all stickers

3. Vault purchase loop
   → dailyVaultPurchaseCount = 0
   → LOOP:
       madePurchase = false
       for each tier T in priority order (top to bottom):
           if all five vault conditions pass for T:
               purchase one vault pack of T
               dailyVaultPurchaseCount++
               madePurchase = true
               break   ← restart priority loop from top
       if not madePurchase: exit vault loop
       if dailyVaultPurchaseCount === maxPerDay: exit vault loop

4. Build DayResult from all events collected in steps 1–3 and return it
```

The restart-from-top rule ensures that duplicate stars earned from one vault purchase can immediately fund the next.

---

### Seeded PRNG — mulberry32

```js
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
```

Every random draw — rarity rolls, sticker ID selection — flows through this PRNG in a fixed, deterministic order. No `Math.random()` anywhere. Given identical seed and config, `runAll()` must return bit-for-bit identical results every time.

**Auto-play seeding rule**: season N uses seed `baseSeed + (N - 1)`. Season 1 uses the user's input seed exactly. This keeps every season distinct while remaining fully reproducible.

---

### Strategy comparison — background runs

After every completed season, immediately run all five presets synchronously using the **same seed** and **same challenge setting** as the main run. Construct a fresh `SimulatorEngine` for each preset, call `runAll()`, collect `SeasonResult`.

These five background results are stored in the `CurrentSeasonComparison` object and used to populate the Strategy Comparison panel.

Because login and challenge packs consume the same PRNG sequence in the same order across all five runs, their sticker contents are identical for a given seed. Vault purchases introduce additional PRNG draws only when a purchase occurs, causing divergence from that point forward.

---

## Speed and animation system (`ui.js`)

### Day delay per speed setting

| Speed | ms per simulated day | Full 50-day run |
|-------|---------------------|-----------------|
| 1×    | 1 000 ms            | ~50 s           |
| 2×    | 500 ms              | ~25 s           |
| 5×    | 200 ms              | ~10 s           |
| 10×   | 100 ms              | ~5 s            |
| Max   | 0 (synchronous)     | instant         |

At **Max speed**: call `engine.runAll()` in a single synchronous call, then perform one complete DOM update to reflect the final state. Zero animations play.

At **1×–10×**: use `setTimeout(runNextDay, currentDelay)` between `runDay()` calls. Speed can be changed mid-run; the new delay takes effect on the very next day's timeout.

### Animation durations

All animation durations derive from `currentDelay` via a CSS custom property `--anim-dur` that `ui.js` updates every time speed changes. All animations must complete within one day interval.

| Animation | Duration (formula) |
|-----------|-------------------|
| Card pop-in (new collection) | `min(currentDelay × 0.5, 500ms)` |
| Card duplicate flash | `min(currentDelay × 0.25, 250ms)` |
| Star counter roll | `min(currentDelay × 0.4, 400ms)` |
| Progress bar fill | `min(currentDelay × 0.3, 300ms)` |
| Event log entry slide-in | `min(currentDelay × 0.2, 200ms)` |

At Max speed, `--anim-dur: 0ms` is set and `transition: none` is applied to all animated elements so the DOM flush is instantaneous.

Post-run chart animations (in the stats panel) are fixed at 800 ms regardless of simulation speed — these play after the run ends, not during it.

---

### Auto-play mode

A toggle button labeled `⟳ Auto` in the controls panel. When active:

- An amber pulsing border appears on the Run/Pause button group and a small `AUTO` pill badge appears adjacent to it.
- When Day 50 completes:
  1. Append the completed `SeasonRecord` to `seasonHistory`.
  2. Re-render the full stats panel with the new season's data.
  3. Wait 1 000 ms (fixed, regardless of speed) so the user can see the final state.
  4. Reset all engine state using seed `baseSeed + (nextSeasonNumber - 1)` — where `nextSeasonNumber` is the season about to begin (e.g. if 2 seasons have completed, the next is season 3, so seed = `baseSeed + 2`). This matches the auto-play seeding rule: season N always uses `baseSeed + (N − 1)`.
  5. Reset the sticker album, star counter, day counter, and event log visually.
  6. Begin the next season automatically.
- The user may change vault config or challenge setting between seasons; the new config applies to the next season.
- Auto-play can be paused mid-season via the Pause button and resumed via Run.
- A "Clear History" button appears in the Season History section once ≥1 season has completed. It wipes `seasonHistory` and collapses the Season History layer.

---

## Layout

### Top section — exactly 100svh, no overflow, no scroll

Two side-by-side panels filling the full viewport at 1080p. No scrollbars. No overflow. Left panel: ~38% width. Right panel: ~62% width.

---

### Left panel — controls

Arranged top-to-bottom:

#### Simulation controls

- **Day counter**: `Day X / 50` — large, prominent, Fredoka One font
- **Star balance**: large animated rolling number (digit-slot animation, see Visual Design). Rolls up on increase, down on decrease. Duration from animation table.
- **Buttons (row)**: `▶ Run` · `⏸ Pause` · `↺ Reset` — always interactable
- **Auto-play toggle (row)**: `⟳ Auto` — amber background + pulsing outline when active
- **Speed selector**: segmented pill — `1×` `2×` `5×` `10×` `MAX` — active segment highlighted in wheat gold. Clicking MAX during a run immediately calls `engine.runAll()` and flushes the UI.
- **Seed input**: labeled `Seed`, number field with random default. Editing triggers a reset. Same seed + same config = identical season.

#### Challenge setting

A labeled `<select>` (default: All 10 tasks):

- All 10 tasks — `1×1★, 4×2★, 2×3★, 3×4★ per day`
- Tasks 1–7 — `1×1★, 4×2★, 2×3★ per day`
- Tasks 1–5 — `1×1★, 4×2★ per day`
- None

Changing mid-run takes effect from the next day.

#### Vault strategy

**Preset row** — five styled buttons. Clicking one instantly sets all editable fields:

| Preset | What it models |
|--------|---------------|
| Spend Greedily | Buy every pack the instant you can afford it, 5★ first |
| 5★ Only | Save every star exclusively for 5★ packs |
| Hoard Then Spend | Save all season; spend freely from Day 26 onward |
| End-Season Blitz | Accumulate all season; dump everything in the final 5 days (Day 46–50) |
| Never Spend | No vault purchases — pure baseline |

Exact preset values:

| Field | Spend Greedily | 5★ Only | Hoard Then Spend | End-Season Blitz | Never Spend |
|-------|---------------|---------|-----------------|-----------------|------------|
| 3★ enabled | ✓ | ✗ | ✓ | ✓ | ✗ |
| 4★ enabled | ✓ | ✗ | ✓ | ✓ | ✗ |
| 5★ enabled | ✓ | ✓ | ✓ | ✓ | ✗ |
| Priority | 5★→4★→3★ | 5★ | 5★→4★→3★ | 5★→4★→3★ | — |
| Start day | 1 | 1 | 26 | 46 | — |
| End day | 50 | 50 | 50 | 50 | — |
| Reserve | 0 | 0 | 0 | 0 | — |
| Max/day | Unlimited | Unlimited | Unlimited | Unlimited | — |

**Editable fields** — all adjustable after any preset. Changing any field sets the active label to "Custom":

- **Enabled tiers**: three checkboxes — `☑ 3★ (250★)` / `☑ 4★ (500★)` / `☑ 5★ (800★)`
- **Priority order**: ordered list of enabled tiers with `▲` `▼` buttons. Disabled tiers are removed from the list automatically.
- **Start spending on day**: number input, 1–50
- **Stop spending after day**: number input, 1–50
- **Minimum star reserve**: number input (default 0)
- **Max purchases/day**: "Unlimited" checkbox (default checked). Unchecking reveals a number input.

#### Live event log

Fixed-height panel anchored to the bottom of the left panel. Shows the 8 most recent events. New entries slide in from the bottom and push older entries up. At Max speed only the final 8 events of the completed run appear; no animation plays.

Format:
```
Day 5   5★ Login     →  ★5 ★3 ★2 ★1 ★1 ★2
Day 7   5★ Vault     →  NEW ★5  +  ★3 ★1 ★1  (+4 stars from 2 dupes)
Day 12  Challenge    →  4×2★: ★2 ★1 ★2 ★2 ★1 ★1 ★3 ★1 ★2 ★2 ★1 ★1
```

`★N` denotes a sticker of rarity N. `NEW` prefix means first-ever collection. `(+4 stars from 2 dupes)` means two duplicate stickers were drawn totalling 4 stars awarded — use `stars` not `★` for the star-currency quantity to avoid confusion with rarity ratings.

---

### Right panel — sticker album

A CSS grid containing all 108 sticker cards, divided into 5 rarity sections. Each section opens with a full-width colored header strip showing rarity name, stars, and progress (`12 / 27`).

| Rarity | Header color | Card count |
|--------|-------------|------------|
| 1★     | silver-grey | 27         |
| 2★     | leaf green  | 21         |
| 3★     | sky blue    | 18         |
| 4★     | royal purple| 18         |
| 5★     | wheat gold  | 24         |

Card sizing uses `clamp()` against viewport width. All 108 cards fit without overflow or scroll at 1080p.

- **Uncollected**: greyed-out `#D8CDB8` background, large `?` label, no glow, no badge.
- **Collected**: rarity-coloured background, star-count badge in corner, persistent soft `box-shadow` glow in rarity colour. Looping shimmer gradient sweep on face.
- **New collection event** (non-Max): spring pop — `scale(1.0 → 1.3 → 1.0)` with `cubic-bezier(0.34, 1.56, 0.64, 1)` + radial glow burst that fades. Duration = `min(currentDelay × 0.5, 500ms)`.
- **Duplicate event** (non-Max): card background pulses to `var(--color-gold)` then returns. Duration = `min(currentDelay × 0.25, 250ms)`.
- **Max speed**: all card state changes apply in a single DOM flush. No animation.
- **Total progress bar**: full-width strip above all sections. Label: `X / 108 stickers collected (X%)`. Fill animates per animation table.

---

## Bottom section — scrollable stats (`stats.js`)

Begins immediately below the 100svh viewport edge. The user scrolls down to reach it.

This section has **two layers** stacked vertically:

1. **Season History layer** — cross-season charts that accumulate with every completed season
2. **Current Season layer** — detailed breakdown of the most recently completed season

The entire section re-renders after every completed season, including during auto-play. It is always consistent with the most recent `SeasonResult` and the full `seasonHistory` array.

---

### Season History layer

Empty until the first season completes. Grows with every subsequent run. This layer directly answers the simulator's core question by making strategy differences visible across many seasons.

#### Season Outcome Chart

An SVG/Canvas chart with two vertically stacked panels sharing an X-axis.

**Top panel — sticker collection per season**

- X-axis: season number (1, 2, 3, …)
- Y-axis: unique stickers collected, fixed 0–108
- One vertical bar per season, colored by preset:
  - Spend Greedily = `--color-green`
  - 5★ Only = `--color-gold`
  - Hoard Then Spend = `--color-sky`
  - End-Season Blitz = `#E67E22` (harvest orange — distinct from barn red used for duplicates/outflows)
  - Never Spend = `#9E9E9E`
  - Custom = `--color-brown`
- Dashed horizontal reference line at 108 labeled `Complete`
- Dashed horizontal reference line at the all-season average, labeled with its value

**Bottom panel — star economy per season**

- Same X-axis
- Stacked bar per season: stars spent (barn red) + stars remaining (wheat gold) = total stars earned that season
- This identity holds because stars start at 0 each season and no stars carry over between seasons.
- Makes it immediately clear whether a strategy depletes stars efficiently or leaves large balances unused

Hovering any bar shows a tooltip:
```
Season 4 — Spend Greedily
94 / 108 stickers  |  2 400★ spent  |  380★ remaining
```

#### Season History Table

Scrollable table below the chart. One row per completed season, newest at top. Rows are color-coded left-border by preset.

| # | Seed | Preset | Stickers | Stars spent | Vault (3★/4★/5★) | Stars left | Done? |
|---|------|--------|----------|-------------|------------------|------------|-------|

"Done?" column: `✓` in green if 108/108, or the number of uncollected stickers in red.

A **"Clear History"** button appears at the top-right of this section. Clicking it wipes `seasonHistory` and collapses the Season History layer to empty.

#### Strategy Averages Block

Visible once at least one season has completed. One summary card per **distinct preset** that appears in `seasonHistory` — presets that have never been run are omitted. Cards update after every completed season.

- Preset name and color accent
- Seasons run with this preset: N
- Average unique stickers: X.X / 108
- Completion rate: X% of seasons reached 108
- Average stars remaining: X

This block makes the long-run answer immediately visible: run 10 seasons of "Never Spend" then 10 of "Spend Greedily" and the cards will show the difference plainly.

---

### Current Season layer

Detailed data for the most recently completed season. Seven subsections:

---

#### 1. Season Summary

A grid of stat cards, one number per card:

- Packs opened by source: Login / Challenge / Vault 3★ / Vault 4★ / Vault 5★
- Total stickers drawn (raw count)
- Total duplicates drawn
- Stars earned from duplicates, broken down: from login packs / from challenge packs / from vault remainder slots
- Stars spent: 3★ vault total / 4★ vault total / 5★ vault total
- Unique stickers: `X / 108 (X%)`
- Season result: `✓ Complete` (green) or `X stickers missing` (red)
- First 5★ sticker collected: `Day X` or `—` if none
- Vault purchases: `3★ ×N  4★ ×N  5★ ×N`

---

#### 2. Daily Timeline

A horizontally scrollable strip of exactly 50 day columns.

Each column:
- Day number
- Login pack tier (star icon) — read from `loginPack.tier`
- Challenge packs opened (e.g. `4×2★`)
- Vault purchases (e.g. `2×5★`)
- Net new unique stickers that day — shown in green if > 0
- Stars earned
- Stars spent — shown in red if > 0

Column styling:
- The column matching `vaultConfig.startDay` gets an amber top accent border
- Days where `starBalanceAfter === 0` get a pale red background

---

#### 3. Cumulative Progress Chart

SVG line chart. X-axis: Day 1–50.

- **Left Y-axis**: unique stickers, fixed 0–108. Line colour: `--color-green`.
- **Right Y-axis**: star balance, 0 to dynamic max = `Math.max(500, Math.ceil(peakStarBalance / 500) * 500)`. Floor of 500 prevents a zero-range axis when no stars are ever earned. Line colour: `--color-gold`.

Both lines animate drawing left-to-right on render. Fixed animation duration: 800 ms (post-run, not tied to simulation speed).

If at least one vault tier is enabled and `startDay` is 1–50: draw a vertical dashed amber line at that day labeled `Vault opens`. If no tiers are enabled: omit the line entirely.

Grid lines at every 10 stickers on the left axis and every 500 stars on the right axis.

---

#### 4. Pack Yield Breakdown

For each pack type opened during the season, two horizontal stacked bars side by side:

- **Actual**: rarity distribution drawn this run
- **Expected**: theoretically correct distribution, calculated analytically from `README.md` probability tables (not simulated)

**Vault packs are tracked and displayed separately from regular packs of the same tier.** A `Vault 3★`, `Vault 4★`, and `Vault 5★` row appears only if at least one vault pack of that tier was opened. Their expected distributions use the same additional-slot probabilities but count the guaranteed slot as exactly 1× the vault pack's rarity (not a random draw from all stickers of that rarity — it is always a new unique, though for yield-distribution purposes it still contributes 1 sticker of that rarity).

Expected distribution per pack type, computed as the sum of guaranteed + probability-weighted additional slots:

| Pack | Expected stickers per pack |
|------|---------------------------|
| 1★   | 1.00×1★ guaranteed + 0.70×1★ + 0.30×2★ additional |
| 2★   | 1.00×2★ guaranteed + 2×(0.50×1★ + 0.40×2★ + 0.10×3★) additional |
| 3★   | 1.00×3★ guaranteed + 3×(0.40×1★ + 0.35×2★ + 0.20×3★ + 0.05×4★) additional |
| 4★   | 1.00×4★ guaranteed + 4×(0.30×1★ + 0.30×2★ + 0.25×3★ + 0.10×4★ + 0.05×5★) additional |
| 5★   | 1.00×5★ guaranteed + 5×(0.20×1★ + 0.25×2★ + 0.25×3★ + 0.20×4★ + 0.10×5★) additional |

Each bar segment labeled with its percentage. Rarity colour legend included.

---

#### 5. Rarity Heatmap

Five rows, one per rarity, with exactly as many cells as stickers in that rarity (27 / 21 / 18 / 18 / 24).

Cell fill:
- Not collected → neutral `#BDBDBD`
- Collected → rarity accent colour at opacity mapped linearly from collection day: collected on Day 1 = `opacity: 1.0` (fully vivid), collected on Day 50 = `opacity: 0.35` (dimmer, still readable). Formula: `opacity = 1.0 − (collectionDay − 1) / 49 × 0.65`. The colour itself is always the full rarity accent colour; only opacity changes.

Hover tooltip per cell:
```
Sticker #42 (★★) — Collected Day 14 — Seen 3× total (2 duplicates)
Sticker #91 (★★★★★) — Not collected this season
```

---

#### 6. Star Economy Waterfall

A waterfall bar chart. The following identity must hold exactly:

```
total inflows − total outflows = final star balance
```

**Inflows** (upward bars, `--color-green`), broken down by source and then by rarity:

| Source | Per-rarity breakdown |
|--------|---------------------|
| Login pack duplicates | stars from 1★ dupes, 2★ dupes, 3★ dupes, 4★ dupes, 5★ dupes |
| Challenge pack duplicates | same |
| Vault remainder duplicates | same |

**Outflows** (downward bars, `--color-red`):

- Stars spent on 3★ vault packs
- Stars spent on 4★ vault packs
- Stars spent on 5★ vault packs

**Final bar** (wheat gold): stars remaining at end of season.

Every bar segment shows a numeric label. Summary row above chart: `Total earned: X  −  Total spent: Y  =  Remaining: Z`.

---

#### 7. Strategy Comparison (current seed)

Using the same seed and challenge setting as the main run, display results from all five background preset runs alongside the user's actual configuration.

The table has **5 rows** if the user's config exactly matches one of the five presets (that preset row absorbs the user result), or **6 rows** if the config is custom (a `Your Config` row is appended at the bottom). Rows are always displayed in this fixed order: Spend Greedily, 5★ Only, Hoard Then Spend, End-Season Blitz, Never Spend, then Your Config (if custom).

| Config | Unique stickers | Stars spent | 3★ | 4★ | 5★ | Stars left |
|--------|----------------|-------------|----|----|-----|------------|

- Highlight the row with the most unique stickers in `--color-green`
- If user config matches a preset exactly, they share one row (preset name shown)
- If user config is custom, add a `Your Config` row
- Include a small inline bar (proportional to 108) in each row for quick visual comparison

One-sentence annotation below each row explaining what the result reveals. Examples:

- *Spend Greedily: buying packs the instant you can afford them maximises total pack count but spends stars on lower tiers that could have been saved for 5★ packs.*
- *5★ Only: holding stars for the best packs pays off only if enough stars accumulate — check whether this seed reached 800★ in time.*
- *Hoard Then Spend: a mid-season inflection — the progress chart will show a visible acceleration after Day 26.*
- *End-Season Blitz: stars are used most efficiently here but there is no time to benefit from newly collected stickers feeding more runs.*
- *Never Spend: the pure free-to-play floor — every other strategy should beat this or the star vault offers no real value.*

---

## Visual design

**Aesthetic**: warm storybook farm — handcrafted and cheerful. Every element should feel like it belongs on a cosy harvest-festival poster.

### Colour palette (CSS variables in `:root`)

```css
--color-gold:   #F5C842;  /* wheat gold   — stars, accents, 5★ */
--color-red:    #C0392B;  /* barn red     — duplicates, outflows, warnings */
--color-orange: #E67E22;  /* harvest orange — End-Season Blitz preset */
--color-green:  #7DAA72;  /* sage green   — collected, inflows, progress */
--color-cream:  #FDF6E3;  /* cream        — panel backgrounds */
--color-brown:  #6B4423;  /* soil brown   — borders, headers, primary text */
--color-sky:    #5B9BD5;  /* sky blue     — 3★ rarity, Hoard preset */
--color-purple: #8E6BBF;  /* royal purple — 4★ rarity */
```

### Typography

`Fredoka One` (Google Fonts) — headings, card labels, badge numbers, preset button labels, day counter, star counter.
`Nunito` (Google Fonts) — body text, event log, stat values, table content, tooltips.

### Texture

One `<svg>` element with `display:none` at the top of `<body>` defines a grain filter using `<filter id="grain">`:
```html
<filter id="grain" x="0%" y="0%" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
  <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
  <feBlend in="SourceGraphic" in2="grey" mode="overlay" result="blended"/>
  <feComposite in="blended" in2="SourceGraphic" operator="in"/>
</filter>
```

Apply to panel background pseudo-elements (not directly to the panel, to avoid affecting child content):
```css
.panel::before {
  content: '';
  position: absolute; inset: 0;
  filter: url(#grain);
  opacity: 0.07;   /* 6–8% opacity — tune to taste */
  pointer-events: none;
  border-radius: inherit;
}
```

No external image files. The `<svg>` element itself is invisible and zero-size.

### Cards

```css
border-radius: 8px;
border: 2.5px solid var(--color-brown);
```

Uncollected: `background: #D8CDB8; filter: grayscale(0.5) opacity(0.7)`.

Collected: rarity-tinted background, `box-shadow: 0 0 10px 3px <rarity-color>55` for persistent glow. A `@keyframes` shimmer sweeps diagonally across the face using a `linear-gradient` at 45°; animate `background-position` from `0% 0%` to `200% 200%` with `background-size: 300% 300%`, at 3 s infinite. The shimmer uses `animation-play-state: var(--shimmer-state)`.

`--shimmer-state` is a CSS variable defined on `:root`. `ui.js` sets it to `running` at all speeds except Max, and `paused` at Max speed (alongside setting `--anim-dur: 0ms`). Default value: `running`.

### Animations

Card pop-in: `transform: scale(1.0)` → `scale(1.3)` → `scale(1.0)` using `cubic-bezier(0.34, 1.56, 0.64, 1)`. Duration from `--anim-dur`. Implemented as a `@keyframes` rule: `0% { transform: scale(1) } 50% { transform: scale(1.3) } 100% { transform: scale(1) }`.

Duplicate flash: `background-color` transitions to `var(--color-gold)` then back. Duration: `calc(var(--anim-dur) * 0.5)`. Applied via a CSS transition on the card's `background-color` property — JS adds/removes a `.dupe-flash` class to trigger it.

Star counter: digit-slot roll — each digit rendered in a vertically clipped container; digits slide upward (`translateY` decreasing) on increase, downward on decrease. Duration: `calc(var(--anim-dur) * 0.8)` (= `currentDelay × 0.4`, capped at 400 ms).

Progress bar fill: Duration: `calc(var(--anim-dur) * 0.6)` (= `currentDelay × 0.3`, capped at 300 ms).

Event log entry slide-in: Duration: `calc(var(--anim-dur) * 0.4)` (= `currentDelay × 0.2`, capped at 200 ms).

All five CSS duration expressions, derived from the single `--anim-dur` variable (= `min(currentDelay × 0.5, 500ms)`):

| Animation | CSS expression | Resolves to |
|-----------|---------------|-------------|
| Card pop-in | `var(--anim-dur)` | `min(delay × 0.5, 500ms)` |
| Duplicate flash | `calc(var(--anim-dur) * 0.5)` | `min(delay × 0.25, 250ms)` |
| Star counter roll | `calc(var(--anim-dur) * 0.8)` | `min(delay × 0.4, 400ms)` |
| Progress bar fill | `calc(var(--anim-dur) * 0.6)` | `min(delay × 0.3, 300ms)` |
| Event log slide-in | `calc(var(--anim-dur) * 0.4)` | `min(delay × 0.2, 200ms)` |

`ui.js` updates `--anim-dur` on the `:root` element whenever speed changes:
```js
document.documentElement.style.setProperty('--anim-dur', `${Math.min(currentDelay * 0.5, 500)}ms`);
// At Max speed:
document.documentElement.style.setProperty('--anim-dur', '0ms');
```

At Max speed: `--anim-dur: 0ms`, `transition: none`, `animation: none` applied globally. The DOM flush is a single synchronous repaint.

Auto-play indicator: `@keyframes` amber `box-shadow` pulse on the button group at 1.2 s infinite, paused when auto-play is off.