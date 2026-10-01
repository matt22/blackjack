import assert from "node:assert/strict";
import test from "node:test";
import {
  STANDARD_BET,
  STARTING_CHIPS,
  applyAction,
  createDeck,
  createGame,
  getActivePlayer,
  getPublicState,
  resolveInsurance,
  scoreHand,
  validateBet,
  validateSetup,
  type Card,
} from "../src/engine.js";
import { chooseAiAction, chooseAiBet } from "../src/ai.js";
import { createStandings, recordRound } from "../src/standings.js";

const card = (rank: Card["rank"], suit: Card["suit"] = "Spades"): Card => ({ rank, suit });

test("scores aces as 1 or 11", () => {
  assert.equal(scoreHand([card("A"), card("9")]), 20);
  assert.equal(scoreHand([card("A"), card("A"), card("9")]), 21);
  assert.equal(scoreHand([card("A"), card("K"), card("5")]), 16);
});

test("creates one standard 52-card deck", () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(({ rank, suit }) => `${rank}-${suit}`)).size, 52);
});

test("enforces table and name limits", () => {
  assert.throws(() => validateSetup({ humanNames: ["A", "B", "C"], aiCount: 0 }));
  assert.throws(() => validateSetup({ humanNames: ["A"], aiCount: 4 }));
  assert.throws(() => validateSetup({ humanNames: [""], aiCount: 0 }));
  assert.throws(() => validateSetup({ humanNames: ["x".repeat(16)], aiCount: 0 }));
  assert.doesNotThrow(() => validateSetup({ humanNames: ["A", "B"], aiCount: 3 }));
});

test("hides the dealer hole card during player turns", () => {
  const scriptedDeck = [card("7"), card("6"), card("K"), card("10")];
  const state = createGame({ humanNames: ["Ada"], aiCount: 0 }, { deck: scriptedDeck });
  const dealer = getPublicState(state).dealer;
  assert.ok(dealer.hand[0]);
  assert.equal(dealer.hand[1], null);
  assert.equal(dealer.score, null);
});

test("plays turns in order and settles against the dealer", () => {
  // Cards are popped from the end. Deal order: P1, P2, dealer, then repeat.
  const scriptedDeck = [
    card("10"), // dealer hit -> busts at 26
    card("6"),  // dealer second card
    card("8"),  // player 2 second card
    card("K"),  // player 1 second card
    card("10"), // dealer up card
    card("9"),  // player 2 first card
    card("K"),  // player 1 first card
  ];
  const state = createGame({ humanNames: ["Ada", "Grace"], aiCount: 0 }, { deck: scriptedDeck });
  applyAction(state, "human-1", "Stand");
  assert.equal(state.activePlayerIndex, 1);
  applyAction(state, "human-2", "Stand");
  assert.equal(state.phase, "complete");
  assert.deepEqual(state.outcomes, { "human-1": "win", "human-2": "win" });
});

test("a bust ends that player's turn", () => {
  const scriptedDeck = [
    card("6"),  // hit card
    card("10"), // dealer second
    card("6"),  // player second
    card("7"),  // dealer first
    card("K"),  // player first
  ];
  const state = createGame({ humanNames: ["Ada"], aiCount: 0 }, { deck: scriptedDeck });
  applyAction(state, "human-1", "Hit");
  assert.equal(state.players[0]?.status, "busted");
  assert.equal(state.phase, "complete");
  assert.equal(state.outcomes["human-1"], "lose");
});

test("double down draws exactly one card and ends the player's turn", () => {
  const scriptedDeck = [
    card("10"), // dealer hit -> busts
    card("K"),  // double-down card
    card("6"),  // dealer second
    card("6"),  // player 2 second
    card("5"),  // player 1 second
    card("10"), // dealer first
    card("10"), // player 2 first
    card("6"),  // player 1 first
  ];
  const state = createGame({ humanNames: ["Ada", "Grace"], aiCount: 0 }, { deck: scriptedDeck });

  applyAction(state, "human-1", "Double Down");

  assert.equal(state.players[0]?.doubledDown, true);
  assert.equal(state.players[0]?.hand.length, 3);
  assert.equal(state.players[0]?.status, "stood");
  assert.equal(state.activePlayerIndex, 1);
});

test("double down is rejected after a player has hit", () => {
  const scriptedDeck = [
    card("2"),  // attempted double-down card (must not be drawn)
    card("2"),  // hit card
    card("10"), // dealer second
    card("3"),  // player second
    card("7"),  // dealer first
    card("4"),  // player first
  ];
  const state = createGame({ humanNames: ["Ada"], aiCount: 0 }, { deck: scriptedDeck });
  applyAction(state, "human-1", "Hit");

  assert.throws(
    () => applyAction(state, "human-1", "Double Down"),
    /initial two cards/,
  );
  assert.equal(state.players[0]?.hand.length, 3);
  assert.equal(state.deck.length, 1);
});

test("AI players double down on an initial total of 11", () => {
  assert.equal(chooseAiAction([card("5"), card("6")], card("10")), "Double Down");
  assert.equal(chooseAiAction([card("5"), card("6"), card("A")], card("10")), "Hit");
});

test("AI players stand on stiff hands against a weak dealer up card", () => {
  assert.equal(chooseAiAction([card("10"), card("6")], card("5")), "Stand");
  assert.equal(chooseAiAction([card("10"), card("6")], card("7")), "Hit");
  assert.equal(chooseAiAction([card("10"), card("2")], card("4")), "Stand");
  assert.equal(chooseAiAction([card("10"), card("2")], card("3")), "Hit");
  assert.equal(chooseAiAction([card("10"), card("7")], card("A")), "Stand");
});

test("AI players play soft hands and double down on 10 by the dealer up card", () => {
  assert.equal(chooseAiAction([card("A"), card("6")], card("5")), "Hit");
  assert.equal(chooseAiAction([card("A"), card("7")], card("8")), "Stand");
  assert.equal(chooseAiAction([card("A"), card("7")], card("9")), "Hit");
  assert.equal(chooseAiAction([card("A"), card("8")], card("K")), "Stand");
  assert.equal(chooseAiAction([card("6"), card("4")], card("9")), "Double Down");
  assert.equal(chooseAiAction([card("6"), card("4")], card("10")), "Hit");
});

test("players start with the default chip stack and standard bet", () => {
  const state = createGame({ humanNames: ["Ada"], aiCount: 1 }, { random: () => 0.5 });
  for (const player of state.players) {
    assert.equal(player.bet, STANDARD_BET);
    assert.equal(player.chips, STARTING_CHIPS - STANDARD_BET);
  }
});

test("validateBet enforces positive whole bets within available chips", () => {
  assert.throws(() => validateBet(0, 500), /greater than zero/);
  assert.throws(() => validateBet(-10, 500), /greater than zero/);
  assert.throws(() => validateBet(1.5, 500), /whole number/);
  assert.throws(() => validateBet(600, 500), /exceed available chips/);
  assert.doesNotThrow(() => validateBet(500, 500));
  assert.throws(() => validateBet(1, 0), /No chips available/);
  assert.doesNotThrow(() => validateBet(0, 0));
});

test("a winning bet doubles the player's stake and a push returns it", () => {
  const scriptedDeck = [
    card("10"), // dealer hit -> busts at 26
    card("6"),  // dealer second card
    card("8"),  // player 2 second card
    card("K"),  // player 1 second card
    card("10"), // dealer up card
    card("9"),  // player 2 first card
    card("K"),  // player 1 first card
  ];
  const state = createGame(
    { humanNames: ["Ada", "Grace"], aiCount: 0 },
    { deck: scriptedDeck, bets: { "human-1": 200, "human-2": 50 } },
  );
  applyAction(state, "human-1", "Stand");
  applyAction(state, "human-2", "Stand");
  assert.deepEqual(state.outcomes, { "human-1": "win", "human-2": "win" });
  assert.equal(state.players[0]?.chips, STARTING_CHIPS - 200 + 400);
  assert.equal(state.players[1]?.chips, STARTING_CHIPS - 50 + 100);
});

test("a natural blackjack pays 3:2, rounded down to whole chips", () => {
  const scriptedDeck = [
    card("K"),  // dealer hit -> stands on 21 with three cards
    card("6"),  // dealer second card
    card("A"),  // player 2 second card
    card("A"),  // player 1 second card
    card("5"),  // dealer up card
    card("Q"),  // player 2 first card
    card("K"),  // player 1 first card
  ];
  const state = createGame(
    { humanNames: ["Ada", "Grace"], aiCount: 0 },
    { deck: scriptedDeck, bets: { "human-1": 100, "human-2": 25 } },
  );
  // Both naturals stand automatically, so the dealer plays straight away.
  assert.equal(state.phase, "complete");
  assert.deepEqual(state.outcomes, { "human-1": "win", "human-2": "win" });
  assert.equal(state.players[0]?.chips, STARTING_CHIPS - 100 + 100 + 150);
  assert.equal(state.players[1]?.chips, STARTING_CHIPS - 25 + 25 + 37);
});

test("a natural blackjack pushes against a dealer blackjack", () => {
  const scriptedDeck = [
    card("K"), // dealer second card
    card("A"), // player second card
    card("A"), // dealer up card
    card("K"), // player first card
  ];
  const state = createGame({ humanNames: ["Ada"], aiCount: 0 }, { deck: scriptedDeck });
  resolveInsurance(state, []);
  assert.deepEqual(state.outcomes, { "human-1": "push" });
  assert.equal(state.players[0]?.chips, STARTING_CHIPS);
});

test("a dealer blackjack ends the round before anyone acts", () => {
  const scriptedDeck = [
    card("A"), // dealer hole card
    card("A"), // player 2 second card
    card("9"), // player 1 second card
    card("K"), // dealer up card
    card("Q"), // player 2 first card
    card("10"), // player 1 first card
  ];
  const state = createGame(
    { humanNames: ["Ada", "Grace"], aiCount: 0 },
    { deck: scriptedDeck, bets: { "human-1": 100, "human-2": 50 } },
  );
  assert.equal(state.phase, "complete");
  assert.equal(state.activePlayerIndex, null);
  assert.throws(() => applyAction(state, "human-1", "Double Down"));
  // Only the original bet is lost; the other natural pushes.
  assert.deepEqual(state.outcomes, { "human-1": "lose", "human-2": "push" });
  assert.equal(state.players[0]?.chips, STARTING_CHIPS - 100);
  assert.equal(state.players[1]?.chips, STARTING_CHIPS);
  assert.deepEqual(getPublicState(state).dealer.hand, [card("K"), card("A")]);
});

test("play continues when the dealer shows an ace without a blackjack", () => {
  const scriptedDeck = [
    card("9"), // dealer hole card
    card("7"), // player second card
    card("A"), // dealer up card
    card("10"), // player first card
  ];
  const state = createGame({ humanNames: ["Ada"], aiCount: 0 }, { deck: scriptedDeck });
  assert.equal(state.phase, "insurance");
  assert.equal(getActivePlayer(state), null);
  assert.equal(getPublicState(state).dealer.hand[1], null);
  assert.throws(() => applyAction(state, "human-1", "Hit"));
  resolveInsurance(state, []);
  assert.equal(state.phase, "players");
  assert.equal(getActivePlayer(state)?.id, "human-1");
});

test("insurance pays 2:1 when the dealer has blackjack", () => {
  const scriptedDeck = [
    card("K"), // dealer hole card
    card("9"), // player second card
    card("A"), // dealer up card
    card("10"), // player first card
  ];
  const state = createGame({ humanNames: ["Ada"], aiCount: 0 }, { deck: scriptedDeck, bets: { "human-1": 100 } });
  resolveInsurance(state, ["human-1"]);
  assert.equal(state.phase, "complete");
  assert.equal(state.outcomes["human-1"], "lose");
  // Loses the $100 bet, wins $100 on the $50 insurance: breaks even.
  assert.equal(state.players[0]?.chips, STARTING_CHIPS);
  const standings = createStandings(state);
  recordRound(standings, state);
  assert.equal(standings.find((entry) => entry.id === "human-1")?.netWinnings, 0);
  assert.equal(standings.find((entry) => entry.id === "dealer")?.netWinnings, 0);
});

test("insurance is lost when the dealer has no blackjack", () => {
  const scriptedDeck = [
    card("6"), // dealer hole card -> stands on soft 17
    card("9"), // player second card
    card("A"), // dealer up card
    card("10"), // player first card
  ];
  const state = createGame({ humanNames: ["Ada"], aiCount: 0 }, { deck: scriptedDeck, bets: { "human-1": 100 } });
  resolveInsurance(state, ["human-1"]);
  assert.equal(state.players[0]?.chips, STARTING_CHIPS - 150);
  applyAction(state, "human-1", "Stand");
  assert.equal(state.outcomes["human-1"], "win");
  assert.equal(state.players[0]?.chips, STARTING_CHIPS + 100 - 50);
});

test("even money on a natural nets the bet whether or not the dealer has blackjack", () => {
  for (const hole of ["K", "6"] as const) {
    const scriptedDeck = [card(hole), card("K"), card("A"), card("A")];
    const state = createGame({ humanNames: ["Ada"], aiCount: 0 }, { deck: scriptedDeck, bets: { "human-1": 100 } });
    resolveInsurance(state, ["human-1"]);
    assert.equal(state.phase, "complete");
    assert.equal(state.players[0]?.chips, STARTING_CHIPS + 100);
  }
});

test("insurance is rejected without enough chips", () => {
  const scriptedDeck = [card("6"), card("9"), card("A"), card("10")];
  const state = createGame(
    { humanNames: ["Ada"], aiCount: 0 },
    { deck: scriptedDeck, chips: { "human-1": 100 }, bets: { "human-1": 100 } },
  );
  assert.throws(() => resolveInsurance(state, ["human-1"]), /cannot afford insurance/);
  assert.equal(state.phase, "insurance");
});

test("doubling down doubles the bet and is rejected without enough chips", () => {
  const scriptedDeck = [
    card("10"), // dealer hit -> busts
    card("K"),  // double-down card
    card("6"),  // dealer second
    card("5"),  // player second
    card("10"), // dealer first
    card("6"),  // player first
  ];
  const state = createGame(
    { humanNames: ["Ada"], aiCount: 0 },
    { deck: scriptedDeck, chips: { "human-1": 300 }, bets: { "human-1": 100 } },
  );
  assert.equal(state.players[0]?.chips, 200);
  applyAction(state, "human-1", "Double Down");
  assert.equal(state.players[0]?.bet, 200);
  assert.equal(state.players[0]?.chips, 100 + 400);
});

test("doubling down throws when the extra stake would exceed available chips", () => {
  const scriptedDeck = [
    card("6"),
    card("10"),
    card("6"),
    card("7"),
    card("K"),
  ];
  const state = createGame(
    { humanNames: ["Ada"], aiCount: 0 },
    { deck: scriptedDeck, chips: { "human-1": 150 }, bets: { "human-1": 100 } },
  );
  assert.throws(
    () => applyAction(state, "human-1", "Double Down"),
    /exceed the player's available funds/,
  );
});

test("AI bets the standard amount, capped at its remaining chips", () => {
  assert.equal(chooseAiBet(1000), STANDARD_BET);
  assert.equal(chooseAiBet(40), 40);
  assert.equal(chooseAiBet(0), 0);
});

test("standings record every player result, rank players, and keep the dealer first", () => {
  const state = createGame({ humanNames: ["Ada", "Grace"], aiCount: 1 }, { random: () => 0.5 });
  state.phase = "complete";
  // Fixed non-blackjack hands keep every win at 1:1 regardless of the shuffle.
  for (const player of state.players) player.hand = [card("10"), card("8")];
  const standings = createStandings(state);

  state.outcomes = { "human-1": "win", "human-2": "win", "ai-1": "win" };
  recordRound(standings, state);
  state.outcomes = { "human-1": "win", "human-2": "push", "ai-1": "lose" };
  recordRound(standings, state);

  assert.deepEqual(standings, [
    { id: "dealer", name: "Dealer", wins: 1, losses: 4, pushes: 1, netWinnings: -300 },
    { id: "human-1", name: "Ada", wins: 2, losses: 0, pushes: 0, netWinnings: 200 },
    { id: "human-2", name: "Grace", wins: 1, losses: 0, pushes: 1, netWinnings: 100 },
    { id: "ai-1", name: "AI 1", wins: 1, losses: 1, pushes: 0, netWinnings: 0 },
  ]);
});
