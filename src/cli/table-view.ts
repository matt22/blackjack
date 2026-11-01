import { stdout as output } from "node:process";
import { getPublicState, insuranceNet, isBlackjack, winAmount, type GameState } from "../engine.js";
import {
  ANSI, buildBox, formatResult, formatSignedAmount, outcomeInfo, paint, tableCardCells, visibleLength,
  type Align, type ResultInfo,
} from "./formatting.js";
import { playerIcon } from "./player-icons.js";

export function showTable(state: GameState, title = "🎴 TABLE"): void {
  const view = getPublicState(state);
  const dealerScore = view.dealer.score === null ? "hidden" : String(view.dealer.score);
  const isComplete = state.phase === "complete";
  const dealerBusted = isComplete && state.dealer.status === "busted";
  const seatedPlayers = view.players.filter((player) => player.bet > 0);
  const sittingOut = view.players.filter((player) => player.bet === 0);
  const cardColumns = Math.max(2, view.dealer.hand.length, ...seatedPlayers.map((player) => player.hand.length));
  const playerResults: ResultInfo[] = seatedPlayers.map((player) => {
    const outcome = state.outcomes[player.id];
    if (player.status === "busted") return { word: "Bust", emoji: "💀", sign: "-", digits: String(player.bet), color: null };
    if (isComplete && outcome) return outcomeInfo(outcome, player);
    return { word: "Bet", emoji: "", sign: "", digits: String(player.bet), color: null };
  });
  const digitWidth = Math.max(1, ...playerResults.map((info) => info.digits.length));
  const dealerNet = -seatedPlayers.reduce((total, player) => {
    const outcome = state.outcomes[player.id];
    if (outcome === "win") return total + winAmount(player);
    if (outcome === "lose") return total - player.bet;
    return total;
  }, 0) - (isComplete ? seatedPlayers.reduce((total, player) => total + insuranceNet(player, state.dealer.hand), 0) : 0);
  const dealerRow = [
    `${playerIcon("dealer")} Dealer`, ...tableCardCells(view.dealer.hand, cardColumns), `(${dealerScore})`,
    dealerBusted ? formatResult({ word: "Bust", emoji: "💀", sign: "", digits: "", color: null }, 0).result : "",
    isComplete ? formatSignedAmount(dealerNet) : "", "",
  ].map((cell) => paint(cell, ANSI.yellow));
  const playerRows = seatedPlayers.map((player, index) => {
    const info = playerResults[index];
    if (!info) throw new Error(`Missing result info for ${player.name}.`);
    const { result, amount } = formatResult(info, digitWidth);
    const cells = [`${playerIcon(player.id)} ${player.name}`, ...tableCardCells(player.hand, cardColumns), `(${player.score})`,
      info.color ? paint(result, info.color) : result, info.color ? paint(amount, info.color) : amount, `💰$${player.chips}`];
    return player.status === "busted" ? cells.map((cell) => paint(cell, ANSI.red)) : cells;
  });
  const cardHeaders = ["HAND", ...Array(cardColumns - 1).fill("")];
  const cardAligns: Align[] = Array(cardColumns).fill("left");
  const lines = buildBox(title, ["PLAYER", ...cardHeaders, "SCORE", "RESULT", "AMOUNT", "CHIPS"],
    ["left", ...cardAligns, "right", "left", "right", "left"], [dealerRow, ...playerRows]);
  const insured = seatedPlayers.filter((player) => player.insuranceBet > 0);
  if (isComplete && insured.length > 0) {
    const results = insured.map((player) => `${player.name} ${formatSignedAmount(insuranceNet(player, state.dealer.hand))}`).join(" · ");
    lines.splice(lines.length - 1, 0, `│ 🛡️ Insurance: ${results}`);
  }
  if (sittingOut.length > 0) {
    const names = sittingOut.map((player) => player.name).join(", ");
    lines.splice(lines.length - 1, 0, `│ ${paint(`🚪 Sitting out: ${names}`, ANSI.gray)}`);
  }
  output.write(`\n${lines.join("\n")}\n`);
}

export function showTableRules(): void {
  const rules = ["Blackjack pays 3 to 2", "Dealer stands on all 17s (soft 17 included)", "Dealer checks for blackjack before play", "Insurance pays 2 to 1"];
  const contentWidth = Math.max(...rules.map(visibleLength));
  const innerWidth = contentWidth + 1;
  const title = "🪧 TABLE RULES";
  const border = (text: string) => paint(text, ANSI.cyan);
  const lines = [border(`╭─ ${title} ${"─".repeat(Math.max(1, innerWidth - visibleLength(title) - 3))}╮`),
    ...rules.map((rule) => `${border("│")} ${rule}${" ".repeat(contentWidth - visibleLength(rule))}${border("│")}`),
    border(`╰${"─".repeat(innerWidth)}╯`)];
  output.write(`\n${lines.join("\n")}\n`);
}
