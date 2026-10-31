export * from "./domain/constants.js";
export * from "./domain/types.js";
import {
  CARDS_PER_DECK, MAX_AI_PLAYERS, MAX_HUMAN_PLAYERS, MAX_NAME_LENGTH, MAX_PLAYERS,
  MID_ROUND_RESHUFFLE_THRESHOLD, RANKS, STARTING_CHIPS, STANDARD_BET, SUITS,
} from "./domain/constants.js";
import type { Action, Card, GameOptions, GameSetup, GameState, Player, PlayerKind } from "./domain/types.js";
export { createDeck, createDecks, deckCountForPlayers, shuffle } from "./cards/deck.js";
export { isBlackjack, scoreHand } from "./cards/hand.js";
import { createDecks, deckCountForPlayers, shuffle } from "./cards/deck.js";
import { isBlackjack, scoreHand } from "./cards/hand.js";
export { canTakeInsurance, insuranceCost, insuranceNet, winAmount } from "./betting/payouts.js";
export { validateBet, validateName, validateSetup } from "./betting/validation.js";
import { canTakeInsurance, insuranceCost, insuranceNet, winAmount } from "./betting/payouts.js";
import { validateBet, validateName, validateSetup } from "./betting/validation.js";
import { createPlayers } from "./game/players.js";
import { updateStatus } from "./game/status.js";
export { getActivePlayer } from "./game/turns.js";
import { advanceTurn } from "./game/turns.js";
import { draw, playDealer } from "./game/dealer.js";
export { settle } from "./game/settlement.js";

export function createGame(
  setup: GameSetup,
  options: GameOptions = {},
): GameState {
  validateSetup(setup);
  const players = createPlayers(setup, options);

  const state: GameState = {
    players,
    dealer: { hand: [], status: "playing" },
    deck: options.deck ? [...options.deck] : shuffle(createDecks(players.length), options.random),
    phase: "players",
    activePlayerIndex: 0,
    outcomes: {},
    initialDeckSize: options.deck?.length ?? deckCountForPlayers(players.length) * CARDS_PER_DECK,
    reshuffleCount: 0,
    enableEmergencyReshuffle: options.enableEmergencyReshuffle ?? !options.deck,
  };

  for (let cardNumber = 0; cardNumber < 2; cardNumber += 1) {
    for (const player of state.players) player.hand.push(draw(state));
    state.dealer.hand.push(draw(state));
  }
  for (const player of state.players) updateStatus(player);
  // An Ace up card pauses the round so players can take insurance before the dealer peeks.
  if (state.dealer.hand[0]?.rank === "A") {
    state.phase = "insurance";
    state.activePlayerIndex = null;
    return state;
  }
  peekAndStartTurns(state);
  return state;
}

/** Places insurance for the listed players, then lets the dealer peek and play continue. */
export function resolveInsurance(state: GameState, insuredPlayerIds: readonly string[]): GameState {
  if (state.phase !== "insurance") throw new Error("Insurance is not being offered.");
  const insured = insuredPlayerIds.map((id) => {
    const player = state.players.find((candidate) => candidate.id === id);
    if (!player) throw new Error(`Unknown player: ${id}.`);
    if (!canTakeInsurance(player)) throw new Error(`${player.name} cannot afford insurance.`);
    return player;
  });
  for (const player of insured) {
    player.insuranceBet = insuranceCost(player);
    player.chips -= player.insuranceBet;
  }
  state.phase = "players";
  peekAndStartTurns(state);
  return state;
}

function peekAndStartTurns(state: GameState): void {
  // US hole-card rule: the dealer peeks for a natural before anyone acts and, if it's there, the
  // round ends at once. A natural always shows an Ace or ten-value up card, so checking the hand
  // directly covers exactly the peek cases.
  if (isBlackjack(state.dealer.hand)) {
    state.dealer.status = "stood";
    settle(state);
    return;
  }
  state.activePlayerIndex = -1;
  advanceTurn(state, playDealer);
}

export function applyAction(state: GameState, playerId: string, action: Action): GameState {
  if (state.phase !== "players" || state.activePlayerIndex === null) {
    throw new Error("No player action is currently allowed.");
  }
  const player = state.players[state.activePlayerIndex];
  if (!player || player.id !== playerId) throw new Error("It is not that player's turn.");
  if (player.status !== "playing") throw new Error("That player cannot act.");

  if (action === "Hit") {
    player.hand.push(draw(state));
    updateStatus(player);
  } else if (action === "Stand") {
    player.status = "stood";
  } else {
    if (player.hand.length !== 2) {
      throw new Error("Double Down is only allowed on a player's initial two cards.");
    }
    if (player.chips < player.bet) {
      throw new Error("Doubling down would exceed the player's available funds.");
    }
    player.chips -= player.bet;
    player.bet *= 2;
    player.doubledDown = true;
    player.hand.push(draw(state));
    updateStatus(player);
    if (player.status === "playing") player.status = "stood";
  }

  if (player.status !== "playing") advanceTurn(state, playDealer);
  return state;
}

export function getPublicState(state: GameState): PublicGameState {
  const revealDealer = state.phase === "dealer" || state.phase === "complete";
  return {
    players: state.players.map((player) => ({ ...player, hand: [...player.hand], score: scoreHand(player.hand) })),
    dealer: {
      hand: state.dealer.hand.map((card, index) => (revealDealer || index === 0 ? card : null)),
      score: revealDealer ? scoreHand(state.dealer.hand) : null,
      status: state.dealer.status,
    },
    phase: state.phase,
    activePlayerId: getActivePlayer(state)?.id ?? null,
    outcomes: { ...state.outcomes },
  };
}
