import { theme } from '../../../theme';
import { ANY_BADGE, JOKER_FACE_BG } from '../palettes';
import { PriceBadge } from '../parts/PriceBadge';
import { RuleBox } from '../parts/RuleBox';

/** The crown glyph on the Joker's centre medallion — three colour shards, a
 *  gold band, and gold "jewels", traced from the reference verbatim. */
function CrownGlyph() {
  return (
    <svg className="playing-card__af-jk-crown" viewBox="0 0 80 60" aria-hidden>
      <polygon points="10,34 24,6 30,30" fill="#E8368F" />
      <polygon points="30,30 40,2 50,30" fill="#0E9F5A" />
      <polygon points="50,30 56,6 70,34" fill="#00B4D8" />
      <circle cx="10" cy="34" r="6" fill="#FFCE3F" />
      <circle cx="40" cy="2" r="6" fill="#FFCE3F" />
      <circle cx="70" cy="34" r="6" fill="#FFCE3F" />
      <rect x="10" y="36" width="60" height="12" rx="6" fill="#FFCE3F" />
      <rect x="18" y="50" width="44" height="8" rx="4" fill="#FFFDF5" />
    </svg>
  );
}

/**
 * The multicolour ("any") property wildcard's face: a rainbow field, the
 * crowned Joker medallion, a "worth nothing" tag and a struck-through ₹0
 * corner badge.
 */
export function JokerFace() {
  return (
    <div className="playing-card__af" style={{ background: JOKER_FACE_BG }}>
      <span className="playing-card__af-jk-bg" aria-hidden />
      <div className="playing-card__af-jk-medallion">
        <CrownGlyph />
        <div className="playing-card__af-jk-title">JOKER</div>
        <div className="playing-card__af-jk-sub">JOINS ANY SET</div>
      </div>
      <div className="playing-card__af-jk-worth">
        WORTH
        <br />
        <span className="playing-card__af-jk-worth-strike">{theme.currencySymbol} CASH</span>
        <br />
        NOTHING
      </div>
      <div className="playing-card__af-jk-rulewrap">
        <RuleBox variant="jk">STANDS IN FOR ANY PROPERTY &mdash; BUT CANNOT BE BANKED OR PAID AS MONEY.</RuleBox>
      </div>
      <PriceBadge value={0} palette={ANY_BADGE} strike />
    </div>
  );
}
