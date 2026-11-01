#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chooseAiAction, chooseAiBet } from "./ai.js";
import {
  STANDARD_BET,
  STARTING_CHIPS,
  applyAction,
  canTakeInsurance,
  createGame,
  getActivePlayer,
  getPublicState,
  insuranceCost,
  insuranceNet,
  isBlackjack,
  resolveInsurance,
  scoreHand,
  winAmount,
  type Action,
  type Card,
  type GameState,
  type Outcome,
  type Player,
} from "./engine.js";
import { createStandings, recordRound, type Standing } from "./standings.js";
import {
  ANSI,
  buildBox,
  cardText,
  formatMoney,
  formatResult,
  formatSignedAmount,
  handText,
  outcomeInfo,
  paint,
  showOpeningBanner,
  tableCardCells,
  visibleLength,
  type Align,
  type ResultInfo,
} from "./cli/formatting.js";
import { playerIcon, standingIcon } from "./cli/player-icons.js";
import { askBet, askInteger, askName, askRebuyOrLeave } from "./cli/prompts.js";

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
    if (isComplete && outcome) return outcomeInfo(outcome, player);
    return { word: "Bet", emoji: "", sign: "", digits: String(player.bet), color: null };
  });
  const digitWidth = Math.max(1, ...playerResults.map((info) => info.digits.length));

  // The dealer holds no chips of their own; their win/loss is simply the mirror image of what
  // the seated players won or lost this round.
  const dealerNet = -seatedPlayers.reduce((total, player) => {
    const outcome = state.outcomes[player.id];
    if (outcome === "win") return total + winAmount(player);
    if (outcome === "lose") return total - player.bet;
    return total;
  }, 0) - (isComplete ? seatedPlayers.reduce((total, player) => total + insuranceNet(player, state.dealer.hand), 0) : 0);

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
      `${playerIcon(player.id)} ${player.name}`,
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
  const insured = seatedPlayers.filter((player) => player.insuranceBet > 0);
  if (isComplete && insured.length > 0) {
    const results = insured
      .map((player) => `${player.name} ${formatSignedAmount(insuranceNet(player, state.dealer.hand))}`)
      .join(" · ");
    lines.splice(lines.length - 1, 0, `│ 🛡️ Insurance: ${results}`);
  }
  if (sittingOut.length > 0) {
    const names = sittingOut.map((player) => player.name).join(", ");
    lines.splice(lines.length - 1, 0, `│ ${paint(`🚪 Sitting out: ${names}`, ANSI.gray)}`);
  }
  output.write(`\n${lines.join("\n")}\n`);
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

// Real tables post their payout and dealer rules on the felt before you sit down; this mirrors
// that placard so players know the house edge up front.
function showTableRules(): void {
  const rules = [
    "Blackjack pays 3 to 2",
    "Dealer stands on all 17s (soft 17 included)",
    "Dealer checks for blackjack before play",
    "Insurance pays 2 to 1",
  ];
  const contentWidth = Math.max(...rules.map(visibleLength));
  const innerWidth = contentWidth + 1;
  const title = "🪧 TABLE RULES";
  const topDashCount = Math.max(1, innerWidth - visibleLength(title) - 3);
  const border = (text: string) => paint(text, ANSI.cyan);
  const lines = [
    border(`╭─ ${title} ${"─".repeat(topDashCount)}╮`),
    ...rules.map(
      (rule) => `${border("│")} ${rule}${" ".repeat(contentWidth - visibleLength(rule))}${border("│")}`,
    ),
    border(`╰${"─".repeat(innerWidth)}╯`),
  ];
  output.write(`\n${lines.join("\n")}\n`);
}

// AI players follow basic strategy, which never takes insurance, so only humans are asked.
async function offerInsurance(state: GameState): Promise<void> {
  const eligible = state.players.filter((player) => player.kind === "human" && player.bet > 0 && canTakeInsurance(player));
  const insured: string[] = [];
  if (eligible.length > 0) {
    output.write("\n🛡️ Dealer shows an Ace. Insurance costs half your bet and pays 2:1 if the dealer has blackjack.\n");
  }
  for (const player of eligible) {
    const cost = insuranceCost(player);
    const question = isBlackjack(player.hand)
      ? `${player.name}, you have blackjack. Take even money (a sure 1:1 win)? [y/N] `
      : `${player.name}, insure for $${cost}? [y/N] `;
    const answer = (await rl.question(question)).trim().toLowerCase();
    if (answer === "y" || answer === "yes") insured.push(player.id);
  }
  resolveInsurance(state, insured);
  if (!isBlackjack(state.dealer.hand)) {
    output.write(`\n🎩 Dealer doesn't have blackjack.${insured.length > 0 ? " Insurance loses." : ""}\n`);
  }
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
    bets[id] = leftTable.has(id) ? 0 : await askBet(rl, name, chips[id] ?? STARTING_CHIPS);
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
  if (state.phase === "insurance") await offerInsurance(state);
  if (isBlackjack(state.dealer.hand)) output.write("\n🎩 Dealer has blackjack. The round is over.\n");

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
      if (await askRebuyOrLeave(rl, player.name)) {
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
  showOpeningBanner();
  output.write("\nHit, stand, or double down. Closest to 21 without going over wins.\n\n");
  showTableRules();
  const humanCount = await askInteger(rl, "Number of human players (1-2): ", 1, 2);
  const humanNames: string[] = [];
  for (let index = 1; index <= humanCount; index += 1) humanNames.push(await askName(rl, index));
  const aiCount = await askInteger(rl, "Number of AI players (0-3): ", 0, 3);
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
