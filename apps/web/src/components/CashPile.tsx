import type { Card } from '@monopoly-deal/shared';
import { useCurrency } from '../hooks/useCurrency';
import { PlayingCard } from './PlayingCard';

interface CashPileProps {
  cards: Card[];
}

/**
 * The bank, folded into the properties board as one more pile: cards stack
 * with the same overlap a property set uses, and — just like a property set
 * — nothing renders until the first card lands. Purely presentational: the
 * actual play routing lives in PropertiesPanel's drop handler, which also
 * owns the `bank` zone (see its `data-drop-zone="property bank"`), so any
 * drop landing here that this element doesn't handle itself simply bubbles
 * up to it. Stays mounted even when empty — `data-testid="bank-drop"` is a
 * fixed target for drag/tap routing and e2e specs, so it can never conditionally
 * unmount, only visually collapse to nothing.
 */
export function CashPile({ cards }: CashPileProps) {
  const { formatMoney } = useCurrency();

  if (cards.length === 0) {
    return <div className="cash-pile cash-pile--empty" data-testid="bank-drop" aria-hidden />;
  }

  const total = cards.reduce((sum, card) => sum + card.value, 0);

  return (
    <div className="cash-pile" aria-label="Your bank" data-testid="bank-drop">
      <div className="cash-pile__cards">
        {cards.map((card, i) => (
          <PlayingCard
            key={card.id}
            card={card}
            size="board"
            className="cash-pile__card"
            style={{ zIndex: i + 1 }}
          />
        ))}
      </div>
      <div className="cash-pile__total" data-testid="bank-total">
        {formatMoney(total)}
      </div>
    </div>
  );
}
