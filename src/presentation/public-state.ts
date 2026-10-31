import { scoreHand } from "../cards/hand.js";
import type { GameState, PublicGameState } from "../domain/types.js";
import { getActivePlayer } from "../game/turns.js";

export function getPublicState(state: GameState): PublicGameState {
  const revealDealer = state.phase === "dealer" || state.phase === "complete";
  return {
    players: state.players.map((player) => ({ ...player, hand: [...player.hand], score: scoreHand(player.hand) })),
    dealer: {
      hand: state.dealer.hand.map((card, index) => (revealDealer || index === 0 ? card : null)),
      score: revealDealer ? scoreHand(state.dealer.hand) : null, status: state.dealer.status,
    },
    phase: state.phase, activePlayerId: getActivePlayer(state)?.id ?? null,
    outcomes: { ...state.outcomes },
  };
}
