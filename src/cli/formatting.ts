import { stdout as output } from "node:process";
import {
  winAmount,
  type Card,
  type Outcome,
  type Player,
} from "../engine.js";

export const ANSI = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

const SUIT_SYMBOL: Record<Card["suit"], string> = {
  Clubs: "♣",
  Diamonds: "♦",
  Hearts: "♥",
  Spades: "♠",
};

export function paint(text: string, color: string): string {
  return output.isTTY ? `${color}${text}${ANSI.reset}` : text;
}

export function cardText(card: Card | null): string {
  return card ? `${card.rank}${SUIT_SYMBOL[card.suit]}` : "??";
}

export function handText(hand: readonly (Card | null)[]): string {
  return hand.map(cardText).join(" ");
}

// Ranks are 1 character wide except "10" — right-padding to width 2 keeps every suit
// symbol flush at the same column, so a 2 and a 10 line up. The hidden-card placeholder
// gets the same 1-char-rank shape (" ??") so it doesn't sit 1 column off from real cards.
export function tableCardText(card: Card | null): string {
  return card ? `${card.rank.padStart(2)}${SUIT_SYMBOL[card.suit]}` : " ??";
}

export function tableCardCells(hand: readonly (Card | null)[], columnCount: number): string[] {
  const cells = hand.map(tableCardText);
  while (cells.length < columnCount) cells.push("");
  return cells;
}

const RESULT_WORD_WIDTH = 4;

export interface ResultInfo {
  word: string;
  emoji: string;
  sign: "+" | "-" | "";
  digits: string;
  color: string | null;
}

export function outcomeInfo(outcome: Outcome, player: Pick<Player, "hand" | "bet">): ResultInfo {
  if (outcome === "win") return { word: "Win", emoji: "🏆", sign: "+", digits: String(winAmount(player)), color: ANSI.green };
  if (outcome === "lose") return { word: "Loss", emoji: "☠️", sign: "-", digits: String(player.bet), color: ANSI.red };
  return { word: "Push", emoji: "⚖️", sign: "", digits: "0", color: ANSI.yellow };
}

export function formatResult(info: ResultInfo, digitWidth: number): { result: string; amount: string } {
  const result = info.emoji ? `${info.word.padEnd(RESULT_WORD_WIDTH)} ${info.emoji}` : info.word;
  const amount = `${info.sign || " "}$${info.digits.padStart(digitWidth)}`;
  return { result, amount };
}

export function formatSignedAmount(amount: number): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : " ";
  return `${sign}$${Math.abs(amount)}`;
}

export function formatMoney(amount: number): string {
  return amount < 0 ? `-$${Math.abs(amount)}` : `$${amount}`;
}

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
// U+FE0F (variation selector-16) forces emoji-style rendering but occupies no column of its
// own — counting it would overstate a line's true width by 1 for every icon it contains.
const VS16_PATTERN = /️/g;

/** Length as it will actually appear in the terminal, ignoring invisible ANSI color codes and VS16. */
export function visibleLength(text: string): number {
  return text.replace(ANSI_PATTERN, "").replace(VS16_PATTERN, "").length;
}

const BANNER_INNER_WIDTH = 42;

function bannerLine(text: string): string {
  const width = visibleLength(text);
  const leftPadding = Math.max(0, Math.floor((BANNER_INNER_WIDTH - width) / 2));
  const rightPadding = Math.max(0, BANNER_INNER_WIDTH - width - leftPadding);
  return `│${" ".repeat(leftPadding)}${text}${" ".repeat(rightPadding)}│`;
}

export function showOpeningBanner(): void {
  const lines = [
    `╭${"─".repeat(BANNER_INNER_WIDTH)}╮`,
    bannerLine("🍀🍀🍀 BLACKJACK 🍀🍀🍀"),
    bannerLine("Chasing Fortune & Glory ... and 21!"),
    `╰${"─".repeat(BANNER_INNER_WIDTH)}╯`,
  ];
  output.write(`\n${lines.join("\n")}\n`);
}

/** Top border of a box, sized so its total width matches `innerWidth` (the content width after "│ "). */
export function divider(title: string, innerWidth: number): string {
  const dashCount = Math.max(1, innerWidth - visibleLength(title) - 2);
  return paint(`╭─ ${title} ${"─".repeat(dashCount)}`, ANSI.cyan);
}

export type Align = "left" | "right";

export function padCell(text: string, width: number, align: Align): string {
  const gap = " ".repeat(Math.max(0, width - visibleLength(text)));
  return align === "right" ? `${gap}${text}` : `${text}${gap}`;
}

/** Builds a bordered box whose column widths follow the widest header or cell. */
export function buildBox(title: string, headers: string[], aligns: Align[], rows: string[][]): string[] {
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

