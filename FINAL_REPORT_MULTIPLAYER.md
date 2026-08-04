# FINAL_REPORT_MULTIPLAYER

Monopoly Deal (US edition) — networked multiplayer over HTTP POST + SSE.

## Architecture summary

```
Browser(s)  --POST commands-->  apps/server (Express, Node 22)
            <--SSE projections--  in-memory Room registry
                                      |
                                      v
                               packages/engine (pure dispatch)
                               packages/shared (Zod protocol + ClientGameState)
```

- **Server-authoritative.** The only real `GameState` lives in the room. Clients render `project(state, playerId)` snapshots only.
- **Transport:** HTTP POST `/rooms/:code/commands` + SSE `GET /rooms/:code/events?token=…`. No WebSockets / socket.io / `ws`.
- **Identity:** unguessable `playerToken` per seat; `(playerToken, seq)` idempotency; Origin allowlist.
- **Time:** room scheduler owns turn (60s), JSN (20s), payment/targeting (30s), disconnect grace (60s). Expiry dispatches `FORCE_END_TURN` / `AUTO_RESOLVE_PENDING`.
- **UI:** `networkAdapter` on `/` and `/game`; `localAdapter` on `/local` (pass-and-play unchanged).

## Protocol reference (v1)

### Command POST body
```json
{ "v": 1, "playerToken": "…", "seq": 0, "type": "PLAY_CARD", "payload": { } }
```
Ack: `{ "ok": true }` or `{ "ok": false, "reason": "…", "code": "validation"|"unauthorized"|… }`.

### SSE event types
`projection` | `event` | `roomUpdate` | `error` — each with monotonic `id`. First event on (re)connect is a full projection when playing. Comment ping every 15s.

### Lobby
- `POST /rooms` — create  
- `POST /rooms/:code/join` — join  
- `POST /rooms/:code/start` — host start (2–5 players)  
- `POST /rooms/:code/leave` — lobby only  

Schemas: `packages/shared/src/protocol.ts`. Projection: `packages/engine/src/project.ts`.

## How to run locally

```bash
pnpm install

# Terminal 1 — API
pnpm --filter @monopoly-deal/server start
# http://127.0.0.1:8787

# Terminal 2 — UI (proxies /rooms in dev; or set VITE_API_URL=http://127.0.0.1:8787)
pnpm --filter @monopoly-deal/web dev
# http://127.0.0.1:5173  → lobby
# http://127.0.0.1:5173/local → pass-and-play
```

### Verification

```bash
bash verification/verify.sh          # typecheck, lint, engine tests, redaction, sim 500, server tests, netSim 100
pnpm --filter @monopoly-deal/verification run e2e-net
pnpm --filter @monopoly-deal/verification exec tsx netSim.ts 500 1
```

## Decisions (new for multiplayer)

| ID | Summary |
|----|---------|
| D12 | HTTP POST + SSE (not WebSockets / socket.io) |
| D13 | Production shuffle is CSPRNG; seeds test-only |
| D14 | Auto-payment: bank first, then incomplete sets, then break completes; no multicolor wilds |
| D15 | Express + in-memory rooms (no Redis/DB) |

Earlier rules decisions D1–D11 unchanged. See `DECISIONS.md`.

## Known limitations

- Rooms are process-local; restart loses all tables.
- No accounts, matchmaking, spectators, or chat networking.
- UI multi-client “play to win” is best-effort; authoritative termination is `netSim.ts` / `simulate.ts` (see `VERIFICATION_DISPUTES.md` V1).
- Dev/e2e may set `VITE_API_URL` so EventSource talks to the API origin directly (CORS allowlisted).
- Scheduler tracks a single pending deadline at a time; `payment_round` fan-out auto-resolves all active seats on expiry.

## Cloud deployment checklist

Do **not** implement these in this phase — for a human follow-up:

1. **Single-machine host** — one Node 22 process (same as local); pick a host (Fly, Railway, a VM) with enough RAM for in-memory rooms.
2. **TLS + HTTP/2 in front of SSE** — terminate TLS at a reverse proxy that speaks HTTP/2 to browsers (avoids HTTP/1.1 six-connection limit).
3. **Disable proxy buffering** on the events endpoint (`X-Accel-Buffering: no`, no response buffering) so SSE pings and projections flush immediately.
4. **Origin allowlist config** — set `ORIGIN_ALLOWLIST` to the real web origin(s); never `*`.
5. **Room GC tuning** — adjust empty-socket (5 min) and finished-game (10 min) windows for production traffic; consider metrics on room count / SSE clients.
6. Optional later (see `IDEAS_LATER.md`): graceful drain, sticky sessions if ever multi-process, persistence — explicitly out of scope here.
