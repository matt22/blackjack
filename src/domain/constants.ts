export const MAX_HUMAN_PLAYERS = 2;
export const MAX_AI_PLAYERS = 3;
export const MAX_PLAYERS = 5;
export const MAX_NAME_LENGTH = 15;
export const CARDS_PER_DECK = 52;
export const MID_ROUND_RESHUFFLE_THRESHOLD = 20;
export const STARTING_CHIPS = 1000;
export const STANDARD_BET = 100;

export const SUITS = ["Clubs", "Diamonds", "Hearts", "Spades"] as const;
export const RANKS = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
] as const;
