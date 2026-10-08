import { Game } from './game.js';
import { handTotal, isRed, isBlackjack } from './cards.js';
import {
  buildChart, LEGEND, ACTION_NAME, HARD_ROWS, SOFT_ROWS, PAIR_ROWS, rowLabel, upLabel,
} from './strategy.js';
import { pickSituation, PLAY_ROWS } from './drill.js';
import { analysis, situationLabel } from './explain.js';
import { load, save, freshStats } from './store.js';
import { configure as configureAnim, animateTable, sweepTable, resetSeen } from './anim.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
};
const money = (x, sign = false) => {
  const s = '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return x < 0 ? '−' + s : sign && x > 0 ? '+' + s : s;
};
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';

const S = load();
const game = new Game(S.rules, { bankroll: S.bankroll });
let bet = Math.min(S.lastBet, S.bankroll);
let chart = buildChart(S.rules);
let currentTab = 'practice';
let roundMistakes = [];
let roundDecisions = 0;
let dealOrder = [];
let pending = null; // decision awaiting retry (block) or confirmation (warn)
let autoTimer = null;
let dealerTimer = null;
let handsSinceQuiz = 0;
let lastFeedback = { text: '', cls: '' };

const MIN_BET = 5;
const PRESETS = {
  strip: { name: 'Vegas - Strip', sub: '4+ Deck, Stand Soft 17, DAS, Late Surrender', rules: { decks: 4, h17: false, double: 'any', das: true, surrender: 'late', peek: true } },
  downtown: { name: 'Vegas - Downtown', sub: '2 Deck, Hit Soft 17, No DAS, No Surrender', rules: { decks: 2, h17: true, double: 'any', das: false, surrender: 'never', peek: true } },
  european: { name: 'Typical European', sub: '4+ Deck, No Peek, Double 9-11, No Surrender', rules: { decks: 4, h17: false, double: '9-11', das: true, surrender: 'never', peek: false } },
};

function persist() {
  S.bankroll = game.inRound ? S.bankroll : game.bankroll;
  S.lastBet = bet || S.lastBet;
  save(S);
}

/* ============================== sound & haptics ============================== */
let audio;
function beep(good) {
  if (!S.settings.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = good ? 'sine' : 'square';
    o.frequency.setValueAtTime(good ? 880 : 196, t);
    if (good) o.frequency.setValueAtTime(1318, t + 0.08);
    g.gain.setValueAtTime(good ? 0.12 : 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (good ? 0.22 : 0.3));
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + 0.32);
  } catch { /* audio unavailable */ }
}
// Short filtered-noise "snap" when a card lands on the felt.
function cardSound() {
  if (!S.settings.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, len = Math.floor(audio.sampleRate * 0.06);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    src.buffer = buf;
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 0.8;
    g.gain.value = 0.35;
    src.connect(f).connect(g).connect(audio.destination);
    src.start(t);
  } catch { /* audio unavailable */ }
}
const buzz = () => S.settings.vibrate && navigator.vibrate?.(150);

function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), ms);
}

/* ============================== cards ============================== */
function cardEl(c, faceDown) {
  const face = ['J', 'Q', 'K'].includes(c.f);
  return h('div', { class: 'card' + (isRed(c) ? ' red' : '') + (faceDown ? ' down' : ''), 'data-id': c.id, 'aria-label': faceDown ? 'face-down card' : c.f + c.s },
    h('div', { class: 'front' },
      h('div', { class: 'corner' }, c.f, h('span', { class: 's' }, c.s)),
      face ? h('div', { class: 'pip face' }, c.f, h('small', {}, c.s)) : h('div', { class: 'pip' }, c.s),
      h('div', { class: 'corner br' }, c.f, h('span', { class: 's' }, c.s))),
    h('div', { class: 'back' }));
}

// Block input while cards are moving; returns the animation time in ms.
let busyTimer = null;
function animateCards() {
  const ms = animateTable($('#table'), $('#shoe'), dealOrder);
  if (ms > 0) {
    document.body.classList.add('dealing');
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => document.body.classList.remove('dealing'), ms);
  }
  return ms;
}
const isBusy = () => document.body.classList.contains('dealing');

function totalText(cards, fromSplit = false) {
  const t = handTotal(cards);
  if (isBlackjack(cards) && !fromSplit) return 'Blackjack';
  if (t.total > 21) return t.total + ' Bust';
  return (t.soft ? 'Soft ' : '') + t.total;
}

/* ============================== practice render ============================== */
function renderPractice() {
  const g = game;
  const inRound = g.inRound;
  $('#bankroll').textContent = money(g.bankroll);

  const st = S.stats;
  $('#mini-stats').innerHTML = `Hands: ${st.hands}<br>Decisions: ${st.decisions}<br>Errors: ${st.errors}<br>Correct: ${st.decisions ? pct(1 - st.errors / st.decisions) : '—'}`;

  const cb = $('#count-badge');
  if (S.settings.counting === 'show') {
    cb.classList.remove('hidden');
    const tc = g.shoe.trueCount;
    cb.innerHTML = `RC ${fmtCount(g.shoe.runningCount)} · TC ${fmtCount(Math.round(tc * 2) / 2)}<br>${g.shoe.decksRemaining.toFixed(1)} decks left`;
  } else if (S.settings.counting === 'quiz') {
    cb.classList.remove('hidden');
    cb.innerHTML = `Count quiz in ${Math.max(0, S.settings.quizEvery - handsSinceQuiz)}<br>${g.shoe.decksRemaining.toFixed(1)} decks left`;
  } else cb.classList.add('hidden');

  // Dealer
  const dc = $('#dealer-cards');
  dc.replaceChildren(...g.dealer.map((c, i) => cardEl(c, i === 1 && !g.holeRevealed)));
  $('#dealer-total').textContent = g.dealer.length && S.settings.showTotals
    ? (g.holeRevealed ? totalText(g.dealer) : 'Shows ' + (g.up.r === 0 ? 'A' : g.up.r === 9 ? '10' : g.up.r + 1))
    : '';

  // Player hands
  const pa = $('#player-hands');
  pa.classList.toggle('multi', g.hands.length === 2);
  pa.classList.toggle('many', g.hands.length > 2);
  pa.replaceChildren(...g.hands.map((hand, i) => {
    const active = g.phase === 'player' && i === g.active && g.hands.length > 1;
    const res = hand.result
      ? h('span', { class: 'badge ' + hand.result }, resultText(hand))
      : null;
    return h('div', { class: 'hand' + (active ? ' active' : '') },
      h('div', { class: 'cards' }, hand.cards.map((c) => cardEl(c))),
      h('div', { class: 'total' },
        S.settings.showTotals ? totalText(hand.cards, hand.fromSplit) : '',
        h('span', { class: 'bet-tag' }, money(hand.bet) + (hand.doubled ? ' ×2' : '')),
        res));
  }));

  // Actions
  const can = g.available();
  for (const b of $$('#actions [data-act]')) {
    const a = b.dataset.act;
    b.disabled = a === 'hint' ? !(g.phase === 'player' || g.phase === 'insurance') || !!pending?.warn : !can[a] || !!pending?.warn;
    b.classList.toggle('hidden', !inRound && a !== 'hint');
  }
  $('#btn-deal').classList.toggle('hidden', inRound);
  const fb = $('#feedback');
  fb.textContent = S.settings.printed ? lastFeedback.text : '';
  fb.className = 'feedback ' + lastFeedback.cls;

  // Panels
  $('#insurance-panel').classList.toggle('hidden', g.phase !== 'insurance' || !!pending?.warn);
  if (g.phase === 'insurance') $('#insurance-text').textContent = g.playerBJ ? 'Dealer shows an Ace. Take even money?' : `Dealer shows an Ace. Insurance (${money(g.baseBet / 2)})?`;
  $('#warn-panel').classList.toggle('hidden', !pending?.warn);

  // Bet bar
  $('#betbar').classList.toggle('hidden', inRound);
  $('#bet-amount').textContent = money(bet);
  for (const c of $$('[data-chip]')) c.disabled = bet + +c.dataset.chip > g.bankroll;

  // Mode controls
  for (const b of $$('#mode-seg button')) b.classList.toggle('on', b.dataset.mode === S.mode);
  $('#skill-label').textContent = { normal: 'Norm', beg: 'Beg', med: 'Med', adv: 'Adv' }[S.skill];
  $('#rules-summary').innerHTML = '<i>House Rules</i><br>' + rulesLines(S.rules).join(' · ');
  return currentTab === 'practice' ? animateCards() : 0;
}

const fmtCount = (x) => (x > 0 ? '+' : '') + x;

function resultText(hand) {
  const n = hand.net;
  return { win: 'Win', blackjack: 'Blackjack', lose: 'Lose', bust: 'Bust', push: 'Push', surrender: 'Surrender' }[hand.result] +
    (n ? ' ' + money(n, true) : '');
}

function rulesLines(r) {
  return [
    r.decks === 4 ? '4+ Decks' : r.decks === 1 ? '1 Deck' : r.decks + ' Decks',
    r.h17 ? 'Dealer Hits Soft 17' : 'Dealer Stands on Soft 17',
    { never: 'No Doubling', '10-11': 'Double on 10/11', '9-11': 'Double on 9/10/11', any: 'Double on Any' }[r.double],
    { never: 'No Surrender', late: 'Late Surrender', early: 'Early Surrender' }[r.surrender],
    r.das ? 'Double After Split Allowed' : 'No Double After Split',
    r.peek ? 'Dealer Peeks (US)' : 'No Peek (European)',
    r.bjPays === 1.2 ? 'Blackjack Pays 6:5' : 'Blackjack Pays 3:2',
  ];
}

/* ============================== round flow ============================== */
function clearAuto() { clearTimeout(autoTimer); autoTimer = null; }

function deal() {
  clearAuto();
  if (game.inRound || isBusy()) return;
  if (game.bankroll < MIN_BET) return outOfMoney();
  if (bet < MIN_BET) { bet = Math.min(Math.max(S.lastBet, MIN_BET), game.bankroll); if (bet < MIN_BET) return outOfMoney(); }
  if (bet > game.bankroll) bet = game.bankroll;
  if (S.settings.counting === 'quiz' && handsSinceQuiz >= S.settings.quizEvery && game.shoe.remaining < game.shoe.total) {
    return countQuiz(() => { handsSinceQuiz = 0; deal(); });
  }
  const sweep = game.dealer.length ? sweepTable($('#table')) : 0;
  if (sweep) {
    document.body.classList.add('dealing');
    setTimeout(() => { document.body.classList.remove('dealing'); startRound(); }, sweep);
  } else startRound();
}

function startRound() {
  game.setRules(S.rules);
  let setup = pickSituation({ mode: S.mode, skill: S.skill, chart, custom: S.custom, mistakes: S.sit });
  if (!setup && S.mode === 'drill') toast('No mistakes recorded yet — dealing a normal hand.');
  S.lastBet = bet;
  roundMistakes = [];
  roundDecisions = 0;
  pending = null;
  lastFeedback = { text: '', cls: '' };
  game.start(bet, setup || undefined);
  resetSeen();
  dealOrder = [game.hands[0].cards[0], game.dealer[0], game.hands[0].cards[1], game.dealer[1]].map((c) => c.id);
  if (game.shuffled) toast('New shoe shuffled' + (S.settings.counting !== 'off' ? ' — count resets to 0' : ''));
  $('#round-msg').textContent = '';
  S.stats.hands++;
  S.session.hands++;
  afterAction();
}

// Render, then let the cards finish moving before the dealer plays or the
// round is settled.
function afterAction() {
  const ms = renderPractice();
  if (game.phase === 'dealer') dealerTimer = setTimeout(runDealer, ms);
  else if (game.phase === 'done') dealerTimer = setTimeout(endRound, ms ? ms + 150 : 0);
}

function runDealer() {
  const step = () => {
    const more = game.dealerStep();
    const ms = renderPractice();
    if (more) dealerTimer = setTimeout(step, Math.max(S.settings.dealerSpeed * 1000, ms + 120));
    else endRound();
  };
  dealerTimer = setTimeout(step, S.settings.dealerSpeed * 500);
}

function endRound() {
  const g = game;
  let wagered = g.insurance || 0;
  for (const hand of g.hands) {
    wagered += hand.bet;
    if (hand.result === 'blackjack') { S.stats.blackjacks++; S.stats.wins++; }
    else if (hand.result === 'win') S.stats.wins++;
    else if (hand.result === 'push') S.stats.pushes++;
    else if (hand.result === 'surrender') S.stats.surrenders++;
    else S.stats.losses++;
  }
  S.stats.wagered += wagered;
  S.stats.net += g.roundNet;
  S.session.net += g.roundNet;
  handsSinceQuiz++;
  const bank = $('.bank');
  bank.classList.remove('up', 'down');
  void bank.offsetWidth;
  if (g.roundNet) bank.classList.add(g.roundNet > 0 ? 'up' : 'down');

  const msg = [];
  msg.push(g.roundNet === 0 ? 'Push' : (g.roundNet > 0 ? 'You won ' : 'You lost ') + money(Math.abs(g.roundNet)));
  if (g.insurance) msg.push(`insurance ${money(g.insuranceNet, true)}`);
  if (roundMistakes.length) {
    const cost = roundMistakes.reduce((a, m) => a + (m.cost || 0), 0);
    msg.push(`${roundMistakes.length} mistake${roundMistakes.length > 1 ? 's' : ''}` + (cost > 0.005 ? ` (≈ ${money(cost)} expected cost)` : ''));
  } else if (roundDecisions) msg.push('perfect play');
  const el = $('#round-msg');
  el.replaceChildren(msg.join(' · '));
  if (S.settings.mistakeMode === 'free' && roundMistakes.length) {
    for (const m of roundMistakes) el.append(h('div', { class: 'explain' }, `${m.label}: you chose ${ACTION_NAME[m.action] || m.action}, book says ${ACTION_NAME[m.book] || m.book}`));
  }
  if (bet > g.bankroll) bet = Math.floor(g.bankroll / 5) * 5;
  S.bankroll = g.bankroll;
  persist();
  renderPractice();
  if (g.bankroll < MIN_BET) return setTimeout(outOfMoney, 800);
  if (S.settings.autoDeal > 0) autoTimer = setTimeout(deal, S.settings.autoDeal * 1000 + 600);
}

function outOfMoney() {
  openModal('Out of chips', [
    h('h2', {}, 'You are out of chips'),
    h('p', {}, `Your all-time result is ${money(S.stats.net, true)} over ${S.stats.hands} hands. Reset your bankroll to keep playing (statistics are kept).`),
    h('button', { class: 'btn primary', style: 'width:100%', onclick: () => { resetBankroll(); closeModal(); } }, `Reset bankroll to ${money(S.settings.startBankroll)}`),
  ]);
}

function resetBankroll() {
  if (game.inRound) return toast('Finish the current hand first.');
  game.bankroll = S.settings.startBankroll;
  S.bankroll = game.bankroll;
  S.session = { net: 0, hands: 0, start: game.bankroll };
  bet = Math.min(S.lastBet || 15, game.bankroll);
  persist();
  renderAll();
  toast('Bankroll reset to ' + money(game.bankroll));
}

/* ============================== decisions & grading ============================== */
function recordDecision({ key, label, action, book, cards, up }) {
  const ok = action === book;
  S.stats.decisions++;
  roundDecisions++;
  const s = (S.sit[key] ||= { n: 0, err: 0 });
  s.n++;
  if (!ok) {
    S.stats.errors++;
    s.err++;
  }
  S.history.unshift({ t: Date.now(), label, cards, up, action, book, ok });
  if (S.history.length > 100) S.history.length = 100;
  return ok;
}

function feedback(ok, text) {
  lastFeedback = { text, cls: ok ? 'good' : 'bad' };
  beep(ok);
  if (!ok) buzz();
}

// Called when the player taps an action. Applies the house's mistake policy.
function onAction(a) {
  clearAuto();
  if (game.phase !== 'player' || pending?.warn || isBusy()) return;
  const s = game.situation();
  const key = s.row + '|' + s.up;
  const label = situationLabel(s.row, s.up);
  const cards = s.cards.map((c) => c.f);
  const ev = s.evs?.ev;
  const cost = a !== s.book && ev && ev[a] != null && ev[s.book] != null ? Math.max(0, (ev[s.book] - ev[a]) * game.hand.bet) : 0;
  const ok = a === s.book;
  const mode = S.settings.mistakeMode;

  if (!pending || pending.key !== key || pending.handIndex !== game.active || pending.nCards !== s.cards.length) {
    recordDecision({ key, label, action: a, book: s.book, cards, up: s.up });
    pending = { key, handIndex: game.active, nCards: s.cards.length };
    if (!ok && mode !== 'block') roundMistakes.push({ label, action: a, book: s.book, cost: mode === 'free' ? cost : 0 });
    if (!ok && mode === 'block') roundMistakes.push({ label, action: a, book: s.book, cost: 0 });
  }

  if (ok) {
    feedback(true, pending.retried ? 'Yes' : ['Correct', 'Right', 'Good'][Math.floor(Math.random() * 3)]);
    return apply(a);
  }
  if (mode === 'block') {
    pending.retried = true;
    feedback(false, 'Try Again');
    flashButton(null);
    return renderPractice();
  }
  if (mode === 'warn') {
    feedback(false, 'Not the book play');
    pending.warn = { mine: a, book: s.book, cost, label };
    $('#warn-text').innerHTML = `<b>${label}</b><br>The strategy card says <b>${ACTION_NAME[s.book]}</b>; you chose ${ACTION_NAME[a]}.` +
      (cost > 0.005 ? `<br><small>Playing your move costs ≈ ${money(cost)} in expected value.</small>` : '');
    $('#warn-book').textContent = ACTION_NAME[s.book];
    $('#warn-mine').textContent = ACTION_NAME[a] + ' anyway';
    return renderPractice();
  }
  // free play: apply the player's move, review at the end of the hand
  feedback(false, 'Noted');
  S.stats.mistakeCost += cost;
  apply(a);
}

function resolveWarn(useBook) {
  const w = pending?.warn;
  if (!w) return;
  pending.warn = null;
  if (!useBook) {
    S.stats.mistakeCost += w.cost;
    const last = roundMistakes[roundMistakes.length - 1];
    if (last) last.cost = w.cost;
  }
  lastFeedback = { text: useBook ? 'Book play' : 'Your play', cls: '' };
  apply(useBook ? w.book : w.mine);
}

function apply(a) {
  pending = null;
  flashButton(a);
  game.act(a);
  persist();
  afterAction();
}

function flashButton(a) {
  if (!a) return;
  const b = $(`#actions [data-act="${a}"]`);
  b?.classList.add('flash');
  setTimeout(() => b?.classList.remove('flash'), 250);
}

function onInsurance(take) {
  if (game.phase !== 'insurance' || isBusy()) return;
  const p = game.tenDensity();
  const insCost = take ? Math.max(0, -(3 * p - 1) * (game.baseBet / 2)) : 0;
  const mode = S.settings.mistakeMode;
  if (!pending || pending.key !== 'ins') {
    recordDecision({ key: 'ins|0', label: (game.playerBJ ? 'Even money' : 'Insurance') + ' v A', action: take ? 'I' : 'N', book: 'N', cards: game.hand.cards.map((c) => c.f), up: 0 });
    pending = { key: 'ins' };
    if (take) roundMistakes.push({ label: 'Insurance', action: 'Take insurance', book: 'No insurance', cost: insCost });
  }
  if (!take) {
    feedback(true, 'Correct');
    pending = null;
    game.takeInsurance(false);
    return afterAction();
  }
  if (mode === 'block') { feedback(false, 'Try Again'); return renderPractice(); }
  feedback(false, 'Never insure');
  S.stats.mistakeCost += insCost;
  roundMistakes[roundMistakes.length - 1].cost = insCost;
  pending = null;
  game.takeInsurance(true);
  afterAction();
}

/* ============================== hint ============================== */
function showHint() {
  const sheet = $('#hint-sheet');
  const body = $('#hint-body');
  if (game.phase === 'insurance') {
    const p = game.tenDensity();
    body.replaceChildren(
      h('h2', { id: 'hint-title' }, game.playerBJ ? 'Even money?' : 'Insurance?'),
      h('p', {}, 'Insurance is a side bet (half your bet) that the dealer’s hole card is a ten. It pays 2:1, so it only breaks even when at least 1/3 (33.3%) of the unseen cards are tens.'),
      h('p', {}, `Right now ${pct(p)} of the unseen cards are tens, so the insurance bet returns ${pct(3 * p - 1)} of the amount insured.`),
      h('p', {}, 'Taking even money on a blackjack is the same bet in disguise.'),
      h('div', { class: 'answer' }, 'Basic strategy says:', h('b', {}, 'Never take insurance')),
      S.settings.counting !== 'off' ? h('p', { class: 'explain' }, 'Card counters using Hi-Lo take insurance when the true count is +3 or higher — that is beyond basic strategy and is not graded here.') : null,
    );
  } else {
    const s = game.situation();
    const a = analysis(s, S.rules);
    const reveal = h('div', {},
      h('div', { class: 'answer' }, 'The Strategy Card says:', h('b', {}, a.answer)),
      a.evRows.length ? h('table', { class: 'evtable' }, a.evRows.map((r, i) =>
        h('tr', { class: i === 0 ? 'best' : '' }, h('td', {}, r.action), h('td', {}, (r.ev >= 0 ? '+' : '') + (r.ev * 100).toFixed(1) + '%'), h('td', {}, money(r.ev * game.hand.bet, true))))) : null,
      a.evRows.length ? h('p', { class: 'explain' }, a.evNote + ' Exact values for these house rules (2-card hand' + (a.multiCard ? ' — your hand has more cards, so treat them as a guide' : '') + ').') : null,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => { closeHint(); switchTab('strategy'); } }, 'Show on strategy card')),
    );
    reveal.classList.add('hidden');
    const btn = h('button', { class: 'btn primary', style: 'width:100%;margin-top:14px', onclick: () => { reveal.classList.remove('hidden'); btn.remove(); } }, 'Show the correct play');
    body.replaceChildren(
      h('h2', { id: 'hint-title' }, a.title),
      h('p', {}, a.blurb),
      h('p', {}, a.dealer),
      h('p', {}, a.can),
      btn, reveal,
    );
  }
  sheet.classList.remove('hidden');
}
const closeHint = () => $('#hint-sheet').classList.add('hidden');

/* ============================== modal helpers ============================== */
function openModal(title, kids, onDone) {
  $('#modal-title').textContent = title;
  $('#modal-body').replaceChildren(...kids);
  $('#modal').classList.remove('hidden');
  closeModal.cb = onDone;
}
function closeModal() {
  $('#modal').classList.add('hidden');
  const cb = closeModal.cb;
  closeModal.cb = null;
  cb?.();
}

function countQuiz(next) {
  let guess = 0;
  const out = h('output', {}, '0');
  const set = (d) => { guess += d; out.textContent = fmtCount(guess); };
  const result = h('p', { class: 'answer' });
  const submit = h('button', { class: 'btn primary', style: 'width:100%' }, 'Check');
  submit.onclick = () => {
    const rc = game.shoe.runningCount;
    const ok = guess === rc;
    S.stats.quizN++;
    if (ok) S.stats.quizRight++;
    beep(ok);
    result.innerHTML = ok ? `Correct! The running count is <b>${fmtCount(rc)}</b>` : `The running count is <b>${fmtCount(rc)}</b> (you said ${fmtCount(guess)})`;
    result.innerHTML += `<br><small>True count ≈ ${fmtCount(Math.round(game.shoe.trueCount * 2) / 2)} with ${game.shoe.decksRemaining.toFixed(1)} decks left</small>`;
    submit.textContent = 'Deal next hand';
    submit.onclick = () => closeModal();
    persist();
  };
  openModal('Count Check', [
    h('h2', {}, "What's the running count?"),
    h('p', { class: 'explain' }, 'Hi-Lo: 2–6 count +1, 7–9 count 0, tens and Aces count −1. Every card seen since the shuffle counts, including the dealer’s hole card.'),
    h('div', { class: 'stepper' }, h('button', { onclick: () => set(-1) }, '−'), out, h('button', { onclick: () => set(1) }, '+')),
    submit, result,
  ], next);
}

function chooseSkill() {
  const opts = [
    ['normal', 'Normal', 'Hands are dealt at random from the shoe, exactly as in a casino.'],
    ['beg', 'Beginner', 'Hands whose correct play depends on the dealer card are dealt somewhat more often.'],
    ['med', 'Intermediate', 'Tricky hands (e.g. 12, 16, soft 18, 9s) come up much more often.'],
    ['adv', 'Advanced', 'Mostly the hardest hands — rows of the strategy card with 3+ different plays.'],
  ];
  openModal('Skill Level', [
    h('p', { class: 'explain' }, 'Skill levels deal practice hands weighted by difficulty (the number of different plays in that row of the strategy card). Normal deals naturally.'),
    ...opts.map(([k, name, desc]) => h('button', { class: 'preset', onclick: () => { S.skill = k; persist(); closeModal(); renderPractice(); } },
      h('span', {}, name, h('small', {}, desc)), S.skill === k ? h('b', { class: 'check' }, '✓') : null)),
  ]);
}

function chooseCustom() {
  const rows = new Set(S.custom.rows), ups = new Set(S.custom.ups);
  const toggle = (set, v, b) => { set.has(v) ? set.delete(v) : set.add(v); b.classList.toggle('on', set.has(v)); };
  const grid = (list, set, lab) => h('div', { class: 'pick-grid' }, list.map((v) => {
    const b = h('button', { class: set.has(v) ? 'on' : '' }, lab(v));
    b.onclick = () => toggle(set, v, b);
    return b;
  }));
  const rowList = PLAY_ROWS.all;
  openModal('Custom Hands', [
    h('p', { class: 'explain' }, 'Choose which player hands and dealer up-cards to practise. Hands are then played out in full.'),
    h('b', {}, 'Hard totals'), grid(rowList.filter((r) => r[0] === 'h'), rows, rowLabel),
    h('b', {}, 'Soft hands'), grid(rowList.filter((r) => r[0] === 's'), rows, rowLabel),
    h('b', {}, 'Pairs'), grid(rowList.filter((r) => r[0] === 'p'), rows, rowLabel),
    h('b', {}, 'Dealer up-cards'), grid([1, 2, 3, 4, 5, 6, 7, 8, 9, 0], ups, upLabel),
  ], () => {
    if (!rows.size || !ups.size) { toast('Pick at least one hand and one up-card'); return; }
    S.custom = { rows: [...rows], ups: [...ups] };
    S.mode = 'custom';
    persist();
    renderPractice();
  });
}

/* ============================== strategy tab ============================== */
function renderStrategy() {
  const r = S.rules;
  const ups = S.settings.orderDealer === 'low' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] : [0, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  const cur = game.phase === 'player' ? game.situation() : null;
  const section = (id, title, rows) => {
    const ordered = S.settings.orderPlayer === 'low' ? rows.slice().reverse() : rows;
    return h('div', { class: 'sc', id: 'sc-' + id },
      h('h2', {}, title),
      h('table', {},
        h('tr', {}, h('th', { style: 'background:none' }), h('th', { class: 'cap', colspan: 10 }, "Dealer's Card")),
        h('tr', {}, h('th', { style: 'background:none' }), ups.map((u) => h('th', { class: cur && cur.up === u ? 'hl' : '' }, u === 9 ? '10' : upLabel(u)))),
        ordered.map((row) => h('tr', {},
          h('th', { class: cur && cur.row === row ? 'hl' : '' }, rowLabel(row)),
          ups.map((u) => {
            const code = chart[row][u];
            return h('td', { class: code + (cur && cur.row === row && cur.up === u ? ' cur' : '') }, code === 'P' ? '/' : code);
          })))));
  };
  const legendColors = { H: 'var(--H)', S: 'var(--S)', D: 'var(--D)', Ds: 'var(--Ds)', P: 'var(--P)', R: '#fff', Rs: '#fff', Rp: '#fff' };
  $('#strategy-cards').replaceChildren(
    section('hard', 'Hard Hands', HARD_ROWS.filter((x) => x !== 'h4')),
    section('soft', 'Soft Hands', SOFT_ROWS),
    section('pairs', 'Pairs', PAIR_ROWS),
    h('div', { id: 'sc-legend' },
      h('div', { class: 'sc' }, h('h2', {}, 'House Rules')),
      h('div', { class: 'rules-list' }, rulesLines(r).map((l) => h('div', {}, l))),
      h('div', { class: 'sc' }, h('h2', {}, 'Legend')),
      h('div', { class: 'legend' }, LEGEND.map(([c, name]) => h('div', {},
        h('span', { class: 'sw', style: `background:${legendColors[c]};color:${['D', 'Ds', 'R', 'Rs', 'Rp'].includes(c) ? '#111' : '#fff'}` }, c === 'P' ? '/' : c), name))),
      h('p', { class: 'note' }, 'Where a symbol has two actions, do the first if it is allowed, otherwise the second (e.g. "D": double if you still have only 2 cards, otherwise hit).'),
      h('p', { class: 'note' }, 'This chart is calculated exactly for the selected house rules (expected value of every play, with the cards already dealt removed from the shoe).'),
    ),
  );
  if (cur) {
    const sec = cur.row[0] === 'h' ? 'hard' : cur.row[0] === 's' ? 'soft' : 'pairs';
    requestAnimationFrame(() => $('#sc-' + sec)?.scrollIntoView({ block: 'start' }));
  }
}

/* ============================== forms ============================== */
function optRow(label, value, options, onChange, sub) {
  return h('div', { class: 'row' },
    h('label', {}, label, sub ? h('small', {}, sub) : null),
    h('div', { class: 'opt' }, options.map(([v, t]) => h('button', { class: v === value ? 'on' : '', onclick: () => onChange(v) }, t))));
}
function switchRow(label, value, onChange, sub) {
  const inp = h('input', { type: 'checkbox', class: 'switch', 'aria-label': label });
  inp.checked = value;
  inp.onchange = () => onChange(inp.checked);
  return h('div', { class: 'row' }, h('label', {}, label, sub ? h('small', {}, sub) : null), inp);
}
function rangeRow(label, value, min, max, step, fmt, onChange) {
  const out = h('small', {}, fmt(value));
  const inp = h('input', { type: 'range', min, max, step, value });
  inp.oninput = () => { out.textContent = fmt(+inp.value); onChange(+inp.value); };
  return h('div', { class: 'row' }, h('label', {}, label, out), inp);
}

function setRule(k, v) {
  S.rules = { ...S.rules, [k]: v };
  rulesChanged();
}
function rulesChanged() {
  chart = buildChart(S.rules);
  S.preset = Object.entries(PRESETS).find(([, p]) => Object.entries(p.rules).every(([k, v]) => S.rules[k] === v))?.[0] || null;
  if (!game.inRound) game.setRules(S.rules);
  persist();
  renderRules();
  renderPractice();
}

function renderRules() {
  const r = S.rules;
  $('#rules-form').replaceChildren(
    optRow('Decks', r.decks, [[1, '1'], [2, '2'], [3, '3'], [4, '4+']], (v) => setRule('decks', v)),
    switchRow('Dealer Hits Soft 17', r.h17, (v) => setRule('h17', v)),
    optRow('Double', r.double, [['never', 'Never'], ['10-11', '10/11'], ['9-11', '9/10/11'], ['any', 'Any']], (v) => setRule('double', v)),
    switchRow('Double After Split Allowed', r.das, (v) => setRule('das', v)),
    optRow('Surrender', r.surrender, [['never', 'Never'], ['late', 'Late'], ['early', 'Early']], (v) => setRule('surrender', v)),
    optRow('Dealer Peek', r.peek, [[true, 'Peek (US)'], [false, 'No Peek']], (v) => setRule('peek', v)),
    optRow('Blackjack Pays', r.bjPays, [[1.5, '3:2'], [1.2, '6:5']], (v) => setRule('bjPays', v), '6:5 costs you about 1.4% — avoid those tables'),
  );
  $('#presets').replaceChildren(...Object.entries(PRESETS).map(([k, p]) => h('button', {
    class: 'preset', onclick: () => { S.rules = { ...S.rules, ...p.rules }; rulesChanged(); },
  }, h('span', {}, p.name, h('small', {}, p.sub)), S.preset === k ? h('b', { class: 'check' }, '✓') : null)));
  $('#rules-note').textContent = game.inRound ? 'Changes apply from the next hand. The strategy card updates immediately.' : 'The strategy card is recalculated for these rules instantly.';
}

function setSetting(k, v) {
  S.settings = { ...S.settings, [k]: v };
  persist();
  renderSettings();
  applySettings();
  renderPractice();
}
function applySettings() {
  document.body.classList.toggle('left-handed', S.settings.hand === 'left');
  configureAnim({ animations: S.settings.animations, landSound: cardSound });
}

function renderSettings() {
  const s = S.settings;
  const canVibrate = 'vibrate' in navigator;
  $('#settings-form').replaceChildren(
    h('div', { class: 'group-title' }, 'Orientation'),
    optRow('Handedness', s.hand, [['left', 'Left'], ['right', 'Right']], (v) => setSetting('hand', v), 'Which side the action buttons are on'),
    h('div', { class: 'group-title' }, 'Strategy Card Display Order'),
    optRow('Dealer Card', s.orderDealer, [['high', 'High to Low'], ['low', 'Low to High']], (v) => setSetting('orderDealer', v)),
    optRow('Player Card', s.orderPlayer, [['high', 'High to Low'], ['low', 'Low to High']], (v) => setSetting('orderPlayer', v)),
    h('div', { class: 'group-title' }, 'When I make a mistake'),
    optRow('Mistakes', s.mistakeMode, [['warn', 'Warn'], ['block', 'Block'], ['free', 'Play on']], (v) => setSetting('mistakeMode', v)),
    h('p', { class: 'explain' }, {
      warn: 'Warn: show the book play and let you choose to take it or play your own move. Either way the mistake is counted.',
      block: 'Block: like the classic trainer — "Try Again" until you pick the book play, then the hand continues.',
      free: 'Play on: your move is played without interruption; mistakes are listed at the end of the hand and their expected cost is added to your stats.',
    }[s.mistakeMode]),
    h('div', { class: 'group-title' }, 'Feedback Options'),
    switchRow('Printed', s.printed, (v) => setSetting('printed', v)),
    switchRow('Correct / Incorrect Sound', s.sound, (v) => setSetting('sound', v)),
    switchRow('Vibrate on Incorrect', s.vibrate, (v) => setSetting('vibrate', v), canVibrate ? null : 'Not supported by Safari on iPhone'),
    switchRow('Show Totals', s.showTotals, (v) => setSetting('showTotals', v)),
    h('div', { class: 'group-title' }, 'Game Speed'),
    switchRow('Card animations', s.animations, (v) => setSetting('animations', v), 'Cards fly from the shoe and flip over'),
    rangeRow('Dealer speed', s.dealerSpeed, 0.2, 1.5, 0.1, (v) => v.toFixed(1) + ' s per card', (v) => { S.settings.dealerSpeed = v; persist(); }),
    rangeRow('Auto-deal next hand', s.autoDeal, 0, 4, 0.5, (v) => (v ? v.toFixed(1) + ' s after a hand' : 'Off — tap Deal'), (v) => { S.settings.autoDeal = v; persist(); }),
    h('div', { class: 'group-title' }, 'Card Counting (Hi-Lo)'),
    optRow('Count', s.counting, [['off', 'Off'], ['show', 'Show'], ['quiz', 'Quiz me']], (v) => setSetting('counting', v)),
    s.counting === 'quiz' ? optRow('Quiz every', s.quizEvery, [[3, '3'], [5, '5'], [10, '10']], (v) => setSetting('quizEvery', v), 'hands') : null,
    h('p', { class: 'explain' }, 'Hi-Lo: 2–6 = +1, 7–9 = 0, 10/A = −1. True count = running count ÷ decks remaining. The shoe is reshuffled at 75% penetration. Note: the practice modes (Soft, Pairs, Custom, Drill, skill levels) pick cards out of the shoe on purpose, so the count is only realistic in All mode with Normal skill.'),
    h('div', { class: 'group-title' }, 'Bankroll'),
    optRow('Starting bankroll', s.startBankroll, [[500, '$500'], [1000, '$1,000'], [5000, '$5,000']], (v) => setSetting('startBankroll', v)),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: resetBankroll }, 'Reset bankroll')),
  );
}

/* ============================== stats tab ============================== */
function renderStats() {
  const st = S.stats;
  const tile = (v, l, cls = '') => h('div', { class: 'tile' }, h('div', { class: 'v ' + cls }, v), h('div', { class: 'l' }, l));
  const sign = (x) => (x > 0.004 ? 'pos' : x < -0.004 ? 'neg' : '');
  const mistakes = Object.entries(S.sit).filter(([, s]) => s.err > 0)
    .sort((a, b) => b[1].err - a[1].err || b[1].err / b[1].n - a[1].err / a[1].n).slice(0, 20);
  const lab = (key) => {
    const [row, up] = key.split('|');
    return row === 'ins' ? 'Insurance v A' : situationLabel(row, +up);
  };
  const code = (a) => ({ I: 'Insure', N: 'No ins.' }[a] || ACTION_NAME[a] || a);
  $('#stats-body').replaceChildren(
    h('div', { class: 'group-title' }, 'Money'),
    h('div', { class: 'stat-grid' },
      tile(money(game.bankroll), 'Bankroll'),
      tile(money(S.session.net, true), `This session (${S.session.hands} hands)`, sign(S.session.net)),
      tile(money(st.net, true), 'All-time result', sign(st.net)),
      tile(money(st.wagered), 'Total wagered'),
      tile(st.wagered ? (st.net >= 0 ? '+' : '') + pct(st.net / st.wagered, 2) : '—', 'Return on money wagered', sign(st.net)),
      tile(money(st.mistakeCost), 'Expected cost of your mistakes', st.mistakeCost > 0.004 ? 'neg' : ''),
    ),
    h('p', { class: 'explain' }, 'Expected cost of mistakes = for every non-book play you actually made, (EV of the book play − EV of your play) × your bet, using exact EVs for your house rules. Your real result also includes luck; this number does not. Even perfect basic strategy has a small house edge (about 0.3–0.6% of money wagered with good rules).'),
    h('div', { class: 'group-title' }, 'Accuracy'),
    h('div', { class: 'stat-grid' },
      tile(st.decisions ? pct(1 - st.errors / st.decisions) : '—', `Correct (${st.decisions - st.errors} of ${st.decisions} decisions)`),
      tile(String(st.hands), 'Hands played'),
      tile(`${st.wins} / ${st.losses} / ${st.pushes}`, 'Won / Lost / Pushed hands'),
      tile(`${st.blackjacks} · ${st.surrenders}`, 'Blackjacks · Surrenders'),
      st.quizN ? tile(pct(st.quizRight / st.quizN, 0), `Count quiz (${st.quizRight}/${st.quizN})`) : null,
    ),
    h('div', { class: 'group-title' }, 'Frequent Mistakes'),
    mistakes.length
      ? h('div', { class: 'list' }, h('table', {},
          h('tr', {}, h('th', {}, 'Hand'), h('th', {}, 'Seen'), h('th', {}, 'Errors'), h('th', {}, 'Error rate')),
          mistakes.map(([k, s]) => h('tr', {}, h('td', {}, lab(k)), h('td', {}, s.n), h('td', { class: 'no' }, s.err), h('td', {}, pct(s.err / s.n, 0))))))
      : h('p', { class: 'note' }, 'No mistakes yet. Keep playing!'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', disabled: !mistakes.length, onclick: () => { S.mode = 'drill'; persist(); switchTab('practice'); toast('Drill mode: dealing the hands you miss most'); } }, 'Drill my mistakes')),
    h('div', { class: 'group-title' }, 'History (last 100 decisions)'),
    S.history.length
      ? h('div', { class: 'list' }, h('table', {},
          h('tr', {}, h('th', {}, 'Hand'), h('th', {}, 'You'), h('th', {}, 'Book')),
          S.history.map((x) => h('tr', {},
            h('td', {}, x.cards.join(',') + ' v ' + upLabel(x.up)),
            h('td', { class: x.ok ? 'ok' : 'no' }, (x.ok ? '✓ ' : '✗ ') + code(x.action)),
            h('td', {}, code(x.book))))))
      : h('p', { class: 'note' }, 'Your decisions will appear here.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', onclick: () => { if (confirm('Reset all statistics, history and mistakes?')) { S.stats = freshStats(); S.sit = {}; S.history = []; persist(); renderStats(); renderPractice(); } } }, 'Reset stats'),
      h('button', { class: 'btn', onclick: () => { resetBankroll(); renderStats(); } }, 'Reset bankroll')),
  );
}

/* ============================== help tab ============================== */
function renderHelp() {
  $('#help-body').innerHTML = `
<h2>About</h2>
<p>This trainer teaches blackjack <b>basic strategy</b> — the mathematically best play for every hand — while you play real hands with chips. Every decision you make is checked against the strategy card for the house rules you choose, and the hand is then played out to the end: the dealer reveals the hole card and draws, and you win or lose cash.</p>

<h2>Install on your iPhone</h2>
<p>Open this page in <b>Safari</b>, tap the <b>Share</b> button, then <b>Add to Home Screen</b>. It gets its own icon, opens full screen, and works offline. Your bankroll and stats are saved on the phone.</p>

<h2>Playing a hand</h2>
<p>Tap the chips ($5, $15, $25, $100) to build your bet and press <b>Deal</b>. Your bet stays the same for the next hand until you change it (Clear to start over).</p>
<dl>
<dt>Hit</dt><dd>Take another card.</dd>
<dt>Stand</dt><dd>Stop taking cards.</dd>
<dt>Double</dt><dd>Double your bet, take exactly one more card, and stop.</dd>
<dt>Split</dt><dd>Split a pair into two hands (with a second bet); each hand is played out. Up to 4 hands; split Aces get one card each.</dd>
<dt>Surrender</dt><dd>Give up the hand and get half your bet back (first two cards only).</dd>
<dt>Insurance</dt><dd>When the dealer shows an Ace you are asked about insurance. Basic strategy: never take it.</dd>
</dl>
<p>Payouts: win 1:1, blackjack 3:2 (or 6:5 if selected), push returns your bet.</p>

<h2>Learning features</h2>
<dl>
<dt>Feedback</dt><dd>After every decision you see whether it matched the strategy card. In <b>Settings → When I make a mistake</b> choose <i>Warn</i> (see the book play and choose), <i>Block</i> (must pick the right play, like the classic trainer) or <i>Play on</i> (review at the end of the hand).</dd>
<dt>Hint</dt><dd>Opens a Strategic Analysis of the hand: the type of hand, how often the dealer busts with that up-card, your options, and — when you tap — the correct play with the exact expected return of every option.</dd>
<dt>Strategy</dt><dd>The full strategy card for your rules. During a hand the current row, column and cell are highlighted.</dd>
<dt>Modes</dt><dd><b>All</b> deals every kind of hand; <b>Soft</b> only soft hands; <b>Pairs</b> only pairs; <b>Cust</b> lets you choose hands and dealer cards; <b>Drill</b> deals the hands you get wrong most often.</dd>
<dt>Skill</dt><dd>Beginner / Intermediate / Advanced deal harder hands more often (hands whose play depends on the dealer card).</dd>
<dt>Stats</dt><dd>Bankroll, results, accuracy, the expected cost of your mistakes in dollars, your most frequent mistakes, and the last 100 decisions.</dd>
<dt>Card counting</dt><dd>Optional Hi-Lo counting: show the running and true count, or be quizzed every few hands.</dd>
</dl>

<h2>Reading the strategy card</h2>
<p>Find the column for the dealer's up-card and the row for your hand: pairs use the Pairs table, hands with an Ace counted as 11 use Soft Hands, everything else uses Hard Hands. Two-letter symbols mean "do the first if allowed, otherwise the second": <b>D</b> double or hit, <b>Ds</b> double or stand, <b>R</b> surrender or hit, <b>Rs</b> surrender or stand, <b>Rp</b> surrender or split.</p>
<p>A note on "best play": the best play doesn't always win. Sometimes you'll make the right move and bust. Over thousands of hands, the best play gives the best result; with most casino rules the house still keeps a small edge, so the goal is to make that edge as small as possible.</p>

<h2>House rules</h2>
<p>Number of decks, whether the dealer hits soft 17, when you may double, double after split, surrender (late = after the dealer checks for blackjack, early = before), and dealer peek (US) vs no-peek (European: the dealer takes no hole card until you finish, and a dealer blackjack also takes your doubled and split bets). The strategy card is recalculated for every combination.</p>

<h2>How the strategy is calculated</h2>
<p>For every chart cell the app uses exact expected values computed by recursion over every possible card sequence for the selected number of decks, with your two cards and the dealer's up-card removed from the shoe, averaged over the ways to make that total. The charts match published basic strategy (e.g. the Wizard of Odds 4–8 deck charts and the classic Blackjack 101 card). Splits are calculated without resplitting, which can differ from full-resplit charts only in very rare, near-tie cells.</p>
`;
}

/* ============================== tabs & wiring ============================== */
function switchTab(tab) {
  currentTab = tab;
  for (const b of $$('#tabbar button')) b.classList.toggle('active', b.dataset.tab === tab);
  for (const s of $$('.screen')) s.classList.toggle('active', s.id === 'tab-' + tab);
  ({ practice: renderPractice, strategy: renderStrategy, rules: renderRules, stats: renderStats, settings: renderSettings, help: renderHelp })[tab]();
}

function renderAll() {
  renderPractice();
  if (currentTab !== 'practice') switchTab(currentTab);
}

function wire() {
  $('#tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });
  $('#actions').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    if (b.dataset.act === 'hint') showHint();
    else onAction(b.dataset.act);
  });
  $('#btn-deal').onclick = deal;
  $('#warn-book').onclick = () => resolveWarn(true);
  $('#warn-mine').onclick = () => resolveWarn(false);
  $('#ins-yes').onclick = () => onInsurance(true);
  $('#ins-no').onclick = () => onInsurance(false);
  $('#hint-done').onclick = closeHint;
  $('#modal-done').onclick = closeModal;
  $('.betbar .chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-chip]');
    if (!c || c.disabled || game.inRound) return;
    clearAuto();
    bet += +c.dataset.chip;
    renderPractice();
  });
  $('#bet-clear').onclick = () => { clearAuto(); bet = 0; renderPractice(); };
  $('#mode-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    if (b.dataset.mode === 'custom') return chooseCustom();
    S.mode = b.dataset.mode;
    if (S.mode === 'drill' && !Object.values(S.sit).some((s) => s.err)) toast('No mistakes recorded yet — Drill will deal normal hands until you miss one.');
    persist();
    renderPractice();
  });
  $('#skill-btn').onclick = chooseSkill;
  $('#rules-summary').onclick = () => switchTab('rules');
  $('#table').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (game.phase === 'done' || game.phase === 'idle') deal();
  });
  $$('.jump button').forEach((b) => (b.onclick = () => $('#sc-' + b.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
  document.addEventListener('visibilitychange', () => document.hidden && persist());
}

applySettings();
wire();
renderPractice();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
