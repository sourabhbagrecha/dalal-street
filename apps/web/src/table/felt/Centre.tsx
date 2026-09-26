import { CardBack, Cd } from '../kit';
import type { TableGame } from '../model';
import { CENTRE, PILE_W } from './layout';
import { vars } from './style';

/** The middle of the felt: the draw pile (a tap draws) and the discard pile (a drop plays an action, or discards). */
export function Centre({ g, playHot, discarding }: { g: TableGame; playHot: boolean; discarding: boolean }) {
  return (
    <div className="tb-centre" style={vars({ left: CENTRE.x, top: CENTRE.y, width: CENTRE.w, height: CENTRE.h, '--pile-w': `${PILE_W}px` })}>
      <button type="button" className="tb-deck" data-testid="draw-pile" data-fly="deck" data-ready={g.phase === 'draw'} onClick={g.actions.draw} aria-label={`Draw pile, ${g.deck} cards`}>
        <CardBack w={PILE_W} />
        <i>{g.deck}</i>
        {g.phase === 'draw' && <em>TAP TO DRAW 2</em>}
      </button>
      <div className="tb-pile">
        <span className="tb-discard" data-testid="discard-drop" aria-label="Discard pile" data-zone="play" data-hot={playHot} data-discarding={discarding ? true : undefined} data-fly="discard" data-cid={g.discardTop?.id}>
          {g.discardTop && <Cd card={g.discardTop} w={PILE_W} />}
        </span>
        <em className="tb-pile__lab">DISCARD</em>
      </div>
    </div>
  );
}
