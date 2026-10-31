import { isBlackjack } from "../cards/hand.js";
import type { Card, Player } from "../domain/types.js";

export function insuranceCost(player: Pick<Player, "bet">): number {
  return Math.floor(player.bet / 2);
}

export function canTakeInsurance(player: Pick<Player, "bet" | "chips">): boolean {
  const cost = insuranceCost(player);
  return cost > 0 && player.chips >= cost;
}

export function insuranceNet(player: Pick<Player, "insuranceBet">, dealerHand: readonly Card[]): number {
  return isBlackjack(dealerHand) ? player.insuranceBet * 2 : -player.insuranceBet;
}

export function winAmount(player: Pick<Player, "hand" | "bet">): number {
  return isBlackjack(player.hand) ? Math.floor((player.bet * 3) / 2) : player.bet;
}
