# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## What this is

An AXI CLI wrapping the Instantly.ai cold-email API v2. Build with `npm run build`, test
offline with `npm test`, validate AXI compliance with
`npx -y axi-axi validate "node bin/instantly-axi.js" --dir .`. See `README.md` for the
command surface and `CONTRIBUTING`-style dev notes.

## Architecture (pointers)

- Safety gate: `src/safety/gate.ts` is the single choke point for every send-triggering
  or destructive command. Gated commands build a `DryRunPlan` + an `execute` thunk; the
  gate never calls `execute` without `--confirm`. Add new mutations through it, never
  around it.
- Command surface and the shared home/SKILL content live in `src/skill/content.ts`
  (`COMMANDS` catalog is the single source; `npm run skill:gen` regenerates SKILL.md and
  CI's `skill:check` fails on drift).
- Endpoints are verified against https://developer.instantly.ai/ (OpenAPI:
  https://api.instantly.ai/openapi/api_v2.json). API key resolution + precedence is in
  `src/api/credentials.ts`; the key is never logged or put in errors.

## Sharp edges (learned the hard way)

- **Test deadlock:** e2e tests run an in-process mock HTTP server AND spawn the CLI. Use
  async `spawn` (see `test/e2e/server.test.ts`), never `spawnSync` - `spawnSync` blocks
  the event loop so the in-process server can never answer, and the whole run hangs.
- **axi-axi validate V09:** it discovers subcommands from the *first token* of each
  `commands[..]{command,..}` table cell. Keep the `command` column a bare subcommand
  (no `instantly-axi ` prefix) or validation runs `instantly-axi <toolname> --help` and
  fails. The invocation prefix goes in a separate `run:` note.
- Installing from git needs the `prepare` script (builds `dist/`, which is gitignored).

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
