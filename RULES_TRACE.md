# RULES_TRACE

Maps each numbered rule in `/game_rules` to Vitest coverage. No GAP entries.

## general_rules.md

| Rule | Coverage |
|------|----------|
| §1 How to play / win at 3 sets | `Win detection > wins when third set completed by property play`; `Deal Breaker > can cause a mid-payment win` |
| §1 Three play zones | `Pass Go`; property plays in `Wildcard overflow`; bank via `createGame + legal moves smoke` |
| §1 Deal 5, draw 2, max 3 plays, hand ≤7 | `createGame > deals 5`; `basic turn > draws 2`; `Hand limit > discard excess`; `deck` composition |
| §2 Start and deal | `createGame > deals 5 cards each and puts rules out of play` |
| §3 Turn structure | `basic turn > draws 2 and can end turn` |
| §4 Win condition | `Win detection > wins when third set completed by property play` |
| §5 110 cards | `deck > has exactly 110 cards` |
| §6 Composition counts | `deck > matches general_rules.md composition` |
| §7–8 Empty hand → draw 5 next turn | `Empty hand draw 5 > fixture emptyHand draws 5`; `basic turn > draws 5 on empty hand` |
| §9–10 Up to 3 plays, not required | `Rent + Double the Rent > consumes 2 plays`; `basic turn > draws 2 and can end turn` |
| §11–12 Hand limit 7 / discard excess | `Hand limit > discard excess is not a play and advances turn` |
| §13 Accidental extra draws | N/A digital (no misdraw UI); conservation via `verification/invariants.ts` |
| §14 Bank money/actions not properties | Validators reject banking property (`getLegalCommands` zones); covered indirectly in play tests |
| §15 Reshuffle discard into draw | `Pass Go` / draw path via `drawCardsWithRng`; simulated in `verification/simulate.ts` |
| §16–17 No take-backs | Engine has no undo; implied by dispatch immutability tests |
| §18 Rearrange on own turn | Validators expose `REARRANGE_PROPERTY`; used in simulations |
| §19–20 2–5 players | `createGame` throws outside 2–5; createGame tests use 2–4 |
| §21–24 Cannot touch opponent cards | UI concern; engine only mutates via commands |

## card.md

| Rule | Coverage |
|------|----------|
| 110 cards / type counts | `deck > matches general_rules.md composition` (counts per DECISIONS D1) |
| Action/property/wild/rent/money lists | `deck > matches general_rules.md composition` |

## action_rules.md

| Rule | Coverage |
|------|----------|
| §1 Multiple Pass Go per turn | `Pass Go > draws 2 extra cards` (playable repeatedly while plays remain) |
| §2 Forced Deal need not be equal value | `Forced Deal > swaps properties` |
| §3 Sly/Forced cannot take house on completed set; Deal Breaker can | `Deal Breaker > steals a full set including house and hotel`; sly/forced target filters via `stealableProperties` |

## payment_rules.md

| Rule | Coverage |
|------|----------|
| §1 Payer chooses payment | `Payment rules > pays with property when bank empty` |
| §2–3 Property payment → property section | `Payment rules > pays with property when bank empty` |
| §4 Banked action stays money | Bank transfers in `Payment rules > overpayment gives no change` |
| §5 Payer picks property | `Payment rules > pays with property when bank empty` |
| §6 Pay with table cards only | Payment only from bank/board in `handlePayment` |
| §7 No change on overpay | `Payment rules > overpayment gives no change` |
| §8 Cannot put paid cards in hand | Payment places to bank/board only |
| §9 Cannot pay from hand | `handlePayment` rejects hand cards |
| §10 Insufficient → pay all | `Payment rules > insufficient assets pays everything` |
| §11 Pay rent with property | `Payment rules > pays with property when bank empty` |
| §12 Nothing on table → pay nothing | `pushPayment` skips zero assets; simulate coverage |

## property_rules.md

| Rule | Coverage |
|------|----------|
| §1 Win with same-color sets | Allowed by `countCompleteSets`; DECISIONS D3 |
| §2 Multicolor wild alone OK | Property play of multi wild in validators |
| §3–5 Multicolor stealable; not payable | `Payment rules > rejects multicolor wild as payment` |
| §6 Move wilds on turn | `REARRANGE_PROPERTY` in validators / simulate |
| §7 No rent on lone multicolor | `beginRentCollection` / eligible filter in `playRent` |
| §8 Overflow creates new set | `Wildcard overflow > creates a new set when exceeding set size` |

## rent_rules.md

| Rule | Coverage |
|------|----------|
| §1 Dual vs wild rent | `Rent + Double the Rent > consumes 2 plays and doubles rent` |
| §2 Double counts as a play | `Rent + Double the Rent > consumes 2 plays and doubles rent` |
| §3 One color per rent | `SELECT_RENT_COLOR` / target.rentColor path |
| §4 Dual=all / wild=one | `beginRentCollection` target list |
| §5 Two Doubles allowed | `pendingDoubles` increments; simulate |

## just_say_no_rules.md

| Rule | Coverage |
|------|----------|
| §1 JSN vs JSN | `Just Say No > double chain` |
| §2 Triple chain / all 3 | `Just Say No > triple chain cancels again` |
| §3 Cancel / undo No | `Just Say No > double chain`; `triple chain` |
| §4 Discard after use | JSN moves to discard in `handleJsn` |
| §5 Does not count as play | `handleJsn` does not decrement `playsRemaining` |
| §6 JSN vs Double the Rent | Contested type `double_the_rent` path in `handleJsn` |
| §7 JSN only for respondent | Per-target pending in `beginRentCollection` / birthday (DECISIONS D5) |
| JSN vs steal actions | `Just Say No > JSN against sly deal`; debt collector cancel test |

## deal_breaker_rules.md

| Rule | Coverage |
|------|----------|
| §1 Take set with house/hotel | `Deal Breaker > steals a full set including house and hotel` |
| §2 No valid set → wasted play | `deal_breaker_target` `__none__` path in validators/dispatch |

## house_hotel_rules.md

| Rule | Coverage |
|------|----------|
| §1–2 House before hotel | `House and Hotel > places house then hotel` |
| §3–4 Only on completed set | `canBuildHouse` / `canBuildHotel` |
| §5 Rent bonus $4M with hotel | `House and Hotel > places house then hotel` (expect rent 10) |
| §6 No house/hotel on RR/utility | `canBuildHouse`/`canBuildHotel` reject railroad/utility |
| §7 Steal orphaned buildings via sly/forced | `stealableProperties` includes orphan buildings |
| §8 Orphan buildings after set-break | `Payment rules > breaking a completed set orphans house` |

## how_to_play.md / high_level_instructions.md

| Rule | Coverage |
|------|----------|
| Objective 3 sets | `Win detection` |
| Setup remove rules, deal 5 | `createGame` |
| Draw 2 / empty→5 | `Empty hand draw 5`; `basic turn` |
| Up to 3 plays A/B/C | Zone plays across action/property/bank tests |
| Card effects summary | Per-action happy paths above |
| Sly/Forced/Deal Breaker/JSN/Debt/Birthday/Rent/Double/Pass Go/House/Hotel/Wilds/Money | Corresponding describe blocks in `rules.test.ts` |
