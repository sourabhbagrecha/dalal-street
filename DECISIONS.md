# Decisions Log

Ambiguities and conflicts resolved while implementing Monopoly Deal.

## D1 — Action card counts: `general_rules.md` vs `card.md`

- **Question:** How many Forced Deal and Hotel cards are in the deck?
- **Conflict:** `general_rules.md` §6 lists 3 Forced Deal and 2 Hotels. `card.md` lists 4 Force Deal and 3 Hotels.
- **Choice:** Trust `general_rules.md`: **3 Forced Deal**, **2 Hotels**, **3 Houses**.
- **Rationale:** AGENTS.md says resolve conflicts using `general_rules.md` plus topical FAQs.
- **Sources:** `game_rules/general_rules.md`, `game_rules/card.md`

## D2 — Quick Start Rules and 110-card conservation

- **Question:** Are the 4 Quick Start Rules part of the engine deck?
- **Choice:** Include all **110** cards. At `createGame`, the 4 rule cards move to `outOfPlay` and never enter draw/hand/board. Playable deck is 106.
- **Rationale:** Setup says remove rule cards; verification requires conservation of 110.
- **Sources:** `game_rules/general_rules.md` §2, §5, §6; `game_rules/high_level_instructions.md`

## D3 — Win with duplicate set colors

- **Question:** Must the 3 winning sets be different colors?
- **Conflict:** `high_level_instructions.md` says “DIFFERENT COLORS”; `property_rules.md` §1 says you can win with two full sets of the same color.
- **Choice:** Allow **same-color** completed sets to count toward the win (per property FAQ).
- **Rationale:** Topical FAQ is more specific; common digital-play interpretation.
- **Sources:** `game_rules/property_rules.md` §1, `game_rules/high_level_instructions.md`

## D4 — House + Hotel rent bonus

- **Question:** Is House+Hotel +$7M or +$4M on rent?
- **Conflict:** Site prefers $7M; notes Hasbro email confirmation of $4M (hotel replaces house).
- **Choice:** **+$4M total** when a hotel is present (hotel replaces house bonus); **+$3M** for house only.
- **Rationale:** Prefer Hasbro-confirmed ruling for a digital ruleset.
- **Sources:** `game_rules/house_hotel_rules.md` §5

## D5 — Just Say No on dual-color rent / birthday

- **Question:** Does JSN cancel the action for everyone or only the respondent?
- **Choice:** JSN cancels **only for the respondent**. Other players still pay.
- **Rationale:** `just_say_no_rules.md` §7 — “most people play that it only no's the action for you.”
- **Sources:** `game_rules/just_say_no_rules.md` §7

## D6 — Double the Rent without a following Rent

- **Question:** What if Double the Rent is played but no rent follows before end of turn?
- **Choice:** Doubles are cleared at end of turn unused; the Double card is already discarded and counted as a play.
- **Rationale:** Standard digital play; doubles only modify a rent played later in the same turn.
- **Sources:** `game_rules/rent_rules.md` §2, §5

## D7 — Purple vs Pink

- **Question:** Is the set called purple or pink?
- **Choice:** Engine id `pink` (US edition magenta/pink). Theme layer displays the US name.
- **Rationale:** Canonical US edition naming; `card.md` “Purple” maps to the same set.
- **Sources:** `game_rules/card.md`, `game_rules/general_rules.md`

## D8 — Orphaned House/Hotel after set-break

- **Question:** How are orphaned buildings represented?
- **Choice:** As a `PropertySet` with `cards: []` and `house`/`hotel` set, same color as the broken set. Stealable via Sly/Forced Deal; not a complete set; no rent. When emptying a set that still has buildings, buildings are salvaged into orphan sets.
- **Rationale:** `house_hotel_rules.md` §8.
- **Sources:** `game_rules/house_hotel_rules.md` §8

## D9 — Deadlock when draw and discard are empty

- **Question:** What if every playable card is on boards/banks, hands are empty, and nobody can complete a third set?
- **Choice:** Disallow banking Sly Deal and Forced Deal via legal commands (they may still be hand-limit discarded). Deal Breaker may be banked as $5M per official rules. Keeping Sly/Forced unbankable keeps those steal cards recirculating through the discard/draw cycle so random play is less likely to soft-lock with all steal cards permanently banked.
- **Rationale:** Official rules allow banking all action cards; partial restriction trades paper flexibility for sim stability. Deal Breaker banking was restored per `high_level_instructions.md` and `deal_breaker_rules.md` ("Can also be banked as money").
- **Sources:** `game_rules/general_rules.md` §14–15; verification `assertWinnerHasThreeSets`

## D10 — Rearrange options in getLegalCommands

- **Question:** Should every wild×color rearrange appear in `getLegalCommands`?
- **Choice:** Only rearranges that would complete a set are listed in `getLegalCommands` (bot/sim). Full options are exposed via `getLegalRearranges` for the UI.
- **Rationale:** Uniform random bots otherwise spend almost all moves rearranging and exceed the 5000-dispatch cap.
- **Sources:** verification `simulate.ts` termination requirement

## D11 — Property street names and rent catalog

- **Question:** Should property cards carry official street names and a single source for set size / rent?
- **Choice:** Yes. `PROPERTY_SET_DEFS` in `packages/shared/src/properties.ts` lists each US-edition title, bank value, and rent-by-count; `SET_SIZES` / `RENT_TABLE` are derived from it; `buildDeck` emits one named `PropertyCard` per title; the UI shows the rent schedule instead of repeating the color name.
- **Rationale:** Official card faces print unique titles and the rent table; color-only cards made the hand UI repeat the same label and hid rent info players need.
- **Sources:** Official US property / wildcard card faces; `game_rules/card.md`

## D12 — Transport: HTTP POST + SSE (not WebSockets)

- **Question:** WebSockets, socket.io, or HTTP POST + SSE for multiplayer?
- **Choice:** **HTTP POST** for commands and **SSE** for server→client streams. No WebSocket / socket.io / `ws` code anywhere.
- **Rationale:** Fixed in AGENTS.md for this phase: boring Node 22 single-process transport, native EventSource reconnection, Origin allowlist without WS upgrade complexity. Full-JSON projection snapshots on every push (no deltas).
- **Sources:** `AGENTS.md` §8–9

## D13 — Production shuffle is CSPRNG; seeds are test-only

- **Question:** How is the deck shuffled in networked games, and can clients learn the seed?
- **Choice:** `createGame(playerIds)` uses `crypto.getRandomValues` (CSPRNG). Seeded Mulberry32 remains available only via `createGame(playerIds, seed)` / `{ seed }` for tests and sims. `state.seed` is `0` when unseeded; projections and client payloads never include `seed` or the deck array.
- **Rationale:** Deck secrecy is a physical-game invariant; injectable seeds stay for deterministic verification only.
- **Sources:** `AGENTS.md` §4; `packages/engine/src/createGame.ts`, `rng.ts`

## D14 — Auto-payment card selection

- **Question:** How does the server choose cards when a payment window times out?
- **Choice:** `computeAutoPayment` picks the cheapest sufficient combination: bank cards first (ascending value), then properties from incomplete sets, then completed sets only if unavoidable. Multicolor wilds are never payable. If total payable assets are below the debt, pay everything payable.
- **Rationale:** Matches AGENTS.md fixed payment-window parameters and physical-game “pay what you can.”
- **Sources:** `AGENTS.md` fixed parameters; `game_rules/payment_rules.md` §10–12

## D15 — Express + in-memory rooms (no Redis)

- **Question:** Where do rooms and game state live?
- **Choice:** Single Node 22 process, `Map<roomCode, Room>` in memory. No Redis/DB. Dead rooms GC'd after empty sockets > 5 min or finished games > 10 min.
- **Rationale:** AGENTS.md out-of-scope list forbids persistence; local multiplayer verification is the exit.
- **Sources:** `AGENTS.md` §6, out of scope
