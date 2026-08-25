import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type {
  ActionType,
  Card,
  PropertyColor,
  PropertyWildCard,
  RentCard,
} from '@monopoly-deal/shared';
import { RENT_TABLE, STATE_NAMES, WILD_CITY_NAMES } from '@monopoly-deal/shared';
import { cardAccent, cardTitle } from '../derivations';
import { useCurrency } from '../hooks/useCurrency';
import { dispatchCardDrop } from '../legality';
import {
  INDIA_PROPERTY_THEME,
  PREMIUM_PROPERTY_COLOR,
  PREMIUM_RENT_CAPTION,
  PROPERTY_SET_TAGLINE,
} from '../indiaPropertyTheme';
import { PROPERTY_ART } from '../propertyArt';
import { theme } from '../theme';
import { ActionFace, JokerWildFace, MoneyFace } from './ActionCardFaces';
import { PropertyLandmark, PropertyStarIcon } from './PropertyLandmarks';

interface PlayingCardProps {
  card: Card;
  /**
   * Level-of-detail tier only — which face elements render at this size. It
   * sets NO dimensions: the card's box is always sized by exactly one of the
   * `--card-w` / `--card-h` CSS tokens the placement sets on its container
   * (see the sizing contract on `.playing-card` in styles.css), and the 5:7
   * aspect ratio fills in the other axis.
   */
  size?: 'sm' | 'md' | 'lg' | 'board';
  style?: CSSProperties;
  className?: string;
  draggable?: boolean;
  'data-testid'?: string;
  onDragStart?: (e: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onClick?: () => void;
  /** Pointer enter/leave, for callers that track which card is under the pointer. */
  onPointerEnter?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  selected?: boolean;
  /**
   * Which colour a two-colour wildcard is currently counting as. Board cards
   * pass their `assignedColor`; hand cards pass their locally-stored face.
   * Whichever colour this is renders in the card's top-left half.
   */
  activeColor?: PropertyColor;
  /** Supplying this renders the corner flip badge; omit it and the card has none. */
  onFlip?: () => void;
  /** Colour the flip would turn the card to — names the button. */
  flipToColor?: PropertyColor;
  flipDisabled?: boolean;
  /** Shown on the disabled badge so the player knows why it will not move. */
  flipDisabledReason?: string;
  /** Flip would break a complete set or strand a building: arm first, commit second. */
  flipDestructive?: boolean;
}

/** Half-turn plus half-turn back. Kept in sync with `--flip-duration` in the stylesheet. */
const FLIP_MS = 260;
/** How long a destructive flip stays armed before it forgets the first tap. */
const FLIP_ARM_MS = 3000;

/** Pixels of pointer movement before an armed touch press commits to a drag (vs. a tap). */
const TOUCH_DRAG_THRESHOLD = 6;

interface TouchDragState {
  pointerId: number;
  startX: number;
  startY: number;
  el: HTMLDivElement;
  dragging: boolean;
  dataTransfer: DataTransfer | null;
  overTarget: Element | null;
}

/**
 * The rest of the app's drag-and-drop (HandFan, CashPile, PropertiesPanel, PropertySetView,
 * GameCenter's discard pile) is wired entirely through native HTML5 drag events, which touch
 * browsers never fire. This replays the same dragstart/dragover/dragleave/drop/dragend sequence
 * from Pointer Events so every existing onDrop handler keeps working unchanged on mobile.
 *
 * The card arms the instant a finger touches it — there is no hold. `.hand-fan__card` and
 * draggable board cards are `touch-action: none`, so nothing under a card can ever scroll;
 * a delay before arming bought nothing but latency. A press released before it travels
 * TOUCH_DRAG_THRESHOLD never dispatches `dragstart`, so it's still a plain tap and the
 * discard-selection / tap-to-play click paths are untouched.
 *
 * The dragged element doubles as its own ghost: once a drag commits it switches to
 * `position: fixed` and every subsequent pointermove writes `transform` on it directly
 * through a ref, batched to one write per animation frame, instead of going through React
 * state — a card's subtree is too big to re-render on every pointermove at 60-120Hz.
 */
function useTouchDragPolyfill(draggable: boolean | undefined) {
  const stateRef = useRef<TouchDragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [armed, setArmed] = useState(false);

  const clearPress = () => {
    stateRef.current = null;
    setArmed(false);
  };

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stateRef.current = null;
    },
    [],
  );

  const writeGhost = (x: number, y: number) => {
    const el = stateRef.current?.el;
    if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -60%)`;
  };

  const queueGhost = (x: number, y: number) => {
    pendingRef.current = { x, y };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingRef.current;
      if (pending) writeGhost(pending.x, pending.y);
    });
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const state = stateRef.current;
    stateRef.current = null;
    setArmed(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingRef.current = null;

    if (!state?.dragging || !state.dataTransfer) {
      setDragging(false);
      return;
    }

    setDragging(false);
    state.el.style.transform = '';

    if (commit) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target) dispatchCardDrop(target, state.dataTransfer);
    }
    state.el.dispatchEvent(
      new DragEvent('dragend', { bubbles: true, dataTransfer: state.dataTransfer }),
    );
  };

  if (!draggable) {
    return { dragging, armed, handlers: {} as Record<string, undefined> };
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    const el = e.currentTarget;
    stateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      el,
      dragging: false,
      dataTransfer: null,
      overTarget: null,
    };
    setArmed(true);
    // Not implemented on iOS Safari; the lift animation carries the feedback there.
    navigator.vibrate?.(10);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Best-effort: keeps the drag targeted at this element if the finger slides off it.
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const state = stateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;

    if (!state.dragging) {
      const moved = Math.hypot(e.clientX - state.startX, e.clientY - state.startY);
      if (moved < TOUCH_DRAG_THRESHOLD) return;

      const dataTransfer = new DataTransfer();
      const started = state.el.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }),
      );
      if (!started) {
        clearPress();
        return;
      }
      state.dragging = true;
      state.dataTransfer = dataTransfer;
      // The browser may have started its own text selection before the drag committed.
      window.getSelection?.()?.removeAllRanges();
      setDragging(true);
      writeGhost(e.clientX, e.clientY);
    }

    e.preventDefault();
    queueGhost(e.clientX, e.clientY);

    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target !== state.overTarget) {
      state.overTarget?.dispatchEvent(
        new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: state.dataTransfer }),
      );
      target?.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: state.dataTransfer }),
      );
      state.overTarget = target;
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => endDrag(e, true);
  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => endDrag(e, false);

  return {
    dragging,
    armed,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}

/**
 * Turns a face change into a physical flip: the card rotates a half turn, the
 * two halves trade places at the midpoint while the card is edge-on, and it
 * rotates back. Swapping at the midpoint is what makes the new colour appear to
 * have been on the other side all along, rather than cross-fading in place.
 *
 * Returns the colour that should be rendered *now*, which lags `activeColor` by
 * half the animation.
 */
function useFlipTransition(activeColor: PropertyColor | undefined) {
  const [rendered, setRendered] = useState(activeColor);
  const [flipping, setFlipping] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    if (activeColor === undefined || activeColor === rendered) return;
    if (rendered === undefined) {
      // First paint of a card that already has a colour — nothing to flip from.
      setRendered(activeColor);
      return;
    }
    timers.current.forEach((t) => window.clearTimeout(t));
    setFlipping(true);
    timers.current = [
      window.setTimeout(() => setRendered(activeColor), FLIP_MS / 2),
      window.setTimeout(() => setFlipping(false), FLIP_MS),
    ];
  }, [activeColor, rendered]);

  return { rendered: rendered ?? activeColor, flipping };
}

/**
 * The corner badge that turns a wildcard over.
 *
 * It deliberately swallows the pointer: the card underneath arms an HTML5 drag
 * from any press (see `useTouchDragPolyfill`), and a tap that is sometimes a
 * flip and sometimes a drag is worse than a small patch of the card where drags
 * no longer start.
 *
 * A flip that would break a complete set or strand a house/hotel is never
 * blocked — breaking your own set to reach a third one can be the winning move
 * — but it takes two taps, because the first tap is easy to make by accident on
 * a board card and the move is not undoable in place.
 */
function WildFlipButton({
  cardId,
  toColor,
  disabled,
  disabledReason,
  destructive,
  onFlip,
}: {
  cardId: string;
  toColor?: PropertyColor;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  onFlip: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), FLIP_ARM_MS);
    const disarm = () => setArmed(false);
    // Any press elsewhere on the page is a decision not to go through with it.
    document.addEventListener('pointerdown', disarm);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', disarm);
    };
  }, [armed]);

  useEffect(() => {
    if (disabled) setArmed(false);
  }, [disabled]);

  const swallow = (e: ReactPointerEvent<HTMLButtonElement>) => {
    // Stops the card's touch-drag polyfill from arming underneath the badge.
    e.stopPropagation();
  };

  const commit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (disabled) return;
    if (destructive && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onFlip();
  };

  const label = disabled
    ? (disabledReason ?? 'Cannot flip right now')
    : armed
      ? 'Breaks a set — tap again to confirm'
      : toColor
        ? `Flip to ${theme.propertyNames[toColor] ?? toColor}`
        : 'Flip wildcard';

  return (
    <button
      type="button"
      className={`playing-card__flip${armed ? ' playing-card__flip--armed' : ''}`}
      data-testid={`flip-wild-btn-${cardId}`}
      data-armed={armed ? 'true' : undefined}
      aria-label={label}
      title={label}
      disabled={disabled}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={swallow}
      onClick={commit}
    >
      {armed ? (
        <span className="playing-card__flip-warn" aria-hidden>
          !
        </span>
      ) : (
        <>
          <svg viewBox="0 0 24 24" aria-hidden focusable="false">
            <path
              d="M4 9a8 8 0 0 1 13.7-5.6M20 15A8 8 0 0 1 6.3 20.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path d="M4 3.5V9h5.5M20 20.5V15h-5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="playing-card__flip-label" aria-hidden>
            FLIP
          </span>
        </>
      )}
    </button>
  );
}

const sizeClass = {
  sm: 'playing-card--sm',
  md: 'playing-card--md',
  lg: 'playing-card--lg',
  board: 'playing-card--board',
};

function getActionBlurb(action: ActionType, formatMoney: (n: number) => string): string | undefined {
  const map: Partial<Record<ActionType, string>> = {
    pass_go: 'Draw two extra cards from the deck.',
    sly_deal: 'Steal one property from an incomplete set of a rival.',
    forced_deal: 'Swap one of your properties with a rival incomplete-set property.',
    deal_breaker: 'Steal a complete property set from a rival.',
    debt_collector: `Force one rival to pay you ${formatMoney(5)}.`,
    its_my_birthday: `Every rival pays you ${formatMoney(2)}. Happy birthday!`,
    just_say_no: 'Cancel an action played against you.',
    double_the_rent: 'Play with a Rent card to double the charge.',
    house: `Add to a complete set to boost its rent by ${formatMoney(3)}.`,
    hotel: `Add to a complete set that already has a House to boost rent by ${formatMoney(4)}.`,
  };
  return map[action];
}

function cardKindLabel(card: Card): string {
  if (card.kind === 'money') return 'BANK NOTE';
  if (card.kind === 'property') return 'PROPERTY';
  if (card.kind === 'property_wild') return 'PROPERTY WILD';
  if (card.kind === 'action') {
    if (card.action === 'house') return 'HOUSE';
    if (card.action === 'hotel') return 'HOTEL';
    return 'ACTION';
  }
  return 'CARD';
}

function headerTitle(card: Card, formatMoney: (n: number) => string): string {
  if (card.kind === 'money') return formatMoney(card.amount);
  if (card.kind === 'action') return (theme.actionNames[card.action] ?? card.action).toUpperCase();
  return 'CARD';
}

function cardBlurb(card: Card, formatMoney: (n: number) => string): string {
  if (card.kind === 'money') {
    return 'Bank it for later, or hand it over to settle a debt.';
  }
  if (card.kind === 'property') {
    return `Rent ${RENT_TABLE[card.color].map((r) => formatMoney(r)).join(' / ')}.`;
  }
  if (card.kind === 'action') {
    return getActionBlurb(card.action, formatMoney) ?? 'Play this action on your turn.';
  }
  return '';
}

function rentSummary(color: PropertyColor, formatMoney: (n: number) => string): string {
  return RENT_TABLE[color].map((r) => formatMoney(r)).join(' / ');
}

function headerStyle(card: Card): CSSProperties {
  const accent = cardAccent(card);
  if (accent.includes('gradient')) {
    return { background: accent };
  }
  return { background: accent };
}

function headerTextClass(card: Card): string {
  if (card.kind === 'action') return 'playing-card__header-title playing-card__header-title--light';
  return 'playing-card__header-title';
}

/**
 * Per-state colour tokens for the India-design property face (see
 * indiaPropertyTheme.ts), handed to CSS once as custom properties the same
 * way propertyTintVars does for the wildcard/rent faces.
 */
function indiaPropertyVars(color: PropertyColor): CSSProperties {
  const t = INDIA_PROPERTY_THEME[color];
  return {
    '--p-base': t.base,
    // Rows are the only region whose content amount varies by set size — the
    // header (badge/tagline/price/city) is the same size on every state in
    // the reference design regardless of row count. See --card-ref-rows in
    // styles.css: a flat reference here would either clip a 4-row set or
    // under-shrink common 2-/3-row sets, the exact regression the card
    // sizing invariant in CLAUDE.md calls out.
    '--rent-rows': RENT_TABLE[color].length,
    '--p-band-bg': t.bandBg,
    '--p-price-bg': t.priceBg,
    '--p-badge-bg': t.badgeBg,
    '--p-badge-color': t.badgeColor,
    '--p-tagline-color': t.taglineColor,
    '--p-ink': t.priceInk,
    '--p-city-color': t.cityColor,
    '--p-price-shadow': t.priceValueShadow,
    '--p-city-shadow': t.cityShadow,
    '--p-row-bg': t.rowBg,
    '--p-mini-border-n': t.miniCardBorderPx ?? 5,
  } as CSSProperties;
}

/**
 * A wildcard's rent card face still splits on the diagonal (see
 * playing-card__wild-field), so it needs a colour ramp per half. Only
 * RentFace/WildRentFace use this now — the property wildcard face below
 * carries its own colours directly from INDIA_PROPERTY_THEME instead.
 */
function wildTintVars(colors: PropertyColor[]): CSSProperties {
  const vars: Record<string, string | number | undefined> = {};
  (['a', 'b'] as const).forEach((slot, i) => {
    const tints = theme.propertyTints[colors[i] ?? ''];
    vars[`--set-${slot}`] = tints?.base;
    vars[`--set-${slot}-dark`] = tints?.dark;
    vars[`--set-${slot}-light`] = tints?.light;
    vars[`--set-${slot}-field`] = tints?.field;
    vars[`--set-${slot}-line`] = tints?.line;
  });
  return vars as CSSProperties;
}

/** Per-half colour tokens for the property-wildcard face, read from the same
    per-state theme the property card uses (see indiaPropertyTheme.ts). */
function wildDuoHalfVars(color: PropertyColor): CSSProperties {
  const t = INDIA_PROPERTY_THEME[color];
  return {
    '--wd-base': t.base,
    '--wd-badge-bg': t.badgeBg,
    '--wd-badge-color': t.badgeColor,
    '--wd-tagline': t.taglineColor,
  } as CSSProperties;
}

/** One rent-ladder chip: a card count over its price, gold instead of cream
    on the full-set entry — the property card's full-set row treatment,
    shrunk into a chip since the ladder here runs sideways, not stacked.
    The count used to be a text label ("2 CARDS"); it's now a row of tiny
    blocks — the property card's own mini-card row (see
    .playing-card__pcard-mini-card), reused here at pill scale — so the ₹
    amount can grow to the size that's actually the point of this redesign.
    Nothing is lost for a screen reader: the pill carries its own
    `aria-label` restating what the text used to say. */
function WildDuoPill({
  count,
  amount,
  isFull,
}: {
  count: number;
  amount: number;
  isFull: boolean;
}) {
  const amountText = `${theme.currencySymbol}${amount}`;
  const label = isFull ? `Full set: ${amountText}` : `${count} card${count > 1 ? 's' : ''}: ${amountText}`;
  return (
    <div
      className={`playing-card__wd-pill${isFull ? ' playing-card__wd-pill--full' : ''}`}
      role="group"
      aria-label={label}
    >
      {isFull ? (
        <PropertyStarIcon className="playing-card__wd-pill-star" />
      ) : (
        <span className="playing-card__wd-pill-blocks" aria-hidden="true">
          {Array.from({ length: count }).map((_, i) => (
            <span key={i} className="playing-card__wd-pill-block" />
          ))}
        </span>
      )}
      <span className="playing-card__wd-pill-amount">{amountText}</span>
    </div>
  );
}

/** One face of a two-way wildcard: state badge, the wild city name, and that
    colour's own rent ladder as a row of chips (no tagline — dropped for
    space, see the CSS comment on .playing-card__wd-city). The other half is
    the same component again, rotated a half turn (see .playing-card__wd-half--b) —
    "the bottom half printed upside-down" is the whole trick, so both halves
    render from one component rather than two hand-mirrored ones. */
function WildDuoHalf({
  color,
  rotated,
}: {
  color: PropertyColor;
  /** Half B: same markup, printed upside-down (see WildFace). */
  rotated?: boolean;
}) {
  const rents = RENT_TABLE[color];
  return (
    <div
      className={`playing-card__wd-half${rotated ? ' playing-card__wd-half--b' : ''}`}
      style={wildDuoHalfVars(color)}
    >
      <div className="playing-card__wd-toprow">
        <div className="playing-card__wd-spacer" aria-hidden />
        <div className="playing-card__wd-content">
          <span className="playing-card__wd-statepill">
            <PropertyLandmark color={color} className="playing-card__wd-statepill-icon" />
            <span>{theme.propertyNames[color]}</span>
          </span>
          <span className="playing-card__wd-city">{WILD_CITY_NAMES[color]}</span>
        </div>
      </div>
      <div className="playing-card__wd-rentrow">
        <span className="playing-card__wd-rentlabel">
          RENT
          <br />
          LADDER
        </span>
        <div className="playing-card__wd-pills">
          {rents.map((amount, idx) => (
            <WildDuoPill key={idx} count={idx + 1} amount={amount} isFull={idx === rents.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The corner price badge: one ₹ value (a two-colour wildcard is worth the
    same regardless of which colour it's playing as), painted in a single
    solid colour — whichever colour the BOTTOM (upside-down, inactive) half
    currently is. `colors` in WildFace is already ordered active-colour-first
    (see wildColors in PlayingCard), so this is always `colors[1]`; when the
    card flips, `useFlipTransition` swaps which colour that is at the flip's
    midpoint, so the badge changes colour along with everything else with no
    extra state here. Absolutely positioned over half A's top-left corner —
    half B has the same reserved corner, just empty, since only one badge
    ever renders (see .playing-card__wd-spacer).
    Ink colours ride CSS custom properties (--wd-price-*) rather than being
    hardcoded, following the same per-colour theme the property card's own
    price panel uses (INDIA_PROPERTY_THEME): the ₹ value stays a fixed light
    cream with a colour-matched drop shadow, everything else uses that
    colour's `priceInk` — the exact ink-on-base pairing the real property
    card's price panel already uses on every state (including the darkest,
    railroad), so it reads on all ten. */
function WildDuoBadge({ color, value }: { color: PropertyColor; value: number }) {
  const t = INDIA_PROPERTY_THEME[color];
  return (
    <div
      className="playing-card__wd-badge"
      style={
        {
          '--wd-price-bg': t.base,
          '--wd-price-ink': t.priceInk,
          '--wd-price-shadow': t.priceValueShadow,
        } as CSSProperties
      }
    >
      <span className="playing-card__wd-badge-value">
        {theme.currencySymbol}
        {value}
      </span>
      <span className="playing-card__wd-badge-cr">{theme.currencySuffix.toUpperCase()}</span>
    </div>
  );
}

/**
 * A two-set wildcard: two state faces stacked top/bottom (the second printed
 * upside-down), a seam between them holding the flip control, and one corner
 * badge naming the card's price in a single colour — the bottom half's.
 *
 * The colour the card is currently counting as always takes the top (right-
 * side-up) half — `colors` arrives already ordered by the caller. Flipping the
 * card is what changes which one reads upright, so unlike the old diagonal
 * layout this face needs no separate dimming treatment for "which is active".
 */
function WildFace({ card, colors }: { card: PropertyWildCard; colors: PropertyColor[] }) {
  const [a, b] = colors;
  if (!a || !b) return null;

  return (
    <div className="playing-card__wd-face">
      <WildDuoHalf color={a} />
      <div className="playing-card__wd-seam" />
      <WildDuoHalf color={b} rotated />
      <WildDuoBadge color={b} value={card.value} />
    </div>
  );
}

/**
 * The multicolour wildcard joins any set at all, so it has no pair of states to
 * split between and no rent table until it is placed. Renders the Joker face
 * (see ActionCardFaces.tsx) — this component is kept as the seam PlayingCard
 * calls into, so callers are untouched by that redesign.
 */
function AnyWildFace() {
  return <JokerWildFace />;
}

/**
 * A dual rent card borrows the wildcard's diagonal — it names two states the
 * same way — but carries no rent table: what it charges depends on the board,
 * not on the card. The centre panel is what separates the two card types on
 * sight, so it states the card's type and its one rule and nothing else.
 */
function RentFace({ card, formatMoney }: { card: RentCard; formatMoney: (n: number) => string }) {
  const [a, b] = card.colors;
  if (!a || !b) return null;

  return (
    <>
      <span className="playing-card__wild-field playing-card__wild-field--a" aria-hidden>
        <img className="playing-card__art" src={PROPERTY_ART[a]} alt="" />
      </span>
      <span className="playing-card__wild-field playing-card__wild-field--b" aria-hidden>
        <img className="playing-card__art" src={PROPERTY_ART[b]} alt="" />
      </span>
      <div className="playing-card__rent-face">
        <span className="playing-card__value-badge playing-card__value-badge--corner">
          {formatMoney(card.value)}
        </span>
        <span className="playing-card__rent-state playing-card__rent-state--a">
          {STATE_NAMES[a]}
        </span>
        <span className="playing-card__rent-panel">
          <span className="playing-card__rent-wordmark">Rent</span>
          <span className="playing-card__rent-note">
            All rivals pay rent for one of these states.
          </span>
        </span>
        <span className="playing-card__rent-state playing-card__rent-state--b">
          {STATE_NAMES[b]}
        </span>
      </div>
    </>
  );
}

/**
 * The wild rent card charges for any set you hold, so it takes the rainbow that
 * already means "any of the ten" in this deck. Its face value tells it apart
 * from the multicolour property wildcard, which shows a dash.
 */
function WildRentFace({
  card,
  formatMoney,
}: {
  card: RentCard;
  formatMoney: (n: number) => string;
}) {
  return (
    <>
      <span
        className="playing-card__wild-rainbow"
        style={{ background: theme.rainbow('field') }}
        aria-hidden
      />
      <div className="playing-card__rent-face playing-card__rent-face--any">
        <span className="playing-card__value-badge playing-card__value-badge--corner">
          {formatMoney(card.value)}
        </span>
        <span className="playing-card__rent-panel">
          <span className="playing-card__rent-wordmark">Rent</span>
          <span className="playing-card__rent-any">Any State</span>
          <span className="playing-card__rent-note">
            One rival pays rent for any state you own.
          </span>
        </span>
      </div>
    </>
  );
}

export function PlayingCard({
  card,
  size = 'md',
  style,
  className = '',
  draggable,
  'data-testid': testId,
  onDragStart,
  onDragEnd,
  onClick,
  onPointerEnter,
  onPointerLeave,
  selected,
  activeColor,
  onFlip,
  flipToColor,
  flipDisabled,
  flipDisabledReason,
  flipDestructive,
}: PlayingCardProps) {
  const { formatMoney } = useCurrency();
  const isMoney = card.kind === 'money';
  const isProperty = card.kind === 'property';
  const isWild = card.kind === 'property_wild';
  const isRent = card.kind === 'rent';
  const isAction = card.kind === 'action';
  const showBlurb = size !== 'sm';
  const { dragging, armed, handlers } = useTouchDragPolyfill(draggable);
  // Board wildcards carry their colour in game state; hand wildcards are told
  // theirs by the caller. Either way it is one value from here down.
  const chosenColor =
    activeColor ?? (card.kind === 'property_wild' ? card.assignedColor : undefined);
  const { rendered: renderedColor, flipping } = useFlipTransition(chosenColor);
  // Active colour first, so it lands in the top-left half and takes the `a` ramp.
  const wildColors =
    isWild && renderedColor && card.colors.includes(renderedColor)
      ? [renderedColor, ...card.colors.filter((c) => c !== renderedColor)]
      : isWild
        ? card.colors
        : isRent
          ? card.colors
          : [];
  // Transform is deliberately absent here — it's written imperatively per pointermove
  // by useTouchDragPolyfill (a ref write, not React state), so it must never appear in
  // this object or a re-render would stomp the in-flight drag position. marginLeft/bottom/
  // right neutralize what `.hand-fan__card` sets, which otherwise leaves the ghost a full
  // card-width off from the finger once `position: fixed` takes over.
  const touchDragStyle: CSSProperties | undefined = dragging
    ? {
        position: 'fixed',
        left: 0,
        top: 0,
        right: 'auto',
        bottom: 'auto',
        marginLeft: 0,
        pointerEvents: 'none',
        transition: 'none',
        zIndex: 9999,
      }
    : undefined;
  const setStyle = isProperty
    ? indiaPropertyVars(card.color)
    : isRent
      ? wildTintVars(wildColors)
      : undefined;
  const wildClass = isWild
    ? card.colors.length >= 2
      ? ' playing-card--wild playing-card--wild-duo'
      : ' playing-card--wild playing-card--wild-any'
    : '';
  const rentClass = isRent ? ' playing-card--rent' : '';

  return (
    <div
      className={`playing-card ${sizeClass[size]} ${className}${selected ? ' playing-card--selected' : ''}${armed && !dragging ? ' playing-card--armed' : ''}${isMoney ? ' playing-card--money' : ''}${isProperty ? ' playing-card--property' : ''}${wildClass}${rentClass}${isAction ? ' playing-card--action' : ''}${flipping ? ' playing-card--flipping' : ''}`}
      style={{ ...setStyle, ...style, ...touchDragStyle }}
      aria-label={
        isProperty
          ? `${card.name}, ${theme.propertyNames[card.color]} — Rent ${rentSummary(card.color, formatMoney)}`
          : cardTitle(card)
      }
      draggable={draggable}
      data-testid={testId}
      data-card-id={card.id}
      data-card-kind={card.kind}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
      {...handlers}
    >
      {isMoney ? (
        <MoneyFace amount={card.amount} />
      ) : isProperty ? (
        <div className="playing-card__pcard">
          <div className="playing-card__pcard-band">
            <div className="playing-card__pcard-badge">
              <PropertyLandmark color={card.color} className="playing-card__pcard-badge-icon" />
              <span>{theme.propertyNames[card.color]}</span>
            </div>
            <div className="playing-card__pcard-tagline">{PROPERTY_SET_TAGLINE[card.color]}</div>
            <PropertyLandmark color={card.color} className="playing-card__pcard-glyph" />
            {card.color === PREMIUM_PROPERTY_COLOR && (
              <div className="playing-card__pcard-ribbon">★ PREMIUM</div>
            )}
          </div>
          <div className="playing-card__pcard-price">
            <div className="playing-card__pcard-price-val">
              {theme.currencySymbol}
              {card.value}
            </div>
            <div className="playing-card__pcard-price-cr">{theme.currencySuffix.toUpperCase()}</div>
          </div>
          <div className="playing-card__pcard-city">
            <div className="playing-card__pcard-city-title">{card.name}</div>
            <span className="playing-card__pcard-city-rule" aria-hidden />
          </div>
          <div className="playing-card__pcard-rows">
            {RENT_TABLE[card.color].map((amount, idx) => {
              const count = idx + 1;
              const isFullSet = idx === RENT_TABLE[card.color].length - 1;
              const isPremium = isFullSet && card.color === PREMIUM_PROPERTY_COLOR;
              return (
                <div
                  key={count}
                  className={`playing-card__pcard-row${isFullSet ? ' playing-card__pcard-row--full' : ''}`}
                >
                  {isFullSet ? (
                    <PropertyStarIcon className="playing-card__pcard-row-icon" />
                  ) : (
                    <span className="playing-card__pcard-row-cards" aria-hidden>
                      {Array.from({ length: count }).map((_, i) => (
                        <span key={i} className="playing-card__pcard-mini-card" />
                      ))}
                    </span>
                  )}
                  <span className="playing-card__pcard-row-label">
                    {isFullSet ? `FULL SET · ${count} CARD${count > 1 ? 'S' : ''}` : `${count} CARD${count > 1 ? 'S' : ''}`}
                    {isPremium && (
                      <>
                        <br />
                        <span className="playing-card__pcard-row-caption">{PREMIUM_RENT_CAPTION}</span>
                      </>
                    )}
                  </span>
                  <span className="playing-card__pcard-row-price">
                    {theme.currencySymbol}
                    {amount}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : isWild ? (
        card.colors.length >= 2 ? (
          <>
            <WildFace card={card} colors={wildColors} />
            {onFlip && (
              <WildFlipButton
                cardId={card.id}
                toColor={flipToColor}
                disabled={flipDisabled}
                disabledReason={flipDisabledReason}
                destructive={flipDestructive}
                onFlip={onFlip}
              />
            )}
          </>
        ) : (
          <AnyWildFace />
        )
      ) : isRent ? (
        card.rentType === 'dual' && card.colors.length >= 2 ? (
          <RentFace card={card} formatMoney={formatMoney} />
        ) : (
          <WildRentFace card={card} formatMoney={formatMoney} />
        )
      ) : isAction ? (
        <ActionFace action={card.action} value={card.value} />
      ) : (
        <>
          <div className="playing-card__header" style={headerStyle(card)}>
            <span className={headerTextClass(card)}>{headerTitle(card, formatMoney)}</span>
          </div>

          <div className="playing-card__body">
            {showBlurb && cardBlurb(card, formatMoney) && (
              <p className="playing-card__blurb">{cardBlurb(card, formatMoney)}</p>
            )}

            <div className="playing-card__footer">
              <span className="playing-card__kind">{cardKindLabel(card)}</span>
              {card.value > 0 ? (
                <span className="playing-card__value">{formatMoney(card.value)}</span>
              ) : (
                <span className="playing-card__value playing-card__value--none">—</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
