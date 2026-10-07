// Computes basic-strategy expected values (EV) for every chart cell by exact
// recursive calculation over a finite shoe (card removal of the player's two
// cards and the dealer's up card is taken into account).
//
// Output: js/strategy-data.js — per (decks, dealer-hits-soft-17) combination,
// the EV of Stand / Hit / Double / Split for each hand vs each dealer up card.
// The browser derives the actual chart for the selected house rules from these
// EVs (see js/strategy.js), so every rule combination is covered.
//
// Run: node tools/generate-strategy.mjs
import { writeFileSync } from 'node:fs';

const VAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // rank index -> value (0 = Ace, 9 = ten-value)
const DECKS = { 1: 1, 2: 2, 3: 3, 4: 6 }; // "4+" is computed with a 6-deck shoe

function fullShoe(decks) {
  const c = Array(10).fill(4 * decks);
  c[9] = 16 * decks;
  return c;
}

// Dealer final-total distribution [17,18,19,20,21,bust], conditioned on the
// dealer NOT having blackjack (the player only makes decisions in that case
// under US peek rules; for no-peek games the BJ case is accounted separately).
function makeDealer(h17) {
  const memo = new Map();
  function dealerDist(counts, up) {
    const key = counts.join(',');
    let r = memo.get(key);
    if (r) return r;
    r = [0, 0, 0, 0, 0, 0];
    const exclude = up === 0 ? 9 : up === 9 ? 0 : -1;
    let n = 0;
    for (let i = 0; i < 10; i++) if (i !== exclude) n += counts[i];
    for (let i = 0; i < 10; i++) {
      if (i === exclude || counts[i] === 0) continue;
      const p = counts[i] / n;
      counts[i]--;
      draw(counts, VAL[up] + VAL[i], up === 0 || i === 0, p, r);
      counts[i]++;
    }
    memo.set(key, r);
    return r;
  }
  function draw(counts, hard, ace, prob, out) {
    const soft = ace && hard + 10 <= 21;
    const tot = soft ? hard + 10 : hard;
    if (tot > 21) { out[5] += prob; return; }
    if (tot >= 17 && !(h17 && soft && tot === 17)) { out[tot - 17] += prob; return; }
    let n = 0;
    for (let i = 0; i < 10; i++) n += counts[i];
    for (let i = 0; i < 10; i++) {
      if (counts[i] === 0) continue;
      const p = counts[i] / n;
      counts[i]--;
      draw(counts, hard + VAL[i], ace || i === 0, prob * p, out);
      counts[i]++;
    }
  }
  return dealerDist;
}

function computeCombo(decks, h17) {
  const out = {};
  for (let up = 0; up < 10; up++) {
    const dealerDist = makeDealer(h17);
    const shoe = fullShoe(DECKS[decks]);
    shoe[up]--;

    const best = (hard, ace) => (ace && hard + 10 <= 21 ? hard + 10 : hard);
    function stand(counts, total) {
      const d = dealerDist(counts, up);
      let ev = d[5];
      for (let t = 17; t <= 21; t++) {
        if (t < total) ev += d[t - 17];
        else if (t > total) ev -= d[t - 17];
      }
      return ev;
    }
    const hitMemo = new Map();
    // EV of hitting now and then playing optimally (hit/stand only).
    function hit(counts, hard, ace) {
      // Key includes the hand: after a split the same shoe can hold different hands.
      const key = counts.join(',') + '|' + hard + (ace ? 'a' : '');
      let ev = hitMemo.get(key);
      if (ev !== undefined) return ev;
      ev = 0;
      let n = 0;
      for (let i = 0; i < 10; i++) n += counts[i];
      for (let i = 0; i < 10; i++) {
        if (!counts[i]) continue;
        const p = counts[i] / n;
        const h = hard + VAL[i];
        const a = ace || i === 0;
        if (h > 21) { ev -= p; continue; }
        counts[i]--;
        const s = stand(counts, best(h, a));
        const tot = best(h, a);
        ev += p * (tot >= 21 ? s : Math.max(s, hit(counts, h, a)));
        counts[i]++;
      }
      hitMemo.set(key, ev);
      return ev;
    }
    function dbl(counts, hard, ace) {
      let ev = 0, n = 0;
      for (let i = 0; i < 10; i++) n += counts[i];
      for (let i = 0; i < 10; i++) {
        if (!counts[i]) continue;
        const p = counts[i] / n;
        const h = hard + VAL[i];
        if (h > 21) { ev -= 2 * p; continue; }
        counts[i]--;
        ev += 2 * p * stand(counts, best(h, ace || i === 0));
        counts[i]++;
      }
      return ev;
    }
    const canDbl = (rule, hard, ace) => {
      if (rule === 'a') return true;
      if (ace && hard + 10 <= 21) return false; // restricted doubling: hard totals only
      return rule === '9' ? hard >= 9 && hard <= 11 : hard === 10 || hard === 11;
    };
    // Split EV (two hands, no resplit). Variants: n = no double after split,
    // a/9/t = DAS with doubling on any / 9-11 / 10-11.
    function split(counts, r) {
      const res = {};
      for (const v of ['n', 'a', '9', 't']) {
        let ev = 0, n = 0;
        for (let i = 0; i < 10; i++) n += counts[i];
        for (let i = 0; i < 10; i++) {
          if (!counts[i]) continue;
          const p = counts[i] / n;
          const h = VAL[r] + VAL[i];
          const a = r === 0 || i === 0;
          counts[i]--;
          const tot = best(h, a);
          let e = stand(counts, tot);
          if (r !== 0) { // split aces receive one card only
            if (tot < 21) e = Math.max(e, hit(counts, h, a));
            if (v !== 'n' && canDbl(v, h, a)) e = Math.max(e, dbl(counts, h, a));
          }
          ev += p * e;
          counts[i]++;
        }
        res[v] = 2 * ev;
      }
      return res;
    }

    // Aggregate compositions into chart cells.
    const cells = {};
    const add = (key, a, b, isPair) => {
      const c = shoe.slice();
      const w = a === b ? c[a] * (c[a] - 1) : 2 * c[a] * c[b];
      if (w <= 0) return;
      c[a]--; c[b]--;
      const n = c.reduce((x, y) => x + y, 0);
      const pbj = up === 0 ? c[9] / n : up === 9 ? c[0] / n : 0;
      const hard = VAL[a] + VAL[b];
      const ace = a === 0 || b === 0;
      const ev = { S: stand(c, best(hard, ace)), H: hit(c, hard, ace), D: dbl(c, hard, ace) };
      if (isPair) Object.assign(ev, Object.fromEntries(Object.entries(split(c, a)).map(([k, v]) => ['P' + k, v])));
      const cell = (cells[key] ||= { W: 0, P: 0, E: {} });
      cell.W += w;
      cell.P += w * pbj;
      for (const [k, v] of Object.entries(ev)) cell.E[k] = (cell.E[k] || 0) + w * (1 - pbj) * v;
    };
    // Hard totals 5..20 (non-pair two-card hands; hard 20 only exists as T,T).
    for (let a = 1; a < 10; a++) for (let b = a; b < 10; b++) {
      const t = VAL[a] + VAL[b];
      if (a !== b || t === 20) add('h' + t, a, b, false);
    }
    for (let b = 1; b < 9; b++) add('s' + (11 + VAL[b]), 0, b, false); // A,2..A,9 = soft 13..20
    for (let a = 0; a < 10; a++) add('p' + VAL[a], a, a, true);

    for (const [key, cell] of Object.entries(cells)) {
      const row = (out[key] ||= Array(10));
      const E = {};
      for (const [k, v] of Object.entries(cell.E)) E[k] = +(v / cell.W).toFixed(6);
      row[up] = { P: +(cell.P / cell.W).toFixed(6), ...E };
    }
  }
  return out;
}

const data = {};
const t0 = Date.now();
for (const d of [1, 2, 3, 4]) for (const h17 of [false, true]) {
  const k = `${d}${h17 ? 'H' : 'S'}`;
  data[k] = computeCombo(d, h17);
  console.log(k, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
// Compact encoding: each cell -> [P, S, H, D, (Pn, Pa, P9, Pt)]
const enc = {};
for (const [k, rows] of Object.entries(data)) {
  enc[k] = {};
  for (const [r, cells] of Object.entries(rows)) {
    enc[k][r] = cells.map((c) => [c.P, c.S, c.H, c.D, ...(c.Pn !== undefined ? [c.Pn, c.Pa, c.P9, c.Pt] : [])]);
  }
}
writeFileSync(new URL('../js/strategy-data.js', import.meta.url),
  '// GENERATED by tools/generate-strategy.mjs — do not edit by hand.\n' +
  '// Keys: <decks 1|2|3|4(=4+, computed with 6 decks)><S|H = dealer stands/hits soft 17>\n' +
  '// Rows: h5..h20 hard totals, s13..s20 soft totals (A,2..A,9), p1..p10 pairs (p1 = A,A).\n' +
  '// Cells indexed by dealer up card [A,2,3,4,5,6,7,8,9,10]:\n' +
  '//   [P(dealer blackjack), EV stand, EV hit, EV double, (split EVs: no-DAS, DAS any, DAS 9-11, DAS 10-11)]\n' +
  '//   EVs are per unit bet, conditioned on dealer not having blackjack and pre-multiplied by (1 - P).\n' +
  'export default ' + JSON.stringify(enc) + ';\n');
console.log('done');
