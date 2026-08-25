import { theme } from '../../../theme';
import { MONEY_BADGE, MONEY_DECK_COUNTS, MONEY_FACE_BG, MONEY_WORDS } from '../palettes';
import { PriceBadge } from '../parts/PriceBadge';
import { RuleBox } from '../parts/RuleBox';

/**
 * Every money denomination's face — gold sunburst, frame, big ₹ value, the
 * "N in the deck" scarcity pill and the corner badge. Authored on the same
 * 750×1050 reference as the action faces (see `.playing-card__af` in
 * cards.css); only base colour and printed value differ per denomination.
 */
export function MoneyFace({ amount }: { amount: number }) {
  const count = MONEY_DECK_COUNTS[amount] ?? 1;
  const pillText = count === 1 ? 'ONLY ONE IN THE DECK' : `${count} IN THE DECK`;
  return (
    <div className="playing-card__af" style={{ background: MONEY_FACE_BG[amount] ?? '#2A0A4A' }}>
      <span className="playing-card__af-mt-sunburst" aria-hidden />
      <span className="playing-card__af-mt-frame" aria-hidden />
      <span className="playing-card__af-mt-diamond playing-card__af-mt-diamond--a" aria-hidden />
      <span className="playing-card__af-mt-diamond playing-card__af-mt-diamond--b" aria-hidden />
      <div className="playing-card__af-mt-center">
        <div className="playing-card__af-mt-value">
          {theme.currencySymbol}
          {amount}
        </div>
        <div className="playing-card__af-mt-label">{MONEY_WORDS[amount] ?? amount}&nbsp;CRORE</div>
        <RuleBox variant="mt">&#9733; {pillText} &#9733;</RuleBox>
      </div>
      <PriceBadge value={amount} palette={MONEY_BADGE} />
    </div>
  );
}
