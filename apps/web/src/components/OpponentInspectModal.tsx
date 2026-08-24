import { useEffect } from 'react';
import type { ClientGameState, ClientPlayerPublic } from '@monopoly-deal/shared';
import { nameFor, playerBankTotal } from '../derivations';
import { useCurrency } from '../hooks/useCurrency';
import { CashPile } from './CashPile';
import { PropertySetView } from './PropertySetView';

interface OpponentInspectModalProps {
  player: ClientPlayerPublic;
  clientState: ClientGameState;
  onClose: () => void;
}

export function OpponentInspectModal({ player, clientState, onClose }: OpponentInspectModalProps) {
  const { formatMoney } = useCurrency();
  const name = nameFor(clientState, player.id);
  const bankTotal = playerBankTotal(player);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="opponent-inspect-overlay" data-testid="opponent-inspect-overlay" onClick={onClose}>
      <div
        className="opponent-inspect"
        role="dialog"
        aria-label={`${name}'s board`}
        aria-modal="true"
        data-testid={`opponent-inspect-${player.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="opponent-inspect__header">
          <div className="opponent-inspect__title-wrap">
            <h2 className="opponent-inspect__title">{name}</h2>
            <span className="opponent-inspect__subtitle">
              {player.board.sets.length} set{player.board.sets.length !== 1 ? 's' : ''} ·{' '}
              {formatMoney(bankTotal)} in bank
            </span>
          </div>
          <button
            type="button"
            className="opponent-inspect__close"
            onClick={onClose}
            aria-label="Close"
            data-testid="opponent-inspect-close"
          >
            ×
          </button>
        </div>

        <div className="opponent-inspect__body">
          {player.board.sets.length === 0 && player.board.bank.length === 0 ? (
            <p className="opponent-inspect__empty">No property sets yet</p>
          ) : (
            <div className="opponent-inspect__sets" data-testid="opponent-inspect-sets">
              <CashPile cards={player.board.bank} />
              {player.board.sets.map((set) => (
                <PropertySetView key={set.id} set={set} canDrag={false} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
