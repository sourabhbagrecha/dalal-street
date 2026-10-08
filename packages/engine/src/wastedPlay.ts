import type {
  ClientGameState,
  PlayerBoard,
  PropertyColor,
  RentCard,
} from '@monopoly-deal/shared';
import { selfOf } from '@monopoly-deal/shared';
import {
  boardAssetValue,
  canBuildHotel,
  canBuildHouse,
  completeSetsOnBoard,
  isMulticolorWild,
  stealableFromBoard,
} from './board.js';

/**
 * Why a card played to the discard pile would do nothing for the player.
 *
 * The engine happily accepts every one of these — the card is discarded, the
 * play is consumed, and nothing happens — which is correct by the rules but is
 * almost never what a player meant. Clients use this to ask "really?" before
 * spending the play. Rules knowledge belongs here rather than in the UI, so
 * this mirrors the eligibility checks `dispatch` and `validators` already make.
 */
export type WastedPlayReason =
  | { kind: 'rent_no_colors' }
  | { kind: 'sly_deal_no_targets' }
  | { kind: 'forced_deal_no_own' }
  | { kind: 'forced_deal_no_targets' }
  | { kind: 'deal_breaker_no_sets' }
  | { kind: 'building_no_set'; building: 'house' | 'hotel' }
  | { kind: 'double_rent_no_rent' }
  | { kind: 'nobody_can_pay'; action: 'debt_collector' | 'its_my_birthday' | 'rent' };

/**
 * Colors a rent card could actually charge for, given a board. Mirrors the
 * `eligible` computation in `playRent` — a set holding nothing but a
 * multicolor wild is not a rentable color.
 */
export function rentEligibleColors(board: PlayerBoard, card: RentCard): PropertyColor[] {
  const owned: PropertyColor[] = [];
  for (const s of board.sets) {
    if (s.cards.length > 0 && !owned.includes(s.color)) owned.push(s.color);
  }

  if (card.rentType === 'wild') {
    return owned.filter((c) => {
      const set = board.sets.find((s) => s.color === c && s.cards.length > 0);
      if (!set) return false;
      if (set.cards.length === 1 && set.cards[0] && isMulticolorWild(set.cards[0])) return false;
      return true;
    });
  }
  return card.colors.filter((c) => owned.includes(c));
}

/**
 * Whether playing `card` to the discard pile right now would yield the viewer
 * nothing at all. Returns `null` for any play that could still do something —
 * including plays whose value depends on choices the player has yet to make.
 */
export function wastedDiscardPlay(
  state: ClientGameState,
  cardId: string,
): WastedPlayReason | null {
  const card = state.hand.find((c) => c.id === cardId);
  if (!card) return null;

  const board = selfOf(state).board;
  const opponents = state.players.filter((p) => p.id !== state.viewerId);

  const somebodyCanPay = opponents.some((p) => boardAssetValue(p.board) > 0);

  if (card.kind === 'rent') {
    if (rentEligibleColors(board, card).length === 0) return { kind: 'rent_no_colors' };
    return somebodyCanPay ? null : { kind: 'nobody_can_pay', action: 'rent' };
  }

  if (card.kind !== 'action') return null;

  switch (card.action) {
    case 'sly_deal':
      return opponents.some((p) => stealableFromBoard(p.board).length > 0)
        ? null
        : { kind: 'sly_deal_no_targets' };

    case 'forced_deal':
      if (stealableFromBoard(board).length === 0) return { kind: 'forced_deal_no_own' };
      return opponents.some((p) => stealableFromBoard(p.board).length > 0)
        ? null
        : { kind: 'forced_deal_no_targets' };

    case 'deal_breaker':
      return opponents.some((p) => completeSetsOnBoard(p.board).length > 0)
        ? null
        : { kind: 'deal_breaker_no_sets' };

    case 'house':
      return board.sets.some(canBuildHouse) ? null : { kind: 'building_no_set', building: 'house' };

    case 'hotel':
      return board.sets.some(canBuildHotel) ? null : { kind: 'building_no_set', building: 'hotel' };

    case 'double_the_rent': {
      // Doubling is worthless without a rent card that can itself charge something.
      const usableRent =
        somebodyCanPay &&
        state.hand.some(
          (c): c is RentCard =>
            c.kind === 'rent' && c.id !== card.id && rentEligibleColors(board, c).length > 0,
        );
      // (A Double costs no play, so whatever play is left is enough for that rent card.)
      return usableRent ? null : { kind: 'double_rent_no_rent' };
    }

    case 'debt_collector':
    case 'its_my_birthday':
      return somebodyCanPay ? null : { kind: 'nobody_can_pay', action: card.action };

    default:
      // pass_go always draws; just_say_no is never played this way.
      return null;
  }
}
