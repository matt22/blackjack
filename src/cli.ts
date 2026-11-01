#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { main } from "./cli/main.js";

const rl = createInterface({ input, output });

main(rl)
  .catch((error: unknown) => {
    output.write(`\nError: ${(error as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
