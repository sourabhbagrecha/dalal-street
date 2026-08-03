import { useCallback } from 'react';
import type { PlayerState } from '@monopoly-deal/shared';
import { isDiscardExcessMode, pickPlayCommand, readDraggedCardId } from '../legality';
import { playerBankTotal } from '../derivations';
import { useGameStore } from '../store';
import { theme } from '../theme';
import { PlayingCard } from './PlayingCard';

interface BankPanelProps {
  player: PlayerState;
  highlight: boolean;
  shake?: boolean;
}

export function BankPanel({ player, highlight, shake }: BankPanelProps) {
  const total = playerBankTotal(player);
  const state = useGameStore((s) => s.state);
  const playCard = useGameStore((s) => s.playCard);
  const rejectLocal = useGameStore((s) => s.rejectLocal);

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

      if (isDiscardExcessMode(state, player.id)) {
        rejectLocal('Use discard pile to drop excess cards');
        return;
      }

      const cmd = pickPlayCommand(state, player.id, cardId, 'bank');
      if (!cmd) {
        rejectLocal('Cannot bank this card here');
        return;
      }
      playCard(cardId, 'bank', cmd.target);
    },
    [state, player.id, playCard, rejectLocal],
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
