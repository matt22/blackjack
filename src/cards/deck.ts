import { CARDS_PER_DECK, RANKS, SUITS } from "../domain/constants.js";
import type { Card } from "../domain/types.js";

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

export function deckCountForPlayers(nonDealerPlayers: number): number {
  return Math.max(1, Math.ceil(nonDealerPlayers / 2) + 1);
}

export function createDecks(nonDealerPlayers: number): Card[] {
  return Array.from({ length: deckCountForPlayers(nonDealerPlayers) }, () => createDeck()).flat();
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current === undefined || swap === undefined) throw new Error("Invalid shuffle index");
    result[index] = swap;
    result[swapIndex] = current;
  }
  return result;
}

export const cardsPerDeck = CARDS_PER_DECK;
