import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { cardTitle } from '../derivations';
import { Cd } from './kit';
import type { Confirm } from './model';
import { stateName } from './model';

/**
 * A held play waiting for the viewer's OK, over the whole table. The dialogs (`.game-prompt` in gl-table.css) sit
 * as a sheet on the bottom of the phone with the card in question shown above them, and a tap on the dimmed table
 * is the same as their "undo".
 */

function PromptShell({
  title,
  children,
  testId,
  placement = 'bottom',
}: {
  title: string;
  children: ReactNode;
  testId: string;
  /**
   * Which edge the prompt sticks to once it becomes a sheet on a phone. Ignored
   * on a wide board, where every prompt is centred over the table.
   *
   * Almost every prompt carries its own choices, so it can sit at the bottom in
   * easy thumb reach and cover the hand it does not need.
   */
  placement?: 'top' | 'bottom';
}) {
  return (
    <div
      className={`game-prompt game-prompt--${placement}`}
      data-testid={testId}
      role="dialog"
      aria-label={title}
    >
      <h3 className="game-prompt__title">{title}</h3>
      <div className="game-prompt__body">{children}</div>
    </div>
  );
}

/**
 * An action card dropped on the properties panel lands in the bank, which
 * forfeits its effect. Ask first: bank it, play it for its effect (discard
 * pile), or keep it in hand for now.
 */
function ActionBankPrompt({
  card,
  canPlay,
  onConfirmCash,
  onConfirmPlay,
  onCancel,
}: {
  card: Card;
  canPlay: boolean;
  onConfirmCash: () => void;
  onConfirmPlay: () => void;
  onCancel: () => void;
}) {
  return (
    <PromptShell title={`${cardTitle(card)} — add to cash?`} testId="action-bank-prompt">
      <p className="game-prompt__hint">
        {canPlay
          ? 'Banked, it counts as cash only and its action is lost. Bank it, play it now, or keep it in your hand?'
          : 'Banked, it counts as cash only and its action is lost. Bank it, or keep it in your hand?'}
      </p>
      <div className="game-prompt__actions">
        <button type="button" className="prompt-btn" data-testid="action-bank-keep-btn" onClick={onCancel}>
          Keep in hand
        </button>
        <button
          type="button"
          className={`prompt-btn${canPlay ? '' : ' prompt-btn--primary'}`}
          data-testid="action-bank-cash-btn"
          onClick={onConfirmCash}
        >
          Add to Cash
        </button>
        {canPlay && (
          <button
            type="button"
            className="prompt-btn prompt-btn--primary"
            data-testid="action-bank-play-btn"
            onClick={onConfirmPlay}
          >
            Play it
          </button>
        )}
      </div>
    </PromptShell>
  );
}

/**
 * A House/Hotel dropped on the bank or the discard pile is ambiguous — it is held until the player says what they
 * meant: build on one of the sets that can take it, or bank it as cash. It is never thrown away.
 */
function BuildingChoicePrompt({
  card,
  sets,
  blocked,
  onConfirmCash,
  onConfirmBuild,
  onCancel,
}: {
  card: Card;
  sets: Pick<PropertySet, 'id' | 'color'>[];
  blocked: string | null;
  onConfirmCash: () => void;
  onConfirmBuild: (setId: string) => void;
  onCancel: () => void;
}) {
  const name = cardTitle(card).toLowerCase();
  const canBuild = sets.length > 0;

  return (
    <PromptShell title={canBuild ? `Where does the ${name} go?` : `No set can take a ${name} yet`} testId="building-choice-prompt">
      <p className="game-prompt__hint">
        {canBuild ? `Build it on a completed set, or add it to your bank as cash.` : `${blocked} Add it to your bank as cash, or keep it in your hand.`}
      </p>
      {canBuild && (
        <div className="game-prompt__actions game-prompt__actions--stack">
          {sets.map((set) => (
            <button
              key={set.id}
              type="button"
              className="prompt-btn prompt-btn--primary"
              data-testid={`building-choice-set-${set.id}`}
              onClick={() => onConfirmBuild(set.id)}
            >
              Build on {stateName(set.color)}
            </button>
          ))}
        </div>
      )}
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
          className={`prompt-btn${canBuild ? '' : ' prompt-btn--primary'}`}
          data-testid="building-choice-cash-btn"
          onClick={onConfirmCash}
        >
          Add to Bank
        </button>
      </div>
    </PromptShell>
  );
}

/**
 * A rent card dropped on the bank/discard while a Double the Rent still sits
 * unplayed in hand — held so the player can chain it in before the rent
 * resolves, since the engine only doubles rent that is already pending when
 * the rent card is played.
 */
function RentDoublePrompt({
  rentCard,
  doubleCard,
  onConfirmDouble,
  onConfirmPlain,
  onCancel,
}: {
  rentCard: Card;
  doubleCard: Card;
  onConfirmDouble: () => void;
  onConfirmPlain: () => void;
  onCancel: () => void;
}) {
  return (
    <PromptShell title="Double the rent?" testId="rent-double-prompt">
      <p className="game-prompt__hint">
        You have {cardTitle(doubleCard)} — play it with {cardTitle(rentCard)} to double what's owed?
      </p>
      <div className="game-prompt__actions">
        <button
          type="button"
          className="prompt-btn"
          data-testid="rent-double-cancel-btn"
          onClick={onCancel}
        >
          Undo
        </button>
        <button
          type="button"
          className="prompt-btn"
          data-testid="rent-double-plain-btn"
          onClick={onConfirmPlain}
        >
          Just Play Rent
        </button>
        <button
          type="button"
          className="prompt-btn prompt-btn--primary"
          data-testid="rent-double-confirm-btn"
          onClick={onConfirmDouble}
        >
          Double the Rent
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
function WastedPlayPrompt({
  card,
  copy,
  onConfirm,
  onCancel,
}: {
  card: Card;
  /** Why the play gains nothing, already worded (`wastedPlayCopy` in live/plays.ts). */
  copy: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <PromptShell title={`Play ${cardTitle(card)} anyway?`} testId="wasted-play-prompt">
      <p className="game-prompt__hint">{copy}</p>
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

const faces = (cards: Card[]) => (
  <div className="tb-confirm__cards">
    {cards.map((c, i) => (
      <span key={c.id} style={{ ['--i' as string]: i }}>
        <Cd card={c} w={cards.length > 1 ? 74 : 86} />
      </span>
    ))}
  </div>
);

function FlipPrompt({ toColor, copy, onConfirm, onCancel }: { toColor: PropertyColor; copy: string; onConfirm: () => void; onCancel: () => void }) {
  const to = stateName(toColor);
  return (
    <PromptShell title={`Flip to ${to}?`} testId="flip-prompt">
      <p className="game-prompt__hint">{copy}</p>
      <div className="game-prompt__actions">
        <button type="button" className="prompt-btn" data-testid="flip-prompt-undo-btn" onClick={onCancel}>
          Undo
        </button>
        <button type="button" className="prompt-btn prompt-btn--primary" data-testid="flip-prompt-confirm-btn" onClick={onConfirm}>
          Flip it
        </button>
      </div>
    </PromptShell>
  );
}

/** What backing out of each confirmation does: nothing is sent, the card simply stays where it was. */
function backOut(c: Confirm): () => void {
  switch (c.kind) {
    case 'bank_action':
      return c.keep;
    default:
      return c.undo;
  }
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Keeps focus inside the sheet while it's open — Tab (and Shift+Tab) wrap between its first and last control instead
 * of leaking out to the dimmed table behind it — answers Escape the same way tapping that dimmed table does (the
 * play stays undone, nothing is sent), and returns focus to whatever had it before the sheet opened (the card just
 * dropped, typically) once it closes.
 */
function useSheetFocusTrap(confirm: Confirm | null, sheetRef: RefObject<HTMLDivElement | null>) {
  // `confirm` is a fresh object every render (its `yes`/`undo`/… closures are rebuilt upstream), so the effect keys
  // on the card's identity rather than the object itself — reopening the trap on every unrelated re-render would
  // steal focus back to the first control mid-interaction.
  const key = confirm ? `${confirm.kind}:${confirm.card.id}` : null;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  useEffect(() => {
    if (!key) return;
    const restore = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    const focusables = () => (sheet ? Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled')) : []);
    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        const current = confirmRef.current;
        if (current) backOut(current)();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      const inSheet = !!sheet?.contains(document.activeElement);
      if (e.shiftKey ? document.activeElement === first || !inSheet : document.activeElement === last || !inSheet) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    // Capture phase: the sheet is modal over everything else on the table, so its Escape/Tab handling runs before
    // any other listener (the loupe's own window Escape handler, for one) gets a look at the key.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      restore?.focus?.();
    };
  }, [key, sheetRef]);
}

export function Confirms({ confirm }: { confirm: Confirm | null }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useSheetFocusTrap(confirm, sheetRef);
  if (!confirm) return null;
  return (
    <div className="tb-confirm" data-kind={confirm.kind} onClick={backOut(confirm)}>
      <div className="tb-confirm__sheet" key={confirm.kind} ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        {faces(confirm.kind === 'rent_double' ? [confirm.card, confirm.double] : [confirm.card])}
        {confirm.kind === 'wasted' && <WastedPlayPrompt card={confirm.card} copy={confirm.copy} onConfirm={confirm.yes} onCancel={confirm.undo} />}
        {confirm.kind === 'bank_action' && <ActionBankPrompt card={confirm.card} canPlay={confirm.canPlay} onConfirmCash={confirm.cash} onConfirmPlay={confirm.play} onCancel={confirm.keep} />}
        {confirm.kind === 'building_choice' && <BuildingChoicePrompt card={confirm.card} sets={confirm.sets} blocked={confirm.blocked} onConfirmCash={confirm.cash} onConfirmBuild={confirm.build} onCancel={confirm.undo} />}
        {confirm.kind === 'rent_double' && <RentDoublePrompt rentCard={confirm.card} doubleCard={confirm.double} onConfirmDouble={confirm.twice} onConfirmPlain={confirm.plain} onCancel={confirm.undo} />}
        {confirm.kind === 'flip' && <FlipPrompt toColor={confirm.toColor} copy={confirm.copy} onConfirm={confirm.yes} onCancel={confirm.undo} />}
      </div>
    </div>
  );
}
