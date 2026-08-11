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
import { PROPERTY_ART } from '../propertyArt';
import { theme } from '../theme';

interface PlayingCardProps {
  card: Card;
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
 * The rest of the app's drag-and-drop (HandFan, BankPanel, PropertiesPanel, PropertySetView,
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
 * The property card paints itself entirely from its set's tint ramp, so the
 * colour is handed to CSS once as custom properties rather than threaded
 * through a dozen inline styles.
 */
function propertyTintVars(color: PropertyColor): CSSProperties {
  const tints = theme.propertyTints[color];
  return {
    '--set': tints?.base,
    '--set-dark': tints?.dark,
    '--set-light': tints?.light,
    '--set-line': tints?.line,
    // How many rent rows this card's face actually renders — see --card-ref
    // on .playing-card--property in styles.css. Sizing the face's downscale
    // to the real row count (2-4, depending on the set) instead of always
    // assuming the worst case (4) is what keeps a 2- or 3-row card's rent
    // text as large as it can be at any given width.
    '--rent-rows': RENT_TABLE[color].length,
  } as CSSProperties;
}

/**
 * A wildcard shows two sets at once, so it carries two ramps: `a` is the
 * top-left half, `b` the bottom-right. Each half then rebinds --set* to its own
 * ramp, which lets the rent rows below reuse the property card's styles as-is.
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
  // Both halves stack their rent tables in one face (see --card-ref on
  // .playing-card--wild), so the row count that matters is their sum.
  if (colors[0] && colors[1]) {
    vars['--rent-rows'] = RENT_TABLE[colors[0]].length + RENT_TABLE[colors[1]].length;
  }
  return vars as CSSProperties;
}

/**
 * One mini card in a rent row's fan. The row for N properties shows N of these,
 * overlapped and alternately tilted so the count reads at a glance.
 */
function RentCardIcon({ index }: { index: number }) {
  return (
    <svg
      className="playing-card__rent-icon"
      viewBox="0 0 24 34"
      style={{ transform: `rotate(${index % 2 === 0 ? -6 : 6}deg)` }}
      aria-hidden
    >
      <rect x="1" y="1" width="22" height="32" rx="4" fill="var(--set)" stroke="#fff" strokeWidth="1.5" />
      <rect x="5" y="5" width="14" height="24" rx="2" fill="none" stroke="#fff" strokeWidth="1" />
    </svg>
  );
}

/**
 * The rent table for one set: one row per property count, the last row marked
 * as the full set. Shared by the property card and by each half of a wildcard,
 * which is why it reads --set* from whatever ancestor scopes it.
 */
function RentRows({
  color,
  formatMoney,
  fullSet = 'pill',
}: {
  color: PropertyColor;
  formatMoney: (n: number) => string;
  /** Wildcard wedges are too narrow for the inline pill, so they caption instead. */
  fullSet?: 'pill' | 'caption';
}) {
  const rents = RENT_TABLE[color];
  return (
    <>
      <ul className="playing-card__rent-list">
        {rents.map((amount, idx) => (
          <li key={idx} className="playing-card__rent-row">
            <span className="playing-card__rent-icons" aria-hidden>
              {Array.from({ length: idx + 1 }).map((_, j) => (
                <RentCardIcon key={j} index={j} />
              ))}
            </span>
            {fullSet === 'pill' && idx === rents.length - 1 && (
              <span className="playing-card__fullset">Full set</span>
            )}
            <span className="playing-card__rent-amount">{formatMoney(amount)}</span>
          </li>
        ))}
      </ul>
      {fullSet === 'caption' && <span className="playing-card__fullset-caption">Full set</span>}
    </>
  );
}

/**
 * A two-set wildcard: the card is split on a diagonal, each half showing one
 * state's wild city and its rent table.
 *
 * The colour the card is currently counting as always takes the top-left half —
 * `colors` arrives already ordered by the caller — and the other half dims. Two
 * signals for one fact on purpose: position is what reads when the card is
 * large, dimming is what still reads at board size where the layout is too
 * small to parse.
 */
function WildFace({
  card,
  colors,
  activeColor,
  formatMoney,
}: {
  card: PropertyWildCard;
  colors: PropertyColor[];
  activeColor?: PropertyColor;
  formatMoney: (n: number) => string;
}) {
  const [a, b] = colors;
  if (!a || !b) return null;
  const dimmed = (color: PropertyColor) =>
    activeColor && activeColor !== color ? ' is-dimmed' : '';

  return (
    <>
      <span className={`playing-card__wild-field playing-card__wild-field--a${dimmed(a)}`} aria-hidden>
        <img className="playing-card__art" src={PROPERTY_ART[a]} alt="" />
      </span>
      <span className={`playing-card__wild-field playing-card__wild-field--b${dimmed(b)}`} aria-hidden>
        <img className="playing-card__art" src={PROPERTY_ART[b]} alt="" />
      </span>
      <div className="playing-card__wild-face">
        <span className="playing-card__value-badge playing-card__value-badge--corner">
          {formatMoney(card.value)}
        </span>
        <div className={`playing-card__wild-half playing-card__wild-half--a${dimmed(a)}`}>
          <span className="playing-card__city">{WILD_CITY_NAMES[a]}</span>
          <span className="playing-card__rule" aria-hidden />
          <RentRows color={a} formatMoney={formatMoney} fullSet="caption" />
        </div>
        <div className={`playing-card__wild-half playing-card__wild-half--b${dimmed(b)}`}>
          <span className="playing-card__city">{WILD_CITY_NAMES[b]}</span>
          <span className="playing-card__rule" aria-hidden />
          <RentRows color={b} formatMoney={formatMoney} fullSet="caption" />
        </div>
      </div>
    </>
  );
}

/**
 * The multicolour wildcard joins any set at all, so it has no pair of states to
 * split between and no rent table until it is placed — all ten colours and a
 * plain statement of what it does.
 */
function AnyWildFace() {
  return (
    <>
      <span
        className="playing-card__wild-rainbow"
        style={{ background: theme.rainbow('field') }}
        aria-hidden
      />
      <div className="playing-card__wild-face playing-card__wild-face--any">
        <span className="playing-card__value-badge playing-card__value-badge--corner">—</span>
        <span className="playing-card__city">Any State</span>
        <p className="playing-card__wild-note">
          Stands in for any one property. No cash value.
        </p>
      </div>
    </>
  );
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
    ? propertyTintVars(card.color)
    : isWild || isRent
      ? wildTintVars(wildColors)
      : undefined;
  const wildClass = isWild
    ? card.colors.length >= 2
      ? ' playing-card--wild'
      : ' playing-card--wild playing-card--wild-any'
    : '';
  const rentClass = isRent ? ' playing-card--rent' : '';

  return (
    <div
      className={`playing-card ${sizeClass[size]} ${className}${selected ? ' playing-card--selected' : ''}${armed && !dragging ? ' playing-card--armed' : ''}${isMoney ? ' playing-card--money' : ''}${isProperty ? ' playing-card--property' : ''}${wildClass}${rentClass}${flipping ? ' playing-card--flipping' : ''}`}
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
        <div className="playing-card__money-face" style={headerStyle(card)}>
          <div className="playing-card__money-amount">{headerTitle(card, formatMoney)}</div>
        </div>
      ) : isProperty ? (
        <>
          <img className="playing-card__art" src={PROPERTY_ART[card.color]} alt="" aria-hidden />
          <div className="playing-card__property-face">
            <div className="playing-card__property-head">
              <span className="playing-card__value-badge">{formatMoney(card.value)}</span>
              <span className="playing-card__city">{card.name}</span>
            </div>
            <span className="playing-card__rule" aria-hidden />
            <span className="playing-card__rent-label">RENT</span>
            <RentRows color={card.color} formatMoney={formatMoney} />
          </div>
        </>
      ) : isWild ? (
        card.colors.length >= 2 ? (
          <>
            <WildFace
              card={card}
              colors={wildColors}
              activeColor={renderedColor}
              formatMoney={formatMoney}
            />
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
