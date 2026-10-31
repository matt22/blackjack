import { isBlackjack, scoreHand } from "../cards/hand.js";
import type { GameState, Outcome } from "../domain/types.js";
import { winAmount } from "../betting/payouts.js";

export function settle(state: GameState): void {
  const dealerScore = scoreHand(state.dealer.hand);
  const dealerBust = dealerScore > 21;
  const dealerBlackjack = isBlackjack(state.dealer.hand);
  state.outcomes = Object.fromEntries(
    state.players.map((player) => {
      const playerScore = scoreHand(player.hand);
      let outcome: Outcome;
      if (playerScore > 21) outcome = "lose";
      else if (dealerBlackjack) outcome = isBlackjack(player.hand) ? "push" : "lose";
      else if (dealerBust || playerScore > dealerScore) outcome = "win";
      else if (isBlackjack(player.hand) && !dealerBlackjack) outcome = "win";
      else if (playerScore < dealerScore) outcome = "lose";
      else outcome = "push";
      if (outcome === "win") player.chips += player.bet + winAmount(player);
      else if (outcome === "push") player.chips += player.bet;
      if (dealerBlackjack) player.chips += player.insuranceBet * 3;
      return [player.id, outcome];
    }),
  );
  state.phase = "complete";
  state.activePlayerIndex = null;
}
