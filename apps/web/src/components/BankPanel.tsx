import { useCallback } from 'react';
import type { ClientGameState, ClientPlayerSelf } from '@monopoly-deal/shared';
import { isDiscardExcessMode, readDraggedCardId } from '../legality';
import { playerBankTotal } from '../derivations';
import { useGameStore } from '../store';
import { theme } from '../theme';
import { PlayingCard } from './PlayingCard';

interface BankPanelProps {
  player: ClientPlayerSelf;
  clientState: ClientGameState;
  highlight: boolean;
  shake?: boolean;
}

export function BankPanel({ player, clientState, highlight, shake }: BankPanelProps) {
  const total = playerBankTotal(player);
  const playCard = useGameStore((api) => api.playCard);
  const rejectLocal = useGameStore((api) => api.rejectLocal);
  const pickPlayCommandFn = useGameStore((api) => api.pickPlayCommand);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!highlight) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    },
    [highlight],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const cardId = readDraggedCardId(e.dataTransfer);
      if (!cardId) return;

      if (isDiscardExcessMode(clientState, player.id)) {
        rejectLocal('Use discard pile to drop excess cards');
        return;
      }

      const cmd = pickPlayCommandFn(cardId, 'bank');
      if (!cmd) {
        rejectLocal('Cannot bank this card here');
        return;
      }
      playCard(cardId, 'bank', cmd.target);
    },
    [clientState, player.id, playCard, rejectLocal, pickPlayCommandFn],
  );

  return (
    <section
      className={`bank-panel drop-zone${highlight ? ' drop-zone--active' : ''}${shake ? ' drop-zone--shake' : ''}`}
      aria-label="Your bank"
      data-testid="bank-drop"
      data-drop-zone="bank"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header className="panel-header">
        <h2 className="panel-header__title">YOUR BANK</h2>
        <span className="panel-header__badge panel-header__badge--gold">
          {theme.formatMoney(total)}
        </span>
      </header>

      <div className="bank-panel__content">
        {player.board.bank.length === 0 ? (
          <p className="bank-panel__empty">Bank is empty — drop money or action cards here</p>
        ) : (
          <div className="bank-panel__cards">
            {player.board.bank.map((card) => (
              <PlayingCard key={card.id} card={card} size="md" className="bank-panel__card" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
