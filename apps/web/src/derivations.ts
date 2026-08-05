import type {
  Card,
  ClientGameState,
  ClientPlayerPublic,
  ClientPlayerSelf,
  GameEvent,
  GameState,
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
  return 'Card';
}

export function cardAccent(card: Card): string {
  if (card.kind === 'property') return theme.propertyColors[card.color] ?? '#888';
  if (card.kind === 'property_wild') {
    if (card.assignedColor) return theme.propertyColors[card.assignedColor] ?? '#888';
    if (card.colors[0]) return theme.propertyColors[card.colors[0]] ?? '#888';
    return 'linear-gradient(135deg,#c94e8b,#1a3a6e)';
  }
  if (card.kind === 'rent' && card.colors[0]) return theme.propertyColors[card.colors[0]] ?? '#444';
  if (card.kind === 'money') return theme.moneyColors[card.amount] ?? '#F2C14E';
  if (card.kind === 'action') {
    if (card.action === 'house') return '#2e7d32';
    if (card.action === 'hotel') return '#b71c1c';
    if (card.action === 'pass_go') return '#C4552F';
    if (card.action === 'sly_deal') return '#7A5AA8';
    if (card.action === 'forced_deal') return '#C4552F';
    if (card.action === 'deal_breaker') return '#8E2C22';
    if (card.action === 'debt_collector') return '#1F72C4';
    if (card.action === 'its_my_birthday') return '#E91E8C';
    if (card.action === 'just_say_no') return '#C62828';
    if (card.action === 'double_the_rent') return '#EF6C00';
    return '#1565c0';
  }
  return '#555';
}

export function opponentsOf(state: GameState, seatId: string): PlayerState[] {
  const idx = state.players.findIndex((p) => p.id === seatId);
  if (idx < 0) return state.players;
  const out: PlayerState[] = [];
  for (let i = 1; i < state.players.length; i++) {
    out.push(state.players[(idx + i) % state.players.length]!);
  }
  return out;
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

export function turnLabel(state: GameState, playerId: string): string {
  const cur = state.players[state.currentPlayerIndex];
  if (state.winnerId) return state.winnerId === playerId ? 'WINNER' : 'DONE';
  if (cur?.id === playerId) return 'YOUR TURN';
  const next = state.players[(state.currentPlayerIndex + 1) % state.players.length];
  if (next?.id === playerId) return 'UP NEXT';
  return 'WAITING';
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

export type LogEntry = GameEvent & { at: string };

export function formatLog(events: GameEvent[]): LogEntry[] {
  return events.map((e, i) => ({
    ...e,
    at: `0:${String(i % 60).padStart(2, '0')}`,
  }));
}

export function completeSetCount(
  player: { board: { sets: PropertySet[] } },
  isComplete: (set: PropertySet) => boolean = isCompleteSet,
): number {
  return player.board.sets.filter(isComplete).length;
}
