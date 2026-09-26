import {
  dispatch,
  isCompleteSet,
  isValidPaymentSelection,
  project,
  removalCost,
  wastedDiscardPlay,
} from '@monopoly-deal/engine';
import type { ActionType, Card, ClientGameState, Command, GameState, PlayZone } from '@monopoly-deal/shared';
import type { PlayDeps } from './plays';
import type { PromptDeps } from './prompts';

/** Test helpers: real engine states, projected per viewer, with store-shaped deps. Not shipped code. */

/** Dispatch a command that must be accepted. */
export function step(state: GameState, command: Command): GameState {
  const result = dispatch(state, command);
  if (result.rejected) throw new Error(`dispatch rejected ${command.type}: ${result.rejected}`);
  return result.state;
}

export const view = (state: GameState, viewerId: string): ClientGameState => project(state, viewerId);

export const actionCard = (id: string, action: ActionType, value = 3): Card => ({ id, kind: 'action', action, value });

/** A fixture state with extra cards dealt into one player's hand. */
export function withHand(state: GameState, playerId: string, cards: Card[]): GameState {
  const next = structuredClone(state);
  next.players.find((p) => p.id === playerId)!.hand.push(...cards);
  return next;
}

export function promptDeps(state: GameState): PromptDeps {
  return {
    isCompleteSet,
    validatePayment: (payerId, amountDue, cardIds) => isValidPaymentSelection(state, payerId, amountDue, cardIds),
  };
}

/** Store-adapter-shaped play deps over a projection (the same zone rule the adapters use). */
export function playDeps(client: ClientGameState): PlayDeps {
  return {
    getLegalPlayZones: (): PlayZone[] => {
      if (client.currentPlayerId !== client.viewerId) return [];
      const top = client.pendingStack[client.pendingStack.length - 1];
      if (top?.kind === 'hand_limit_discard' && top.playerId === client.viewerId) return ['discard'];
      if (client.turnPhase === 'awaiting_draw') return [];
      return ['bank', 'property', 'discard'];
    },
    pickPlayCommand: (cardId, zone, target) => ({ cardId, zone, target }),
    wastedDiscardPlay: (cardId) => wastedDiscardPlay(client, cardId),
    isCompleteSet,
    removalCost: (cardId) => removalCost(client.you.board, cardId),
  };
}
