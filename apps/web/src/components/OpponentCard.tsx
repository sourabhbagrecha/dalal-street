import type { ClientGameState, ClientPlayerPublic } from '@monopoly-deal/shared';
import { nameFor, playerBankTotal } from '../derivations';
import { useCurrency } from '../hooks/useCurrency';
import { useAttentionFor, useBankAttention } from '../moments/useAttention';
import { PlayerAvatar } from './PlayerAvatar';
import { PropertyMiniBar } from './PropertyMiniBar';

interface OpponentCardProps {
  player: ClientPlayerPublic;
  clientState: ClientGameState;
  showConnection?: boolean;
  onInspect?: (playerId: string) => void;
  isSelected?: boolean;
}

export function OpponentCard({
  player,
  clientState,
  showConnection,
  onInspect,
  isSelected,
}: OpponentCardProps) {
  const { formatMoney } = useCurrency();
  const name = nameFor(clientState, player.id);
  const bankTotal = playerBankTotal(player);
  const hasInspect = Boolean(onInspect);
  const attention = useAttentionFor(player.id);
  const bankAttention = useBankAttention(player.id);

  const className = `opponent-card${showConnection && !player.connected ? ' opponent-card--disconnected' : ''}${isSelected ? ' opponent-card--selected' : ''}${hasInspect ? ' opponent-card--inspectable' : ''}`;

  const inner = (
    <>
      <div className="opponent-card__header">
        <PlayerAvatar name={name} className="opponent-card__avatar" />
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

      <div className="opponent-card__sets" data-testid={`opponent-sets-${player.id}`}>
        {player.board.sets.length === 0 ? (
          <span className="opponent-card__no-sets">No properties</span>
        ) : (
          player.board.sets.map((set) => <PropertyMiniBar key={set.id} set={set} />)
        )}
      </div>

      <div className="opponent-card__footer" data-testid={`opponent-bank-${player.id}`}>
        <span className="opponent-card__bank-label">BANK</span>
        <span className="opponent-card__bank" data-attention={bankAttention ?? undefined}>
          {formatMoney(bankTotal)} · {player.board.bank.length}
          <span className="opponent-card__bank-unit"> cards</span>
        </span>
        {hasInspect && <span className="opponent-card__inspect-hint" aria-hidden>▸</span>}
      </div>
    </>
  );

  if (!hasInspect) {
    return (
      <div className={className} data-testid={`opponent-card-${player.id}`} data-attention={attention ?? undefined}>
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => onInspect?.(player.id)}
      aria-label={`View ${name}: ${player.board.sets.length} sets, bank ${formatMoney(bankTotal)} in ${player.board.bank.length} cards`}
      data-testid={`opponent-card-${player.id}`}
      data-attention={attention ?? undefined}
    >
      {inner}
    </button>
  );
}
