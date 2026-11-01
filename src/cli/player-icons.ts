import type { Standing } from "../standings.js";

const AI_ICONS = ["🤖", "😈", "👽"];

export function playerIcon(id: string): string {
  const aiSeat = id.startsWith("ai-") ? Number(id.slice(3)) : null;
  const icon = id === "dealer" ? "🎩" : aiSeat !== null ? (AI_ICONS[aiSeat - 1] ?? "🤖") : "👤";
  return `${icon}️`;
}

export function standingIcon(standing: Pick<Standing, "id">): string {
  return playerIcon(standing.id);
}
