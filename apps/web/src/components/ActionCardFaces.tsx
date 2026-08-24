import type { ReactNode } from 'react';
import type { ActionType } from '@monopoly-deal/shared';
import { HOUSE_RENT_BONUS, HOTEL_RENT_BONUS } from '@monopoly-deal/shared';
import { theme } from '../theme';

/**
 * Action, money, and Joker (multicolor property wildcard) card faces —
 * the India redesign traced from the approved reference (750×1050 canvas,
 * 10px #2B1608 border, 36px radius; see the design doc handed off alongside
 * this file). Every face is authored at that exact reference and scaled with
 * `calc(Npx * var(--card-scale))`, the same discipline the property card
 * face uses (see `.playing-card--property` in styles.css) — `--card-scale`
 * here resolves against `--card-ref: 750px`, set on the `.playing-card--action`
 * / `.playing-card--money` / `.playing-card--wild-any` modifiers in
 * PlayingCard.tsx, so every px below is a literal transcription of the
 * reference's own px values, not a converted fraction.
 *
 * The outer 10px/36px border+radius is drawn on those same `.playing-card--*`
 * modifiers rather than on `.playing-card__af` itself (which the design doc
 * suggested) — `.playing-card` already carries its own default border via
 * `--border-thick`, and drawing a second border on an inset:0 wrapper inside
 * it would stack two rings (the existing near-black one plus this ink-brown
 * one), which the reference never shows. Overriding the outer border on a
 * scoped modifier class is exactly what `.playing-card--property` and
 * `.playing-card--wild-duo` already do, so this follows that precedent
 * instead. `.playing-card__af` itself just fills the flex box (mirroring
 * `.playing-card__pcard`) and carries the one inline, genuinely-per-card
 * value: the face's own background colour/gradient.
 */

/** `₹N` — for a card's own price badge (the value the caller passes in). */
function sym(n: number): string {
  return `${theme.currencySymbol}${n}`;
}

/** `₹NCR` — for amounts quoted inside rule-box sentences. */
function cr(n: number): string {
  return `${theme.currencySymbol}${n}${theme.currencySuffix.toUpperCase()}`;
}

interface CornerBadgeProps {
  /** Already-formatted, e.g. "₹3" — see `sym()`. */
  value: string;
  /** CSS `background` (solid colour or gradient) — the one per-card value. */
  bg: string;
  /** Diagonal hazard-stripe overlay opacity; omit for a flat badge. */
  stripeOpacity?: number;
  valueColor: string;
  shadowColor: string;
  /** Value text-shadow Y offset in reference px — 8 normally, 7 on the two
   *  gold-gradient badges (money-10, double-the-rent). */
  shadowOffsetY?: number;
  crColor: string;
  barColor: string;
  /** Reference px — 226 normally, 232 only on the money-10 badge. */
  height?: number;
  /** Reference px — 132 normally, smaller on money-10/double-the-rent. */
  valueFontSize?: number;
  valueMarginTop?: number;
  crMarginTop?: number;
  /** Joker only: a diagonal strike bar drawn across the "₹0". */
  strike?: boolean;
}

/**
 * The shared top-left price badge every one of these 12 faces carries: a
 * 200×226(-232) corner chip with the card's ₹ value, "CR", and an underline
 * bar. Every colour is per-card (background, ink, shadow, bar), so those
 * come in as props/inline style; the shape itself (size, border, radius,
 * layout) is the one thing that never changes and lives in styles.css.
 */
function CornerBadge({
  value,
  bg,
  stripeOpacity,
  valueColor,
  shadowColor,
  shadowOffsetY = 8,
  crColor,
  barColor,
  height = 226,
  valueFontSize = 132,
  valueMarginTop = 0,
  crMarginTop = 8,
  strike,
}: CornerBadgeProps) {
  return (
    <div
      className="playing-card__af-badge"
      style={{
        background: bg,
        // Only set when striped: React's style diffing applies object keys
        // in order, so an explicit `backgroundImage: undefined` here would
        // run *after* `background` above and clear the image layer a
        // gradient `bg` had just set via that shorthand — visible only on
        // the two gradient badges (money-10, double-the-rent), since a
        // solid-colour `bg` never sets an image layer in the first place.
        ...(stripeOpacity === undefined
          ? {}
          : {
              backgroundImage: `repeating-linear-gradient(45deg, rgba(0,0,0,${stripeOpacity}) 0 calc(16px * var(--card-scale)), transparent calc(16px * var(--card-scale)) calc(40px * var(--card-scale)))`,
            }),
        height: `calc(${height}px * var(--card-scale))`,
      }}
    >
      <div
        className="playing-card__af-badge-value"
        style={{
          color: valueColor,
          textShadow: `0 calc(${shadowOffsetY}px * var(--card-scale)) 0 ${shadowColor}`,
          fontSize: `calc(${valueFontSize}px * var(--card-scale))`,
          marginTop: `calc(${valueMarginTop}px * var(--card-scale))`,
        }}
      >
        {value}
        {strike && <span className="playing-card__af-badge-strike" aria-hidden />}
      </div>
      <div
        className="playing-card__af-badge-cr"
        style={{ color: crColor, marginTop: `calc(${crMarginTop}px * var(--card-scale))` }}
      >
        {theme.currencySuffix.toUpperCase()}
      </div>
      <div className="playing-card__af-badge-bar" style={{ background: barColor }} />
    </div>
  );
}

/** The 88px hazard-stripe strip that runs from the badge's right edge to the
 *  card's own right edge on the dark "steal" family (Sly/Forced/Debt) and,
 *  in a different two colours each, House and Hotel. */
function StripeHeader({ variant }: { variant: 'red' | 'orange' | 'pink' }) {
  return <div className={`playing-card__af-stripe-hdr playing-card__af-stripe-hdr--${variant}`} />;
}

/** The cream rule-box every face closes on. `variant` selects the per-card
 *  `top` offset (and, for a few, a non-default border colour/background) —
 *  see the `--pg`/`--sd`/… modifiers in styles.css. */
function RuleBox({ variant, children }: { variant: string; children: ReactNode }) {
  return <div className={`playing-card__af-rulebox playing-card__af-rulebox--${variant}`}>{children}</div>;
}

/** The smaller second line inside a two-line rule box (House/Hotel/Just Say
 *  No) — colour is per-card, so it comes in as a prop rather than a class. */
function RuleSub({ color, spaced, children }: { color: string; spaced?: boolean; children: ReactNode }) {
  return (
    <span
      className="playing-card__af-rulebox-sub"
      style={{ color, letterSpacing: spaced ? 'calc(2px * var(--card-scale))' : undefined }}
    >
      {children}
    </span>
  );
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

function PassGoContent({ v }: { v: string }) {
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
      <RuleBox variant="pg">DRAW 2 CARDS. NOBODY GETS HURT.</RuleBox>
      <CornerBadge value={v} bg="#05512A" valueColor="#FFFDF5" shadowColor="#022914" crColor="#FFFFFF" barColor="#7BE3A0" />
    </>
  );
}

function SlyDealContent({ v }: { v: string }) {
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
      <RuleBox variant="sd">STEAL ONE PROPERTY. NOT FROM A<br />COMPLETE SET.</RuleBox>
      <CornerBadge
        value={v}
        bg="#E11D2E"
        stripeOpacity={0.16}
        valueColor="#FFFDF5"
        shadowColor="#7E0716"
        crColor="#FFFFFF"
        barColor="#33030A"
      />
    </>
  );
}

function ForcedDealContent({ v }: { v: string }) {
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
      <RuleBox variant="fd">SWAP ONE OF YOUR PROPERTIES FOR A RIVAL&apos;S.</RuleBox>
      <CornerBadge
        value={v}
        bg="#E11D2E"
        stripeOpacity={0.16}
        valueColor="#FFFDF5"
        shadowColor="#7E0716"
        crColor="#FFFFFF"
        barColor="#33030A"
      />
    </>
  );
}

function DebtCollectorContent({ v }: { v: string }) {
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
      <RuleBox variant="dc">ONE RIVAL OF YOUR CHOICE PAYS YOU {cr(5)}.</RuleBox>
      <CornerBadge
        value={v}
        bg="#E11D2E"
        stripeOpacity={0.16}
        valueColor="#FFFDF5"
        shadowColor="#7E0716"
        crColor="#FFFFFF"
        barColor="#33030A"
      />
    </>
  );
}

function BirthdayContent({ v }: { v: string }) {
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
      <RuleBox variant="bd">EVERY RIVAL PAYS YOU {cr(2)}. NO EXCEPTIONS.</RuleBox>
      <CornerBadge
        value={v}
        bg="#E11D2E"
        stripeOpacity={0.16}
        valueColor="#FFFDF5"
        shadowColor="#7E0716"
        crColor="#FFFFFF"
        barColor="#33030A"
      />
    </>
  );
}

function DealBreakerContent({ v }: { v: string }) {
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
      <RuleBox variant="db">A FULL SET LEAVES ITS OWNER. INSTANTLY. ENTIRELY.</RuleBox>
      <CornerBadge value={v} bg="#33030A" valueColor="#FFFFFF" shadowColor="#000000" crColor="#FFFFFF" barColor="#FFF3DC" />
    </>
  );
}

function DoubleTheRentContent({ v }: { v: string }) {
  return (
    <>
      <div className="playing-card__af-dr-placard">
        <div className="playing-card__af-dr-placard-title">RENT</div>
        <RuleBox variant="dr">PLAY WITH A RENT CARD &mdash; THE BILL DOUBLES.</RuleBox>
      </div>
      <div className="playing-card__af-dr-dial">
        <span className="playing-card__af-dr-dial-disc" aria-hidden />
        <span className="playing-card__af-dr-dial-ring" aria-hidden />
        <div className="playing-card__af-dr-dial-center">
          <span className="playing-card__af-dr-dial-value">&times;2</span>
          <span className="playing-card__af-dr-dial-label">DOUBLE THE RENT</span>
        </div>
      </div>
      <CornerBadge
        value={v}
        bg="linear-gradient(170deg,#FFE58A,#FFCE3F 45%,#E3A81F)"
        valueColor="#2B1608"
        shadowColor="rgba(255,255,255,.4)"
        shadowOffsetY={7}
        crColor="#000000"
        barColor="#4A3300"
      />
    </>
  );
}

function HouseContent({ v }: { v: string }) {
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
      <RuleBox variant="ho">
        ADD TO A COMPLETE SET.
        <br />
        <RuleSub color="#8C5320">RENT ON THAT SET RISES BY {cr(HOUSE_RENT_BONUS)}.</RuleSub>
      </RuleBox>
      <CornerBadge
        value={v}
        bg="#D97706"
        stripeOpacity={0.14}
        valueColor="#FFFDF5"
        shadowColor="#7A3B00"
        crColor="#FFFFFF"
        barColor="#3A1D00"
      />
    </>
  );
}

/**
 * Not in the reference — derived from House, House's sibling: same layout
 * family (stripe header, badge, SVG building, tag, two-line rule box), a
 * distinct #B0004E accent instead of House's #D97706, and a taller building
 * (two more window rows) so it silently reads as "House, but bigger".
 */
function HotelContent({ v }: { v: string }) {
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
      <RuleBox variant="ht">
        ADD TO A COMPLETE SET WITH A HOUSE.
        <br />
        <RuleSub color="#8C1F55">RENT ON THAT SET RISES BY {cr(HOTEL_RENT_BONUS)}.</RuleSub>
      </RuleBox>
      <CornerBadge
        value={v}
        bg="#B0004E"
        stripeOpacity={0.14}
        valueColor="#FFFDF5"
        shadowColor="#6B0038"
        crColor="#FFFFFF"
        barColor="#3A0020"
      />
    </>
  );
}

function JustSayNoContent({ v }: { v: string }) {
  return (
    <>
      <div className="playing-card__af-jsn-title">
        JUST
        <br />
        SAY NO
      </div>
      <div className="playing-card__af-jsn-shield">
        <svg className="playing-card__af-jsn-shield-svg" viewBox="0 0 43 49" aria-hidden>
          <path
            d="M21.5 1 L41 8 V26 C41 37 32 44 21.5 48 C11 44 2 37 2 26 V8 Z"
            fill="#FFCE3F"
            stroke="#2B1608"
            strokeWidth="2.4"
          />
          <path
            d="M21.5 6 L36.5 11.5 V25.5 C36.5 34 29.5 39.6 21.5 43 C13.5 39.6 6.5 34 6.5 25.5 V11.5 Z"
            fill="#E3A81F"
          />
        </svg>
        <span className="playing-card__af-jsn-no">NO!</span>
      </div>
      <RuleBox variant="jsn">
        CANCEL ANY ACTION PLAYED AGAINST YOU.
        <br />
        <RuleSub color="#7A4B00" spaced>
          A COUNTER CAN BE COUNTERED.
        </RuleSub>
      </RuleBox>
      <CornerBadge
        value={v}
        bg="#1D4ED8"
        stripeOpacity={0.14}
        valueColor="#FFFDF5"
        shadowColor="#0A1B45"
        crColor="#FFFFFF"
        barColor="#FFCE3F"
      />
    </>
  );
}

/** Face content per action, keyed the same as `ActionType`. */
const ACTION_CONTENT: Record<ActionType, (props: { v: string }) => ReactNode> = {
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

/** The card's own base colour per action — the one genuinely per-card inline
 *  value, set on `.playing-card__af` itself (see the file header comment). */
const ACTION_BG: Record<ActionType, string> = {
  pass_go: '#0E8F4D',
  sly_deal: '#17090C',
  forced_deal: '#17090C',
  debt_collector: '#17090C',
  its_my_birthday: '#6D28D9',
  deal_breaker: '#7E0716',
  double_the_rent: '#1A1114',
  house: '#FFF3DC',
  hotel: '#FFF3DC',
  just_say_no: '#143A8F',
};

/** All ten action-card faces (House/Hotel included) — the multicolour wild's
 *  Joker face and the ₹10 money face are separate exports below since they
 *  hang off other `Card` kinds, not `ActionCard`. */
export function ActionFace({ action, value }: { action: ActionType; value: number }) {
  const Content = ACTION_CONTENT[action];
  return (
    <div className="playing-card__af" style={{ background: ACTION_BG[action] }}>
      <Content v={sym(value)} />
    </div>
  );
}

/** Every money denomination's face — same gold sunburst/frame/corner-badge
 *  treatment, differing only by base colour, printed value, and the
 *  "N in the deck" scarcity pill. */
const MONEY_FACE_BG: Record<number, string> = {
  1: '#0B3D2E',
  2: '#4A0E1F',
  3: '#1F2937',
  4: '#0B2A4A',
  5: '#3B1673',
  10: '#2A0A4A',
};

const MONEY_WORDS: Record<number, string> = {
  1: 'ONE',
  2: 'TWO',
  3: 'THREE',
  4: 'FOUR',
  5: 'FIVE',
  10: 'TEN',
};

/** Cards printed per denomination in the 110-card deck (general_rules.md §6,
 *  mirrored from packages/engine/src/deck.ts) — display flavour for the
 *  pill only, not authoritative. */
const MONEY_DECK_COUNTS: Record<number, number> = {
  1: 6,
  2: 5,
  3: 3,
  4: 3,
  5: 2,
  10: 1,
};

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
        <div className="playing-card__af-mt-value">{sym(amount)}</div>
        <div className="playing-card__af-mt-label">{MONEY_WORDS[amount] ?? amount}&nbsp;CRORE</div>
        <div className="playing-card__af-mt-pill">&#9733; {pillText} &#9733;</div>
      </div>
      <CornerBadge
        value={sym(amount)}
        bg="linear-gradient(170deg,#FFE58A,#FFCE3F 45%,#E3A81F)"
        valueColor="#2A0A4A"
        shadowColor="rgba(255,255,255,.45)"
        shadowOffsetY={7}
        crColor="#000000"
        barColor="#4A3300"
        height={232}
        valueFontSize={110}
        valueMarginTop={10}
        crMarginTop={12}
      />
    </div>
  );
}

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
 * The multicolour ("any") property wildcard's face — replaces the old plain
 * grey wildcard look. Rendered by `AnyWildFace` in PlayingCard.tsx, which
 * keeps that component name as a seam so callers are untouched.
 */
export function JokerWildFace() {
  return (
    <div className="playing-card__af" style={{ background: '#17131C' }}>
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
        <div className="playing-card__af-jk-rulebox">
          STANDS IN FOR ANY PROPERTY &mdash; BUT CANNOT BE BANKED OR PAID AS MONEY.
        </div>
      </div>
      <CornerBadge
        value={sym(0)}
        bg="linear-gradient(180deg,#E8368F 0 25%,#F2B705 25% 50%,#0E9F5A 50% 75%,#16337E 75% 100%)"
        valueColor="#FFFDF5"
        shadowColor="rgba(0,0,0,.5)"
        crColor="#FFFFFF"
        barColor="#FFFFFF"
        strike
      />
    </div>
  );
}
