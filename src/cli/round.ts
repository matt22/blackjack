import type { Interface } from "node:readline/promises";
import { stdout as output } from "node:process";
import { chooseAiAction, chooseAiBet } from "../ai.js";
import { applyAction, canTakeInsurance, createGame, getActivePlayer, insuranceCost, insuranceNet, isBlackjack, resolveInsurance, scoreHand, STARTING_CHIPS, type Action, type Card, type GameState } from "../engine.js";
import { recordRound, type Standing } from "../standings.js";
import { ANSI, cardText, handText, paint } from "./formatting.js";
import { askBet, askRebuyOrLeave } from "./prompts.js";
import { showStandings } from "./standings-view.js";
import { showTable } from "./table-view.js";

async function offerInsurance(rl: Interface, state: GameState): Promise<void> {
  const eligible = state.players.filter((player) => player.kind === "human" && player.bet > 0 && canTakeInsurance(player));
  const insured: string[] = [];
  if (eligible.length > 0) output.write("\n🛡️ Dealer shows an Ace. Insurance costs half your bet and pays 2:1 if the dealer has blackjack.\n");
  for (const player of eligible) {
    const cost = insuranceCost(player);
    const question = isBlackjack(player.hand) ? `${player.name}, you have blackjack. Take even money (a sure 1:1 win)? [y/N] ` : `${player.name}, insure for $${cost}? [y/N] `;
    if (["y", "yes"].includes((await rl.question(question)).trim().toLowerCase())) insured.push(player.id);
  }
  resolveInsurance(state, insured);
  if (!isBlackjack(state.dealer.hand)) output.write(`\n🎩 Dealer doesn't have blackjack.${insured.length > 0 ? " Insurance loses." : ""}\n`);
}

function showDraw(player: GameState["players"][number], label = "drew"): void {
  const card = player.hand.at(-1);
  if (!card) throw new Error(`${player.name} has no drawn card.`);
  const bust = player.status === "busted" ? " 💀 BUST" : "";
  output.write(`\n${paint("🃏", ANSI.magenta)} ${player.name} ${label} ${cardText(card)} · Hand: ${handText(player.hand)} (${scoreHand(player.hand)})${paint(bust, ANSI.red)}\n`);
}

function showReshuffles(state: GameState, previousCount: number): void {
  if (state.reshuffleCount > previousCount) output.write(`\n${paint("🔄 The deck has been reshuffled.", ANSI.yellow)}\n`);
}

export async function playRound(rl: Interface, humanNames: string[], aiCount: number, round: number, standings: Standing[], chips: Record<string, number>, leftTable: Set<string>, deck?: Card[]): Promise<GameState> {
  const bets: Record<string, number> = {};
  for (const [index, name] of humanNames.entries()) bets[`human-${index + 1}`] = leftTable.has(`human-${index + 1}`) ? 0 : await askBet(rl, name, chips[`human-${index + 1}`] ?? STARTING_CHIPS);
  for (let index = 0; index < aiCount; index += 1) bets[`ai-${index + 1}`] = leftTable.has(`ai-${index + 1}`) ? 0 : chooseAiBet(chips[`ai-${index + 1}`] ?? STARTING_CHIPS);
  const state = createGame({ humanNames, aiCount }, { ...(deck ? { deck } : {}), enableEmergencyReshuffle: true, chips, bets });
  if (state.reshuffleCount > 0) output.write("\n🔄 The deck has been reshuffled.\n");
  showTable(state, `🎴 ROUND ${round} · CARDS DEALT`);
  if (state.phase === "insurance") await offerInsurance(rl, state);
  if (isBlackjack(state.dealer.hand)) output.write("\n🎩 Dealer has blackjack. The round is over.\n");
  while (state.phase === "players") {
    const player = getActivePlayer(state);
    if (!player) break;
    if (player.bet === 0) { applyAction(state, player.id, "Stand"); continue; }
    if (player.kind === "ai") {
      const actions = new Map<string, Action[]>();
      while (state.phase === "players") {
        const aiPlayer = getActivePlayer(state);
        if (!aiPlayer || aiPlayer.kind !== "ai") break;
        const upCard = state.dealer.hand[0];
        if (!upCard) throw new Error("Dealer has no up card.");
        let action = chooseAiAction(aiPlayer.hand, upCard);
        if (action === "Double Down" && aiPlayer.chips < aiPlayer.bet) action = "Hit";
        actions.set(aiPlayer.name, [...(actions.get(aiPlayer.name) ?? []), action]);
        const before = state.reshuffleCount;
        applyAction(state, aiPlayer.id, action);
        showReshuffles(state, before);
      }
      output.write(`\nAI actions: ${[...actions].map(([name, acts]) => `${name}: ${acts.join(" → ")}`).join("  |  ")}\n`);
      continue;
    }
    const canDoubleDown = player.hand.length === 2 && player.chips >= player.bet;
    const answer = (await rl.question(`\n${player.name}, ${canDoubleDown ? "[H]it, [S]tand, or [D]ouble Down? " : "[H]it or [S]tand? "}`)).trim().toLowerCase();
    if (["h", "hit"].includes(answer)) { const before = state.reshuffleCount; applyAction(state, player.id, "Hit"); showDraw(player); showReshuffles(state, before); }
    else if (["s", "stand"].includes(answer)) applyAction(state, player.id, "Stand");
    else if (canDoubleDown && ["d", "double", "double down"].includes(answer)) { const before = state.reshuffleCount; applyAction(state, player.id, "Double Down"); showDraw(player, "doubled down and drew"); showReshuffles(state, before); }
    else output.write(`Please enter ${canDoubleDown ? "H, S, or D" : "H or S"}.\n`);
  }
  showTable(state, `🎴 ROUND ${round} · TABLE UPDATE`);
  recordRound(standings, state);
  showStandings(standings, round);
  for (const player of state.players) chips[player.id] = player.chips;
  for (const player of state.players) {
    if (chips[player.id] !== 0 || leftTable.has(player.id)) continue;
    if (player.kind === "human" && await askRebuyOrLeave(rl, player.name)) { chips[player.id] = STARTING_CHIPS; output.write(`\n💰 ${player.name} rebuys for $${STARTING_CHIPS}.\n`); }
    else { leftTable.add(player.id); output.write(`\n🚪 ${player.name} ${player.kind === "human" ? "leaves the table." : "is out of chips and leaves the table."}\n`); }
  }
  return state;
}
