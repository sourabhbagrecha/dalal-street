Online Monopoly Deal: pure rules engine (`packages/engine`), Express+SSE multiplayer server (`apps/server`), React client (`apps/web`). Rule text: `game_rules/`. Scripts: @package.json. Flow and file map: `docs/ARCHITECTURE.md`.

## Commands

pnpm workspaces monorepo.

- `pnpm build` / `typecheck` / `lint` / `test` (engine + web vitest) / `dev` (web + server in parallel) / `dev:web` (web only) / `server` / `verify`
- `pnpm verify` = CI gate (typecheck → lint → css audit → engine tests → web tests → redaction tests → server integration → headless sim (5 games locally, 500 when `CI` is set) → 100-game net sim). Playwright is not part of it. Run before calling non-trivial work done.
- Playwright suites: `pnpm e2e` (`/demo`, in-browser) and `pnpm e2e:net` (networked). Run them separately from `verify` for any UI change.
- Single engine test: `pnpm --filter @monopoly-deal/engine exec vitest run src/rules.test.ts`
- Single Playwright spec: `pnpm --filter @monopoly-deal/verification exec playwright test -c e2e/playwright.config.ts <spec>` (swap `e2e` → `e2e-net` for networked). Configs boot their own servers.

## Tests

- While fixing, rerun only the failing spec; run `verify` + `e2e` + `e2e:net` once at the end.
- One table per test: start with `openDemo(page, fixture)` (`/demo?fixture=`), never `goto('/demo')` then swap. The demo suite runs 4 workers in parallel, so tests must share nothing.
- Page loads are the cost; in-page checks are nearly free. Put every check one table can answer into one test (a prompt's back-out → its next choice), and sweep widths/viewports inside the page (resize), not one test per value.
- Don't duplicate across specs: one spec owns each flow. No "cover everything" scripted-game spec.
- WebKit runs only card geometry (`card-aspect-ratio`). Tag engine-independent tests `@css-audit`.
- Throbbing CTAs (`tb-throb`, infinite) never read as stable: click with `force: true`.

## Map

- `packages/shared` — types, zod protocol, property set defs.
- `packages/engine` — rules, `dispatch` (switch in `dispatch.ts`, handlers in `src/handlers/`), `project`, validators, fixtures.
- `apps/server/src` — `room.ts` rooms + SSE fan-out, `scheduler.ts` timers, `routes.ts`, `db.ts`.
- `apps/web/src/store` — adapters, outbox, session.
- `apps/web/src/table` — TableScreen (parts in `felt/`); `beats.ts` log → beats queue (derivation in `derive/`); `live/` pure prompt + play logic; `chrome/` overlays; `stage/` animation; `Confirms.tsx` confirm prompts.
- `apps/web/src/lobby` — join form and waiting room.
- `apps/web/src/components/card` — card shell + faces.
- `apps/web/src/moments` — event → moment derivation.
- `apps/web/src/styles` — CSS.
- `verification/` — `e2e`, `e2e-net`, `simulate.ts`, `netSim.ts`, `redaction.test.ts`.

Client routes: `/`, `/rooms/:code`, `/game` (redirect), `/demo` (engine in-browser, dev only), `/rules`, `/cards`, `/scratchpad` (empty dev page for design/UI experiments; reset it when done). Flow: `docs/ARCHITECTURE.md`.

## Dev environment

- Web (`127.0.0.1:5173`) and server (`127.0.0.1:8787`) already running in another terminal. **Never launch `pnpm dev`/`pnpm server` yourself** — use the running instances.
- Working across several git worktrees at once: use portless (`pnpm dev:portless`, HTTP) so each branch gets its own URLs — client `http://lagaan-<branch>.localhost`, server `http://lagaan-<branch>-server.localhost` — instead of fighting over 5173/8787. Needs `portless proxy start --no-tls` running (sudo, one-time); setup in `docs/ARCHITECTURE.md`. Same rule as above: don't launch it yourself; ask the user to run it, then point Playwright at the branch URL.
- UI iteration/verification: use Playwright (MCP or CLI) only as and when needed. **Never use claude-in-chrome** — fails to reach the dev server in this environment.

## Design

Mobile-first, always. Mobile beats desktop on any tradeoff.

Every UI change must be checked in a Playwright screenshot (mobile viewport) before it is called done.

## Hard rules

- **Engine is sacred.** `packages/engine` stays pure and deterministic: no wall-clock, no IO, no network concepts, randomness only via injectable RNG. Do not rewrite or restructure it.
- **Server-authoritative.** Clients render only server-sent projections; no client-side prediction or reconciliation of game state. Full `GameState` never leaves the server — `project(state, playerId)` redacts hidden info. One presentation-only exception: the pending overlay (`apps/web/src/table/live/sent.ts`) — a card the viewer just dropped leaves the *rendered* hand and is parked on the stage, and a sent answer stops taking input, until the projection speaks or the command fails and it is undone. It never writes `clientState`, never decides a rule outcome, and never outlives the server's word. Commands leave through a serial outbox (`store/outbox.ts`): one in flight, retried under the same `seq`.
- **Secrecy.** Shuffle seed, deck order, and full state must never appear in any payload, log, or client-facing error. Seeds injectable in test builds only.
- **Thin server.** Zero game rules in the server; if it needs a rule, expose an engine validator.
- **Transport: HTTP POST + SSE only — no WebSockets, no socket.io.** Every push is a full-JSON projection snapshot; no deltas. Recovery = full snapshot, never event replay.
- **Zod-validate every inbound payload at the boundary.**
- Rooms live in memory and are mirrored to one better-sqlite3 file (`apps/server/src/db.ts`, path `MD_DB_PATH`; index.ts defaults to `apps/server/data/`, tests/embedders stay in-memory) so a restart rehydrates every room. After a restart, timers reset to fresh windows and every seat starts in disconnect grace.
- Room URLs: `/rooms/:code` is the one client route for a room (join form → waiting room → table). Seat credentials are stored per room code (`apps/web/src/store/session.ts`); `/game` only redirects.
- TS strict everywhere; no `any` in engine, projection, or protocol code.
- **Time lives in the server scheduler, never the engine.** Fixed windows (do not reinterpret): turn 60s, Just Say No 20s, payment 30s (auto-pay cheapest; bank first; multicolor wilds never payable), other interrupts 30s (expiry forfeits the play), disconnect grace 60s. 2–5 players per room.
- Specs are never weakened to make a regression pass. Update or delete a spec only when the UI it covered was removed or changed on purpose, and say so in the commit message.

## graphify

Knowledge graph at `graphify-out/`. For codebase questions run `graphify query "<q>"` first; `graphify path` / `graphify explain` for relationships/concepts. After code changes: `graphify update .`.
