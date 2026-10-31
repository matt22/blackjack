import { RANKS, SUITS } from "./constants.js";

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type PlayerKind = "human" | "ai";
export type PlayerStatus = "playing" | "stood" | "busted";
export type RoundPhase = "insurance" | "players" | "dealer" | "complete";
export type Outcome = "win" | "lose" | "push";
export type Action = "Hit" | "Stand" | "Double Down";

export interface Card { rank: Rank; suit: Suit }
export interface Player {
  id: string; name: string; kind: PlayerKind; hand: Card[]; status: PlayerStatus;
  doubledDown: boolean; chips: number; bet: number; insuranceBet: number;
}
export interface Dealer { hand: Card[]; status: PlayerStatus }
export interface GameState {
  players: Player[]; dealer: Dealer; deck: Card[]; phase: RoundPhase;
  activePlayerIndex: number | null; outcomes: Record<string, Outcome>;
  initialDeckSize: number; reshuffleCount: number; enableEmergencyReshuffle: boolean;
}
export interface PublicDealer { hand: Array<Card | null>; score: number | null; status: PlayerStatus }
export interface PublicGameState {
  players: Array<Player & { score: number }>; dealer: PublicDealer; phase: RoundPhase;
  activePlayerId: string | null; outcomes: Record<string, Outcome>;
}
export interface GameSetup { humanNames: string[]; aiCount: number }
export interface GameOptions {
  random?: () => number; deck?: Card[]; enableEmergencyReshuffle?: boolean;
  chips?: Record<string, number>; bets?: Record<string, number>;
}
