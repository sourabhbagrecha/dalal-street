# [AGENTS.md](http://AGENTS.md)

## Source of truth

- Game rules: `/game_rules`. Rule interpretations already made are locked in `DECISIONS.md`; never re-decide them.
- The existing `packages/engine` is verified and pure. **It is the crown jewel of this codebase. Do not rewrite it, restructure it, or add network/time/IO concepts to it.** Allowed engine changes are limited to what `LOOP_PROMPT_MULTIPLAYER.md` Phase 1 explicitly lists.
- `/verification` remains append-only: never edit, weaken, delete, or skip existing checks. Disputes go to `VERIFICATION_DISPUTES.md` with a corrected check added alongside, old one kept.

## Architecture (non-negotiable)

1. **Monorepo layout:** `packages/engine` (pure, unchanged role), `packages/shared` (types + the new wire protocol), `packages/protocol` OPTIONAL only if shared grows unwieldy, `apps/server` (new), `apps/web` (existing UI, migrated to network client).
2. **Server-authoritative, no optimistic UI in v1.** The server holds the only real `GameState`. Clients send commands, render only what the server tells them. No client-side prediction, no reconciliation logic.
3. **Hidden information via projections.** The full `GameState` never leaves the server. Each client receives a per-player projection: own hand in full; opponents as hand counts; deck as a count; discard top visible; pendingStack entries redacted to what that player may know. Projection is a pure function `project(state, playerId) => ClientGameState` living next to the engine, tested like the engine.
4. **Secrecy of the deck.** Shuffle uses CSPRNG on the server. Seeds are injectable only in test builds. Seed, deck order, and full state must never appear in any payload, log line, or error sent to a client.
5. **Identity and authority.** On room join, the server issues an unguessable `playerToken` bound to a seat. Every command POST and every SSE subscription carries it. The server rejects any command whose token does not match the acting player for that command. There are no accounts; tokens die with the room.
6. **Rooms are in-memory.** One Node process, a `Map<roomCode, Room>`. Room codes are 6 uppercase characters, unambiguous alphabet (no O/0/I/1). No database, no Redis, no persistence across restarts. Dead rooms (all sockets gone > 5 minutes, or game over > 10 minutes) are garbage collected.
7. **Time lives in the server, not the engine.** A room scheduler tracks deadlines and, on expiry, dispatches ordinary engine commands (auto-decline, auto-pay, force end turn). The engine remains wall-clock-free and fully deterministic under test.
8. **Transport: HTTP POST + SSE. No WebSockets anywhere.**
  - Commands: `POST /rooms/:code/commands` with JSON body `{ v: 1, playerToken, seq, type, payload }`. The HTTP response is the synchronous ack: `{ ok: true }` or a typed rejection `{ ok: false, reason }`. Client `seq` increments per command; the server ignores duplicate `(playerToken, seq)` pairs (idempotent retry).
  - Server → client: one SSE stream per player per room at `GET /rooms/:code/events?token=…`. SSE event types: `projection`, `event`, `roomUpdate`, `error`. Every SSE message carries a monotonically increasing event `id`.
  - All inbound payloads are validated with Zod at the boundary; anything malformed dies there with a typed rejection, never inside dispatch.
  - Origin/CORS: both endpoints validate the Origin header against an allowlist. This is not optional just because there is no WS upgrade.
9. **Liveness and reconnection.**
  - Heartbeat: the server writes an SSE comment ping every 15 seconds; a seat is considered disconnected when its response socket closes or two consecutive pings fail to write. This feeds the 60-second disconnect grace.
  - Reconnection: `EventSource` auto-reconnects natively. On any (re)connect with a valid token, the server sends a full projection snapshot as the first event, then continues the stream. `Last-Event-ID` may be used to detect the gap, but the recovery action is always "full snapshot," never event replay.
  - Deadlines in projections are expressed as remaining milliseconds at send time; clients count down locally and accept small drift.
  - Dev serves SSE through the Vite proxy (same origin) to avoid the HTTP/1.1 six-connection-per-origin browser limit; production must sit behind HTTP/2.
10. **Thin server.** The server contains: transport, rooms, auth-by-token, scheduler, projection calls, engine dispatch. It contains zero game rules. If a change requires the server to know a rule, the design is wrong; expose a validator from the engine instead.

## Fixed game-experience parameters (do not reinterpret)

- Turn time limit: **60 seconds**. On expiry: server auto-discards to hand limit (highest-value cards kept) and ends the turn.
- Just Say No response window: **20 seconds**. On expiry: auto-decline.
- Payment selection window: **30 seconds**. On expiry: server auto-pays with the cheapest sufficient combination, bank cards first, then properties by ascending value, breaking completed sets only if unavoidable; multicolor wilds are never payable.
- Other targeting/choice interrupts (rent color, steal target, set choice): **30 seconds**. On expiry: the pending action is cancelled and the play is forfeited (card stays discarded, play consumed).
- Disconnect grace: **60 seconds** with the seat marked disconnected in every projection; while disconnected, that seat's windows resolve by the same auto rules. A room where every seat is disconnected past grace is abandoned and GC'd.
- Players per room: 2 to 5. Game starts only on explicit host start with 2+ seated.

## Standards

- Runtime: Node 22 LTS, single process, boring on purpose. No workers, no clustering.
- HTTP framework: Express (recorded as decided; do not switch). No socket.io, no ws, no WebSocket code of any kind.
- Full-JSON snapshots always: every state push is a complete projection. Never introduce delta/patch updates.
- TypeScript strict everywhere, no `any` in engine, projection, or protocol code. Zod schemas for every inbound message.
- Vitest for unit/integration; Playwright multi-context for e2e.
- Small commits per completed step with descriptive messages.
- Always run `graphify update .` after any code change so the graph stays current.

## Decision log

Append every newly encountered ambiguity to `DECISIONS.md` with question, choice, rationale. Never resolve the same question two different ways. The fixed parameters above are already decided and are not ambiguities.

## Out of scope for this phase (do not build)

Accounts, matchmaking, persistence, database or cache of any kind (no Redis, no Postgres, no MongoDB, regardless of familiarity), game-summary share links, graceful deploy drain, spectators, chat moderation, horizontal scaling, cloud deployment configs, optimistic UI, delta updates, WebSockets. If tempted, write the idea to `IDEAS_LATER.md` and move on.