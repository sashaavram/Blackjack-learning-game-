import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { DEFAULT_RULES } from '../js/strategy.js';
import { makeShoe, hiLo, handTotal } from '../js/cards.js';

// Build a game whose next cards come out in a fixed order:
// player1, dealer up, player2, dealer hole, then subsequent draws.
function rigged(order, rules = {}) {
  const g = new Game({ ...DEFAULT_RULES, ...rules }, { bankroll: 1000 });
  const faces = order.slice().reverse();
  g.shoe.cards = faces.map((f, i) => ({ f, s: '♠', r: f === 'A' ? 0 : ['10', 'J', 'Q', 'K'].includes(f) ? 9 : +f - 1, id: 1e6 + i }));
  g.shoe.total = g.shoe.cards.length; // avoid an automatic reshuffle
  g.shoe.penetration = 1;
  return g;
}
const play = (g) => { while (g.dealerStep()); return g; };

test('blackjack pays 3:2', () => {
  const g = rigged(['A', '9', 'K', '7']).start(10);
  assert.equal(g.phase, 'done');
  assert.equal(g.hands[0].result, 'blackjack');
  assert.equal(g.bankroll, 1015);
});

test('6:5 blackjack option', () => {
  const g = rigged(['A', '9', 'K', '7'], { bjPays: 1.2 }).start(10);
  assert.equal(g.bankroll, 1012);
});

test('stand 20 vs dealer 17 wins even money', () => {
  const g = rigged(['10', '10', 'Q', '7']).start(15);
  g.act('S');
  play(g);
  assert.equal(g.hands[0].result, 'win');
  assert.equal(g.bankroll, 1015);
});

test('dealer plays out hand and busts', () => {
  const g = rigged(['10', '6', '7', '10', '9']).start(25); // player 17, dealer 16 -> draws 9
  g.act('S');
  play(g);
  assert.equal(handTotal(g.dealer).total, 25);
  assert.equal(g.hands[0].result, 'win');
  assert.equal(g.bankroll, 1025);
});

test('double down doubles the bet and takes one card', () => {
  const g = rigged(['6', '6', '5', '10', '10', '10']).start(10); // 11 v 6, draws 10; dealer 16 draws 10
  g.act('D');
  assert.equal(g.hands[0].cards.length, 3);
  play(g);
  assert.equal(g.hands[0].result, 'win');
  assert.equal(g.bankroll, 1020);
});

test('split plays both hands and settles each', () => {
  // player 8,8 v 6; split -> 8+3 (=11), 8+10 (=18); first hand doubles (DAS) draws 10 -> 21; dealer 6+10 draws 10 -> bust
  const g = rigged(['8', '6', '8', '10', '3', '10', '10', '10']).start(10);
  g.act('P');
  assert.equal(g.hands.length, 2);
  assert.equal(handTotal(g.hands[0].cards).total, 11);
  g.act('D');
  g.act('S');
  play(g);
  assert.deepEqual(g.hands.map((h) => h.result), ['win', 'win']);
  assert.equal(g.bankroll, 1030);
});

test('split aces get one card each and 21 is not blackjack', () => {
  const g = rigged(['A', '9', 'A', '10', 'K', '5', '8']).start(10);
  g.act('P');
  assert.ok(g.hands.every((h) => h.done && h.splitAces));
  play(g); // dealer 19
  assert.deepEqual(g.hands.map((h) => h.result), ['win', 'lose']);
  assert.equal(g.bankroll, 1000);
});

test('late surrender returns half the bet', () => {
  const g = rigged(['10', '10', '6', '7']).start(20);
  g.act('R');
  assert.equal(g.phase, 'done');
  assert.equal(g.bankroll, 990);
});

test('dealer peek: blackjack ends the hand, losing only the original bet', () => {
  const g = rigged(['10', 'K', '6', 'A']).start(10);
  assert.equal(g.phase, 'done');
  assert.equal(g.bankroll, 990);
});

test('insurance pays 2:1 when the dealer has blackjack', () => {
  const g = rigged(['10', 'A', '6', 'K']).start(10);
  assert.equal(g.phase, 'insurance');
  g.takeInsurance(true);
  assert.equal(g.phase, 'done');
  assert.equal(g.bankroll, 1000); // -10 hand, +10 insurance
});

test('no-peek (European): doubled bet is lost to a dealer blackjack', () => {
  const g = rigged(['6', '10', '5', 'A', '9'], { peek: false }).start(10);
  assert.equal(g.phase, 'player');
  g.act('D');
  play(g);
  assert.equal(g.hands[0].result, 'lose');
  assert.equal(g.bankroll, 980);
});

test('early surrender is honoured even against a dealer blackjack', () => {
  const g = rigged(['10', '10', '6', 'A'], { surrender: 'early' }).start(10);
  g.act('R');
  assert.equal(g.bankroll, 995);
});

test('situation reports book play for the active hand', () => {
  const g = rigged(['10', '10', '6', '7']).start(10); // hard 16 v 10, late surrender allowed
  const s = g.situation();
  assert.equal(s.row, 'h16');
  assert.equal(s.book, 'R');
  g.act('H'); // not book, but legal
});

test('Hi-Lo count of a full shoe is zero', () => {
  for (const d of [1, 2, 6]) assert.equal(makeShoe(d).reduce((a, c) => a + hiLo(c), 0), 0);
  assert.equal(makeShoe(6).length, 312);
});
