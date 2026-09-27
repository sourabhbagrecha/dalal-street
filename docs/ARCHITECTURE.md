# Architecture

## Command flow

A card dropped on the table travels one way and comes back as a full snapshot:

hand drop → `apps/web/src/store/outbox.ts` (serial outbox, one command in flight, retried under the same `seq`) → `POST /rooms/:code/commands` → `apps/server/src/room.ts` → `dispatch` in `packages/engine/src/dispatch.ts` → `project()` in `packages/engine/src/project.ts` (redacts hidden info per seat) → SSE snapshot → `apps/web/src/store/networkAdapter.ts` → `apps/web/src/table/model.ts` → `apps/web/src/table/TableScreen.tsx`.

Table reactions (the face picker above the tray) take a side path that never touches the game: `POST /rooms/:code/react` → `Room.postReaction` in `apps/server/src/room.ts` (seat check and pacing only) → a one-off `reaction` SSE event to every seat. They are not persisted and not replayed on reconnect; the client shows the viewer's own face the moment it is thrown and skips the room's echo of it. UI lives in `apps/web/src/table/reactions/`, styles in `apps/web/src/styles/gl-reactions.css`.

The engine is pure and knows nothing about time or the network. Every timer lives in `apps/server/src/scheduler.ts`. Every push is a full JSON projection; there are no deltas and no event replay. The only client-side state that runs ahead of the server is the presentation-only pending overlay in `apps/web/src/table/live/sent.ts`, which is undone the moment the server answers.

## Directory map

- `packages/shared/src` — shared types (`types.ts`), the zod protocol for every inbound payload (`protocol.ts`), redacted client state (`clientState.ts`) and property set definitions (`properties.ts`).
- `packages/engine/src` — the rules: `createGame.ts`, `dispatch.ts` (the command switch; each family of handlers lives in `handlers/`), `validators.ts` (exposed so the server never re-implements a rule), `project.ts`, `autoPayment.ts`, `fixtures.ts` for tests and the `/demo` scenarios, and the vitest suites beside them.
- `apps/server/src` — `room.ts` holds rooms and fans SSE snapshots out to seats; `scheduler.ts` owns the fixed turn, interrupt, payment and disconnect windows; `routes.ts` is the HTTP surface; `db.ts` mirrors rooms to one better-sqlite3 file so a restart rehydrates them; `sse.ts`, `tokens.ts`, `roomCode.ts` and `registry.ts` support those.
- `apps/web/src/store` — the client store: `networkAdapter.ts` (SSE in, POST out), `demoAdapter.ts` (engine in-browser for `/demo`), `outbox.ts`, `session.ts` (seat credentials per room code) and `useStore.ts`.
- `apps/web/src/table` — `TableScreen.tsx` renders the felt table from `model.ts`, its parts split out under `felt/` (`layout.ts` world geometry and camera math, hooks for the camera, the hand drag and the stage sync, one component per screen region); `live/` is pure prompt and play logic (`prompts.ts`, `plays.ts`, `seats.ts`, `autopay.ts`); `chrome/` is overlays; `stage/` is card animation; `beats.ts` queues the log into stage beats and feed lines, deriving them per event family in `derive/`; `reactions/` is the reaction picker and the faces thrown at the table; `Confirms.tsx` is the confirm prompts.
- `apps/web/src/lobby` — the join form and waiting room shown at `/rooms/:code` before the table.
- `apps/web/src/components/card` — `PlayingCard.tsx` is the shell; `faces/` holds one face per card kind; `parts/` and `palettes.ts` are shared pieces.
- `apps/web/src/moments` — `derive.ts` exports `deriveMoments` (turns the log into `Moment`s, shaped in `types.ts`), consumed only by `apps/web/src/sound/useSoundEffects.ts` to pick which sound to play; its lower-level helpers (`collectPendingContested`, `synthesizeFaceCard`, `findCardOnTable`, `threatKeyForContested`) are imported directly by `table/derive/` and `table/live/prompts.ts` for beats and confirm prompts, independent of the sound-facing `deriveMoments` pipeline.
- `apps/web/src/styles` — CSS, including `cards.css` where the card sizing invariant lives.
- `apps/web/src/pages` — route pages: lobby, room, rules, card gallery.
- `verification/` — `e2e/` (Playwright against `/demo`), `e2e-net/` (Playwright against real rooms), `simulate.ts` (headless sim), `netSim.ts` (networked sim), `redaction.test.ts`, `invariants.ts` and `verify.sh` (the `pnpm verify` gate).
- `game_rules/` — the rule text; `DECISIONS.md` records how conflicts in it were resolved.

Client routes: `/` (lobby), `/rooms/:code` (join → waiting room → table), `/game` (redirect only), `/demo` (engine in-browser, dev only), `/rules`, `/cards`, `/scratchpad` (empty dev page for design/UI experiments).

## To add X, edit Y

| To add | Edit |
| --- | --- |
| A new card face | `apps/web/src/components/card/faces/` for the face, then register it in `apps/web/src/components/card/PlayingCard.tsx`. Route any new vertical px through `calc(px * var(--card-scale))` and rerun `card-aspect-ratio.spec.ts` including its `webkit` project. |
| A new confirm prompt | `apps/web/src/table/live/prompts.ts` for the pure prompt logic, then `apps/web/src/table/Confirms.tsx` for the UI. |
| A new command | `packages/shared/src/protocol.ts` (zod schema) → an engine validator in `packages/engine/src/validators.ts` → handling in `packages/engine/src/dispatch.ts` and `packages/engine/src/handlers/` → wiring in `apps/server/src/room.ts`. The server never decides a rule itself. |
| A new server timer | `apps/server/src/scheduler.ts`. Time never enters the engine. |
| A new e2e spec | `verification/e2e/`, opening its scenario with `openDemo(page, fixture)` from `verification/e2e/helpers/demo.ts` (one room per test; tests run in parallel). Add the fixture to `packages/engine/src/fixtures.ts` if none fits. |
