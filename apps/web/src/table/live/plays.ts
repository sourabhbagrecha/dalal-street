import type { Card, ClientGameState, Command, PlayTarget, PlayZone, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { jokerHostColors, jokerMayJoin } from '@monopoly-deal/engine';
import { canRearrangeProperties, isDiscardExcessMode } from '../../legality';
import type { CommandResult, RemovalCost, WastedPlayReason } from '../../store/types';
import type { Confirm, Zone } from '../model';
import { buildTargets, stateName, zonesFor } from '../model';

/**
 * Copy for every way a discard-pile play can be a no-op. Deliberately phrased
 * as "what you get" rather than "what is illegal" — none of these are illegal,
 * they just burn the card and one of the three plays for nothing.
 */
export function wastedPlayCopy(reason: WastedPlayReason): string {
  switch (reason.kind) {
    case 'rent_no_colors':
      return "You don't have any properties in this rent card's colours, so nobody would owe you anything.";
    case 'sly_deal_no_targets':
      return 'No opponent has a property you could steal — every property they own is locked in a completed set.';
    case 'forced_deal_no_own':
      return 'You have no property to trade away — a Forced Deal cannot pull a card out of a completed set.';
    case 'forced_deal_no_targets':
      return 'No opponent has a property you could swap for — every property they own is locked in a completed set.';
    case 'deal_breaker_no_sets':
      return 'No opponent has a completed set, so there is nothing for Deal Breaker to take.';
    case 'building_no_set':
      return reason.building === 'house'
        ? 'You have no completed set that can take a house yet (railroads and utilities never can).'
        : 'You have no completed set with a house on it, so a hotel has nowhere to go.';
    case 'double_rent_no_rent':
      return 'You have no rent card that could charge anyone, so there is no rent to double.';
    case 'nobody_can_pay':
      return reason.action === 'rent'
        ? 'Every opponent is broke — nobody has a card in their bank or on their table — so this rent would earn you nothing.'
        : 'No opponent has a single card in their bank or on their board, so nobody can pay you.';
  }
}

/**
 * A play the viewer just made that the rules allow but that deserves a second look: the held state behind the
 * table's `Confirm`. Deciding what a drop means (`planPlay`, `planRearrange`) is pure; sending is the hook's job.
 */
export type Held =
  /** A discard-pile play that would gain nothing (a rent card for colours you don't own…). */
  | { kind: 'wasted'; cardId: string; target?: PlayTarget; reason: WastedPlayReason }
  /** An action card dropped on the bank: cash, play it, or keep it. */
  | { kind: 'bank_action'; cardId: string; target?: PlayTarget; canPlay: boolean }
  /** A house/hotel dropped on the bank: cash or building. */
  | { kind: 'building_choice'; cardId: string; target?: PlayTarget }
  /** A rent card played while an unplayed Double the Rent sits in hand. */
  | { kind: 'rent_double'; cardId: string; doubleId: string; target?: PlayTarget }
  /** A wild flip that would break a completed set. */
  | { kind: 'flip'; cardId: string; toColor: PropertyColor; toSetId?: string; copy: string };

/** The store-API bits planning needs. */
export interface PlayDeps {
  getLegalPlayZones(cardId: string): PlayZone[];
  pickPlayCommand(cardId: string, zone: PlayZone, target?: PlayTarget): { cardId: string; zone: PlayZone; target?: PlayTarget } | undefined;
  wastedDiscardPlay(cardId: string): WastedPlayReason | null;
  isCompleteSet(set: PropertySet): boolean;
  removalCost(cardId: string): RemovalCost | null;
}

type PlayPlan =
  | { kind: 'reject'; message: string }
  | { kind: 'toggle-discard'; cardId: string }
  | { kind: 'send'; zone: PlayZone; target?: PlayTarget }
  | { kind: 'hold'; held: Held };

type RearrangePlan =
  | { kind: 'reject'; message: string }
  | { kind: 'noop' }
  | { kind: 'send'; toSetId?: string }
  | { kind: 'hold'; held: Held };

const buildingOf = (card: Card): 'house' | 'hotel' | null => (card.kind === 'action' && (card.action === 'house' || card.action === 'hotel') ? card.action : null);
const isJoker = (card: Card): boolean => card.kind === 'property_wild' && card.colors.length === 0;
const JOKER_NEEDS_SET = 'A Joker can only join a set you have already started';
const isJsn = (card: Card): boolean => card.kind === 'action' && card.action === 'just_say_no';

const CANNOT: Record<Zone, string> = {
  bank: 'Cannot bank this card here',
  build: 'Cannot play this card as a property',
  play: 'Cannot play this card here',
};

/** What dropping a hand card into a zone means right now — the old drop handlers (properties panel, discard pile), one place. */
export function planPlay(state: ClientGameState, deps: PlayDeps, cardId: string, zone: Zone, color?: PropertyColor): PlayPlan {
  const card = state.you.hand.find((c) => c.id === cardId);
  if (!card) return { kind: 'reject', message: 'That card is not in your hand' };

  // While a hand-limit discard is open the discard pile is the only place a card can go, and dropping there marks it.
  if (isDiscardExcessMode(state, state.viewerId)) {
    return zone === 'play' ? { kind: 'toggle-discard', cardId } : { kind: 'reject', message: 'Use discard pile to drop excess cards' };
  }

  const legal = deps.getLegalPlayZones(cardId);
  if (legal.length === 0) {
    return {
      kind: 'reject',
      message:
        state.currentPlayerId !== state.viewerId
          ? 'Wait for your turn to play'
          : state.turnPhase === 'awaiting_draw'
            ? 'Draw 2 cards before playing'
            : 'That card cannot be played right now',
    };
  }
  if (!zonesFor(card).includes(zone)) return { kind: 'reject', message: CANNOT[zone] };

  switch (zone) {
    case 'build': {
      if (!legal.includes('property')) return { kind: 'reject', message: CANNOT.build };
      let target: PlayTarget | undefined;
      if (color && card.kind === 'property_wild') {
        if (card.colors.length > 0 && !card.colors.includes(color)) return { kind: 'reject', message: 'Wild cannot be that color' };
        target = { assignedColor: color };
      }
      // The Joker never starts a set: it needs one of that colour already under way.
      if (isJoker(card) && !(color ? jokerMayJoin(state.you.board.sets, color) : jokerHostColors(state.you.board.sets).length > 0)) {
        return { kind: 'reject', message: JOKER_NEEDS_SET };
      }
      const cmd = deps.pickPlayCommand(cardId, 'property', target);
      if (!cmd) return { kind: 'reject', message: CANNOT.build };
      return { kind: 'send', zone: 'property', target: cmd.target };
    }

    case 'bank': {
      if (!legal.includes('bank')) return { kind: 'reject', message: CANNOT.play };
      const cmd = deps.pickPlayCommand(cardId, 'bank');
      if (!cmd) return { kind: 'reject', message: CANNOT.bank };
      // A House/Hotel is ambiguous (cash or building); any other action card is worth more played than banked.
      if (buildingOf(card) && legal.includes('discard')) {
        return { kind: 'hold', held: { kind: 'building_choice', cardId, target: cmd.target } };
      }
      if (card.kind === 'action') {
        return { kind: 'hold', held: { kind: 'bank_action', cardId, target: cmd.target, canPlay: legal.includes('discard') && !isJsn(card) } };
      }
      return { kind: 'send', zone: 'bank', target: cmd.target };
    }

    case 'play': {
      const cmd = deps.pickPlayCommand(cardId, 'discard');
      if (!cmd) return { kind: 'reject', message: 'Cannot discard this card here' };
      // A House/Hotel is never binned: it builds on a set or goes to the bank. (Excess cards are discarded by hand, above.)
      if (buildingOf(card)) {
        const bank = deps.pickPlayCommand(cardId, 'bank');
        if (!bank) return { kind: 'reject', message: CANNOT.bank };
        return { kind: 'hold', held: { kind: 'building_choice', cardId, target: bank.target } };
      }
      // The rules allow plays that do nothing at all: hold them and ask first.
      const reason = deps.wastedDiscardPlay(cardId);
      if (reason) return { kind: 'hold', held: { kind: 'wasted', cardId, target: cmd.target, reason } };
      // A rent card with an unplayed Double the Rent in hand: offer to chain it in (doubling only applies to rent played after it).
      // The Double costs no play, so there is no plays-left check.
      if (card.kind === 'rent' && state.pendingDoubles === 0) {
        const double = state.you.hand.find((c) => c.kind === 'action' && c.action === 'double_the_rent');
        if (double) return { kind: 'hold', held: { kind: 'rent_double', cardId, doubleId: double.id, target: cmd.target } };
      }
      return { kind: 'send', zone: 'discard', target: cmd.target };
    }
  }
}

/** A card on the viewer's board with the set it sits in. */
function boardCard(state: ClientGameState, cardId: string): { card: Card; set: PropertySet } | undefined {
  for (const set of state.you.board.sets) {
    const card = set.cards.find((c) => c.id === cardId);
    if (card) return { card, set };
  }
  return undefined;
}

function flipCopy(set: PropertySet, cost: RemovalCost): string {
  const state = stateName(set.color);
  if (cost.breaksCompleteSet && cost.orphansBuilding) {
    return `It holds your complete ${state} set together. Moving it breaks the set, and its building moves to another complete set or your bank.`;
  }
  if (cost.breaksCompleteSet) return `It holds your complete ${state} set together. Moving it breaks the set.`;
  return `Moving it empties your ${state} set, and its building moves to another complete set or your bank.`;
}

/** What flipping / moving a board property to another colour means — the old drop-on-set and flip-badge paths. */
export function planRearrange(state: ClientGameState, deps: PlayDeps, cardId: string, toColor: PropertyColor): RearrangePlan {
  if (!canRearrangeProperties(state, state.viewerId)) return { kind: 'reject', message: 'You can only rearrange on your own turn' };
  const found = boardCard(state, cardId);
  if (!found) return { kind: 'reject', message: 'That card is not on your table' };
  const { card, set } = found;
  if (card.kind === 'property' && card.color !== toColor) return { kind: 'reject', message: 'Natural property cannot change color' };
  if (card.kind === 'property_wild' && card.colors.length > 0 && !card.colors.includes(toColor)) {
    return { kind: 'reject', message: 'Wild cannot be that color' };
  }
  if (card.kind !== 'property' && card.kind !== 'property_wild') return { kind: 'reject', message: 'Only properties can be rearranged' };
  if (set.color === toColor) return { kind: 'noop' };
  if (isJoker(card) && !jokerMayJoin(state.you.board.sets, toColor, undefined, cardId)) return { kind: 'reject', message: JOKER_NEEDS_SET };

  // Join an incomplete set of that colour when there is one; otherwise the engine starts a new set.
  const dest = state.you.board.sets.find((s) => s.id !== set.id && s.color === toColor && s.cards.length > 0 && !deps.isCompleteSet(s));
  const toSetId = dest?.id;
  const cost = deps.removalCost(cardId);
  if (cost && (cost.breaksCompleteSet || cost.orphansBuilding)) {
    return { kind: 'hold', held: { kind: 'flip', cardId, toColor, toSetId, copy: flipCopy(set, cost) } };
  }
  return { kind: 'send', toSetId };
}

/** A held play is only good while its cards are where it left them (an interrupt, the clock or a seat switch can move them). */
export function heldStillValid(held: Held, state: ClientGameState): boolean {
  const inHand = (id: string) => state.you.hand.some((c) => c.id === id);
  switch (held.kind) {
    case 'wasted':
    case 'bank_action':
    case 'building_choice':
      return state.currentPlayerId === state.viewerId && inHand(held.cardId);
    case 'rent_double':
      return state.currentPlayerId === state.viewerId && inHand(held.cardId) && inHand(held.doubleId);
    case 'flip':
      return canRearrangeProperties(state, state.viewerId) && boardCard(state, held.cardId) !== undefined;
  }
}

/** The store side of a confirm: how "yes" reaches the server. */
export interface ConfirmIO {
  playCard(cardId: string, zone: PlayZone, target?: PlayTarget): void;
  dispatchCommand(type: string, payload?: Record<string, unknown>): Promise<CommandResult>;
  pickPlayCommand: PlayDeps['pickPlayCommand'];
  send(command: Command): void;
  rejectLocal(message: string): void;
  /** Drop the held play. */
  clear(): void;
}

/** The table's `Confirm` for a held play, or null when its card is gone. */
export function buildConfirm(held: Held, state: ClientGameState, io: ConfirmIO): Confirm | null {
  if (!heldStillValid(held, state)) return null;

  if (held.kind === 'flip') {
    const found = boardCard(state, held.cardId);
    if (!found) return null;
    return {
      kind: 'flip',
      card: found.card,
      toColor: held.toColor,
      copy: held.copy,
      yes: () => {
        io.send({ type: 'REARRANGE_PROPERTY', playerId: state.viewerId, cardId: held.cardId, toColor: held.toColor, toSetId: held.toSetId });
        io.clear();
      },
      undo: io.clear,
    };
  }

  const card = state.you.hand.find((c) => c.id === held.cardId);
  if (!card) return null;

  /** "Play it": the card goes to the discard pile as an action, with whatever target the store picks. */
  const playAsAction = (failure: string) => () => {
    const cmd = io.pickPlayCommand(card.id, 'discard');
    if (cmd) io.playCard(card.id, 'discard', cmd.target);
    else io.rejectLocal(failure);
    io.clear();
  };

  switch (held.kind) {
    case 'wasted':
      return {
        kind: 'wasted',
        card,
        copy: wastedPlayCopy(held.reason),
        yes: () => {
          io.playCard(card.id, 'discard', held.target);
          io.clear();
        },
        undo: io.clear,
      };
    case 'bank_action':
      return {
        kind: 'bank_action',
        card,
        canPlay: held.canPlay,
        cash: () => {
          io.playCard(card.id, 'bank', held.target);
          io.clear();
        },
        play: playAsAction('Cannot play this card right now'),
        keep: io.clear,
      };
    case 'building_choice': {
      const building = buildingOf(card);
      if (!building) return null;
      const sets = buildTargets(state.you.board.sets, building);
      return {
        kind: 'building_choice',
        card,
        sets: sets.map(({ id, color }) => ({ id, color })),
        blocked: sets.length === 0 ? wastedPlayCopy({ kind: 'building_no_set', building }) : null,
        cash: () => {
          io.playCard(card.id, 'bank', held.target);
          io.clear();
        },
        // The engine takes a building in two steps (play it, then name the set). The set is already chosen here, so
        // send both back to back; if the second fails the table's own "pick a set" prompt is still there to finish it.
        build: (setId) => {
          io.clear();
          void (async () => {
            const cmd = io.pickPlayCommand(card.id, 'discard');
            const played = await io.dispatchCommand('PLAY_CARD', { cardId: card.id, zone: 'discard', target: cmd?.target });
            if (!played.ok) {
              io.rejectLocal(played.reason ?? 'Cannot build with this card right now');
              return;
            }
            const placed = await io.dispatchCommand('SELECT_BUILDING_SET', { setId });
            if (!placed.ok) io.rejectLocal(placed.reason ?? `This set cannot take a ${building}`);
          })();
        },
        undo: io.clear,
      };
    }
    case 'rent_double': {
      const double = state.you.hand.find((c) => c.id === held.doubleId);
      if (!double) return null;
      return {
        kind: 'rent_double',
        card,
        double,
        // The Double first, then the rent it doubles — the engine only doubles rent played after it.
        twice: () => {
          io.clear();
          void (async () => {
            const cmd = io.pickPlayCommand(double.id, 'discard');
            const doubled = await io.dispatchCommand('PLAY_CARD', { cardId: double.id, zone: 'discard', target: cmd?.target });
            if (!doubled.ok) {
              io.rejectLocal(doubled.reason ?? 'Cannot play Double the Rent right now');
              return;
            }
            const rented = await io.dispatchCommand('PLAY_CARD', { cardId: card.id, zone: 'discard', target: held.target });
            if (!rented.ok) io.rejectLocal(rented.reason ?? 'Cannot play this card here');
          })();
        },
        plain: () => {
          io.playCard(card.id, 'discard', held.target);
          io.clear();
        },
        undo: io.clear,
      };
    }
  }
}
