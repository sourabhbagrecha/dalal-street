# Table UI migration: /scratchpad lab → real game

Goal: the layout, gestures and animations iterated in the `/scratchpad` lab ("The Table": felt table + camera,
tray hand fan, stage choreography) become the real game screen for `/rooms/:code` (network) and `/demo`.
Server, engine, projection, store adapters, card faces stay untouched (hard rules in CLAUDE.md).

Progress is tracked here. Tick a box only when verified (typecheck + visual check where UI).

## Architecture

- `apps/web/src/table/` — new home of the screen (moved out of `pages/scratchpad/`).
  - `model.ts` — `TableGame` view-model contract + pure helpers (Seat, Prompt, Beat, Fx, zonesFor…).
  - `TableScreen.tsx` — the lab `Table.tsx`, generalised to consume `TableGame` (no mock imports).
  - `useLiveGame.ts` — maps store snapshot (`ClientGameState` + `useGameStore` API) → `TableGame`.
  - `beats.ts` — event log + projection → `Beat`s the stage acts out.
  - `kit.tsx`, `useCardDrag.tsx`, `handLayout.ts`, `tableGlance.tsx`, `stage/*` — moved lab code.
- Lab mock (`pages/scratchpad/mockGame.ts`) keeps implementing `TableGame` until the very end (harness for
  staging animations); removed/kept per cleanup decision below.
- Server-authoritative: `useLiveGame` only renders projections + posts commands. No client rules beyond what
  the store already exposes (`getLegalPlayZones`, `pickPlayCommand`, `validatePayment`, `wastedDiscardPlay`…).
- Old confirm dialogs (`GamePrompts.tsx` PromptShell family: WastedPlay, ActionBank, BuildingChoice, RentDouble,
  JSN, payment round status) are reused where the lab has no design.

## Lab → real game gaps (must be built)

| Lab | Real game needs |
| --- | --- |
| mock prompts: target/pay/jsn/discard | forced deal (2-step), house/hotel placement, rent colour + rent player choice, payment_round (multi payer + status), JSN chain, hand-limit N-select + "play instead", double-rent pending |
| drop = instant bank/build/play | confirm: action→bank, house/hotel cash-vs-build, wasted play, rent + Double the Rent, wild colour pick, wild flip (REARRANGE_PROPERTY) |
| mock beats | beats derived from log events + projection diff |
| manual DRAW | auto-draw on turn start (keep) + tap deck fallback |
| no chat/log/dev/conn | chat + feed sheet, /demo dev controls (fixture + seat switch), reconnect banner, room code/lobby link, win overlay w/ restart, sound, timers from `deadlines` |

## Decisions

1. Table Moments UI (MomentCallout, NoticeStack, attention glows) is superseded by stage choreography + HUD line +
   fx stamp + log sheet. `moments/derive` + `copy` may be reused as text source. Cleanup decides what is dead.
2. e2e: keep testids stable where the lab UI allows; specs whose *interaction* changed (drag → pointer drag,
   rival tap + TAKE, moments) are edited minimally and listed under "e2e changes" below.
3. Auto-draw stays (existing behaviour).

## Phases

- [x] P0 Plan + model extraction + file move (foundation) — me. Lab still renders identically at /scratchpad; `TableScreen(g: TableGame)` in `apps/web/src/table/`.
- [x] P1 `useLiveGame` (state→TableGame, actions, confirmations) — agent A done (`table/useLiveGame.ts`, `table/live/*`, 75 unit tests). Browser-checked on /demo.
- [x] P2 `beats.ts` + unit tests — agent B done (`table/beats.ts`, `liveEvents.ts`, 57 new tests; 164 web tests green). Live-checked on /demo.
- [x] P3 Missing UI in TableScreen — agent C done (`Confirms.tsx`, prompts, wild flip, mock `?scene=` harness).
- [x] P4 Chrome (feed/chat sheet, dev controls, connection, win, sound) + mount in RoomPage/DemoGameApp — agent D done (`table/chrome/*`, `styles/gl-chrome.css`; pages wired to `TableScreen`)
- [x] P5 Integration: `pnpm typecheck`, `pnpm lint`, web unit tests (165) green after wave 1.
- [ ] P6 Playwright visual QA (all animations, prompts, fixtures) + fixes
- [ ] P7 e2e specs updated + `pnpm verify` green + card-aspect-ratio incl. webkit
- [ ] P8 Dead-code deletion (only after P6/P7 confirmed)

## Working agreement (every agent reads this)

- Read `CLAUDE.md` first. Hard rules apply: engine/server/shared are read-only for this migration; mobile-first (393×852 is the
  reference viewport); card sizing invariant; TS strict, no `any`; zod not needed (no new inbound payloads).
- **Never launch `pnpm dev` / `pnpm server`.** Web is at `http://127.0.0.1:5173`, server at `http://127.0.0.1:8787`, already running (HMR).
- Explore with `graphify query "<q>"` first (graphify-out/ exists), then read files. After edits, `graphify update .` is NOT required from agents.
- Typecheck with `cd apps/web && npx tsc --noEmit -p .` and lint with `npx eslint src/table src/pages src/components` (web only).
- Visual checks: Playwright (MCP `mcp__playwright__*` via ToolSearch, or `playwright-cli` skill). Never claude-in-chrome. Screenshots must be
  saved under `/Users/hinalbagrecha/Sourabh Projects/Monopoly Deal Clone/.playwright-mcp/` (MCP file roots) — use `filename: ".playwright-mcp/x.png"`.
  Real-game scenarios: `/demo?players=N` (pass-and-play on a real server room; keys 1..N switch seat) and the fixture dropdown in the dev drawer
  (`standardMidGame`, `debtCollectorChoice`, `doubleRentCombo`, `overHandLimit`, `dealBreakerOnSetWithHotel`, `parallelRentCollection`,
  `doubleJustSayNoChain`, `payBreaksCompletedSet`, `wildcardUsage`, …). Lab mock: `/scratchpad?beat=0|1|2`.
- No `git commit`, no `git stash`, no `git checkout --`. Several agents edit the same working tree at once: only touch the files you own
  (below); when you must touch a shared file (`TableScreen.tsx`, `gl-table.css`) use small `Edit`s on your region, re-reading first.
- The contract between pieces is `apps/web/src/table/model.ts` (`TableGame`, `Prompt`, `Confirm`, `Beat`, `TableActions`). If it truly needs a
  change, make the smallest additive change and say so in your report.
- Report at the end: what you built, file list, anything left undone or surprising. Keep it under ~40 lines.

### File ownership (wave 1)

| Agent | Owns |
| --- | --- |
| A live | `table/useLiveGame.ts`, `table/live/*` |
| B events | `table/liveEvents.ts`, `table/beats.ts`, `table/beats.test.ts` |
| C prompts UI | `table/TableScreen.tsx` (targets, tray, hand, confirms), `table/Confirms.tsx`, mock scenes in `pages/scratchpad/mockGame.ts` + `ScratchpadPage.tsx`, new rules in `styles/gl-table.css` |
| D chrome | `table/chrome/*`, `styles/gl-chrome.css`, `RoomPage.tsx`, `pages/GamePage.tsx` (GameView), `DemoGameApp.tsx`, HUD region of `TableScreen.tsx` |

### Testid contract (keep the old id on the new element that plays the same role; e2e reuse depends on it)

hand: `hand-fan` (tray), `hand-card-{cardId}` (+`data-card-id`) · piles: `draw-pile`, `draw-btn`, `discard-drop` (drop target = the discard pile, also
`data-drop-zone`-free; pointer drag uses `data-zone`), `end-turn-btn`, `turn-banner` · my table: `properties-drop`, `bank-drop` · seats: `opponent-peer-{id}`,
`table-seat-self`, `self-stage`, `opponent-spotlight` (focused rival panel), `opponent-spotlight-sets` · prompts: `payment-prompt[-{payerId}]`, `payment-card-{id}`,
`confirm-payment-btn[-{payerId}]`, `jsn-prompt`, `jsn-play-{cardId}`, `jsn-decline-btn[-{payerId}]`, `hand-limit-prompt`, `confirm-discard-btn`, `resume-play-btn`,
`debt-collector-prompt`, `debt-collector-player-{id}`, `steal-target-prompt`, `steal-card-{cardId}`, `forced-deal-prompt`, `deal-breaker-prompt`,
`deal-breaker-set-{setId}`, `building-prompt`, `building-set-{setId}`, `rent-color-prompt`, `rent-color-{color}`, `rent-player-prompt`, `rent-player-{id}`,
`wasted-play-prompt|-confirm-btn|-undo-btn`, `action-bank-prompt|-cash-btn|-play-btn|-keep-btn`, `building-choice-prompt|-cash-btn|-build-btn|-cancel-btn`,
`rent-double-prompt|-confirm-btn|-plain-btn|-cancel-btn`, `flip-wild-btn-{cardId}` · shell: `win-overlay`, `restart-btn`, `feed-badge`, `table-feed`, `toast-rejected`,
`chat-input`, `chat-send-btn`, `sse-status`. Where one click used to answer a prompt but the lab needs two taps (rival seat + TAKE), put the old id on the
rival's seat/glance button that starts it.

## Log

- P0 done: files moved to `apps/web/src/table/` (git mv), `model.ts` contract, mock adapted (`useMockGame(): TableGame`), seat layout generalised
  to 1–4 rivals (`seatZones`), `choreo` takes `me`. tsc + eslint green; /scratchpad renders identically.
- Wave 1 launched (parallel): A live (`useLiveGame`), B events (`liveEvents`/`beats`), C prompts UI (TableScreen + Confirms + mock scenes), D chrome + page wiring.

- D done. Notes for e2e phase: feed/chat/dev live in a bottom sheet (`Open table feed` button → tabs `feed-tab-feed|chat|dev`; closed sheet is visibility:hidden, so
  `loadFixture`/`switchSeat` helpers and chat specs must open it first). `feed-badge` now always shown (table-moments.spec:173 obsolete). Old `.game-prompt` rules still
  position:fixed with vw widths — check under `.gl__phone` on desktop once C is final. Unused now (cleanup): Toast, WinOverlay, SidePanel, TableFeed, SoundToggle;
  ChatPanel still used by RoomPage waiting room. Unverified live: server-rejected toast, real SSE drop banner, WebKit/iOS keyboard+safe-area.
- A done. Deviations from old UI: pay assets exclude multicolour wild (engine rejects it); counter-JSN prompt `fromId` = who said no; bank_action.canPlay false for JSN;
  building `eligibleSets` = old loose filter (railroad/utility complete sets still listed; engine rejects); local toast guards for sly/forced picks. Open item for C:
  discard-mode `p.sel` cards not visibly marked in tray (`data-sel` only reflects tap-selection). Additive `export`s in GamePrompts.tsx (paymentReasonLabel, jsnFaceCard, jsnThreatLine, wastedPlayCopy).
- B done. Event→beat table lives in B's report (deal, lay, loot, raid, levy, pay, grab, block, toss, reset); rival draws silent; `rearranged`/`set_broken`/`winner` feed-only.
  B made small rival-side edits in `stage/choreo.ts` (toss/block/raid/levy/pay). Known limit: later beats in a batch can't see the card's old position
  (forced-deal SWAP hop is a small lift). Old Table Moments callout still overlays during a grab if still mounted → cleanup.
- C (prompts UI): TableScreen renders every prompt kind of `model.ts` (rent / rent_player / debt_collector / forced_deal own+rival / building picks, hand-limit multi-select + "Play instead", payment with "Breaks a set", Just Say No alert with per-card answers, `wait` seat pulse + camera, wild flip pills, `table/Confirms.tsx` sheet for held plays). Lab scenes: `/scratchpad?scene=<name>` (see `SCENES` in `pages/scratchpad/mockGame.ts`) and `?rivals=1..4`. e2e note: picks pulse forever (`tb-bob`/`gl-pick`), so Playwright `click()` never sees them "stable" — use `emulateMedia({ reducedMotion: 'reduce' })` (`.tb *` stops all animation) or `{ force: true }`.
- C done (see agent C report: mock `?scene=` names forced_own|forced_rival|building|rent|rent_player|debt_collector|discard|pay_break|jsn_multi|wait|flip|confirm_*, `?rivals=1..4`).
  e2e notes from C: picks pulse forever → use reducedMotion emulation or `force:true`; `turn-banner` has `data-turn-id` (no `data-current-seat`); `payment-prompt-{payerId}`
  n/a (Prompt.pay has no payerId); natural same-colour properties have no flip UI (rearrange only for wilds).
- P6 launched: Q1 own-turn flows, Q2 interrupts + rival animations, Q3 networked path (parallel, each fixes what it finds; reports collected below).
- Q1 done (11 defects fixed: rainbow wild colours [engine sends colors: []] → `wildColors()` in model.ts; ask-sheet overflow; drag tag clamp; win/set stamps vs stage; CTA label sizes;
  discard flash after DISCARD; check-badge z-index; predict text for wrong-colour drop; stale raised card after turn change; reconnect banner only on sseStatus 'error';
  wildAsk crash guard). Unverified: house/hotel *build* target pick and multi-colour rent pick in real game (no fixture); action-card drag tag says "Bank" but a confirm follows.
- Q2 (interrupts/rival animations) and Q3 (networked) were STOPPED BY THE USER mid-run, unfinished. Not relaunched. Cleanup of their out-of-scope edits by the lead:
  reverted `packages/engine/src/fixtures.ts` (+`randomMidGame` fixture), removed `packages/engine/src/fixtures.test.ts`, removed `randomMidGame` from `fixtureNames.ts`, and restored
  `/demo` default fixture to `standardMidGame` (e2e depends on it). Patch saved in session scratchpad (`randomMidGame.patch`). KEPT (Q3, allowed area, needs review): `store/networkAdapter.ts`
  (postJson network-failure ack, shared cmd seq across tabs, leaveRoom keeps seat on network error) and `store/session.ts` (`loadSharedCommandSeq`, legacy room code lookup).
  Q2/Q3 scopes not yet visually verified: rival-side animations, multi-payer rounds, JSN chains, networked rooms, reconnect banner.
- Network-lag pass (user-approved plan): the table no longer waits on the round trip to show the viewer's own move. `store/outbox.ts` (serial send, same-`seq` retry, 3 tries: 0 / +0.4s / +1.4s,
  4s per-try timeout; the rest of the queue fails with a line that is down), `store/lagShim.ts` (dev only: `?lag=400&jitter=300&drop=0.3` on any page), `table/live/sent.ts` (pure pending overlay),
  `useLiveGame` (`hand` less `sent`, `plays` less `sent`, `sending: 'end' | 'answer'`), `stage/choreo.ts` (`park` / `bounce`; `lay` + `toss` settle a parked card instead of flying it again),
  `TableScreen` (`syncSent`, CTA "SENDING", prompts dim while a command is out). `GameStoreApi.draw/endTurn/playCard/send` now return `Promise<CommandResult>`. New spec `verification/e2e-net/network-lag.spec.ts`.
  Not covered: rearrange (wild flip) has no pending state; a parked action card (zone `play`) waits on the pile and is dropped 1.5s after the game moves if no beat claims it.
