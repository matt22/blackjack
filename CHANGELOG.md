# Changelog

All notable changes to Blackjack are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-09-06

### Added

- Session standings after every round, including dealer wins, losses, and pushes.
- Double Down for human and AI players: draw one card from an initial two-card hand, then stand.
- A terminal blackjack game for one or two named human players and up to three AI players.
- A reusable TypeScript engine for cards, scoring, turns, dealer play, and round outcomes.
- A simple AI policy that hits below 17.
- Hidden dealer hole cards during player turns.
- Input validation for table limits and player names up to 25 characters.
- Automated tests for scoring, deck creation, setup validation, visibility, turn order, busts, and outcomes.

### Changed

- Table state and results use labeled vertical rows, borders, and player/dealer icons for stronger visual hierarchy.
- Player and AI moves now produce one consolidated table update per round; final outcomes and bust markers appear in that table instead of a separate results panel.
- Consecutive AI decisions are summarized together before the updated cards are displayed.
- Suits and actions use capitalized names in the shared game model.
- Results include the dealer's final score and symbol emoji for wins, losses, and pushes.
