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

export interface StoreSnapshot {
  clientState: ClientGameState | null;
  log: LogEntry[];
  chatMessages: ChatMessage[];
  rejected: string | null;
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
  /**
   * Room code whose stored seat turned out to be gone (room GC'd, or the seat
   * left) — the room page shows the join form with an explanation instead of
   * looping on reconnect.
   */
  staleRoomCode: string | null;
}

export interface CommandResult {
  ok: boolean;
  reason?: string;
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
  /**
   * Attach to `code` using the seat stored for it, if any. Resolves once the
   * session has been restored (SSE opening) or found missing — the caller
   * decides what to render from the snapshot.
   */
  reconnect?(code: string): Promise<void>;
  sendChat?(text: string): Promise<CommandResult>;
}

export type { RemovalCost, WastedPlayReason };
