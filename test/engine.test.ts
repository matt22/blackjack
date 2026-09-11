import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAction,
  createDeck,
  createGame,
  getPublicState,
  scoreHand,
  validateSetup,
  type Card,
} from "../src/engine.js";
import { chooseAiAction } from "../src/ai.js";
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
  assert.throws(() => validateSetup({ humanNames: ["x".repeat(26)], aiCount: 0 }));
  assert.doesNotThrow(() => validateSetup({ humanNames: ["A", "B"], aiCount: 3 }));
});

test("hides the dealer hole card during player turns", () => {
  const state = createGame({ humanNames: ["Ada"], aiCount: 0 }, { random: () => 0.5 });
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

test("standings record every player result, rank players, and keep the dealer first", () => {
  const state = createGame({ humanNames: ["Ada", "Grace"], aiCount: 1 }, { random: () => 0.5 });
  state.phase = "complete";
  const standings = createStandings(state);

  state.outcomes = { "human-1": "win", "human-2": "win", "ai-1": "win" };
  recordRound(standings, state);
  state.outcomes = { "human-1": "win", "human-2": "push", "ai-1": "lose" };
  recordRound(standings, state);

  assert.deepEqual(standings, [
    { id: "dealer", name: "Dealer", wins: 1, losses: 4, pushes: 1 },
    { id: "human-1", name: "Ada", wins: 2, losses: 0, pushes: 0 },
    { id: "human-2", name: "Grace", wins: 1, losses: 0, pushes: 1 },
    { id: "ai-1", name: "AI 1", wins: 1, losses: 1, pushes: 0 },
  ]);
});
