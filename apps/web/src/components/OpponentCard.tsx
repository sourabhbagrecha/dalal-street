import type { ClientGameState, ClientPlayerPublic } from '@monopoly-deal/shared';
import { playerBankTotal, playerDisplayName } from '../derivations';
import { useCurrency } from '../hooks/useCurrency';
import { PropertyMiniBar } from './PropertyMiniBar';

interface OpponentCardProps {
  player: ClientPlayerPublic;
  clientState: ClientGameState;
  seatIndex: number;
  showConnection?: boolean;
  onInspect?: (playerId: string, tab: 'properties' | 'bank') => void;
  isSelected?: boolean;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

export function OpponentCard({
  player,
  clientState,
  seatIndex,
  showConnection,
  onInspect,
  isSelected,
}: OpponentCardProps) {
  const { formatMoney } = useCurrency();
  const name = playerDisplayName(clientState, player, seatIndex);
  const bankTotal = playerBankTotal(player);
  const initials = initialsFromName(name);
  const hasInspect = Boolean(onInspect);

  return (
    <div
      className={`opponent-card${showConnection && !player.connected ? ' opponent-card--disconnected' : ''}${isSelected ? ' opponent-card--selected' : ''}${hasInspect ? ' opponent-card--inspectable' : ''}`}
    >
      <div className="opponent-card__header">
        <div className="opponent-card__avatar" aria-hidden>
          {initials}
        </div>
        <div className="opponent-card__meta">
          <span className="opponent-card__name">{name}</span>
          {showConnection && !player.connected && (
            <span className="opponent-card__disconnected" data-testid="disconnected-badge">
              Disconnected
            </span>
          )}
        </div>
        <div className="opponent-card__hand" aria-label={`${player.handCount} cards in hand`}>
          <span className="opponent-card__hand-cards" aria-hidden>
            <i />
            <i />
          </span>
          <span className="opponent-card__hand-num">{player.handCount}</span>
        </div>
      </div>

      <button
        type="button"
        className="opponent-card__sets opponent-card__sets--clickable"
        onClick={() => onInspect?.(player.id, 'properties')}
        aria-label={`View ${name}'s properties, ${player.board.sets.length} sets`}
        data-testid={`opponent-sets-${player.id}`}
      >
        {player.board.sets.length === 0 ? (
          <span className="opponent-card__no-sets">No properties</span>
        ) : (
          player.board.sets.map((set) => <PropertyMiniBar key={set.id} set={set} />)
        )}
        {hasInspect && <span className="opponent-card__inspect-hint" aria-hidden>▸</span>}
      </button>

      <button
        type="button"
        className="opponent-card__footer opponent-card__footer--clickable"
        onClick={() => onInspect?.(player.id, 'bank')}
        aria-label={`View ${name}'s bank, ${formatMoney(bankTotal)} in ${player.board.bank.length} cards`}
        data-testid={`opponent-bank-${player.id}`}
      >
        <span className="opponent-card__bank-label">BANK</span>
        <span className="opponent-card__bank">
          {formatMoney(bankTotal)} · {player.board.bank.length}
          <span className="opponent-card__bank-unit"> cards</span>
        </span>
        {hasInspect && <span className="opponent-card__inspect-hint" aria-hidden>▸</span>}
      </button>
    </div>
  );
}
