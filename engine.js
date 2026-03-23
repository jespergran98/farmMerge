/**
 * engine.js — Farm Merge Valley Sticker Season Simulator
 *
 * All game logic lives here. Zero DOM interaction.
 *
 * Exports:
 *   SimulatorEngine        — main class
 *   seasonHistory          — mutable array of SeasonRecord objects
 *   clearSeasonHistory()   — wipes the array in-place
 *   currentSeasonComparison — null until the first season completes; updated
 *                             after every completed season
 *   PRESETS                — five named VaultConfig objects
 *   rarityOf(id)           — helper: sticker ID → rarity number (1–5)
 */

// ════════════════════════════════════════════════════════════════════════════
// PRNG — mulberry32
// Every random draw flows through this; no Math.random() anywhere.
// ════════════════════════════════════════════════════════════════════════════

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Sticker identity helpers
// ════════════════════════════════════════════════════════════════════════════

/**
 * Map sticker ID → rarity tier (1–5).
 * ID ranges: 1–27 = 1★ | 28–48 = 2★ | 49–66 = 3★ | 67–84 = 4★ | 85–108 = 5★
 */
export function rarityOf(id) {
  if (id <= 27) return 1;
  if (id <= 48) return 2;
  if (id <= 66) return 3;
  if (id <= 84) return 4;
  return 5;
}

/** Sticker range metadata keyed by rarity tier. */
const RARITY_RANGES = {
  1: { min: 1,   count: 27 },
  2: { min: 28,  count: 21 },
  3: { min: 49,  count: 18 },
  4: { min: 67,  count: 18 },
  5: { min: 85,  count: 24 },
};

// ════════════════════════════════════════════════════════════════════════════
// Pack tables
// ════════════════════════════════════════════════════════════════════════════

/**
 * Additional-slot probability tables, stored as [rarity, cumulativeProbability] pairs.
 * One roll per additional slot; stops at the first entry whose cumulative
 * threshold exceeds the PRNG value.
 */
const ADDITIONAL_PROBS = {
  1: [[1, 0.70], [2, 1.00]],
  2: [[1, 0.50], [2, 0.90], [3, 1.00]],
  3: [[1, 0.40], [2, 0.75], [3, 0.95], [4, 1.00]],
  4: [[1, 0.30], [2, 0.60], [3, 0.85], [4, 0.95], [5, 1.00]],
  5: [[1, 0.20], [2, 0.45], [3, 0.70], [4, 0.90], [5, 1.00]],
};

/** Number of additional (non-guaranteed) slots per pack tier. */
const ADDITIONAL_SLOTS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

// ════════════════════════════════════════════════════════════════════════════
// Challenge packs per difficulty setting
// Keys must match the option values used in ui.js / the <select> element.
// ════════════════════════════════════════════════════════════════════════════

const CHALLENGE_PACKS = {
  'all10':    [1, 2, 2, 2, 2, 3, 3, 4, 4, 4],
  'tasks1-7': [1, 2, 2, 2, 2, 3, 3],
  'tasks1-5': [1, 2, 2, 2, 2],
  'none':     [],
};

// ════════════════════════════════════════════════════════════════════════════
// Vault
// ════════════════════════════════════════════════════════════════════════════

const VAULT_COSTS = { 3: 250, 4: 500, 5: 800 };

// ════════════════════════════════════════════════════════════════════════════
// Strategy presets (VaultConfig objects)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Five named vault strategy configurations.
 * ui.js reads these to populate the preset buttons and to match the user's
 * current config against a named preset.
 */
export const PRESETS = {
  'Spend Greedily': {
    tiers:     { t3: true,  t4: true,  t5: true  },
    priority:  [5, 4, 3],
    startDay:  1,
    endDay:    50,
    reserve:   0,
    maxPerDay: Infinity,
  },
  '5★ Only': {
    tiers:     { t3: false, t4: false, t5: true  },
    priority:  [5],
    startDay:  1,
    endDay:    50,
    reserve:   0,
    maxPerDay: Infinity,
  },
  'Hoard Then Spend': {
    tiers:     { t3: true,  t4: true,  t5: true  },
    priority:  [5, 4, 3],
    startDay:  26,
    endDay:    50,
    reserve:   0,
    maxPerDay: Infinity,
  },
  'End-Season Blitz': {
    tiers:     { t3: true,  t4: true,  t5: true  },
    priority:  [5, 4, 3],
    startDay:  50,
    endDay:    50,
    reserve:   0,
    maxPerDay: Infinity,
  },
  'Never Spend': {
    tiers:     { t3: false, t4: false, t5: false },
    priority:  [],
    startDay:  1,
    endDay:    50,
    reserve:   0,
    maxPerDay: Infinity,
  },
};

// ════════════════════════════════════════════════════════════════════════════
// Module-level mutable exports
// ════════════════════════════════════════════════════════════════════════════

/** All completed SeasonRecord objects, newest last. */
export const seasonHistory = [];

/** Remove all season records. */
export function clearSeasonHistory() {
  seasonHistory.length = 0;
}

/**
 * Set to null before the first season completes.
 * After every completed season this is replaced with a CurrentSeasonComparison
 * object containing all five preset results for the same seed + challenge.
 */
export let currentSeasonComparison = null;

// ════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ════════════════════════════════════════════════════════════════════════════

/**
 * Return the preset label that exactly matches the given VaultConfig,
 * or 'Custom' if none matches.
 */
function getPresetLabel(vaultConfig) {
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (
      vaultConfig.tiers.t3   === preset.tiers.t3  &&
      vaultConfig.tiers.t4   === preset.tiers.t4  &&
      vaultConfig.tiers.t5   === preset.tiers.t5  &&
      vaultConfig.startDay   === preset.startDay   &&
      vaultConfig.endDay     === preset.endDay     &&
      vaultConfig.reserve    === preset.reserve    &&
      vaultConfig.maxPerDay  === preset.maxPerDay  &&
      vaultConfig.priority.length === preset.priority.length &&
      vaultConfig.priority.every((v, i) => v === preset.priority[i])
    ) {
      return name;
    }
  }
  return 'Custom';
}

/** Deep-clone a VaultConfig (no circular refs, no functions). */
function cloneVaultConfig(vc) {
  return {
    tiers:     { ...vc.tiers },
    priority:  [...vc.priority],
    startDay:  vc.startDay,
    endDay:    vc.endDay,
    reserve:   vc.reserve,
    maxPerDay: vc.maxPerDay,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SimulatorEngine
// ════════════════════════════════════════════════════════════════════════════

export class SimulatorEngine {
  /**
   * @param {object} config
   * @param {number}      config.seed              — PRNG seed (uint32)
   * @param {string}      config.challengeSetting  — 'all10' | 'tasks1-7' | 'tasks1-5' | 'none'
   * @param {VaultConfig} config.vaultConfig
   * @param {boolean}     [config._background]     — internal flag; suppresses history/comparison writes
   */
  constructor({ seed, challengeSetting, vaultConfig, _background = false }) {
    this.config = { seed, challengeSetting, vaultConfig };
    this._background = _background;

    // State fields — populated by reset()
    this.day         = 0;
    this.stars       = 0;
    this.stickers    = new Map();
    this.uniqueCount = 0;
    this.log         = [];

    // Internal tracking
    this._rng              = null;
    this._days             = [];   // accumulated DayResult objects
    this._firstFiveStarDay = null;
    this._lastSeasonResult = null;

    this.reset();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Restore Day 0 state and re-seed the PRNG.
   * Does NOT touch config or _background.
   */
  reset() {
    this.day         = 0;
    this.stars       = 0;
    this.uniqueCount = 0;
    this.log         = [];

    this._days             = [];
    this._firstFiveStarDay = null;
    this._lastSeasonResult = null;

    this.stickers = new Map();
    for (let id = 1; id <= 108; id++) {
      this.stickers.set(id, 0);
    }

    this._rng = mulberry32(this.config.seed);
  }

  /**
   * Simulate one day.
   * Increments this.day, executes login → challenge → vault, returns DayResult.
   * Throws if called when this.day === 50 (call reset() first).
   */
  runDay() {
    if (this.day === 50) {
      throw new Error(
        'Season already complete (day 50 reached). Call reset() before running more days.'
      );
    }

    this.day++;

    // Accumulators for this day
    const dayNewUniques  = [];
    const dayDuplicates  = [];
    let   starsEarned    = 0;
    let   starsSpent     = 0;

    // ── 1. Login pack ────────────────────────────────────────────────────
    const loginTier = ((this.day - 1) % 5) + 1;
    const loginPack = this._openRegularPack(loginTier);

    for (const id of loginPack.newUniques) {
      dayNewUniques.push(id);
    }
    for (const dup of loginPack.duplicates) {
      dayDuplicates.push({ id: dup.id, starsAwarded: dup.starsAwarded, source: 'login' });
      starsEarned += dup.starsAwarded;
    }
    this.log.push(this._buildPackEvent('login', loginTier, loginPack));

    // ── 2. Challenge packs ───────────────────────────────────────────────
    const challengePacks = [];
    const tierList = CHALLENGE_PACKS[this.config.challengeSetting] ?? [];

    for (const tier of tierList) {
      const pack = this._openRegularPack(tier);
      challengePacks.push(pack);

      for (const id of pack.newUniques) dayNewUniques.push(id);
      for (const dup of pack.duplicates) {
        dayDuplicates.push({ id: dup.id, starsAwarded: dup.starsAwarded, source: 'challenge' });
        starsEarned += dup.starsAwarded;
      }
      this.log.push(this._buildPackEvent('challenge', tier, pack));
    }

    // ── 3. Vault purchase loop ───────────────────────────────────────────
    const vaultPurchases     = [];
    let   dailyVaultCount    = 0;
    const vc                 = this.config.vaultConfig;
    const maxPerDay          = vc.maxPerDay;

    outerLoop: while (true) {
      let madePurchase = false;

      for (const tier of vc.priority) {
        if (this._canBuyVault(tier, dailyVaultCount)) {
          const purchase = this._openVaultPack(tier);
          vaultPurchases.push(purchase);
          dailyVaultCount++;
          starsSpent += purchase.cost;

          // Vault guaranteed is always a new unique
          dayNewUniques.push(purchase.guaranteedNew);

          for (const id of purchase.remainderNewUniques) {
            dayNewUniques.push(id);
          }
          for (const dup of purchase.remainderDuplicates) {
            dayDuplicates.push({ id: dup.id, starsAwarded: dup.starsAwarded, source: 'vault' });
            starsEarned += dup.starsAwarded;
          }
          this.log.push(this._buildVaultEvent(tier, purchase));

          madePurchase = true;
          // Restart priority scan from the top
          break;
        }
      }

      if (!madePurchase) break outerLoop;
      if (maxPerDay !== Infinity && dailyVaultCount >= maxPerDay) break outerLoop;
    }

    // ── 4. Build and store DayResult ─────────────────────────────────────
    const dayResult = {
      day:             this.day,
      loginPack,
      challengePacks,
      vaultPurchases,
      newUniques:      dayNewUniques,
      duplicates:      dayDuplicates,
      starsEarned,
      starsSpent,
      netUniqueGain:   dayNewUniques.length,
      starBalanceAfter: this.stars,
    };

    this._days.push(dayResult);

    // Check for season completion
    if (this.day === 50) {
      this._finalizeSeasonIfComplete();
    }

    return dayResult;
  }

  /**
   * Run all 50 days synchronously. Returns SeasonResult.
   * Starts from wherever this.day currently is; call reset() first for a fresh run.
   */
  runAll() {
    while (this.day < 50) {
      this.runDay();
    }
    return this._lastSeasonResult;
  }

  /**
   * Return a snapshot of current SimulatorState.
   * No mutation — safe to inspect between calls to runDay().
   */
  getState() {
    return {
      day:         this.day,
      stars:       this.stars,
      stickers:    new Map(this.stickers),
      uniqueCount: this.uniqueCount,
      log:         [...this.log],
    };
  }

  // ── Internal: PRNG helpers ────────────────────────────────────────────────

  /**
   * Roll the PRNG to determine which rarity an additional slot yields,
   * using the cumulative-probability table for the given pack tier.
   */
  _rollRarity(packTier) {
    const r     = this._rng();
    const table = ADDITIONAL_PROBS[packTier];
    for (const [rarity, cumProb] of table) {
      if (r < cumProb) return rarity;
    }
    // Floating-point safety: return the last rarity (= 100% cumulative)
    return table[table.length - 1][0];
  }

  /**
   * Pick a uniformly random sticker ID from ALL stickers of the given rarity.
   * Consumes one PRNG draw.
   */
  _pickId(rarity) {
    const { min, count } = RARITY_RANGES[rarity];
    return min + Math.floor(this._rng() * count);
  }

  /**
   * Pick a uniformly random sticker ID from UNCOLLECTED stickers of the given
   * rarity (drawCount === 0). Consumes one PRNG draw.
   * Returns null if no uncollected stickers remain (should never happen when
   * _canBuyVault has already confirmed at least one exists).
   */
  _pickUncollectedId(rarity) {
    const { min, count } = RARITY_RANGES[rarity];
    const uncollected = [];
    for (let id = min; id < min + count; id++) {
      if (this.stickers.get(id) === 0) uncollected.push(id);
    }
    if (uncollected.length === 0) return null;
    return uncollected[Math.floor(this._rng() * uncollected.length)];
  }

  // ── Internal: sticker processing ─────────────────────────────────────────

  /**
   * Record a sticker draw: update drawCount, update uniqueCount/stars,
   * track firstFiveStarDay.
   * Returns { isNew: boolean, starsAwarded: number }.
   */
  _processDraw(id) {
    const drawCount = this.stickers.get(id);

    if (drawCount === 0) {
      // First collection
      this.stickers.set(id, 1);
      this.uniqueCount++;

      if (rarityOf(id) === 5 && this._firstFiveStarDay === null) {
        this._firstFiveStarDay = this.day;
      }
      return { isNew: true, starsAwarded: 0 };
    } else {
      // Duplicate
      this.stickers.set(id, drawCount + 1);
      const stars = rarityOf(id);
      this.stars += stars;
      return { isNew: false, starsAwarded: stars };
    }
  }

  // ── Internal: pack opening ────────────────────────────────────────────────

  /**
   * Open one regular (login or challenge) pack of the given tier.
   * Returns a PackResult.
   *
   * PRNG consumption order:
   *   1 draw  — guaranteed slot ID
   *   2 draws — per additional slot (1 for rarity, 1 for ID)
   */
  _openRegularPack(tier) {
    // Guaranteed slot: fixed rarity = tier, pick from ALL stickers of that rarity
    const guaranteedId = this._pickId(tier);

    // Additional slots
    const additionalIds = [];
    for (let i = 0; i < ADDITIONAL_SLOTS[tier]; i++) {
      const rarity = this._rollRarity(tier);
      additionalIds.push(this._pickId(rarity));
    }

    // Process all draws
    const newUniques  = [];
    const duplicates  = [];

    const gResult = this._processDraw(guaranteedId);
    if (gResult.isNew) {
      newUniques.push(guaranteedId);
    } else {
      duplicates.push({ id: guaranteedId, starsAwarded: gResult.starsAwarded });
    }

    for (const id of additionalIds) {
      const res = this._processDraw(id);
      if (res.isNew) {
        newUniques.push(id);
      } else {
        duplicates.push({ id, starsAwarded: res.starsAwarded });
      }
    }

    return {
      tier,
      guaranteed: guaranteedId,
      additional: additionalIds,
      newUniques,
      duplicates,
    };
  }

  /**
   * Open one vault pack of the given tier (3, 4, or 5).
   * Assumes all five pre-purchase conditions have already been validated.
   * Returns a VaultPurchase.
   *
   * PRNG consumption order:
   *   1 draw  — guaranteed slot (from uncollected IDs of that rarity)
   *   2 draws — per remainder slot (1 for rarity, 1 for ID)
   */
  _openVaultPack(tier) {
    const cost = VAULT_COSTS[tier];

    // Deduct cost first (so remainder-slot duplicate stars can fund more purchases)
    this.stars -= cost;

    // Guaranteed slot: must be an uncollected sticker, never awards duplicate stars
    const guaranteedId = this._pickUncollectedId(tier);
    if (guaranteedId === null) {
      // Defensive guard; _canBuyVault prevents reaching here
      throw new Error(`Vault invariant violated: no uncollected ${tier}★ stickers.`);
    }
    this._processDraw(guaranteedId); // always isNew = true; no stars awarded

    // Remainder slots (same count as additional slots in a regular pack of this tier)
    const remainderStickers    = [];
    const remainderNewUniques  = [];
    const remainderDuplicates  = [];

    for (let i = 0; i < ADDITIONAL_SLOTS[tier]; i++) {
      const rarity = this._rollRarity(tier);
      const id     = this._pickId(rarity);
      remainderStickers.push(id);

      const res = this._processDraw(id);
      if (res.isNew) {
        remainderNewUniques.push(id);
      } else {
        remainderDuplicates.push({ id, starsAwarded: res.starsAwarded });
      }
    }

    return {
      tier,
      cost,
      guaranteedNew:       guaranteedId,
      remainderStickers,
      remainderNewUniques,
      remainderDuplicates,
      starsBalanceAfter:   this.stars,
    };
  }

  // ── Internal: vault gate check ───────────────────────────────────────────

  /**
   * Returns true iff all five vault pre-purchase conditions pass for the
   * given tier and current daily purchase count.
   */
  _canBuyVault(tier, dailyCount) {
    const vc = this.config.vaultConfig;

    // Condition 1 — tier enabled
    if (!vc.tiers[`t${tier}`]) return false;

    // Condition 2 — at least one uncollected sticker of this rarity
    const { min, count } = RARITY_RANGES[tier];
    let hasUncollected = false;
    for (let id = min; id < min + count; id++) {
      if (this.stickers.get(id) === 0) { hasUncollected = true; break; }
    }
    if (!hasUncollected) return false;

    // Condition 3 — day is within [startDay, endDay]
    // If startDay > endDay the window is impossible — never purchase
    if (this.day < vc.startDay || this.day > vc.endDay) return false;

    // Condition 4 — enough stars after reserving minimum balance
    const cost = VAULT_COSTS[tier];
    if (this.stars - cost < vc.reserve) return false;

    // Condition 5 — daily purchase cap not reached
    if (vc.maxPerDay !== Infinity && dailyCount >= vc.maxPerDay) return false;

    return true;
  }

  // ── Internal: EventEntry builders ────────────────────────────────────────

  _buildPackEvent(type, packTier, pack) {
    // Flatten all sticker IDs in draw order: guaranteed first, then additional
    const allIds = [pack.guaranteed, ...pack.additional];
    const newSet = new Set(pack.newUniques);

    return {
      day:          this.day,
      type,
      packTier,
      stickers:     allIds.map(id => ({ id, rarity: rarityOf(id), isNew: newSet.has(id) })),
      starsAwarded: pack.duplicates.reduce((sum, d) => sum + d.starsAwarded, 0),
      starsSpent:   0,
    };
  }

  _buildVaultEvent(tier, purchase) {
    const newSet = new Set(purchase.remainderNewUniques);

    return {
      day:      this.day,
      type:     'vault',
      packTier: tier,
      stickers: [
        { id: purchase.guaranteedNew, rarity: tier, isNew: true },
        ...purchase.remainderStickers.map(id => ({
          id,
          rarity: rarityOf(id),
          isNew:  newSet.has(id),
        })),
      ],
      starsAwarded: purchase.remainderDuplicates.reduce((sum, d) => sum + d.starsAwarded, 0),
      starsSpent:   purchase.cost,
    };
  }

  // ── Internal: season finalisation ────────────────────────────────────────

  /**
   * Called once, exactly when this.day reaches 50.
   * Builds SeasonResult, appends SeasonRecord to seasonHistory (unless
   * running as a background comparison engine), and updates
   * currentSeasonComparison.
   */
  _finalizeSeasonIfComplete() {
    const result = this._buildSeasonResult();
    this._lastSeasonResult = result;

    if (this._background) return; // background preset runs have no side-effects

    // Append season record
    const seasonIndex = seasonHistory.length + 1;
    seasonHistory.push(this._buildSeasonRecord(result, seasonIndex));

    // Run all five preset strategies on the same seed + challenge setting
    const presetResults = _runAllPresets(this.config.seed, this.config.challengeSetting);

    currentSeasonComparison = {
      seed:             this.config.seed,
      challengeSetting: this.config.challengeSetting,
      presetResults,
      userVaultConfig:  cloneVaultConfig(this.config.vaultConfig),
      userSeasonResult: result,
      userPresetLabel:  getPresetLabel(this.config.vaultConfig),
    };
  }

  // ── Internal: aggregate builders ─────────────────────────────────────────

  _buildSeasonResult() {
    const days = this._days;

    const totalPacksOpened = { login: 0, challenge: 0, vault3: 0, vault4: 0, vault5: 0 };
    let   totalDuplicates  = 0;

    const starsEarnedFromDuplicates = {
      login:          { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 },
      challenge:      { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 },
      vaultRemainder: { s1: 0, s2: 0, s3: 0, s4: 0, s5: 0 },
    };

    const starsSpentByTier     = { tier3: 0, tier4: 0, tier5: 0 };
    const vaultPurchasesByTier = { tier3: 0, tier4: 0, tier5: 0 };

    // Source tag → starsEarnedFromDuplicates key mapping
    const srcMap = { login: 'login', challenge: 'challenge', vault: 'vaultRemainder' };

    for (const day of days) {
      totalPacksOpened.login++;
      totalPacksOpened.challenge += day.challengePacks.length;

      for (const vp of day.vaultPurchases) {
        totalPacksOpened[`vault${vp.tier}`]++;
        vaultPurchasesByTier[`tier${vp.tier}`]++;
        starsSpentByTier[`tier${vp.tier}`] += vp.cost;
      }

      for (const dup of day.duplicates) {
        totalDuplicates++;
        const bucket = starsEarnedFromDuplicates[srcMap[dup.source]];
        const rKey   = `s${rarityOf(dup.id)}`;
        bucket[rKey] += dup.starsAwarded;
      }
    }

    return {
      seed:                   this.config.seed,
      challengeSetting:       this.config.challengeSetting,
      vaultConfigSnapshot:    cloneVaultConfig(this.config.vaultConfig),
      days,
      finalUniqueCount:       this.uniqueCount,
      finalStars:             this.stars,
      totalPacksOpened,
      totalDuplicates,
      starsEarnedFromDuplicates,
      starsSpentByTier,
      vaultPurchasesByTier,
      firstFiveStarDay:       this._firstFiveStarDay,
      stickerDrawCounts:      new Map(this.stickers),
    };
  }

  _buildSeasonRecord(seasonResult, seasonIndex) {
    const { starsSpentByTier, vaultPurchasesByTier } = seasonResult;
    return {
      seasonIndex,
      seed:                this.config.seed,
      presetLabel:         getPresetLabel(this.config.vaultConfig),
      vaultConfigSnapshot: cloneVaultConfig(this.config.vaultConfig),
      challengeSetting:    this.config.challengeSetting,
      finalUniqueCount:    seasonResult.finalUniqueCount,
      finalStars:          seasonResult.finalStars,
      starsSpentTotal:     starsSpentByTier.tier3 +
                           starsSpentByTier.tier4 +
                           starsSpentByTier.tier5,
      vaultPurchasesByTier,
      firstFiveStarDay:    seasonResult.firstFiveStarDay,
      completed:           seasonResult.finalUniqueCount === 108,
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Background strategy comparison
// ════════════════════════════════════════════════════════════════════════════

/**
 * Run all five preset strategies synchronously on the given seed + challenge
 * setting. Returns an object keyed by preset name → SeasonResult.
 *
 * These engines use _background: true so they never mutate seasonHistory
 * or currentSeasonComparison.
 */
function _runAllPresets(seed, challengeSetting) {
  const results = {};
  for (const [name, presetConfig] of Object.entries(PRESETS)) {
    const engine = new SimulatorEngine({
      seed,
      challengeSetting,
      vaultConfig:  cloneVaultConfig(presetConfig),
      _background:  true,
    });
    results[name] = engine.runAll();
  }
  return results;
}