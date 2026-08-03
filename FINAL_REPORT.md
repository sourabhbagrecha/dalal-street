# FINAL_REPORT

Monopoly Deal (US edition) — local pass-and-play browser game.

## What was built

- **`packages/engine`** — Pure TypeScript state machine: `createGame`, `dispatch`, `getLegalCommands`, canonical 110-card deck, fixtures, Vitest rule coverage.
- **`packages/shared`** — Shared types (`GameState`, `Card`, `Command`, `PendingInteraction`, `GameEvent`, constants).
- **`apps/web`** — Vite + React UI matching the reference layout: opponent rail, felt center, properties/bank, fanned hand, table feed, seat switcher (1–4), scenario dropdown, drag-and-drop play, interrupt prompts, win overlay. Theme isolated in `apps/web/src/theme.ts` (US `$M` currency and names).
- **`verification/`** — Read-only invariants, 500-game bot simulator (`simulate.ts`), `verify.sh`, Playwright e2e specs.

### Gameplay covered

Draw 2 (5 on empty hand), up to 3 plays, bank/properties/discard, Pass Go, Rent (+ Double the Rent), Birthday, Debt Collector, Sly Deal, Forced Deal, Deal Breaker, Just Say No chains, House/Hotel, payment with properties and set-break orphans, wild assignment/rearrange, hand-limit discard, win at 3 complete sets. Four hot-seat players on one screen.

## Decisions (`DECISIONS.md`)

| ID | Summary |
|----|---------|
| D1 | Same-color sets may count toward the win |
| D2 | House+Hotel rent bonus = +$4M (hotel replaces house) |
| D3 | Just Say No applies only to the respondent |
| D4 | Unused Double the Rent clears at end of turn |
| D5 | Engine id `pink` for US magenta/pink set |
| D6 | Orphaned house/hotel as empty-card property sets |
| D7 | Cannot bank Deal Breaker / Sly / Forced via legal commands (anti-deadlock) |
| D8 | `getLegalCommands` only lists set-completing rearranges; full list via `getLegalRearranges` |

## Known limitations

- Chat is visual-only (not networked).
- Opponent “Tap to view full board” is informational; seat switcher is the pass-and-play control.
- Banking Deal Breaker / Sly Deal / Forced Deal is intentionally omitted from legal moves (D9); paper rules allow it.
- Multicolor wilds and complex forced-deal targeting UIs are functional but dense on small viewports.
- No online multiplayer / server yet (engine is server-ready and DOM-free).

## How to run the game

```bash
pnpm install
pnpm --filter @monopoly-deal/web dev
```

Open the Vite URL (default http://127.0.0.1:5173). Use seats 1–4 (or keys) to pass the device. Dev scenario dropdown loads fixtures; New Game starts a seeded live match.

## How to run verification

```bash
# Full gate: typecheck, lint, Vitest, 500 random games
bash verification/verify.sh

# Longer stress sim
pnpm --filter @monopoly-deal/verification exec tsx simulate.ts 2000 1

# Playwright e2e (starts Vite automatically)
cd verification && pnpm run e2e
```

## Phase 4 exit checklist

- Five consecutive stabilization iterations with **zero** invariant violations on 2000-game sims
- `verify.sh` green
- Full e2e suite green (including `full-scripted-game.spec.ts`) across repeated runs
- `RULES_TRACE.md` has no GAP entries
- `DECISIONS.md` records all ambiguities

**Stopped here per loop exit condition.**
