// Payment obligations: single payments, multi-payer payment rounds, card transfer, rent collection.
import type {
  Card,
  ContestedAction,
  DispatchResult,
  GameEvent,
  GameState,
  PaymentRoundEntry,
  PropertyColor,
} from '@monopoly-deal/shared';
import {
  cardPaymentValue,
  findBankCard,
  findPropertyCard,
  getPlayer,
  isMulticolorWild,
  placeOrphanedBuildings,
  placePropertyCard,
  removeCardFromBoard,
  rentForSet,
  totalAssetValue,
} from '../board.js';
import { reject, checkWinner } from './common.js';

export function pushPayment(
  state: GameState,
  payerId: string,
  payeeId: string,
  amountDue: number,
  reason: string,
): void {
  if (amountDue <= 0) return;
  const payer = getPlayer(state, payerId);
  if (totalAssetValue(payer) <= 0) {
    // Nothing to pay
    return;
  }
  state.pendingStack.push({
    kind: 'payment',
    payerId,
    payeeId,
    amountDue,
    reason,
  });
}

/** Announces a demand for money. Sent as its window opens: the demand is public, whoever holds a Just Say No. */
function emitDemandEvents(
  events: GameEvent[],
  contested: ContestedAction,
  amountDue: number,
): void {
  switch (contested.type) {
    case 'rent':
      events.push({
        type: 'rent_charged',
        playerId: contested.actorId,
        message: `${contested.actorId} charges ${contested.targetPlayerId} ₹${amountDue}Cr rent`,
        data: {
          ...contested.payload,
          payerId: contested.targetPlayerId,
          amount: amountDue,
          color: contested.payload.color,
        },
      });
      break;
    case 'its_my_birthday':
      events.push({
        type: 'birthday',
        playerId: contested.actorId,
        message: `${contested.targetPlayerId} owes ₹${amountDue}Cr birthday money to ${contested.actorId}`,
        data: { payerId: contested.targetPlayerId, amount: amountDue },
      });
      break;
  }
}

export function tryCompletePaymentRound(state: GameState): void {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (top?.kind !== 'payment_round') return;
  if (top.entries.every((e) => e.phase === 'done' || e.phase === 'skipped')) {
    state.pendingStack.pop();
  }
}

export function openPaymentRound(
  state: GameState,
  events: GameEvent[],
  payeeId: string,
  reason: string,
  obligations: Array<{ payerId: string; amountDue: number; contested: ContestedAction }>,
): void {
  const entries: PaymentRoundEntry[] = [];
  for (const ob of obligations) {
    const payer = getPlayer(state, ob.payerId);
    if (totalAssetValue(payer) <= 0) continue;

    // Every payer gets a Just Say No window, holding one or not, so the round never tells the table who does.
    entries.push({
      payerId: ob.payerId,
      amountDue: ob.amountDue,
      phase: 'jsn',
      jsn: {
        respondentId: ob.payerId,
        initiatorId: ob.contested.actorId,
        contestedAction: ob.contested,
        jsnCount: 0,
      },
    });
    emitDemandEvents(events, ob.contested, ob.amountDue);
  }
  if (entries.length === 0) return;
  state.pendingStack.push({ kind: 'payment_round', payeeId, reason, entries });
}

function applyPaymentTransfer(
  state: GameState,
  events: GameEvent[],
  payerId: string,
  payeeId: string,
  amountDue: number,
  cardIds: string[],
  reason?: string,
): string | undefined {
  const payer = getPlayer(state, payerId);
  const payee = getPlayer(state, payeeId);

  if (new Set(cardIds).size !== cardIds.length) return 'Duplicate cards in payment';

  let total = 0;
  const selected: { card: Card; source: 'bank' | 'property' }[] = [];
  for (const id of cardIds) {
    const bankCard = findBankCard(payer, id);
    if (bankCard) {
      if (cardPaymentValue(bankCard) <= 0 && isMulticolorWild(bankCard)) {
        return 'Cannot pay with multicolor wild';
      }
      selected.push({ card: bankCard, source: 'bank' });
      total += cardPaymentValue(bankCard);
      continue;
    }
    const prop = findPropertyCard(payer, id);
    if (prop) {
      if (isMulticolorWild(prop.card)) return 'Cannot pay with multicolor wild';
      selected.push({ card: prop.card, source: 'property' });
      total += cardPaymentValue(prop.card);
      continue;
    }
    return `Card ${id} not available for payment`;
  }

  const assets = totalAssetValue(payer);
  if (total < amountDue && total < assets) {
    return 'Payment does not cover debt and assets remain';
  }
  if (total < amountDue && total === assets) {
    // Paying everything — OK even if short
  } else if (total < amountDue) {
    return 'Insufficient payment';
  }

  for (const { card, source } of selected) {
    // A building picked from a set may already have dropped into the bank, knocked loose by an earlier card of this payment.
    if (source === 'bank' || !findPropertyCard(payer, card.id)) {
      const idx = payer.board.bank.findIndex((c) => c.id === card.id);
      if (idx < 0) continue;
      payer.board.bank.splice(idx, 1);
      payee.board.bank.push(card);
    } else {
      const found = findPropertyCard(payer, card.id);
      if (!found) continue;
      const color = found.set.color;
      const { card: removed, brokeSet, orphanedBuildings } = removeCardFromBoard(payer, card.id);
      placeOrphanedBuildings(payer, orphanedBuildings);
      if (brokeSet) {
        events.push({
          type: 'set_broken',
          playerId: payerId,
          message: `${payerId}'s ${color} set broke due to payment`,
          data: { color, reason: 'payment' },
        });
      }
      if (removed.kind === 'action') {
        payee.board.bank.push(removed);
      } else if (removed.kind === 'property' || removed.kind === 'property_wild') {
        const c =
          removed.kind === 'property'
            ? removed.color
            : (removed.assignedColor ?? removed.colors[0] ?? 'brown');
        placePropertyCard(payee, removed, c);
      } else {
        payee.board.bank.push(removed);
      }
    }
  }

  events.push({
    type: 'payment_made',
    playerId: payerId,
    message: `${payerId} paid ₹${total}Cr to ${payeeId} (owed ₹${amountDue}Cr)`,
    data: { cardIds, total, owed: amountDue, payeeId, reason },
  });
  checkWinner(state, events);
  return undefined;
}

export function beginRentCollection(
  state: GameState,
  events: GameEvent[],
  actorId: string,
  color: PropertyColor,
  doubleCount: number,
  rentType: 'dual' | 'wild',
  targetPlayerId?: string,
): void {
  const actor = getPlayer(state, actorId);
  const set = actor.board.sets.find((s) => s.color === color && s.cards.length > 0);
  if (!set) return;
  // Multicolor alone cannot charge rent
  if (
    set.cards.length === 1 &&
    set.cards[0] &&
    isMulticolorWild(set.cards[0])
  ) {
    return;
  }
  let amount = rentForSet(set);
  for (let i = 0; i < doubleCount; i++) amount *= 2;

  const targets =
    rentType === 'wild'
      ? targetPlayerId
        ? [targetPlayerId]
        : []
      : state.players.filter((p) => p.id !== actorId).map((p) => p.id);

  const obligations = targets.map((tid) => ({
    payerId: tid,
    amountDue: amount,
    contested: {
      type: 'rent' as const,
      actorId,
      targetPlayerId: tid,
      payload: { color, amount, doubleCount, rentType },
    },
  }));
  openPaymentRound(state, events, actorId, 'rent', obligations);
}

export function handlePayment(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  cardIds: string[],
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];

  if (top?.kind === 'payment_round') {
    const entry = top.entries.find((e) => e.payerId === playerId && e.phase === 'payment');
    if (!entry) return reject(state, 'No payment pending for this player');

    const err = applyPaymentTransfer(
      state,
      events,
      playerId,
      top.payeeId,
      entry.amountDue,
      cardIds,
      top.reason,
    );
    if (err) return reject(state, err);

    entry.phase = 'done';
    tryCompletePaymentRound(state);
    return { state, events };
  }

  if (!top || top.kind !== 'payment') return reject(state, 'No payment pending');
  if (top.payerId !== playerId) return reject(state, 'Not the payer');

  const err = applyPaymentTransfer(
    state,
    events,
    playerId,
    top.payeeId,
    top.amountDue,
    cardIds,
    top.reason,
  );
  if (err) return reject(state, err);

  state.pendingStack.pop();
  return { state, events };
}
