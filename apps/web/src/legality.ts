import { getLegalCommands } from '@monopoly-deal/engine';
import type { Command, GameState, PlayTarget, PlayZone } from '@monopoly-deal/shared';

const CARD_MIME = 'application/x-monopoly-card';

export { CARD_MIME };

/** Prefer custom MIME; fall back to text/plain for broader browser DnD support. */
export function readDraggedCardId(dataTransfer: DataTransfer): string {
  return dataTransfer.getData(CARD_MIME) || dataTransfer.getData('text/plain');
}

export function legalPlayCommands(
  state: GameState,
  playerId: string,
  cardId: string,
): Extract<Command, { type: 'PLAY_CARD' }>[] {
  return getLegalCommands(state).filter(
    (cmd): cmd is Extract<Command, { type: 'PLAY_CARD' }> =>
      cmd.type === 'PLAY_CARD' && cmd.playerId === playerId && cmd.cardId === cardId,
  );
}

export function legalPlayZones(state: GameState, playerId: string, cardId: string): PlayZone[] {
  const zones = new Set<PlayZone>();
  for (const cmd of legalPlayCommands(state, playerId, cardId)) {
    zones.add(cmd.zone);
  }
  return [...zones];
}

export function pickPlayCommand(
  state: GameState,
  playerId: string,
  cardId: string,
  zone: PlayZone,
  target?: PlayTarget,
): Extract<Command, { type: 'PLAY_CARD' }> | undefined {
  const cmds = legalPlayCommands(state, playerId, cardId).filter((c) => c.zone === zone);
  if (cmds.length === 0) return undefined;
  if (target) {
    return cmds.find((c) => JSON.stringify(c.target ?? {}) === JSON.stringify(target));
  }
  const withoutTarget = cmds.find((c) => !c.target);
  return withoutTarget ?? cmds[0];
}

export function canDraw(state: GameState, playerId: string): boolean {
  return getLegalCommands(state).some(
    (cmd) => cmd.type === 'DRAW_TURN_CARDS' && cmd.playerId === playerId,
  );
}

export function canEndTurn(state: GameState, playerId: string): boolean {
  return getLegalCommands(state).some(
    (cmd) => cmd.type === 'END_TURN' && cmd.playerId === playerId,
  );
}

export function isDiscardExcessMode(state: GameState, playerId: string): boolean {
  const top = state.pendingStack[state.pendingStack.length - 1];
  return top?.kind === 'hand_limit_discard' && top.playerId === playerId;
}
