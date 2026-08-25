import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  Card,
  ClientGameState,
  ClientPendingInteraction,
  Command,
  PropertyColor,
  PropertySet,
} from '@monopoly-deal/shared';
import { HAND_LIMIT } from '@monopoly-deal/shared';
import { allPlayers, cardTitle, findPlayerById, nameFor } from '../derivations';
import { useCurrency } from '../hooks/useCurrency';
import { useGameStore } from '../store';
import type { WastedPlayReason } from '../store/types';
import { theme } from '../theme';
import { PlayingCard } from './PlayingCard';

interface GamePromptsProps {
  clientState: ClientGameState;
  discardSelection: string[];
  onDiscardSelect: (cardId: string) => void;
  onClearDiscardSelection: () => void;
}

/** Human labels for the engine's internal payment-reason slugs (e.g. "debt_collector"). */
const REASON_LABELS: Record<string, string> = {
  rent: 'Rent',
  debt_collector: 'Debt Collector',
  birthday: "It's My Birthday",
};

function reasonLabel(reason: string): string {
  return (
    REASON_LABELS[reason] ??
    reason
      .split('_')
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(' ')
  );
}

function pendingForLocal(
  state: ClientGameState,
  localPlayerId: string,
): ClientPendingInteraction | undefined {
  const top = state.pendingStack[state.pendingStack.length - 1];
  if (!top) return undefined;

  switch (top.kind) {
    case 'payment':
      return top.payerId === localPlayerId ? top : undefined;
    case 'just_say_no':
      return top.respondentId === localPlayerId ? top : undefined;
    case 'hand_limit_discard':
      return top.playerId === localPlayerId ? top : undefined;
    case 'rent_color_choice':
    case 'rent_player_choice':
    case 'debt_collector_target':
    case 'sly_deal_target':
    case 'forced_deal_target':
    case 'deal_breaker_target':
    case 'house_hotel_target':
      return top.actorId === localPlayerId ? top : undefined;
    default:
      return undefined;
  }
}

export function GamePrompts({
  clientState,
  discardSelection,
  onDiscardSelect,
  onClearDiscardSelection,
}: GamePromptsProps) {
  const send = useGameStore((api) => api.send);
  const localPlayerId = clientState.viewerId;
  const topPending = clientState.pendingStack[clientState.pendingStack.length - 1];

  if (topPending?.kind === 'payment_round') {
    return <PaymentRoundPrompts clientState={clientState} round={topPending} send={send} />;
  }

  const pending = pendingForLocal(clientState, localPlayerId);

  if (!pending) {
    // Single-target charge (Debt Collector, a single-payer rent) — the payer gets
    // the interactive PaymentPrompt above via pendingForLocal; everyone else
    // (the charger included) used to see nothing at all while it was outstanding.
    // Mirror the payment_round path: show a waiting/status view instead.
    if (topPending?.kind === 'payment' && topPending.payerId !== localPlayerId) {
      return <SinglePaymentStatus clientState={clientState} pending={topPending} />;
    }
    return null;
  }

  switch (pending.kind) {
    case 'hand_limit_discard':
      return (
        <HandLimitPrompt
          excess={pending.excess}
          selected={discardSelection}
          canResume={clientState.playsRemaining > 0}
          onSelect={onDiscardSelect}
          onClear={onClearDiscardSelection}
          onConfirm={() => {
            send({
              type: 'DISCARD_EXCESS',
              playerId: localPlayerId,
              cardIds: discardSelection,
            });
            onClearDiscardSelection();
          }}
          onResume={() => {
            send({ type: 'RESUME_PLAY', playerId: localPlayerId });
            onClearDiscardSelection();
          }}
        />
      );
    case 'rent_color_choice':
      return (
        <RentColorPrompt
          colors={pending.eligibleColors}
          onPick={(color) =>
            send({ type: 'SELECT_RENT_COLOR', playerId: localPlayerId, color })
          }
        />
      );
    case 'rent_player_choice':
      return (
        <RentPlayerPrompt
          clientState={clientState}
          actorId={pending.actorId}
          amount={pending.amount}
          color={pending.color}
          onPick={(targetPlayerId) =>
            send({ type: 'SELECT_RENT_PLAYER', playerId: localPlayerId, targetPlayerId })
          }
        />
      );
    case 'debt_collector_target':
      return (
        <DebtCollectorPrompt
          clientState={clientState}
          actorId={pending.actorId}
          onPick={(targetPlayerId) =>
            send({ type: 'SELECT_DEBT_COLLECTOR_PLAYER', playerId: localPlayerId, targetPlayerId })
          }
        />
      );
    case 'payment':
      return (
        <PaymentPrompt
          clientState={clientState}
          payerId={pending.payerId}
          payeeId={pending.payeeId}
          amountDue={pending.amountDue}
          reason={pending.reason}
          onPay={(cardIds) =>
            send({ type: 'SELECT_PAYMENT', playerId: localPlayerId, cardIds })
          }
        />
      );
    case 'just_say_no':
      return (
        <JustSayNoPrompt
          clientState={clientState}
          respondentId={pending.respondentId}
          initiatorId={pending.initiatorId}
          onPlay={(cardId) =>
            send({ type: 'RESPOND_JUST_SAY_NO', playerId: localPlayerId, cardId })
          }
          onDecline={() => send({ type: 'DECLINE_JUST_SAY_NO', playerId: localPlayerId })}
        />
      );
    case 'sly_deal_target':
      return (
        <StealTargetPrompt
          clientState={clientState}
          actorId={pending.actorId}
          onPick={(targetCardId) =>
            send({
              type: 'SELECT_STEAL_TARGET',
              playerId: localPlayerId,
              targetCardId,
            })
          }
          onCancel={() => send({ type: 'AUTO_RESOLVE_PENDING', playerId: localPlayerId })}
        />
      );
    case 'forced_deal_target':
      return (
        <ForcedDealPrompt
          clientState={clientState}
          actorId={pending.actorId}
          onPick={(targetCardId, ownCardId) =>
            send({
              type: 'SELECT_STEAL_TARGET',
              playerId: localPlayerId,
              targetCardId,
              ownCardId,
            })
          }
          onCancel={() => send({ type: 'AUTO_RESOLVE_PENDING', playerId: localPlayerId })}
        />
      );
    case 'deal_breaker_target':
      return (
        <DealBreakerPrompt
          clientState={clientState}
          actorId={pending.actorId}
          onPick={(targetSetId) =>
            send({
              type: 'SELECT_STEAL_TARGET',
              playerId: localPlayerId,
              targetSetId,
            })
          }
          onCancel={() => send({ type: 'AUTO_RESOLVE_PENDING', playerId: localPlayerId })}
        />
      );
    case 'house_hotel_target':
      return (
        <BuildingPrompt
          clientState={clientState}
          actorId={pending.actorId}
          building={pending.building}
          onPick={(setId) =>
            send({ type: 'SELECT_BUILDING_SET', playerId: localPlayerId, setId })
          }
        />
      );
    default:
      return null;
  }
}

function PaymentRoundPrompts({
  clientState,
  round,
  send,
}: {
  clientState: ClientGameState;
  round: Extract<ClientPendingInteraction, { kind: 'payment_round' }>;
  send: (command: Command) => void;
}) {
  // Every payer's JSN/payment prompt renders unconditionally, to every
  // viewer — not just "your own" entry. That used to be the whole design
  // (see git history pre-dating the mobile UX rework): a payer's bank and
  // property cards are public table info in Monopoly Deal, so there's no
  // secrecy reason to hide another payer's payment sheet from the charger,
  // and the local pass-and-play table needs it to let the seated device act
  // for whichever payer is up without a seat switch. This is also what
  // restores the regressed `payment-prompt-<playerId>` / `confirm-payment-
  // btn-<playerId>` elements the specs (and the audit's "charger can't tell
  // who's paid" finding) expect.
  const jsnEntries = round.entries.filter((e) => e.phase === 'jsn' && e.jsn);
  const paymentEntries = round.entries.filter((e) => e.phase === 'payment');
  // Entries that have already resolved (paid in full, or excused because
  // they had nothing to pay with) — surfaced as a compact status list so a
  // payer's sheet doesn't just vanish with no confirmation once they're done.
  const settledEntries = round.entries.filter((e) => e.phase === 'done' || e.phase === 'skipped');

  if (jsnEntries.length === 0 && paymentEntries.length === 0 && settledEntries.length === 0) {
    return null;
  }

  return (
    <div className="game-prompts-stack" data-testid="payment-round-prompts">
      {jsnEntries.map((entry) => (
        <JustSayNoPrompt
          key={`jsn-${entry.payerId}`}
          clientState={clientState}
          respondentId={entry.jsn!.respondentId}
          initiatorId={entry.jsn!.initiatorId}
          testId={`jsn-prompt-${entry.payerId}`}
          declineTestId={`jsn-decline-btn-${entry.payerId}`}
          onPlay={(cardId) =>
            send({ type: 'RESPOND_JUST_SAY_NO', playerId: entry.jsn!.respondentId, cardId })
          }
          onDecline={() =>
            send({ type: 'DECLINE_JUST_SAY_NO', playerId: entry.jsn!.respondentId })
          }
        />
      ))}
      {paymentEntries.map((entry) => (
        <PaymentPrompt
          key={`pay-${entry.payerId}`}
          clientState={clientState}
          payerId={entry.payerId}
          payeeId={round.payeeId}
          amountDue={entry.amountDue}
          reason={round.reason}
          testId={`payment-prompt-${entry.payerId}`}
          confirmTestId={`confirm-payment-btn-${entry.payerId}`}
          onPay={(cardIds) =>
            send({ type: 'SELECT_PAYMENT', playerId: entry.payerId, cardIds })
          }
        />
      ))}
      {settledEntries.length > 0 && (
        <PaymentRoundStatus clientState={clientState} entries={settledEntries} />
      )}
    </div>
  );
}

/**
 * Compact "who's already settled" list for a payment round — payers who have
 * paid in full or were excused for having nothing to pay with. Without this,
 * a payer's sheet just disappears the moment they confirm, with nothing to
 * confirm it happened (the audit's "charger can't tell who's paid" finding).
 * Each row keeps the `data-testid="payment-prompt-<playerId>"` pattern so
 * every payer has a findable element for the whole lifetime of the round.
 */
function PaymentRoundStatus({
  clientState,
  entries,
}: {
  clientState: ClientGameState;
  entries: Extract<ClientPendingInteraction, { kind: 'payment_round' }>['entries'];
}) {
  return (
    <PromptShell title="Already settled" testId="payment-round-status">
      {entries.map((entry) => (
        <p
          key={`pay-status-${entry.payerId}`}
          className="game-prompt__hint"
          data-testid={`payment-prompt-${entry.payerId}`}
        >
          {entry.phase === 'done'
            ? `${nameFor(clientState, entry.payerId)} has paid.`
            : `${nameFor(clientState, entry.payerId)} had nothing to pay with — skipped.`}
        </p>
      ))}
    </PromptShell>
  );
}

function PromptShell({
  title,
  children,
  testId,
  placement = 'bottom',
  onCancel,
  cancelTestId,
}: {
  title: string;
  children: React.ReactNode;
  testId: string;
  /**
   * Which edge the prompt sticks to once it becomes a sheet on a phone. Ignored
   * on a wide board, where every prompt is centred over the table.
   *
   * Every prompt sits at the bottom, in easy thumb reach — including the
   * hand-limit discard: it used to dock to the top (the thing it asks you to
   * tap *is* the hand), but that covered the turn banner and blocked the FEED
   * button underneath it (C4/C5). `top` is kept only in case a future prompt
   * genuinely needs it; nothing currently uses it.
   */
  placement?: 'top' | 'bottom';
  /**
   * When set, renders a Cancel button in the header and wires Escape to the
   * same handler. Only pass this for sheets where backing out is legitimate —
   * the targeting family (Sly Deal / Forced Deal / Deal Breaker). Sheets that
   * must not be dismissed (hand-limit discard, a payment you owe) must not
   * receive this prop.
   */
  onCancel?: () => void;
  cancelTestId?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus into the sheet on open, restore whatever had focus before once
  // it closes/unmounts — basic modal-dialog a11y (C7).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!onCancel) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className={`game-prompt game-prompt--${placement}`}
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={dialogRef}
    >
      <div className="game-prompt__header">
        <h3 className="game-prompt__title" id={titleId}>
          {title}
        </h3>
        {onCancel && (
          <button
            type="button"
            className="prompt-btn game-prompt__cancel"
            data-testid={cancelTestId ?? 'prompt-cancel-btn'}
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
      <div className="game-prompt__body">{children}</div>
    </div>
  );
}

function HandLimitPrompt({
  excess,
  selected,
  canResume,
  onClear,
  onConfirm,
  onResume,
}: {
  excess: number;
  selected: string[];
  canResume: boolean;
  onSelect: (cardId: string) => void;
  onClear: () => void;
  onConfirm: () => void;
  onResume: () => void;
}) {
  const ready = selected.length === excess;

  return (
    <PromptShell
      title={`Discard ${excess} card${excess === 1 ? '' : 's'}`}
      testId="hand-limit-prompt"
    >
      <p className="game-prompt__hint">
        Hands are capped at {HAND_LIMIT} — tap cards or drag them onto the discard pile. Selected{' '}
        {selected.length} / {excess}
      </p>
      <div className="game-prompt__actions">
        <button type="button" className="prompt-btn" onClick={onClear} disabled={selected.length === 0}>
          Clear
        </button>
        <button
          type="button"
          className="prompt-btn prompt-btn--primary"
          data-testid="confirm-discard-btn"
          disabled={!ready}
          onClick={onConfirm}
        >
          Confirm discard
        </button>
        {canResume && (
          <button
            type="button"
            className="prompt-btn"
            data-testid="resume-play-btn"
            onClick={onResume}
          >
            Play instead
          </button>
        )}
      </div>
      <p className="game-prompt__hint game-prompt__hint--small">
        Selected: {selected.length > 0 ? selected.join(', ') : 'none'}
      </p>
    </PromptShell>
  );
}

function RentColorPrompt({
  colors,
  onPick,
}: {
  colors: PropertyColor[];
  onPick: (color: PropertyColor) => void;
}) {
  return (
    <PromptShell title="Choose rent color" testId="rent-color-prompt">
      <div className="game-prompt__choices">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            className="prompt-choice"
            data-testid={`rent-color-${color}`}
            style={{ background: theme.propertyColors[color] }}
            onClick={() => onPick(color)}
          >
            {theme.propertyNames[color] ?? color}
          </button>
        ))}
      </div>
    </PromptShell>
  );
}

function RentPlayerPrompt({
  clientState,
  actorId,
  amount,
  color,
  onPick,
}: {
  clientState: ClientGameState;
  actorId: string;
  amount: number;
  color: PropertyColor;
  onPick: (targetPlayerId: string) => void;
}) {
  const { formatMoney } = useCurrency();
  const colorName = theme.propertyNames[color] ?? color;
  return (
    <PromptShell title="Choose who pays rent" testId="rent-player-prompt">
      <p className="game-prompt__hint">
        {colorName} rent — {formatMoney(amount)}
      </p>
      <div className="game-prompt__choices">
        {allPlayers(clientState)
          .filter((p) => p.id !== actorId)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              className="prompt-choice prompt-choice--player"
              data-testid={`rent-player-${p.id}`}
              onClick={() => onPick(p.id)}
            >
              {nameFor(clientState, p.id)}
            </button>
          ))}
      </div>
    </PromptShell>
  );
}

function DebtCollectorPrompt({
  clientState,
  actorId,
  onPick,
}: {
  clientState: ClientGameState;
  actorId: string;
  onPick: (targetPlayerId: string) => void;
}) {
  const { formatMoney } = useCurrency();
  return (
    <PromptShell title={`Choose who pays ${formatMoney(5)}`} testId="debt-collector-prompt">
      <p className="game-prompt__hint">Debt Collector — pick one rival to pay you {formatMoney(5)}.</p>
      <div className="game-prompt__choices">
        {allPlayers(clientState)
          .filter((p) => p.id !== actorId)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              className="prompt-choice prompt-choice--player"
              data-testid={`debt-collector-player-${p.id}`}
              onClick={() => onPick(p.id)}
            >
              {nameFor(clientState, p.id)}
            </button>
          ))}
      </div>
    </PromptShell>
  );
}

function PaymentPrompt({
  clientState,
  payerId,
  payeeId,
  amountDue,
  reason,
  onPay,
  testId = 'payment-prompt',
  confirmTestId = 'confirm-payment-btn',
}: {
  clientState: ClientGameState;
  payerId: string;
  payeeId: string;
  amountDue: number;
  reason: string;
  onPay: (cardIds: string[]) => void;
  testId?: string;
  confirmTestId?: string;
}) {
  const { formatMoney } = useCurrency();
  const validatePayment = useGameStore((api) => api.validatePayment);
  const isCompleteSetFn = useGameStore((api) => api.isCompleteSet);
  // Honest lookup — an id that doesn't resolve must never silently render as
  // the viewer's own board (that was the "You owes ₹2Cr to You" class of bug).
  // Every hook below still has to run unconditionally, so the actual bail-out
  // happens after them, right before the JSX return.
  const payer = findPlayerById(clientState, payerId);
  const [selected, setSelected] = useState<string[]>([]);

  const payableCards = useMemo(() => {
    if (!payer) return [];
    const cards: { id: string; card: Card; setId?: string }[] = [];
    for (const c of payer.board.bank) {
      cards.push({ id: c.id, card: c });
    }
    for (const set of payer.board.sets) {
      for (const c of set.cards) {
        cards.push({ id: c.id, card: c, setId: set.id });
      }
      if (set.house) cards.push({ id: set.house.id, card: set.house, setId: set.id });
      if (set.hotel) cards.push({ id: set.hotel.id, card: set.hotel, setId: set.id });
    }
    return cards;
  }, [payer]);

  const selectedValue = useMemo(() => {
    let total = 0;
    for (const id of selected) {
      const entry = payableCards.find((c) => c.id === id);
      if (entry) total += entry.card.value;
    }
    return total;
  }, [selected, payableCards]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const canConfirm = useMemo(
    () => validatePayment(payerId, amountDue, selected),
    [validatePayment, payerId, amountDue, selected],
  );

  const overpaidBy = selectedValue - amountDue;

  // Unreachable in practice — payerId always comes from the engine's own
  // pending state — but never render an unresolved id as if it were the
  // viewer's own board.
  if (!payer) return null;

  return (
    <PromptShell
      title={`${nameFor(clientState, payerId)} — pay ${formatMoney(amountDue)}`}
      testId={testId}
    >
      <p className="game-prompt__hint">
        {reasonLabel(reason)} owed to {nameFor(clientState, payeeId)}. Select at least{' '}
        {formatMoney(amountDue)} in cards.
      </p>
      <div className="payment-prompt__cards">
        {payableCards.map(({ id, card, setId }) => {
          const set = setId ? payer.board.sets.find((s: PropertySet) => s.id === setId) : undefined;
          const breaksSet =
            set && isCompleteSetFn(set) && set.cards.some((c: Card) => c.id === id);
          return (
            <button
              key={id}
              type="button"
              className={`payment-card-btn${selected.includes(id) ? ' payment-card-btn--selected' : ''}${breaksSet ? ' payment-card-btn--breaks-set' : ''}`}
              data-testid={`payment-card-${id}`}
              onClick={() => toggle(id)}
            >
              <PlayingCard card={card} />
              {breaksSet && <span className="payment-card-btn__warn">Breaks set</span>}
            </button>
          );
        })}
      </div>
      <p className="game-prompt__hint game-prompt__hint--small">
        Selected: {formatMoney(selectedValue)}
      </p>
      {overpaidBy > 0 && (
        <p
          className="game-prompt__hint game-prompt__hint--warn"
          data-testid="payment-overpay-warning"
        >
          That's {formatMoney(overpaidBy)} more than you owe — there's no change in Monopoly
          Deal, so the extra is gone for good.
        </p>
      )}
      <button
        type="button"
        className="prompt-btn prompt-btn--primary"
        data-testid={confirmTestId}
        disabled={!canConfirm}
        onClick={() => onPay(selected)}
      >
        Confirm payment
      </button>
    </PromptShell>
  );
}

/**
 * Waiting/status view for a bare single-target `payment` pending (Debt
 * Collector, a single-payer rent) shown to everyone but the payer — the
 * payee/charger included. Mirrors PaymentRoundStatus so both payment paths
 * behave the same (audit E3): the charger used to see a fully idle board
 * while the payer chose cards.
 */
function SinglePaymentStatus({
  clientState,
  pending,
}: {
  clientState: ClientGameState;
  pending: Extract<ClientPendingInteraction, { kind: 'payment' }>;
}) {
  const { formatMoney } = useCurrency();
  return (
    <PromptShell title="Waiting on payment" testId="payment-prompt-status">
      <p
        className="game-prompt__hint"
        data-testid={`payment-prompt-${pending.payerId}`}
      >
        {nameFor(clientState, pending.payerId)} is choosing how to pay{' '}
        {formatMoney(pending.amountDue)} ({reasonLabel(pending.reason)}) to{' '}
        {nameFor(clientState, pending.payeeId)}…
      </p>
    </PromptShell>
  );
}

function JustSayNoPrompt({
  clientState,
  respondentId,
  initiatorId,
  onPlay,
  onDecline,
  testId = 'jsn-prompt',
  declineTestId = 'jsn-decline-btn',
}: {
  clientState: ClientGameState;
  respondentId: string;
  initiatorId: string;
  onPlay: (cardId: string) => void;
  onDecline: () => void;
  testId?: string;
  declineTestId?: string;
}) {
  const hand =
    respondentId === clientState.viewerId
      ? clientState.you.hand
      : [];
  const jsnCards = hand.filter((c) => c.kind === 'action' && c.action === 'just_say_no');

  return (
    <PromptShell title={`${nameFor(clientState, respondentId)} — Just Say No?`} testId={testId}>
      <p className="game-prompt__hint">
        {nameFor(clientState, initiatorId)} played an action against you. Counter with Just Say No or
        accept.
      </p>
      <div className="game-prompt__actions">
        {jsnCards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="prompt-btn prompt-btn--primary"
            data-testid={`jsn-play-${card.id}`}
            onClick={() => onPlay(card.id)}
          >
            Play Just Say No
          </button>
        ))}
        <button
          type="button"
          className="prompt-btn"
          data-testid={declineTestId}
          onClick={onDecline}
        >
          Accept
        </button>
      </div>
    </PromptShell>
  );
}

function StealTargetPrompt({
  clientState,
  actorId,
  onPick,
  onCancel,
}: {
  clientState: ClientGameState;
  actorId: string;
  onPick: (targetCardId: string) => void;
  onCancel: () => void;
}) {
  return (
    <PromptShell
      title="Sly Deal — pick a property"
      testId="steal-target-prompt"
      onCancel={onCancel}
      cancelTestId="steal-target-cancel-btn"
    >
      <StealOptions clientState={clientState} actorId={actorId} onPick={onPick} />
    </PromptShell>
  );
}

function ForcedDealPrompt({
  clientState,
  actorId,
  onPick,
  onCancel,
}: {
  clientState: ClientGameState;
  actorId: string;
  onPick: (targetCardId: string, ownCardId: string) => void;
  onCancel: () => void;
}) {
  const [ownCardId, setOwnCardId] = useState<string | null>(null);

  return (
    <PromptShell
      title="Forced Deal — swap properties"
      testId="forced-deal-prompt"
      onCancel={onCancel}
      cancelTestId="forced-deal-cancel-btn"
    >
      <p className="game-prompt__hint">First pick your property to give, then pick one to take.</p>
      <div className="game-prompt__section">
        <h4>Your property to give</h4>
        <StealOptions
          clientState={clientState}
          actorId={actorId}
          selfOnly
          selectedId={ownCardId}
          onPick={(id) => setOwnCardId(id)}
        />
      </div>
      {ownCardId && (
        <div className="game-prompt__section">
          <h4>Opponent property to take</h4>
          <StealOptions
            clientState={clientState}
            actorId={actorId}
            onPick={(targetCardId) => onPick(targetCardId, ownCardId)}
          />
        </div>
      )}
    </PromptShell>
  );
}

function StealOptions({
  clientState,
  actorId,
  selfOnly,
  selectedId,
  onPick,
}: {
  clientState: ClientGameState;
  actorId: string;
  selfOnly?: boolean;
  selectedId?: string | null;
  onPick: (cardId: string) => void;
}) {
  const stealableFn = useGameStore((api) => api.stealableProperties);
  const options = stealableFn(actorId, selfOnly);

  const renderCard = (card: Card) => (
    <button
      key={card.id}
      type="button"
      className={`steal-option${selectedId === card.id ? ' steal-option--selected' : ''}`}
      data-testid={`steal-card-${card.id}`}
      onClick={() => onPick(card.id)}
    >
      <PlayingCard card={card} />
      <span>{cardTitle(card)}</span>
    </button>
  );

  if (selfOnly) {
    return (
      <div className="steal-options">
        <div className="steal-options__cards">{options.map(({ card }) => renderCard(card))}</div>
      </div>
    );
  }

  return (
    <div className="steal-options">
      {options.length === 0 && (
        <p className="game-prompt__hint">No stealable properties on the table.</p>
      )}
      {allPlayers(clientState)
        .filter((p) => p.id !== actorId)
        .map((p) => {
          const playerCardIds = new Set(
            p.board.sets.flatMap((set) => [
              ...set.cards.map((c) => c.id),
              ...(set.house ? [set.house.id] : []),
              ...(set.hotel ? [set.hotel.id] : []),
            ]),
          );
          const playerOptions = options.filter(({ card }) => playerCardIds.has(card.id));
          if (playerOptions.length === 0) return null;
          return (
            <div key={p.id} className="steal-options__player">
              <span className="steal-options__name">{nameFor(clientState, p.id)}</span>
              <div className="steal-options__cards">
                {playerOptions.map(({ card }) => renderCard(card))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function DealBreakerPrompt({
  clientState,
  actorId,
  onPick,
  onCancel,
}: {
  clientState: ClientGameState;
  actorId: string;
  onPick: (targetSetId: string) => void;
  onCancel: () => void;
}) {
  const isCompleteSetFn = useGameStore((api) => api.isCompleteSet);

  return (
    <PromptShell
      title="Deal Breaker — steal a complete set"
      testId="deal-breaker-prompt"
      onCancel={onCancel}
      cancelTestId="deal-breaker-cancel-btn"
    >
      <div className="steal-options">
        {allPlayers(clientState)
          .filter((p) => p.id !== actorId)
          .map((p) => {
            const complete = p.board.sets.filter((set: PropertySet) => isCompleteSetFn(set));
            if (complete.length === 0) return null;
            return (
              <div key={p.id} className="steal-options__player">
                <span className="steal-options__name">{nameFor(clientState, p.id)}</span>
                <div className="steal-options__cards">
                  {complete.map((set) => (
                    <button
                      key={set.id}
                      type="button"
                      className="steal-option"
                      data-testid={`deal-breaker-set-${set.id}`}
                      onClick={() => onPick(set.id)}
                    >
                      {theme.propertyNames[set.color]} ({set.cards.length})
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </PromptShell>
  );
}

function BuildingPrompt({
  clientState,
  actorId,
  building,
  onPick,
}: {
  clientState: ClientGameState;
  actorId: string;
  building: 'house' | 'hotel';
  onPick: (setId: string) => void;
}) {
  const isCompleteSetFn = useGameStore((api) => api.isCompleteSet);
  // Honest lookup (see PaymentPrompt above) — actorId always comes from the
  // engine's own pending state, so this should be unreachable in practice.
  const actor = findPlayerById(clientState, actorId);
  const label = building === 'house' ? 'House' : 'Hotel';

  if (!actor) return null;

  return (
    <PromptShell title={`Place ${label} on a complete set`} testId="building-prompt">
      <div className="game-prompt__choices">
        {actor.board.sets
          .filter(
            (set: PropertySet) =>
              isCompleteSetFn(set) && (building === 'house' ? !set.house : !set.hotel),
          )
          .map((set: PropertySet) => (
            <button
              key={set.id}
              type="button"
              className="prompt-choice"
              data-testid={`building-set-${set.id}`}
              style={{ background: theme.propertyColors[set.color] }}
              onClick={() => onPick(set.id)}
            >
              {theme.propertyNames[set.color]} — {label}
            </button>
          ))}
      </div>
    </PromptShell>
  );
}

export function useDiscardSelection(excess: number | null) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = useCallback(
    (cardId: string) => {
      setSelected((prev) => {
        if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
        if (excess !== null && prev.length >= excess) return prev;
        return [...prev, cardId];
      });
    },
    [excess],
  );

  const clear = useCallback(() => setSelected([]), []);

  return { selected, toggle, clear, setSelected };
}

/**
 * Copy for every way a discard-pile play can be a no-op. Deliberately phrased
 * as "what you get" rather than "what is illegal" — none of these are illegal,
 * they just burn the card and one of the three plays for nothing.
 */
function wastedPlayCopy(reason: WastedPlayReason): string {
  switch (reason.kind) {
    case 'rent_no_colors':
      return "You don't have any properties in this rent card's colours, so nobody would owe you anything.";
    case 'sly_deal_no_targets':
      return 'No opponent has a property you could steal — every property they own is locked in a completed set.';
    case 'forced_deal_no_own':
      return 'You have no property to trade away — a Forced Deal cannot pull a card out of a completed set.';
    case 'forced_deal_no_targets':
      return 'No opponent has a property you could swap for — every property they own is locked in a completed set.';
    case 'deal_breaker_no_sets':
      return 'No opponent has a completed set, so there is nothing for Deal Breaker to take.';
    case 'building_no_set':
      return reason.building === 'house'
        ? 'You have no completed set that can take a house yet (railroads and utilities never can).'
        : 'You have no completed set with a house on it, so a hotel has nowhere to go.';
    case 'double_rent_no_rent':
      return 'You have no rent card that could charge anyone, so there is no rent to double.';
    case 'double_rent_no_plays':
      return 'This is your last play of the turn — you would have none left to play the rent card it doubles.';
    case 'nobody_can_pay':
      return 'No opponent has a single card in their bank or on their board, so nobody can pay you.';
  }
}

/**
 * A House/Hotel dropped on the cash pile is ambiguous — it's held there
 * until the player says which they meant. Choosing "Build" still leads into
 * BuildingPrompt for the set choice; this only decides cash vs. building.
 */
export function BuildingChoicePrompt({
  card,
  onConfirmCash,
  onConfirmBuild,
  onCancel,
}: {
  card: Card;
  onConfirmCash: () => void;
  onConfirmBuild: () => void;
  onCancel: () => void;
}) {
  return (
    <PromptShell title={`${cardTitle(card)} — cash or building?`} testId="building-choice-prompt">
      <p className="game-prompt__hint">
        Add it to your bank as cash, or use it to build on a completed set?
      </p>
      <div className="game-prompt__actions">
        <button
          type="button"
          className="prompt-btn"
          data-testid="building-choice-cancel-btn"
          onClick={onCancel}
        >
          Undo
        </button>
        <button
          type="button"
          className="prompt-btn"
          data-testid="building-choice-cash-btn"
          onClick={onConfirmCash}
        >
          Add to Cash
        </button>
        <button
          type="button"
          className="prompt-btn prompt-btn--primary"
          data-testid="building-choice-build-btn"
          onClick={onConfirmBuild}
        >
          Build
        </button>
      </div>
    </PromptShell>
  );
}

/**
 * Last chance before a play that the rules allow but that gains the player
 * nothing. The card is still in hand at this point — "Undo" simply drops the
 * intent, and no command is ever sent.
 */
export function WastedPlayPrompt({
  card,
  reason,
  onConfirm,
  onCancel,
}: {
  card: Card;
  reason: WastedPlayReason;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <PromptShell title={`Play ${cardTitle(card)} anyway?`} testId="wasted-play-prompt">
      <p className="game-prompt__hint">{wastedPlayCopy(reason)}</p>
      <p className="game-prompt__hint">
        It will be discarded and one of your plays used up. Do you really want to play it?
      </p>
      <div className="game-prompt__actions">
        <button
          type="button"
          className="prompt-btn"
          data-testid="wasted-play-undo-btn"
          onClick={onCancel}
        >
          Undo
        </button>
        <button
          type="button"
          className="prompt-btn prompt-btn--primary"
          data-testid="wasted-play-confirm-btn"
          onClick={onConfirm}
        >
          Yes
        </button>
      </div>
    </PromptShell>
  );
}
