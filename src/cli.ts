#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chooseAiAction, chooseAiBet } from "./ai.js";
import {
  MAX_NAME_LENGTH,
  STANDARD_BET,
  STARTING_CHIPS,
  applyAction,
  createGame,
  getActivePlayer,
  getPublicState,
  scoreHand,
  validateBet,
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

// Ranks are 1 character wide except "10" — right-padding to width 2 keeps every suit
// symbol flush at the same column, so a 2 and a 10 line up. The hidden-card placeholder
// gets the same 1-char-rank shape (" ??") so it doesn't sit 1 column off from real cards.
function tableCardText(card: Card | null): string {
  return card ? `${card.rank.padStart(2)}${SUIT_SYMBOL[card.suit]}` : " ??";
}

function tableCardCells(hand: readonly (Card | null)[], columnCount: number): string[] {
  const cells = hand.map(tableCardText);
  while (cells.length < columnCount) cells.push("");
  return cells;
}

// "Loss", "Push", and "Bust" are all 4 letters; "Win" and "Bet" pad up to match so every
// result's trailing emoji lands in the same column instead of trailing the shorter words.
const RESULT_WORD_WIDTH = 4;

interface ResultInfo {
  word: string;
  emoji: string;
  sign: "+" | "-" | "";
  digits: string;
  color: string | null;
}

function outcomeInfo(outcome: Outcome, bet: number): ResultInfo {
  if (outcome === "win") return { word: "Win", emoji: "🏆", sign: "+", digits: String(bet), color: ANSI.green };
  if (outcome === "lose") return { word: "Loss", emoji: "☠️", sign: "-", digits: String(bet), color: ANSI.red };
  return { word: "Push", emoji: "⚖️", sign: "", digits: "0", color: ANSI.yellow };
}

/** Renders a result word (padded flush with its emoji) and a sign+$+digits amount, so both stay column-aligned across rows. */
function formatResult(info: ResultInfo, digitWidth: number): { result: string; amount: string } {
  const result = info.emoji ? `${info.word.padEnd(RESULT_WORD_WIDTH)} ${info.emoji}` : info.word;
  const amount = `${info.sign || " "}$${info.digits.padStart(digitWidth)}`;
  return { result, amount };
}

/** Formats a running total as sign+$+digits, e.g. for the dealer's money that can go negative. */
function formatSignedAmount(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : " ";
  return `${sign}$${Math.abs(amount)}`;
}

/** Formats a money standing, e.g. for the final money ranking. Only negative amounts (the dealer's) get a sign. */
function formatMoney(amount: number): string {
  return amount < 0 ? `-$${Math.abs(amount)}` : `$${amount}`;
}

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
// U+FE0F (variation selector-16) forces emoji-style rendering but occupies no column of its
// own — counting it would overstate a line's true width by 1 for every icon it contains.
const VS16_PATTERN = /️/g;

/** Length as it will actually appear in the terminal, ignoring invisible ANSI color codes and VS16. */
function visibleLength(text: string): number {
  return text.replace(ANSI_PATTERN, "").replace(VS16_PATTERN, "").length;
}

/** Top border of a box, sized so its total width matches `innerWidth` (the content width after "│ "). */
function divider(title: string, innerWidth: number): string {
  const dashCount = Math.max(1, innerWidth - visibleLength(title) - 2);
  return paint(`╭─ ${title} ${"─".repeat(dashCount)}`, ANSI.cyan);
}

// The trailing U+FE0F forces wide emoji-style rendering, so every icon occupies a consistent
// column width across terminals — without it, some fonts render 🎩 narrower than 🤖 or 👤,
// throwing off the padding-based alignment of the columns that follow.
function playerIcon(kind: "dealer" | "human" | "ai"): string {
  const icon = kind === "dealer" ? "🎩" : kind === "ai" ? "🤖" : "👤";
  return `${icon}️`;
}

function showTable(state: GameState, title = "🎴 TABLE"): void {
  const view = getPublicState(state);
  const dealerScore = view.dealer.score === null ? "hidden" : String(view.dealer.score);
  const isComplete = state.phase === "complete";
  const dealerBusted = isComplete && state.dealer.status === "busted";
  const seatedPlayers = view.players.filter((player) => player.bet > 0);
  const sittingOut = view.players.filter((player) => player.bet === 0);

  const cardColumns = Math.max(2, view.dealer.hand.length, ...seatedPlayers.map((player) => player.hand.length));

  const playerResults: ResultInfo[] = seatedPlayers.map((player) => {
    const outcome = state.outcomes[player.id];
    if (player.status === "busted") {
      return { word: "Bust", emoji: "💀", sign: "-", digits: String(player.bet), color: null };
    }
    if (isComplete && outcome) return outcomeInfo(outcome, player.bet);
    return { word: "Bet", emoji: "", sign: "", digits: String(player.bet), color: null };
  });
  const digitWidth = Math.max(1, ...playerResults.map((info) => info.digits.length));

  // The dealer holds no chips of their own; their win/loss is simply the mirror image of what
  // the seated players won or lost this round.
  const dealerNet = -seatedPlayers.reduce((total, player) => {
    const outcome = state.outcomes[player.id];
    if (outcome === "win") return total + player.bet;
    if (outcome === "lose") return total - player.bet;
    return total;
  }, 0);

  const dealerRow = [
    `${playerIcon("dealer")} Dealer`,
    ...tableCardCells(view.dealer.hand, cardColumns),
    `(${dealerScore})`,
    dealerBusted ? formatResult({ word: "Bust", emoji: "💀", sign: "", digits: "", color: null }, 0).result : "",
    isComplete ? formatSignedAmount(dealerNet) : "",
    "",
  ].map((cell) => paint(cell, ANSI.yellow));

  const playerRows = seatedPlayers.map((player, index) => {
    const info = playerResults[index];
    if (!info) throw new Error(`Missing result info for ${player.name}.`);
    const busted = player.status === "busted";
    const { result, amount } = formatResult(info, digitWidth);
    const cells = [
      `${playerIcon(player.kind === "ai" ? "ai" : "human")} ${player.name}`,
      ...tableCardCells(player.hand, cardColumns),
      `(${player.score})`,
      info.color ? paint(result, info.color) : result,
      info.color ? paint(amount, info.color) : amount,
      `💰$${player.chips}`,
    ];
    return busted ? cells.map((cell) => paint(cell, ANSI.red)) : cells;
  });

  const cardHeaders = ["HAND", ...Array(cardColumns - 1).fill("")];
  const cardAligns: Align[] = Array(cardColumns).fill("left");
  const lines = buildBox(
    title,
    ["PLAYER", ...cardHeaders, "SCORE", "RESULT", "AMOUNT", "CHIPS"],
    ["left", ...cardAligns, "right", "left", "right", "left"],
    [dealerRow, ...playerRows],
  );
  if (sittingOut.length > 0) {
    const names = sittingOut.map((player) => player.name).join(", ");
    lines.splice(lines.length - 1, 0, `│ ${paint(`🚪 Sitting out: ${names}`, ANSI.gray)}`);
  }
  output.write(`\n${lines.join("\n")}\n`);
}

function standingIcon(standing: Pick<Standing, "id">): string {
  return playerIcon(standing.id === "dealer" ? "dealer" : standing.id.startsWith("ai-") ? "ai" : "human");
}

type Align = "left" | "right";

function padCell(text: string, width: number, align: Align): string {
  const gap = " ".repeat(Math.max(0, width - visibleLength(text)));
  return align === "right" ? `${gap}${text}` : `${text}${gap}`;
}

/** Builds a bordered box whose column widths, and therefore total width, follow the widest header or cell in each column. */
function buildBox(title: string, headers: string[], aligns: Align[], rows: string[][]): string[] {
  const widths = headers.map((header, col) =>
    Math.max(visibleLength(header), ...rows.map((row) => visibleLength(row[col] ?? ""))),
  );
  const formatRow = (cells: string[]) =>
    `│ ${cells.map((cell, col) => padCell(cell, widths[col] ?? 0, aligns[col] ?? "left")).join("  ")}`;
  const headerLine = formatRow(headers);
  const innerWidth = visibleLength(headerLine) - 2;
  return [
    divider(title, innerWidth),
    headerLine,
    `│ ${"─".repeat(innerWidth)}`,
    ...rows.map(formatRow),
    `╰${"─".repeat(innerWidth + 1)}`,
  ];
}

function standingsLines(standings: readonly Standing[], round: number): string[] {
  const rows = standings.map((standing) => [
    `${standingIcon(standing)} ${standing.name}`,
    String(standing.wins),
    String(standing.losses),
    String(standing.pushes),
  ]);
  return buildBox(
    `📊 STANDINGS · AFTER ROUND ${round}`,
    ["PLAYER", "W", "L", "P"],
    ["left", "right", "right", "right"],
    rows,
  );
}

function showStandings(standings: readonly Standing[], round: number): void {
  output.write(`\n${standingsLines(standings, round).join("\n")}\n`);
}

interface MoneyStanding {
  id: string;
  name: string;
  /** Chips currently held. The dealer holds no chips, so theirs is a running total starting at $0. */
  amount: number;
}

// Players' money is their actual chip count; the dealer isn't a chip holder, so their money
// standing is instead the running total of what they've taken from (or paid to) the players,
// starting from $0.
function moneyStandings(standings: readonly Standing[], chips: Record<string, number>): MoneyStanding[] {
  return standings.map((standing) => ({
    id: standing.id,
    name: standing.name,
    amount: standing.id === "dealer" ? standing.netWinnings : (chips[standing.id] ?? 0),
  }));
}

function moneyRankingLines(standings: readonly Standing[], chips: Record<string, number>): string[] {
  const ranked = moneyStandings(standings, chips).sort((left, right) => right.amount - left.amount);
  const rows = ranked.map((standing, index) => {
    const amountText = formatMoney(standing.amount);
    return [
      `${index + 1}.`,
      `${standingIcon(standing)} ${standing.name}`,
      standing.amount < 0 ? paint(amountText, ANSI.red) : amountText,
    ];
  });
  return buildBox("💰 MONEY RANKING", ["", "PLAYER", "MONEY"], ["right", "left", "right"], rows);
}

/** Prints two boxed tables side by side, padding the shorter one to match line counts. */
function showSideBySide(left: string[], right: string[]): void {
  const leftWidth = Math.max(...left.map(visibleLength));
  const height = Math.max(left.length, right.length);
  const lines: string[] = [];
  for (let index = 0; index < height; index += 1) {
    const leftLine = left[index] ?? "";
    const padding = " ".repeat(Math.max(0, leftWidth - visibleLength(leftLine)));
    lines.push(`${leftLine}${padding}   ${right[index] ?? ""}`);
  }
  output.write(`\n${lines.join("\n")}\n`);
}

function showFinalStandings(standings: readonly Standing[], round: number, chips: Record<string, number>): void {
  showSideBySide(standingsLines(standings, round), moneyRankingLines(standings, chips));
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

async function askRebuyOrLeave(name: string): Promise<boolean> {
  while (true) {
    const answer = (
      await rl.question(`\n${name} is out of chips! [R]ebuy for $${STARTING_CHIPS} or [L]eave the table? `)
    ).trim().toLowerCase();
    if (answer === "r" || answer === "rebuy") return true;
    if (answer === "l" || answer === "leave") return false;
    output.write("Please enter R to rebuy or L to leave.\n");
  }
}

async function askBet(name: string, availableChips: number): Promise<number> {
  if (availableChips === 0) {
    output.write(`\n${name} is out of chips and sits out this round.\n`);
    return 0;
  }
  while (true) {
    const raw = (
      await rl.question(`${name}, place your bet (chips: $${availableChips}, Enter for $${STANDARD_BET}): `)
    ).trim();
    const bet = raw === "" ? Math.min(STANDARD_BET, availableChips) : Number(raw);
    try {
      validateBet(bet, availableChips);
      return bet;
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
  chips: Record<string, number>,
  leftTable: Set<string>,
  deck?: Card[],
): Promise<GameState> {
  const bets: Record<string, number> = {};
  for (const [index, name] of humanNames.entries()) {
    const id = `human-${index + 1}`;
    bets[id] = leftTable.has(id) ? 0 : await askBet(name, chips[id] ?? STARTING_CHIPS);
  }
  for (let index = 0; index < aiCount; index += 1) {
    const id = `ai-${index + 1}`;
    bets[id] = leftTable.has(id) ? 0 : chooseAiBet(chips[id] ?? STARTING_CHIPS);
  }

  const state = createGame(
    { humanNames, aiCount },
    { ...(deck ? { deck } : {}), enableEmergencyReshuffle: true, chips, bets },
  );
  if (state.reshuffleCount > 0) output.write("\n🔄 The deck has been reshuffled.\n");
  showTable(state, `🎴 ROUND ${round} · CARDS DEALT`);

  while (state.phase === "players") {
    const player = getActivePlayer(state);
    if (!player) break;

    if (player.bet === 0) {
      applyAction(state, player.id, "Stand");
      continue;
    }

    if (player.kind === "ai") {
      const actions = new Map<string, Action[]>();
      while (state.phase === "players") {
        const aiPlayer = getActivePlayer(state);
        if (!aiPlayer || aiPlayer.kind !== "ai") break;
        const upCard = state.dealer.hand[0];
        if (!upCard) throw new Error("Dealer has no up card.");
        let action = chooseAiAction(aiPlayer.hand, upCard);
        if (action === "Double Down" && aiPlayer.chips < aiPlayer.bet) action = "Hit";
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

    const canDoubleDown = player.hand.length === 2 && player.chips >= player.bet;
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
  for (const player of state.players) chips[player.id] = player.chips;

  for (const player of state.players) {
    if (chips[player.id] !== 0 || leftTable.has(player.id)) continue;
    if (player.kind === "human") {
      if (await askRebuyOrLeave(player.name)) {
        chips[player.id] = STARTING_CHIPS;
        output.write(`\n💰 ${player.name} rebuys for $${STARTING_CHIPS}.\n`);
      } else {
        leftTable.add(player.id);
        output.write(`\n🚪 ${player.name} leaves the table.\n`);
      }
    } else {
      leftTable.add(player.id);
      output.write(`\n🚪 ${player.name} is out of chips and leaves the table.\n`);
    }
  }

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
  output.write(`💰 Each player starts with $${STARTING_CHIPS} in chips. Standard bet is $${STANDARD_BET}.\n`);

  let playAgain = true;
  let round = 1;
  const standings = createStandings(initialState);
  const chips: Record<string, number> = Object.fromEntries(
    initialState.players.map((player) => [player.id, STARTING_CHIPS]),
  );
  const leftTable = new Set<string>();
  let deck: Card[] | undefined;
  while (playAgain) {
    const state = await playRound(humanNames, aiCount, round, standings, chips, leftTable, deck);
    deck = state.deck;
    const lowShoeThreshold = (humanNames.length + aiCount + 1) * 6;
    if (deck.length < lowShoeThreshold) {
      output.write("\n🔄 The shoe is low; it will be reshuffled before the next round.\n");
      deck = undefined;
    }
    const allHumansLeft = humanNames.every((_, index) => leftTable.has(`human-${index + 1}`));
    if (allHumansLeft) {
      output.write("\n🚪 All human players have left the table.\n");
      const answer = (await rl.question("End the game now? [Y/n] ")).trim().toLowerCase();
      playAgain = answer === "n" || answer === "no";
    } else {
      const answer = (await rl.question("\nPlay another round? [y/N] ")).trim().toLowerCase();
      playAgain = answer === "y" || answer === "yes";
    }
    round += 1;
  }
  showFinalStandings(standings, round - 1, chips);
  output.write("\nThanks for playing!\n");
}

main()
  .catch((error: unknown) => {
    output.write(`\nError: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
