// Derives the basic-strategy chart for any set of house rules from the
// precomputed expected values in strategy-data.js.
import DATA from './strategy-data.js';

// Chart codes (same legend as the classic strategy card):
// H hit, S stand, D double else hit, Ds double else stand, P split,
// R surrender else hit, Rs surrender else stand, Rp surrender else split.
export const LEGEND = [
  ['H', 'Hit'], ['S', 'Stand'], ['D', 'Double, or hit'], ['Ds', 'Double, or stand'],
  ['P', 'Split'], ['R', 'Surrender, or hit'], ['Rs', 'Surrender, or stand'], ['Rp', 'Surrender, or split'],
];
export const ACTION_NAME = { H: 'Hit', S: 'Stand', D: 'Double Down', P: 'Split', R: 'Surrender' };

// Dealer up-card index: 0 = Ace, 1..8 = 2..9, 9 = ten-value.
export const UPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
export const upLabel = (u) => (u === 0 ? 'A' : String(u + 1));

export const DEFAULT_RULES = {
  decks: 4, h17: false, double: 'any', das: true, surrender: 'late', peek: true, bjPays: 1.5,
};

const DBL_KEY = { any: 'a', '9-11': '9', '10-11': 't' };

function canDoubleTotal(rules, hard, soft) {
  if (rules.double === 'never') return false;
  if (rules.double === 'any') return true;
  if (soft) return false;
  return rules.double === '9-11' ? hard >= 9 && hard <= 11 : hard === 10 || hard === 11;
}

// Row metadata: key -> { hard total, soft flag, pair flag }
function rowInfo(row) {
  const t = row[0], n = +row.slice(1);
  if (t === 'h') return { hard: n, soft: false, pair: false };
  if (t === 's') return { hard: n - 10, soft: true, pair: false };
  return { hard: n === 1 ? 2 : 2 * n, soft: n === 1, pair: true, rank: n };
}

// EVs (per unit bet, unconditional on dealer blackjack) of every available
// action for a chart cell under the given rules.
export function cellEVs(row, up, rules) {
  const combo = DATA[`${rules.decks}${rules.h17 ? 'H' : 'S'}`];
  const c = combo[row]?.[up];
  if (!c) return null;
  const [P, S, H, D, ...split] = c;
  const info = rowInfo(row);
  // Under no-peek (European) rules, doubled/split bets are lost to a dealer blackjack too.
  const loss = (mult) => -P * (rules.peek ? 1 : mult);
  const ev = { S: loss(1) + S, H: loss(1) + H };
  if (canDoubleTotal(rules, info.hard, info.soft)) ev.D = loss(2) + D;
  if (info.pair) {
    const k = !rules.das || rules.double === 'never' ? 0 : 1 + ['a', '9', 't'].indexOf(DBL_KEY[rules.double]);
    ev.P = loss(2) + split[k];
  }
  if (rules.surrender === 'early') ev.R = -0.5;
  else if (rules.surrender === 'late') ev.R = -P - 0.5 * (1 - P);
  // Under peek rules the player decides after the dealer has checked for
  // blackjack, so report EVs conditioned on "no dealer blackjack".
  const conditioned = rules.peek && P > 0 && rules.surrender !== 'early';
  if (conditioned) for (const k in ev) ev[k] = (ev[k] + P) / (1 - P);
  return { ev, pBJ: P, conditioned };
}

const best = (ev, keys) => keys.filter((k) => k in ev).reduce((a, b) => (ev[b] > ev[a] ? b : a));

export function chartCode(row, up, rules) {
  if (row === 'h21' || row === 's21') return 'S';
  if (row === 'h4') return 'H';
  const r = cellEVs(row, up, rules);
  const ev = r.ev;
  const top = best(ev, ['S', 'H', 'D', 'P', 'R']);
  if (top === 'D') return best(ev, ['H', 'S']) === 'S' ? 'Ds' : 'D';
  if (top === 'R') {
    const f = best(ev, ['H', 'S', 'P']);
    return f === 'H' ? 'R' : 'R' + f.toLowerCase();
  }
  return top;
}

export const HARD_ROWS = Array.from({ length: 17 }, (_, i) => 'h' + (21 - i)); // h21..h5
export const SOFT_ROWS = Array.from({ length: 9 }, (_, i) => 's' + (21 - i)); // s21 (A,10)..s13 (A,2)
export const PAIR_ROWS = ['p1', 'p10', 'p9', 'p8', 'p7', 'p6', 'p5', 'p4', 'p3', 'p2'];

export function rowLabel(row) {
  const n = +row.slice(1);
  if (row[0] === 'h') return String(n);
  if (row[0] === 's') return 'A/' + (n - 11);
  return (n === 1 ? 'A' : n) + "'s";
}

export function buildChart(rules) {
  const chart = {};
  for (const row of [...HARD_ROWS, ...SOFT_ROWS, ...PAIR_ROWS]) chart[row] = UPS.map((u) => chartCode(row, u, rules));
  return chart;
}

// Resolve a chart code to the concrete best play given what is allowed now.
export function resolveCode(code, can) {
  const first = code[0];
  if (first === 'D') return can.D ? 'D' : code === 'Ds' ? 'S' : 'H';
  if (first === 'R') {
    if (can.R) return 'R';
    const f = code[1] ? code[1].toUpperCase() : 'H';
    return f === 'P' && !can.P ? null : f;
  }
  if (first === 'P') return can.P ? 'P' : null;
  return first;
}
