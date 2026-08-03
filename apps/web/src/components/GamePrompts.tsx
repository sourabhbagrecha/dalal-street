import { useCallback, useMemo, useState } from 'react';
import { isCompleteSet, stealableProperties } from '@monopoly-deal/engine';
import type { GameState, PendingInteraction, PropertyColor } from '@monopoly-deal/shared';
import { getLegalCommands } from '@monopoly-deal/engine';
import { cardTitle } from '../derivations';
import { useGameStore } from '../store';
import { theme } from '../theme';
import { PlayingCard } from './PlayingCard';

interface GamePromptsProps {
  state: GameState;
  localPlayerId: string;
  discardSelection: string[];
  onDiscardSelect: (cardId: string) => void;
  onClearDiscardSelection: () => void;
}

function pendingForLocal(
  state: GameState,
  localPlayerId: string,
): PendingInteraction | undefined {
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
  state,
  localPlayerId,
  discardSelection,
  onDiscardSelect,
  onClearDiscardSelection,
}: GamePromptsProps) {
  const send = useGameStore((s) => s.send);
  const pending = pendingForLocal(state, localPlayerId);

  if (!pending) return null;

  switch (pending.kind) {
    case 'hand_limit_discard':
      return (
        <HandLimitPrompt
          excess={pending.excess}
          selected={discardSelection}
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
          state={state}
          actorId={pending.actorId}
          amount={pending.amount}
          color={pending.color}
          onPick={(targetPlayerId) =>
            send({ type: 'SELECT_RENT_PLAYER', playerId: localPlayerId, targetPlayerId })
          }
        />
      );
    case 'payment':
      return (
        <PaymentPrompt
          state={state}
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
          state={state}
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
          state={state}
          actorId={pending.actorId}
          onPick={(targetCardId) =>
            send({
              type: 'SELECT_STEAL_TARGET',
              playerId: localPlayerId,
              targetCardId,
            })
          }
        />
      );
    case 'forced_deal_target':
      return (
        <ForcedDealPrompt
          state={state}
          actorId={pending.actorId}
          onPick={(targetCardId, ownCardId) =>
            send({
              type: 'SELECT_STEAL_TARGET',
              playerId: localPlayerId,
              targetCardId,
              ownCardId,
            })
          }
        />
      );
    case 'deal_breaker_target':
      return (
        <DealBreakerPrompt
          state={state}
          actorId={pending.actorId}
          onPick={(targetSetId) =>
            send({
              type: 'SELECT_STEAL_TARGET',
              playerId: localPlayerId,
              targetSetId,
            })
          }
        />
      );
    case 'house_hotel_target':
      return (
        <BuildingPrompt
          state={state}
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

function PromptShell({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="game-prompt" data-testid={testId} role="dialog" aria-label={title}>
      <h3 className="game-prompt__title">{title}</h3>
      <div className="game-prompt__body">{children}</div>
    </div>
  );
}

function HandLimitPrompt({
  excess,
  selected,
  onClear,
  onConfirm,
}: {
  excess: number;
  selected: string[];
  onSelect: (cardId: string) => void;
  onClear: () => void;
  onConfirm: () => void;
}) {
  const ready = selected.length === excess;

  return (
    <PromptShell title={`Discard ${excess} cards`} testId="hand-limit-prompt">
      <p className="game-prompt__hint">
        Drag or click cards to select, then drop on discard pile. Selected {selected.length} / {excess}
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
  state,
  actorId,
  amount,
  color,
  onPick,
}: {
  state: GameState;
  actorId: string;
  amount: number;
  color: PropertyColor;
  onPick: (targetPlayerId: string) => void;
}) {
  const colorName = theme.propertyNames[color] ?? color;
  return (
    <PromptShell title="Choose who pays rent" testId="rent-player-prompt">
      <p className="game-prompt__hint">
        {colorName} rent — {theme.formatMoney(amount)}
      </p>
      <div className="game-prompt__choices">
        {state.players
          .filter((p) => p.id !== actorId)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              className="prompt-choice prompt-choice--player"
              data-testid={`rent-player-${p.id}`}
              onClick={() => onPick(p.id)}
            >
              {theme.seatName(state.players.findIndex((x) => x.id === p.id), false)}
            </button>
          ))}
      </div>
    </PromptShell>
  );
}

function PaymentPrompt({
  state,
  payerId,
  payeeId,
  amountDue,
  reason,
  onPay,
}: {
  state: GameState;
  payerId: string;
  payeeId: string;
  amountDue: number;
  reason: string;
  onPay: (cardIds: string[]) => void;
}) {
  const payer = state.players.find((p) => p.id === payerId)!;
  const [selected, setSelected] = useState<string[]>([]);

  const payableCards = useMemo(() => {
    const cards: { id: string; card: import('@monopoly-deal/shared').Card; setId?: string }[] = [];
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

  const canConfirm = useMemo(() => {
    const legal = getLegalCommands(state).filter(
      (c): c is Extract<typeof c, { type: 'SELECT_PAYMENT' }> =>
        c.type === 'SELECT_PAYMENT' && c.playerId === payerId,
    );
    const sorted = [...selected].sort();
    return legal.some((c) => JSON.stringify([...c.cardIds].sort()) === JSON.stringify(sorted));
  }, [state, payerId, selected]);

  return (
    <PromptShell title={`Pay ${theme.formatMoney(amountDue)}`} testId="payment-prompt">
      <p className="game-prompt__hint">
        {reason} to {payeeId} — selected {theme.formatMoney(selectedValue)}
      </p>
      <div className="payment-prompt__cards">
        {payableCards.map(({ id, card, setId }) => {
          const set = setId ? payer.board.sets.find((s) => s.id === setId) : undefined;
          const breaksSet = set && isCompleteSet(set) && set.cards.some((c) => c.id === id);
          return (
            <button
              key={id}
              type="button"
              className={`payment-card-btn${selected.includes(id) ? ' payment-card-btn--selected' : ''}${breaksSet ? ' payment-card-btn--breaks-set' : ''}`}
              data-testid={`payment-card-${id}`}
              onClick={() => toggle(id)}
            >
              <PlayingCard card={card} size="sm" />
              {breaksSet && <span className="payment-card-btn__warn">Breaks set</span>}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="prompt-btn prompt-btn--primary"
        data-testid="confirm-payment-btn"
        disabled={!canConfirm}
        onClick={() => onPay(selected)}
      >
        Confirm payment
      </button>
    </PromptShell>
  );
}

function JustSayNoPrompt({
  state,
  respondentId,
  initiatorId,
  onPlay,
  onDecline,
}: {
  state: GameState;
  respondentId: string;
  initiatorId: string;
  onPlay: (cardId: string) => void;
  onDecline: () => void;
}) {
  const respondent = state.players.find((p) => p.id === respondentId)!;
  const jsnCards = respondent.hand.filter(
    (c) => c.kind === 'action' && c.action === 'just_say_no',
  );

  return (
    <PromptShell title="Just Say No?" testId="jsn-prompt">
      <p className="game-prompt__hint">
        {initiatorId} played an action against you. Counter with Just Say No or accept.
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
          data-testid="jsn-decline-btn"
          onClick={onDecline}
        >
          Accept
        </button>
      </div>
    </PromptShell>
  );
}

function StealTargetPrompt({
  state,
  actorId,
  onPick,
}: {
  state: GameState;
  actorId: string;
  onPick: (targetCardId: string) => void;
}) {
  return (
    <PromptShell title="Sly Deal — pick a property" testId="steal-target-prompt">
      <StealOptions state={state} actorId={actorId} onPick={onPick} />
    </PromptShell>
  );
}

function ForcedDealPrompt({
  state,
  actorId,
  onPick,
}: {
  state: GameState;
  actorId: string;
  onPick: (targetCardId: string, ownCardId: string) => void;
}) {
  const [ownCardId, setOwnCardId] = useState<string | null>(null);

  return (
    <PromptShell title="Forced Deal — swap properties" testId="forced-deal-prompt">
      <p className="game-prompt__hint">First pick your property to give, then pick one to take.</p>
      <div className="game-prompt__section">
        <h4>Your property to give</h4>
        <StealOptions
          state={state}
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
            state={state}
            actorId={actorId}
            onPick={(targetCardId) => onPick(targetCardId, ownCardId)}
          />
        </div>
      )}
    </PromptShell>
  );
}

function StealOptions({
  state,
  actorId,
  selfOnly,
  selectedId,
  onPick,
}: {
  state: GameState;
  actorId: string;
  selfOnly?: boolean;
  selectedId?: string | null;
  onPick: (cardId: string) => void;
}) {
  const players = selfOnly
    ? state.players.filter((p) => p.id === actorId)
    : state.players.filter((p) => p.id !== actorId);

  return (
    <div className="steal-options">
      {players.map((p) => {
        const options = stealableProperties(p);
        if (options.length === 0) return null;
        const seatIdx = state.players.findIndex((x) => x.id === p.id);
        return (
          <div key={p.id} className="steal-options__player">
            <span className="steal-options__name">
              {theme.seatName(seatIdx, p.id === actorId)}
            </span>
            <div className="steal-options__cards">
              {options.map(({ card }: { card: import('@monopoly-deal/shared').Card }) => (
                <button
                  key={card.id}
                  type="button"
                  className={`steal-option${selectedId === card.id ? ' steal-option--selected' : ''}`}
                  data-testid={`steal-card-${card.id}`}
                  onClick={() => onPick(card.id)}
                >
                  <PlayingCard card={card} size="sm" />
                  <span>{cardTitle(card)}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DealBreakerPrompt({
  state,
  actorId,
  onPick,
}: {
  state: GameState;
  actorId: string;
  onPick: (targetSetId: string) => void;
}) {
  return (
    <PromptShell title="Deal Breaker — steal a complete set" testId="deal-breaker-prompt">
      <div className="steal-options">
        {state.players
          .filter((p) => p.id !== actorId)
          .map((p) => {
            const complete = p.board.sets.filter(isCompleteSet);
            if (complete.length === 0) return null;
            const seatIdx = state.players.findIndex((x) => x.id === p.id);
            return (
              <div key={p.id} className="steal-options__player">
                <span className="steal-options__name">{theme.seatName(seatIdx, false)}</span>
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
  state,
  actorId,
  building,
  onPick,
}: {
  state: GameState;
  actorId: string;
  building: 'house' | 'hotel';
  onPick: (setId: string) => void;
}) {
  const actor = state.players.find((p) => p.id === actorId)!;
  const label = building === 'house' ? 'House' : 'Hotel';

  return (
    <PromptShell title={`Place ${label} on a complete set`} testId="building-prompt">
      <div className="game-prompt__choices">
        {actor.board.sets
          .filter((set) => isCompleteSet(set) && (building === 'house' ? !set.house : !set.hotel))
          .map((set) => (
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
