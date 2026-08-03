import type { GameState, PlayerState } from '@monopoly-deal/shared';
import { playerBankTotal, turnLabel } from '../derivations';
import { theme } from '../theme';
import { PropertyMiniBar } from './PropertyMiniBar';

interface OpponentCardProps {
  player: PlayerState;
  seatIndex: number;
  state: GameState;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

export function OpponentCard({ player, seatIndex, state }: OpponentCardProps) {
  const name = theme.seatName(seatIndex, false);
  const status = turnLabel(state, player.id);
  const bankTotal = playerBankTotal(player);
  const initials = initialsFromName(name);

  return (
    <div className="opponent-card">
      <div className="opponent-card__header">
        <div className="opponent-card__avatar" aria-hidden>
          {initials}
        </div>
        <div className="opponent-card__meta">
          <span className="opponent-card__name">{name}</span>
          <span
            className={`opponent-card__status opponent-card__status--${status.replace(/\s+/g, '-').toLowerCase()}`}
          >
            {status}
          </span>
        </div>
        <div className="opponent-card__hand-count" aria-label={`${player.hand.length} cards in hand`}>
          <span className="opponent-card__hand-icon" aria-hidden>
            <span />
            <span />
            <span />
          </span>
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
        <span className="opponent-card__bank-label">BANK</span>
        <span className="opponent-card__bank">
          {theme.formatMoney(bankTotal)} · {player.board.bank.length} cards
        </span>
      </div>
    </div>
  );
}
