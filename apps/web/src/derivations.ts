import type { Card, ClientGameState, ClientPlayerPublic, ClientPlayerSelf, PropertySet } from '@monopoly-deal/shared';
import { selfOf } from '@monopoly-deal/shared';
import { rentForSet } from '@monopoly-deal/engine';
import { theme } from './theme';

/** Rent this set charges now (engine rule, re-exported so components stay off the engine). */
export function setRent(set: PropertySet): number {
  return rentForSet(set);
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

function playerById(
  state: ClientGameState,
  playerId: string,
): ClientPlayerPublic | ClientPlayerSelf {
  if (playerId === state.viewerId) return selfOf(state);
  return state.players.find((p) => p.id === playerId) ?? selfOf(state);
}

function playerDisplayName(
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
