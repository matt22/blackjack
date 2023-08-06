# AGENTS.md

## Scope

TypeScript blackjack game and CLI.

## Initial read set

Read only `README.md`, `package.json`, `src/index.ts`, and the test file relevant to the task. Do not recursively inspect directories or open files merely because they exist.

## Commands

- Test: `pnpm test`
- Build: `pnpm build`

## Routing

For CLI behavior, inspect `src/cli.ts`. For game rules, inspect `src/engine.ts`. For standings, inspect `src/standings.ts`. For AI behavior, inspect `src/ai.ts`.

## Work protocol

Make one bounded change, run the narrowest relevant test, and report changed files and verification. Avoid editing generated `dist/` files or changing dependencies unless requested.
