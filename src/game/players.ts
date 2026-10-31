import { STARTING_CHIPS, STANDARD_BET } from "../domain/constants.js";
import type { GameOptions, GameSetup, Player, PlayerKind } from "../domain/types.js";
import { validateBet } from "../betting/validation.js";

export function createPlayers(setup: GameSetup, options: GameOptions): Player[] {
  const playerFromId = (id: string, name: string, kind: PlayerKind): Player => {
    const startingChips = options.chips?.[id] ?? STARTING_CHIPS;
    const bet = options.bets?.[id] ?? Math.min(STANDARD_BET, startingChips);
    validateBet(bet, startingChips);
    return {
      id, name, kind, hand: [], status: "playing", doubledDown: false,
      chips: startingChips - bet, bet, insuranceBet: 0,
    };
  };

  return [
    ...setup.humanNames.map((name, index) => playerFromId(`human-${index + 1}`, name.trim(), "human")),
    ...Array.from({ length: setup.aiCount }, (_, index) => playerFromId(`ai-${index + 1}`, `AI ${index + 1}`, "ai")),
  ];
}
