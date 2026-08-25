import type {
  Card,
  ClientGameState,
  ClientPlayerPublic,
  ClientPlayerSelf,
  PlayerBoard,
  PlayerState,
  PropertySet,
} from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { isCompleteSet, totalBankValue } from '@monopoly-deal/engine';
import { theme } from './theme';

export function playerBankTotalFromBoard(board: PlayerBoard): number {
  let total = 0;
  for (const c of board.bank) total += c.value;
  return total;
}

export function playerBankTotal(player: PlayerState | ClientPlayerPublic): number {
  if ('hand' in player && Array.isArray((player as PlayerState).hand)) {
    return totalBankValue(player as PlayerState);
  }
  return playerBankTotalFromBoard(player.board);
}

export function setProgress(set: PropertySet): string {
  return `${set.cards.length}/${SET_SIZES[set.color]}`;
}

export function isSetCompleteBySize(set: PropertySet): boolean {
  return set.cards.length >= SET_SIZES[set.color];
}

export function cardTitle(card: Card): string {
  if (card.kind === 'money') return theme.formatMoney(card.amount);
  if (card.kind === 'property') return card.name;
  if (card.kind === 'property_wild') {
    if (card.colors.length === 0) return 'Property Wild';
    return card.colors.map((c) => theme.propertyNames[c] ?? c).join(' / ');
  }
  if (card.kind === 'action') return theme.actionNames[card.action] ?? card.action;
  if (card.kind === 'rent') {
    if (card.rentType === 'wild') return 'Wild Rent';
    return `Rent ${card.colors.map((c) => theme.propertyNames[c] ?? c).join('/')}`;
  }
  if (card.kind === 'rule') return 'Quick Start Rules';
  return 'Card';
}

export function opponentsOfClient(state: ClientGameState): ClientPlayerPublic[] {
  return state.players.filter((p) => p.id !== state.viewerId);
}

export function playerById(
  state: ClientGameState,
  playerId: string,
): ClientPlayerPublic | ClientPlayerSelf {
  if (playerId === state.viewerId) return state.you;
  return state.players.find((p) => p.id === playerId) ?? state.you;
}

export function allPlayers(state: ClientGameState): Array<ClientPlayerPublic | ClientPlayerSelf> {
  return state.players.map((p) => (p.id === state.viewerId ? state.you : p));
}

export function playerDisplayName(
  state: ClientGameState,
  player: ClientPlayerPublic,
  index: number,
): string {
  if (player.displayName) return player.displayName;
  return theme.seatName(index, player.id === state.viewerId);
}

export function nameFor(state: ClientGameState, playerId: string): string {
  const player = playerById(state, playerId);
  const index = state.players.findIndex((p) => p.id === playerId);
  return playerDisplayName(state, player, index >= 0 ? index : 0);
}

export function humanizePlayerIds(state: ClientGameState, message: string): string {
  let out = message;
  for (const id of state.players.map((p) => p.id)) {
    if (!out.includes(id)) continue;
    out = out.split(id).join(nameFor(state, id));
  }
  return out;
}

export function turnLabelClient(state: ClientGameState, playerId: string): string {
  if (state.winnerId) return state.winnerId === playerId ? 'WINNER' : 'DONE';
  if (state.currentPlayerId === playerId) return 'YOUR TURN';
  const ids = [state.you.id, ...state.players.map((p) => p.id)];
  const curIdx = ids.indexOf(state.currentPlayerId);
  const nextId = ids[(curIdx + 1) % ids.length];
  if (nextId === playerId) return 'UP NEXT';
  return 'WAITING';
}

export function completeSetCount(
  player: { board: { sets: PropertySet[] } },
  isComplete: (set: PropertySet) => boolean = isCompleteSet,
): number {
  return player.board.sets.filter(isComplete).length;
}
