import type { Card, GameEvent, GameState, PlayerState, PropertySet } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import { isCompleteSet, totalBankValue } from '@monopoly-deal/engine';
import { theme } from './theme';

export function playerBankTotal(player: PlayerState): number {
  return totalBankValue(player);
}

export function setProgress(set: PropertySet): string {
  return `${set.cards.length}/${SET_SIZES[set.color]}`;
}

export function cardTitle(card: Card): string {
  if (card.kind === 'money') return theme.formatMoney(card.amount);
  if (card.kind === 'property') return theme.propertyNames[card.color] ?? card.color;
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
  if (card.kind === 'money') return '#1b5e20';
  if (card.kind === 'action') {
    if (card.action === 'house') return '#2e7d32';
    if (card.action === 'hotel') return '#b71c1c';
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

export function turnLabel(state: GameState, playerId: string): string {
  const cur = state.players[state.currentPlayerIndex];
  if (state.winnerId) return state.winnerId === playerId ? 'WINNER' : 'DONE';
  if (cur?.id === playerId) return 'YOUR TURN';
  const next = state.players[(state.currentPlayerIndex + 1) % state.players.length];
  if (next?.id === playerId) return 'UP NEXT';
  return 'WAITING';
}

export type LogEntry = GameEvent & { at: string };

export function formatLog(events: GameEvent[]): LogEntry[] {
  return events.map((e, i) => ({
    ...e,
    at: `0:${String(i % 60).padStart(2, '0')}`,
  }));
}

export function completeSetCount(player: PlayerState): number {
  return player.board.sets.filter(isCompleteSet).length;
}
