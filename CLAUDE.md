# CLAUDE.md

## What this is

An online version of the Monopoly Deal card game: a pure rules engine, an Express/SSE server that hosts multiplayer rooms, and a React web client that can run either as local pass-and-play or against the network server. Rule text lives in `/game_rules`.

## Commands

Monorepo managed with pnpm workspaces (`packages/*`, `apps/*`, `verification`).

```bash
pnpm build                # build all packages
pnpm typecheck             # typecheck all packages
pnpm lint                  # lint all packages
pnpm test                  # engine unit tests only (vitest)
pnpm dev                   # run the web client (vite)
pnpm server                 # run the server (tsx watch)
pnpm verify                 # full verification pipeline, see below
```

Full verification pipeline (`verification/verify.sh`, run via `pnpm verify`) runs in order: workspace typecheck → workspace lint → engine vitest → redaction tests → server integration tests → 500-game headless simulation (`simulate.ts`) → 100-game networked simulation (`netSim.ts`). This is the CI gate; run it before considering non-trivial work done.

Package-scoped commands (run with `pnpm --filter <name> <script>`, e.g. `pnpm --filter @monopoly-deal/engine test`):

- `@monopoly-deal/engine`, `@monopoly-deal/shared`: `typecheck`, `lint`, `build`; engine also has `test` / `test:watch` (vitest)
- `@monopoly-deal/server`: `dev` (tsx watch), `start`, `typecheck`, `lint`, `test` (vitest run, includes `integration.test.ts`)
- `@monopoly-deal/web`: `dev`, `build` (tsc + vite build), `typecheck`, `lint`
- `@monopoly-deal/verification`: `simulate` (headless engine-only sim), `e2e` (local pass-and-play Playwright suite), `e2e-net` (networked multi-client Playwright suite)

Run a single vitest test file: `pnpm --filter @monopoly-deal/engine exec vitest run src/rules.test.ts`. Run a single Playwright spec: `pnpm --filter @monopoly-deal/verification exec playwright test -c e2e/playwright.config.ts happy-path.spec.ts` (swap `e2e` → `e2e-net` for the networked config). Both Playwright configs boot their own dev server(s) via `webServer` (web on `127.0.0.1:5173`; `e2e-net` also boots the server on `127.0.0.1:8787`), so no manual server startup is needed before running specs.

## Dev environment

Web (`127.0.0.1:5173`) and server (`127.0.0.1:8787`) are already running in a separate terminal — never launch `pnpm dev`/`pnpm server` yourself for manual checks; just hit the running instances. For UI iteration/verification, prefer the Playwright MCP over `claude-in-chrome`.

## Architecture

### Layout

- `packages/engine` — pure, deterministic rules engine. **The crown jewel of this codebase: do not rewrite, restructure, or add network/time/IO concepts to it.** No wall-clock, no randomness outside an injectable RNG (`rng.ts`), no side effects.
- `packages/shared` — shared types and the wire protocol (`protocol.ts`, `clientState.ts`, `types.ts`, `properties.ts`) used by both server and web.
- `apps/server` — Express + SSE multiplayer server. Holds authoritative `GameState` per room, dispatches commands into the engine, projects state per player, and runs turn/interrupt timers.
- `apps/web` — React client. Supports two modes via a common store adapter interface: `localAdapter.ts` (in-browser pass-and-play, drives the engine directly) and `networkAdapter.ts` (talks to `apps/server` over HTTP + SSE). `useStore.ts` / `store/types.ts` define the mode-agnostic `GameStoreApi` that components consume.
- `verification` — append-only test/simulation suite: engine simulation (`simulate.ts`), networked simulation (`netSim.ts`), redaction tests, and two Playwright suites (`e2e` local, `e2e-net` networked).
- `game_rules/` — source-of-truth rule text the engine was built against.

### Server-authoritative model (non-negotiable, v1)

- The server holds the only real `GameState`. Clients send commands, render only what the server sends — **no client-side prediction or reconciliation**.
- **Hidden information via projections.** The full `GameState` never leaves the server. `project(state, playerId) => ClientGameState` (in `packages/engine`, next to the engine, tested like the engine) redacts to: own hand in full, opponents as hand counts, deck as a count, discard top visible, pending-stack entries redacted to what that player may know.
- **Deck secrecy.** Shuffle uses CSPRNG server-side; seeds are injectable only in test builds. Seed/deck order/full state must never appear in any payload, log, or client-facing error.
- **Identity.** On room join the server issues an unguessable `playerToken` bound to a seat. Every command POST and SSE subscription carries it; the server rejects commands whose token doesn't match the acting player. No accounts — tokens die with the room.
- **Rooms are in-memory only**: one Node process, `Map<roomCode, Room>`. 6-character uppercase room codes (unambiguous alphabet: no O/0/I/1). No database, no Redis, no persistence across restarts. Dead rooms (all sockets gone > 5 min, or game over > 10 min) are GC'd.
- **Time lives in the server, not the engine.** A room scheduler tracks deadlines and dispatches ordinary engine commands on expiry (auto-decline, auto-pay, force end turn). The engine stays wall-clock-free and deterministic under test.
- **Thin server.** Server = transport + rooms + token auth + scheduler + projection calls + engine dispatch. Zero game rules live in the server; if the server needs to know a rule, expose a validator from the engine instead.

### Transport

HTTP POST + SSE — **no WebSockets anywhere**.

- Commands: `POST /rooms/:code/commands`, body `{ v: 1, playerToken, seq, type, payload }`. Synchronous ack: `{ ok: true }` or typed `{ ok: false, reason }`. Client `seq` increments per command; server ignores duplicate `(playerToken, seq)` (idempotent retry).
- Server → client: one SSE stream per player per room, `GET /rooms/:code/events?token=…`. Event types: `projection`, `event`, `roomUpdate`, `error`, each with a monotonically increasing `id`.
- All inbound payloads validated with Zod at the boundary; malformed input dies there, never inside dispatch.
- Origin/CORS validated against an allowlist on both endpoints.
- Heartbeat: SSE comment ping every 15s; a seat is disconnected when its socket closes or two consecutive pings fail — feeds the 60s disconnect grace.
- Reconnection relies on native `EventSource` auto-reconnect: on any (re)connect with a valid token the server sends a full projection snapshot first, then continues streaming. Recovery is always "full snapshot", never event replay.
- Full-JSON snapshots always — every state push is a complete projection; no delta/patch updates.
- Dev serves SSE through the Vite proxy (same origin) to dodge the HTTP/1.1 six-connection-per-origin limit; production must sit behind HTTP/2.

### Fixed game-experience parameters (do not reinterpret)

- Turn time limit: **60s**. On expiry: server auto-discards to hand limit (highest-value cards kept) and ends the turn.
- Just Say No response window: **20s**. On expiry: auto-decline.
- Payment selection window: **30s**. On expiry: auto-pay with cheapest sufficient combination — bank cards first, then properties ascending by value, breaking completed sets only if unavoidable; multicolor wilds are never payable.
- Other targeting/choice interrupts (rent color, steal target, set choice): **30s**. On expiry: the pending action is cancelled and the play is forfeited (card stays discarded, play consumed).
- Disconnect grace: **60s**, seat marked disconnected in every projection; while disconnected that seat's windows resolve via the same auto rules. A room fully disconnected past grace is abandoned and GC'd.
- Players per room: 2–5. Game starts only on explicit host start with 2+ seated.

### Standards

- Runtime: Node 22 LTS, single process — no workers, no clustering.
- HTTP framework: Express (decided; don't switch). No socket.io/ws/WebSocket code.
- TypeScript strict everywhere; no `any` in engine, projection, or protocol code. Zod schemas for every inbound message.
- Vitest for unit/integration; Playwright multi-context for e2e.

### Playing card sizing (non-negotiable)

Every rendered `.playing-card`, at every size (`sm`/`md`/`lg`/`board`) and in every browser, must satisfy **both** of these at once:

1. **Strict 5:7 width:height.** Never taller, never wider, never "close enough."
2. **Face content is never visually clipped.** A rent table, a long city name, a wildcard's two stacked halves — none of it may be cut off to make (1) true.

These are in tension, because the card's size is driven by `aspect-ratio: 5 / 7` on `.playing-card` (`apps/web/src/styles.css`) while its content is laid out with plain `display: flex; flex-direction: column`. If a card's content ever needs more height than the ratio allows, **Chromium and WebKit disagree on what happens**: Chromium silently clips the overflow and keeps the box correct; WebKit (and Firefox) instead let the box grow past 5:7 to fit the content. It's the same underlying bug — content outgrew its box — but only one engine makes it visible, which is exactly how this shipped unnoticed before: a Chromium-only check (a screenshot, a manual look, a Chromium-only Playwright run) will not catch it.

**The fix already in place**, both on `.playing-card` in `styles.css` — do not remove either half of it, and route any new card-face content through it rather than adding a new fixed px metric:

- `contain: size` — the ratio-guarantee backstop. The box is sized from `width` + `aspect-ratio` alone, full stop; content can never inflate it, in any engine.
- `--card-scale: min(1, calc(100cqw / var(--card-ref, 160px)))` (`container-type: inline-size` on the same element) — the content-fit half. Every additive vertical measurement in the property/wildcard face (padding, the value badge, the rule, each rent row, rent icons, fonts) is `calc(<px> * var(--card-scale))` instead of a bare px, so the face's total height is a constant proportion of the card's own width — the same proportion at any width, which is what lets it fit a 5:7 box unconditionally instead of only above some hand-tuned floor.

  **`--card-ref` is per-card, not one flat number** — `.playing-card--property`/`.playing-card--wild` compute it from `--rent-rows` (`92px + 28px * N`, or `92px + 19px * N` for a wildcard's two stacked halves, each divided down for a safety margin), and `PlayingCard.tsx` sets `--rent-rows` inline from `RENT_TABLE[card.color].length` — it's the only thing that knows which colour(s) a given card is. **Do not go back to one flat reference sized for the worst case (a 4-row, railroad-length set).** That was the first version of this fix, and it was a real regression: it shrank every 2- and 3-row card — the common case — as hard as the rare 4-row one, which is what made ordinary rent text hard to read on a phone. Row-count-aware scaling is what lets a short set stay near full size while a long one still safely fits.

If you add a new property/wildcard-face element that stacks additional height (a new row type, a longer badge, an extra line of text), it must go through `--card-scale` too, and the worst case to check against is a **4-row rent table** (the railroad-length sets are the longest in the deck) — on a wildcard, both halves get one, so that's two 4-row tables stacked in one card.

**Verify with `verification/e2e/card-aspect-ratio.spec.ts`**, not by eyeballing a Chromium screenshot. It sweeps a synthetic worst-case property card and worst-case wildcard (4 rent rows, long city name) across the hand fan's real width range and asserts both invariants. Its `webkit` Playwright project (`verification/e2e/playwright.config.ts`) is the one that actually exercises the box-growth failure mode — run it explicitly:

```bash
pnpm --filter @monopoly-deal/verification exec playwright install webkit   # once per machine
pnpm --filter @monopoly-deal/verification exec playwright test -c e2e/playwright.config.ts card-aspect-ratio.spec.ts
```

A Chromium-only run of this file is not sufficient evidence the ratio holds — see the wildcard test's Chromium result when this fix was reverted during development: it caught clipping there too, but a *property* card with just one overflowing row did not fail under Chromium, only under WebKit.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
