import type { CSSProperties, ReactNode } from 'react';
import type { PropertyColor, RentCard } from '@monopoly-deal/shared';
import { INDIA_PROPERTY_THEME } from '../../../indiaPropertyTheme';
import { theme } from '../../../theme';
import { RENT_BADGE } from '../palettes';
import { PriceBadge } from '../parts/PriceBadge';
import { StatePill } from '../parts/StatePill';

/**
 * Rent cards, as a bill rather than a property card.
 *
 * One layout for both kinds (750×1050 reference like every other face): a
 * striped header wedge carrying the RENT wordmark and the "PAY UP" stamp, an
 * amount-due panel listing the sets the bill can be charged against, a flavour
 * line, and a footer strip naming those sets. Dual and wild rent differ only
 * in the three colours fed to the header/strip and in the panel's own text.
 */

/**
 * The one size rule on this face (PriceBadge has the same shape): a row's
 * state name prints at NAME_MAX and shrinks only as far as it must to keep
 * "FULL RENT" on the same line. NAME_BUDGET is the reference px the name is
 * left once the swatch, the gaps and the note have taken theirs; the weights
 * are Archivo 900's uppercase advance, with a space much narrower than a
 * letter — which is what stops "UTTAR PRADESH" over-shrinking. Both rows of a
 * card take the smaller of the two sizes so the pair reads as one table.
 */
const NAME_MAX = 54;
const NAME_MIN = 24;
const NAME_BUDGET = 268;
const LETTER_ADVANCE = 0.75;
const SPACE_ADVANCE = 0.28;

function nameSize(labels: string[]): number {
  const widest = Math.max(
    ...labels.map((label) =>
      [...label].reduce((w, ch) => w + (ch === ' ' ? SPACE_ADVANCE : LETTER_ADVANCE), 0),
    ),
  );
  return Math.max(NAME_MIN, Math.min(NAME_MAX, Math.floor(NAME_BUDGET / widest)));
}

function base(color: PropertyColor): string {
  return INDIA_PROPERTY_THEME[color].base;
}

function stateName(color: PropertyColor): string {
  return (theme.propertyNames[color] ?? color).toUpperCase();
}

interface RentRow {
  /** Swatch fill: the state's own base colour, or the rainbow on wild rent. */
  swatch: string;
  label: string;
}

interface RentInvoiceProps {
  card: RentCard;
  /** Header stripe colour, and the wedge/footer colour behind and below it. */
  band: string;
  wedge: string;
  strip: string;
  /** Right-hand label on the panel's "AMOUNT DUE" line. */
  pick: string;
  rows: RentRow[];
  /** Who settles — the red "NOW" beside it says when. */
  who: string;
  /** Footer strip content: state pills on a dual rent, a label on the wild. */
  footer: ReactNode;
  flavorA: string;
  flavorB: string;
}

function RentInvoice({
  card,
  band,
  wedge,
  strip,
  pick,
  rows,
  who,
  footer,
  flavorA,
  flavorB,
}: RentInvoiceProps) {
  return (
    <div
      className="playing-card__rf"
      style={{ '--rf-band': band, '--rf-wedge': wedge, '--rf-strip': strip } as CSSProperties}
    >
      <div className="playing-card__rf-hdr">
        <span className="playing-card__rf-hdr-band" aria-hidden />
        <span className="playing-card__rf-word">RENT</span>
      </div>

      <div className="playing-card__rf-stamp" aria-hidden>
        <span className="playing-card__rf-stamp-a">PAY</span>
        <span className="playing-card__rf-stamp-b">UP</span>
      </div>

      <div className="playing-card__rf-panel">
        <div className="playing-card__rf-head">
          <span className="playing-card__rf-head-l">AMOUNT DUE</span>
          <span className="playing-card__rf-head-r">{pick}</span>
        </div>
        <div className="playing-card__rf-dash" aria-hidden />
        <ul
          className="playing-card__rf-rows"
          style={{ '--rf-name-size': nameSize(rows.map((r) => r.label)) } as CSSProperties}
        >
          {rows.map((row) => (
            <li className="playing-card__rf-row" key={row.label}>
              <span className="playing-card__rf-swatch" style={{ background: row.swatch }} aria-hidden />
              <span className="playing-card__rf-name">{row.label}</span>
              <span className="playing-card__rf-note">FULL RENT</span>
            </li>
          ))}
        </ul>
        <div className="playing-card__rf-rule" aria-hidden />
        <div className="playing-card__rf-foot">
          <span className="playing-card__rf-foot-l">{who}</span>
          <span className="playing-card__rf-foot-r">NOW</span>
        </div>
      </div>

      <div className="playing-card__rf-bottom">
        <div className="playing-card__rf-flavor">
          {flavorA}
          <span className="playing-card__rf-flavor-b">{flavorB}</span>
        </div>
        <div className="playing-card__rf-strip">{footer}</div>
      </div>

      <PriceBadge value={card.value} palette={RENT_BADGE} />
    </div>
  );
}

function DualRentFace({ card, a, b }: { card: RentCard; a: PropertyColor; b: PropertyColor }) {
  return (
    <RentInvoice
      card={card}
      band={base(a)}
      wedge={base(b)}
      strip={base(b)}
      pick="PICK ONE"
      rows={[
        { swatch: base(a), label: stateName(a) },
        { swatch: base(b), label: stateName(b) },
      ]}
      who="EVERYONE PAYS"
      footer={
        <>
          <StatePill color={a} />
          <StatePill color={b} />
        </>
      }
      flavorA="NICE HOUSE."
      flavorB="SHAME ABOUT THE RENT."
    />
  );
}

function AnyRentFace({ card }: { card: RentCard }) {
  const rainbow = theme.rainbow('base');
  return (
    <RentInvoice
      card={card}
      band={rainbow}
      wedge="#2B1608"
      strip={rainbow}
      pick="ANY ONE SET"
      rows={[{ swatch: rainbow, label: 'ANY STATE' }]}
      who="ONE RIVAL PAYS"
      footer={<span className="playing-card__rf-strip-label">ANY STATE YOU OWN</span>}
      flavorA="PICK A SET. PICK A RIVAL."
      flavorB="THEY PAY THE FULL BILL."
    />
  );
}

export function RentFace({ card }: { card: RentCard }) {
  const [a, b] = card.colors;
  if (card.rentType === 'dual' && a && b) return <DualRentFace card={card} a={a} b={b} />;
  return <AnyRentFace card={card} />;
}
