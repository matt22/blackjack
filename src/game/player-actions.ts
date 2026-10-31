import type { Action, GameState } from "../domain/types.js";
import { advanceTurn } from "./turns.js";
import { draw, playDealer } from "./dealer.js";
import { updateStatus } from "./status.js";

export function applyAction(state: GameState, playerId: string, action: Action): GameState {
  if (state.phase !== "players" || state.activePlayerIndex === null) throw new Error("No player action is currently allowed.");
  const player = state.players[state.activePlayerIndex];
  if (!player || player.id !== playerId) throw new Error("It is not that player's turn.");
  if (player.status !== "playing") throw new Error("That player cannot act.");
  if (action === "Hit") { player.hand.push(draw(state)); updateStatus(player); }
  else if (action === "Stand") player.status = "stood";
  else {
    if (player.hand.length !== 2) throw new Error("Double Down is only allowed on a player's initial two cards.");
    if (player.chips < player.bet) throw new Error("Doubling down would exceed the player's available funds.");
    player.chips -= player.bet; player.bet *= 2; player.doubledDown = true;
    player.hand.push(draw(state)); updateStatus(player);
    if (player.status === "playing") player.status = "stood";
  }
  if (player.status !== "playing") advanceTurn(state, playDealer);
  return state;
}
