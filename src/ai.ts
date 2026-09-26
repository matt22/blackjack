import { STANDARD_BET, scoreHand, type Action, type Card } from "./engine.js";

// A simplified basic strategy that reads the dealer's up card. This policy only
// receives visible cards, so it can be reused unchanged by a server-backed web game.
export function chooseAiAction(hand: readonly Card[], dealerUpCard: Card): Action {
  const score = scoreHand(hand);
  const upCard = cardValue(dealerUpCard);
  const dealerWeak = upCard >= 2 && upCard <= 6;

  if (hand.length === 2) {
    if (score === 11) return "Double Down";
    if (score === 10 && upCard <= 9) return "Double Down";
  }

  if (isSoft(hand)) {
    if (score >= 19) return "Stand";
    if (score === 18) return upCard <= 8 ? "Stand" : "Hit";
    return "Hit";
  }

  if (score >= 17) return "Stand";
  if (score >= 13) return dealerWeak ? "Stand" : "Hit";
  if (score === 12) return upCard >= 4 && upCard <= 6 ? "Stand" : "Hit";
  return "Hit";
}

/** Blackjack value of a single card, counting an ace as 11. */
function cardValue(card: Card): number {
  if (card.rank === "A") return 11;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  return Number(card.rank);
}

/** A hand is soft when one of its aces is still counted as 11. */
function isSoft(hand: readonly Card[]): boolean {
  const hardTotal = hand.reduce((total, card) => total + (card.rank === "A" ? 1 : cardValue(card)), 0);
  return hand.some((card) => card.rank === "A") && hardTotal + 10 === scoreHand(hand);
}

// AI players bet conservatively and never count cards: always the table's
// standard bet, or their whole stack if it's smaller than that.
export function chooseAiBet(chips: number): number {
  return Math.min(STANDARD_BET, chips);
}
