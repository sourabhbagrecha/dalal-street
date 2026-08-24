import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '@monopoly-deal/shared';
import { useCurrency } from '../hooks/useCurrency';
import { PlayingCard } from './PlayingCard';

interface CashPileProps {
  cards: Card[];
}

/** Cards shown in the collapsed stack — the rest are folded behind the front one. */
const STACK_DEPTH = 3;
/** Cards per fan row when expanded; past this it wraps into another row (a "multilayer" fan) rather than one wide one. */
const FAN_ROW_SIZE = 5;
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

/** Per-card offset within one fan row: outer cards splay out, rotate, and dip slightly. */
function fanCardLayout(index: number, count: number) {
  const offset = index - (count - 1) / 2;
  const angleStep = count > 1 ? Math.min(8, 20 / ((count - 1) / 2)) : 0;
  return {
    x: offset * 42,
    y: Math.abs(offset) * 8,
    rotate: offset * angleStep,
  };
}

function chunkIntoRows(cards: Card[]): Card[][] {
  const rows: Card[][] = [];
  for (let i = 0; i < cards.length; i += FAN_ROW_SIZE) {
    rows.push(cards.slice(i, i + FAN_ROW_SIZE));
  }
  return rows;
}

/**
 * The bank, folded into the properties board as one more pile: a small tilted
 * stack showing just the top few cards, with the total sitting as a badge on
 * the front card. Tapping the total fans every bank card out in an overlay —
 * one row up to FAN_ROW_SIZE cards, more rows ("multilayer" fan) beyond that.
 *
 * Purely presentational: the actual play routing lives in PropertiesPanel's
 * drop handler, which also owns the `bank` zone (see its
 * `data-drop-zone="property bank"`), so any drop landing here that this
 * element doesn't handle itself simply bubbles up to it. Stays mounted even
 * when empty — `data-testid="bank-drop"` is a fixed target for drag/tap
 * routing and e2e specs, so it can never conditionally unmount, only
 * visually collapse to nothing.
 */
export function CashPile({ cards }: CashPileProps) {
  const { formatMoney } = useCurrency();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (cards.length === 0) setExpanded(false);
  }, [cards.length]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  if (cards.length === 0) {
    return <div className="cash-pile cash-pile--empty" data-testid="bank-drop" aria-hidden />;
  }

  const total = cards.reduce((sum, card) => sum + card.value, 0);
  const stackCards = cards.slice(-STACK_DEPTH);
  const fanRows = chunkIntoRows(cards);
  const totalLabel = `${formatMoney(total)} in the bank · ${cards.length} card${cards.length === 1 ? '' : 's'}`;

  return (
    <div className="cash-pile" aria-label="Your bank" data-testid="bank-drop">
      <div className="cash-pile__stack">
        {stackCards.map((card, i) => {
          const isFront = i === stackCards.length - 1;
          const { tilt, lift } = stackPlacement(stackCards.length - 1 - i, stackCards.length);
          return (
            <PlayingCard
              key={card.id}
              card={card}
              size="board"
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
        <button
          type="button"
          className="cash-pile__total"
          data-testid="bank-total"
          aria-label={`${totalLabel}. Tap to view all bank cards.`}
          onClick={() => setExpanded(true)}
        >
          {formatMoney(total)}
        </button>
      </div>

      {expanded &&
        createPortal(
          <div
            className="cash-pile__fan-overlay"
            data-testid="bank-fan-overlay"
            onClick={() => setExpanded(false)}
          >
            <div
              className="cash-pile__fan-panel"
              role="dialog"
              aria-label="Your bank"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cash-pile__fan-header">
                <span>{totalLabel}</span>
                <button
                  type="button"
                  className="cash-pile__fan-close"
                  onClick={() => setExpanded(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="cash-pile__fan-rows">
                {fanRows.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="cash-pile__fan-row"
                    style={{ zIndex: rowIndex + 1 }}
                  >
                    {row.map((card, i) => {
                      const { x, y, rotate } = fanCardLayout(i, row.length);
                      return (
                        <PlayingCard
                          key={card.id}
                          card={card}
                          size="md"
                          className="cash-pile__fan-card"
                          style={{
                            zIndex: i + 1,
                            transform: `translate(calc(-50% + ${x}px), ${y}px) rotate(${rotate}deg)`,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
