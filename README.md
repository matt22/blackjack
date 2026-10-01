# Blackjack

A vanilla multiplayer blackjack game with a command-line interface and a reusable TypeScript game engine.

This first release supports one or two human players, zero to three AI players, and up to five total players at one table. Every player starts with a $1,000 bankroll and places a bet each round. The CLI keeps win, loss, and push standings for the current session and ranks everyone by money when you leave the table.

## Play

Requires Node.js 22 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev
```

To compile and run the generated JavaScript:

```bash
pnpm build
pnpm start
```

Run the tests with `pnpm test`.

See [CHANGELOG.md](CHANGELOG.md) for release history.

## CLI experience

- Table updates use clearly labeled, vertically stacked rows with player and dealer icons.
- Player and AI decisions are consolidated into one table update after the round resolves.
- The final table includes the dealer's score, outcome markers with each player's winnings or losses, the dealer's net result for the round, and a 💀 BUST marker in place of a loss marker for eliminated hands.
- After every round, a vertical standings table shows wins, losses, and pushes for every player and the dealer. Dealer totals are recorded once per player comparison.
- When you leave the table, the final standings are shown beside a money ranking: players are ranked by the chips they hold, and the dealer by their running net total from $0.

![Blackjack CLI gameplay after several rounds](assets/blackjack-gameplay.png)

## Current rules

- Each player and the dealer receive two cards.
- Players may Hit, Stand, or Double Down on their initial two cards.
- Double Down draws exactly one card and then stands.
- Aces count as 1 or 11, whichever produces the best hand.
- A hand over 21 busts; a total of 21 stands automatically.
- The dealer hits below 17 and stands on every 17 or higher, including a soft 17.
- The table rules (blackjack payout, dealer's 17 behavior, and the blackjack check) are posted before the first round.
- US hole-card rules: the dealer checks for blackjack before anyone acts. If the dealer has one, the round ends immediately and every player loses their original bet, except a player with their own natural, who pushes.
- Each player independently wins, loses, or pushes against the dealer.
- Human names must contain 1–15 characters after surrounding whitespace is removed.

## Betting

- Every human and AI player starts the session with $1,000 in chips.
- Before each round, human players choose a bet up to their available chips, or press Enter to bet the standard $100.
- AI players bet conservatively — the standard $100, or their whole stack if it's smaller — and never count cards.
- A natural blackjack (21 on the first two cards) pays 3:2, rounded down to whole chips, and beats any other dealer 21; two naturals push.
- Any other win pays 1:1 and a push returns the bet; a loss forfeits it.
- When the dealer shows an Ace, human players are offered insurance before the dealer checks for blackjack: a side bet of half their wager (rounded down) that pays 2:1 if the dealer has blackjack. A player holding a natural is offered it as even money, a guaranteed 1:1 win. AI players never take insurance.
- Double Down automatically doubles the player's starting bet for that hand and is only offered when the player has enough chips to cover it.
- A player with no chips left sits out the round.

## Architecture

### Shared Game Engine

- **TypeScript** — Shared game rules, configuration, and typed game state.
- Handles shuffling, dealing, hand scoring, player actions, dealer behavior, and round outcomes.
- Runs locally for the CLI and on Cloudflare for the web version.
- Keeps game logic independent of input, display, and storage.

### CLI Version (implemented)

- **Node.js** — Runs the game engine.
- **Node.js Readline** — Handles interactive terminal input, including game setup and player actions.
- **Terminal output** — Displays cards, scores, and game results.
- **Local in-memory state** — Keeps the game active until the process exits; no backend connection or database required.

### Web Version

- **React + TypeScript** — Builds the browser interface.
- **Relay** — Fetches GraphQL data and manages the client-side cache.
- **GraphQL API** — Exposes visible game state and actions such as dealing, hitting, and standing.
- **Cloudflare Workers** — Hosts frontend assets and the GraphQL API.
- **Cloudflare Durable Objects** — Manages one game session per object, using the shared engine to validate actions and update game state.
- **Durable Object storage** — Persists session configuration and game state across idle periods and object restarts without a separate database service.
- **Secure, HTTP-only session cookie** — Associates the browser with its game session.

The server controls the deck and game rules. Only information visible to the player is returned to the browser; the remaining deck and dealer's hidden card stay private until the rules permit revealing them.

### Data flow

```text
CLI → Shared TypeScript Engine

React + Relay → GraphQL Worker → Game Session Durable Object
                                      ├─ Shared TypeScript Engine
                                      └─ Durable Object Storage
```

## Future work

The following features are intentionally deferred to future commits.

### Betting

- Enable or disable betting.
- Configure starting chip balances and table betting limits.
- Select a blackjack payout ratio other than the default 3:2, such as 6:5.

### Table Setup

- Choose the number of decks in the shoe.
- All players compete against the dealer, with every seat sharing the same shoe and table rules.

### Blackjack Rules

- Dealer hits or stands on soft 17.
- Configure whether doubling is allowed on any initial two cards or only specified totals.
- Allow or disallow doubling after splitting.
- Configure splitting limits, resplitting aces, and hitting split aces.
- Enable or disable surrender and insurance.
- Configure dealer hole-card and blackjack-check rules (e.g. European no-hole-card).

### Shared Configuration

The TypeScript engine validates and applies the selected settings. Both the CLI and web interface use the same configuration model.

Settings are selected before starting a game and remain fixed during each round. Web sessions persist their configuration alongside game state in Cloudflare Durable Object storage.

## AI Players

- AI-controlled characters occupy additional seats and play against the dealer.
- AI players follow a simplified basic strategy based on their hand and the dealer's up card: they stand on 13–16 against a dealer 2–6 (12 against 4–6), stand on soft 18 against 2–8, and double down on 11, or on 10 against a dealer 2–9.
- AI decisions use only information available to a player, without access to hidden cards or the remaining deck order.
- AI decision logic is shared by the CLI and web versions and does not require an LLM service.
