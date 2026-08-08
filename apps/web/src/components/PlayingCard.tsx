import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ActionType, Card, PropertyColor } from '@monopoly-deal/shared';
import { RENT_TABLE } from '@monopoly-deal/shared';
import { cardAccent, cardTitle } from '../derivations';
import { useCurrency } from '../hooks/useCurrency';
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

function shortPropertyName(name: string): string {
  return name
    .replace(/\bAvenue\b/gi, 'Ave.')
    .replace(/\bPlace\b/gi, 'Pl.')
    .replace(/\bRailroad\b/gi, 'R.R.')
    .replace(/\bCompany\b/gi, 'Co.');
}

function headerTitle(card: Card, size: 'sm' | 'md' | 'lg' | 'board', formatMoney: (n: number) => string): string {
  if (card.kind === 'property') {
    const short = shortPropertyName(card.name);
    return size === 'sm' ? short : short.toUpperCase();
  }
  if (card.kind === 'money') return formatMoney(card.amount);
  if (card.kind === 'rent') return card.rentType === 'wild' ? 'WILD RENT' : 'RENT';
  if (card.kind === 'property_wild') {
    return card.colors.length === 0 ? 'WILDCARD' : cardTitle(card).toUpperCase();
  }
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
  if (card.kind === 'property_wild') {
    if (card.colors.length === 0) {
      return 'Stands in for any one property. Has no cash value.';
    }
    return card.colors
      .map((c) => {
        const label = theme.propertyNames[c] ?? c;
        return `${label}: ${RENT_TABLE[c].map((r) => formatMoney(r)).join('/')}`;
      })
      .join(' · ');
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
  if (card.kind === 'property_wild' && card.colors.length === 0) {
    return {
      background:
        'repeating-linear-gradient(135deg, #c94e8b 0 14px, #f59b1a 14px 28px, #fce014 28px 42px, #1b8a3c 42px 56px, #1f72c4 56px 70px)',
    };
  }
  if (card.kind === 'property_wild' && card.colors.length >= 2) {
    const a = theme.propertyColors[card.colors[0]!] ?? '#888';
    const b = theme.propertyColors[card.colors[1]!] ?? '#888';
    return {
      background: `linear-gradient(180deg, ${a} 0%, ${a} 50%, ${b} 50%, ${b} 100%)`,
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
  if (card.kind === 'property_wild' && card.colors.length === 0) {
    return 'playing-card__header-title playing-card__header-title--light';
  }
  if (card.kind === 'property') {
    const darkHeaders = new Set(['dark_blue', 'brown', 'green', 'railroad', 'red']);
    if (darkHeaders.has(card.color)) {
      return 'playing-card__header-title playing-card__header-title--light';
    }
  }
  if (card.kind === 'property_wild' && card.colors.length > 0) {
    return 'playing-card__header-title playing-card__header-title--light';
  }
  return 'playing-card__header-title';
}

function propertyIcon(color: PropertyColor): string {
  if (color === 'railroad') return '🚆';
  if (color === 'utility') return '💡';
  if (color === 'brown' || color === 'light_blue') return '⌂';
  return '▣';
}

function isLightHeader(card: Card): boolean {
  if (card.kind !== 'property') return false;
  const darkHeaders = new Set(['dark_blue', 'brown', 'green', 'railroad', 'red']);
  return !darkHeaders.has(card.color);
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

  return (
    <div
      className={`playing-card ${sizeClass[size]} ${className}${selected ? ' playing-card--selected' : ''}${armed && !ghostPos ? ' playing-card--armed' : ''}${isMoney ? ' playing-card--money' : ''}${isProperty ? ' playing-card--property' : ''}`}
      style={touchDragStyle ? { ...style, ...touchDragStyle } : style}
      title={
        isProperty
          ? `${card.name} — Rent ${rentSummary(card.color, formatMoney)}`
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
          <span className="playing-card__money-amount">{headerTitle(card, size, formatMoney)}</span>
        </div>
      ) : isProperty ? (
        <>
          <div className="playing-card__property-header" style={headerStyle(card)}>
            <span className="playing-card__value-badge">
              {formatMoney(card.value)}
            </span>
            <span
              className={`playing-card__property-title${isLightHeader(card) ? ' playing-card__property-title--dark' : ' playing-card__property-title--light'}`}
            >
              {shortPropertyName(card.name).toUpperCase()}
            </span>
            <span
              className={`playing-card__property-icon${isLightHeader(card) ? ' playing-card__property-icon--dark' : ''}`}
              aria-hidden
            >
              {propertyIcon(card.color)}
            </span>
          </div>
          <div className="playing-card__property-body">
            <span className="playing-card__rent-label">RENT</span>
            <ul className="playing-card__rent-list">
              {RENT_TABLE[card.color].map((amount, idx) => {
                return (
                  <li key={idx} className="playing-card__rent-row">
                    <span className="playing-card__rent-bars" aria-hidden>
                      {Array.from({ length: idx + 1 }).map((_, j) => (
                        <i key={j} className={j === idx ? 'is-active' : ''} />
                      ))}
                    </span>
                    <span className="playing-card__rent-sep" aria-hidden />
                    <span className="playing-card__rent-amount">{formatMoney(amount)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : (
        <>
          <div className="playing-card__header" style={headerStyle(card)}>
            <span className={headerTextClass(card)}>{headerTitle(card, size, formatMoney)}</span>
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
