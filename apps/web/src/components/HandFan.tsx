import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, RefObject, SetStateAction } from 'react';
import type { Card, PropertySet } from '@monopoly-deal/shared';
import { HAND_LIMIT } from '@monopoly-deal/shared';
import { useIsCompactHand } from '../hooks/useIsCompactHand';
import { useStoreSnapshot } from '../store';
import { useWildFace, useWildFacePrune } from '../wildFace';
import { PlayingCard } from './PlayingCard';

/** How much of its left neighbour a card covers in a comfortable row. */
const MIN_OVERLAP = 0.22;
/** Tightest a crowded row may pack before it starts bleeding past the fan box. */
const MAX_OVERLAP = 0.55;
/**
 * The overlap a row is assumed to accept when deciding how large its cards may
 * grow. Between MIN and MAX on purpose: measuring growth against MIN_OVERLAP
 * caps the cards at whatever a comfortably-fanned row fits, which on a narrow
 * board (a tablet whose side panel is still open) leaves them small with slack
 * the row would happily trade for size. Rows tighten toward MAX_OVERLAP to
 * absorb the difference — see rowStep.
 */
const GROWTH_OVERLAP = 0.4;
/** Splay per card, and the ceiling on the outermost card's tilt. */
const ANGLE_PER_CARD = 6;
const MAX_ROW_ANGLE = 13;
/**
 * The same, for a phone-width fan. A tilted card pivots on its bottom edge, so
 * the splay throws the outermost card's top corner sideways by roughly half its
 * height times the sine of the angle — about 24px at 13°, which is most of the
 * gutter a 393px board can afford and exactly where the value badge sits. Half
 * the splay costs the row very little of its hand-like shape and buys back the
 * corner.
 */
const PHONE_ANGLE_PER_CARD = 3.5;
const PHONE_MAX_ROW_ANGLE = 7;
/** How far below the row's centre card the outermost cards of a row sit. */
const ARC_DIP = 8;
/**
 * Where the bottom row sits relative to the top one, as a fraction of a card's
 * height. At 1 the rows abut; below 1 the bottom row rides up over the top row
 * by (1 - ROW_REVEAL) of a card's height.
 *
 * 0.65 covers ~35% of the top row — enough to reclaim the gap between rows for
 * the rest of the board without burying the rent table / full-set line, which
 * sits in the lower half of a property card. A tapped or hovered card still
 * lifts clear via z-index (see useFocusedCard) if a player needs the full face.
 */
const ROW_REVEAL = 0.65;
/** Horizontal bleed allowed past the fan box on each side — .game-board clips it. */
const BLEED = 16;
/**
 * The same allowance on a phone. A crowded row is laid out to exactly fill
 * `avail`, so the bleed is not a rare overshoot — it is precisely how far the
 * outer cards hang off each edge every time the hand is more than half full. At
 * 393px that clipped a whole value corner off the first and last card, i.e. the
 * one part of a card a player reads while deciding what to play, so a narrow fan
 * keeps its cards inside the board and pays for it with slightly more overlap.
 */
const PHONE_BLEED = 2;
/** Fan content width below which BLEED drops to PHONE_BLEED. */
const PHONE_FAN_WIDTH = 420;
/**
 * How far past the top of its box the fan may grow, as a fraction of the box.
 * The rows are bottom-anchored, so the surplus rides up over the panels above —
 * deliberate, and the same trick the single-row desktop fan uses. Buying height
 * this way is what keeps the cards readable at phone widths.
 *
 * Kept small on purpose. What it rides over is the properties panel, and a set
 * the player cannot see is no better than a rent table they cannot see; the
 * board's tracks are budgeted (see the phone block in styles.css) so that this
 * much bleed lands in the panel's empty lower band and stops short of the sets.
 */
const BLEED_UP = 1.08;
/**
 * Half the offset that pulls two equal-length rows apart. Rows of unequal length
 * already interlock (the longer row's cards sit between the shorter row's), but
 * equal rows would stack card-on-card, which reads as a pile rather than a hand.
 */
const ROW_STAGGER = 0.16;
/** Tilt given to a row holding a single card, which has no centre to splay from. */
const LONE_CARD_ANGLE = 4;

interface FanBox {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
}

/**
 * Measures the fan's content box plus the CSS-driven card size. The card size
 * comes from a hidden probe sized by the same `--hand-card-w/h` vars the cards
 * use, which avoids having to thread a ref through PlayingCard just to read a
 * value the stylesheet already owns.
 */
function useFanBox(): [
  RefObject<HTMLDivElement | null>,
  RefObject<HTMLDivElement | null>,
  FanBox,
] {
  const fanRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<FanBox>({ width: 0, height: 0, cardW: 0, cardH: 0 });

  useEffect(() => {
    const fan = fanRef.current;
    const probe = probeRef.current;
    if (!fan || !probe) return;

    const measure = () => {
      const fanRect = fan.getBoundingClientRect();
      const style = getComputedStyle(fan);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const probeRect = probe.getBoundingClientRect();
      setBox((prev) => {
        const next = {
          width: fanRect.width - padX,
          height: fanRect.height - padY,
          cardW: probeRect.width,
          cardH: probeRect.height,
        };
        return prev.width === next.width &&
          prev.height === next.height &&
          prev.cardW === next.cardW &&
          prev.cardH === next.cardH
          ? prev
          : next;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(fan);
    observer.observe(probe);
    return () => observer.disconnect();
  }, []);

  return [fanRef, probeRef, box];
}

/** Bounds on how far a hand may grow, or shrink, to fit the two-row box. */
const MAX_CARD_SCALE = 1.6;
const MIN_CARD_SCALE = 0.8;

/**
 * Cards per row, top first. The bottom row is the near one and never holds fewer
 * cards than the top: at a full nine-card hand that is the intended 4 over 5.
 * Past nine the split stays proportional and the surplus is absorbed by tighter
 * in-row overlap, so the hand is always exactly two rows — never a third row and
 * never a scroller.
 */
function splitRows(count: number): [top: number, bottom: number] {
  if (count < 5) return [0, count];
  const bottom = count <= 9 ? Math.ceil(count / 2) : Math.ceil((count * 5) / 9);
  return [count - bottom, bottom];
}

/**
 * Distance between the left edges of two neighbouring cards in a row of `m`.
 * A roomy row settles at the fixed MIN_OVERLAP so small hands look deliberately
 * fanned rather than stretched to the edges; a crowded one tightens up to
 * MAX_OVERLAP before it starts bleeding past `avail`.
 *
 * Both rows share one `m` — the wider row's — so a 3-card and a 4-card row use
 * the same spacing. Sizing each row off its own count used to leave the roomier
 * row's cards showing more face than the crowded row's, which read as two
 * different card sizes even though every card is the same width.
 */
function rowStep(m: number, w: number, avail: number): number {
  if (m <= 1) return 0;
  return Math.min(
    w * (1 - MIN_OVERLAP),
    Math.max((avail - w) / (m - 1), w * (1 - MAX_OVERLAP)),
  );
}

/** Splay of each card away from its row's centre, in degrees. */
function anglePerCard(m: number, per: number, max: number): number {
  if (m <= 1) return 0;
  return Math.min(per, max / ((m - 1) / 2));
}

/**
 * Two-row fan for touch. Cards overlap and splay from the row centre; because
 * `.hand-fan__card` pivots at `transform-origin: 50% 100%`, the tilt keeps every
 * bottom edge on the row's line and swings only the tops apart — the shape of a
 * real hand. The bottom row lies over the top row, covering all but ROW_REVEAL
 * of it, and the height that saves is spent scaling the cards up.
 *
 * Rows are allowed to bleed BLEED past the fan box on each side; `.game-board`
 * is `overflow: hidden`, so that clips at the board edge and can never produce a
 * scroller for the drag gesture to fight.
 *
 * The fan's box is a fixed two rows tall so that playing a card never reflows the
 * board, which is why two or more cards always use both rows — a single row in a
 * two-row box leaves a dead strip.
 */
function compactLayout(count: number, box: FanBox) {
  const { width, height, cardW, cardH } = box;
  const [topCount, bottomCount] = splitRows(count);
  const phone = width < PHONE_FAN_WIDTH;
  const avail = width + 2 * (phone ? PHONE_BLEED : BLEED);
  const maxRowAngle = phone ? PHONE_MAX_ROW_ANGLE : MAX_ROW_ANGLE;
  const anglePer = phone ? PHONE_ANGLE_PER_CARD : ANGLE_PER_CARD;

  // Room the outermost card's rotated top corner needs above the row's own box.
  const tiltBleed = (cardW * Math.sin((maxRowAngle * Math.PI) / 180)) / 2;
  // Growing is optional — capped by the width a row overlapped to GROWTH_OVERLAP
  // would need — but fitting the height is not, so byH applies in both
  // directions.
  const widestRow = Math.max(topCount, bottomCount);
  const byW = avail / (cardW * (1 + (widestRow - 1) * (1 - GROWTH_OVERLAP)));
  const byH =
    (height * BLEED_UP) / (cardH * (1 + ROW_REVEAL) + ARC_DIP * 2 + tiltBleed);
  const scale = Math.max(
    MIN_CARD_SCALE,
    Math.min(Math.max(1, Math.min(byW, MAX_CARD_SCALE)), byH),
  );

  const w = cardW * scale;
  const h = cardH * scale;
  const dip = ARC_DIP * scale;
  const step = rowStep(widestRow, w, avail);
  const steps = [step, step];
  // Bottom-anchored (minus the dip the outer cards need) so slack sits above the
  // hand, keeping it nearest the thumb and closest to the drop zones.
  const bottomTop = topCount === 0 ? (height - h) / 2 : height - h - dip;
  // The extra `dip` is the arc: the outermost card of each row sags by that much,
  // so rows spaced exactly one card apart still cross at their ends. Spacing them
  // a dip further apart is what makes ROW_REVEAL = 1 mean what it says.
  const rowTops = [bottomTop - h * ROW_REVEAL - dip, bottomTop];
  const stagger = topCount === bottomCount ? w * ROW_STAGGER : 0;

  const place = (i: number) => {
    const row = i < topCount ? 0 : 1;
    const m = row === 0 ? topCount : bottomCount;
    const j = row === 0 ? i : i - topCount;
    const step = steps[row]!;
    const oMax = (m - 1) / 2;
    const o = j - oMax;
    const rowW = (m - 1) * step + w;
    const lean = row === 0 ? -1 : 1;
    return {
      x: (width - rowW) / 2 + j * step + lean * stagger,
      y: rowTops[row]! + (oMax > 0 ? dip * (o / oMax) ** 2 : 0),
      rotate: m > 1 ? o * anglePerCard(m, anglePer, maxRowAngle) : lean * LONE_CARD_ANGLE,
    };
  };

  return { scale, place };
}

/**
 * The one card the player is currently inspecting — hovered with a mouse, or last
 * tapped on touch. Cards overlap, so this is what lifts a card clear of its
 * neighbours instead of leaving it half-covered by the ones dealt after it.
 *
 * A mouse leaves the card when the pointer does; a finger has no hover, so a
 * tapped card stays raised until another card or the board outside the fan is
 * touched. A starting drag drops the focus — the dragged card owns the top of
 * the stack from that point on.
 */
function useFocusedCard(
  fanRef: RefObject<HTMLDivElement | null>,
  draggingCardId: string | null,
): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);

  useEffect(() => {
    if (draggingCardId) setFocusedCardId(null);
  }, [draggingCardId]);

  useEffect(() => {
    if (!focusedCardId) return;
    const onPointerDown = (e: PointerEvent) => {
      const fan = fanRef.current;
      if (fan && e.target instanceof Node && fan.contains(e.target)) return;
      setFocusedCardId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [focusedCardId, fanRef]);

  return [focusedCardId, setFocusedCardId];
}

/**
 * Distance between neighbouring cards in the single-row (non-compact) fan.
 *
 * The preferred spread is a fixed pixel figure, but the row it has to fit is not:
 * between the compact breakpoint and a full desktop the board stacks and the fan's
 * column gets narrow, where a fixed spread walks the outer cards clean off both
 * edges — `.game-board` is `overflow: hidden`, so they are simply gone. Capping the
 * spread at what the measured box can hold keeps every card reachable; the row just
 * overlaps harder, which is what a real hand does when it is fanned in less space.
 * BLEED is allowed here for the same reason the compact rows allow it.
 */
function rowSpread(count: number, box: FanBox, measured: boolean): number {
  if (count <= 1) return 0;
  const preferred = Math.min(118, Math.max(72, 520 / count));
  if (!measured) return preferred;
  const avail = box.width + 2 * BLEED;
  return Math.min(preferred, Math.max((avail - box.cardW) / (count - 1), 0));
}

/**
 * One card in the fan.
 *
 * Split out of the map so a two-colour wildcard can hold its own face: hand
 * cards have no colour in game state, so the face lives client-side and each
 * card needs its own subscription to it.
 */
function HandFanCard({
  card,
  sets,
  ...rest
}: { card: Card; sets: PropertySet[] } & Omit<
  React.ComponentProps<typeof PlayingCard>,
  'card' | 'activeColor' | 'onFlip' | 'flipToColor'
>) {
  const { face, other, flip } = useWildFace(card, sets);
  return (
    <PlayingCard
      {...rest}
      card={card}
      activeColor={face}
      flipToColor={other}
      onFlip={other ? flip : undefined}
    />
  );
}

interface HandFanProps {
  cards: Card[];
  playerId: string;
  draggingCardId: string | null;
  selectedCardIds?: string[];
  onCardClick?: (cardId: string) => void;
  onDragStart: (card: Card, e: React.DragEvent) => void;
  onDragEnd: () => void;
  /** Tap-to-play: which card is currently held (highlighting its legal zones), if any. */
  heldCardId?: string | null;
  /** Tap-to-play: called when a card is tapped outside discard mode — holds it, or releases it if it's already held. */
  onCardSelect?: (card: Card) => void;
}

export function HandFan({
  cards,
  playerId: _playerId,
  draggingCardId,
  selectedCardIds = [],
  onCardClick,
  onDragStart,
  onDragEnd,
  heldCardId = null,
  onCardSelect,
}: HandFanProps) {
  const clientState = useStoreSnapshot().clientState;
  const overLimit = cards.length > HAND_LIMIT;
  const playsRemaining = clientState?.playsRemaining ?? 0;
  const sets = clientState?.you.board.sets ?? [];
  const pendingDoubles = clientState?.pendingDoubles ?? 0;
  const rentHintActive =
    pendingDoubles > 0 && clientState?.currentPlayerId === clientState?.viewerId;
  useWildFacePrune(cards);

  const compact = useIsCompactHand();
  const [fanRef, probeRef, fanBox] = useFanBox();
  const [focusedCardId, setFocusedCardId] = useFocusedCard(fanRef, draggingCardId);
  const measured = fanBox.width > 0 && fanBox.cardW > 0;
  const wrapped =
    compact && measured && cards.length > 0 ? compactLayout(cards.length, fanBox) : null;
  const fanSpread = rowSpread(cards.length, fanBox, measured);

  return (
    <section className="hand-area" aria-label="Your hand">
      <div className="hand-area__meta">
        <div className="hand-area__count-pill">
          <span className="hand-area__count-label">HAND</span>
          <p className={`hand-area__count${overLimit ? ' hand-area__count--over' : ''}`}>
            {cards.length}/{HAND_LIMIT}
          </p>
        </div>
        <p className="hand-area__hint">
          {overLimit
            ? `Discard down to ${HAND_LIMIT} at the end of your turn.`
            : `Discard down to ${HAND_LIMIT} at the end of your turn.`}
        </p>
      </div>

      <div
        ref={fanRef}
        className={`hand-fan${draggingCardId ? ' hand-fan--dragging' : ''}${wrapped ? ' hand-fan--wrapped' : ''}`}
        style={wrapped ? ({ ['--hand-scale']: wrapped.scale } as CSSProperties) : undefined}
        data-testid="hand-fan"
      >
        <div ref={probeRef} className="hand-fan__probe" aria-hidden="true" />
        {cards.length === 0 ? (
          <p className="hand-fan__empty">No cards in hand</p>
        ) : (
          cards.map((card, i) => {
            const offset = i - (cards.length - 1) / 2;
            const placed = wrapped?.place(i);
            const rotate = placed ? placed.rotate : offset * 2.2;
            const translateX = placed ? placed.x : offset * fanSpread;
            const translateY = placed ? placed.y : 0;
            const isDragging = draggingCardId === card.id;
            const isSelected = selectedCardIds.includes(card.id);
            const isFocused = focusedCardId === card.id;
            const isHeld = heldCardId === card.id;
            const isRentHint = rentHintActive && card.kind === 'rent';

            return (
              <HandFanCard
                key={card.id}
                card={card}
                sets={sets}
                size="lg"
                className={`hand-fan__card${isDragging ? ' hand-fan__card--dragging' : ''}${isSelected ? ' hand-fan__card--selected' : ''}${isFocused ? ' hand-fan__card--focused' : ''}${isHeld ? ' hand-fan__card--held' : ''}${isRentHint ? ' hand-fan__card--rent-hint' : ''}`}
                style={
                  {
                    ['--fan-x']: `${translateX}px`,
                    ['--fan-y']: `${translateY}px`,
                    ['--fan-r']: `${rotate}deg`,
                    // Inline, so it must cover every state the stylesheet raises a
                    // card for: a rule's z-index would lose to this on specificity.
                    zIndex: isDragging ? 200 : isHeld ? 190 : isFocused ? 180 : isSelected ? 150 : i,
                  } as CSSProperties
                }
                draggable
                selected={isSelected}
                data-testid={`hand-card-${card.id}`}
                onDragStart={(e) => onDragStart(card, e)}
                onDragEnd={onDragEnd}
                onPointerEnter={() => setFocusedCardId(card.id)}
                onPointerLeave={(e) => {
                  // Touch fires leave on lift-off; only a mouse actually left.
                  if (e.pointerType === 'mouse') {
                    setFocusedCardId((current) => (current === card.id ? null : current));
                  }
                }}
                onClick={() => {
                  setFocusedCardId(card.id);
                  if (onCardClick) {
                    onCardClick(card.id);
                  } else {
                    onCardSelect?.(card);
                  }
                }}
              />
            );
          })
        )}
      </div>

      <div className="hand-area__controls">
        {rentHintActive && (
          <p className="hand-area__plays-hint hand-area__plays-hint--rent" data-testid="rent-hint">
            {`Double the Rent active ×${pendingDoubles} — play a Rent card to apply it.`}
          </p>
        )}
        <p className="hand-area__plays-hint">
          {heldCardId
            ? 'Tap a highlighted zone to play it, or tap the card again to cancel.'
            : playsRemaining > 0
              ? `You may still play ${playsRemaining} card${playsRemaining === 1 ? '' : 's'}.`
              : 'No plays remaining.'}
        </p>
      </div>
    </section>
  );
}
