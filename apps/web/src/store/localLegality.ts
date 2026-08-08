import { getLegalCommands } from '@monopoly-deal/engine';
import type { Command, GameState, PlayTarget, PlayZone } from '@monopoly-deal/shared';
import { resolveWildPlayColor } from '../wildFaceStore';

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
  if (withoutTarget) return withoutTarget;
  if (zone === 'property') {
    const player = state.players.find((p) => p.id === playerId);
    const card = player?.hand.find((c) => c.id === cardId);
    if (card && card.kind === 'property_wild') {
      const color = resolveWildPlayColor(card, player!.board.sets);
      const preferred = cmds.find((c) => c.target?.assignedColor === color);
      if (preferred) return preferred;
    }
  }
  return cmds[0];
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
