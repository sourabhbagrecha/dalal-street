import type {
  Command,
  DispatchResult,
  GameEvent,
  GameState,
} from '@monopoly-deal/shared';
import { cloneState } from './board.js';
import { reject } from './handlers/common.js';
import { handlePayment } from './handlers/payments.js';
import { awaitsPayerAnswer, handleJsn, handleDeclineJsn } from './handlers/justSayNo.js';
import { handleDraw, handlePlay } from './handlers/play.js';
import {
  handleRentColor,
  handleRentPlayer,
  handleDebtCollectorPlayer,
  handleStealTarget,
  handleBuildingSet,
} from './handlers/targets.js';
import {
  maybeAutoEndTurn,
  handleRearrange,
  handleDiscardExcess,
  handleEndTurn,
  handleResumePlay,
} from './handlers/turn.js';
import {
  handleForceEndTurn,
  handleAutoResolvePending,
  handleConnectionChanged,
} from './handlers/serverCommands.js';

export function dispatch(state: GameState, command: Command): DispatchResult {
  if (state.winnerId && command.type !== 'END_TURN') {
    // Allow nothing except viewing — reject mutations
    if (command.type !== 'DRAW_TURN_CARDS') {
      // still reject most
    }
  }
  if (state.turnPhase === 'game_over') {
    return reject(state, 'Game is over');
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];

  try {
    let result: DispatchResult;
    switch (command.type) {
      case 'DRAW_TURN_CARDS':
        result = handleDraw(next, events, command.playerId);
        break;
      case 'PLAY_CARD':
        result = handlePlay(next, events, command.playerId, command.cardId, command.zone, command.target);
        break;
      case 'SELECT_PAYMENT': {
        if (awaitsPayerAnswer(next, command.playerId)) {
          const declined = handleDeclineJsn(next, events, command.playerId);
          if (declined.rejected) {
            result = declined;
            break;
          }
        }
        result = handlePayment(next, events, command.playerId, command.cardIds);
        break;
      }
      case 'RESPOND_JUST_SAY_NO':
        result = handleJsn(next, events, command.playerId, command.cardId);
        break;
      case 'DECLINE_JUST_SAY_NO':
        result = handleDeclineJsn(next, events, command.playerId);
        break;
      case 'REARRANGE_PROPERTY':
        result = handleRearrange(next, events, command.playerId, command.cardId, command.toColor, command.toSetId);
        break;
      case 'DISCARD_EXCESS':
        result = handleDiscardExcess(next, events, command.playerId, command.cardIds);
        break;
      case 'END_TURN':
        result = handleEndTurn(next, events, command.playerId);
        break;
      case 'RESUME_PLAY':
        result = handleResumePlay(next, events, command.playerId);
        break;
      case 'SELECT_RENT_COLOR':
        result = handleRentColor(next, events, command.playerId, command.color);
        break;
      case 'SELECT_RENT_PLAYER':
        result = handleRentPlayer(next, events, command.playerId, command.targetPlayerId);
        break;
      case 'SELECT_DEBT_COLLECTOR_PLAYER':
        result = handleDebtCollectorPlayer(next, events, command.playerId, command.targetPlayerId);
        break;
      case 'SELECT_STEAL_TARGET':
        result = handleStealTarget(next, events, command);
        break;
      case 'SELECT_BUILDING_SET':
        result = handleBuildingSet(next, events, command.playerId, command.setId);
        break;
      case 'FORCE_END_TURN':
        result = handleForceEndTurn(next, events, command.playerId);
        break;
      case 'AUTO_RESOLVE_PENDING':
        result = handleAutoResolvePending(next, events, command.playerId);
        break;
      case 'PLAYER_CONNECTION_CHANGED':
        result = handleConnectionChanged(next, events, command.playerId, command.connected);
        break;
      default:
        return reject(state, 'Unknown command');
    }
    if (!result.rejected) {
      maybeAutoEndTurn(result.state, result.events);
    }
    return result;
  } catch (e) {
    return reject(state, e instanceof Error ? e.message : String(e));
  }
}

export { actingPlayerForPending } from './handlers/serverCommands.js';

// Re-export for validators
export { beginRentCollection } from './handlers/payments.js';
export { offerJsn, resolveContestedAction } from './handlers/contested.js';
