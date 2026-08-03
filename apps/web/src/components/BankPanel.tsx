import type { PlayerState } from '@monopoly-deal/shared';
import { playerBankTotal } from '../derivations';
import { theme } from '../theme';
import { PlayingCard } from './PlayingCard';

interface BankPanelProps {
  player: PlayerState;
}

export function BankPanel({ player }: BankPanelProps) {
  const total = playerBankTotal(player);

  return (
    <section className="bank-panel" aria-label="Your bank">
      <header className="panel-header">
        <h2 className="panel-header__title">YOUR BANK</h2>
        <span className="panel-header__badge panel-header__badge--gold">
          {theme.formatMoney(total)}
        </span>
      </header>

      <div className="bank-panel__content">
        {player.board.bank.length === 0 ? (
          <p className="bank-panel__empty">Bank is empty</p>
        ) : (
          <div className="bank-panel__cards">
            {player.board.bank.map((card) => (
              <PlayingCard key={card.id} card={card} size="sm" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
