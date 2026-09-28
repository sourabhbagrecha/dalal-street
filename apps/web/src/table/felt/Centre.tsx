import { CardBack, Cd } from '../kit';
import type { TableGame } from '../model';
import { CENTRE, PILE_W, deckRect } from './layout';
import { vars } from './style';

/** The draw pile in the felt's top-left corner (a tap draws), and the discard pile in the middle (a drop plays an action, or discards). */
export function Centre({ g, playHot, discarding }: { g: TableGame; playHot: boolean; discarding: boolean }) {
  const deck = deckRect(g.rivals.length);
  return (
    <>
      {/*
       * The draw at the start of your turn is automatic (useLiveGame's auto-draw effect fires it, no tap
       * needed — see happy-path.spec.ts) and lands within a render or two, so a "TAP TO DRAW" label would
       * promise an interaction that never actually waits for a tap. `data-ready` still marks the moment for
       * anything (styling, tests) that wants to know the deck is mid-draw.
       */}
      <div className="tb-deckbay" style={vars({ left: deck.x, top: deck.y, width: deck.w, height: deck.h })}>
        <button type="button" className="tb-deck" data-testid="draw-pile" data-fly="deck" data-ready={g.phase === 'draw'} onClick={g.actions.draw} aria-label={`Draw pile, ${g.deck} cards`}>
          <CardBack w={deck.w} />
          <i>{g.deck}</i>
          {g.phase === 'draw' && <em>DRAWING 2…</em>}
        </button>
      </div>
      <DiscardPile g={g} playHot={playHot} discarding={discarding} />
    </>
  );
}

function DiscardPile({ g, playHot, discarding }: { g: TableGame; playHot: boolean; discarding: boolean }) {
  return (
    <div className="tb-centre" style={vars({ left: CENTRE.x, top: CENTRE.y, width: CENTRE.w, height: CENTRE.h, '--pile-w': `${PILE_W}px` })}>
      <div className="tb-pile">
        <span className="tb-discard" data-testid="discard-drop" aria-label="Discard pile" data-zone="play" data-hot={playHot} data-discarding={discarding ? true : undefined} data-fly="discard" data-cid={g.discardTop?.id}>
          {g.discardTop && <Cd card={g.discardTop} w={PILE_W} />}
        </span>
        <em className="tb-pile__lab">DISCARD</em>
      </div>
    </div>
  );
}
