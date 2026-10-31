import { createDecks, shuffle } from "../cards/deck.js";
import { scoreHand } from "../cards/hand.js";
import { MID_ROUND_RESHUFFLE_THRESHOLD } from "../domain/constants.js";
import type { Card, GameState } from "../domain/types.js";
import { settle } from "./settlement.js";

export function draw(state: GameState): Card {
  if (state.deck.length === 0 || (state.enableEmergencyReshuffle && state.deck.length <= MID_ROUND_RESHUFFLE_THRESHOLD)) {
    state.deck = shuffle(createDecks(state.players.length));
    state.reshuffleCount += 1;
  }
  const card = state.deck.pop();
  if (!card) throw new Error("The deck is empty.");
  return card;
}

export function playDealer(state: GameState): void {
  state.phase = "dealer";
  while (scoreHand(state.dealer.hand) < 17) state.dealer.hand.push(draw(state));
  state.dealer.status = scoreHand(state.dealer.hand) > 21 ? "busted" : "stood";
  settle(state);
}
