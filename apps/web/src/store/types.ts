import type { RemovalCost, WastedPlayReason } from '@monopoly-deal/engine';
import type { FixtureName } from '../fixtureNames';
import type {
  ChatMessage,
  ClientGameState,
  Command,
  GameEvent,
  PlayTarget,
  PlayZone,
  PropertySet,
  RoomView,
  WireCommandType,
} from '@monopoly-deal/shared';
import type { Card } from '@monopoly-deal/shared';

export interface LogEntry extends GameEvent {
  id: number;
  at: string;
}

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

/**
 * An ephemeral, viewer-relevant notice — something that happened *to* a
 * player (a theft, a broken set, a charge, a payment made or auto-paid)
 * rather than something they just did themselves interactively. Addressed
 * to `forPlayerId` rather than filtered at generation time: local
 * pass-and-play's single shared device means the "current viewer" at the
 * moment an event fires is almost always the *actor*, not the person the
 * notice is actually for, so the full queue is kept and the UI shows only
 * the entries addressed to whoever is currently being viewed.
 */
export interface Notice {
  id: number;
  forPlayerId: string;
  text: string;
  tone: NoticeTone;
}

export interface StoreSnapshot {
  clientState: ClientGameState | null;
  log: LogEntry[];
  chatMessages: ChatMessage[];
  rejected: string | null;
  /** Queue of ephemeral notices — see {@link Notice}. Optional so adapters
   * that predate this field (e.g. the dev-only demo adapter) still satisfy
   * the type without every call site needing a fallback. */
  notices?: Notice[];
  mode: 'local' | 'network';
  /** Local pass-and-play seat index. */
  localSeatIndex: number;
  /** Network lobby / room metadata. */
  room: RoomView | null;
  isHost: boolean;
  roomCode: string | null;
  playerToken: string | null;
  playerId: string | null;
  lobbyError: string | null;
  sseStatus: 'idle' | 'connecting' | 'connected' | 'error';
  /** Local pass-and-play only. See {@link TurnEndInfo}. */
  lastTurnEnd?: TurnEndInfo | null;
}

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

/**
 * Local pass-and-play only: which player's turn last ended and why, kept
 * outside the engine (which never distinguishes the two in its `turn_ended`
 * event message) so the hand-off curtain can show a useful context line —
 * "ended their turn" for an explicit END_TURN vs. "(N plays used)" when the
 * turn auto-ended because plays ran out.
 */
export interface TurnEndInfo {
  playerId: string;
  reason: 'plays' | 'manual';
}

export interface StealableOption {
  card: Card;
}

export interface GameStoreApi {
  getSnapshot(): StoreSnapshot;
  subscribe(listener: () => void): () => void;

  dispatchCommand(
    type: WireCommandType | string,
    payload?: Record<string, unknown>,
  ): Promise<CommandResult>;

  draw(): void;
  endTurn(): void;
  playCard(cardId: string, zone: PlayZone, target?: PlayTarget): void;
  send(command: Command): void;
  rejectLocal(message: string): void;
  clearRejected(): void;
  /** Removes one notice from the queue — dismiss timer expiry or a manual close tap. Optional for the same reason {@link StoreSnapshot.notices} is. */
  dismissNotice?(id: number): void;

  getLegalPlayZones(cardId: string): PlayZone[];
  canDraw(): boolean;
  canEndTurn(): boolean;
  pickPlayCommand(
    cardId: string,
    zone: PlayZone,
    target?: PlayTarget,
  ): { cardId: string; zone: PlayZone; target?: PlayTarget } | undefined;
  validatePayment(payerId: string, amountDue: number, cardIds: string[]): boolean;
  stealableProperties(playerId: string, selfOnly?: boolean): StealableOption[];
  isCompleteSet(set: PropertySet): boolean;
  /**
   * What the viewer would lose by pulling one of their own board cards out of
   * its set — used to decide whether a wildcard flip needs confirming. Null
   * when the card is not on the viewer's board.
   */
  removalCost(cardId: string): RemovalCost | null;
  /**
   * Why playing this hand card onto the discard pile would gain the viewer
   * nothing — a rent card for colours they own none of, a Deal Breaker with no
   * set to break. Null when the play could still do something. Drives the
   * "play it anyway?" confirmation; the rules knowledge itself lives in the
   * engine.
   */
  wastedDiscardPlay(cardId: string): WastedPlayReason | null;

  // Local-only
  setSeat?(index: number): void;
  startNewGame?(playerCount?: number, seed?: number): void;
  loadFixture?(name: FixtureName): void;

  // Network-only
  createRoom?(displayName: string): Promise<void>;
  joinRoom?(code: string, displayName: string): Promise<void>;
  startGame?(): Promise<void>;
  leaveRoom?(): Promise<void>;
  reconnect?(): void;
  sendChat?(text: string): Promise<CommandResult>;
  /** Clears a stale lobby error (e.g. "Room not found") once the player edits an input. */
  clearLobbyError?(): void;
}

export type { RemovalCost, WastedPlayReason };

export const SESSION_KEYS = {
  token: 'md_playerToken',
  roomCode: 'md_roomCode',
  playerId: 'md_playerId',
  isHost: 'md_isHost',
  displayName: 'md_displayName',
} as const;
