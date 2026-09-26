// Drawing and playing cards from hand: bank, property, rent and action plays.
import type {
  ActionCard,
  DispatchResult,
  GameEvent,
  GameState,
  PlayTarget,
  PropertyColor,
  RentCard,
} from '@monopoly-deal/shared';
import { MAX_PLAYS } from '@monopoly-deal/shared';
import { createRng } from '../rng.js';
import {
  canAssignWildToColor,
  currentPlayer,
  drawCardsWithRng,
  findCardInHand,
  getPlayer,
  isCompleteSet,
  isMulticolorWild,
  jokerMayJoin,
  placePropertyCard,
  playerColorsOnBoard,
  removeFromHand,
  rentForSet,
} from '../board.js';
import { JOKER_NEEDS_SET, reject, checkWinner } from './common.js';
import { openPaymentRound, beginRentCollection } from './payments.js';

function rngFor(state: GameState): () => number {
  // Derive per-dispatch rng from seed + turn + deck size for determinism
  const s =
    (state.seed ^ (state.turnNumber * 2654435761) ^ (state.deck.length << 8) ^ state.discard.length) >>>
    0;
  return createRng(s || 1);
}

export function handleDraw(state: GameState, events: GameEvent[], playerId: string): DispatchResult {
  if (state.pendingStack.length > 0) return reject(state, 'Cannot draw while pending interaction');
  const player = currentPlayer(state);
  if (player.id !== playerId) return reject(state, 'Not your turn');
  if (state.drawnThisTurn || state.turnPhase !== 'awaiting_draw') {
    return reject(state, 'Already drew this turn');
  }
  const count = player.hand.length === 0 ? 5 : 2;
  const { cards, reshuffled } = drawCardsWithRng(state, count, rngFor(state));
  player.hand.push(...cards);
  state.drawnThisTurn = true;
  state.turnPhase = 'playing';
  state.playsRemaining = MAX_PLAYS;
  if (reshuffled) {
    events.push({ type: 'deck_reshuffled', message: 'Discard pile reshuffled into draw pile' });
  }
  events.push({
    type: 'cards_drawn',
    playerId,
    message: `${playerId} drew ${cards.length} card(s)`,
    data: { count: cards.length },
  });
  return { state, events };
}

export function handlePlay(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  cardId: string,
  zone: 'bank' | 'property' | 'discard',
  target?: PlayTarget,
): DispatchResult {
  // During pending (except double_rent_pending allowing rent), block normal plays
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (top && top.kind !== 'double_rent_pending') {
    return reject(state, 'Must resolve pending interaction first');
  }
  const player = currentPlayer(state);
  if (player.id !== playerId) return reject(state, 'Not your turn');
  if (state.turnPhase !== 'playing') return reject(state, 'Not in play phase');
  if (state.playsRemaining <= 0) return reject(state, 'No plays remaining');

  const card = findCardInHand(player, cardId);
  if (!card) return reject(state, 'Card not in hand');

  if (zone === 'bank') {
    if (card.kind === 'property' || card.kind === 'property_wild' || card.kind === 'rule') {
      return reject(state, 'Cannot bank property cards');
    }
    removeFromHand(player, cardId);
    player.board.bank.push(card);
    state.playsRemaining -= 1;
    // Banking clears unused doubles? Keep them until rent or turn end.
    events.push({
      type: 'card_banked',
      playerId,
      message: `${playerId} banked a card worth ₹${card.value}Cr`,
      data: { cardId },
    });
    return { state, events };
  }

  if (zone === 'property') {
    if (card.kind !== 'property' && card.kind !== 'property_wild') {
      return reject(state, 'Only properties go to property zone');
    }
    let color: PropertyColor;
    if (card.kind === 'property') {
      color = card.color;
    } else {
      const assigned = target?.assignedColor;
      if (!assigned || !canAssignWildToColor(card, assigned)) {
        return reject(state, 'Must assign a valid color for wildcard');
      }
      if (isMulticolorWild(card) && !jokerMayJoin(player.board.sets, assigned, target?.setId)) {
        return reject(state, JOKER_NEEDS_SET);
      }
      color = assigned;
    }
    removeFromHand(player, cardId);
    const set = placePropertyCard(player, card, color, target?.setId);
    state.playsRemaining -= 1;
    events.push({
      type: 'property_placed',
      playerId,
      message: `${playerId} placed property on ${color}`,
      data: { cardId, color, setId: set.id },
    });
    if (isCompleteSet(set)) {
      events.push({
        type: 'set_completed',
        playerId,
        message: `${playerId} secured the ${color} set`,
        data: { setId: set.id, color },
      });
    }
    checkWinner(state, events);
    return { state, events };
  }

  // zone === 'discard' — action / rent cards
  if (card.kind === 'money' || card.kind === 'property' || card.kind === 'property_wild' || card.kind === 'rule') {
    return reject(state, 'Cannot play this card to discard as action');
  }

  if (card.kind === 'action' && card.action === 'just_say_no') {
    return reject(state, 'Just Say No is only played as a response');
  }

  removeFromHand(player, cardId);
  state.discard.push(card);
  // Double the Rent rides along with a rent card and never costs a play of its own.
  if (!(card.kind === 'action' && card.action === 'double_the_rent')) state.playsRemaining -= 1;

  if (card.kind === 'rent') {
    return playRent(state, events, playerId, card, target);
  }

  if (card.kind === 'action') {
    return playAction(state, events, playerId, card);
  }

  return reject(state, 'Unhandled card play');
}

function playRent(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  card: RentCard,
  target?: PlayTarget,
): DispatchResult {
  const player = getPlayer(state, playerId);
  const doubles = state.pendingDoubles;
  state.pendingDoubles = 0;
  // Clear double_rent_pending
  state.pendingStack = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');

  const owned = playerColorsOnBoard(player);
  let eligible: PropertyColor[];
  if (card.rentType === 'wild') {
    eligible = owned.filter((c) => {
      const set = player.board.sets.find((s) => s.color === c && s.cards.length > 0);
      if (!set) return false;
      if (set.cards.length === 1 && set.cards[0] && isMulticolorWild(set.cards[0])) return false;
      return true;
    });
  } else {
    eligible = card.colors.filter((c) => owned.includes(c));
  }

  if (eligible.length === 0) {
    events.push({
      type: 'card_played',
      playerId,
      message: `${playerId} played rent but has no matching properties`,
    });
    return { state, events };
  }

  events.push({
    type: 'card_played',
    playerId,
    message: `${playerId} played a rent card`,
    data: { cardId: card.id, doubles },
  });

  // A single eligible colour needs no choosing: charge that set straight away.
  const rentColor = target?.rentColor && eligible.includes(target.rentColor) ? target.rentColor : eligible.length === 1 ? eligible[0] : undefined;
  if (rentColor) {
    if (card.rentType === 'wild') {
      if (target?.targetPlayerId) {
        beginRentCollection(state, events, playerId, rentColor, doubles, 'wild', target.targetPlayerId);
        return { state, events };
      }
      state.pendingStack.push({
        kind: 'rent_player_choice',
        actorId: playerId,
        cardId: card.id,
        color: rentColor,
        doubleCount: doubles,
        amount: 0, // filled when player chosen — recalculated
      });
      // Fix amount
      const top = state.pendingStack[state.pendingStack.length - 1];
      if (top?.kind === 'rent_player_choice') {
        const set = player.board.sets.find((s) => s.color === rentColor);
        if (set) {
          let amt = rentForSet(set);
          for (let i = 0; i < doubles; i++) amt *= 2;
          top.amount = amt;
        }
      }
      return { state, events };
    }
    beginRentCollection(state, events, playerId, rentColor, doubles, 'dual');
    return { state, events };
  }

  state.pendingStack.push({
    kind: 'rent_color_choice',
    actorId: playerId,
    cardId: card.id,
    eligibleColors: eligible,
    doubleCount: doubles,
    rentType: card.rentType,
  });
  return { state, events };
}

function playAction(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  card: ActionCard,
): DispatchResult {
  events.push({
    type: 'card_played',
    playerId,
    message: `${playerId} played ${card.action}`,
    data: { cardId: card.id, action: card.action },
  });

  switch (card.action) {
    case 'pass_go': {
      const { cards, reshuffled } = drawCardsWithRng(state, 2, rngFor(state));
      getPlayer(state, playerId).hand.push(...cards);
      if (reshuffled) {
        events.push({ type: 'deck_reshuffled', message: 'Discard pile reshuffled into draw pile' });
      }
      events.push({
        type: 'pass_go',
        playerId,
        message: `${playerId} passed go and drew ${cards.length}`,
        data: { count: cards.length },
      });
      return { state, events };
    }
    case 'double_the_rent': {
      state.pendingDoubles += 1;
      const existing = state.pendingStack.find((p) => p.kind === 'double_rent_pending');
      if (existing && existing.kind === 'double_rent_pending') {
        existing.doubleCardIds.push(card.id);
      } else {
        state.pendingStack.push({
          kind: 'double_rent_pending',
          actorId: playerId,
          doubleCardIds: [card.id],
        });
      }
      events.push({
        type: 'double_the_rent',
        playerId,
        message: `${playerId} played Double the Rent (x${state.pendingDoubles})`,
      });
      return { state, events };
    }
    case 'debt_collector': {
      state.pendingStack.push({ kind: 'debt_collector_target', actorId: playerId, cardId: card.id });
      return { state, events };
    }
    case 'its_my_birthday': {
      const others = state.players.filter((p) => p.id !== playerId).map((p) => p.id);
      const obligations = others.map((tid) => ({
        payerId: tid,
        amountDue: 2,
        contested: {
          type: 'its_my_birthday' as const,
          actorId: playerId,
          targetPlayerId: tid,
          payload: {},
        },
      }));
      openPaymentRound(state, events, playerId, 'birthday', obligations);
      return { state, events };
    }
    case 'sly_deal': {
      state.pendingStack.push({ kind: 'sly_deal_target', actorId: playerId, cardId: card.id });
      return { state, events };
    }
    case 'forced_deal': {
      state.pendingStack.push({ kind: 'forced_deal_target', actorId: playerId, cardId: card.id });
      return { state, events };
    }
    case 'deal_breaker': {
      state.pendingStack.push({ kind: 'deal_breaker_target', actorId: playerId, cardId: card.id });
      return { state, events };
    }
    case 'house':
    case 'hotel': {
      state.pendingStack.push({
        kind: 'house_hotel_target',
        actorId: playerId,
        cardId: card.id,
        building: card.action,
      });
      return { state, events };
    }
    default:
      return reject(state, `Unhandled action ${card.action}`);
  }
}
