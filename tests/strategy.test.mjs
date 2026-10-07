import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChart, DEFAULT_RULES, resolveCode } from '../js/strategy.js';

// Columns: dealer 2,3,4,5,6,7,8,9,10,A  -> internal up index 1..9,0
const COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
const row = (chart, r) => COLS.map((u) => chart[r][u]).join(' ');

// Reference: the "Basic Strategy" card shown by Blackjack 101 for
// 4+ decks, dealer stands on soft 17, double any, DAS, late surrender, peek
// (transcribed from the user's screen recording).
test('4+ decks S17 DAS LS matches the reference strategy card', () => {
  const c = buildChart(DEFAULT_RULES);
  const expect = {
    h17: 'S S S S S S S S S S',
    h16: 'S S S S S H H R R R',
    h15: 'S S S S S H H H R H',
    h14: 'S S S S S H H H H H',
    h13: 'S S S S S H H H H H',
    h12: 'H H S S S H H H H H',
    h11: 'D D D D D D D D D H',
    h10: 'D D D D D D D D H H',
    h9: 'H D D D D H H H H H',
    h8: 'H H H H H H H H H H',
    h5: 'H H H H H H H H H H',
    s20: 'S S S S S S S S S S',
    s19: 'S S S S S S S S S S',
    s18: 'S Ds Ds Ds Ds S S H H H',
    s17: 'H D D D D H H H H H',
    s16: 'H H D D D H H H H H',
    s15: 'H H D D D H H H H H',
    s14: 'H H H D D H H H H H',
    s13: 'H H H D D H H H H H',
    p1: 'P P P P P P P P P P',
    p10: 'S S S S S S S S S S',
    p9: 'P P P P P S P P S S',
    p8: 'P P P P P P P P P P',
    p7: 'P P P P P P H H H H',
    p6: 'P P P P P H H H H H',
    p5: 'D D D D D D D D H H',
    p4: 'H H H P P H H H H H',
    p3: 'P P P P P P H H H H',
    p2: 'P P P P P P H H H H',
  };
  for (const [r, e] of Object.entries(expect)) assert.equal(row(c, r), e, r);
});

// Reference: Wizard of Odds 4-8 deck strategy — modifications when the dealer
// hits soft 17: double 11 v A, surrender 15 v A, surrender 17 v A, surrender 8,8 v A.
// Also the standard H17 soft-doubling changes: soft 18 v 2 and soft 19 v 6.
test('4+ decks H17 applies the published hit-soft-17 modifications', () => {
  const c = buildChart({ ...DEFAULT_RULES, h17: true });
  assert.equal(c.h11[0], 'D');
  assert.equal(c.h15[0], 'R');
  assert.equal(c.h17[0], 'Rs');
  assert.equal(c.p8[0], 'Rp');
  assert.equal(c.s18[1], 'Ds');
  assert.equal(c.s19[5], 'Ds');
});

test('rules change the chart in the expected direction', () => {
  const noSurr = buildChart({ ...DEFAULT_RULES, surrender: 'never' });
  assert.equal(noSurr.h16[9], 'H');
  const noDas = buildChart({ ...DEFAULT_RULES, das: false });
  assert.equal(noDas.p4[4], 'H'); // 4,4 v 5 only split with DAS
  assert.equal(noDas.p2[1], 'H'); // 2,2 v 2 only split with DAS
  const noDbl = buildChart({ ...DEFAULT_RULES, double: 'never' });
  for (const r of Object.values(noDbl)) for (const code of r) assert.ok(!code.startsWith('D'));
  const tenEleven = buildChart({ ...DEFAULT_RULES, double: '10-11' });
  assert.equal(tenEleven.h9[4], 'H');
  assert.equal(tenEleven.s17[4], 'H');
  assert.equal(tenEleven.s18[4], 'S');
});

test('resolveCode falls back when the primary play is not allowed', () => {
  assert.equal(resolveCode('D', { D: false }), 'H');
  assert.equal(resolveCode('Ds', { D: false }), 'S');
  assert.equal(resolveCode('Rs', { R: false }), 'S');
  assert.equal(resolveCode('Rp', { R: false, P: true }), 'P');
  assert.equal(resolveCode('R', { R: true }), 'R');
});
