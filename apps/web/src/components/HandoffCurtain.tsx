import type { ClientGameState } from '@monopoly-deal/shared';
import { MAX_PLAYS } from '@monopoly-deal/shared';
import { seatIdentityName } from './localSeatName';
import type { TurnEndInfo } from '../store/types';

interface HandoffCurtainProps {
  clientState: ClientGameState;
  lastTurnEnd: TurnEndInfo | null | undefined;
  onTakeSeat: (seatIndex: number) => void;
}

/**
 * Local pass-and-play only: a full-screen, opaque overlay shown whenever the
 * seated device isn't the current player's seat. Physical keyboard shortcuts
 * (1–4) still work to switch seats — this is the touch-only path, and the
 * only thing that can dismiss it, so a hand can never be leaked by a stray
 * tap landing on the board underneath.
 */
export function HandoffCurtain({ clientState, lastTurnEnd, onTakeSeat }: HandoffCurtainProps) {
  const incomingId = clientState.currentPlayerId;
  const incomingIndex = clientState.players.findIndex((p) => p.id === incomingId);
  const incomingName = seatIdentityName(clientState, incomingIndex >= 0 ? incomingIndex : 0);

  let contextLine: string | null = null;
  if (lastTurnEnd) {
    const endedIndex = clientState.players.findIndex((p) => p.id === lastTurnEnd.playerId);
    const endedName = seatIdentityName(clientState, endedIndex >= 0 ? endedIndex : 0);
    contextLine =
      lastTurnEnd.reason === 'plays'
        ? `${endedName}'s turn ended (${MAX_PLAYS} plays used)`
        : `${endedName} ended their turn`;
  }

  return (
    <div
      className="handoff-curtain"
      role="alertdialog"
      aria-modal="true"
      aria-label={`Pass the phone to ${incomingName}`}
      data-testid="handoff-curtain"
    >
      <div className="handoff-curtain__content">
        <p className="handoff-curtain__headline">
          Pass the phone to <strong>{incomingName}</strong>
        </p>
        {contextLine && <p className="handoff-curtain__context">{contextLine}</p>}
        <button
          type="button"
          className="handoff-curtain__button"
          data-testid="handoff-curtain-button"
          onClick={() => onTakeSeat(incomingIndex >= 0 ? incomingIndex : 0)}
        >
          I&apos;m {incomingName} — show my hand
        </button>
      </div>
    </div>
  );
}
