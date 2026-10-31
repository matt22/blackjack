import type { Card } from "../domain/types.js";

export function scoreHand(hand: readonly Card[]): number {
  let score = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") { score += 11; aces += 1; }
    else if (["J", "Q", "K"].includes(card.rank)) score += 10;
    else score += Number(card.rank);
  }
  while (score > 21 && aces > 0) { score -= 10; aces -= 1; }
  return score;
}

export function isBlackjack(hand: readonly Card[]): boolean {
  return hand.length === 2 && scoreHand(hand) === 21;
}
