// Contested actions: offering a Just Say No window and applying the action's effect once it stands.
import type {
  Card,
  ContestedAction,
  GameEvent,
  GameState,
  PropertyColor,
} from '@monopoly-deal/shared';
import {
  findPropertyCard,
  findSet,
  getPlayer,
  isCompleteSet,
  newSetId,
  placeOrphanedBuildings,
  placePropertyCard,
  removeCardFromBoard,
  transferSet,
} from '../board.js';
import { checkWinner } from './common.js';
import { pushPayment } from './payments.js';

/**
 * Every contested action waits on its target's answer, whether or not they hold a Just Say No, so the pause never
 * tells the table who holds one. A target without one can only let it go (or let the window run out).
 */
export function offerJsn(
  state: GameState,
  contested: ContestedAction,
  respondentId: string,
): void {
  state.pendingStack.push({
    kind: 'just_say_no',
    respondentId,
    initiatorId: contested.actorId,
    contestedAction: contested,
    jsnCount: 0,
  });
}

export function resolveContestedAction(
  state: GameState,
  events: GameEvent[],
  contested: ContestedAction,
  cancelled: boolean,
  deciderId?: string,
): void {
  if (cancelled) {
    events.push({
      type: 'action_cancelled',
      playerId: contested.actorId,
      message: `Action ${contested.type} cancelled by Just Say No`,
      // deciderId is always supplied by the two real JSN-outcome callers
      // (handleJsn, handleDeclineJsn); this fallback only guards a caller that
      // forgets to pass it.
      data: { contested, by: deciderId ?? contested.targetPlayerId ?? contested.actorId },
    });
    return;
  }

  switch (contested.type) {
    case 'debt_collector': {
      // Announced when its window opened (handleDebtCollectorPlayer).
      pushPayment(state, contested.targetPlayerId!, contested.actorId, 5, 'debt_collector');
      break;
    }
    case 'its_my_birthday': {
      const target = contested.targetPlayerId!;
      pushPayment(state, target, contested.actorId, 2, 'birthday');
      events.push({
        type: 'birthday',
        playerId: contested.actorId,
        message: `${target} owes ₹2Cr birthday money to ${contested.actorId}`,
        data: { payerId: target, amount: 2 },
      });
      break;
    }
    case 'rent': {
      const amount = contested.payload.amount as number;
      const target = contested.targetPlayerId!;
      pushPayment(state, target, contested.actorId, amount, 'rent');
      events.push({
        type: 'rent_charged',
        playerId: contested.actorId,
        message: `${contested.actorId} charges ${target} ₹${amount}Cr rent`,
        data: { ...contested.payload, payerId: target, amount, color: contested.payload.color },
      });
      break;
    }
    case 'sly_deal': {
      const targetCardId = contested.payload.targetCardId as string;
      const targetPlayerId = contested.payload.targetPlayerId as string;
      const victim = getPlayer(state, targetPlayerId);
      const actor = getPlayer(state, contested.actorId);
      const found = findPropertyCard(victim, targetCardId);
      if (!found) break;
      const { card, brokeSet, orphanedBuildings } = removeCardFromBoard(victim, targetCardId);
      placeOrphanedBuildings(victim, orphanedBuildings);
      const color =
        card.kind === 'property'
          ? card.color
          : card.kind === 'property_wild'
            ? (card.assignedColor ?? card.colors[0] ?? 'brown')
            : found.set.color;
      if (card.kind === 'action') {
        // A stolen building settles like a loose one: on a complete set of the thief's, or in their bank.
        placeOrphanedBuildings(actor, [card]);
      } else {
        placePropertyCard(actor, card, color);
      }
      events.push({
        type: 'sly_deal',
        playerId: contested.actorId,
        message: `${contested.actorId} sly-dealt ${targetCardId} from ${targetPlayerId}`,
        data: { targetPlayerId, cardId: targetCardId, color: found.set.color },
      });
      if (brokeSet) {
        events.push({
          type: 'set_broken',
          playerId: targetPlayerId,
          message: `${targetPlayerId}'s set broke`,
          data: { color, reason: 'steal' },
        });
      }
      checkWinner(state, events);
      break;
    }
    case 'forced_deal': {
      const targetCardId = contested.payload.targetCardId as string;
      const ownCardId = contested.payload.ownCardId as string;
      const targetPlayerId = contested.payload.targetPlayerId as string;
      const victim = getPlayer(state, targetPlayerId);
      const actor = getPlayer(state, contested.actorId);
      const theirs = findPropertyCard(victim, targetCardId);
      const mine = findPropertyCard(actor, ownCardId);
      if (!theirs || !mine) break;
      const theirColor = theirs.set.color;
      const myColor = mine.set.color;
      const removedTheirs = removeCardFromBoard(victim, targetCardId);
      const removedMine = removeCardFromBoard(actor, ownCardId);
      placeTakenCard(actor, removedTheirs.card, theirColor);
      placeTakenCard(victim, removedMine.card, myColor);
      // After the swap lands, so a building knocked loose can settle on a set the swap just completed.
      placeOrphanedBuildings(victim, removedTheirs.orphanedBuildings);
      placeOrphanedBuildings(actor, removedMine.orphanedBuildings);
      events.push({
        type: 'forced_deal',
        playerId: contested.actorId,
        message: `${contested.actorId} forced deal with ${targetPlayerId}`,
        data: { targetPlayerId, targetCardId, ownCardId },
      });
      checkWinner(state, events);
      break;
    }
    case 'deal_breaker': {
      const targetSetId = contested.payload.targetSetId as string;
      const targetPlayerId = contested.payload.targetPlayerId as string;
      const victim = getPlayer(state, targetPlayerId);
      const actor = getPlayer(state, contested.actorId);
      const set = findSet(victim, targetSetId);
      if (!set || !isCompleteSet(set)) break;
      // Capture every card that moves — including house/hotel — before
      // transferSet mutates the set (it reassigns a new set id on the actor's side).
      const cardIds = [
        ...set.cards.map((c) => c.id),
        ...(set.house ? [set.house.id] : []),
        ...(set.hotel ? [set.hotel.id] : []),
      ];
      transferSet(victim, actor, targetSetId);
      events.push({
        type: 'deal_breaker',
        playerId: contested.actorId,
        message: `${contested.actorId} deal-broke a ${set.color} set from ${targetPlayerId}`,
        data: { targetPlayerId, setId: targetSetId, color: set.color, cardIds },
      });
      checkWinner(state, events);
      break;
    }
    case 'double_the_rent': {
      // Negating double reduces pendingDoubles — handled at JSN time for double specifically
      break;
    }
  }
}

function placeTakenCard(player: ReturnType<typeof getPlayer>, card: Card, color: PropertyColor): void {
  if (card.kind === 'action') {
    if (card.action === 'house') {
      player.board.sets.push({ id: newSetId(), color, cards: [], house: card });
    } else if (card.action === 'hotel') {
      player.board.sets.push({ id: newSetId(), color, cards: [], hotel: card });
    }
  } else {
    placePropertyCard(player, card, color);
  }
}
