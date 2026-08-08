import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ActionType, Card, PropertyColor, PropertyWildCard } from '@monopoly-deal/shared';
import { RENT_TABLE, WILD_CITY_NAMES } from '@monopoly-deal/shared';
import { cardAccent, cardTitle } from '../derivations';
import { useCurrency } from '../hooks/useCurrency';
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
}

/** Pixels of pointer movement before an armed touch press commits to a drag (vs. a tap). */
const TOUCH_DRAG_THRESHOLD = 8;
/** How long a finger must rest on a card before the drag arms. */
const LONG_PRESS_MS = 180;

interface TouchDragState {
  pointerId: number;
  startX: number;
  startY: number;
  el: HTMLDivElement;
  timer: number | null;
  armed: boolean;
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
 * A touch drag only arms after LONG_PRESS_MS. Hand cards overlap once the hand grows past a
 * row's worth, so the armed state lifts the card clear of its neighbours *before* it moves —
 * that preview is what lets the player confirm they grabbed the card they meant to. A press
 * that slides before arming is treated as a pan and abandoned, and a press released before
 * arming is still a plain tap, so the discard-selection click path is untouched.
 */
function useTouchDragPolyfill(draggable: boolean | undefined) {
  const stateRef = useRef<TouchDragState | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [armed, setArmed] = useState(false);

  const clearPress = () => {
    const state = stateRef.current;
    if (state?.timer !== null && state?.timer !== undefined) window.clearTimeout(state.timer);
    stateRef.current = null;
    setArmed(false);
  };

  useEffect(() => clearPress, []);

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const state = stateRef.current;
    if (state?.timer !== null && state?.timer !== undefined) window.clearTimeout(state.timer);
    stateRef.current = null;
    setGhostPos(null);
    setArmed(false);
    if (!state?.dragging || !state.dataTransfer) return;

    if (commit) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      target?.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: state.dataTransfer }),
      );
    }
    e.currentTarget.dispatchEvent(
      new DragEvent('dragend', { bubbles: true, dataTransfer: state.dataTransfer }),
    );
  };

  if (!draggable) {
    return { ghostPos, armed, handlers: {} as Record<string, undefined> };
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    const el = e.currentTarget;
    const pointerId = e.pointerId;
    const state: TouchDragState = {
      pointerId,
      startX: e.clientX,
      startY: e.clientY,
      el,
      timer: null,
      armed: false,
      dragging: false,
      dataTransfer: null,
      overTarget: null,
    };
    state.timer = window.setTimeout(() => {
      if (stateRef.current !== state) return;
      state.timer = null;
      state.armed = true;
      setArmed(true);
      // Not implemented on iOS Safari; the lift animation carries the feedback there.
      navigator.vibrate?.(10);
      try {
        el.setPointerCapture(pointerId);
      } catch {
        // Best-effort: keeps the drag targeted at this element if the finger slides off it.
      }
    }, LONG_PRESS_MS);
    stateRef.current = state;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const state = stateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const moved = Math.hypot(dx, dy);

    if (!state.armed) {
      // Sliding before the press arms means the player was panning, not grabbing.
      if (moved >= TOUCH_DRAG_THRESHOLD) clearPress();
      return;
    }

    if (!state.dragging) {
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
    }

    e.preventDefault();
    setGhostPos({ x: e.clientX, y: e.clientY });

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
    ghostPos,
    armed,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
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
  if (card.kind === 'rent') return 'RENT CARD';
  if (card.kind === 'action') {
    if (card.action === 'house') return 'HOUSE';
    if (card.action === 'hotel') return 'HOTEL';
    return 'ACTION';
  }
  return 'CARD';
}

function headerTitle(card: Card, formatMoney: (n: number) => string): string {
  if (card.kind === 'money') return formatMoney(card.amount);
  if (card.kind === 'rent') return card.rentType === 'wild' ? 'WILD RENT' : 'RENT';
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
  if (card.kind === 'rent') {
    if (card.rentType === 'wild') {
      return 'Charge one rival rent for any colour you own.';
    }
    return 'Charge every rival rent for one of these two colours.';
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
  if (card.kind === 'rent' && card.rentType === 'dual' && card.colors.length >= 2) {
    const a = theme.propertyColors[card.colors[0]!] ?? '#888';
    const b = theme.propertyColors[card.colors[1]!] ?? '#888';
    return {
      background: `linear-gradient(135deg, ${a} 0%, ${a} 48%, ${b} 52%, ${b} 100%)`,
    };
  }
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
  } as CSSProperties;
}

/**
 * A wildcard shows two sets at once, so it carries two ramps: `a` is the
 * top-left half, `b` the bottom-right. Each half then rebinds --set* to its own
 * ramp, which lets the rent rows below reuse the property card's styles as-is.
 */
function wildTintVars(colors: PropertyColor[]): CSSProperties {
  const vars: Record<string, string | undefined> = {};
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
 * state's wild city and its rent table. Once the card is placed the half it was
 * assigned to stays at full strength and the other dims, so a board scan shows
 * which set it is currently counting toward without hiding that it can move.
 */
function WildFace({
  card,
  formatMoney,
}: {
  card: PropertyWildCard;
  formatMoney: (n: number) => string;
}) {
  const [a, b] = card.colors;
  if (!a || !b) return null;
  const dimmed = (color: PropertyColor) =>
    card.assignedColor && card.assignedColor !== color ? ' is-dimmed' : '';

  return (
    <>
      <span className={`playing-card__wild-field playing-card__wild-field--a${dimmed(a)}`} aria-hidden>
        <img className="playing-card__art" src={PROPERTY_ART[a]} alt="" />
      </span>
      <span className={`playing-card__wild-field playing-card__wild-field--b${dimmed(b)}`} aria-hidden>
        <img className="playing-card__art" src={PROPERTY_ART[b]} alt="" />
      </span>
      <div className="playing-card__wild-face">
        <span className="playing-card__value-badge playing-card__value-badge--wild">
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
        <span className="playing-card__value-badge playing-card__value-badge--wild">—</span>
        <span className="playing-card__city">Any State</span>
        <p className="playing-card__wild-note">
          Stands in for any one property. No cash value.
        </p>
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
}: PlayingCardProps) {
  const { formatMoney } = useCurrency();
  const isMoney = card.kind === 'money';
  const isProperty = card.kind === 'property';
  const isWild = card.kind === 'property_wild';
  const showBlurb = size !== 'sm';
  const { ghostPos, armed, handlers } = useTouchDragPolyfill(draggable);
  const touchDragStyle: CSSProperties | undefined = ghostPos
    ? {
        position: 'fixed',
        left: ghostPos.x,
        top: ghostPos.y,
        transform: 'translate(-50%, -60%)',
        pointerEvents: 'none',
        transition: 'none',
        zIndex: 9999,
      }
    : undefined;
  const setStyle = isProperty
    ? propertyTintVars(card.color)
    : isWild
      ? wildTintVars(card.colors)
      : undefined;
  const wildClass = isWild
    ? card.colors.length >= 2
      ? ' playing-card--wild'
      : ' playing-card--wild playing-card--wild-any'
    : '';

  return (
    <div
      className={`playing-card ${sizeClass[size]} ${className}${selected ? ' playing-card--selected' : ''}${armed && !ghostPos ? ' playing-card--armed' : ''}${isMoney ? ' playing-card--money' : ''}${isProperty ? ' playing-card--property' : ''}${wildClass}`}
      style={{ ...setStyle, ...style, ...touchDragStyle }}
      title={
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
      {...handlers}
    >
      {isMoney ? (
        <div className="playing-card__money-face" style={headerStyle(card)}>
          <span className="playing-card__money-amount">{headerTitle(card, formatMoney)}</span>
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
          <WildFace card={card} formatMoney={formatMoney} />
        ) : (
          <AnyWildFace />
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
