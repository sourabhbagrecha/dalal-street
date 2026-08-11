import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientGameState, ClientPlayerSelf } from '@monopoly-deal/shared';
import { isDiscardExcessMode, readDraggedCardId } from '../legality';
import { useCurrency } from '../hooks/useCurrency';
import { useIsPhoneBoard } from '../hooks/useIsPhoneBoard';
import { useGameStore } from '../store';
import { PlayingCard } from './PlayingCard';

interface BankPanelProps {
  player: ClientPlayerSelf;
  clientState: ClientGameState;
  highlight: boolean;
  dim?: boolean;
  shake?: boolean;
}

/** How long a finger must rest on the bank pill before the sheet opens. */
const HOLD_MS = 350;

export function BankPanel({ player, clientState, highlight, dim, shake }: BankPanelProps) {
  const { formatMoney } = useCurrency();
  const playCard = useGameStore((api) => api.playCard);
  const rejectLocal = useGameStore((api) => api.rejectLocal);
  const pickPlayCommandFn = useGameStore((api) => api.pickPlayCommand);
  const phone = useIsPhoneBoard();
  const [sheetOpen, setSheetOpen] = useState(false);
  const total = player.board.bank.reduce((sum, card) => sum + card.value, 0);

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

  // Leaving the phone layout (rotation, or a tablet resize) must not strand the
  // sheet on screen, since the full bank is visible again on the desktop board.
  useEffect(() => {
    if (!phone) setSheetOpen(false);
  }, [phone]);

  if (phone) {
    return (
      <BankPill
        cards={player.board.bank}
        total={total}
        formatMoney={formatMoney}
        highlight={highlight}
        dim={dim}
        shake={shake}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />
    );
  }

  return (
    <section
      className={`bank-panel drop-zone${highlight ? ' drop-zone--active' : ''}${dim ? ' drop-zone--dim' : ''}${shake ? ' drop-zone--shake' : ''}`}
      aria-label="Your bank"
      data-testid="bank-drop"
      data-drop-zone="bank"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
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
      <div className="bank-panel__total" data-testid="bank-total">
        {formatMoney(total)}
      </div>
    </section>
  );
}

interface BankPillProps {
  cards: ClientPlayerSelf['board']['bank'];
  total: number;
  formatMoney: (value: number) => string;
  highlight: boolean;
  dim?: boolean;
  shake?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

/**
 * Phone bank: a total-only pill floating over the properties, plus a sheet with
 * the notes themselves.
 *
 * A phone board is ~390px wide, and the desktop layout spent a quarter of that
 * on a column of money cards whose only decision-relevant number is their sum —
 * the properties are what the player actually reads and drops onto. So the notes
 * move behind a tap (or a hold, which is the gesture a player already has their
 * thumb primed for after long-pressing a card), and the width goes to the sets.
 *
 * The pill stays the bank's drop zone: it carries the same `data-drop-zone`
 * and `data-testid` the panel does, so the touch drag polyfill's synthesized
 * drop events land here with no special-casing.
 */
function BankPill({
  cards,
  total,
  formatMoney,
  highlight,
  dim,
  shake,
  open,
  onOpenChange,
  onDragOver,
  onDrop,
}: BankPillProps) {
  const holdTimer = useRef<number | null>(null);
  // A hold that already opened the sheet must not be toggled shut by the click
  // the same press emits on lift-off.
  const openedByHold = useRef(false);

  const clearHold = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  useEffect(() => clearHold, [clearHold]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' || open) return;
      openedByHold.current = false;
      clearHold();
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        openedByHold.current = true;
        navigator.vibrate?.(10);
        onOpenChange(true);
      }, HOLD_MS);
    },
    [clearHold, onOpenChange, open],
  );

  const onClick = useCallback(() => {
    if (openedByHold.current) {
      openedByHold.current = false;
      return;
    }
    onOpenChange(!open);
  }, [onOpenChange, open]);

  return (
    <>
      <section
        className={`bank-pill drop-zone${highlight ? ' drop-zone--active bank-pill--drop' : ''}${dim ? ' drop-zone--dim' : ''}${shake ? ' drop-zone--shake' : ''}`}
        aria-label="Your bank"
        data-testid="bank-drop"
        data-drop-zone="bank"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <button
          type="button"
          className="bank-pill__btn"
          aria-expanded={open}
          aria-label={`Your bank, ${formatMoney(total)} across ${cards.length} card${cards.length === 1 ? '' : 's'}. Tap or hold to view.`}
          onPointerDown={onPointerDown}
          onPointerUp={clearHold}
          onPointerCancel={clearHold}
          onPointerLeave={clearHold}
          onClick={onClick}
        >
          <span className="bank-pill__label">BANK</span>
          <span className="bank-pill__total" data-testid="bank-total">
            {formatMoney(total)}
          </span>
          <span className="bank-pill__count" aria-hidden>
            {cards.length}
          </span>
        </button>
      </section>

      {open && (
        <div className="bank-sheet-layer">
          <button
            type="button"
            className="bank-sheet__backdrop"
            aria-label="Close bank"
            onClick={() => onOpenChange(false)}
          />
          <div className="bank-sheet" role="dialog" aria-label="Your bank" data-testid="bank-sheet">
            <div className="bank-sheet__header">
              <span className="bank-sheet__title">YOUR BANK</span>
              <span className="bank-sheet__total">{formatMoney(total)}</span>
              <button
                type="button"
                className="bank-sheet__close"
                aria-label="Close bank"
                onClick={() => onOpenChange(false)}
              >
                ✕
              </button>
            </div>
            <div className="bank-sheet__body">
              {cards.length === 0 ? (
                <p className="bank-sheet__empty">
                  Bank is empty — drag money or action cards onto the bank pill.
                </p>
              ) : (
                <div className="bank-sheet__cards">
                  {cards.map((card) => (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      size="md"
                      className="bank-sheet__card"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
