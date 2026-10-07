// Text for the Hint ("Strategic Analysis") screen.
import { ACTION_NAME, upLabel, cellEVs } from './strategy.js';

// Dealer final-total probabilities for an up card (infinite deck),
// conditioned on no dealer blackjack. Returns {17..21, bust}.
const cache = new Map();
export function dealerOutcomes(up, h17) {
  const key = up + (h17 ? 'H' : 'S');
  if (cache.has(key)) return cache.get(key);
  const p = (i) => (i === 9 ? 4 / 13 : 1 / 13);
  const out = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
  const val = (i) => (i === 0 ? 1 : i + 1);
  function go(hard, ace, prob, first) {
    const soft = ace && hard + 10 <= 21;
    const t = soft ? hard + 10 : hard;
    if (t > 21) { out.bust += prob; return; }
    if (t >= 17 && !(h17 && soft && t === 17)) { out[t] += prob; return; }
    const excl = first ? (up === 0 ? 9 : up === 9 ? 0 : -1) : -1;
    const norm = excl < 0 ? 1 : 1 - p(excl);
    for (let i = 0; i < 10; i++) if (i !== excl) go(hard + val(i), ace || i === 0, (prob * p(i)) / norm, false);
  }
  go(val(up), up === 0, 1, true);
  cache.set(key, out);
  return out;
}

const pct = (x) => (x * 100).toFixed(1) + '%';

export function handName(s) {
  if (s.row[0] === 'p') {
    const v = +s.row.slice(1);
    return `a Pair of ${v === 1 ? 'Aces' : v === 10 ? 'Tens' : v + "'s"}`;
  }
  return `a ${s.soft ? 'Soft' : 'Hard'} ${s.total}`;
}

export function situationLabel(row, up) {
  const n = +row.slice(1);
  const vs = ' v ' + upLabel(up);
  if (row[0] === 'p') return (n === 1 ? 'A,A' : n === 10 ? '10,10' : `${n},${n}`) + vs;
  if (row[0] === 's') return `Soft ${n} (A,${n - 11})` + vs;
  return `Hard ${n}` + vs;
}

function blurb(s) {
  const t = s.total, v = +s.row.slice(1);
  if (s.row[0] === 'p') {
    if (v === 1) return 'Always split Aces. Two hands each starting with an 11 are far stronger than one soft 12.';
    if (v === 8) return '16 is the worst hand in blackjack. Splitting turns it into two hands that each start with 8, which is much better.';
    if (v === 10) return 'A 20 is a winning hand. Splitting it gives up a near-certain win for two weaker hands — never do it.';
    if (v === 5) return 'Treat a pair of 5s as a hard 10, a great doubling hand. Splitting would leave two weak hands starting with 5.';
    return 'Whether to split depends on the dealer card: split when the dealer shows a weak card (more likely to bust), so you have more money on the table when you are the favourite.';
  }
  if (s.soft) {
    if (t <= 17) return 'This is not a strong hand, and you will always want to take a card: you cannot bust with one card. Depending on the dealer, either hit or double.';
    if (t === 18) return "This can be a tricky hand. It's soft so you can't bust if you take a card, but sometimes the best play is to stand, sometimes to hit, and sometimes to double.";
    return 'A strong hand. Stand, except in a few cases where doubling against a weak dealer card earns more.';
  }
  if (t <= 8) return 'A low total: you cannot bust by taking a card, so always hit.';
  if (t <= 11) return 'A doubling total. One more card often makes a strong hand, so double against weaker dealer cards.';
  if (t <= 16) {
    const pBust = (t - 8) / 13; // cards 22-t..10 bust you; ten-values count 4 of 13
    return `A "stiff" hand: one more card busts you ${pct(pBust)} of the time, but standing only wins if the dealer busts. Stand against weak dealer cards, hit against strong ones.`;
  }
  return 'A strong total. Stand (in some games surrendering 17 against an Ace is slightly better).';
}

export function analysis(s, rules) {
  const can = Object.entries(s.can).filter(([, v]) => v).map(([k]) => ACTION_NAME[k]);
  const list = can.length > 1 ? can.slice(0, -1).join(', ') + ' or ' + can[can.length - 1] : can[0];
  const d = dealerOutcomes(s.up, rules.h17);
  const evs = cellEVs(s.row, s.up, rules);
  const rows = evs
    ? Object.entries(evs.ev)
        .filter(([k]) => s.can[k])
        .map(([k, v]) => ({ action: ACTION_NAME[k], key: k, ev: v }))
        .sort((a, b) => b.ev - a.ev)
    : [];
  return {
    title: `Player has ${handName(s)}`,
    blurb: blurb(s),
    dealer: `Dealer shows ${upLabel(s.up) === 'A' ? 'an Ace' : 'a ' + upLabel(s.up)}: the dealer busts ${pct(d.bust)} of the time${s.up === 0 || s.up === 9 ? ' (given no blackjack)' : ''}.`,
    can: `Player can ${list}.`,
    answer: `${ACTION_NAME[s.book]} against Dealer's ${upLabel(s.up)}`,
    evRows: rows,
    evNote: evs?.conditioned ? 'Expected return per $1 bet, after the dealer has checked for blackjack.' : 'Expected return per $1 bet.',
    multiCard: s.cards.length > 2,
  };
}
