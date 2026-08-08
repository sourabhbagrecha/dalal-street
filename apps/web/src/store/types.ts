import type { RemovalCost } from '@monopoly-deal/engine';
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
}

export type { RemovalCost };

export const SESSION_KEYS = {
  token: 'md_playerToken',
  roomCode: 'md_roomCode',
  playerId: 'md_playerId',
  isHost: 'md_isHost',
  displayName: 'md_displayName',
} as const;
