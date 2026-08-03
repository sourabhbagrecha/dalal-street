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
- **Choice:** As a `PropertySet` with `cards: []` and `house`/`hotel` set, same color as the broken set. Stealable via Sly/Forced Deal; not a complete set; no rent.
- **Rationale:** `house_hotel_rules.md` §8.
- **Sources:** `game_rules/house_hotel_rules.md` §8
