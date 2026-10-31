import { MAX_AI_PLAYERS, MAX_HUMAN_PLAYERS, MAX_NAME_LENGTH, MAX_PLAYERS } from "../domain/constants.js";
import type { GameSetup } from "../domain/types.js";

export function validateSetup(setup: GameSetup): void {
  if (!Number.isInteger(setup.aiCount) || setup.aiCount < 0 || setup.aiCount > MAX_AI_PLAYERS) {
    throw new Error(`AI player count must be between 0 and ${MAX_AI_PLAYERS}.`);
  }
  if (setup.humanNames.length < 1 || setup.humanNames.length > MAX_HUMAN_PLAYERS) {
    throw new Error(`Human player count must be between 1 and ${MAX_HUMAN_PLAYERS}.`);
  }
  if (setup.humanNames.length + setup.aiCount > MAX_PLAYERS) {
    throw new Error(`A game can have at most ${MAX_PLAYERS} players.`);
  }
  for (const name of setup.humanNames) validateName(name);
}

export function validateBet(bet: number, availableChips: number): void {
  if (!Number.isInteger(bet)) throw new Error("Bet must be a whole number.");
  if (availableChips === 0) {
    if (bet !== 0) throw new Error("No chips available to bet.");
    return;
  }
  if (bet <= 0) throw new Error("Bet must be greater than zero.");
  if (bet > availableChips) throw new Error("Bet cannot exceed available chips.");
}

export function validateName(name: string): void {
  if (name.trim().length === 0) throw new Error("Player name cannot be empty.");
  if ([...name.trim()].length > MAX_NAME_LENGTH) {
    throw new Error(`Player name cannot exceed ${MAX_NAME_LENGTH} characters.`);
  }
}
