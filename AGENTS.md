# [AGENTS.md](http://AGENTS.md)

## Source of truth

- All game rules live in `/game_rules`. Read every file there before writing any engine code. If two rules files conflict, resolve using `general_rules.md` plus the topical FAQ files, and record the resolution in `DECISIONS.md` (see below).
- The reference UI screenshot provided by the user is the visual spec. Match its layout, zones, and information hierarchy as closely as possible.

## Architecture (non-negotiable)

1. **Monorepo layout:**
  - `packages/engine` — pure TypeScript game engine. Zero React imports, zero DOM, zero network. This package will later run on a server unchanged.
  - `packages/shared` — types and constants shared by engine and UI.
  - `apps/web` — Vite + React + TypeScript UI. Presentation only.
2. **The engine is a state machine.** `dispatch(state, command) => { state, events, rejected? }`. Components never mutate game state or compute rule legality themselves; they call engine validators to know what is playable.
3. **Structured boards internally.** Player boards are `{ bank: Card[], sets: PropertySet[] }` where `PropertySet = { id, color, cards, house?, hotel? }`. Wildcards carry `assignedColor` when placed. Never model the board as a flat card array internally.
4. **Interrupts are a stack.** `pendingStack: PendingInteraction[]` handles rent demands, payment selection, Just Say No chains, Deal Breaker/Sly Deal/Forced Deal targeting, and hand-limit discard. The UI renders prompts from the top of the stack.
5. **The 110-card deck is canonical engine data**, defined once in `packages/engine/src/deck.ts` with the exact official composition. It is not mock data and must never be regenerated or approximated.
6. **Theme layer.** The engine knows only stable ids (`brown`, `dark_blue`, `railroad`, etc.) and numeric values. All display names, colors, and currency formatting live in a single theme file in `apps/web`. The default theme is the canonical US edition.
7. **Commands that never consume a card play:** responding with Just Say No, hand-limit discard at end of turn, rearranging own properties/wildcards.

## Standards

- TypeScript strict mode everywhere. No `any` in the engine.
- Vitest for engine tests. Tests target the reducer/dispatch directly.
- All files under `/verification` are read-only for the worker once created (see loop prompt). Never edit, delete, skip, or weaken anything there to make a run pass.
- Small, focused commits with descriptive messages after each completed step.

## Code navigation: Graphify

Graphify (v0.9.32) is installed with an always-on Cursor rule and a skill at `.agents/skills/graphify/`. Use it as the first resort for code discovery; it is ~10x cheaper in tokens than reading files broadly.

- Before grepping or opening files to locate something: `graphify query "…"`
- To trace how two modules connect: `graphify path "A" "B"`
- To understand a subsystem: `graphify explain "concept"`
- After any code change: `graphify update .` (or `/graphify .` to rebuild fully)

Always run `graphify update .` after any code change so the graph stays current.

## Decision log

- Whenever a rules ambiguity, contradiction, or unspecified behavior is encountered, pick the most standard/common digital-play interpretation, implement it consistently, and append an entry to `DECISIONS.md` at repo root: the question, the choice made, the rationale, and which rules files were involved. Never resolve the same question two different ways.

