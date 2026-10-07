// Chooses which hand to deal in the practice modes / skill levels.
import { HARD_ROWS, SOFT_ROWS, PAIR_ROWS, UPS } from './strategy.js';

const VAL = (i) => (i === 0 ? 1 : i + 1); // rank index -> value
const UP_WEIGHT = (u) => (u === 9 ? 4 : 1); // ten-value cards are 4x as common
const SKILL_POWER = { normal: 0, beg: 1, med: 2, adv: 3 };

export const PLAY_ROWS = {
  all: [...HARD_ROWS.filter((r) => r !== 'h21' && r !== 'h4'), ...SOFT_ROWS.filter((r) => r !== 's21'), ...PAIR_ROWS],
  soft: SOFT_ROWS.filter((r) => r !== 's21'),
  pairs: PAIR_ROWS,
};

// Difficulty of a row = number of different plays in it (1..4), as in the
// classic trainer: rows whose answer depends on the dealer card are harder.
export const difficulty = (chart, row) => new Set(chart[row]).size;

function weighted(items, rnd) {
  const total = items.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return null;
  let t = rnd() * total;
  for (const x of items) if ((t -= x.w) <= 0) return x;
  return items[items.length - 1];
}

// Two starting cards (rank indexes) for a chart row.
export function cardsForRow(row, rnd = Math.random) {
  const n = +row.slice(1);
  let pair;
  if (row[0] === 'p') pair = [n === 1 ? 0 : n - 1, n === 1 ? 0 : n - 1];
  else if (row[0] === 's') pair = [0, n - 12];
  else {
    const opts = [];
    for (let a = 1; a < 10; a++) for (let b = a; b < 10; b++) {
      if (VAL(a) + VAL(b) !== n || (a === b && n !== 20)) continue;
      opts.push({ v: [a, b], w: UP_WEIGHT(a) * UP_WEIGHT(b) });
    }
    pair = weighted(opts, rnd).v;
  }
  return rnd() < 0.5 ? pair : [pair[1], pair[0]];
}

// Returns { player: [r, r], up: r, row } or null for a natural random deal.
export function pickSituation({ mode, skill, chart, custom, mistakes }, rnd = Math.random) {
  if (mode === 'all' && skill === 'normal') return null;
  let items = [];
  if (mode === 'drill') {
    for (const [key, s] of Object.entries(mistakes || {})) {
      if (!s.err) continue;
      const [row, up] = key.split('|');
      items.push({ row, up: +up, w: s.err * (s.err / s.n) });
    }
    if (!items.length) return null;
  } else {
    const rows = mode === 'custom' ? custom.rows : PLAY_ROWS[mode] || PLAY_ROWS.all;
    const ups = mode === 'custom' ? custom.ups : UPS;
    const k = SKILL_POWER[skill] || 0;
    for (const row of rows) for (const up of ups) items.push({ row, up, w: UP_WEIGHT(up) * difficulty(chart, row) ** k });
  }
  const pick = weighted(items, rnd);
  if (!pick) return null;
  return { player: cardsForRow(pick.row, rnd), up: pick.up, row: pick.row };
}
