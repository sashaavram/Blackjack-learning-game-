// Statistical checks that dealing is fair: nothing depends on the player's
// choices, and the practice modes don't skew the dealer's cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { DEFAULT_RULES, buildChart } from '../js/strategy.js';
import { pickSituation } from '../js/drill.js';

// Small seeded PRNG so the tests are repeatable.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const chart = buildChart(DEFAULT_RULES);

function play(mode, skill, n, seed) {
  const rnd = mulberry32(seed);
  const g = new Game(DEFAULT_RULES, { bankroll: 1e12, rnd });
  const up = Array(10).fill(0), hole = Array(10).fill(0);
  for (let i = 0; i < n; i++) {
    const s = pickSituation({ mode, skill, chart, custom: null, mistakes: {} }, rnd);
    g.start(1, s || undefined);
    up[g.up.r]++;
    hole[g.dealer[1].r]++;
    if (g.phase === 'insurance') g.takeInsurance(false);
    while (g.phase === 'player') g.act(g.situation().book);
    while (g.dealerStep());
  }
  return { up, hole };
}
const chi2 = (obs, p) => { const n = obs.reduce((a, b) => a + b); return obs.reduce((a, o, i) => a + (o - n * p[i]) ** 2 / (n * p[i]), 0); };
const NATURAL = Array.from({ length: 10 }, (_, i) => (i === 9 ? 4 / 13 : 1 / 13));
const CUTOFF_99 = 21.67; // chi-square, 9 degrees of freedom, 99th percentile

test('normal deal: dealer up and hole cards follow natural frequencies', () => {
  const { up, hole } = play('all', 'normal', 30000, 1);
  assert.ok(chi2(up, NATURAL) < CUTOFF_99, 'up card');
  assert.ok(chi2(hole, NATURAL) < CUTOFF_99, 'hole card');
});

test('practice modes do not drain the shoe or skew the hole card', () => {
  for (const [mode, skill, seed] of [['soft', 'normal', 2], ['pairs', 'normal', 3], ['all', 'adv', 4]]) {
    const { up, hole } = play(mode, skill, 20000, seed);
    assert.ok(chi2(up, NATURAL) < CUTOFF_99, `${mode}/${skill} up card`);
    // The hole card is close to natural (the player's two cards are removed
    // from a 312-card shoe, which shifts each rank by well under 1 point).
    const n = hole.reduce((a, b) => a + b);
    for (let r = 0; r < 10; r++) assert.ok(Math.abs(hole[r] / n - NATURAL[r]) < 0.012, `${mode}/${skill} hole rank ${r}: ${(hole[r] / n * 100).toFixed(2)}%`);
  }
});
