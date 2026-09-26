import type { Card, PropertyColor } from '@monopoly-deal/shared';
import { ActionBankPrompt, BuildingChoicePrompt, PromptShell, RentDoublePrompt, WastedPlayPrompt } from '../components/GamePrompts';
import { Cd } from './kit';
import type { Confirm } from './model';
import { stateName } from './model';

/**
 * A held play waiting for the viewer's OK, over the whole table. The dialogs are the ones the classic board
 * uses (components/GamePrompts.tsx, `.game-prompt` in prompts.css); here they sit as a sheet on the bottom of the
 * phone with the card in question shown above them, and a tap on the dimmed table is the same as their "undo".
 */

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

export function Confirms({ confirm }: { confirm: Confirm | null }) {
  if (!confirm) return null;
  return (
    <div className="tb-confirm" data-kind={confirm.kind} onClick={backOut(confirm)}>
      <div className="tb-confirm__sheet" key={confirm.kind} onClick={(e) => e.stopPropagation()}>
        {faces(confirm.kind === 'rent_double' ? [confirm.card, confirm.double] : [confirm.card])}
        {confirm.kind === 'wasted' && <WastedPlayPrompt card={confirm.card} copy={confirm.copy} onConfirm={confirm.yes} onCancel={confirm.undo} />}
        {confirm.kind === 'bank_action' && <ActionBankPrompt card={confirm.card} canPlay={confirm.canPlay} onConfirmCash={confirm.cash} onConfirmPlay={confirm.play} onCancel={confirm.keep} />}
        {confirm.kind === 'building_choice' && <BuildingChoicePrompt card={confirm.card} canBuild={confirm.canBuild} onConfirmCash={confirm.cash} onConfirmBuild={confirm.build} onCancel={confirm.undo} />}
        {confirm.kind === 'rent_double' && <RentDoublePrompt rentCard={confirm.card} doubleCard={confirm.double} onConfirmDouble={confirm.twice} onConfirmPlain={confirm.plain} onCancel={confirm.undo} />}
        {confirm.kind === 'flip' && <FlipPrompt toColor={confirm.toColor} copy={confirm.copy} onConfirm={confirm.yes} onCancel={confirm.undo} />}
      </div>
    </div>
  );
}
