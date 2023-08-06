import { scoreHand, type Action, type Card } from "./engine.js";

// Deliberately simple for the vanilla first release. This policy only receives
// visible cards, so it can be reused unchanged by a server-backed web game.
export function chooseAiAction(hand: readonly Card[], dealerUpCard: Card): Action {
  void dealerUpCard;
  if (hand.length === 2 && scoreHand(hand) === 11) return "Double Down";
  return scoreHand(hand) < 17 ? "Hit" : "Stand";
}
