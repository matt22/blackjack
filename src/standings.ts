import type { GameState, Outcome } from "./engine.js";

export interface Standing {
  id: string;
  name: string;
  wins: number;
  losses: number;
  pushes: number;
  /** Net chips won (positive) or lost (negative) across all recorded rounds. */
  netWinnings: number;
}

export function createStandings(state: Pick<GameState, "players">): Standing[] {
  return [
    { id: "dealer", name: "Dealer", wins: 0, losses: 0, pushes: 0, netWinnings: 0 },
    ...state.players.map((player) => ({
      id: player.id,
      name: player.name,
      wins: 0,
      losses: 0,
      pushes: 0,
      netWinnings: 0,
    })),
  ];
}

function addOutcome(standing: Standing, outcome: Outcome, bet: number): void {
  if (outcome === "win") {
    standing.wins += 1;
    standing.netWinnings += bet;
  } else if (outcome === "lose") {
    standing.losses += 1;
    standing.netWinnings -= bet;
  } else {
    standing.pushes += 1;
  }
}

/** Ranks by win/loss/push record, using net winnings only to silently break ties. */
function compareRankings(left: Standing, right: Standing): number {
  return (
    right.wins - left.wins ||
    left.losses - right.losses ||
    right.pushes - left.pushes ||
    right.netWinnings - left.netWinnings
  );
}

/** Ranks standings by money won, highest first. */
export function rankByMoney(standings: readonly Standing[]): Standing[] {
  return [...standings].sort((left, right) => right.netWinnings - left.netWinnings);
}

/** Keeps the dealer first while ranking the other standings by their records. */
export function rankStandings(standings: Standing[]): void {
  const dealer = standings.find((standing) => standing.id === "dealer");
  if (!dealer) throw new Error("Missing dealer standing.");

  const players = standings
    .filter((standing) => standing.id !== "dealer")
    .sort(compareRankings);
  standings.splice(0, standings.length, dealer, ...players);
}

/** Records every player-vs-dealer result from one completed round. */
export function recordRound(standings: Standing[], state: GameState): void {
  if (state.phase !== "complete") throw new Error("Standings can only be recorded after a round is complete.");
  const dealer = standings.find((standing) => standing.id === "dealer");
  if (!dealer) throw new Error("Missing dealer standing.");

  for (const player of state.players) {
    const outcome = state.outcomes[player.id];
    const standing = standings.find((entry) => entry.id === player.id);
    if (!outcome || !standing) throw new Error(`Missing standing or outcome for ${player.name}.`);
    addOutcome(standing, outcome, player.bet);
    addOutcome(dealer, outcome === "win" ? "lose" : outcome === "lose" ? "win" : "push", player.bet);
  }

  rankStandings(standings);
}
