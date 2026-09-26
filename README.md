# Monopoly Deal

An online Monopoly Deal card game: a pure, deterministic rules engine (`packages/engine`), a server-authoritative Express + SSE multiplayer server (`apps/server`), and a mobile-first React client (`apps/web`). Rooms hold 2–5 players; the full game state never leaves the server.

## Prerequisites

- Node 22
- pnpm 9

## Run

```sh
pnpm i
pnpm dev        # web on http://127.0.0.1:5173, server on http://127.0.0.1:8787
```

`pnpm dev:web` starts only the web app; `pnpm server` starts only the server.

## Verify

- `pnpm verify` — the CI gate: typecheck, lint, css audit, engine and web unit tests, redaction tests, server integration, a headless sim (5 games locally, 500 when `CI` is set) and a 100-game networked sim. It does not run Playwright.
- `pnpm e2e` / `pnpm e2e:net` — the Playwright suites (in-browser `/demo` and networked). Each config boots its own servers.

## Read next

- [CLAUDE.md](CLAUDE.md) — commands, hard rules and the card sizing invariant.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — command flow, directory map and where to add things.
- [DECISIONS.md](DECISIONS.md) — rule ambiguities and how they were resolved.
- [game_rules/](game_rules/) — the rule text the engine implements.
