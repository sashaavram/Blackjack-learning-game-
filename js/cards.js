// Cards, shoe and hand arithmetic.
export const SUITS = ['♠', '♥', '♦', '♣'];
export const FACES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Rank index used by the strategy engine: 0 = Ace, 1..8 = 2..9, 9 = any ten-value card.
export const rankIndex = (face) => {
  const i = FACES.indexOf(face);
  return i >= 9 ? 9 : i;
};
export const cardValue = (card) => (card.r === 0 ? 1 : card.r + 1);
export const isRed = (card) => card.s === '♥' || card.s === '♦';
// Hi-Lo tag: 2-6 = +1, 7-9 = 0, 10/A = -1.
export const hiLo = (card) => (card.r >= 1 && card.r <= 5 ? 1 : card.r >= 6 && card.r <= 8 ? 0 : -1);

export function handTotal(cards) {
  let hard = 0, ace = false;
  for (const c of cards) {
    hard += cardValue(c);
    if (c.r === 0) ace = true;
  }
  const soft = ace && hard + 10 <= 21;
  return { total: soft ? hard + 10 : hard, hard, soft };
}
export const isBlackjack = (cards) => cards.length === 2 && handTotal(cards).total === 21;

let uid = 0;
export function makeShoe(decks) {
  const cards = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const f of FACES) cards.push({ f, s, r: rankIndex(f), id: ++uid });
  return cards;
}

export function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Shoe {
  constructor(decks, penetration = 0.75, rnd = Math.random) {
    this.decks = decks;
    this.penetration = penetration;
    this.rnd = rnd;
    this.shuffle();
  }
  shuffle() {
    this.cards = shuffle(makeShoe(this.decks), this.rnd);
    this.total = this.cards.length;
    this.runningCount = 0;
    this.justShuffled = true;
  }
  get remaining() { return this.cards.length; }
  get decksRemaining() { return this.cards.length / 52; }
  get needsShuffle() { return this.cards.length < this.total * (1 - this.penetration); }
  get trueCount() { return this.runningCount / Math.max(this.decksRemaining, 0.5); }
  draw() {
    if (!this.cards.length) this.shuffle();
    return this.cards.pop();
  }
  // Remove a specific rank from the shoe (used to set up practice situations).
  take(r) {
    let i = this.cards.length - 1;
    while (i >= 0 && this.cards[i].r !== r) i--;
    if (i < 0) return null;
    return this.cards.splice(i, 1)[0];
  }
  see(card) { this.runningCount += hiLo(card); }
}
