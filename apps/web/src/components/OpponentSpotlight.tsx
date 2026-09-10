import { useCallback, useEffect, useState } from 'react';
import type { ClientGameState, ClientPlayerPublic } from '@monopoly-deal/shared';
import { MAX_PLAYS } from '@monopoly-deal/shared';
import { nameFor, opponentsOfClient } from '../derivations';
import { formatCountdown, useCountdown } from '../hooks/useCountdown';
import { useAttentionFor, useBankAttention } from '../moments/useAttention';
import { CashPile } from './CashPile';
import { OpponentInspectModal } from './OpponentInspectModal';
import { PlayerAvatar } from './PlayerAvatar';
import { PropertySetView } from './PropertySetView';

interface OpponentSpotlightProps {
  clientState: ClientGameState;
  activeOpponent: ClientPlayerPublic;
  showConnection?: boolean;
}

interface OpponentPeerChipProps {
  player: ClientPlayerPublic;
  name: string;
  showConnection?: boolean;
  isSelected: boolean;
  onInspect: (playerId: string) => void;
}

function OpponentPeerChip({ player, name, showConnection, isSelected, onInspect }: OpponentPeerChipProps) {
  const className = `opponent-peer attn-host${showConnection && !player.connected ? ' opponent-peer--disconnected' : ''}${isSelected ? ' opponent-peer--selected' : ''}`;
  const attention = useAttentionFor(player.id);
  return (
    <button
      type="button"
      className={className}
      onClick={() => onInspect(player.id)}
      aria-label={`View ${name}: ${player.handCount} cards in hand`}
      data-testid={`opponent-peer-${player.id}`}
      data-attention={attention ?? undefined}
    >
      <PlayerAvatar name={name} className="opponent-peer__avatar avatar" />
      <span className="opponent-peer__hand">{player.handCount}</span>
    </button>
  );
}

export function OpponentSpotlight({ clientState, activeOpponent, showConnection }: OpponentSpotlightProps) {
  const [inspectedId, setInspectedId] = useState<string | null>(null);

  const peers = opponentsOfClient(clientState).filter((p) => p.id !== activeOpponent.id);
  const name = nameFor(clientState, activeOpponent.id);
  const attention = useAttentionFor(activeOpponent.id);
  const bankAttention = useBankAttention(activeOpponent.id);

  const turnRemaining = useCountdown(clientState.deadlines?.turnMs);
  const pendingRemaining = useCountdown(clientState.deadlines?.pendingMs);
  const timerMs = pendingRemaining ?? turnRemaining;
  const timerPct = timerMs === null ? 0 : Math.max(0, Math.min(1, timerMs / 60_000));

  const handleInspect = useCallback((playerId: string) => setInspectedId(playerId), []);
  const handleClose = useCallback(() => setInspectedId(null), []);

  // The newly-active player shouldn't be simultaneously spotlit and inspected.
  useEffect(() => {
    setInspectedId((current) => (current === activeOpponent.id ? null : current));
  }, [activeOpponent.id]);

  const inspectedPlayer = inspectedId
    ? opponentsOfClient(clientState).find((p) => p.id === inspectedId) ?? null
    : null;

  return (
    <>
      <section className="opponent-spotlight" aria-label="Current opponent's turn">
        {peers.length > 0 && (
          <div className="opponent-spotlight__peers">
            {peers.map((peer) => (
              <OpponentPeerChip
                key={peer.id}
                player={peer}
                name={nameFor(clientState, peer.id)}
                showConnection={showConnection}
                isSelected={inspectedId === peer.id}
                onInspect={handleInspect}
              />
            ))}
          </div>
        )}

        <div
          className="opponent-spotlight__stage attn-host"
          key={activeOpponent.id}
          data-testid="opponent-spotlight"
          data-attention={attention ?? undefined}
        >
          <div className="opponent-spotlight__header">
            <PlayerAvatar name={name} className="opponent-spotlight__avatar avatar" />
            <div className="opponent-spotlight__meta">
              <span className="opponent-spotlight__name">{name}&apos;s turn</span>
              <span className="opponent-spotlight__sub">
                {activeOpponent.handCount} in hand
                {showConnection && !activeOpponent.connected ? ' · disconnected' : ''}
              </span>
            </div>
            <div
              className="opponent-spotlight__plays"
              aria-label={`${clientState.playsRemaining} plays remaining`}
            >
              {Array.from({ length: MAX_PLAYS }, (_, i) => (
                <span
                  key={i}
                  className={`play-dot${i < clientState.playsRemaining ? ' play-dot--remaining' : ' play-dot--used'}`}
                />
              ))}
            </div>
            <div className="opponent-spotlight__timer" aria-hidden>
              <span
                className="opponent-spotlight__timer-ring"
                style={{ '--timer-pct': timerPct } as React.CSSProperties}
              />
              <span className="opponent-spotlight__timer-text">{formatCountdown(timerMs)}</span>
            </div>
          </div>

          <div className="opponent-spotlight__sets" data-testid="opponent-spotlight-sets">
            <CashPile
              cards={activeOpponent.board.bank}
              attention={bankAttention}
              ariaLabel={`${name}'s bank`}
              testId={`bank-drop-${activeOpponent.id}`}
            />
            {activeOpponent.board.sets.length === 0 ? (
              <p className="opponent-spotlight__empty empty-note">No property sets yet</p>
            ) : (
              activeOpponent.board.sets.map((set) => (
                <PropertySetView key={set.id} set={set} canDrag={false} />
              ))
            )}
          </div>
        </div>
      </section>
      {inspectedPlayer && (
        <OpponentInspectModal
          player={inspectedPlayer}
          clientState={clientState}
          onClose={handleClose}
        />
      )}
    </>
  );
}
