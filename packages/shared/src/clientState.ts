import type {
  Card,
  ContestedAction,
  PlayerBoard,
  PropertyColor,
  RentType,
  TurnPhase,
} from './types.js';

/** Deadlines expressed as remaining milliseconds at projection send time. */
export interface ClientDeadlines {
  /** Turn clock for the current player. */
  turnMs?: number;
  /** Active pending-stack response window (JSN / payment / targeting). */
  pendingMs?: number;
  /** Disconnect grace remaining for a seated player, keyed by player id. */
  disconnectGraceMs?: Record<string, number>;
}

/** Public board view — banks and properties are table-visible in physical play. */
export interface ClientPlayerPublic {
  id: string;
  displayName?: string;
  board: PlayerBoard;
  handCount: number;
  connected: boolean;
}

/** Viewing player's private seat. */
export interface ClientPlayerSelf extends ClientPlayerPublic {
  hand: Card[];
}

/**
 * Pending interactions as visible to one seat.
 * Hand contents of others, deck order, and private choice details are stripped.
 */
export type ClientPendingInteraction =
  | {
      kind: 'payment';
      payerId: string;
      payeeId: string;
      amountDue: number;
      reason: string;
    }
  | {
      kind: 'payment_round';
      payeeId: string;
      reason: string;
      entries: Array<{
        payerId: string;
        amountDue: number;
        phase: 'jsn' | 'payment' | 'done' | 'skipped';
        jsn?: {
          respondentId: string;
          initiatorId: string;
          jsnCount: number;
          contestedAction: ContestedAction;
        };
      }>;
    }
  | {
      kind: 'just_say_no';
      respondentId: string;
      initiatorId: string;
      contestedAction: ContestedAction;
      jsnCount: number;
    }
  | {
      kind: 'sly_deal_target';
      actorId: string;
      /** Card id only revealed to the actor (their played card). */
      cardId?: string;
    }
  | {
      kind: 'forced_deal_target';
      actorId: string;
      cardId?: string;
    }
  | {
      kind: 'deal_breaker_target';
      actorId: string;
      cardId?: string;
    }
  | {
      kind: 'debt_collector_target';
      actorId: string;
      cardId?: string;
    }
  | {
      kind: 'rent_color_choice';
      actorId: string;
      cardId?: string;
      eligibleColors: PropertyColor[];
      doubleCount: number;
      rentType: RentType;
    }
  | {
      kind: 'rent_player_choice';
      actorId: string;
      cardId?: string;
      color: PropertyColor;
      doubleCount: number;
      amount: number;
    }
  | {
      kind: 'house_hotel_target';
      actorId: string;
      cardId?: string;
      building: 'house' | 'hotel';
    }
  | {
      kind: 'hand_limit_discard';
      playerId: string;
      excess: number;
    }
  | {
      kind: 'double_rent_pending';
      actorId: string;
      /** Double card ids only for the actor. */
      doubleCardIds?: string[];
      doubleCount: number;
    };

export interface ClientGameState {
  v: 1;
  viewerId: string;
  players: ClientPlayerPublic[];
  /** Full hand for viewer only; never present for others. */
  you: ClientPlayerSelf;
  deckCount: number;
  discardCount: number;
  /** Top of discard pile, or null if empty. */
  discardTop: Card | null;
  currentPlayerId: string;
  playsRemaining: number;
  turnPhase: TurnPhase;
  pendingStack: ClientPendingInteraction[];
  pendingDoubles: number;
  winnerId: string | null;
  turnNumber: number;
  drawnThisTurn: boolean;
  deadlines?: ClientDeadlines;
}

/** Optional overlay when projecting (connection / timers live on the room until merged). */
export interface ProjectOptions {
  connected?: Record<string, boolean>;
  displayNames?: Record<string, string>;
  deadlines?: ClientDeadlines;
}
