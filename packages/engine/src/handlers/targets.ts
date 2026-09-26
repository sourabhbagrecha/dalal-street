// Follow-up choices after a play: rent colour and payer, Debt Collector payer, steal targets, building set.
import type {
  Command,
  ContestedAction,
  DispatchResult,
  GameEvent,
  GameState,
  PropertyColor,
} from '@monopoly-deal/shared';
import { NO_TARGET } from '@monopoly-deal/shared';
import {
  canBuildHotel,
  canBuildHouse,
  findPropertyCard,
  findSet,
  getPlayer,
  isCompleteSet,
  rentForSet,
  stealableProperties,
} from '../board.js';
import { reject } from './common.js';
import { beginRentCollection } from './payments.js';
import { offerJsnOrProceed } from './contested.js';

export function handleRentColor(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  color: PropertyColor,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top || top.kind !== 'rent_color_choice') return reject(state, 'No rent color pending');
  if (top.actorId !== playerId) return reject(state, 'Not your rent');
  if (!top.eligibleColors.includes(color)) return reject(state, 'Color not eligible');

  state.pendingStack.pop();
  if (top.rentType === 'wild') {
    const player = getPlayer(state, playerId);
    const set = player.board.sets.find((s) => s.color === color);
    let amount = set ? rentForSet(set) : 0;
    for (let i = 0; i < top.doubleCount; i++) amount *= 2;
    state.pendingStack.push({
      kind: 'rent_player_choice',
      actorId: playerId,
      cardId: top.cardId,
      color,
      doubleCount: top.doubleCount,
      amount,
    });
  } else {
    beginRentCollection(state, events, playerId, color, top.doubleCount, 'dual');
  }
  return { state, events };
}

export function handleRentPlayer(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  targetPlayerId: string,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top || top.kind !== 'rent_player_choice') return reject(state, 'No rent player pending');
  if (top.actorId !== playerId) return reject(state, 'Not your rent');
  if (targetPlayerId === playerId) return reject(state, 'Cannot target self');
  if (!state.players.some((p) => p.id === targetPlayerId)) return reject(state, 'Invalid target');

  state.pendingStack.pop();
  beginRentCollection(state, events, playerId, top.color, top.doubleCount, 'wild', targetPlayerId);
  return { state, events };
}

export function handleDebtCollectorPlayer(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  targetPlayerId: string,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top || top.kind !== 'debt_collector_target') return reject(state, 'No Debt Collector pending');
  if (top.actorId !== playerId) return reject(state, 'Not your Debt Collector');
  if (targetPlayerId === playerId) return reject(state, 'Cannot target self');
  if (!state.players.some((p) => p.id === targetPlayerId)) return reject(state, 'Invalid target');

  state.pendingStack.pop();
  const contested: ContestedAction = {
    type: 'debt_collector',
    actorId: playerId,
    targetPlayerId,
    payload: {},
  };
  offerJsnOrProceed(state, events, contested, targetPlayerId);
  return { state, events };
}

/** Whether any rival of `actorId` has a property a Sly Deal or Forced Deal could take. */
function rivalHasStealable(state: GameState, actorId: string): boolean {
  return state.players.some((p) => p.id !== actorId && stealableProperties(p).length > 0);
}

/** A steal with nothing to take: the card is already discarded and the play spent, so it simply ends. */
function resolveEmptySteal(state: GameState, events: GameEvent[], playerId: string, message: string): DispatchResult {
  state.pendingStack.pop();
  events.push({ type: 'card_played', playerId, message: `${playerId} ${message}` });
  return { state, events };
}

export function handleStealTarget(
  state: GameState,
  events: GameEvent[],
  command: Extract<Command, { type: 'SELECT_STEAL_TARGET' }>,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top) return reject(state, 'No steal pending');
  if (top.kind === 'sly_deal_target') {
    if (top.actorId !== command.playerId) return reject(state, 'Not your sly deal');
    if (command.targetCardId === NO_TARGET) {
      if (rivalHasStealable(state, command.playerId)) return reject(state, 'There is a property to take');
      return resolveEmptySteal(state, events, command.playerId, 'played Sly Deal with no property to take');
    }
    if (!command.targetCardId) return reject(state, 'Need targetCardId');
    // Find owner
    let targetPlayerId: string | undefined;
    for (const p of state.players) {
      if (p.id === command.playerId) continue;
      if (findPropertyCard(p, command.targetCardId)) {
        targetPlayerId = p.id;
        break;
      }
    }
    if (!targetPlayerId) return reject(state, 'Target card not found');
    const victim = getPlayer(state, targetPlayerId);
    const found = findPropertyCard(victim, command.targetCardId);
    if (!found || isCompleteSet(found.set) && found.set.cards.length > 0 && found.index >= 0) {
      // Cannot take from complete set
      if (found && isCompleteSet(found.set) && found.index >= 0) {
        return reject(state, 'Cannot sly deal from a complete set');
      }
    }
    state.pendingStack.pop();
    const contested: ContestedAction = {
      type: 'sly_deal',
      actorId: command.playerId,
      targetPlayerId,
      payload: { targetCardId: command.targetCardId, targetPlayerId },
    };
    offerJsnOrProceed(state, events, contested, targetPlayerId);
    return { state, events };
  }

  if (top.kind === 'forced_deal_target') {
    if (top.actorId !== command.playerId) return reject(state, 'Not your forced deal');
    if (command.targetCardId === NO_TARGET) {
      const canTrade = stealableProperties(getPlayer(state, command.playerId)).length > 0;
      if (canTrade && rivalHasStealable(state, command.playerId)) return reject(state, 'There is a property to swap');
      return resolveEmptySteal(state, events, command.playerId, 'played Forced Deal with no property to swap');
    }
    if (!command.targetCardId || !command.ownCardId) {
      return reject(state, 'Need targetCardId and ownCardId');
    }
    const actor = getPlayer(state, command.playerId);
    if (!findPropertyCard(actor, command.ownCardId)) return reject(state, 'Own card not found');
    let targetPlayerId: string | undefined;
    for (const p of state.players) {
      if (p.id === command.playerId) continue;
      if (findPropertyCard(p, command.targetCardId)) {
        targetPlayerId = p.id;
        break;
      }
    }
    if (!targetPlayerId) return reject(state, 'Target not found');
    const victim = getPlayer(state, targetPlayerId);
    const theirs = findPropertyCard(victim, command.targetCardId);
    const mine = findPropertyCard(actor, command.ownCardId);
    if (!theirs || !mine) return reject(state, 'Invalid cards');
    if (isCompleteSet(theirs.set) && theirs.index >= 0) {
      return reject(state, 'Cannot take from complete set');
    }
    if (isCompleteSet(mine.set) && mine.index >= 0) {
      return reject(state, 'Cannot give from complete set');
    }
    state.pendingStack.pop();
    offerJsnOrProceed(
      state,
      events,
      {
        type: 'forced_deal',
        actorId: command.playerId,
        targetPlayerId,
        payload: {
          targetCardId: command.targetCardId,
          ownCardId: command.ownCardId,
          targetPlayerId,
        },
      },
      targetPlayerId,
    );
    return { state, events };
  }

  if (top.kind === 'deal_breaker_target') {
    if (top.actorId !== command.playerId) return reject(state, 'Not your deal breaker');
    if (!command.targetSetId) return reject(state, 'Need targetSetId');
    let targetPlayerId: string | undefined;
    let setOk = false;
    for (const p of state.players) {
      if (p.id === command.playerId) continue;
      const s = findSet(p, command.targetSetId);
      if (s) {
        targetPlayerId = p.id;
        setOk = isCompleteSet(s);
        break;
      }
    }
    state.pendingStack.pop();
    if (!targetPlayerId || !setOk) {
      // Card already discarded — wasted play
      events.push({
        type: 'card_played',
        playerId: command.playerId,
        message: `${command.playerId} played Deal Breaker with no valid set`,
      });
      return { state, events };
    }
    offerJsnOrProceed(
      state,
      events,
      {
        type: 'deal_breaker',
        actorId: command.playerId,
        targetPlayerId,
        payload: { targetSetId: command.targetSetId, targetPlayerId },
      },
      targetPlayerId,
    );
    return { state, events };
  }

  return reject(state, 'No matching steal pending');
}

export function handleBuildingSet(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  setId: string,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top || top.kind !== 'house_hotel_target') return reject(state, 'No building pending');
  if (top.actorId !== playerId) return reject(state, 'Not your building');

  const player = getPlayer(state, playerId);
  const set = findSet(player, setId);
  if (!set) return reject(state, 'Set not found');

  // Card already in discard from play — we need the building card. It was discarded.
  // Actually on play we discarded it. We need to pull it back from discard to place on set.
  const cardIdx = state.discard.findIndex((c) => c.id === top.cardId);
  if (cardIdx < 0) return reject(state, 'Building card missing from discard');
  const [building] = state.discard.splice(cardIdx, 1);

  if (top.building === 'house') {
    if (!canBuildHouse(set)) {
      state.discard.push(building!);
      return reject(state, 'Cannot place house on that set');
    }
    set.house = building;
    events.push({
      type: 'house_placed',
      playerId,
      message: `${playerId} placed a house on ${set.color}`,
    });
  } else {
    if (!canBuildHotel(set)) {
      state.discard.push(building!);
      return reject(state, 'Cannot place hotel on that set');
    }
    set.hotel = building;
    events.push({
      type: 'hotel_placed',
      playerId,
      message: `${playerId} placed a hotel on ${set.color}`,
    });
  }

  state.pendingStack.pop();
  return { state, events };
}
