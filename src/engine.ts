export const MAX_HUMAN_PLAYERS = 2;
export const MAX_AI_PLAYERS = 3;
export const MAX_PLAYERS = 5;
export const MAX_NAME_LENGTH = 25;
export const CARDS_PER_DECK = 52;
export const MID_ROUND_RESHUFFLE_THRESHOLD = 20;

export const SUITS = ["Clubs", "Diamonds", "Hearts", "Spades"] as const;
export const RANKS = [
  "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A",
] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type PlayerKind = "human" | "ai";
export type PlayerStatus = "playing" | "stood" | "busted";
export type RoundPhase = "players" | "dealer" | "complete";
export type Outcome = "win" | "lose" | "push";
export type Action = "Hit" | "Stand" | "Double Down";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface Player {
  id: string;
  name: string;
  kind: PlayerKind;
  hand: Card[];
  status: PlayerStatus;
  doubledDown: boolean;
}

export interface Dealer {
  hand: Card[];
  status: PlayerStatus;
}

export interface GameState {
  players: Player[];
  dealer: Dealer;
  deck: Card[];
  phase: RoundPhase;
  activePlayerIndex: number | null;
  outcomes: Record<string, Outcome>;
  initialDeckSize: number;
  reshuffleCount: number;
  enableEmergencyReshuffle: boolean;
}

export interface PublicDealer {
  hand: Array<Card | null>;
  score: number | null;
  status: PlayerStatus;
}

export interface PublicGameState {
  players: Array<Player & { score: number }>;
  dealer: PublicDealer;
  phase: RoundPhase;
  activePlayerId: string | null;
  outcomes: Record<string, Outcome>;
}

export interface GameSetup {
  humanNames: string[];
  aiCount: number;
}

export interface GameOptions {
  random?: () => number;
  deck?: Card[];
  enableEmergencyReshuffle?: boolean;
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

export function deckCountForPlayers(nonDealerPlayers: number): number {
  return Math.max(1, Math.ceil(nonDealerPlayers / 2) + 1);
}

function createDecks(nonDealerPlayers: number): Card[] {
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

export function scoreHand(hand: readonly Card[]): number {
  let score = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === "A") {
      score += 11;
      aces += 1;
    } else if (["J", "Q", "K"].includes(card.rank)) {
      score += 10;
    } else {
      score += Number(card.rank);
    }
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
}

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

export function validateName(name: string): void {
  if (name.trim().length === 0) throw new Error("Player name cannot be empty.");
  if ([...name.trim()].length > MAX_NAME_LENGTH) {
    throw new Error(`Player name cannot exceed ${MAX_NAME_LENGTH} characters.`);
  }
}

function draw(state: GameState): Card {
  if (state.deck.length === 0 || (state.enableEmergencyReshuffle && state.deck.length <= MID_ROUND_RESHUFFLE_THRESHOLD)) {
    state.deck = shuffle(createDecks(state.players.length));
    state.reshuffleCount += 1;
  }
  const card = state.deck.pop();
  if (!card) throw new Error("The deck is empty.");
  return card;
}

function updateStatus(player: Player): void {
  const score = scoreHand(player.hand);
  if (score > 21) player.status = "busted";
  else if (score === 21) player.status = "stood";
}

function settle(state: GameState): void {
  const dealerScore = scoreHand(state.dealer.hand);
  const dealerBust = dealerScore > 21;
  state.outcomes = Object.fromEntries(
    state.players.map((player) => {
      const playerScore = scoreHand(player.hand);
      let outcome: Outcome;
      if (playerScore > 21) outcome = "lose";
      else if (dealerBust || playerScore > dealerScore) outcome = "win";
      else if (playerScore < dealerScore) outcome = "lose";
      else outcome = "push";
      return [player.id, outcome];
    }),
  );
  state.phase = "complete";
  state.activePlayerIndex = null;
}

function playDealer(state: GameState): void {
  state.phase = "dealer";
  while (scoreHand(state.dealer.hand) < 17) state.dealer.hand.push(draw(state));
  state.dealer.status = scoreHand(state.dealer.hand) > 21 ? "busted" : "stood";
  settle(state);
}

function advanceTurn(state: GameState): void {
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

export function createGame(
  setup: GameSetup,
  options: GameOptions = {},
): GameState {
  validateSetup(setup);
  const players: Player[] = [
    ...setup.humanNames.map((name, index) => ({
      id: `human-${index + 1}`,
      name: name.trim(),
      kind: "human" as const,
      hand: [],
      status: "playing" as const,
      doubledDown: false,
    })),
    ...Array.from({ length: setup.aiCount }, (_, index) => ({
      id: `ai-${index + 1}`,
      name: `AI ${index + 1}`,
      kind: "ai" as const,
      hand: [],
      status: "playing" as const,
      doubledDown: false,
    })),
  ];

  const state: GameState = {
    players,
    dealer: { hand: [], status: "playing" },
    deck: options.deck ? [...options.deck] : shuffle(createDecks(players.length), options.random),
    phase: "players",
    activePlayerIndex: 0,
    outcomes: {},
    initialDeckSize: options.deck?.length ?? deckCountForPlayers(players.length) * CARDS_PER_DECK,
    reshuffleCount: 0,
    enableEmergencyReshuffle: options.enableEmergencyReshuffle ?? !options.deck,
  };

  for (let cardNumber = 0; cardNumber < 2; cardNumber += 1) {
    for (const player of state.players) player.hand.push(draw(state));
    state.dealer.hand.push(draw(state));
  }
  for (const player of state.players) updateStatus(player);
  if (state.players[0]?.status !== "playing") {
    state.activePlayerIndex = -1;
    advanceTurn(state);
  }
  return state;
}

export function applyAction(state: GameState, playerId: string, action: Action): GameState {
  if (state.phase !== "players" || state.activePlayerIndex === null) {
    throw new Error("No player action is currently allowed.");
  }
  const player = state.players[state.activePlayerIndex];
  if (!player || player.id !== playerId) throw new Error("It is not that player's turn.");
  if (player.status !== "playing") throw new Error("That player cannot act.");

  if (action === "Hit") {
    player.hand.push(draw(state));
    updateStatus(player);
  } else if (action === "Stand") {
    player.status = "stood";
  } else {
    if (player.hand.length !== 2) {
      throw new Error("Double Down is only allowed on a player's initial two cards.");
    }
    player.doubledDown = true;
    player.hand.push(draw(state));
    updateStatus(player);
    if (player.status === "playing") player.status = "stood";
  }

  if (player.status !== "playing") advanceTurn(state);
  return state;
}

export function getActivePlayer(state: GameState): Player | null {
  return state.activePlayerIndex === null ? null : (state.players[state.activePlayerIndex] ?? null);
}

export function getPublicState(state: GameState): PublicGameState {
  const revealDealer = state.phase !== "players";
  return {
    players: state.players.map((player) => ({ ...player, hand: [...player.hand], score: scoreHand(player.hand) })),
    dealer: {
      hand: state.dealer.hand.map((card, index) => (revealDealer || index === 0 ? card : null)),
      score: revealDealer ? scoreHand(state.dealer.hand) : null,
      status: state.dealer.status,
    },
    phase: state.phase,
    activePlayerId: getActivePlayer(state)?.id ?? null,
    outcomes: { ...state.outcomes },
  };
}
