import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { useCurrency } from '../hooks/useCurrency';
import { PlayingCard } from './PlayingCard';

interface CashPileProps {
  cards: Card[];
  /** Table-moment highlight: money just left ('paid') or arrived ('gained'). */
  attention?: 'paid' | 'gained' | null;
}

/** Cards shown in the collapsed stack — the rest are folded behind the front one. */
const STACK_DEPTH = 3;
/** Tilt for each stack card, back to front — the front card stays nearly upright. */
const STACK_TILTS = [-9, 6, -2];
/** Cards behind the front one also lift up a little per step back — pure in-place
 * rotation is too subtle to read as a stack at the board card's small size. */
const STACK_LIFT_PER_STEP = 5;

function stackPlacement(depthFromFront: number, total: number): { tilt: number; lift: number } {
  const tilts = STACK_TILTS.slice(-total);
  return {
    tilt: tilts[tilts.length - 1 - depthFromFront] ?? 0,
    lift: depthFromFront * STACK_LIFT_PER_STEP,
  };
}

/**
 * The bank, folded into the properties board as one more pile: a small tilted
 * stack showing just the top few cards, with the total sitting as a badge on
 * the front card. Tapping the total expands the pile in place into every
 * bank card fanned out — the same overlapping-row look PropertySetView uses
 * for a set — rather than a separate popup; tapping it again, Escape, or a
 * tap outside folds it back to the stack.
 *
 * Purely presentational: the actual play routing lives in PropertiesPanel's
 * drop handler, which also owns the `bank` zone (see its
 * `data-drop-zone="property bank"`), so any drop landing here that this
 * element doesn't handle itself simply bubbles up to it. Stays mounted even
 * when empty — `data-testid="bank-drop"` is a fixed target for drag/tap
 * routing and e2e specs, so it can never conditionally unmount, only
 * visually collapse to nothing.
 */
export function CashPile({ cards, attention }: CashPileProps) {
  const { formatMoney } = useCurrency();
  const [expanded, setExpanded] = useState(false);
  const pileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cards.length === 0) setExpanded(false);
  }, [cards.length]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const pile = pileRef.current;
      if (pile && e.target instanceof Node && pile.contains(e.target)) return;
      setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [expanded]);

  if (cards.length === 0) {
    return (
      <div
        className="cash-pile cash-pile--empty"
        data-testid="bank-drop"
        data-attention={attention ?? undefined}
        aria-hidden
      />
    );
  }

  const total = cards.reduce((sum, card) => sum + card.value, 0);
  const stackCards = cards.slice(-STACK_DEPTH);
  const totalLabel = `${formatMoney(total)} in the bank · ${cards.length} card${cards.length === 1 ? '' : 's'}`;

  return (
    <div
      ref={pileRef}
      className={`cash-pile${expanded ? ' cash-pile--expanded' : ''}`}
      aria-label="Your bank"
      data-testid="bank-drop"
      data-attention={attention ?? undefined}
    >
      {expanded ? (
        <div className="cash-pile__fan" data-testid="bank-fan" role="group" aria-label={totalLabel}>
          {cards.map((card, i) => (
            <PlayingCard key={card.id} card={card} className="cash-pile__fan-card" style={{ zIndex: i + 1 }} />
          ))}
        </div>
      ) : (
        <div className="cash-pile__stack">
          {stackCards.map((card, i) => {
            const isFront = i === stackCards.length - 1;
            const { tilt, lift } = stackPlacement(stackCards.length - 1 - i, stackCards.length);
            return (
              <PlayingCard
                key={card.id}
                card={card}
                className={`cash-pile__stack-card${isFront ? ' cash-pile__stack-card--front' : ''}`}
                style={
                  {
                    zIndex: i + 1,
                    ['--stack-tilt']: `${tilt}deg`,
                    ['--stack-lift']: `${lift}px`,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="cash-pile__total"
        data-testid="bank-total"
        aria-label={`${totalLabel}. ${expanded ? 'Tap to collapse.' : 'Tap to view all bank cards.'}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        {formatMoney(total)}
      </button>
    </div>
  );
}
