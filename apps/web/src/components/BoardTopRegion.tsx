import type { ClientGameState } from '@monopoly-deal/shared';
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
 * Rows 1+2 of the board at every viewport: the table — every seat on the far
 * rim, one of them on stage (see OpponentSpotlight). The viewer's own stage is
 * the table centre (GameCenter: draw pile, END TURN, discard pile); an
 * opponent's is their board.
 */
export function BoardTopRegion(props: BoardTopRegionProps) {
  return <OpponentSpotlight {...props} />;
}
