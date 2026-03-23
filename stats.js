/**
 * stats.js — Farm Merge Valley Sticker Season Simulator
 *
 * Pure renderer — reads data, writes DOM, nothing else.
 * Imports nothing from engine.js directly.
 *
 * Exports:
 *   renderStats(seasonResult, seasonHistory, vaultConfig, currentSeasonComparison)
 */

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

/** Rarity accent colours, mirroring ui.js RARITY_COLORS */
const RARITY_COLORS = {
  1: '#B0AEAA',  // silver-grey
  2: '#7DAA72',  // sage green
  3: '#5B9BD5',  // sky blue
  4: '#8E6BBF',  // royal purple
  5: '#F5C842',  // wheat gold
};

const RARITY_NAMES = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary',
};

const RARITY_STARS = {
  1: '★',
  2: '★★',
  3: '★★★',
  4: '★★★★',
  5: '★★★★★',
};

const RARITY_COUNTS = { 1: 27, 2: 21, 3: 18, 4: 18, 5: 24 };

const PRESET_COLORS = {
  'Spend Greedily':   'var(--color-green)',
  '5★ Only':          'var(--color-gold)',
  'Hoard Then Spend': 'var(--color-sky)',
  'End-Season Blitz': '#E67E22',
  'Never Spend':      '#9E9E9E',
  'Custom':           'var(--color-brown)',
};

const PRESET_ORDER = [
  'Spend Greedily',
  '5★ Only',
  'Hoard Then Spend',
  'End-Season Blitz',
  'Never Spend',
];

const PRESET_ANNOTATIONS = {
  'Spend Greedily':
    'Buying packs the instant you can afford them maximises total pack count but spends stars on lower tiers that could have been saved for 5★ packs.',
  '5★ Only':
    'Holding stars for the best packs pays off only if enough stars accumulate — check whether this seed reached 800★ in time.',
  'Hoard Then Spend':
    'A mid-season inflection — the progress chart will show a visible acceleration after Day 26.',
  'End-Season Blitz':
    'Stars are used most efficiently here but there is no time to benefit from newly collected stickers feeding more runs.',
  'Never Spend':
    'The pure free-to-play floor — every other strategy should beat this or the star vault offers no real value.',
  'Custom':
    'Your custom configuration — compare against the presets to judge whether your settings are working as intended.',
  'Your Config':
    'Your custom configuration — compare against the presets to judge whether your settings are working as intended.',
};

/**
 * Expected sticker distribution per pack type (guaranteed + probability-weighted additionals).
 * Format: { 1: count, 2: count, 3: count, 4: count, 5: count }
 */
const EXPECTED_PER_PACK = {
  1: { 1: 1.70, 2: 0.30, 3: 0,    4: 0,    5: 0    },  // 1★ guaranteed + 0.7×1★ + 0.3×2★
  2: { 1: 1.00, 2: 1.80, 3: 0.20, 4: 0,    5: 0    },  // 1×2★ + 2×(0.5×1★+0.4×2★+0.1×3★)
  3: { 1: 1.20, 2: 1.05, 3: 1.60, 4: 0.15, 5: 0    },  // 1×3★ + 3×(0.4×1★+0.35×2★+0.2×3★+0.05×4★)
  4: { 1: 1.20, 2: 1.20, 3: 1.00, 4: 1.40, 5: 0.20 },  // 1×4★ + 4×(0.3×1★+0.3×2★+0.25×3★+0.1×4★+0.05×5★)
  5: { 1: 1.00, 2: 1.25, 3: 1.25, 4: 1.00, 5: 1.50 },  // 1×5★ + 5×(0.2×1★+0.25×2★+0.25×3★+0.2×4★+0.1×5★)
};

// ════════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ════════════════════════════════════════════════════════════════════════════

function rarityOf(id) {
  if (id <= 27) return 1;
  if (id <= 48) return 2;
  if (id <= 66) return 3;
  if (id <= 84) return 4;
  return 5;
}

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('data-') || k.startsWith('aria-')) e.setAttribute(k, v);
    else if (k === 'html') e.innerHTML = v;
    else e[k] = v;
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      e.appendChild(document.createTextNode(String(child)));
    } else {
      e.appendChild(child);
    }
  }
  return e;
}

function svg(tag, attrs = {}) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function fmt(n) {
  return Number.isFinite(n) ? n.toLocaleString() : '—';
}

function pct(n, total) {
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}

function presetColorVar(label) {
  return PRESET_COLORS[label] ?? PRESET_COLORS['Custom'];
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Re-render the entire #stats-section with the most recent season data.
 *
 * @param {SeasonResult}             seasonResult
 * @param {SeasonRecord[]}           seasonHistory
 * @param {VaultConfig}              vaultConfig
 * @param {CurrentSeasonComparison|null} currentSeasonComparison
 */
export function renderStats(seasonResult, seasonHistory, vaultConfig, currentSeasonComparison) {
  const historyLayer  = document.getElementById('season-history-layer');
  const currentLayer  = document.getElementById('current-season-layer');

  if (historyLayer) renderSeasonHistory(historyLayer, seasonHistory);
  if (currentLayer) renderCurrentSeason(currentLayer, seasonResult, vaultConfig, currentSeasonComparison);
}

// ════════════════════════════════════════════════════════════════════════════
// LAYER 1 — SEASON HISTORY
// ════════════════════════════════════════════════════════════════════════════

function renderSeasonHistory(container, history) {
  container.innerHTML = '';
  if (!history || history.length === 0) return;

  // Header row with Clear History button
  const headerRow = el('div', { className: 'history-header-row' },
    el('h2', { className: 'layer-title' }, '📊 Season History'),
    el('button', {
      className: 'btn-clear-history',
      'data-action': 'clear-history',
      title: 'Clear all season history',
    }, '✕ Clear History'),
  );
  container.appendChild(headerRow);

  // Outcome Chart
  container.appendChild(buildOutcomeChart(history));

  // History Table
  container.appendChild(buildHistoryTable(history));

  // Strategy Averages Block
  container.appendChild(buildStrategyAverages(history));
}

// ── Season Outcome Chart ─────────────────────────────────────────────────

function buildOutcomeChart(history) {
  const wrap = el('div', { className: 'outcome-chart-wrapper stats-subsection' });
  wrap.appendChild(el('h3', { className: 'subsection-title' }, 'Season Outcomes'));

  const W = 900, PAD_L = 54, PAD_R = 24, PAD_TOP = 14, GAP = 6;
  const TOP_H = 220, BOT_H = 100, SHARED_PAD_BOTTOM = 36;
  const totalH = PAD_TOP + TOP_H + GAP + BOT_H + SHARED_PAD_BOTTOM;

  const n     = history.length;
  const barW  = Math.max(4, Math.min(40, Math.floor((W - PAD_L - PAD_R - (n - 1) * 2) / n)));
  const step  = (W - PAD_L - PAD_R) / n;

  // Compute running average
  const avg = history.reduce((s, r) => s + r.finalUniqueCount, 0) / n;

  // Y scale helpers
  const topY  = v => PAD_TOP + TOP_H - (v / 108) * TOP_H;          // stickers 0–108
  const botY0 = PAD_TOP + TOP_H + GAP;                              // top of bottom panel
  const maxStarTotal = Math.max(...history.map(r => r.starsSpentTotal + r.finalStars), 1);

  const chart = svg('svg', {
    viewBox: `0 0 ${W} ${totalH}`,
    role: 'img',
    'aria-label': 'Season outcome chart',
    class: 'outcome-chart-svg',
  });

  // ── Background grid — top panel ──────────────────────────────────────────
  for (let v = 0; v <= 108; v += 27) {
    const y = topY(v);
    const line = svg('line', { x1: PAD_L, x2: W - PAD_R, y1: y, y2: y,
      stroke: '#D4C4A8', 'stroke-width': '1', 'stroke-dasharray': v === 0 ? '' : '3,3' });
    chart.appendChild(line);
    const lbl = svg('text', { x: PAD_L - 4, y: y + 4, 'text-anchor': 'end',
      'font-size': '10', fill: '#8B7355', 'font-family': 'Nunito, sans-serif' });
    lbl.textContent = v;
    chart.appendChild(lbl);
  }

  // 108 reference line
  const refLine = svg('line', { x1: PAD_L, x2: W - PAD_R, y1: topY(108), y2: topY(108),
    stroke: '#7DAA72', 'stroke-width': '1.5', 'stroke-dasharray': '6,4' });
  chart.appendChild(refLine);
  const refLbl = svg('text', { x: W - PAD_R + 3, y: topY(108) + 4, 'font-size': '9',
    fill: '#7DAA72', 'font-family': 'Fredoka One, sans-serif' });
  refLbl.textContent = 'Complete';
  chart.appendChild(refLbl);

  // Running average line
  const avgLine = svg('line', { x1: PAD_L, x2: W - PAD_R, y1: topY(avg), y2: topY(avg),
    stroke: '#C0392B', 'stroke-width': '1.5', 'stroke-dasharray': '4,4' });
  chart.appendChild(avgLine);
  const avgLbl = svg('text', { x: W - PAD_R + 3, y: topY(avg) + 4, 'font-size': '9',
    fill: '#C0392B', 'font-family': 'Nunito, sans-serif' });
  avgLbl.textContent = `Avg ${avg.toFixed(1)}`;
  chart.appendChild(avgLbl);

  // ── Bottom panel background ─────────────────────────────────────────────
  chart.appendChild(svg('rect', { x: PAD_L, y: botY0, width: W - PAD_L - PAD_R, height: BOT_H,
    fill: '#F9F3E6', rx: '2' }));

  // Tooltip element (absolutely positioned, managed in JS)
  const tooltipDiv = el('div', { className: 'chart-tooltip', style: { display: 'none' } });

  // ── Bars ────────────────────────────────────────────────────────────────
  history.forEach((record, i) => {
    const cx = PAD_L + i * step + step / 2;
    const bx = cx - barW / 2;

    // Top panel bar
    const color  = presetColorVar(record.presetLabel);
    const bh     = (record.finalUniqueCount / 108) * TOP_H;
    const by     = PAD_TOP + TOP_H - bh;
    const bar    = svg('rect', {
      x: bx, y: by, width: barW, height: Math.max(1, bh),
      fill: color.startsWith('var') ? getCSSVar(color) : color,
      rx: '2', class: 'outcome-bar', 'data-season': i,
    });

    // Bottom panel: stacked bar — height proportional to maxStarTotal so bars
    // are visually comparable across seasons (not all stretched to full height).
    const spentH = maxStarTotal ? (record.starsSpentTotal / maxStarTotal) * BOT_H : 0;
    const remH   = maxStarTotal ? (record.finalStars      / maxStarTotal) * BOT_H : 0;
    const spentBar    = svg('rect', { x: bx, y: botY0 + BOT_H - spentH - remH, width: barW,
      height: Math.max(0, spentH), fill: '#C0392B', rx: '1' });
    const remBar      = svg('rect', { x: bx, y: botY0 + BOT_H - remH, width: barW,
      height: Math.max(0, remH), fill: '#F5C842', rx: '1' });

    // Invisible hit-area for hover
    const hitArea = svg('rect', {
      x: bx - 2, y: PAD_TOP,
      width: barW + 4, height: totalH - PAD_TOP - 10,
      fill: 'transparent', class: 'outcome-hit',
    });

    // Tooltip data
    const tip = `Season ${record.seasonIndex} — ${record.presetLabel}\n${record.finalUniqueCount} / 108 stickers  |  ${fmt(record.starsSpentTotal)}★ spent  |  ${fmt(record.finalStars)}★ remaining`;
    hitArea.setAttribute('data-tip', tip);

    chart.appendChild(bar);
    chart.appendChild(spentBar);
    chart.appendChild(remBar);
    chart.appendChild(hitArea);

    // X axis label (season number, show every N for readability)
    const showLabel = n <= 20 || i % Math.ceil(n / 20) === 0 || i === n - 1;
    if (showLabel) {
      const lbl = svg('text', {
        x: cx, y: totalH - 4, 'text-anchor': 'middle',
        'font-size': '9', fill: '#8B7355', 'font-family': 'Nunito, sans-serif',
      });
      lbl.textContent = record.seasonIndex;
      chart.appendChild(lbl);
    }
  });

  // X axis
  chart.appendChild(svg('line', {
    x1: PAD_L, x2: W - PAD_R,
    y1: PAD_TOP + TOP_H + GAP + BOT_H, y2: PAD_TOP + TOP_H + GAP + BOT_H,
    stroke: '#8B7355', 'stroke-width': '1',
  }));

  // Panel divider
  chart.appendChild(svg('line', {
    x1: PAD_L, x2: W - PAD_R,
    y1: PAD_TOP + TOP_H + GAP / 2, y2: PAD_TOP + TOP_H + GAP / 2,
    stroke: '#D4C4A8', 'stroke-width': '1',
  }));

  // ── Panel labels ─────────────────────────────────────────────────────────
  const topLabel = svg('text', {
    x: PAD_L, y: PAD_TOP + 12, 'font-size': '10', fill: '#6B4423',
    'font-family': 'Fredoka One, sans-serif',
  });
  topLabel.textContent = 'Unique Stickers';
  chart.appendChild(topLabel);

  const botLabel = svg('text', {
    x: PAD_L, y: botY0 + 12, 'font-size': '10', fill: '#6B4423',
    'font-family': 'Fredoka One, sans-serif',
  });
  botLabel.textContent = 'Stars (spent + remaining)';
  chart.appendChild(botLabel);

  // ── Legend ───────────────────────────────────────────────────────────────
  const legend = el('div', { className: 'outcome-chart-legend' });
  const seenPresets = [...new Set(history.map(r => r.presetLabel))];
  seenPresets.forEach(label => {
    const swatch = el('span', { className: 'legend-swatch',
      style: { background: presetColorVar(label) } });
    const text   = el('span', { className: 'legend-label' }, label);
    legend.appendChild(el('span', { className: 'legend-item' }, swatch, text));
  });
  // Bottom legend for stars
  const spentSwatch = el('span', { className: 'legend-swatch', style: { background: '#C0392B' } });
  const remSwatch   = el('span', { className: 'legend-swatch', style: { background: '#F5C842' } });
  legend.appendChild(el('span', { className: 'legend-item' }, spentSwatch, el('span', { className: 'legend-label' }, 'Stars spent')));
  legend.appendChild(el('span', { className: 'legend-item' }, remSwatch,   el('span', { className: 'legend-label' }, 'Stars remaining')));

  // Tooltip hover
  const chartContainer = el('div', { className: 'outcome-chart-container', style: { position: 'relative' } });
  chartContainer.appendChild(chart);
  chartContainer.appendChild(tooltipDiv);

  chart.addEventListener('mousemove', e => {
    const hit = e.target.closest('.outcome-hit');
    if (!hit) { tooltipDiv.style.display = 'none'; return; }
    const tip = hit.getAttribute('data-tip');
    tooltipDiv.style.display = 'block';
    tooltipDiv.style.left = (e.offsetX + 14) + 'px';
    tooltipDiv.style.top  = (e.offsetY - 10) + 'px';
    tooltipDiv.style.whiteSpace = 'pre-line';
    tooltipDiv.textContent = tip;
  });
  chart.addEventListener('mouseleave', () => { tooltipDiv.style.display = 'none'; });

  wrap.appendChild(chartContainer);
  wrap.appendChild(legend);
  return wrap;
}

// ── Season History Table ─────────────────────────────────────────────────

function buildHistoryTable(history) {
  const section = el('div', { className: 'history-table-wrapper stats-subsection' });
  section.appendChild(el('h3', { className: 'subsection-title' }, 'Season Log'));

  const tableWrap = el('div', { className: 'table-wrapper' });
  const table     = el('table', { className: 'history-table',
    'aria-label': 'Completed season records, newest first' });

  const thead = el('thead');
  thead.appendChild(el('tr', {},
    el('th', { scope: 'col' }, '#'),
    el('th', { scope: 'col' }, 'Seed'),
    el('th', { scope: 'col' }, 'Preset'),
    el('th', { scope: 'col' }, 'Stickers'),
    el('th', { scope: 'col' }, 'Stars spent'),
    el('th', { scope: 'col' }, 'Vault (3★/4★/5★)'),
    el('th', { scope: 'col' }, 'Stars left'),
    el('th', { scope: 'col' }, 'Done?'),
  ));
  table.appendChild(thead);

  const tbody = el('tbody');
  const sorted = [...history].reverse();
  sorted.forEach(record => {
    const color = presetColorVar(record.presetLabel);
    const row   = el('tr', { className: 'history-row',
      style: { borderLeft: `4px solid ${resolveColor(color)}` } });

    const doneCell = record.completed
      ? el('td', { style: { color: '#7DAA72', fontWeight: '700' } }, '✓')
      : el('td', { style: { color: '#C0392B' } }, `−${108 - record.finalUniqueCount}`);

    const vp = record.vaultPurchasesByTier;
    const vpText = `${vp.tier3}×3★ / ${vp.tier4}×4★ / ${vp.tier5}×5★`;

    row.append(
      el('td', {}, String(record.seasonIndex)),
      el('td', { style: { fontFamily: 'monospace', fontSize: '11px' } }, String(record.seed)),
      el('td', { className: 'preset-cell',
        style: { borderLeft: `3px solid ${resolveColor(color)}`, paddingLeft: '8px' } },
        record.presetLabel),
      el('td', { className: 'num-cell' }, `${record.finalUniqueCount} / 108`),
      el('td', { className: 'num-cell' }, `${fmt(record.starsSpentTotal)}★`),
      el('td', { className: 'num-cell', style: { fontSize: '11px' } }, vpText),
      el('td', { className: 'num-cell' }, `${fmt(record.finalStars)}★`),
      doneCell,
    );
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  section.appendChild(tableWrap);
  return section;
}

// ── Strategy Averages Block ──────────────────────────────────────────────

function buildStrategyAverages(history) {
  const section = el('div', { className: 'strategy-averages stats-subsection' });
  section.appendChild(el('h3', { className: 'subsection-title' }, 'Strategy Averages'));

  const grid = el('div', { className: 'averages-grid' });

  // Group by preset
  const groups = {};
  history.forEach(r => {
    if (!groups[r.presetLabel]) groups[r.presetLabel] = [];
    groups[r.presetLabel].push(r);
  });

  PRESET_ORDER.forEach(preset => {
    if (!groups[preset]) return;
    grid.appendChild(buildAverageCard(preset, groups[preset]));
  });
  if (groups['Custom']) {
    grid.appendChild(buildAverageCard('Custom', groups['Custom']));
  }

  section.appendChild(grid);
  return section;
}

function buildAverageCard(label, records) {
  const n          = records.length;
  const avgUnique  = records.reduce((s, r) => s + r.finalUniqueCount, 0) / n;
  const completed  = records.filter(r => r.completed).length;
  const compRate   = Math.round((completed / n) * 100);
  const avgStarsLeft = Math.round(records.reduce((s, r) => s + r.finalStars, 0) / n);
  const color      = presetColorVar(label);

  const card = el('div', { className: 'average-card',
    style: { borderTop: `4px solid ${resolveColor(color)}` } });

  card.appendChild(el('div', { className: 'avg-card-title',
    style: { color: resolveColor(color) } }, label));
  card.appendChild(el('div', { className: 'avg-card-row' },
    el('span', { className: 'avg-label' }, 'Seasons run'),
    el('span', { className: 'avg-value' }, String(n))));
  card.appendChild(el('div', { className: 'avg-card-row' },
    el('span', { className: 'avg-label' }, 'Avg stickers'),
    el('span', { className: 'avg-value' }, `${avgUnique.toFixed(1)} / 108`)));
  card.appendChild(el('div', { className: 'avg-card-row' },
    el('span', { className: 'avg-label' }, 'Completion rate'),
    el('span', { className: 'avg-value' }, `${compRate}%`)));
  card.appendChild(el('div', { className: 'avg-card-row' },
    el('span', { className: 'avg-label' }, 'Avg stars left'),
    el('span', { className: 'avg-value' }, `${fmt(avgStarsLeft)}★`)));

  return card;
}

// ════════════════════════════════════════════════════════════════════════════
// LAYER 2 — CURRENT SEASON
// ════════════════════════════════════════════════════════════════════════════

function renderCurrentSeason(container, seasonResult, vaultConfig, comparison) {
  if (!seasonResult) { container.innerHTML = ''; return; }

  // Find or create each subsection target by ID
  renderSeasonSummary(document.getElementById('stats-season-summary'),       seasonResult);
  renderDailyTimeline(document.getElementById('stats-daily-timeline'),       seasonResult, vaultConfig);
  renderProgressChart(document.getElementById('stats-progress-chart'),       seasonResult, vaultConfig);
  renderPackYield(    document.getElementById('stats-pack-yield'),           seasonResult);
  renderRarityHeatmap(document.getElementById('heatmap-grid'),               seasonResult);
  renderWaterfall(    document.getElementById('chart-star-waterfall'),
                      document.getElementById('waterfall-summary'),          seasonResult);
  renderStrategyComparison(document.getElementById('comparison-tbody'),      seasonResult, comparison);
}

// ── 1. Season Summary ────────────────────────────────────────────────────

function renderSeasonSummary(container, r) {
  if (!container) return;
  container.innerHTML = '';

  const tp = r.totalPacksOpened;
  const se = r.starsEarnedFromDuplicates;
  const sb = r.starsSpentByTier;
  const vb = r.vaultPurchasesByTier;

  const totalEarned = sumObj(se.login) + sumObj(se.challenge) + sumObj(se.vaultRemainder);
  const totalSpent  = sb.tier3 + sb.tier4 + sb.tier5;
  const isComplete  = r.finalUniqueCount === 108;

  // Login packs cycle 1★–5★ (2–6 stickers each); challenge packs span 1★–4★.
  // Neither is a flat ×2, so we count from actual draw data.
  const totalStickersDrawn = r.days.reduce((sum, day) => {
    sum += 1 + day.loginPack.additional.length;
    day.challengePacks.forEach(p  => { sum += 1 + p.additional.length; });
    day.vaultPurchases.forEach(vp => { sum += 1 + vp.remainderStickers.length; });
    return sum;
  }, 0);

  const cards = [
    { label: 'Login packs',       value: tp.login },
    { label: 'Challenge packs',   value: tp.challenge },
    { label: 'Vault 3★ packs',    value: tp.vault3 },
    { label: 'Vault 4★ packs',    value: tp.vault4 },
    { label: 'Vault 5★ packs',    value: tp.vault5 },
    { label: 'Total stickers drawn', value: totalStickersDrawn },
    { label: 'Duplicates drawn',  value: r.totalDuplicates },
    { label: '★ from login dupes',   value: `${fmt(sumObj(se.login))}★` },
    { label: '★ from challenge dupes', value: `${fmt(sumObj(se.challenge))}★` },
    { label: '★ from vault dupes', value: `${fmt(sumObj(se.vaultRemainder))}★` },
    { label: '★ spent (3★ vault)', value: `${fmt(sb.tier3)}★` },
    { label: '★ spent (4★ vault)', value: `${fmt(sb.tier4)}★` },
    { label: '★ spent (5★ vault)', value: `${fmt(sb.tier5)}★` },
    { label: 'Unique stickers',
      value: `${r.finalUniqueCount} / 108 (${Math.round(r.finalUniqueCount / 108 * 100)}%)` },
    { label: 'Season result',
      value: isComplete ? '✓ Complete' : `${108 - r.finalUniqueCount} missing`,
      highlight: isComplete ? 'green' : 'red' },
    { label: 'First 5★ collected',
      value: r.firstFiveStarDay ? `Day ${r.firstFiveStarDay}` : '—' },
    { label: 'Vault purchases',
      value: `3★ ×${vb.tier3}  4★ ×${vb.tier4}  5★ ×${vb.tier5}` },
  ];

  const grid = el('div', { className: 'summary-grid' });
  cards.forEach(c => {
    const card = el('div', { className: 'stat-card' });
    card.appendChild(el('div', { className: 'stat-label' }, c.label));
    const valEl = el('div', { className: 'stat-value' }, String(c.value));
    if (c.highlight === 'green') valEl.style.color = 'var(--color-green)';
    if (c.highlight === 'red')   valEl.style.color = 'var(--color-red)';
    card.appendChild(valEl);
    grid.appendChild(card);
  });
  container.appendChild(grid);
}

// ── 2. Daily Timeline ────────────────────────────────────────────────────

function renderDailyTimeline(container, r, vaultConfig) {
  if (!container) return;
  // Clear only the inner content (not the section title)
  const existing = container.querySelector('.timeline-scroll-wrap');
  if (existing) existing.remove();

  const scroll = el('div', { className: 'timeline-scroll-wrap' });
  const strip  = el('div', { className: 'timeline-strip' });

  const anyTierEnabled = vaultConfig.tiers.t3 || vaultConfig.tiers.t4 || vaultConfig.tiers.t5;

  r.days.forEach(day => {
    const isVaultStartDay = anyTierEnabled && day.day === vaultConfig.startDay;
    const isZeroBalance   = day.starBalanceAfter === 0;

    const col = el('div', {
      className: 'timeline-col' +
        (isVaultStartDay ? ' vault-start-col' : '') +
        (isZeroBalance   ? ' zero-balance-col' : ''),
    });

    // Day number
    col.appendChild(el('div', { className: 'tl-day-num' }, String(day.day)));

    // Login pack tier
    const loginTier = day.loginPack.tier;
    col.appendChild(el('div', { className: 'tl-login',
      style: { color: RARITY_COLORS[loginTier] }, title: `Login pack: ${loginTier}★` },
      RARITY_STARS[loginTier]));

    // Challenge packs summary
    if (day.challengePacks.length > 0) {
      const tierCounts = {};
      day.challengePacks.forEach(p => { tierCounts[p.tier] = (tierCounts[p.tier] || 0) + 1; });
      const parts = Object.entries(tierCounts).sort(([a], [b]) => a - b)
        .map(([t, cnt]) => `${cnt}×${t}★`);
      col.appendChild(el('div', { className: 'tl-challenges',
        style: { fontSize: '9px', color: '#6B4423' } },
        parts.join(' ')));
    } else {
      col.appendChild(el('div', { className: 'tl-challenges' }, ''));
    }

    // Vault purchases
    if (day.vaultPurchases.length > 0) {
      const vtierCounts = {};
      day.vaultPurchases.forEach(vp => { vtierCounts[vp.tier] = (vtierCounts[vp.tier] || 0) + 1; });
      const vparts = Object.entries(vtierCounts).sort(([a], [b]) => b - a)
        .map(([t, cnt]) => `${cnt}×${t}★`);
      col.appendChild(el('div', { className: 'tl-vault',
        style: { fontSize: '9px', color: '#8E6BBF' } },
        '⚡ ' + vparts.join(' ')));
    } else {
      col.appendChild(el('div', { className: 'tl-vault' }, ''));
    }

    // Net new uniques
    if (day.netUniqueGain > 0) {
      col.appendChild(el('div', { className: 'tl-new-uniques',
        style: { color: 'var(--color-green)', fontWeight: '700' } },
        `+${day.netUniqueGain}`));
    } else {
      col.appendChild(el('div', { className: 'tl-new-uniques' }, ''));
    }

    // Stars earned
    col.appendChild(el('div', { className: 'tl-stars-earned',
      style: { fontSize: '9px', color: '#F5C842' } },
      day.starsEarned > 0 ? `+${day.starsEarned}★` : ''));

    // Stars spent
    if (day.starsSpent > 0) {
      col.appendChild(el('div', { className: 'tl-stars-spent',
        style: { color: 'var(--color-red)', fontSize: '9px' } },
        `−${day.starsSpent}★`));
    } else {
      col.appendChild(el('div', { className: 'tl-stars-spent' }, ''));
    }

    strip.appendChild(col);
  });

  scroll.appendChild(strip);
  container.appendChild(scroll);
}

// ── 3. Cumulative Progress Chart ─────────────────────────────────────────

function renderProgressChart(container, r, vaultConfig) {
  if (!container) return;
  const existing = container.querySelector('.progress-chart-container');
  if (existing) existing.remove();

  const W = 860, PAD_L = 50, PAD_R = 58, PAD_T = 20, PAD_B = 36;
  const H = 260;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  // Build cumulative data points
  let cumUnique  = 0;
  const uniquePts = [];
  const starPts   = [];
  r.days.forEach(day => {
    cumUnique += day.netUniqueGain;
    uniquePts.push(cumUnique);
    starPts.push(day.starBalanceAfter);
  });

  const peakStars = Math.max(...starPts, 0);
  const starMax   = Math.max(500, Math.ceil(peakStars / 500) * 500);

  const xOf  = i => PAD_L + (i / 49) * innerW;
  const yuOf = v => PAD_T + innerH - (v / 108) * innerH;
  const ysOf = v => PAD_T + innerH - (v / starMax) * innerH;

  const chartSvg = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': 'Cumulative stickers and star balance over 50 days',
    class: 'progress-chart-svg',
  });

  // Grid lines — stickers (every 10)
  for (let v = 0; v <= 108; v += 10) {
    const y = yuOf(v);
    chartSvg.appendChild(svg('line', { x1: PAD_L, x2: W - PAD_R, y1: y, y2: y,
      stroke: '#E8DCC8', 'stroke-width': '1' }));
    if (v % 20 === 0) {
      const lbl = svg('text', { x: PAD_L - 6, y: y + 4, 'text-anchor': 'end',
        'font-size': '9', fill: '#8B7355', 'font-family': 'Nunito, sans-serif' });
      lbl.textContent = v;
      chartSvg.appendChild(lbl);
    }
  }

  // Grid lines — stars (every 500)
  for (let v = 0; v <= starMax; v += 500) {
    const y = ysOf(v);
    if (v > 0) {
      chartSvg.appendChild(svg('line', { x1: PAD_L, x2: W - PAD_R, y1: y, y2: y,
        stroke: '#F5C84233', 'stroke-width': '1' }));
    }
    const lbl = svg('text', { x: W - PAD_R + 4, y: y + 4,
      'font-size': '9', fill: '#C8A000', 'font-family': 'Nunito, sans-serif' });
    lbl.textContent = v;
    chartSvg.appendChild(lbl);
  }

  // Vault start day vertical line
  const anyTierEnabled = vaultConfig.tiers.t3 || vaultConfig.tiers.t4 || vaultConfig.tiers.t5;
  if (anyTierEnabled && vaultConfig.startDay >= 1 && vaultConfig.startDay <= 50) {
    const vx = xOf(vaultConfig.startDay - 1);
    chartSvg.appendChild(svg('line', { x1: vx, x2: vx, y1: PAD_T, y2: PAD_T + innerH,
      stroke: '#F5C842', 'stroke-width': '2', 'stroke-dasharray': '5,4' }));
    const vlbl = svg('text', { x: vx + 3, y: PAD_T + 10, 'font-size': '9',
      fill: '#C8A000', 'font-family': 'Fredoka One, sans-serif' });
    vlbl.textContent = `Vault D${vaultConfig.startDay}`;
    chartSvg.appendChild(vlbl);
  }

  // Axes
  chartSvg.appendChild(svg('line', { x1: PAD_L, x2: PAD_L,     y1: PAD_T, y2: PAD_T + innerH,
    stroke: '#8B7355', 'stroke-width': '1.5' }));
  chartSvg.appendChild(svg('line', { x1: W - PAD_R, x2: W - PAD_R, y1: PAD_T, y2: PAD_T + innerH,
    stroke: '#C8A000', 'stroke-width': '1.5' }));
  chartSvg.appendChild(svg('line', { x1: PAD_L, x2: W - PAD_R, y1: PAD_T + innerH, y2: PAD_T + innerH,
    stroke: '#8B7355', 'stroke-width': '1.5' }));

  // X axis tick labels
  for (let d = 0; d <= 50; d += 10) {
    const x = PAD_L + ((d || 1) - 1) / 49 * innerW;
    const lbl = svg('text', { x: x, y: H - 8, 'text-anchor': 'middle',
      'font-size': '9', fill: '#8B7355', 'font-family': 'Nunito, sans-serif' });
    lbl.textContent = d === 0 ? '1' : String(d);
    chartSvg.appendChild(lbl);
  }

  // Build path strings
  const uPath = uniquePts.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yuOf(v).toFixed(1)}`).join(' ');
  const sPath = starPts.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${ysOf(v).toFixed(1)}`).join(' ');

  // Animate left-to-right with stroke-dasharray/dashoffset trick
  // We use a clipPath that expands over 800ms
  const clipId = 'prog-clip-' + Date.now();
  const clipPath = svg('clipPath', { id: clipId });
  const clipRect = svg('rect', { x: PAD_L, y: 0, width: '0', height: H });
  clipPath.appendChild(clipRect);
  chartSvg.appendChild(svg('defs', {}));
  chartSvg.querySelector('defs').appendChild(clipPath);

  const uLine = svg('path', { d: uPath, fill: 'none',
    stroke: 'var(--color-green)', 'stroke-width': '2.5',
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    'clip-path': `url(#${clipId})` });
  const sLine = svg('path', { d: sPath, fill: 'none',
    stroke: 'var(--color-gold)', 'stroke-width': '2',
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    'stroke-dasharray': '5,3',
    'clip-path': `url(#${clipId})` });

  chartSvg.appendChild(sLine);
  chartSvg.appendChild(uLine);

  // Axis labels
  const ulabel = svg('text', { x: 8, y: PAD_T + innerH / 2, transform: `rotate(-90, 8, ${PAD_T + innerH / 2})`,
    'text-anchor': 'middle', 'font-size': '10', fill: '#7DAA72', 'font-family': 'Fredoka One, sans-serif' });
  ulabel.textContent = 'Stickers';
  chartSvg.appendChild(ulabel);

  const slabel = svg('text', { x: W - 8, y: PAD_T + innerH / 2,
    transform: `rotate(90, ${W - 8}, ${PAD_T + innerH / 2})`,
    'text-anchor': 'middle', 'font-size': '10', fill: '#C8A000', 'font-family': 'Fredoka One, sans-serif' });
  slabel.textContent = 'Stars';
  chartSvg.appendChild(slabel);

  const chartContainer = el('div', { className: 'progress-chart-container' });
  chartContainer.appendChild(chartSvg);

  // Legend
  const legend = el('div', { className: 'progress-legend' });
  legend.appendChild(el('span', { className: 'legend-item' },
    el('span', { className: 'legend-line-sample', style: { background: 'var(--color-green)' } }),
    el('span', { className: 'legend-label' }, 'Unique stickers (left axis)')));
  legend.appendChild(el('span', { className: 'legend-item' },
    el('span', { className: 'legend-line-sample', style: { background: 'var(--color-gold)', opacity: '0.8' } }),
    el('span', { className: 'legend-label' }, 'Star balance (right axis)')));
  chartContainer.appendChild(legend);

  container.appendChild(chartContainer);

  // Animate
  requestAnimationFrame(() => {
    const start = performance.now();
    const totalW = innerW;
    function frame(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / 800, 1);
      clipRect.setAttribute('width', String(totalW * progress));
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

// ── 4. Pack Yield Breakdown ──────────────────────────────────────────────

function renderPackYield(container, r) {
  if (!container) return;
  const existing = container.querySelector('.pack-yield-content');
  if (existing) existing.remove();

  const wrap = el('div', { className: 'pack-yield-content' });

  // Build actual counts per pack type
  // For regular packs: gather from login + challenge PackResult arrays
  // For vault packs: from vaultPurchases

  const regularActual = {}; // { tier: { 1:0,2:0,3:0,4:0,5:0, count:0 } }
  const vaultActual   = {}; // { tier: { 1:0,2:0,3:0,4:0,5:0, count:0 } }

  function recordPackActual(pack, bucket) {
    const t = pack.tier;
    if (!bucket[t]) bucket[t] = { 1:0,2:0,3:0,4:0,5:0, count:0 };
    bucket[t].count++;
    // guaranteed
    bucket[t][rarityOf(pack.guaranteed)]++;
    // additional
    pack.additional.forEach(id => bucket[t][rarityOf(id)]++);
  }

  r.days.forEach(day => {
    recordPackActual(day.loginPack, regularActual);
    day.challengePacks.forEach(p => recordPackActual(p, regularActual));
    day.vaultPurchases.forEach(vp => {
      const t = vp.tier;
      if (!vaultActual[t]) vaultActual[t] = { 1:0,2:0,3:0,4:0,5:0, count:0 };
      vaultActual[t].count++;
      // vault guaranteed = always rarity t
      vaultActual[t][t]++;
      // remainder
      vp.remainderStickers.forEach(id => vaultActual[t][rarityOf(id)]++);
    });
  });

  // Build expected for vault (same as regular but guaranteed is always exactly 1 of tier t)
  // Expected is the same formula as regular (guarantee slot contributes same rarity)
  // so we just use EXPECTED_PER_PACK for both

  // Rarity legend
  const legend = el('div', { className: 'yield-legend' });
  [1,2,3,4,5].forEach(r2 => {
    legend.appendChild(el('span', { className: 'legend-item' },
      el('span', { className: 'legend-swatch', style: { background: RARITY_COLORS[r2] } }),
      el('span', { className: 'legend-label' }, `${r2}★`)));
  });
  wrap.appendChild(legend);

  // Rows for regular packs
  [1,2,3,4,5].forEach(tier => {
    const actual = regularActual[tier];
    if (!actual || actual.count === 0) return;
    wrap.appendChild(buildYieldRow(`${tier}★ Pack`, tier, actual, false));
  });

  // Rows for vault packs
  [3,4,5].forEach(tier => {
    const actual = vaultActual[tier];
    if (!actual || actual.count === 0) return;
    wrap.appendChild(buildYieldRow(`Vault ${tier}★`, tier, actual, true));
  });

  container.appendChild(wrap);
}

function buildYieldRow(label, tier, actual, isVault) {
  const totalActual = [1,2,3,4,5].reduce((s, r) => s + actual[r], 0);
  const expected    = EXPECTED_PER_PACK[tier];
  const totalExpected = [1,2,3,4,5].reduce((s, r) => s + expected[r], 0);

  const rowWrap = el('div', { className: 'yield-row' });
  rowWrap.appendChild(el('div', { className: 'yield-row-label' }, label));

  const bars = el('div', { className: 'yield-bars' });

  // Actual bar
  const actualBar = el('div', { className: 'yield-bar-row' });
  actualBar.appendChild(el('span', { className: 'yield-bar-tag' }, 'Actual'));
  const actualBarInner = el('div', { className: 'yield-stacked-bar' });
  [1,2,3,4,5].forEach(r => {
    if (actual[r] === 0) return;
    const frac = actual[r] / totalActual;
    const seg  = el('div', {
      className: 'yield-bar-segment',
      style: {
        width: (frac * 100).toFixed(2) + '%',
        background: RARITY_COLORS[r],
        position: 'relative',
      },
      title: `${r}★: ${actual[r]} (${(frac * 100).toFixed(1)}%)`,
    });
    if (frac >= 0.08) {
      seg.appendChild(el('span', { className: 'yield-seg-label' },
        (frac * 100).toFixed(1) + '%'));
    }
    actualBarInner.appendChild(seg);
  });
  actualBar.appendChild(actualBarInner);
  bars.appendChild(actualBar);

  // Expected bar
  const expectedBar = el('div', { className: 'yield-bar-row' });
  expectedBar.appendChild(el('span', { className: 'yield-bar-tag' }, 'Expected'));
  const expectedBarInner = el('div', { className: 'yield-stacked-bar' });
  [1,2,3,4,5].forEach(r => {
    if (!expected[r] || expected[r] === 0) return;
    const frac = expected[r] / totalExpected;
    const seg  = el('div', {
      className: 'yield-bar-segment yield-bar-segment--expected',
      style: {
        width: (frac * 100).toFixed(2) + '%',
        background: RARITY_COLORS[r],
        opacity: '0.55',
      },
      title: `${r}★ expected: ${(frac * 100).toFixed(1)}%`,
    });
    if (frac >= 0.08) {
      seg.appendChild(el('span', { className: 'yield-seg-label' },
        (frac * 100).toFixed(1) + '%'));
    }
    expectedBarInner.appendChild(seg);
  });
  expectedBar.appendChild(expectedBarInner);
  bars.appendChild(expectedBar);

  rowWrap.appendChild(bars);
  return rowWrap;
}

// ── 5. Rarity Heatmap ───────────────────────────────────────────────────

function renderRarityHeatmap(container, r) {
  if (!container) return;

  // Build collection day map
  const collectionDay = new Map(); // id → first day collected
  r.days.forEach(day => {
    day.newUniques.forEach(id => {
      if (!collectionDay.has(id)) collectionDay.set(id, day.day);
    });
  });

  container.querySelectorAll('.heatmap-cell').forEach(cell => {
    const id     = parseInt(cell.dataset.stickerId, 10);
    const rarity = parseInt(cell.dataset.rarity, 10);
    const dc     = r.stickerDrawCounts.get(id) ?? 0;
    const day    = collectionDay.get(id);

    if (dc === 0) {
      cell.style.background = '#BDBDBD';
      cell.style.opacity    = '1';
      const ariaBase = cell.getAttribute('aria-label') || `Sticker ${id} (${rarity}★)`;
      cell.setAttribute('aria-label', ariaBase + ' — Not collected');
      cell.setAttribute('data-tip',
        `Sticker #${id} (${RARITY_STARS[rarity]}) — Not collected this season`);
    } else {
      const opacity = 1.0 - ((day - 1) / 49) * 0.65;
      cell.style.background = RARITY_COLORS[rarity];
      cell.style.opacity    = String(opacity.toFixed(3));
      const dupes = dc - 1;
      cell.setAttribute('data-tip',
        `Sticker #${id} (${RARITY_STARS[rarity]}) — Collected Day ${day} — Seen ${dc}× total${dupes > 0 ? ` (${dupes} duplicate${dupes > 1 ? 's' : ''})` : ''}`);
    }
  });

  // Ensure tooltip div exists on heatmap container
  let tipEl = container.parentElement?.querySelector('.heatmap-tooltip');
  if (!tipEl) {
    tipEl = el('div', { className: 'heatmap-tooltip chart-tooltip', style: { display: 'none' } });
    (container.parentElement ?? container).appendChild(tipEl);
  }

  container.onmousemove = e => {
    const cell = e.target.closest('[data-tip]');
    if (!cell) { tipEl.style.display = 'none'; return; }
    const rect = container.getBoundingClientRect();
    tipEl.style.display = 'block';
    tipEl.style.left = (e.clientX - rect.left + 12) + 'px';
    tipEl.style.top  = (e.clientY - rect.top  - 8)  + 'px';
    tipEl.textContent = cell.getAttribute('data-tip');
  };
  container.onmouseleave = () => { tipEl.style.display = 'none'; };
}

// ── 6. Star Economy Waterfall ────────────────────────────────────────────

function renderWaterfall(chartEl, summaryEl, r) {
  if (!chartEl) return;

  const se = r.starsEarnedFromDuplicates;
  const sb = r.starsSpentByTier;

  // Build segments
  const segments = [];

  function addInflow(label, obj) {
    let total = sumObj(obj);
    if (total > 0) {
      segments.push({
        type: 'inflow',
        label,
        value: total,
        breakdown: obj,
      });
    }
  }

  addInflow('Login dupes',     se.login);
  addInflow('Challenge dupes', se.challenge);
  addInflow('Vault dupes',     se.vaultRemainder);

  function addOutflow(label, value) {
    if (value > 0) {
      segments.push({ type: 'outflow', label, value });
    }
  }

  addOutflow('Vault 3★',  sb.tier3);
  addOutflow('Vault 4★',  sb.tier4);
  addOutflow('Vault 5★',  sb.tier5);

  const totalEarned  = sumObj(se.login) + sumObj(se.challenge) + sumObj(se.vaultRemainder);
  const totalSpent   = sb.tier3 + sb.tier4 + sb.tier5;
  const finalBalance = r.finalStars;

  if (summaryEl) {
    summaryEl.textContent = `Total earned: ${fmt(totalEarned)}★  −  Total spent: ${fmt(totalSpent)}★  =  Remaining: ${fmt(finalBalance)}★`;
  }

  // SVG waterfall
  const W    = 800;
  const H    = 340;
  const PAD  = { l: 60, r: 20, t: 30, b: 60 };
  const innerH = H - PAD.t - PAD.b;

  // All items: inflows + outflows + balance
  const items = [
    ...segments,
    { type: 'balance', label: 'Remaining', value: finalBalance },
  ];

  const maxValue = Math.max(totalEarned, totalSpent, finalBalance, 1);
  const scale = innerH / maxValue;

  const nItems  = items.length;
  const innerW  = W - PAD.l - PAD.r;
  const barW    = Math.min(60, Math.floor(innerW / (nItems + 1)));
  const barStep = innerW / nItems;

  chartEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  chartEl.innerHTML = '';

  let cumulative = 0;

  // Background
  const bg = svg('rect', { x: PAD.l, y: PAD.t, width: innerW, height: innerH,
    fill: '#FAF5E8', rx: '4' });
  chartEl.appendChild(bg);

  // Y axis
  for (let v = 0; v <= maxValue; v += Math.ceil(maxValue / 6 / 100) * 100 || 100) {
    const y = PAD.t + innerH - v * scale;
    if (y < PAD.t) break;
    chartEl.appendChild(svg('line', { x1: PAD.l, x2: W - PAD.r, y1: y, y2: y,
      stroke: '#E0D4B8', 'stroke-width': '1' }));
    const lbl = svg('text', { x: PAD.l - 4, y: y + 4, 'text-anchor': 'end',
      'font-size': '9', fill: '#8B7355', 'font-family': 'Nunito, sans-serif' });
    lbl.textContent = fmt(v);
    chartEl.appendChild(lbl);
  }

  // Baseline
  chartEl.appendChild(svg('line', { x1: PAD.l, x2: W - PAD.r,
    y1: PAD.t + innerH, y2: PAD.t + innerH,
    stroke: '#8B7355', 'stroke-width': '1.5' }));

  // Render each bar
  items.forEach((item, i) => {
    const bx   = PAD.l + i * barStep + (barStep - barW) / 2;
    const bh   = Math.max(2, item.value * scale);
    let barY, barColor;

    if (item.type === 'inflow') {
      barY      = PAD.t + innerH - cumulative * scale - bh;
      barColor  = '#7DAA72'; // --color-green
      cumulative += item.value;
    } else if (item.type === 'outflow') {
      barY     = PAD.t + innerH - cumulative * scale;
      barColor = '#C0392B'; // --color-red
      cumulative -= item.value;
    } else {
      // balance
      barY     = PAD.t + innerH - item.value * scale;
      barColor = '#F5C842';
    }

    // Inflow: sub-segment by rarity
    if (item.type === 'inflow' && item.breakdown) {
      let subY = barY + bh; // bottom of this bar going up
      [1,2,3,4,5].forEach(r2 => {
        const rVal = item.breakdown[`s${r2}`] || 0;
        if (rVal === 0) return;
        const sh = rVal * scale;
        subY -= sh;
        const rect = svg('rect', { x: bx, y: subY, width: barW, height: sh,
          fill: RARITY_COLORS[r2], rx: '2' });
        chartEl.appendChild(rect);
        if (sh > 14) {
          const lbl = svg('text', { x: bx + barW / 2, y: subY + sh / 2 + 4,
            'text-anchor': 'middle', 'font-size': '8', fill: '#fff',
            'font-family': 'Nunito, sans-serif' });
          lbl.textContent = fmt(rVal);
          chartEl.appendChild(lbl);
        }
      });
    } else {
      chartEl.appendChild(svg('rect', { x: bx, y: barY, width: barW, height: bh,
        fill: barColor, rx: '2' }));
    }

    // Numeric label above/below bar
    const labelY = item.type === 'outflow'
      ? barY + bh + 12
      : barY - 4;
    const numLbl = svg('text', { x: bx + barW / 2, y: labelY, 'text-anchor': 'middle',
      'font-size': '9', fill: '#6B4423', 'font-family': 'Nunito, sans-serif', 'font-weight': '600' });
    numLbl.textContent = fmt(item.value) + '★';
    chartEl.appendChild(numLbl);

    // Bar label at bottom
    const xLabel = svg('text', {
      x: bx + barW / 2,
      y: H - PAD.b + 14,
      'text-anchor': 'middle',
      'font-size': '9',
      fill: '#6B4423',
      'font-family': 'Nunito, sans-serif',
      transform: `rotate(-30, ${bx + barW / 2}, ${H - PAD.b + 14})`,
    });
    xLabel.textContent = item.label;
    chartEl.appendChild(xLabel);

    // Connector line for waterfall flow
    if (i < items.length - 1 && item.type !== 'balance') {
      const connY = PAD.t + innerH - cumulative * scale;
      chartEl.appendChild(svg('line', {
        x1: bx + barW, x2: bx + barStep,
        y1: connY, y2: connY,
        stroke: '#C8B89A', 'stroke-width': '1', 'stroke-dasharray': '3,2',
      }));
    }
  });
}

// ── 7. Strategy Comparison ───────────────────────────────────────────────

function renderStrategyComparison(tbody, seasonResult, comparison) {
  if (!tbody || !comparison) return;
  tbody.innerHTML = '';

  const userLabel  = comparison.userPresetLabel;
  const isCustom   = userLabel === 'Custom';
  const presetRes  = comparison.presetResults;
  const userResult = comparison.userSeasonResult;

  // Build row data
  const rows = [];

  PRESET_ORDER.forEach(preset => {
    const res = presetRes[preset];
    if (!res) return;
    // If user matches this preset exactly, use user's result (same data, labeled as preset)
    const useUserResult = !isCustom && preset === userLabel;
    const result = useUserResult ? userResult : res;
    rows.push({
      label: preset,
      uniqueCount:     result.finalUniqueCount,
      starsSpent:      result.starsSpentByTier.tier3 + result.starsSpentByTier.tier4 + result.starsSpentByTier.tier5,
      vault3:          result.vaultPurchasesByTier.tier3,
      vault4:          result.vaultPurchasesByTier.tier4,
      vault5:          result.vaultPurchasesByTier.tier5,
      starsLeft:       result.finalStars,
      annotation:      PRESET_ANNOTATIONS[preset],
      isUserRow:       useUserResult,
    });
  });

  if (isCustom) {
    rows.push({
      label:       'Your Config',
      uniqueCount:  userResult.finalUniqueCount,
      starsSpent:   userResult.starsSpentByTier.tier3 + userResult.starsSpentByTier.tier4 + userResult.starsSpentByTier.tier5,
      vault3:       userResult.vaultPurchasesByTier.tier3,
      vault4:       userResult.vaultPurchasesByTier.tier4,
      vault5:       userResult.vaultPurchasesByTier.tier5,
      starsLeft:    userResult.finalStars,
      annotation:   PRESET_ANNOTATIONS['Your Config'],
      isUserRow:    true,
    });
  }

  // Find best unique count
  const bestUnique = Math.max(...rows.map(r => r.uniqueCount));

  rows.forEach(row => {
    const isBest  = row.uniqueCount === bestUnique;
    const color   = presetColorVar(row.label === 'Your Config' ? 'Custom' : row.label);
    const tr      = el('tr', { className: isBest ? 'row-best' : '' });

    if (isBest) {
      tr.style.background     = 'rgba(125, 170, 114, 0.15)';
      tr.style.fontWeight     = '700';
    }
    if (row.isUserRow) {
      tr.style.borderLeft     = `3px solid ${resolveColor(color)}`;
    }

    // Inline bar cell
    const barPct = (row.uniqueCount / 108 * 100).toFixed(1);
    const barCell = el('td', { className: 'comparison-bar-cell' });
    const barTrack = el('div', { className: 'comparison-bar-track' });
    const barFill  = el('div', { className: 'comparison-bar-fill',
      style: { width: barPct + '%', background: resolveColor(color) } });
    barTrack.appendChild(barFill);

    const labelSpan = el('span', { className: 'comparison-label',
      style: { color: resolveColor(color) } }, row.label);

    barCell.appendChild(labelSpan);
    barCell.appendChild(barTrack);

    tr.append(
      barCell,
      el('td', { className: 'num-cell' },
        `${row.uniqueCount} / 108` + (isBest ? ' ✓' : '')),
      el('td', { className: 'num-cell' }, `${fmt(row.starsSpent)}★`),
      el('td', { className: 'num-cell' }, String(row.vault3)),
      el('td', { className: 'num-cell' }, String(row.vault4)),
      el('td', { className: 'num-cell' }, String(row.vault5)),
      el('td', { className: 'num-cell' }, `${fmt(row.starsLeft)}★`),
    );

    tbody.appendChild(tr);

    // Annotation row
    const annotationTr = el('tr', { className: 'annotation-row' });
    const annotationTd = el('td', { colSpan: '7', className: 'annotation-cell' },
      el('em', {}, row.annotation));
    annotationTr.appendChild(annotationTd);
    tbody.appendChild(annotationTr);
  });
}

// ════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ════════════════════════════════════════════════════════════════════════════

function sumObj(obj) {
  return Object.values(obj).reduce((s, v) => s + v, 0);
}

/**
 * Resolve a CSS variable string like 'var(--color-green)' to a computed hex/rgb value,
 * or return the value unchanged if it is already a literal colour.
 */
function getCSSVar(varStr) {
  const m = varStr.match(/var\((--[^)]+)\)/);
  if (!m) return varStr;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || varStr;
}

/**
 * Return a plain colour value (for inline `style` attributes where CSS vars work
 * in all modern browsers, but we need a fallback for SVG fill attributes
 * which don't support `var()` in older engines).
 */
function resolveColor(colorStr) {
  if (!colorStr.startsWith('var(')) return colorStr;
  const resolved = getCSSVar(colorStr);
  // Colour map fallback if CSS isn't loaded yet
  const fallbacks = {
    '--color-green':  '#7DAA72',
    '--color-gold':   '#F5C842',
    '--color-sky':    '#5B9BD5',
    '--color-brown':  '#6B4423',
    '--color-red':    '#C0392B',
    '--color-cream':  '#FDF6E3',
    '--color-purple': '#8E6BBF',
    '--color-orange': '#E67E22',
  };
  const key = colorStr.match(/var\((--[^)]+)\)/)?.[1];
  return resolved || (key ? fallbacks[key] : colorStr) || colorStr;
}