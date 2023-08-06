#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chooseAiAction } from "./ai.js";
import {
  MAX_NAME_LENGTH,
  applyAction,
  createGame,
  getActivePlayer,
  getPublicState,
  scoreHand,
  validateName,
  type Action,
  type Card,
  type GameState,
  type Outcome,
} from "./engine.js";
import { createStandings, recordRound, type Standing } from "./standings.js";

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  Clubs: "♣",
  Diamonds: "♦",
  Hearts: "♥",
  Spades: "♠",
};

const ANSI = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function paint(text: string, color: string): string {
  return output.isTTY ? `${color}${text}${ANSI.reset}` : text;
}

function cardText(card: Card | null): string {
  return card ? `${card.rank}${SUIT_SYMBOL[card.suit]}` : "??";
}

function handText(hand: readonly (Card | null)[]): string {
  return hand.map(cardText).join(" ");
}

function outcomeText(outcome: Outcome): string {
  if (outcome === "win") return paint("Win 🏆", ANSI.green);
  if (outcome === "lose") return paint("Loss ☠️", ANSI.red);
  return paint("Push ⚖️", ANSI.yellow);
}

function divider(title: string): string {
  return paint(`╭─ ${title} ${"─".repeat(Math.max(1, 56 - title.length))}`, ANSI.cyan);
}

function showTable(state: GameState, title = "🎴 TABLE"): void {
  const view = getPublicState(state);
  const dealerScore = view.dealer.score === null ? "hidden" : String(view.dealer.score);
  const isComplete = state.phase === "complete";
  const dealerStatus = isComplete && state.dealer.status === "busted" ? " 💀 BUST" : "";
  const seats = [
    paint(`🎩 Dealer  ${handText(view.dealer.hand)} (${dealerScore})${dealerStatus}`, ANSI.yellow),
    ...view.players.map((player) => {
      const outcome = state.outcomes[player.id];
      const status = player.status === "busted" ? " 💀 BUST" : "";
      const result = isComplete && outcome && player.status !== "busted" ? ` · ${outcomeText(outcome)}` : "";
      const row = `${player.kind === "ai" ? "🤖" : "👤"} ${player.name}  ${handText(player.hand)} (${player.score})${status}${result}`;
      return player.status === "busted" ? paint(row, ANSI.red) : row;
    }),
  ];
  output.write(`\n${divider(title)}\n${seats.map((seat) => `│ ${seat}`).join("\n")}\n╰${"─".repeat(58)}\n`);
}

function showStandings(standings: readonly Standing[], round: number): void {
  const nameWidth = Math.max(12, ...standings.map((standing) => [...standing.name].length + 3));
  const rows = standings.map((standing) => {
    const icon = standing.id === "dealer" ? "🎩" : standing.id.startsWith("ai-") ? "🤖" : "👤";
    return `│ ${(icon + " " + standing.name).padEnd(nameWidth)} ${String(standing.wins).padStart(2)}  ${String(standing.losses).padStart(2)}  ${String(standing.pushes).padStart(2)}`;
  });
  output.write(`\n${divider(`📊 STANDINGS · AFTER ROUND ${round}`)}\n│ ${"PLAYER".padEnd(nameWidth)}  W   L   P\n│ ${"─".repeat(nameWidth + 11)}\n${rows.join("\n")}\n╰${"─".repeat(nameWidth + 11)}\n`);
}

function showDraw(player: GameState["players"][number], label = "drew"): void {
  const card = player.hand.at(-1);
  if (!card) throw new Error(`${player.name} has no drawn card.`);
  const bust = player.status === "busted" ? " 💀 BUST" : "";
  output.write(`\n${paint("🃏", ANSI.magenta)} ${player.name} ${label} ${cardText(card)} · Hand: ${handText(player.hand)} (${scoreHand(player.hand)})${paint(bust, ANSI.red)}\n`);
}

function showReshuffles(state: GameState, previousCount: number): void {
  if (state.reshuffleCount > previousCount) {
      output.write(`\n${paint("🔄 The deck has been reshuffled.", ANSI.yellow)}\n`);
  }
}

async function askInteger(prompt: string, minimum: number, maximum: number): Promise<number> {
  while (true) {
    const value = Number.parseInt((await rl.question(prompt)).trim(), 10);
    if (Number.isInteger(value) && value >= minimum && value <= maximum) return value;
    output.write(`Please enter a number from ${minimum} to ${maximum}.\n`);
  }
}

async function askName(number: number): Promise<string> {
  while (true) {
    const name = await rl.question(`Name for human player ${number} (max ${MAX_NAME_LENGTH} characters): `);
    try {
      validateName(name);
      return name.trim();
    } catch (error) {
      output.write(`${(error as Error).message}\n`);
    }
  }
}

async function playRound(
  humanNames: string[],
  aiCount: number,
  round: number,
  standings: Standing[],
  deck?: Card[],
): Promise<GameState> {
  const state = createGame(
    { humanNames, aiCount },
    deck ? { deck, enableEmergencyReshuffle: true } : undefined,
  );
  if (state.reshuffleCount > 0) output.write("\n🔄 The deck has been reshuffled.\n");
  showTable(state, `🎴 ROUND ${round} · CARDS DEALT`);

  while (state.phase === "players") {
    const player = getActivePlayer(state);
    if (!player) break;

    if (player.kind === "ai") {
      const actions = new Map<string, Action[]>();
      while (state.phase === "players") {
        const aiPlayer = getActivePlayer(state);
        if (!aiPlayer || aiPlayer.kind !== "ai") break;
        const upCard = state.dealer.hand[0];
        if (!upCard) throw new Error("Dealer has no up card.");
        const action = chooseAiAction(aiPlayer.hand, upCard);
        const playerActions = actions.get(aiPlayer.name) ?? [];
        playerActions.push(action);
        actions.set(aiPlayer.name, playerActions);
        const previousReshuffleCount = state.reshuffleCount;
        applyAction(state, aiPlayer.id, action);
        showReshuffles(state, previousReshuffleCount);
      }
      const summary = [...actions]
        .map(([name, playerActions]) => `${name}: ${playerActions.join(" → ")}`)
        .join("  |  ");
      output.write(`\nAI actions: ${summary}\n`);
      continue;
    }

    const canDoubleDown = player.hand.length === 2;
    const choices = canDoubleDown ? "[H]it, [S]tand, or [D]ouble Down? " : "[H]it or [S]tand? ";
    const answer = (await rl.question(`\n${player.name}, ${choices}`)).trim().toLowerCase();
    if (answer === "h" || answer === "hit") {
      const previousReshuffleCount = state.reshuffleCount;
      applyAction(state, player.id, "Hit");
      showDraw(player);
      showReshuffles(state, previousReshuffleCount);
    } else if (answer === "s" || answer === "stand") {
      applyAction(state, player.id, "Stand");
    } else if (canDoubleDown && ["d", "double", "double down"].includes(answer)) {
      const previousReshuffleCount = state.reshuffleCount;
      applyAction(state, player.id, "Double Down");
      showDraw(player, "doubled down and drew");
      showReshuffles(state, previousReshuffleCount);
    } else {
      output.write(`Please enter ${canDoubleDown ? "H, S, or D" : "H or S"}.\n`);
    }
  }

  showTable(state, `🎴 ROUND ${round} · TABLE UPDATE`);
  recordRound(standings, state);
  showStandings(standings, round);
  return state;
}

const rl = createInterface({ input, output });

async function main(): Promise<void> {
  output.write("♠ Blackjack ♠\n\nHit, stand, or double down. Closest to 21 without going over wins.\n\n");
  const humanCount = await askInteger("Number of human players (1-2): ", 1, 2);
  const humanNames: string[] = [];
  for (let index = 1; index <= humanCount; index += 1) humanNames.push(await askName(index));
  const aiCount = await askInteger("Number of AI players (0-3): ", 0, 3);
  const initialState = createGame({ humanNames, aiCount });
  output.write(`\n🎴 Starting deck count: ${initialState.initialDeckSize / 52} (${initialState.initialDeckSize} cards).\n`);

  let playAgain = true;
  let round = 1;
  const standings = createStandings(initialState);
  let deck: Card[] | undefined;
  while (playAgain) {
    const state = await playRound(humanNames, aiCount, round, standings, deck);
    deck = state.deck;
    const lowShoeThreshold = (humanNames.length + aiCount + 1) * 6;
    if (deck.length < lowShoeThreshold) {
      output.write("\n🔄 The shoe is low; it will be reshuffled before the next round.\n");
      deck = undefined;
    }
    const answer = (await rl.question("\nPlay another round? [y/N] ")).trim().toLowerCase();
    playAgain = answer === "y" || answer === "yes";
    round += 1;
  }
  output.write("\nThanks for playing!\n");
}

main()
  .catch((error: unknown) => {
    output.write(`\nError: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
