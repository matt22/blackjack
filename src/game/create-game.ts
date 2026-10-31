import { createDecks, deckCountForPlayers, shuffle } from "../cards/deck.js";
import { isBlackjack } from "../cards/hand.js";
import { CARDS_PER_DECK } from "../domain/constants.js";
import type { GameOptions, GameSetup, GameState } from "../domain/types.js";
import { validateSetup } from "../betting/validation.js";
import { createPlayers } from "./players.js";
import { updateStatus } from "./status.js";
import { advanceTurn } from "./turns.js";
import { draw, playDealer } from "./dealer.js";
import { settle } from "./settlement.js";

export function createGame(setup: GameSetup, options: GameOptions = {}): GameState {
  validateSetup(setup);
  const players = createPlayers(setup, options);
  const state: GameState = {
    players, dealer: { hand: [], status: "playing" },
    deck: options.deck ? [...options.deck] : shuffle(createDecks(players.length), options.random),
    phase: "players", activePlayerIndex: 0, outcomes: {},
    initialDeckSize: options.deck?.length ?? deckCountForPlayers(players.length) * CARDS_PER_DECK,
    reshuffleCount: 0, enableEmergencyReshuffle: options.enableEmergencyReshuffle ?? !options.deck,
  };
  for (let cardNumber = 0; cardNumber < 2; cardNumber += 1) {
    for (const player of state.players) player.hand.push(draw(state));
    state.dealer.hand.push(draw(state));
  }
  for (const player of state.players) updateStatus(player);
  if (state.dealer.hand[0]?.rank === "A") {
    state.phase = "insurance"; state.activePlayerIndex = null; return state;
  }
  peekAndStartTurns(state);
  return state;
}

function peekAndStartTurns(state: GameState): void {
  if (isBlackjack(state.dealer.hand)) {
    state.dealer.status = "stood"; settle(state); return;
  }
  state.activePlayerIndex = -1;
  advanceTurn(state, playDealer);
}
