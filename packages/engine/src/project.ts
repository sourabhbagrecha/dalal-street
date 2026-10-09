import type {
  ContestedAction,
  GameState,
  PendingInteraction,
} from '@monopoly-deal/shared';
import type {
  ClientDeadlines,
  ClientGameState,
  ClientPendingInteraction,
  ClientPlayerPublic,
  ProjectOptions,
} from '@monopoly-deal/shared';

function cloneBoard(board: ClientPlayerPublic['board']): ClientPlayerPublic['board'] {
  return structuredClone(board);
}

function redactContestedAction(action: ContestedAction): ContestedAction {
  // Contested payload may hold targeting ids that are table-visible once chosen;
  // strip anything that looks like a private hand list.
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(action.payload)) {
    if (k === 'hand' || k === 'hands' || k === 'deck' || k === 'seed') continue;
    payload[k] = v;
  }
  return { ...action, payload };
}

function redactPending(
  pending: PendingInteraction,
  viewerId: string | null,
): ClientPendingInteraction {
  switch (pending.kind) {
    case 'payment':
      return {
        kind: 'payment',
        payerId: pending.payerId,
        payeeId: pending.payeeId,
        amountDue: pending.amountDue,
        reason: pending.reason,
      };
    case 'payment_round':
      return {
        kind: 'payment_round',
        payeeId: pending.payeeId,
        reason: pending.reason,
        entries: pending.entries.map((e) => ({
          payerId: e.payerId,
          amountDue: e.amountDue,
          phase: e.phase,
          jsn: e.jsn
            ? {
                respondentId: e.jsn.respondentId,
                initiatorId: e.jsn.initiatorId,
                jsnCount: e.jsn.jsnCount,
                contestedAction: redactContestedAction(e.jsn.contestedAction),
              }
            : undefined,
        })),
      };
    case 'just_say_no':
      return {
        kind: 'just_say_no',
        respondentId: pending.respondentId,
        initiatorId: pending.initiatorId,
        contestedAction: redactContestedAction(pending.contestedAction),
        jsnCount: pending.jsnCount,
      };
    case 'sly_deal_target':
      return {
        kind: 'sly_deal_target',
        actorId: pending.actorId,
        cardId: viewerId === pending.actorId ? pending.cardId : undefined,
      };
    case 'forced_deal_target':
      return {
        kind: 'forced_deal_target',
        actorId: pending.actorId,
        cardId: viewerId === pending.actorId ? pending.cardId : undefined,
      };
    case 'deal_breaker_target':
      return {
        kind: 'deal_breaker_target',
        actorId: pending.actorId,
        cardId: viewerId === pending.actorId ? pending.cardId : undefined,
      };
    case 'debt_collector_target':
      return {
        kind: 'debt_collector_target',
        actorId: pending.actorId,
        cardId: viewerId === pending.actorId ? pending.cardId : undefined,
      };
    case 'rent_color_choice':
      return {
        kind: 'rent_color_choice',
        actorId: pending.actorId,
        cardId: viewerId === pending.actorId ? pending.cardId : undefined,
        eligibleColors: [...pending.eligibleColors],
        doubleCount: pending.doubleCount,
        rentType: pending.rentType,
      };
    case 'rent_player_choice':
      return {
        kind: 'rent_player_choice',
        actorId: pending.actorId,
        cardId: viewerId === pending.actorId ? pending.cardId : undefined,
        color: pending.color,
        doubleCount: pending.doubleCount,
        amount: pending.amount,
      };
    case 'house_hotel_target':
      return {
        kind: 'house_hotel_target',
        actorId: pending.actorId,
        cardId: viewerId === pending.actorId ? pending.cardId : undefined,
        building: pending.building,
      };
    case 'hand_limit_discard':
      return {
        kind: 'hand_limit_discard',
        playerId: pending.playerId,
        excess: pending.excess,
      };
    case 'double_rent_pending':
      return {
        kind: 'double_rent_pending',
        actorId: pending.actorId,
        doubleCardIds:
          viewerId === pending.actorId ? [...pending.doubleCardIds] : undefined,
        doubleCount: pending.doubleCardIds.length,
      };
    default: {
      const _exhaustive: never = pending;
      throw new Error(`Unhandled pending kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Pure per-player projection. Full GameState never leaves the server;
 * each client receives only what that seat may know in physical play.
 */
export function project(
  state: GameState,
  playerId: string,
  options: ProjectOptions = {},
): ClientGameState {
  const viewer = state.players.find((p) => p.id === playerId);
  if (!viewer) {
    throw new Error(`project: unknown playerId ${playerId}`);
  }
  return projectView(state, playerId, viewer.hand, playerId, options);
}

/**
 * Projection for someone watching without a seat: public information only. Every hand is just a count, and no
 * pending interaction reveals a private card id. `viewerId` is still a seated player (the first) so the client's
 * "own seat" lookups stay total — the view is flagged `spectator` and carries an empty hand.
 */
export function projectSpectator(state: GameState, options: ProjectOptions = {}): ClientGameState {
  const anchor = state.players[0];
  if (!anchor) {
    throw new Error('projectSpectator: no players');
  }
  return { ...projectView(state, anchor.id, [], null, options), spectator: true };
}

function projectView(
  state: GameState,
  playerId: string,
  hand: GameState['players'][number]['hand'],
  revealTo: string | null,
  options: ProjectOptions,
): ClientGameState {
  const connectedOf = (id: string, fallback?: boolean): boolean => {
    if (options.connected && id in options.connected) {
      return options.connected[id]!;
    }
    return fallback !== false;
  };

  const players: ClientPlayerPublic[] = state.players.map((p) => ({
    id: p.id,
    displayName: options.displayNames?.[p.id],
    board: cloneBoard(p.board),
    handCount: p.hand.length,
    connected: connectedOf(p.id, p.connected),
    isBot: options.isBot?.[p.id] ?? false,
    botControlled: options.botControlled?.[p.id] ?? false,
  }));

  const current = state.players[state.currentPlayerIndex];
  if (!current) {
    throw new Error('project: invalid currentPlayerIndex');
  }

  const deadlines: ClientDeadlines | undefined = options.deadlines
    ? structuredClone(options.deadlines)
    : undefined;

  return {
    v: 1,
    viewerId: playerId,
    players,
    hand: structuredClone(hand),
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    discardTop:
      state.discard.length > 0
        ? structuredClone(state.discard[state.discard.length - 1]!)
        : null,
    currentPlayerId: current.id,
    playsRemaining: state.playsRemaining,
    turnPhase: state.turnPhase,
    pendingStack: state.pendingStack.map((p) => redactPending(p, revealTo)),
    pendingDoubles: state.pendingDoubles,
    winnerId: state.winnerId,
    turnNumber: state.turnNumber,
    drawnThisTurn: state.drawnThisTurn,
    deadlines,
  };
}
