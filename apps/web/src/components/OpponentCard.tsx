import type { GameState, PlayerState } from '@monopoly-deal/shared';
import { playerBankTotal, turnLabel } from '../derivations';
import { theme } from '../theme';
import { PropertyMiniBar } from './PropertyMiniBar';

interface OpponentCardProps {
  player: PlayerState;
  seatIndex: number;
  state: GameState;
}

export function OpponentCard({ player, seatIndex, state }: OpponentCardProps) {
  const name = theme.seatName(seatIndex, false);
  const status = turnLabel(state, player.id);
  const bankTotal = playerBankTotal(player);
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="opponent-card">
      <div className="opponent-card__header">
        <div className="opponent-card__avatar" aria-hidden>
          {initial}
        </div>
        <div className="opponent-card__meta">
          <span className="opponent-card__name">{name}</span>
          <span className={`opponent-card__status opponent-card__status--${status.replace(/\s+/g, '-').toLowerCase()}`}>
            {status}
          </span>
        </div>
        <div className="opponent-card__hand-count">
          <span className="opponent-card__hand-icon">🃏</span>
          {player.hand.length}
        </div>
      </div>

      <div className="opponent-card__sets">
        {player.board.sets.length === 0 ? (
          <span className="opponent-card__no-sets">No properties</span>
        ) : (
          player.board.sets.map((set) => <PropertyMiniBar key={set.id} set={set} />)
        )}
      </div>

      <div className="opponent-card__footer">
        <span className="opponent-card__bank">
          {theme.formatMoney(bankTotal)} · {player.board.bank.length} cards
        </span>
        <button type="button" className="opponent-card__view-btn" disabled>
          Tap to view full board
        </button>
      </div>
    </div>
  );
}
