import type { ClientGameState, ClientPlayerPublic } from '@monopoly-deal/shared';
import { GameCenter } from './GameCenter';
import { OpponentRail } from './OpponentRail';
import { OpponentSpotlight } from './OpponentSpotlight';

interface BoardTopRegionProps {
  clientState: ClientGameState;
  showConnection?: boolean;
  discardHighlight: boolean;
  discardDim?: boolean;
  discardShake?: boolean;
  onDiscardCard?: (cardId: string) => void;
}

/**
 * The opponent currently acting, whenever that's someone other than the
 * viewer and the game hasn't ended — i.e. whenever BoardTopRegion spotlights
 * instead of showing the rail + table centre. Exported so composers can add
 * `.game-board--spotlight` to the same element on the same condition; CSS
 * needs that class because it can't otherwise safely span rows 1+2 (see the
 * comment on `.game-board--spotlight` in styles.css).
 */
export function spotlitOpponent(clientState: ClientGameState): ClientPlayerPublic | undefined {
  if (clientState.winnerId) return undefined;
  if (clientState.currentPlayerId === clientState.viewerId) return undefined;
  return clientState.players.find((p) => p.id === clientState.currentPlayerId);
}

/**
 * Rows 1+2 of the board: the opponent rail + table centre on the viewer's own
 * turn, or — while the game is still in progress and it's someone else's
 * turn — an expanded spotlight of whoever's acting. Applies at every
 * viewport; only the CSS spotlight sizing differs between phone and desktop.
 * GameCenter owns the auto-draw effect and the END TURN button, so this only
 * ever applies to someone else's turn; extending it to the viewer's own turn
 * would need that behavior moved too.
 */
export function BoardTopRegion({
  clientState,
  showConnection,
  discardHighlight,
  discardDim,
  discardShake,
  onDiscardCard,
}: BoardTopRegionProps) {
  const activeOpponent = spotlitOpponent(clientState);

  if (activeOpponent) {
    return (
      <OpponentSpotlight
        clientState={clientState}
        activeOpponent={activeOpponent}
        showConnection={showConnection}
      />
    );
  }

  return (
    <>
      <OpponentRail clientState={clientState} showConnection={showConnection} />
      <GameCenter
        clientState={clientState}
        discardHighlight={discardHighlight}
        discardDim={discardDim}
        discardShake={discardShake}
        onDiscardCard={onDiscardCard}
      />
    </>
  );
}
