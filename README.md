# Blackjack Trainer — learn basic strategy while playing

A phone-friendly blackjack basic-strategy trainer modelled on *Blackjack 101*, but every hand is **played out for real**: the dealer reveals the hole card and draws, and you win or lose chips from a bankroll. All the learning features stay in place.

**Play it:** once GitHub Pages is enabled (see below), the app lives at
`https://sashaavram.github.io/Blackjack-learning-game-/`

## Features

- **Real gameplay with cash:** a $1,000 bankroll (saved on the phone), chips of $5 / $15 / $25 / $100, 3:2 (or 6:5) blackjack, double, split up to 4 hands (split Aces get one card), surrender, insurance and even money, and a dealer who plays out the hand.
- **Strategy feedback on every decision:** choose what happens on a mistake:
  - *Warn*: see the book play, then choose it or play your own move.
  - *Block*: "Try Again" until you pick the book play, like the original.
  - *Play on*: your move is played and reviewed at the end of the hand.
- **Hint / Strategic Analysis:** the type of hand, the dealer's bust rate for that up-card, your legal options, the correct play, and the **exact expected return of every option** for your house rules.
- **Strategy card:** the hard, soft and pairs tables for your rules, with the current hand highlighted.
- **House rules and presets:**
  - Rules: 1 / 2 / 3 / 4+ decks, dealer hits soft 17 (H17) or stands (S17), double rules (never / 10-11 / 9-11 / any), double after split (DAS), surrender (never / late / early), dealer peek (US) or no-peek (European), and a 3:2 or 6:5 blackjack payout.
  - Presets: Vegas Strip, Vegas Downtown and European.
- **Modes and skill levels:** All, Soft, Pairs, Custom (pick hands and dealer cards), and **Drill**, which deals the hands you miss most. Skill levels Normal, Beginner, Intermediate and Advanced deal harder hands more often.
- **Stats:**
  - Money: bankroll, session and all-time results, total wagered, return on money wagered, and the **expected dollar cost of your mistakes**.
  - Accuracy: percentage of correct decisions, plus a frequent-mistakes table and the last 100 decisions.
- **Hi-Lo card counting (optional):** show the running count, true count and decks left, or get quizzed every 3, 5 or 10 hands.
- **Installable and offline:** add it to your iPhone Home Screen from Safari and it runs full-screen without a connection.

## Install on iPhone

1. Open the Pages link in **Safari**.
2. Tap **Share** → **Add to Home Screen**.

## Enable GitHub Pages (one time)

Repository **Settings → Pages → Build and deployment → Source: Deploy from a branch**. Pick the branch (`main` after merging, or this feature branch to try it now) and the `/ (root)` folder, then **Save**. The site appears in a minute or two.

## How the strategy is computed (and verified)

`tools/generate-strategy.mjs` computes, for every chart cell, the exact expected value (EV) of stand, hit, double and split. It recurses over every possible card sequence for a finite 1-, 2-, 3- or 6-deck shoe, with the player's cards and the dealer's up-card removed. It does this for both the dealer-stands-on-soft-17 and dealer-hits-soft-17 rules, conditioned on the dealer not having blackjack, and stores the result in `js/strategy-data.js`.

`js/strategy.js` then builds the chart for any rule combination from those EVs. It handles surrender (late/early), doubling restrictions, DAS, and the European no-peek rule, where a dealer blackjack also wins your doubled and split bets.

Verification (`npm test`):

- The 4+ deck, S17, DAS, late-surrender chart matches the Blackjack 101 strategy card **cell for cell**.
- The 4+ deck H17 chart reproduces the hit-soft-17 changes listed by the Wizard of Odds: double 11 vs A, and surrender 15, 17 and 8,8 vs A. It also shows the other well-known H17 changes, double soft 18 vs 2 and soft 19 vs 6.
- Game-engine tests cover payouts, doubles, splits, split aces, surrender, insurance, peek and no-peek, and the Hi-Lo count balance.

Known simplification: split EVs assume no resplitting (resplitting is allowed in play). This can only matter in rare near-tie cells; no differences were found against the reference charts above.

## Development

```
npm test           # run the tests
npm run generate   # recompute js/strategy-data.js (~35 s)
npm run chart -- '{"decks":1,"h17":true}'   # print a chart for any rules
npm run serve      # local server at http://localhost:8080
```

There's no build step and no dependencies: plain HTML, CSS and ES modules.
