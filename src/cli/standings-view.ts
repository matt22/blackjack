import { stdout as output } from "node:process";
import { formatMoney, paint, buildBox, visibleLength, ANSI, type Align } from "./formatting.js";
import { standingIcon } from "./player-icons.js";
import type { Standing } from "../standings.js";

function standingsLines(standings: readonly Standing[], round: number): string[] {
  const rows = standings.map((standing) => [`${standingIcon(standing)} ${standing.name}`, String(standing.wins), String(standing.losses), String(standing.pushes)]);
  return buildBox(`📊 STANDINGS · AFTER ROUND ${round}`, ["PLAYER", "W", "L", "P"], ["left", "right", "right", "right"], rows);
}

function moneyRankingLines(standings: readonly Standing[], chips: Record<string, number>): string[] {
  const ranked = standings.map((standing) => ({ ...standing, amount: standing.id === "dealer" ? standing.netWinnings : (chips[standing.id] ?? 0) })).sort((a, b) => b.amount - a.amount);
  const rows = ranked.map((standing, index) => {
    const amount = formatMoney(standing.amount);
    return [`${index + 1}.`, `${standingIcon(standing)} ${standing.name}`, standing.amount < 0 ? paint(amount, ANSI.red) : amount];
  });
  return buildBox("💰 MONEY RANKING", ["", "PLAYER", "MONEY"], ["right", "left", "right"], rows);
}

function showSideBySide(left: string[], right: string[]): void {
  const leftWidth = Math.max(...left.map(visibleLength));
  const height = Math.max(left.length, right.length);
  const lines: string[] = [];
  for (let index = 0; index < height; index += 1) {
    const leftLine = left[index] ?? "";
    lines.push(`${leftLine}${" ".repeat(Math.max(0, leftWidth - visibleLength(leftLine)))}   ${right[index] ?? ""}`);
  }
  output.write(`\n${lines.join("\n")}\n`);
}

export function showStandings(standings: readonly Standing[], round: number): void {
  output.write(`\n${standingsLines(standings, round).join("\n")}\n`);
}

export function showFinalStandings(standings: readonly Standing[], round: number, chips: Record<string, number>): void {
  showSideBySide(standingsLines(standings, round), moneyRankingLines(standings, chips));
}
