import type { GameState, Player } from "../domain/types.js";

export type DealerTurn = (state: GameState) => void;

export function advanceTurn(state: GameState, playDealer: DealerTurn): void {
  const start = (state.activePlayerIndex ?? -1) + 1;
  for (let index = start; index < state.players.length; index += 1) {
    if (state.players[index]?.status === "playing") {
      state.activePlayerIndex = index;
      return;
    }
  }
  state.activePlayerIndex = null;
  playDealer(state);
}

export function getActivePlayer(state: GameState): Player | null {
  return state.activePlayerIndex === null ? null : (state.players[state.activePlayerIndex] ?? null);
}
