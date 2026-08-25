import { HAND_LIMIT, MAX_PLAYS, WIN_SETS } from '@monopoly-deal/shared';
import { RuleBox } from '../parts/RuleBox';

/**
 * The Quick Start Rules card. Four of these ship in the 110-card deck and all
 * four are pulled out during setup (the engine parks them in `outOfPlay`), so
 * this face never appears in a hand, a bank or a set — only in the deck
 * reference on /rules, where a blank card would read as a bug.
 *
 * Authored on the same 750×1050 reference as every other face (see
 * `.playing-card__af` in cards.css) and deliberately the only cream-field
 * face in the deck: it is a leaflet, not a card you can play.
 */
export function QuickStartFace() {
  return (
    <div className="playing-card__af playing-card__af-qs">
      <div className="playing-card__af-qs-hdr">
        <div className="playing-card__af-qs-eyebrow">MONOPOLY DEAL</div>
        <div className="playing-card__af-qs-title">
          QUICK START
          <br />
          RULES
        </div>
      </div>
      <ol className="playing-card__af-qs-list">
        <li>DEAL 5 CARDS TO EACH PLAYER.</li>
        <li>DRAW 2 AT THE START OF YOUR TURN.</li>
        <li>PLAY UP TO {MAX_PLAYS} CARDS, THEN KEEP {HAND_LIMIT}.</li>
        <li>FIRST TO {WIN_SETS} FULL SETS WINS.</li>
      </ol>
      <RuleBox variant="qs">NOT A PLAYING CARD &mdash; ALL 4 ARE SET ASIDE BEFORE THE DEAL.</RuleBox>
    </div>
  );
}
