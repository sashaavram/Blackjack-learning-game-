// Saves settings, bankroll and statistics on the device (localStorage).
import { DEFAULT_RULES } from './strategy.js';

const KEY = 'bj-trainer.v1';

export const DEFAULT_SETTINGS = {
  hand: 'right', // which side the action buttons are on
  orderDealer: 'high', // strategy card columns: high (A,10..2) or low (2..10,A)
  orderPlayer: 'high', // strategy card rows
  printed: true,
  sound: true,
  vibrate: true,
  showTotals: true,
  mistakeMode: 'warn', // warn | block | free
  autoDeal: 0, // seconds; 0 = tap Deal manually
  dealerSpeed: 0.6, // seconds per dealer card
  counting: 'off', // off | show | quiz
  quizEvery: 5,
  startBankroll: 1000,
};

export const freshStats = () => ({
  hands: 0, decisions: 0, errors: 0, wagered: 0, net: 0, mistakeCost: 0,
  wins: 0, losses: 0, pushes: 0, blackjacks: 0, surrenders: 0,
  quizN: 0, quizRight: 0, since: Date.now(),
});

export function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* private mode or corrupt */ }
  return {
    rules: { ...DEFAULT_RULES, ...saved.rules },
    preset: saved.preset ?? 'strip',
    settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    mode: saved.mode || 'all',
    skill: saved.skill || 'normal',
    custom: saved.custom || { rows: ['h16', 'h15', 'h12', 's18', 'p9'], ups: [0, 1, 2, 7, 8, 9] },
    bankroll: saved.bankroll ?? DEFAULT_SETTINGS.startBankroll,
    lastBet: saved.lastBet ?? 15,
    stats: { ...freshStats(), ...saved.stats },
    sit: saved.sit || {},
    history: saved.history || [],
    session: { net: 0, hands: 0, start: saved.bankroll ?? DEFAULT_SETTINGS.startBankroll },
  };
}

export function save(s) {
  try {
    const { rules, preset, settings, mode, skill, custom, bankroll, lastBet, stats, sit, history } = s;
    localStorage.setItem(KEY, JSON.stringify({ rules, preset, settings, mode, skill, custom, bankroll, lastBet, stats, sit, history }));
  } catch { /* storage unavailable — the app still works for this session */ }
}
