// Blackjack round state machine: betting, insurance, peek, player actions,
// dealer play and settlement. Pure logic (no DOM) so it can be unit tested.
import { Shoe, handTotal, isBlackjack, cardValue } from './cards.js';
import { chartCode, resolveCode, cellEVs } from './strategy.js';

export const MAX_HANDS = 4;
export const SHOE_DECKS = { 1: 1, 2: 2, 3: 3, 4: 6 }; // "4+" plays a 6-deck shoe

export class Game {
  constructor(rules, { bankroll = 1000, rnd = Math.random } = {}) {
    this.rnd = rnd;
    this.bankroll = bankroll;
    this.setRules(rules);
    this.phase = 'idle';
    this.hands = [];
    this.dealer = [];
  }

  setRules(rules) {
    const decks = SHOE_DECKS[rules.decks];
    this.rules = { ...rules };
    if (!this.shoe || this.shoe.decks !== decks) this.shoe = new Shoe(decks, 0.75, this.rnd);
  }

  get up() { return this.dealer[0]; }
  get hand() { return this.hands[this.active]; }
  get inRound() { return this.phase !== 'idle' && this.phase !== 'done'; }

  // setup (optional): { player: [rank, rank], up: rank } to deal a specific practice situation.
  start(bet, setup) {
    if (this.inRound) throw new Error('round in progress');
    if (bet > this.bankroll) throw new Error('insufficient bankroll');
    this.shuffled = false;
    if (this.shoe.needsShuffle) { this.shoe.shuffle(); this.shuffled = true; }
    const pull = (r) => {
      const c = (r !== undefined && this.shoe.take(r)) || this.shoe.draw();
      return c;
    };
    this.bankroll -= bet;
    this.baseBet = bet;
    this.insurance = 0;
    this.insuranceOffered = false;
    this.holeRevealed = false;
    this.esPending = false;
    this.active = 0;
    const p1 = pull(setup?.player[0]);
    const up = pull(setup?.up);
    const p2 = pull(setup?.player[1]);
    const hole = this.shoe.draw();
    for (const c of [p1, up, p2]) this.shoe.see(c);
    this.hands = [{ cards: [p1, p2], bet, done: false }];
    this.dealer = [up, hole];
    this.roundNet = null;
    if (up.r === 0) { this.phase = 'insurance'; this.insuranceOffered = true; }
    else this.afterInsurance();
    return this;
  }

  takeInsurance(take) {
    if (this.phase !== 'insurance') return;
    if (take) {
      this.insurance = Math.min(this.baseBet / 2, this.bankroll);
      this.bankroll -= this.insurance;
    }
    this.afterInsurance();
  }

  get playerBJ() { return this.hands.length === 1 && !this.hands[0].fromSplit && isBlackjack(this.hands[0].cards); }
  get dealerBJ() { return isBlackjack(this.dealer); }
  get dealerCanHaveBJ() { return this.up.r === 0 || this.up.r === 9; }

  afterInsurance() {
    this.phase = 'player';
    if (this.rules.surrender === 'early' && !this.playerBJ) { this.esPending = true; return; }
    this.peek();
  }

  // Dealer checks for blackjack (US rules) and naturals are resolved.
  peek() {
    if (this.rules.peek && this.dealerCanHaveBJ && this.dealerBJ) return this.finish();
    if (this.playerBJ) return this.finish();
    this.phase = 'player';
  }

  available() {
    const h = this.hand;
    if (this.phase !== 'player' || !h || h.done) return {};
    const { total, hard, soft } = handTotal(h.cards);
    const two = h.cards.length === 2;
    const r = this.rules;
    const dblTotal = r.double === 'any' || (!soft && (r.double === '9-11' ? hard >= 9 && hard <= 11 : r.double === '10-11' && (hard === 10 || hard === 11)));
    return {
      H: total < 21,
      S: true,
      D: two && r.double !== 'never' && dblTotal && (!h.fromSplit || r.das) && this.bankroll >= h.bet,
      P: two && cardValue(h.cards[0]) === cardValue(h.cards[1]) && this.hands.length < MAX_HANDS && !h.splitAces && this.bankroll >= h.bet,
      R: r.surrender !== 'never' && two && this.hands.length === 1 && !h.fromSplit,
    };
  }

  // The strategy-card situation for the active hand and the book play.
  situation() {
    const h = this.hand;
    const can = this.available();
    const up = this.up.r;
    const { total, soft } = handTotal(h.cards);
    const pair = can.P ? 'p' + cardValue(h.cards[0]) : null;
    let row = soft ? 's' + total : 'h' + total;
    if (row === 's12') row = 'h12';
    if (total <= 4) row = 'h4';
    let useRow = pair || row;
    let code = chartCode(useRow, up, this.rules);
    let book = resolveCode(code, can);
    if (!book) { useRow = row; code = chartCode(row, up, this.rules); book = resolveCode(code, can); }
    if (!can[book]) book = can.H ? 'H' : 'S';
    const evs = cellEVs(useRow, up, this.rules);
    return { row: useRow, up, code, book, can, total, soft, evs, cards: h.cards.slice() };
  }

  act(a) {
    const can = this.available();
    if (!can[a]) throw new Error('action not available: ' + a);
    if (this.esPending) {
      this.esPending = false;
      if (a !== 'R') {
        this.peek();
        if (this.phase !== 'player') return; // dealer had blackjack
      }
    }
    const h = this.hand;
    const deal = () => { const c = this.shoe.draw(); this.shoe.see(c); return c; };
    switch (a) {
      case 'H': {
        h.cards.push(deal());
        if (handTotal(h.cards).total >= 21) h.done = true;
        break;
      }
      case 'S': h.done = true; break;
      case 'D': {
        this.bankroll -= h.bet;
        h.bet *= 2;
        h.doubled = true;
        h.cards.push(deal());
        h.done = true;
        break;
      }
      case 'P': {
        this.bankroll -= h.bet;
        const aces = h.cards[0].r === 0;
        const nh = { cards: [h.cards.pop()], bet: h.bet, fromSplit: true, splitAces: aces, done: false };
        h.fromSplit = true;
        h.splitAces = aces;
        this.hands.splice(this.active + 1, 0, nh);
        h.cards.push(deal());
        nh.cards.push(deal());
        for (const x of [h, nh]) if (aces || handTotal(x.cards).total === 21) x.done = true;
        break;
      }
      case 'R': h.surrendered = true; h.done = true; break;
    }
    this.advance();
  }

  advance() {
    while (this.active < this.hands.length && this.hands[this.active].done) this.active++;
    if (this.active < this.hands.length) return;
    this.active = this.hands.length - 1;
    const live = this.hands.some((h) => !h.surrendered && handTotal(h.cards).total <= 21);
    if (!live) return this.finish();
    this.phase = 'dealer';
  }

  dealerMustHit() {
    const { total, soft } = handTotal(this.dealer);
    return total < 17 || (total === 17 && soft && this.rules.h17);
  }

  // Advance dealer play by one card. Returns false when the dealer is finished
  // (and the round has been settled).
  dealerStep() {
    if (this.phase !== 'dealer') return false;
    if (!this.holeRevealed) { this.reveal(); return true; }
    if (!this.dealerBJ && this.dealerMustHit()) {
      const c = this.shoe.draw();
      this.shoe.see(c);
      this.dealer.push(c);
      return true;
    }
    this.settle();
    return false;
  }

  reveal() {
    if (this.holeRevealed) return;
    this.holeRevealed = true;
    this.shoe.see(this.dealer[1]);
  }

  finish() {
    this.reveal();
    this.settle();
  }

  settle() {
    const r = this.rules;
    const dBJ = this.dealerBJ;
    const d = handTotal(this.dealer).total;
    let net = 0;
    for (const h of this.hands) {
      const t = handTotal(h.cards).total;
      let res, win;
      if (h.surrendered) {
        const honoured = r.surrender === 'early' || !dBJ || r.peek;
        res = 'surrender';
        win = honoured ? -h.bet / 2 : -h.bet;
      } else if (this.playerBJ) {
        res = dBJ ? 'push' : 'blackjack';
        win = dBJ ? 0 : h.bet * r.bjPays;
      } else if (t > 21) { res = 'bust'; win = -h.bet; }
      else if (dBJ) { res = 'lose'; win = -h.bet; }
      else if (d > 21) { res = 'win'; win = h.bet; }
      else if (t > d) { res = 'win'; win = h.bet; }
      else if (t < d) { res = 'lose'; win = -h.bet; }
      else { res = 'push'; win = 0; }
      h.result = res;
      h.net = win;
      this.bankroll += h.bet + win;
      net += win;
    }
    if (this.insurance) {
      const insWin = dBJ ? 2 * this.insurance : -this.insurance;
      if (dBJ) this.bankroll += 3 * this.insurance;
      net += insWin;
      this.insuranceNet = insWin;
    }
    this.roundNet = net;
    this.phase = 'done';
  }

  // Probability that the next card is a ten (used to show the insurance EV).
  tenDensity() {
    const unseen = this.shoe.cards.concat([this.dealer[1]]);
    return unseen.filter((c) => c.r === 9).length / unseen.length;
  }
}
