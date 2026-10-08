// "Basic rules" guide shown at the bottom of the Strategy tab.
// Source: the user's Notion page "Blackjack — Basic Strategy Rules of Thumb".
// Every rule here is checked against the exact strategy engine
// (tests/rules-guide.test.mjs).

const row = (hand, rule) => `<tr><th>${hand}</th><td>${rule}</td></tr>`;

export const GUIDE_ASSUMES = { decks: 4, h17: false, double: 'any', das: true, surrender: 'late' };

export function guideHTML(rules) {
  const differs = Object.entries(GUIDE_ASSUMES).some(([k, v]) => rules[k] !== v);
  return `
<h2>Basic Rules</h2>
<p class="assumes"><b>Assumes:</b> multi-deck (4+), <b>dealer stands on soft 17 (S17)</b>, double on any two cards, double after split allowed, late surrender. If the dealer <b>hits</b> soft 17 (H17), a handful of these change — see the end.</p>
${differs ? '<p class="assumes warn">Your current house rules are different, so a few of these rules of thumb may not apply. The chart above is always exact for your rules.</p>' : ''}

<h3>The rule behind all the rules</h3>
<p>The dealer's up-card splits the world in two:</p>
<ul>
<li><b>2–6 = weak.</b> They're likely to bust. Let them. Stand more, double more, take fewer risks.</li>
<li><b>7–A = strong.</b> They'll probably make a hand. You have to make one too — hit until you get there.</li>
</ul>
<p>Nearly every decision below follows from that one split.</p>

<h3>Hard hands</h3>
<table class="guide">
${row('17+', 'Always stand. No exceptions.')}
${row('13–16', 'Stand vs 2–6 · Hit vs 7–A')}
${row('12', 'The oddball — stand <b>only</b> vs 4, 5, 6. Hit vs 2 and 3 · Hit vs 7, 8, 9, 10, A')}
${row('11', 'Always double. (Except vs Ace — just hit.)')}
${row('10', 'Double vs 2–9 · Hit vs 10 or A')}
${row('9', 'Double vs 3–6 only · Otherwise hit')}
${row('8 or less', 'Always hit')}
</table>

<h3>Soft hands (Ace counted as 11)</h3>
<p><b>Principle:</b> you can't bust a soft hand, so double when the dealer is weak and hit when they're not. Never just stand on a low soft total.</p>
<table class="guide">
${row('A,9 / A,8', "Always stand. You have 19 or 20 — don't get cute.")}
${row('A,7', 'The hand people blow. Stand vs 2, 7, 8 · Double vs 3–6 · <b>Hit vs 9, 10, A</b>')}
${row('A,6', 'Double vs 3–6 · Otherwise hit')}
${row('A,4 / A,5', 'Double vs 4–6 · Otherwise hit')}
${row('A,2 / A,3', 'Double vs 5–6 · Otherwise hit')}
</table>
<p><b>On A,7:</b> soft 18 feels strong but isn't against a 9, 10 or Ace. Hitting it is correct and counterintuitive — this is the most commonly misplayed hand in the game.</p>

<h3>Pairs</h3>
<table class="guide">
${row('A,A', '<b>Always split.</b> Every time, every up-card.')}
${row('8,8', '<b>Always split.</b> Even against a 10. 16 is the worst hand in blackjack — two 8s beat it.')}
${row('10,10', '<b>Never split.</b> 20 is a winning hand. Leave it alone.')}
${row('5,5', "<b>Never split.</b> It's a hard 10 — double instead.")}
${row('9,9', 'Split vs everything <b>except</b> 7, 10, A. (Standing on 18 vs a 7 is fine — they likely have 17.)')}
${row('7,7', 'Split vs 2–7')}
${row('6,6', 'Split vs 2–6')}
${row('2,2 / 3,3', 'Split vs 2–7')}
${row('4,4', 'Split <b>only</b> vs 5 and 6')}
</table>

<h3>Absolute rules</h3>
<ol>
<li><b>Never take insurance.</b> Not with a blackjack, not ever. It's a separate bet with a ~7% house edge.</li>
<li><b>Never split 10s</b> — no matter how good two hands of 10 look.</li>
<li><b>Always split Aces and 8s.</b></li>
<li><b>Surrender</b> 16 vs 9, 10, A and 15 vs 10. If surrender isn't offered, hit instead.</li>
<li><b>Set your buy-in before you sit down.</b> When it's gone, you're done.</li>
</ol>

<h3>Before you sit: check the placard</h3>
<ol>
<li><b>Blackjack pays 3:2</b> — never play a 6:5 table. A 6:5 game costs roughly <b>1.4%</b>, more than every correct decision above earns you combined.</li>
<li><b>S17 or H17</b> — does the dealer hit or stand on soft 17? These rules assume S17.</li>
</ol>
<p><b>If the table is H17, these change:</b></p>
<ul>
<li>A,8 doubles vs 6 (instead of standing)</li>
<li>A,7 doubles vs 2</li>
<li>11 doubles vs Ace (instead of hitting)</li>
<li>Surrender 17 vs Ace, and 15 vs Ace</li>
<li>8,8 vs Ace: <b>surrender</b> if allowed (otherwise split)</li>
</ul>
<p>H17 adds about <b>0.22%</b> to the house edge on its own.</p>

<h3>Reality check</h3>
<p>Perfect basic strategy brings the house edge to roughly <b>0.5%</b> or less on a good multi-deck game. That does <b>not</b> beat the game — it just makes your money last longer. Basic strategy is damage control, not a winning system.</p>
`;
}
