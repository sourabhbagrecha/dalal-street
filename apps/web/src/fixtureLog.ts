import { fixtures, type FixtureName } from '@monopoly-deal/engine';
import type { GameEvent, GameState } from '@monopoly-deal/shared';
import { formatLog, type LogEntry } from './derivations';
import { theme } from './theme';

function playerLabel(state: GameState, playerId: string): string {
  const idx = state.players.findIndex((p) => p.id === playerId);
  return idx >= 0 ? theme.seatName(idx, false) : playerId;
}

function baseEvents(state: GameState, fixtureName: FixtureName): GameEvent[] {
  const events: GameEvent[] = [
    {
      type: 'game_started',
      message: `Scenario loaded: ${fixtureName}`,
    },
    {
      type: 'turn_ended',
      playerId: state.players[state.currentPlayerIndex]?.id,
      message: `Turn ${state.turnNumber} — ${playerLabel(state, state.players[state.currentPlayerIndex]?.id ?? '')} is active`,
    },
  ];

  const top = state.pendingStack[state.pendingStack.length - 1];
  if (top?.kind === 'payment') {
    events.push({
      type: 'rent_charged',
      playerId: top.payeeId,
      message: `${playerLabel(state, top.payerId)} owes ${theme.formatMoney(top.amountDue)} to ${playerLabel(state, top.payeeId)}`,
    });
  }
  if (top?.kind === 'just_say_no') {
    events.push({
      type: 'just_say_no',
      playerId: top.respondentId,
      message: `${playerLabel(state, top.initiatorId)} played an action — ${playerLabel(state, top.respondentId)} may respond`,
    });
  }
  if (top?.kind === 'hand_limit_discard') {
    events.push({
      type: 'hand_limit_discard',
      playerId: top.playerId,
      message: `${playerLabel(state, top.playerId)} must discard ${top.excess} card(s)`,
    });
  }

  for (const player of state.players) {
    for (const set of player.board.sets) {
      if (set.cards.length >= 2) {
        events.push({
          type: 'property_placed',
          playerId: player.id,
          message: `${playerLabel(state, player.id)} has ${set.cards.length} ${theme.propertyNames[set.color] ?? set.color} properties`,
        });
      }
    }
  }

  return events;
}

export function deriveFixtureLog(
  state: GameState,
  fixtureName: FixtureName,
): LogEntry[] {
  return formatLog(baseEvents(state, fixtureName));
}

export function loadFixture(name: FixtureName): GameState {
  return fixtures[name]();
}
