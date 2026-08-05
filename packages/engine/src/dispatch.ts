import type {
  ActionCard,
  Card,
  Command,
  ContestedAction,
  DispatchResult,
  GameEvent,
  GameState,
  PaymentRoundEntry,
  PlayTarget,
  PropertyColor,
  RentCard,
} from '@monopoly-deal/shared';
import { HAND_LIMIT, MAX_PLAYS, WIN_SETS } from '@monopoly-deal/shared';
import {
  canAssignWildToColor,
  canBuildHotel,
  canBuildHouse,
  cardPaymentValue,
  cloneState,
  countCompleteSets,
  currentPlayer,
  drawCardsWithRng,
  findBankCard,
  findCardInHand,
  findPropertyCard,
  findSet,
  getPlayer,
  isCompleteSet,
  isMulticolorWild,
  newSetId,
  placeOrphanedBuildings,
  placePropertyCard,
  playerColorsOnBoard,
  removeCardFromBoard,
  removeFromHand,
  rentForSet,
  totalAssetValue,
  transferSet,
} from './board.js';
import { createRng } from './rng.js';
import { computeAutoDiscard, computeAutoPayment } from './autoPayment.js';

function rngFor(state: GameState): () => number {
  // Derive per-dispatch rng from seed + turn + deck size for determinism
  const s =
    (state.seed ^ (state.turnNumber * 2654435761) ^ (state.deck.length << 8) ^ state.discard.length) >>>
    0;
  return createRng(s || 1);
}

function reject(state: GameState, reason: string): DispatchResult {
  return {
    state,
    events: [{ type: 'rejected', message: reason }],
    rejected: reason,
  };
}

function checkWinner(state: GameState, events: GameEvent[]): void {
  for (const p of state.players) {
    if (countCompleteSets(p) >= WIN_SETS) {
      state.winnerId = p.id;
      state.turnPhase = 'game_over';
      events.push({
        type: 'winner',
        playerId: p.id,
        message: `${p.id} wins with ${countCompleteSets(p)} complete sets!`,
      });
      return;
    }
  }
}

function pushPayment(
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

function emitObligationProceedEvents(
  events: GameEvent[],
  contested: ContestedAction,
  amountDue: number,
): void {
  switch (contested.type) {
    case 'rent':
      events.push({
        type: 'rent_charged',
        playerId: contested.actorId,
        message: `${contested.actorId} charges ${contested.targetPlayerId} $${amountDue}M rent`,
        data: contested.payload,
      });
      break;
    case 'its_my_birthday':
      events.push({
        type: 'birthday',
        playerId: contested.actorId,
        message: `${contested.targetPlayerId} owes $${amountDue}M birthday money to ${contested.actorId}`,
      });
      break;
  }
}

function tryCompletePaymentRound(state: GameState): void {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (top?.kind !== 'payment_round') return;
  if (top.entries.every((e) => e.phase === 'done' || e.phase === 'skipped')) {
    state.pendingStack.pop();
  }
}

function finishRoundEntryJsn(
  events: GameEvent[],
  entry: PaymentRoundEntry,
  cancelled: boolean,
): void {
  if (!entry.jsn) return;
  const contested = entry.jsn.contestedAction;
  if (cancelled) {
    entry.phase = 'skipped';
    entry.jsn = undefined;
    events.push({
      type: 'action_cancelled',
      playerId: contested.actorId,
      message: `Action ${contested.type} cancelled by Just Say No`,
      data: { contested },
    });
    return;
  }
  entry.phase = 'payment';
  entry.jsn = undefined;
  emitObligationProceedEvents(events, contested, entry.amountDue);
}

function openPaymentRound(
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

    const entry: PaymentRoundEntry = {
      payerId: ob.payerId,
      amountDue: ob.amountDue,
      phase: 'payment',
    };
    const hasJsn = payer.hand.some((c) => c.kind === 'action' && c.action === 'just_say_no');
    if (hasJsn) {
      entry.phase = 'jsn';
      entry.jsn = {
        respondentId: ob.payerId,
        initiatorId: ob.contested.actorId,
        contestedAction: ob.contested,
        jsnCount: 0,
      };
    } else {
      emitObligationProceedEvents(events, ob.contested, ob.amountDue);
    }
    entries.push(entry);
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
    if (source === 'bank') {
      const idx = payer.board.bank.findIndex((c) => c.id === card.id);
      payer.board.bank.splice(idx, 1);
      payee.board.bank.push(card);
    } else {
      const found = findPropertyCard(payer, card.id);
      if (!found) continue;
      const color = found.set.color;
      const { card: removed, brokeSet, orphanedBuildings } = removeCardFromBoard(payer, card.id);
      if (orphanedBuildings.length) placeOrphanedBuildings(payer, orphanedBuildings, color);
      if (brokeSet) {
        events.push({
          type: 'set_broken',
          playerId: payerId,
          message: `${payerId}'s ${color} set broke due to payment`,
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
    message: `${payerId} paid $${total}M to ${payeeId} (owed $${amountDue}M)`,
    data: { cardIds, total, owed: amountDue },
  });
  checkWinner(state, events);
  return undefined;
}

function offerJsnOrProceed(
  state: GameState,
  events: GameEvent[],
  contested: ContestedAction,
  respondentId: string,
): void {
  const respondent = getPlayer(state, respondentId);
  const hasJsn = respondent.hand.some(
    (c) => c.kind === 'action' && c.action === 'just_say_no',
  );
  if (hasJsn) {
    state.pendingStack.push({
      kind: 'just_say_no',
      respondentId,
      initiatorId: contested.actorId,
      contestedAction: contested,
      jsnCount: 0,
    });
  } else {
    resolveContestedAction(state, events, contested, false);
  }
}

function resolveContestedAction(
  state: GameState,
  events: GameEvent[],
  contested: ContestedAction,
  cancelled: boolean,
): void {
  if (cancelled) {
    events.push({
      type: 'action_cancelled',
      playerId: contested.actorId,
      message: `Action ${contested.type} cancelled by Just Say No`,
      data: { contested },
    });
    return;
  }

  switch (contested.type) {
    case 'debt_collector': {
      pushPayment(state, contested.targetPlayerId!, contested.actorId, 5, 'debt_collector');
      events.push({
        type: 'debt_collector',
        playerId: contested.actorId,
        message: `${contested.actorId} demands $5M from ${contested.targetPlayerId}`,
      });
      break;
    }
    case 'its_my_birthday': {
      const target = contested.targetPlayerId!;
      pushPayment(state, target, contested.actorId, 2, 'birthday');
      events.push({
        type: 'birthday',
        playerId: contested.actorId,
        message: `${target} owes $2M birthday money to ${contested.actorId}`,
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
        message: `${contested.actorId} charges ${target} $${amount}M rent`,
        data: contested.payload,
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
      if (orphanedBuildings.length) {
        placeOrphanedBuildings(victim, orphanedBuildings, found.set.color);
      }
      const color =
        card.kind === 'property'
          ? card.color
          : card.kind === 'property_wild'
            ? (card.assignedColor ?? card.colors[0] ?? 'brown')
            : found.set.color;
      if (card.kind === 'action') {
        // orphaned building stolen
        if (card.action === 'house') {
          actor.board.sets.push({ id: newSetId(), color, cards: [], house: card });
        } else if (card.action === 'hotel') {
          actor.board.sets.push({ id: newSetId(), color, cards: [], hotel: card });
        }
      } else {
        placePropertyCard(actor, card, color);
      }
      events.push({
        type: 'sly_deal',
        playerId: contested.actorId,
        message: `${contested.actorId} sly-dealt ${targetCardId} from ${targetPlayerId}`,
      });
      if (brokeSet) {
        events.push({
          type: 'set_broken',
          playerId: targetPlayerId,
          message: `${targetPlayerId}'s set broke`,
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
      if (removedTheirs.orphanedBuildings.length) {
        placeOrphanedBuildings(victim, removedTheirs.orphanedBuildings, theirColor);
      }
      if (removedMine.orphanedBuildings.length) {
        placeOrphanedBuildings(actor, removedMine.orphanedBuildings, myColor);
      }
      placeTakenCard(actor, removedTheirs.card, theirColor);
      placeTakenCard(victim, removedMine.card, myColor);
      events.push({
        type: 'forced_deal',
        playerId: contested.actorId,
        message: `${contested.actorId} forced deal with ${targetPlayerId}`,
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
      transferSet(victim, actor, targetSetId);
      events.push({
        type: 'deal_breaker',
        playerId: contested.actorId,
        message: `${contested.actorId} deal-broke a ${set.color} set from ${targetPlayerId}`,
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

function beginRentCollection(
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

// Once a player has no plays left and every pending interaction has resolved
// (rent/birthday collected, Just Say No windows answered, etc.), end their turn
// automatically instead of waiting for an explicit END_TURN command.
function maybeAutoEndTurn(state: GameState, events: GameEvent[]): void {
  if (state.turnPhase === 'game_over') return;
  if (!state.drawnThisTurn) return;
  if (state.playsRemaining > 0) return;
  const blocking = state.pendingStack.some((p) => p.kind !== 'double_rent_pending');
  if (blocking) return;

  state.pendingStack = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
  state.pendingDoubles = 0;

  const player = currentPlayer(state);
  if (player.hand.length > HAND_LIMIT) {
    const excess = player.hand.length - HAND_LIMIT;
    state.pendingStack.push({ kind: 'hand_limit_discard', playerId: player.id, excess });
    state.turnPhase = 'awaiting_discard';
    events.push({
      type: 'discarded',
      playerId: player.id,
      message: `${player.id} must discard ${excess} card(s)`,
    });
    return;
  }

  advanceTurn(state, events);
}

export function dispatch(state: GameState, command: Command): DispatchResult {
  if (state.winnerId && command.type !== 'END_TURN') {
    // Allow nothing except viewing — reject mutations
    if (command.type !== 'DRAW_TURN_CARDS') {
      // still reject most
    }
  }
  if (state.turnPhase === 'game_over') {
    return reject(state, 'Game is over');
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];

  try {
    let result: DispatchResult;
    switch (command.type) {
      case 'DRAW_TURN_CARDS':
        result = handleDraw(next, events, command.playerId);
        break;
      case 'PLAY_CARD':
        result = handlePlay(next, events, command.playerId, command.cardId, command.zone, command.target);
        break;
      case 'SELECT_PAYMENT':
        result = handlePayment(next, events, command.playerId, command.cardIds);
        break;
      case 'RESPOND_JUST_SAY_NO':
        result = handleJsn(next, events, command.playerId, command.cardId);
        break;
      case 'DECLINE_JUST_SAY_NO':
        result = handleDeclineJsn(next, events, command.playerId);
        break;
      case 'REARRANGE_PROPERTY':
        result = handleRearrange(next, events, command.playerId, command.cardId, command.toColor, command.toSetId);
        break;
      case 'DISCARD_EXCESS':
        result = handleDiscardExcess(next, events, command.playerId, command.cardIds);
        break;
      case 'END_TURN':
        result = handleEndTurn(next, events, command.playerId);
        break;
      case 'SELECT_RENT_COLOR':
        result = handleRentColor(next, events, command.playerId, command.color);
        break;
      case 'SELECT_RENT_PLAYER':
        result = handleRentPlayer(next, events, command.playerId, command.targetPlayerId);
        break;
      case 'SELECT_DEBT_COLLECTOR_PLAYER':
        result = handleDebtCollectorPlayer(next, events, command.playerId, command.targetPlayerId);
        break;
      case 'SELECT_STEAL_TARGET':
        result = handleStealTarget(next, events, command);
        break;
      case 'SELECT_BUILDING_SET':
        result = handleBuildingSet(next, events, command.playerId, command.setId);
        break;
      case 'FORCE_END_TURN':
        result = handleForceEndTurn(next, events, command.playerId);
        break;
      case 'AUTO_RESOLVE_PENDING':
        result = handleAutoResolvePending(next, events, command.playerId);
        break;
      case 'PLAYER_CONNECTION_CHANGED':
        result = handleConnectionChanged(next, events, command.playerId, command.connected);
        break;
      default:
        return reject(state, 'Unknown command');
    }
    if (!result.rejected) {
      maybeAutoEndTurn(result.state, result.events);
    }
    return result;
  } catch (e) {
    return reject(state, e instanceof Error ? e.message : String(e));
  }
}

function handleDraw(state: GameState, events: GameEvent[], playerId: string): DispatchResult {
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

function handlePlay(
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
      message: `${playerId} banked a card worth $${card.value}M`,
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
  state.playsRemaining -= 1;

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

  if (target?.rentColor && eligible.includes(target.rentColor)) {
    if (card.rentType === 'wild') {
      if (target.targetPlayerId) {
        beginRentCollection(state, events, playerId, target.rentColor, doubles, 'wild', target.targetPlayerId);
        return { state, events };
      }
      state.pendingStack.push({
        kind: 'rent_player_choice',
        actorId: playerId,
        cardId: card.id,
        color: target.rentColor,
        doubleCount: doubles,
        amount: 0, // filled when player chosen — recalculated
      });
      // Fix amount
      const top = state.pendingStack[state.pendingStack.length - 1];
      if (top?.kind === 'rent_player_choice') {
        const set = player.board.sets.find((s) => s.color === target.rentColor);
        if (set) {
          let amt = rentForSet(set);
          for (let i = 0; i < doubles; i++) amt *= 2;
          top.amount = amt;
        }
      }
      return { state, events };
    }
    beginRentCollection(state, events, playerId, target.rentColor, doubles, 'dual');
    return { state, events };
  }

  if (eligible.length === 1 && card.rentType === 'dual') {
    beginRentCollection(state, events, playerId, eligible[0]!, doubles, 'dual');
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

function handlePayment(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  cardIds: string[],
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];

  if (top?.kind === 'payment_round') {
    const entry = top.entries.find((e) => e.payerId === playerId && e.phase === 'payment');
    if (!entry) return reject(state, 'No payment pending for this player');

    const err = applyPaymentTransfer(state, events, playerId, top.payeeId, entry.amountDue, cardIds);
    if (err) return reject(state, err);

    entry.phase = 'done';
    tryCompletePaymentRound(state);
    return { state, events };
  }

  if (!top || top.kind !== 'payment') return reject(state, 'No payment pending');
  if (top.payerId !== playerId) return reject(state, 'Not the payer');

  const err = applyPaymentTransfer(state, events, playerId, top.payeeId, top.amountDue, cardIds);
  if (err) return reject(state, err);

  state.pendingStack.pop();
  return { state, events };
}

function handleRoundJsn(
  state: GameState,
  events: GameEvent[],
  entry: PaymentRoundEntry,
  playerId: string,
  cardId: string,
): DispatchResult {
  if (!entry.jsn || entry.jsn.respondentId !== playerId) {
    return reject(state, 'Not your Just Say No window');
  }

  const player = getPlayer(state, playerId);
  const card = findCardInHand(player, cardId);
  if (!card || card.kind !== 'action' || card.action !== 'just_say_no') {
    return reject(state, 'Must play Just Say No card');
  }

  removeFromHand(player, cardId);
  state.discard.push(card);

  const jsnCount = entry.jsn.jsnCount + 1;
  events.push({
    type: 'just_say_no',
    playerId,
    message: `${playerId} played Just Say No (chain ${jsnCount})`,
  });

  const contested = entry.jsn.contestedAction;
  const nextRespondent =
    playerId === contested.actorId ? contested.targetPlayerId! : contested.actorId;
  const canCounter = getPlayer(state, nextRespondent).hand.some(
    (c) => c.kind === 'action' && c.action === 'just_say_no',
  );

  if (canCounter) {
    entry.jsn.respondentId = nextRespondent;
    entry.jsn.initiatorId = playerId;
    entry.jsn.jsnCount = jsnCount;
  } else {
    finishRoundEntryJsn(events, entry, jsnCount % 2 === 1);
    tryCompletePaymentRound(state);
  }

  return { state, events };
}

function handleRoundDeclineJsn(
  state: GameState,
  events: GameEvent[],
  entry: PaymentRoundEntry,
  playerId: string,
): DispatchResult {
  if (!entry.jsn || entry.jsn.respondentId !== playerId) {
    return reject(state, 'Not your Just Say No window');
  }

  events.push({
    type: 'just_say_no_declined',
    playerId,
    message: `${playerId} declined Just Say No`,
  });

  finishRoundEntryJsn(events, entry, entry.jsn.jsnCount % 2 === 1);
  tryCompletePaymentRound(state);
  return { state, events };
}

function handleJsn(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  cardId: string,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];

  if (top?.kind === 'payment_round') {
    const entry = top.entries.find((e) => e.phase === 'jsn' && e.jsn?.respondentId === playerId);
    if (!entry) return reject(state, 'No Just Say No pending');
    return handleRoundJsn(state, events, entry, playerId, cardId);
  }

  if (!top || top.kind !== 'just_say_no') return reject(state, 'No Just Say No pending');
  if (top.respondentId !== playerId) return reject(state, 'Not your Just Say No window');

  const player = getPlayer(state, playerId);
  const card = findCardInHand(player, cardId);
  if (!card || card.kind !== 'action' || card.action !== 'just_say_no') {
    return reject(state, 'Must play Just Say No card');
  }

  removeFromHand(player, cardId);
  state.discard.push(card);
  // Does NOT consume a play

  const jsnCount = top.jsnCount + 1;
  events.push({
    type: 'just_say_no',
    playerId,
    message: `${playerId} played Just Say No (chain ${jsnCount})`,
  });

  // Pop current JSN pending
  state.pendingStack.pop();

  // Special: JSN against Double the Rent — negate one double
  if (top.contestedAction.type === 'double_the_rent') {
    // odd jsnCount means cancelled
    if (jsnCount % 2 === 1) {
      state.pendingDoubles = Math.max(0, state.pendingDoubles - 1);
      events.push({
        type: 'action_cancelled',
        message: 'Double the Rent negated; original rent still applies if played',
      });
    }
    return { state, events };
  }

  // Offer counter-JSN to the other party
  const nextRespondent =
    playerId === top.contestedAction.actorId
      ? top.contestedAction.targetPlayerId!
      : top.contestedAction.actorId;

  const nextPlayer = getPlayer(state, nextRespondent);
  const canCounter = nextPlayer.hand.some(
    (c) => c.kind === 'action' && c.action === 'just_say_no',
  );

  if (canCounter) {
    state.pendingStack.push({
      kind: 'just_say_no',
      respondentId: nextRespondent,
      initiatorId: playerId,
      contestedAction: top.contestedAction,
      jsnCount,
    });
  } else {
    // Chain ends: odd = cancelled, even = proceeds
    const cancelled = jsnCount % 2 === 1;
    resolveContestedAction(state, events, top.contestedAction, cancelled);
  }

  return { state, events };
}

function handleDeclineJsn(
  state: GameState,
  events: GameEvent[],
  playerId: string,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];

  if (top?.kind === 'payment_round') {
    const entry = top.entries.find((e) => e.phase === 'jsn' && e.jsn?.respondentId === playerId);
    if (!entry) return reject(state, 'No Just Say No pending');
    return handleRoundDeclineJsn(state, events, entry, playerId);
  }

  if (!top || top.kind !== 'just_say_no') return reject(state, 'No Just Say No pending');
  if (top.respondentId !== playerId) return reject(state, 'Not your Just Say No window');

  state.pendingStack.pop();
  events.push({
    type: 'just_say_no_declined',
    playerId,
    message: `${playerId} declined Just Say No`,
  });

  // jsnCount even (including 0) → action proceeds; odd → cancelled
  const cancelled = top.jsnCount % 2 === 1;
  resolveContestedAction(state, events, top.contestedAction, cancelled);
  return { state, events };
}

function handleRearrange(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  cardId: string,
  toColor: PropertyColor,
  toSetId?: string,
): DispatchResult {
  const blocking = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
  if (blocking.length > 0) return reject(state, 'Cannot rearrange during pending');
  const player = currentPlayer(state);
  if (player.id !== playerId) return reject(state, 'Not your turn');
  if (state.turnPhase !== 'playing' && state.turnPhase !== 'awaiting_draw') {
    // Allow during own turn after draw
  }
  if (player.id !== currentPlayer(state).id) return reject(state, 'Not your turn');

  const found = findPropertyCard(player, cardId);
  if (!found) return reject(state, 'Card not on your board');
  const card = found.card;
  if (card.kind !== 'property_wild' && card.kind !== 'property') {
    return reject(state, 'Can only rearrange properties');
  }
  if (card.kind === 'property' && card.color !== toColor) {
    return reject(state, 'Natural property cannot change color');
  }
  if (card.kind === 'property_wild' && !canAssignWildToColor(card, toColor)) {
    return reject(state, 'Wild cannot be that color');
  }

  const color = found.set.color;
  const { orphanedBuildings, brokeSet } = removeCardFromBoard(player, cardId);
  if (orphanedBuildings.length) placeOrphanedBuildings(player, orphanedBuildings, color);
  placePropertyCard(player, card, toColor, toSetId);
  // Does not consume a play
  events.push({
    type: 'rearranged',
    playerId,
    message: `${playerId} rearranged ${cardId} to ${toColor}`,
  });
  if (brokeSet) {
    events.push({ type: 'set_broken', playerId, message: `Set broken by rearrange` });
  }
  checkWinner(state, events);
  return { state, events };
}

function handleDiscardExcess(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  cardIds: string[],
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top || top.kind !== 'hand_limit_discard') {
    return reject(state, 'No hand-limit discard pending');
  }
  if (top.playerId !== playerId) return reject(state, 'Not your discard');
  if (cardIds.length !== top.excess) {
    return reject(state, `Must discard exactly ${top.excess} cards`);
  }

  const player = getPlayer(state, playerId);
  for (const id of cardIds) {
    if (!findCardInHand(player, id)) return reject(state, `Card ${id} not in hand`);
  }
  for (const id of cardIds) {
    const card = removeFromHand(player, id);
    state.discard.push(card);
  }
  state.pendingStack.pop();
  events.push({
    type: 'hand_limit_discard',
    playerId,
    message: `${playerId} discarded ${cardIds.length} excess card(s)`,
  });

  // Finish ending turn
  advanceTurn(state, events);
  return { state, events };
}

function handleEndTurn(state: GameState, events: GameEvent[], playerId: string): DispatchResult {
  if (state.pendingStack.some((p) => p.kind !== 'double_rent_pending')) {
    return reject(state, 'Cannot end turn with pending interactions');
  }
  // Clear unused doubles
  state.pendingStack = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
  state.pendingDoubles = 0;

  const player = currentPlayer(state);
  if (player.id !== playerId) return reject(state, 'Not your turn');
  if (!state.drawnThisTurn) return reject(state, 'Must draw before ending turn');

  if (player.hand.length > HAND_LIMIT) {
    const excess = player.hand.length - HAND_LIMIT;
    state.pendingStack.push({ kind: 'hand_limit_discard', playerId, excess });
    state.turnPhase = 'awaiting_discard';
    events.push({
      type: 'discarded',
      playerId,
      message: `${playerId} must discard ${excess} card(s)`,
    });
    return { state, events };
  }

  advanceTurn(state, events);
  return { state, events };
}

function advanceTurn(state: GameState, events: GameEvent[]): void {
  events.push({
    type: 'turn_ended',
    playerId: currentPlayer(state).id,
    message: `${currentPlayer(state).id} ended their turn`,
  });
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber += 1;
  state.playsRemaining = MAX_PLAYS;
  state.drawnThisTurn = false;
  state.turnPhase = 'awaiting_draw';
  state.pendingDoubles = 0;
}

function handleRentColor(
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

function handleRentPlayer(
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

function handleDebtCollectorPlayer(
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

function handleStealTarget(
  state: GameState,
  events: GameEvent[],
  command: Extract<Command, { type: 'SELECT_STEAL_TARGET' }>,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top) return reject(state, 'No steal pending');
  if (top.kind === 'sly_deal_target') {
    if (top.actorId !== command.playerId) return reject(state, 'Not your sly deal');
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

function handleBuildingSet(
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

function actingPlayerForPending(top: GameState['pendingStack'][number]): string | null {
  switch (top.kind) {
    case 'payment':
      return top.payerId;
    case 'payment_round': {
      const jsn = top.entries.find((e) => e.phase === 'jsn' && e.jsn);
      if (jsn?.jsn) return jsn.jsn.respondentId;
      const pay = top.entries.find((e) => e.phase === 'payment');
      return pay?.payerId ?? null;
    }
    case 'just_say_no':
      return top.respondentId;
    case 'hand_limit_discard':
      return top.playerId;
    case 'sly_deal_target':
    case 'forced_deal_target':
    case 'deal_breaker_target':
    case 'debt_collector_target':
    case 'rent_color_choice':
    case 'rent_player_choice':
    case 'house_hotel_target':
    case 'double_rent_pending':
      return top.actorId;
    default: {
      const _e: never = top;
      return _e;
    }
  }
}

function handleForceEndTurn(
  state: GameState,
  events: GameEvent[],
  playerId: string,
): DispatchResult {
  const player = currentPlayer(state);
  if (player.id !== playerId) return reject(state, 'Not your turn');
  if (state.turnPhase === 'game_over') return reject(state, 'Game is over');

  const hard = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
  const onlyOwnDiscard =
    hard.length === 1 &&
    hard[0]!.kind === 'hand_limit_discard' &&
    hard[0]!.playerId === playerId;
  if (hard.length > 0 && !onlyOwnDiscard) {
    return reject(state, 'Cannot force end turn while pending interactions');
  }

  state.pendingStack = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
  state.pendingDoubles = 0;

  if (onlyOwnDiscard) {
    const top = state.pendingStack[state.pendingStack.length - 1];
    if (top?.kind === 'hand_limit_discard') {
      const ids = computeAutoDiscard(player.hand, top.excess);
      return handleDiscardExcess(state, events, playerId, ids);
    }
  }

  if (player.hand.length > HAND_LIMIT) {
    const excess = player.hand.length - HAND_LIMIT;
    const ids = computeAutoDiscard(player.hand, excess);
    for (const id of ids) {
      const card = removeFromHand(player, id);
      state.discard.push(card);
    }
    events.push({
      type: 'hand_limit_discard',
      playerId,
      message: `${playerId} auto-discarded ${ids.length} excess card(s)`,
    });
  }

  events.push({
    type: 'turn_ended',
    playerId,
    message: `${playerId} turn force-ended`,
    data: { forced: true },
  });
  // advanceTurn also pushes turn_ended — avoid duplicate by inlining advance without event
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber += 1;
  state.playsRemaining = MAX_PLAYS;
  state.drawnThisTurn = false;
  state.turnPhase = 'awaiting_draw';
  state.pendingDoubles = 0;
  return { state, events };
}

function cancelTopPending(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  reason: string,
): DispatchResult {
  const top = state.pendingStack.pop();
  if (!top) return reject(state, 'No pending to cancel');
  events.push({
    type: 'action_cancelled',
    playerId,
    message: reason,
    data: { kind: top.kind, forced: true },
  });
  return { state, events };
}

function handleAutoResolvePending(
  state: GameState,
  events: GameEvent[],
  playerId: string,
): DispatchResult {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top) return reject(state, 'No pending interaction');

  // payment_round can have several seats acting in parallel — validate per entry.
  if (top.kind === 'payment_round') {
    const jsnEntry = top.entries.find(
      (e) => e.phase === 'jsn' && e.jsn?.respondentId === playerId,
    );
    if (jsnEntry) return handleDeclineJsn(state, events, playerId);
    const payEntry = top.entries.find(
      (e) => e.phase === 'payment' && e.payerId === playerId,
    );
    if (!payEntry) return reject(state, 'No payment pending for this player');
    const cardIds = computeAutoPayment(state, playerId, payEntry.amountDue);
    return handlePayment(state, events, playerId, cardIds);
  }

  const actor = actingPlayerForPending(top);
  if (actor !== playerId) return reject(state, 'Not your pending interaction');

  switch (top.kind) {
    case 'just_say_no':
      return handleDeclineJsn(state, events, playerId);
    case 'payment': {
      const cardIds = computeAutoPayment(state, playerId, top.amountDue);
      return handlePayment(state, events, playerId, cardIds);
    }
    case 'hand_limit_discard': {
      const ids = computeAutoDiscard(getPlayer(state, playerId).hand, top.excess);
      return handleDiscardExcess(state, events, playerId, ids);
    }
    case 'double_rent_pending': {
      state.pendingStack = state.pendingStack.filter((p) => p.kind !== 'double_rent_pending');
      state.pendingDoubles = 0;
      events.push({
        type: 'action_cancelled',
        playerId,
        message: `${playerId} unused Double the Rent cleared`,
        data: { kind: 'double_rent_pending', forced: true },
      });
      return { state, events };
    }
    case 'sly_deal_target':
    case 'forced_deal_target':
    case 'deal_breaker_target':
    case 'debt_collector_target':
    case 'rent_color_choice':
    case 'rent_player_choice':
    case 'house_hotel_target':
      return cancelTopPending(
        state,
        events,
        playerId,
        `${playerId} forfeited ${top.kind} (auto-resolve)`,
      );
    default: {
      const _e: never = top;
      return reject(state, `Cannot auto-resolve ${JSON.stringify(_e)}`);
    }
  }
}

function handleConnectionChanged(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  connected: boolean,
): DispatchResult {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return reject(state, 'Unknown player');
  player.connected = connected;
  events.push({
    type: 'player_connection',
    playerId,
    message: `${playerId} ${connected ? 'reconnected' : 'disconnected'}`,
    data: { connected },
  });
  return { state, events };
}

// Re-export for validators
export { beginRentCollection, offerJsnOrProceed, resolveContestedAction };
