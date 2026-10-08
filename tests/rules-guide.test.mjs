// Every rule of thumb in the Basic Rules guide must agree with the exact engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChart, DEFAULT_RULES } from '../js/strategy.js';
import { GUIDE_ASSUMES } from '../js/rules-guide.js';

const base = { ...DEFAULT_RULES, ...GUIDE_ASSUMES };
const S17 = buildChart(base);
const H17 = buildChart({ ...base, h17: true });
const NOSUR = buildChart({ ...base, surrender: 'never' });
const U = { A: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9 };
const ALL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
const span = (a, b) => ALL.slice(ALL.indexOf(a), ALL.indexOf(b) + 1);
const expect = (chart, row, ups, codes) => {
  for (const u of ups) assert.ok(codes.includes(chart[row][U[u]]), `${row} v ${u}: got ${chart[row][U[u]]}, guide says ${codes}`);
};

test('hard hands', () => {
  for (const r of ['h17', 'h18', 'h19', 'h20']) expect(S17, r, ALL, ['S']);
  for (const r of ['h13', 'h14', 'h15', 'h16']) { expect(S17, r, span('2', '6'), ['S']); expect(NOSUR, r, span('7', 'A'), ['H']); }
  expect(S17, 'h12', ['4', '5', '6'], ['S']);
  expect(S17, 'h12', ['2', '3', '7', '8', '9', '10', 'A'], ['H']);
  expect(S17, 'h11', span('2', '10'), ['D']); expect(S17, 'h11', ['A'], ['H']);
  expect(S17, 'h10', span('2', '9'), ['D']); expect(S17, 'h10', ['10', 'A'], ['H']);
  expect(S17, 'h9', span('3', '6'), ['D']); expect(S17, 'h9', ['2', ...span('7', 'A')], ['H']);
  for (const r of ['h5', 'h6', 'h7', 'h8']) expect(S17, r, ALL, ['H']);
});

test('soft hands', () => {
  for (const r of ['s19', 's20']) expect(S17, r, ALL, ['S']);
  expect(S17, 's18', ['2', '7', '8'], ['S']); expect(S17, 's18', span('3', '6'), ['Ds']); expect(S17, 's18', ['9', '10', 'A'], ['H']);
  expect(S17, 's17', span('3', '6'), ['D']); expect(S17, 's17', ['2', ...span('7', 'A')], ['H']);
  for (const r of ['s15', 's16']) { expect(S17, r, span('4', '6'), ['D']); expect(S17, r, ['2', '3', ...span('7', 'A')], ['H']); }
  for (const r of ['s13', 's14']) { expect(S17, r, ['5', '6'], ['D']); expect(S17, r, [...span('2', '4'), ...span('7', 'A')], ['H']); }
});

test('pairs and surrender', () => {
  expect(S17, 'p1', ALL, ['P']); expect(S17, 'p8', ALL, ['P']); expect(S17, 'p10', ALL, ['S']); expect(S17, 'p5', span('2', '9'), ['D']);
  expect(S17, 'p9', [...span('2', '6'), '8', '9'], ['P']); expect(S17, 'p9', ['7', '10', 'A'], ['S']);
  expect(S17, 'p7', span('2', '7'), ['P']); expect(S17, 'p6', span('2', '6'), ['P']);
  for (const r of ['p2', 'p3']) expect(S17, r, span('2', '7'), ['P']);
  expect(S17, 'p4', ['5', '6'], ['P']); expect(S17, 'p4', ['2', '3', '4', ...span('7', 'A')], ['H']);
  expect(S17, 'h16', ['9', '10', 'A'], ['R']); expect(S17, 'h15', ['10'], ['R']);
});

test('H17 changes', () => {
  expect(H17, 's19', ['6'], ['Ds']); expect(H17, 's18', ['2'], ['Ds']); expect(H17, 'h11', ['A'], ['D']);
  expect(H17, 'h17', ['A'], ['Rs']); expect(H17, 'h15', ['A'], ['R']); expect(H17, 'p8', ['A'], ['Rp']);
});
