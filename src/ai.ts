import { STANDARD_BET, scoreHand, type Action, type Card } from "./engine.js";

// Deliberately simple for the vanilla first release. This policy only receives
// visible cards, so it can be reused unchanged by a server-backed web game.
export function chooseAiAction(hand: readonly Card[], dealerUpCard: Card): Action {
  void dealerUpCard;
  if (hand.length === 2 && scoreHand(hand) === 11) return "Double Down";
  return scoreHand(hand) < 17 ? "Hit" : "Stand";
}

// AI players bet conservatively and never count cards: always the table's
// standard bet, or their whole stack if it's smaller than that.
export function chooseAiBet(chips: number): number {
  return Math.min(STANDARD_BET, chips);
}
