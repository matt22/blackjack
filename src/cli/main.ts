import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createGame, STANDARD_BET, STARTING_CHIPS } from "../engine.js";
import { createStandings } from "../standings.js";
import { showOpeningBanner } from "./formatting.js";
import { askInteger, askName } from "./prompts.js";
import { showFinalStandings } from "./standings-view.js";
import { playRound } from "./round.js";
import { showTableRules } from "./table-view.js";

export async function main(rl: Interface = createInterface({ input, output })): Promise<void> {
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
  const chips: Record<string, number> = Object.fromEntries(initialState.players.map((player) => [player.id, STARTING_CHIPS]));
  const leftTable = new Set<string>();
  let deck;
  while (playAgain) {
    const state = await playRound(rl, humanNames, aiCount, round, standings, chips, leftTable, deck);
    deck = state.deck;
    if (deck.length < (humanNames.length + aiCount + 1) * 6) { output.write("\n🔄 The shoe is low; it will be reshuffled before the next round.\n"); deck = undefined; }
    const allHumansLeft = humanNames.every((_, index) => leftTable.has(`human-${index + 1}`));
    const answer = allHumansLeft ? await rl.question("End the game now? [Y/n] ") : await rl.question("\nPlay another round? [y/N] ");
    playAgain = allHumansLeft ? ["n", "no"].includes(answer.trim().toLowerCase()) : ["y", "yes"].includes(answer.trim().toLowerCase());
    if (allHumansLeft) output.write("\n🚪 All human players have left the table.\n");
    round += 1;
  }
  showFinalStandings(standings, round - 1, chips);
  output.write("\nThanks for playing!\n");
}
