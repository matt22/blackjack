import type { GameState } from "../domain/types.js";
import { canTakeInsurance, insuranceCost } from "../betting/payouts.js";
import { isBlackjack } from "../cards/hand.js";
import { advanceTurn } from "./turns.js";
import { playDealer } from "./dealer.js";
import { settle } from "./settlement.js";

export function resolveInsurance(state: GameState, insuredPlayerIds: readonly string[]): GameState {
  if (state.phase !== "insurance") throw new Error("Insurance is not being offered.");
  const insured = insuredPlayerIds.map((id) => {
    const player = state.players.find((candidate) => candidate.id === id);
    if (!player) throw new Error(`Unknown player: ${id}.`);
    if (!canTakeInsurance(player)) throw new Error(`${player.name} cannot afford insurance.`);
    return player;
  });
  for (const player of insured) {
    player.insuranceBet = insuranceCost(player); player.chips -= player.insuranceBet;
  }
  state.phase = "players";
  if (isBlackjack(state.dealer.hand)) { state.dealer.status = "stood"; settle(state); }
  else { state.activePlayerIndex = -1; advanceTurn(state, playDealer); }
  return state;
}
