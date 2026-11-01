import type { Interface } from "node:readline/promises";
import { MAX_NAME_LENGTH, STANDARD_BET, STARTING_CHIPS, validateBet, validateName } from "../engine.js";

export async function askInteger(rl: Interface, prompt: string, minimum: number, maximum: number): Promise<number> {
  while (true) {
    const value = Number.parseInt((await rl.question(prompt)).trim(), 10);
    if (Number.isInteger(value) && value >= minimum && value <= maximum) return value;
    rl.write(`Please enter a number from ${minimum} to ${maximum}.\n`);
  }
}

export async function askName(rl: Interface, number: number): Promise<string> {
  while (true) {
    const name = await rl.question(`Name for human player ${number} (max ${MAX_NAME_LENGTH} characters): `);
    try {
      validateName(name);
      return name.trim();
    } catch (error) {
      rl.write(`${(error as Error).message}\n`);
    }
  }
}

export async function askRebuyOrLeave(rl: Interface, name: string): Promise<boolean> {
  while (true) {
    const answer = (await rl.question(`\n${name} is out of chips! [R]ebuy for $${STARTING_CHIPS} or [L]eave the table? `)).trim().toLowerCase();
    if (answer === "r" || answer === "rebuy") return true;
    if (answer === "l" || answer === "leave") return false;
    rl.write("Please enter R to rebuy or L to leave.\n");
  }
}

export async function askBet(rl: Interface, name: string, availableChips: number): Promise<number> {
  if (availableChips === 0) {
    rl.write(`\n${name} is out of chips and sits out this round.\n`);
    return 0;
  }
  while (true) {
    const raw = (await rl.question(`${name}, place your bet (chips: $${availableChips}, Enter for $${STANDARD_BET}): `)).trim();
    const bet = raw === "" ? Math.min(STANDARD_BET, availableChips) : Number(raw);
    try {
      validateBet(bet, availableChips);
      return bet;
    } catch (error) {
      rl.write(`${(error as Error).message}\n`);
    }
  }
}
