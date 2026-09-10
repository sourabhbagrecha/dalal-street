# CLAUDE.md

Online Monopoly Deal: pure rules engine (`packages/engine`), Express+SSE multiplayer server (`apps/server`), React client (`apps/web`, local pass-and-play or networked). Rule text: `game_rules/`. Scripts: @package.json.

## Commands

pnpm workspaces monorepo.

- `pnpm build` / `typecheck` / `lint` / `test` (engine vitest) / `dev` (web) / `server` / `verify`
- `pnpm verify` = CI gate (typecheck → lint → engine tests → redaction tests → server integration → 500-game headless sim → 100-game net sim). Run before calling non-trivial work done.
- Single engine test: `pnpm --filter @monopoly-deal/engine exec vitest run src/rules.test.ts`
- Single Playwright spec: `pnpm --filter @monopoly-deal/verification exec playwright test -c e2e/playwright.config.ts <spec>` (swap `e2e` → `e2e-net` for networked). Configs boot their own servers.

## Dev environment

- Web (`127.0.0.1:5173`) and server (`127.0.0.1:8787`) already running in another terminal. **Never launch `pnpm dev`/`pnpm server` yourself** — use the running instances.
- UI iteration/verification: use Playwright MCP or agent-browser (whichever fits the task). **Never use claude-in-chrome** — fails to reach the dev server in this environment.

## Design

Mobile-first, always. Mobile beats desktop on any tradeoff.

## Hard rules

- **Engine is sacred.** `packages/engine` stays pure and deterministic: no wall-clock, no IO, no network concepts, randomness only via injectable RNG. Do not rewrite or restructure it.
- **Server-authoritative.** Clients render only server-sent projections; no client-side prediction or reconciliation. Full `GameState` never leaves the server — `project(state, playerId)` redacts hidden info.
- **Secrecy.** Shuffle seed, deck order, and full state must never appear in any payload, log, or client-facing error. Seeds injectable in test builds only.
- **Thin server.** Zero game rules in the server; if it needs a rule, expose an engine validator.
- **Transport: HTTP POST + SSE only — no WebSockets, no socket.io.** Every push is a full-JSON projection snapshot; no deltas. Recovery = full snapshot, never event replay.
- **Zod-validate every inbound payload at the boundary.**
- Express (decided), Node 22, single process. Rooms live in memory and are mirrored to one better-sqlite3 file (`apps/server/src/db.ts`, path `MD_DB_PATH`; index.ts defaults to `apps/server/data/`, tests/embedders stay in-memory) so a restart rehydrates every room. No Redis, workers, or clustering. After a restart, timers reset to fresh windows and every seat starts in disconnect grace.
- Room URLs: `/rooms/:code` is the one client route for a room (join form → waiting room → table). Seat credentials are stored per room code (`apps/web/src/store/session.ts`); `/game` only redirects.
- TS strict everywhere; no `any` in engine, projection, or protocol code.
- **Time lives in the server scheduler, never the engine.** Fixed windows (do not reinterpret): turn 60s, Just Say No 20s, payment 30s (auto-pay cheapest; bank first; multicolor wilds never payable), other interrupts 30s (expiry forfeits the play), disconnect grace 60s. 2–5 players per room.
- `verification/` is append-only.

## Card sizing invariant (non-negotiable)

Every `.playing-card`: strict 5:7 aspect ratio AND no clipped face content, both at once. Mechanism in `apps/web/src/styles.css`: `contain: size` (ratio backstop) + `--card-scale` container-query scaling with per-card `--card-ref` derived from `--rent-rows`. Never remove either half; never revert to one flat worst-case `--card-ref` (known regression: shrinks common cards). Any new face element must route vertical px through `calc(px * var(--card-scale))`. Worst case to test: 4-row rent table (two stacked on a wildcard). Verify with `card-aspect-ratio.spec.ts` **including its `webkit` project** — Chromium clips silently, WebKit grows the box; Chromium-only runs prove nothing.

## graphify

Knowledge graph at `graphify-out/`. For codebase questions run `graphify query "<q>"` first; `graphify path` / `graphify explain` for relationships/concepts; `graphify-out/wiki/index.md` for broad navigation. After code changes: `graphify update .`.
