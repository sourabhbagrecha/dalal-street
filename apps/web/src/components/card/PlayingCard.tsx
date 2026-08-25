import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Card, PropertyColor } from '@monopoly-deal/shared';
import { RENT_TABLE } from '@monopoly-deal/shared';
import { cardTitle } from '../../derivations';
import { useCurrency } from '../../hooks/useCurrency';
import { dispatchCardDrop } from '../../legality';
import { theme } from '../../theme';
import { ActionFace } from './faces/ActionFace';
import { JokerFace } from './faces/JokerFace';
import { MoneyFace } from './faces/MoneyFace';
import { PropertyFace } from './faces/PropertyFace';
import { QuickStartFace } from './faces/QuickStartFace';
import { RentFace } from './faces/RentFace';
import { WildDuoFace } from './faces/WildDuoFace';
import { WildFlipButton } from './parts/FlipButton';

/**
 * The card shell: one 5:7 box, one ink ring, the sizing tokens, drag/flip
 * state, and a switch on `card.kind` that picks the face. It sets no
 * dimensions of its own — the box is sized by exactly one of the `--card-w`
 * / `--card-h` tokens the placement sets on its container (see the sizing
 * contract on `.playing-card` in cards.css) — and it has no size tiers:
 * every face renders the same content at every placement, only scaled.
 */
export interface PlayingCardProps {
  card: Card;
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
   * Whichever colour this is renders in the card's top (upright) half.
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

/** Half-turn plus half-turn back. Kept in sync with `--flip-duration` in cards.css. */
const FLIP_MS = 260;

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

function rentSummary(color: PropertyColor, formatMoney: (n: number) => string): string {
  return RENT_TABLE[color].map((r) => formatMoney(r)).join(' / ');
}

export function PlayingCard({
  card,
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
  const { dragging, armed, handlers } = useTouchDragPolyfill(draggable);
  // Board wildcards carry their colour in game state; hand wildcards are told
  // theirs by the caller. Either way it is one value from here down.
  const chosenColor =
    activeColor ?? (card.kind === 'property_wild' ? card.assignedColor : undefined);
  const { rendered: renderedColor, flipping } = useFlipTransition(chosenColor);

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

  // The one face-derived token on the root: how many rent rows this state
  // has, which the property face's ladder scale reads (see --card-ref-rows
  // in cards.css). It lives on the root, not the face, so a placement or a
  // test can override it on the card element.
  const rootVars: CSSProperties | undefined =
    card.kind === 'property'
      ? ({ '--rent-rows': RENT_TABLE[card.color].length } as CSSProperties)
      : undefined;

  const face = (() => {
    switch (card.kind) {
      case 'money':
        return <MoneyFace amount={card.amount} />;
      case 'property':
        return <PropertyFace card={card} />;
      case 'property_wild': {
        if (card.colors.length < 2) return <JokerFace />;
        // Active colour first, so it lands in the top (upright) half.
        const colors =
          renderedColor && card.colors.includes(renderedColor)
            ? [renderedColor, ...card.colors.filter((c) => c !== renderedColor)]
            : card.colors;
        return (
          <>
            <WildDuoFace card={card} colors={colors} />
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
        );
      }
      case 'rent':
        return <RentFace card={card} />;
      case 'action':
        return <ActionFace action={card.action} value={card.value} />;
      // Setup-only card: removed before the deal, so this face is reachable
      // from the deck reference on /rules and nowhere else.
      case 'rule':
        return <QuickStartFace />;
      default:
        return null;
    }
  })();

  return (
    <div
      className={`playing-card ${className}${selected ? ' playing-card--selected' : ''}${armed && !dragging ? ' playing-card--armed' : ''}${flipping ? ' playing-card--flipping' : ''}`}
      style={{ ...rootVars, ...style, ...touchDragStyle }}
      aria-label={
        card.kind === 'property'
          ? `${card.name}, ${theme.propertyNames[card.color]} — Rent ${rentSummary(card.color, formatMoney)}`
          : cardTitle(card)
      }
      // A clickable card is a control: expose it as one, make it reachable by
      // keyboard, and say whether it is currently picked — the whole
      // select-then-tap-a-zone flow was invisible to assistive tech otherwise.
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? selected : undefined}
      draggable={draggable}
      data-testid={testId}
      data-card-id={card.id}
      data-card-kind={card.kind}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onClick();
            }
          : undefined
      }
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
      {...handlers}
    >
      {face}
      <span className="playing-card__ring" aria-hidden />
    </div>
  );
}
