import { scoreHand } from "../cards/hand.js";
import type { Player } from "../domain/types.js";

export function updateStatus(player: Player): void {
  const score = scoreHand(player.hand);
  if (score > 21) player.status = "busted";
  else if (score === 21) player.status = "stood";
}
