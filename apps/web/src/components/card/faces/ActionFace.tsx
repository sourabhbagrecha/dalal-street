import type { ReactNode } from 'react';
import type { ActionType } from '@monopoly-deal/shared';
import { HOUSE_RENT_BONUS, HOTEL_RENT_BONUS } from '@monopoly-deal/shared';
import { theme } from '../../../theme';
import { ACTION_BADGE, ACTION_BG } from '../palettes';
import { JsnShield } from '../parts/JsnShield';
import { PriceBadge } from '../parts/PriceBadge';
import { StripeHeader } from '../parts/StripeHeader';

/**
 * The ten action-card faces — the India redesign traced from the approved
 * reference (750×1050 canvas). Every face is authored at that exact
 * reference and scaled with `calc(Npx * var(--card-scale))` (see
 * `.playing-card__af` in cards.css), so every px there is a literal
 * transcription of the reference's own px values.
 */

/** `₹N` — for amounts quoted inside a face's own artwork. */
function sym(n: number): string {
  return `${theme.currencySymbol}${n}`;
}

/** Pass Go's twin "fast forward" glyphs — the second rendered at reduced
 *  opacity, exactly as the reference doubles it. */
function ForwardIcon({ faded }: { faded?: boolean }) {
  return (
    <svg
      className="playing-card__af-pg-icon"
      style={faded ? { opacity: 0.65 } : undefined}
      viewBox="0 0 40 40"
      aria-hidden
    >
      <polygon points="4,6 26,20 4,34" fill="#FFF3DC" />
      <rect x="28" y="6" width="8" height="28" fill="#FFF3DC" />
    </svg>
  );
}

function PassGoContent() {
  return (
    <>
      <div className="playing-card__af-pg-title">
        PASS
        <br />
        GO
      </div>
      <div className="playing-card__af-pg-icons">
        <ForwardIcon />
        <ForwardIcon faded />
      </div>
      <div className="playing-card__af-pg-cards">
        <div className="playing-card__af-pg-card playing-card__af-pg-card--a">+1</div>
        <div className="playing-card__af-pg-card playing-card__af-pg-card--b">+2</div>
      </div>
    </>
  );
}

function SlyDealContent() {
  return (
    <>
      <StripeHeader variant="red" />
      <div className="playing-card__af-sd-title">
        SLY
        <br />
        <span className="playing-card__af-title-accent">DEAL</span>
      </div>
      <div className="playing-card__af-sd-scene">
        <span className="playing-card__af-sd-rope" aria-hidden />
        <svg className="playing-card__af-sd-hook" viewBox="0 0 38 40" aria-hidden>
          <path d="M19 0 V22 A9 9 0 0 1 4 28" stroke="#8A9BA8" strokeWidth="7" fill="none" strokeLinecap="round" />
          <polygon points="0,24 10,32 2,36" fill="#8A9BA8" />
        </svg>
        <div className="playing-card__af-sd-card" />
      </div>
    </>
  );
}

function ForcedDealContent() {
  return (
    <>
      <StripeHeader variant="red" />
      <div className="playing-card__af-fd-title">
        FORCED
        <br />
        <span className="playing-card__af-title-accent">DEAL</span>
      </div>
      <div className="playing-card__af-fd-scene">
        <div className="playing-card__af-fd-card playing-card__af-fd-card--a" />
        <div className="playing-card__af-fd-card playing-card__af-fd-card--b" />
        <svg className="playing-card__af-fd-arrows" viewBox="0 0 52 30" aria-hidden>
          <polygon points="2,10 34,10 34,3 50,13 34,23 34,16 2,16" fill="#FFCE3F" stroke="#2B1608" strokeWidth="1.6" />
          <polygon
            points="50,20 18,20 18,13 2,23 18,33 18,26 50,26"
            fill="#FFF3DC"
            stroke="#2B1608"
            strokeWidth="1.6"
            transform="translate(0,-4)"
          />
        </svg>
      </div>
    </>
  );
}

function DebtCollectorContent() {
  return (
    <>
      <StripeHeader variant="red" />
      <div className="playing-card__af-dc-title">
        DEBT
        <br />
        <span className="playing-card__af-title-accent">COLLECTOR</span>
      </div>
      <div className="playing-card__af-dc-scene">
        <div className="playing-card__af-dc-chains">
          <span className="playing-card__af-dc-link" />
          <span className="playing-card__af-dc-link" />
          <span className="playing-card__af-dc-link" />
        </div>
        <div className="playing-card__af-dc-tag">
          <span className="playing-card__af-dc-tag-hole" aria-hidden />
          <span className="playing-card__af-dc-tag-value">{sym(5)}</span>
          <span className="playing-card__af-dc-tag-label">DUES &middot; PAY NOW</span>
        </div>
      </div>
    </>
  );
}

function BirthdayContent() {
  return (
    <>
      <span className="playing-card__af-bd-dots" aria-hidden />
      <span className="playing-card__af-bd-bunting" aria-hidden />
      <div className="playing-card__af-bd-title">
        IT&apos;S MY
        <br />
        BIRTHDAY!
      </div>
      <div className="playing-card__af-bd-balloons">
        <div className="playing-card__af-bd-balloon">
          <span className="playing-card__af-bd-balloon-value">{sym(2)}</span>
        </div>
        <svg className="playing-card__af-bd-hat" viewBox="0 0 30 26" aria-hidden>
          <polygon points="15,0 28,24 2,24" fill="#E8368F" stroke="#2B1608" strokeWidth="1.6" />
          <circle cx="15" cy="2" r="3.4" fill="#FFCE3F" />
        </svg>
      </div>
    </>
  );
}

function DealBreakerContent() {
  return (
    <>
      <span className="playing-card__af-db-rings" aria-hidden />
      <div className="playing-card__af-db-magnet">
        <span className="playing-card__af-db-pole playing-card__af-db-pole--l" />
        <span className="playing-card__af-db-pole playing-card__af-db-pole--r" />
        <span className="playing-card__af-db-spark playing-card__af-db-spark--1" />
        <span className="playing-card__af-db-spark playing-card__af-db-spark--2" />
        <span className="playing-card__af-db-spark playing-card__af-db-spark--3" />
      </div>
      <div className="playing-card__af-db-titlewrap">
        <div className="playing-card__af-db-title">
          DEAL
          <br />
          BREAKER
        </div>
        <div className="playing-card__af-db-pill">THE NUCLEAR OPTION</div>
      </div>
    </>
  );
}

function DoubleTheRentContent() {
  return (
    <>
      <div className="playing-card__af-dr-placard">
        <div className="playing-card__af-dr-placard-title">RENT</div>
      </div>
      <div className="playing-card__af-dr-dial">
        <span className="playing-card__af-dr-dial-disc" aria-hidden />
        <span className="playing-card__af-dr-dial-ring" aria-hidden />
        <div className="playing-card__af-dr-dial-center">
          <span className="playing-card__af-dr-dial-value">&times;2</span>
          <span className="playing-card__af-dr-dial-label">DOUBLE THE RENT</span>
        </div>
      </div>
    </>
  );
}

function HouseContent() {
  return (
    <>
      <StripeHeader variant="orange" />
      <div className="playing-card__af-ho-title">HOUSE</div>
      <div className="playing-card__af-ho-subtitle">UNDER CONSTRUCTION</div>
      <svg className="playing-card__af-ho-svg" viewBox="0 0 40 36" aria-hidden>
        <polygon points="20,1 39,15 1,15" fill="#D97706" stroke="#2B1608" strokeWidth="1.6" />
        <rect x="7" y="16" width="26" height="19" fill="#FFCE3F" stroke="#2B1608" strokeWidth="1.6" />
        <rect x="16" y="23" width="8" height="12" fill="#2B1608" />
        <rect x="10" y="19" width="5" height="5" fill="#2B1608" />
        <rect x="25" y="19" width="5" height="5" fill="#2B1608" />
      </svg>
      <div className="playing-card__af-ho-tag">+{sym(HOUSE_RENT_BONUS)}</div>
    </>
  );
}

/**
 * Not in the reference — derived from House, House's sibling: same layout
 * family (stripe header, badge, SVG building, tag, two-line rule box), a
 * distinct #B0004E accent instead of House's #D97706, and a taller building
 * (two more window rows) so it silently reads as "House, but bigger".
 */
function HotelContent() {
  return (
    <>
      <StripeHeader variant="pink" />
      <div className="playing-card__af-ht-title">HOTEL</div>
      <div className="playing-card__af-ht-subtitle">FULL SERVICE</div>
      <svg className="playing-card__af-ht-svg" viewBox="0 0 40 50" aria-hidden>
        <polygon points="20,1 39,15 1,15" fill="#B0004E" stroke="#2B1608" strokeWidth="1.6" />
        <rect x="7" y="16" width="26" height="33" fill="#F7B8D0" stroke="#2B1608" strokeWidth="1.6" />
        <rect x="16" y="37" width="8" height="12" fill="#2B1608" />
        <rect x="10" y="20" width="5" height="4" fill="#2B1608" />
        <rect x="25" y="20" width="5" height="4" fill="#2B1608" />
        <rect x="10" y="27" width="5" height="4" fill="#2B1608" />
        <rect x="25" y="27" width="5" height="4" fill="#2B1608" />
        <rect x="10" y="34" width="5" height="4" fill="#2B1608" />
        <rect x="25" y="34" width="5" height="4" fill="#2B1608" />
      </svg>
      <div className="playing-card__af-ht-tag">+{sym(HOTEL_RENT_BONUS)}</div>
    </>
  );
}

function JustSayNoContent() {
  return (
    <>
      <div className="playing-card__af-jsn-title">
        JUST
        <br />
        SAY NO
      </div>
      <div className="playing-card__af-jsn-shield">
        <JsnShield className="playing-card__af-jsn-shield-svg" />
        <span className="playing-card__af-jsn-no">NO!</span>
      </div>
    </>
  );
}

/** Face content per action, keyed the same as `ActionType`. */
const ACTION_CONTENT: Record<ActionType, () => ReactNode> = {
  pass_go: PassGoContent,
  sly_deal: SlyDealContent,
  forced_deal: ForcedDealContent,
  debt_collector: DebtCollectorContent,
  its_my_birthday: BirthdayContent,
  deal_breaker: DealBreakerContent,
  double_the_rent: DoubleTheRentContent,
  house: HouseContent,
  hotel: HotelContent,
  just_say_no: JustSayNoContent,
};

export function ActionFace({ action, value }: { action: ActionType; value: number }) {
  const Content = ACTION_CONTENT[action];
  return (
    <div className="playing-card__af" style={{ background: ACTION_BG[action] }}>
      <Content />
      <PriceBadge value={value} palette={ACTION_BADGE[action]} />
    </div>
  );
}
