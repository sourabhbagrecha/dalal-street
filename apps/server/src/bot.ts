/**
 * Bot decision-making. A bot is an ordinary seat: the server calls the same
 * `getLegalCommands` / `dispatch` path used for any player and merely picks
 * which legal command to send. Every function here is given a `ClientGameState`
 * — exactly what `project(state, botId)` would hand a real client in that seat
 * — never the full `GameState`, so a bot can never see another player's hand,
 * the deck order, or the shuffle seed. No rule logic lives here: legality is
 * entirely `getLegalCommands`'s job (packages/engine); this file only scores
 * and ranks the options it returns.
 */
import type {
  Card,
  ClientGameState,
  Command,
  PlayerBoard,
  PlayTarget,
  PlayZone,
  PropertyColor,
  PropertySet,
} from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { boardAssetValue, cardPaymentValue, rentForSet } from '@monopoly-deal/engine';

/** A bot "thinks" for a random span in [minMs, maxMs] before acting, for realism. */
interface BotDelayRange {
  botMinDelayMs: number;
  botMaxDelayMs: number;
}

export function botThinkingDelayMs(range: BotDelayRange, rng: () => number = Math.random): number {
  const span = Math.max(0, range.botMaxDelayMs - range.botMinDelayMs);
  return Math.round(range.botMinDelayMs + rng() * span);
}

/** Picks the highest-scoring legal command for this bot. Ties keep the first (stable, deterministic). */
export function chooseBotCommand(view: ClientGameState, legalCommands: readonly Command[]): Command {
  let best = legalCommands[0];
  if (!best) {
    throw new Error('chooseBotCommand: no legal commands');
  }
  let bestScore = scoreBotCommand(view, best);
  for (let i = 1; i < legalCommands.length; i++) {
    const candidate = legalCommands[i]!;
    const score = scoreBotCommand(view, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Greedy score for one legal command — higher is better. Prefers completing
 * sets, then banking money / playing useful actions, over stalling
 * (AUTO_RESOLVE_PENDING / FORCE_END_TURN), which are only ever chosen when
 * nothing else is legal.
 */
export function scoreBotCommand(view: ClientGameState, command: Command): number {
  switch (command.type) {
    case 'DRAW_TURN_CARDS':
      return 100;
    case 'PLAY_CARD':
      return scorePlayCard(view, card(view, command.cardId), command.zone, command.target);
    case 'REARRANGE_PROPERTY':
      // Only offered by getLegalCommands when it completes a set.
      return 85;
    case 'RESUME_PLAY':
      return 20;
    case 'END_TURN':
      return 5;
    case 'DISCARD_EXCESS':
      return scoreDiscard(view, command.cardIds);
    case 'SELECT_PAYMENT':
      return scorePayment(view, command.playerId, command.cardIds);
    case 'RESPOND_JUST_SAY_NO':
      return 90;
    case 'DECLINE_JUST_SAY_NO':
      return 0;
    case 'SELECT_RENT_COLOR': {
      const set = view.you.board.sets.find((s) => s.color === command.color);
      return set ? rentForSet(set) : 0;
    }
    case 'SELECT_RENT_PLAYER':
    case 'SELECT_DEBT_COLLECTOR_PLAYER': {
      const target = view.players.find((p) => p.id === command.targetPlayerId);
      return target ? boardAssetValue(target.board) : 0;
    }
    case 'SELECT_STEAL_TARGET':
      return scoreStealTarget(view, command);
    case 'SELECT_BUILDING_SET':
      return 10;
    case 'FORCE_END_TURN':
      return -100;
    case 'AUTO_RESOLVE_PENDING':
      return -1000;
    case 'PLAYER_CONNECTION_CHANGED':
      return -1000;
    default:
      // Exhaustive per Command's union; getLegalCommands never emits anything else.
      return 0;
  }
}

function card(view: ClientGameState, cardId: string): Card | undefined {
  return view.you.hand.find((c) => c.id === cardId);
}

function scorePlayCard(
  view: ClientGameState,
  played: Card | undefined,
  zone: PlayZone,
  target: PlayTarget | undefined,
): number {
  if (!played) return 0;
  if (zone === 'bank') {
    // Money always wants banking; banking an action/rent card instead of
    // playing it burns its effect, so it scores as a low-value fallback.
    return played.kind === 'money' ? 45 + played.value : 25;
  }
  if (zone === 'property') {
    return scorePropertyPlay(view, played, target?.assignedColor);
  }
  return scoreActionDiscard(played);
}

function scorePropertyPlay(
  view: ClientGameState,
  played: Card,
  assignedColor: PropertyColor | undefined,
): number {
  const color = played.kind === 'property' ? played.color : assignedColor;
  if (!color) return 50;
  const existing = view.you.board.sets.find((s) => s.color === color);
  const currentSize = existing?.cards.length ?? 0;
  const needed = SET_SIZES[color];
  if (currentSize + 1 >= needed) return 100;
  if (currentSize > 0) return 60 + currentSize * 5;
  return 40;
}

function scoreActionDiscard(played: Card): number {
  if (played.kind === 'rent') return 55;
  if (played.kind === 'action') {
    switch (played.action) {
      case 'deal_breaker':
        return 90;
      case 'sly_deal':
        return 70;
      case 'forced_deal':
        return 65;
      case 'house':
      case 'hotel':
        return 65;
      case 'debt_collector':
        return 60;
      case 'pass_go':
        return 60;
      case 'its_my_birthday':
        return 55;
      case 'double_the_rent':
        return 50;
      default:
        return 40;
    }
  }
  return 30;
}

function boardCardValue(view: ClientGameState, cardId: string): number {
  const boards: PlayerBoard[] = [view.you.board, ...view.players.map((p) => p.board)];
  for (const board of boards) {
    for (const c of board.bank) {
      if (c.id === cardId) return cardPaymentValue(c);
    }
    for (const set of board.sets) {
      for (const c of set.cards) {
        if (c.id === cardId) return cardPaymentValue(c);
      }
      if (set.house?.id === cardId) return cardPaymentValue(set.house);
      if (set.hotel?.id === cardId) return cardPaymentValue(set.hotel);
    }
  }
  return 0;
}

function findAmountDue(view: ClientGameState, playerId: string): number {
  const top = view.pendingStack[view.pendingStack.length - 1];
  if (!top) return 0;
  if (top.kind === 'payment' && top.payerId === playerId) return top.amountDue;
  if (top.kind === 'payment_round') {
    const entry = top.entries.find((e) => e.payerId === playerId && e.phase === 'payment');
    if (entry) return entry.amountDue;
  }
  return 0;
}

function scorePayment(view: ClientGameState, playerId: string, cardIds: string[]): number {
  const due = findAmountDue(view, playerId);
  let total = 0;
  for (const id of cardIds) total += boardCardValue(view, id);
  const overpay = Math.max(0, total - due);
  // Smallest overpay wins; break ties toward the smallest total handed over.
  return -overpay * 10 - total * 0.01;
}

function scoreDiscard(view: ClientGameState, cardIds: string[]): number {
  let total = 0;
  for (const id of cardIds) {
    const c = view.you.hand.find((h) => h.id === id);
    if (c) total += c.value;
  }
  // Keep the highest-value cards: discard whichever combo is worth the least.
  return -total;
}

function setAssetValue(set: PropertySet): number {
  return boardAssetValue({ bank: [], sets: [set] });
}

function scoreStealTarget(
  view: ClientGameState,
  command: Extract<Command, { type: 'SELECT_STEAL_TARGET' }>,
): number {
  if (command.targetSetId !== undefined) {
    if (command.targetSetId === '__none__') return -50;
    for (const p of view.players) {
      const set = p.board.sets.find((s) => s.id === command.targetSetId);
      if (set) return setAssetValue(set);
    }
    return 0;
  }
  if (command.targetCardId && command.ownCardId) {
    return boardCardValue(view, command.targetCardId) - boardCardValue(view, command.ownCardId);
  }
  if (command.targetCardId) {
    return boardCardValue(view, command.targetCardId);
  }
  return 0;
}
