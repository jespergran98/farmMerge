/**
 * ui.js — Farm Merge Valley Sticker Season Simulator
 *
 * Animation loop, DOM rendering, event listeners, speed control.
 * The ONLY module that touches the DOM directly during simulation.
 *
 * Imports  : SimulatorEngine, seasonHistory, clearSeasonHistory,
 *            currentSeasonComparison, PRESETS, rarityOf  from ./engine.js
 *            renderStats                                  from ./stats.js
 */

import {
  SimulatorEngine,
  seasonHistory,
  clearSeasonHistory,
  currentSeasonComparison,   // live ES-module binding — auto-updates when engine writes it
  PRESETS,
  rarityOf,
} from './engine.js';
import { renderStats } from './stats.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** ms per simulated day for each named speed. Max speed uses 0 (sync). */
const SPEED_DELAYS = { 1: 1000, 2: 500, 5: 200, 10: 100 };

/** Background colours for collected cards and rarity-section headers. */
const RARITY_COLORS = {
  1: '#B0AEAA',   // silver-grey
  2: '#7DAA72',   // --color-green  (leaf green)
  3: '#5B9BD5',   // --color-sky    (sky blue)
  4: '#8E6BBF',   // --color-purple (royal purple)
  5: '#F5C842',   // --color-gold   (wheat gold)
};

/** Total stickers per rarity, used to render "X / N" headers. */
const RARITY_TOTALS = { 1: 27, 2: 21, 3: 18, 4: 18, 5: 24 };

/** Rarity names for aria / display purposes. */
const RARITY_NAMES = { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };

/**
 * Map HTML <select> option values → engine challenge-setting keys.
 * HTML uses camelCase ("tasks1to7"); engine uses hyphens ("tasks1-7").
 */
const CHALLENGE_MAP = {
  all10:     'all10',
  tasks1to7: 'tasks1-7',
  tasks1to5: 'tasks1-5',
  none:      'none',
};

/**
 * Map HTML data-preset attribute values → PRESETS object keys.
 */
const PRESET_DATA_MAP = {
  'spend-greedily':   'Spend Greedily',
  '5star-only':       '5★ Only',
  'hoard-then-spend': 'Hoard Then Spend',
  'end-season-blitz': 'End-Season Blitz',
  'never-spend':      'Never Spend',
};

/** Additional slots per pack tier — mirrors engine.js constant. */
const PACK_ADDITIONAL_SLOTS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

// ═══════════════════════════════════════════════════════════════════════════
// MUTABLE STATE
// ═══════════════════════════════════════════════════════════════════════════

let engine           = null;
let currentSpeed     = 1;          // 1 | 2 | 5 | 10 | 'max'
let currentDelay     = 1000;       // ms between simulated days
let isRunning        = false;
let isPaused         = false;
let isAutoPlay       = false;
let currentSeasonNum = 1;          // 1-based; increments each auto-play season
let baseSeed         = null;       // locked on first Run; auto-play uses baseSeed + (N-1)
let pendingTimeout   = null;       // handle for clearTimeout

/** Last rendered star value — used to determine animation direction. */
let displayedStars = 0;

/** Live rarity collection counts for section headers. */
const rarityCollected = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
let totalCollected = 0;

// ═══════════════════════════════════════════════════════════════════════════
// DOM ELEMENT CACHE
// ═══════════════════════════════════════════════════════════════════════════

const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const elDayCurrent        = $('day-current');
const elStarDisplay       = $('star-digit-display');
const elBtnRun            = $('btn-run');
const elBtnPause          = $('btn-pause');
const elBtnReset          = $('btn-reset');
const elBtnAuto           = $('btn-auto');
const elAutoPill          = $('auto-pill');
const elBtnGroupMain      = $('btn-group-main');
const elProgressBar       = $('album-progress-bar');
const elProgressTrack     = $('album-progress-track');
const elProgressLabel     = $('album-progress-label');
const elEventLog          = $('event-log');
const elPresetNameDisplay = $('preset-name-display');
const elVaultTier3        = $('vault-tier-3');
const elVaultTier4        = $('vault-tier-4');
const elVaultTier5        = $('vault-tier-5');
const elVaultStartDay     = $('vault-start-day');
const elVaultEndDay       = $('vault-end-day');
const elVaultReserve      = $('vault-reserve');
const elVaultUnlimited    = $('vault-unlimited');
const elVaultMaxPerDay    = $('vault-max-per-day');
const elMaxPerDayRow      = $('max-per-day-row');
const elPriorityList      = $('priority-list');
const elChallengeSelect   = $('challenge-select');
const elSeedInput         = $('seed-input');

/** All sticker-card elements indexed by numeric sticker ID. */
const cardCache = new Map();
$$('.sticker-card[data-sticker-id]').forEach(el => {
  cardCache.set(parseInt(el.dataset.stickerId, 10), el);
});

// ═══════════════════════════════════════════════════════════════════════════
// ── SPEED SYSTEM ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set the active speed, update CSS variables, and update speed-button states.
 * Speed changes between 1×–10× take effect on the next pending timeout;
 * switching TO Max mid-run is handled by the button click handler.
 */
function setSpeed(speed) {
  currentSpeed = speed;
  currentDelay = (speed === 'max') ? 0 : (SPEED_DELAYS[speed] ?? 1000);

  // --anim-dur drives every animation keyframe duration.
  // At Max speed it is 0 ms so transitions are instantaneous.
  const animDur = (speed === 'max')
    ? 0
    : Math.min(currentDelay * 0.5, 500);

  document.documentElement.style.setProperty('--anim-dur', `${animDur}ms`);
  document.documentElement.style.setProperty(
    '--shimmer-state',
    speed === 'max' ? 'paused' : 'running',
  );

  // Update segmented-pill aria/visual state
  $$('.speed-btn').forEach(btn => {
    const active = (btn.dataset.speed === String(speed));
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('active', active);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ── VAULT CONFIG — read / write ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/** Read the current vault config from the DOM form fields. */
function readVaultConfig() {
  const tiers = {
    t3: elVaultTier3.checked,
    t4: elVaultTier4.checked,
    t5: elVaultTier5.checked,
  };

  // Priority: only enabled tiers, in the DOM order of visible priority items.
  const priority = [];
  elPriorityList.querySelectorAll('.priority-item').forEach(item => {
    if (item.hidden) return;
    priority.push(parseInt(item.dataset.tier, 10));
  });

  const maxPerDay = elVaultUnlimited.checked
    ? Infinity
    : Math.max(1, parseInt(elVaultMaxPerDay.value, 10) || 1);

  return {
    tiers,
    priority,
    startDay:  clampInt(elVaultStartDay.value,  1, 50, 1),
    endDay:    clampInt(elVaultEndDay.value,     1, 50, 50),
    reserve:   Math.max(0, parseInt(elVaultReserve.value, 10) || 0),
    maxPerDay,
  };
}

/** Write a VaultConfig object back to the DOM form fields atomically. */
function applyVaultConfig(vc) {
  elVaultTier3.checked  = vc.tiers.t3;
  elVaultTier4.checked  = vc.tiers.t4;
  elVaultTier5.checked  = vc.tiers.t5;
  elVaultStartDay.value = String(vc.startDay);
  elVaultEndDay.value   = String(vc.endDay);
  elVaultReserve.value  = String(vc.reserve);

  if (vc.maxPerDay === Infinity) {
    elVaultUnlimited.checked = true;
    elMaxPerDayRow.hidden    = true;
  } else {
    elVaultUnlimited.checked   = false;
    elMaxPerDayRow.hidden      = false;
    elVaultMaxPerDay.value     = String(vc.maxPerDay);
  }

  // Rebuild priority list: reorder DOM items to match vc.priority,
  // show enabled tiers, hide disabled ones.
  const allItems   = Array.from(elPriorityList.querySelectorAll('.priority-item'));
  const enabledSet = new Set(vc.priority);

  // First pass: mark visibility
  allItems.forEach(item => {
    const tier = parseInt(item.dataset.tier, 10);
    item.hidden = !enabledSet.has(tier);
  });

  // Second pass: re-order — append enabled tiers in vc.priority order
  vc.priority.forEach(tier => {
    const item = allItems.find(el => parseInt(el.dataset.tier, 10) === tier);
    if (item) elPriorityList.appendChild(item);
  });
  // Append hidden items last so they don't affect visual order
  allItems.forEach(item => {
    if (item.hidden) elPriorityList.appendChild(item);
  });
}

/** Read the challenge select value and map it to the engine's key. */
function readChallengeSetting() {
  return CHALLENGE_MAP[elChallengeSelect.value] ?? 'all10';
}

/** Parse seed from input; fall back to a random 32-bit unsigned integer. */
function readSeed() {
  const v = parseInt(elSeedInput.value, 10);
  return (Number.isFinite(v) && v >= 0) ? (v >>> 0) : (Math.floor(Math.random() * 0xFFFFFFFF) + 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// ── PRESET LABEL ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/** Compare a VaultConfig against all five PRESETS; return name or 'Custom'. */
function resolvePresetLabel(vc) {
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (
      vc.tiers.t3  === preset.tiers.t3  &&
      vc.tiers.t4  === preset.tiers.t4  &&
      vc.tiers.t5  === preset.tiers.t5  &&
      vc.startDay  === preset.startDay  &&
      vc.endDay    === preset.endDay    &&
      vc.reserve   === preset.reserve   &&
      vc.maxPerDay === preset.maxPerDay &&
      vc.priority.length === preset.priority.length &&
      vc.priority.every((v, i) => v === preset.priority[i])
    ) {
      return name;
    }
  }
  return 'Custom';
}

/** Refresh the preset name display and active-button highlight. */
function updatePresetLabel() {
  const vc    = readVaultConfig();
  const label = resolvePresetLabel(vc);

  elPresetNameDisplay.textContent = label;

  $$('.preset-btn').forEach(btn => {
    const name   = PRESET_DATA_MAP[btn.dataset.preset];
    const active = (name === label);
    btn.classList.toggle('preset-btn--active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ── PRIORITY LIST MANAGEMENT ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/** Show/hide priority items based on which tier checkboxes are checked. */
function syncPriorityListVisibility() {
  const enabled = {
    3: elVaultTier3.checked,
    4: elVaultTier4.checked,
    5: elVaultTier5.checked,
  };
  elPriorityList.querySelectorAll('.priority-item').forEach(item => {
    const tier = parseInt(item.dataset.tier, 10);
    item.hidden = !enabled[tier];
  });
}

/** Move a priority item up or down, skipping over hidden (disabled) siblings. */
function movePriorityItem(tier, direction) {
  const allItems     = Array.from(elPriorityList.querySelectorAll('.priority-item'));
  const visibleItems = allItems.filter(el => !el.hidden);
  const idx          = visibleItems.findIndex(el => parseInt(el.dataset.tier, 10) === tier);
  if (idx < 0) return;

  if (direction === 'up' && idx > 0) {
    elPriorityList.insertBefore(visibleItems[idx], visibleItems[idx - 1]);
  } else if (direction === 'down' && idx < visibleItems.length - 1) {
    // Insert the NEXT item before the current one — equivalent to moving current down
    elPriorityList.insertBefore(visibleItems[idx + 1], visibleItems[idx]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── STAR COUNTER — digit-slot animation ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render the star counter.
 *
 * Each digit is wrapped in a `.digit-slot` container with `overflow: hidden`.
 * When a digit value changes and animation is enabled, the slot shows two
 * spans (.digit-prev, .digit-curr) and a CSS animation slides the pair
 * upward (on increase) or downward (on decrease).
 *
 * CSS class `.digit-slide-up`  → @keyframes digit-up
 * CSS class `.digit-slide-down`→ @keyframes digit-down
 * Duration controlled by `calc(var(--anim-dur) * 0.8)` in CSS.
 */
function renderStarCounter(newValue, animate = true) {
  const direction   = (newValue >= displayedStars) ? 'up' : 'down';
  const shouldAnim  = animate && currentSpeed !== 'max' && newValue !== displayedStars;

  const maxLen  = Math.max(String(displayedStars).length, String(newValue).length, 1);
  const oldStr  = String(displayedStars).padStart(maxLen, '0');
  const newStr  = String(newValue).padStart(maxLen, '0');

  let html = '';
  for (let i = 0; i < maxLen; i++) {
    const oldDigit = oldStr[i];
    const newDigit = newStr[i];

    if (shouldAnim && oldDigit !== newDigit) {
      // Animated slot: two faces, the CSS keyframe slides them
      html += `<span class="digit-slot"><span class="digit-inner digit-slide-${direction}"><span class="digit-prev">${oldDigit}</span><span class="digit-curr">${newDigit}</span></span></span>`;
    } else {
      html += `<span class="digit-slot"><span class="digit-inner"><span class="digit-curr">${newDigit}</span></span></span>`;
    }
  }

  elStarDisplay.innerHTML = html;
  displayedStars = newValue;
}

// ═══════════════════════════════════════════════════════════════════════════
// ── ALBUM — progress bar & rarity headers ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function updateProgressBar(count) {
  const pct = count === 0 ? 0 : Math.round((count / 108) * 100);
  elProgressBar.style.width    = `${pct}%`;
  elProgressTrack.setAttribute('aria-valuenow', String(count));
  elProgressLabel.textContent  = `${count} / 108 stickers collected (${pct}%)`;
}

function updateRarityHeaders() {
  for (const r of [1, 2, 3, 4, 5]) {
    const el = $(`rarity-progress-${r}`);
    if (el) el.textContent = `${rarityCollected[r]} / ${RARITY_TOTALS[r]}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── ALBUM — card state ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply full collected appearance to a card synchronously (no animation).
 * Used both by the non-animated fast path and by the animated path after
 * visually transitioning the card.
 */
function applyCardCollected(card, rarity, drawCount) {
  if (!card) return;
  const color = RARITY_COLORS[rarity];
  card.classList.add('collected');
  card.style.background = color;
  card.style.boxShadow  = `0 0 10px 3px ${color}55`;
  card.querySelector('.card-label').textContent = '★'.repeat(rarity);
  card.querySelector('.card-badge').textContent = drawCount > 1 ? `×${drawCount}` : '';
}

/** Reset a card to its uncollected (grey, ?) state. */
function applyCardReset(card) {
  if (!card) return;
  card.classList.remove('collected', 'pop-in', 'dupe-flash');
  card.style.removeProperty('background');
  card.style.removeProperty('box-shadow');
  card.querySelector('.card-label').textContent = '?';
  card.querySelector('.card-badge').textContent = '';
}

/**
 * New-collection event: apply collected state, then trigger spring pop-in.
 * Forces a reflow between remove and re-add so the animation always restarts.
 */
function animateCardNew(id, rarity, drawCount) {
  const card = cardCache.get(id);
  if (!card) return;
  applyCardCollected(card, rarity, drawCount);
  card.classList.remove('pop-in');
  void card.offsetWidth; // flush reflow to restart animation
  card.classList.add('pop-in');
  const dur = Math.min(currentDelay * 0.5, 500);
  setTimeout(() => card.classList.remove('pop-in'), dur);
}

/**
 * Duplicate event: update badge count, flash card gold then back.
 */
function animateCardDupe(id, rarity, drawCount) {
  const card = cardCache.get(id);
  if (!card) return;
  card.querySelector('.card-badge').textContent = `×${drawCount}`;
  card.classList.remove('dupe-flash');
  void card.offsetWidth;
  card.classList.add('dupe-flash');
  const dur = Math.min(currentDelay * 0.25, 250);
  setTimeout(() => card.classList.remove('dupe-flash'), dur);
}

/** Full album reset — clears all card states and counters. */
function resetAlbum() {
  for (const r of [1, 2, 3, 4, 5]) rarityCollected[r] = 0;
  totalCollected = 0;
  cardCache.forEach(card => applyCardReset(card));
  updateRarityHeaders();
  updateProgressBar(0);
}

/**
 * Flush the entire album from a final SimulatorState.stickers Map.
 * Called at Max speed — one synchronous DOM pass, zero animations.
 */
function flushAlbumFromState(stickersMap) {
  // Reset counters
  for (const r of [1, 2, 3, 4, 5]) rarityCollected[r] = 0;
  totalCollected = 0;
  // Reset all cards first (clear any previously animated state)
  cardCache.forEach(card => applyCardReset(card));
  // Apply collected state
  stickersMap.forEach((drawCount, id) => {
    if (drawCount > 0) {
      const rarity = rarityOf(id);
      rarityCollected[rarity]++;
      totalCollected++;
      applyCardCollected(cardCache.get(id), rarity, drawCount);
    }
  });
  updateRarityHeaders();
  updateProgressBar(totalCollected);
}

// ═══════════════════════════════════════════════════════════════════════════
// ── EVENT LOG ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const MAX_LOG_LINES = 8;

/**
 * Render a sticker badge as an inline HTML fragment.
 * "NEW ★N" for first collection, "★N" otherwise.
 */
function stickerBadgeHTML(s) {
  if (s.isNew) {
    return `<span class="log-new">NEW&nbsp;★${s.rarity}</span>`;
  }
  return `<span class="log-stk rarity-${s.rarity}">★${s.rarity}</span>`;
}

/**
 * Collapse the raw EventEntry[] log into display lines.
 *
 * Rules:
 *  - Login / Vault entries → one line each.
 *  - Challenge entries → group all consecutive same-day, same-tier entries
 *    into one display line per tier (e.g. "4×2★: ★2 ★1 …").
 *
 * Returns an array of plain objects: { day, label, bodyHTML }
 */
function buildDisplayLines(rawLog) {
  const lines = [];
  let i = 0;

  while (i < rawLog.length) {
    const entry = rawLog[i];

    if (entry.type === 'login') {
      // ── Login pack ─────────────────────────────────────────────────────
      const stks    = entry.stickers.map(stickerBadgeHTML).join(' ');
      let   dupeStr = '';
      if (entry.starsAwarded > 0) {
        const n = entry.stickers.filter(s => !s.isNew).length;
        dupeStr = ` <span class="log-stars">(+${entry.starsAwarded} stars from ${n} dupe${n !== 1 ? 's' : ''})</span>`;
      }
      lines.push({
        day:      entry.day,
        label:    `${entry.packTier}★ Login`,
        bodyHTML: stks + dupeStr,
      });
      i++;

    } else if (entry.type === 'vault') {
      // ── Vault pack ─────────────────────────────────────────────────────
      // Guaranteed sticker (first) + "+" + remainder
      const [guaranteed, ...remainder] = entry.stickers;
      const guaranteedHTML  = stickerBadgeHTML(guaranteed);
      const remainderHTML   = remainder.map(stickerBadgeHTML).join(' ');
      const remPart         = remainder.length > 0 ? `&nbsp;+&nbsp;${remainderHTML}` : '';
      let   dupeStr         = '';
      if (entry.starsAwarded > 0) {
        const n = remainder.filter(s => !s.isNew).length;
        dupeStr = ` <span class="log-stars">(+${entry.starsAwarded} stars from ${n} dupe${n !== 1 ? 's' : ''})</span>`;
      }
      lines.push({
        day:      entry.day,
        label:    `${entry.packTier}★ Vault`,
        bodyHTML: guaranteedHTML + remPart + dupeStr,
      });
      i++;

    } else {
      // ── Challenge packs — collapse same-day, same-tier groups ──────────
      const sameDay = entry.day;
      // Advance j to consume all consecutive same-day challenge entries
      let j = i;
      while (
        j < rawLog.length &&
        rawLog[j].type === 'challenge' &&
        rawLog[j].day  === sameDay
      ) j++;

      // Group by tier within this day slice
      const byTier = new Map(); // tier → { stickers[], starsAwarded, packCount }
      for (let k = i; k < j; k++) {
        const e = rawLog[k];
        if (!byTier.has(e.packTier)) {
          byTier.set(e.packTier, { stickers: [], starsAwarded: 0, packCount: 0 });
        }
        const grp = byTier.get(e.packTier);
        grp.stickers.push(...e.stickers);
        grp.starsAwarded += e.starsAwarded;
        grp.packCount++;
      }

      // One display line per tier, ordered numerically
      const sortedTiers = [...byTier.keys()].sort((a, b) => a - b);
      for (const tier of sortedTiers) {
        const grp      = byTier.get(tier);
        const tierTag  = `<span class="log-tier">${grp.packCount}×${tier}★:</span>`;
        const stksHTML = grp.stickers.map(stickerBadgeHTML).join(' ');
        let   dupeStr  = '';
        if (grp.starsAwarded > 0) {
          const n = grp.stickers.filter(s => !s.isNew).length;
          dupeStr = ` <span class="log-stars">(+${grp.starsAwarded} stars from ${n} dupe${n !== 1 ? 's' : ''})</span>`;
        }
        lines.push({
          day:      sameDay,
          label:    'Challenge',
          bodyHTML: `${tierTag} ${stksHTML}${dupeStr}`,
        });
      }
      i = j;
    }
  }

  return lines;
}

/**
 * Re-render the event log from the raw engine log array.
 *
 * At Max speed / non-animated: direct innerHTML replace, no animation.
 * Animated: newest entry gets `.log-entry--new` for CSS slide-in.
 */
function renderEventLog(rawLog, animate) {
  const displayLines = buildDisplayLines(rawLog);
  const visible      = displayLines.slice(-MAX_LOG_LINES);

  const makeEntryHTML = (line, isNewest) => {
    const cls = 'log-entry' + (isNewest ? ' log-entry--new' : '');
    return (
      `<li class="${cls}">` +
      `<span class="log-day">Day&nbsp;${String(line.day).padStart(2)}</span>` +
      `<span class="log-type">${line.label}</span>` +
      `<span class="log-arrow">→</span>` +
      `<span class="log-body">${line.bodyHTML}</span>` +
      `</li>`
    );
  };

  const isMax = !animate || currentSpeed === 'max';
  elEventLog.innerHTML = visible
    .map((line, idx) => makeEntryHTML(line, !isMax && idx === visible.length - 1))
    .join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// ── DAY RESULT APPLICATION ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply a DayResult to the DOM.
 * `animate=true`  → spring pop-ins, dupe flashes, star counter roll.
 * `animate=false` → direct state writes only (Max speed path).
 *
 * Note: called with `animate=true` at 1×–10×; the DOM updates happen
 * synchronously so CSS animations overlay the subsequent timeout gap.
 */
function applyDayResult(dayResult, animate) {
  // Day counter
  elDayCurrent.textContent = String(dayResult.day);

  // Star counter — read state snapshot for current draw counts
  const state = engine.getState();

  // New unique stickers
  for (const id of dayResult.newUniques) {
    const rarity    = rarityOf(id);
    const drawCount = state.stickers.get(id);
    rarityCollected[rarity]++;
    totalCollected++;
    if (animate) {
      animateCardNew(id, rarity, drawCount);
    } else {
      applyCardCollected(cardCache.get(id), rarity, drawCount);
    }
  }

  // Duplicate stickers
  for (const dup of dayResult.duplicates) {
    const id        = dup.id;
    const rarity    = rarityOf(id);
    const drawCount = state.stickers.get(id);
    if (animate) {
      animateCardDupe(id, rarity, drawCount);
    } else {
      const card = cardCache.get(id);
      if (card) card.querySelector('.card-badge').textContent = `×${drawCount}`;
    }
  }

  updateRarityHeaders();
  updateProgressBar(totalCollected);

  // Star counter animation: compare to the balance we last displayed
  renderStarCounter(dayResult.starBalanceAfter, animate);

  // Event log
  renderEventLog(state.log, animate);
}

// ═══════════════════════════════════════════════════════════════════════════
// ── SIMULATION LOOP — 1×–10× ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run one simulated day, apply it to the DOM, then schedule the next.
 * If speed changes, the new `currentDelay` takes effect on the NEXT call.
 */
function scheduleNextDay() {
  if (!isRunning || isPaused) return;
  if (engine.day >= 50) { handleSeasonComplete(); return; }

  // Pull current challenge setting and vault config into the engine config
  // just before each day (challenge changes take effect from the next day;
  // vault changes are evaluated per-day inside engine.runDay).
  engine.config.challengeSetting = readChallengeSetting();
  engine.config.vaultConfig      = readVaultConfig();

  const dayResult = engine.runDay();
  applyDayResult(dayResult, true);

  if (engine.day >= 50) {
    handleSeasonComplete();
    return;
  }

  pendingTimeout = setTimeout(scheduleNextDay, currentDelay);
}

// ═══════════════════════════════════════════════════════════════════════════
// ── SIMULATION LOOP — Max speed ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete the entire season (or the remaining days) synchronously, then
 * flush the DOM in one repaint. No animations, no intermediate state writes.
 *
 * This function works whether called from day 0 (fresh) or mid-run (after
 * switching to Max speed).
 */
function runMax() {
  // Capture current config
  engine.config.challengeSetting = readChallengeSetting();
  engine.config.vaultConfig      = readVaultConfig();

  // Run all remaining days synchronously
  while (engine.day < 50) {
    engine.runDay();
  }

  // ── Single synchronous DOM flush ────────────────────────────────────────
  const state = engine.getState();

  elDayCurrent.textContent = '50';

  // Album — full state rebuild (no class toggles, no animations)
  flushAlbumFromState(state.stickers);

  // Star counter (no animation)
  displayedStars = 0;          // reset so the counter renders cleanly
  renderStarCounter(state.stars, false);

  // Event log — last MAX_LOG_LINES lines, no animation
  renderEventLog(state.log, false);

  // Proceed to finalization
  handleSeasonComplete();
}

// ═══════════════════════════════════════════════════════════════════════════
// ── SEASON COMPLETION ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Called once per completed season (from either the step-by-step or Max path).
 * Renders the stats panel, then handles auto-play continuation if active.
 */
function handleSeasonComplete() {
  isRunning = false;

  // `engine._lastSeasonResult` is set by _finalizeSeasonIfComplete() at day 50.
  // `seasonHistory` and `currentSeasonComparison` (live binding) are also updated.
  const lastResult = engine._lastSeasonResult;
  if (!lastResult) return; // defensive

  renderStats(lastResult, seasonHistory, readVaultConfig(), currentSeasonComparison);

  if (isAutoPlay) {
    startNextAutoSeason();
  }
}

/**
 * Wait a fixed 1 000 ms (so the user sees the final state),
 * then reset and begin the next auto-play season.
 * Auto-play seeding rule: season N uses seed `baseSeed + (N − 1)`.
 */
async function startNextAutoSeason() {
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (!isAutoPlay) return; // user cancelled during the pause

  currentSeasonNum++;
  const nextSeed = baseSeed + (currentSeasonNum - 1);

  // Build new engine with incremented seed; inherit current challenge + vault config
  engine = new SimulatorEngine({
    seed:             nextSeed,
    challengeSetting: readChallengeSetting(),
    vaultConfig:      readVaultConfig(),
  });

  // Visual reset
  resetAlbum();
  elDayCurrent.textContent = '0';
  displayedStars = 0;
  renderStarCounter(0, false);
  elEventLog.innerHTML = '';

  isRunning = true;
  isPaused  = false;

  if (currentSpeed === 'max') {
    runMax();
  } else {
    scheduleNextDay();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── ENGINE INITIALISATION ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/** Build (or rebuild) the engine from the current form state. */
function buildEngine(overrideSeed) {
  const seed = overrideSeed ?? readSeed();
  return new SimulatorEngine({
    seed,
    challengeSetting: readChallengeSetting(),
    vaultConfig:      readVaultConfig(),
  });
}

/**
 * Full reset: cancel any pending loop, reset the engine, and clear the DOM.
 * Does NOT change the active speed or vault config.
 */
function doReset() {
  cancelPendingTimeout();
  isRunning        = false;
  isPaused         = false;
  currentSeasonNum = 1;

  const seed = readSeed();
  baseSeed   = seed;
  engine     = buildEngine(seed);

  resetAlbum();
  elDayCurrent.textContent = '0';
  displayedStars = 0;
  renderStarCounter(0, false);
  elEventLog.innerHTML = '';
}

function cancelPendingTimeout() {
  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── PLAYBACK CONTROLS ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function doRun() {
  // If a season just completed, reset before running a new one
  if (engine && engine.day >= 50) doReset();

  if (isRunning && !isPaused) return; // already running

  if (currentSpeed === 'max') {
    isRunning = true;
    isPaused  = false;
    runMax();
    return;
  }

  isRunning = true;
  isPaused  = false;
  scheduleNextDay();
}

function doPause() {
  if (!isRunning) return;
  isPaused = true;
  cancelPendingTimeout();
}

// ═══════════════════════════════════════════════════════════════════════════
// ── AUTO-PLAY TOGGLE ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function toggleAutoPlay() {
  isAutoPlay = !isAutoPlay;

  elBtnAuto.setAttribute('aria-pressed', String(isAutoPlay));
  elBtnAuto.classList.toggle('auto-active', isAutoPlay);
  elAutoPill.hidden = !isAutoPlay;
  elBtnGroupMain.classList.toggle('auto-pulsing', isAutoPlay);
}

// ═══════════════════════════════════════════════════════════════════════════
// ── EVENT LISTENERS ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

// ── Playback buttons ───────────────────────────────────────────────────────
elBtnRun.addEventListener('click',   doRun);
elBtnPause.addEventListener('click', doPause);
elBtnReset.addEventListener('click', () => {
  isAutoPlay = false;
  elBtnAuto.setAttribute('aria-pressed', 'false');
  elBtnAuto.classList.remove('auto-active');
  elAutoPill.hidden = true;
  elBtnGroupMain.classList.remove('auto-pulsing');
  doReset();
});

// ── Auto-play button ───────────────────────────────────────────────────────
elBtnAuto.addEventListener('click', toggleAutoPlay);

// ── Speed selector ─────────────────────────────────────────────────────────
$$('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const raw   = btn.dataset.speed;
    const speed = raw === 'max' ? 'max' : parseInt(raw, 10);

    if (speed === 'max' && isRunning && !isPaused) {
      // Switching TO Max mid-run: cancel the pending timeout, complete synchronously
      cancelPendingTimeout();
      setSpeed(speed);
      runMax();
      return;
    }

    setSpeed(speed);
    // For 1×–10×: the new delay applies on the next setTimeout call.
  });
});

// ── Seed input — editing triggers a reset ──────────────────────────────────
elSeedInput.addEventListener('change', () => {
  if (isRunning && !isPaused) doPause();
  doReset();
});

// ── Challenge select — takes effect from the next day (no reset) ───────────
elChallengeSelect.addEventListener('change', () => {
  // engine.config.challengeSetting is updated at the start of each runDay() call,
  // so changing the select mid-run naturally takes effect on the next day.
  updatePresetLabel();
});

// ── Vault tier checkboxes ──────────────────────────────────────────────────
[elVaultTier3, elVaultTier4, elVaultTier5].forEach(cb => {
  cb.addEventListener('change', () => {
    syncPriorityListVisibility();
    updatePresetLabel();
  });
});

// ── Vault numeric fields ───────────────────────────────────────────────────
[elVaultStartDay, elVaultEndDay, elVaultReserve, elVaultMaxPerDay].forEach(input => {
  input.addEventListener('change', updatePresetLabel);
});

// ── Unlimited-per-day checkbox ─────────────────────────────────────────────
elVaultUnlimited.addEventListener('change', () => {
  elMaxPerDayRow.hidden = elVaultUnlimited.checked;
  updatePresetLabel();
});

// ── Priority list — ▲/▼ buttons (event delegation) ────────────────────────
elPriorityList.addEventListener('click', e => {
  const btn = e.target.closest('.priority-btn');
  if (!btn) return;
  const direction = btn.dataset.direction;   // 'up' | 'down'
  const tier      = parseInt(btn.dataset.tier, 10);
  movePriorityItem(tier, direction);
  updatePresetLabel();
});

// ── Preset buttons ─────────────────────────────────────────────────────────
$$('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const presetName = PRESET_DATA_MAP[btn.dataset.preset];
    const preset     = PRESETS[presetName];
    if (!preset) return;
    applyVaultConfig(preset);   // atomically sets all editable fields
    updatePresetLabel();
  });
});

// ── Clear History (delegated — stats.js renders the button post-season) ────
// stats.js renders a button with data-action="clear-history" inside #stats-section.
document.addEventListener('click', e => {
  const clearBtn = e.target.closest('[data-action="clear-history"]');
  if (!clearBtn) return;
  clearSeasonHistory();
  // Re-render the stats panel with the now-empty history.
  // If no season has completed yet, do nothing.
  if (engine && engine._lastSeasonResult) {
    renderStats(
      engine._lastSeasonResult,
      seasonHistory,
      readVaultConfig(),
      currentSeasonComparison,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ── HELPERS ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/** Parse an integer input value and clamp it to [min, max], with a fallback. */
function clampInt(rawValue, min, max, fallback) {
  const v = parseInt(rawValue, 10);
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

// ═══════════════════════════════════════════════════════════════════════════
// ── INITIALISATION ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function init() {
  // 1. Generate a random seed and populate the seed field
  const seed = (Math.floor(Math.random() * 0xFFFFFFFE) + 1) >>> 0;
  elSeedInput.value = String(seed);
  baseSeed          = seed;

  // 2. Apply default vault strategy — "Spend Greedily" gives a compelling default
  applyVaultConfig(PRESETS['Spend Greedily']);
  updatePresetLabel();

  // 3. Set speed to 1× (updates CSS variables and button states)
  setSpeed(1);

  // 4. Initialise the engine
  engine = buildEngine(seed);

  // 5. Paint the zero-state album and counters
  resetAlbum();
  elDayCurrent.textContent = '0';
  renderStarCounter(0, false);
}

init();