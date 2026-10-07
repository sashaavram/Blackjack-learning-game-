// Prints the derived chart for a rule set, e.g.
//   node tools/print-chart.mjs '{"decks":4,"h17":false}'
import { buildChart, DEFAULT_RULES, HARD_ROWS, SOFT_ROWS, PAIR_ROWS, rowLabel } from '../js/strategy.js';
const rules = { ...DEFAULT_RULES, ...JSON.parse(process.argv[2] || '{}') };
const chart = buildChart(rules);
const order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
console.log(JSON.stringify(rules));
console.log('      ' + order.map((u) => (u === 0 ? 'A' : u === 9 ? 'T' : u + 1).toString().padEnd(3)).join(''));
for (const rows of [HARD_ROWS, SOFT_ROWS, PAIR_ROWS]) {
  for (const r of rows) console.log(rowLabel(r).padEnd(6) + order.map((u) => chart[r][u].padEnd(3)).join(''));
  console.log();
}
