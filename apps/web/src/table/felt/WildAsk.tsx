import type { ReactNode } from 'react';
import type { Card, PropertyColor } from '@monopoly-deal/shared';
import type { TableGame } from '../model';
import { buildColors, isComplete, setSize, stateName } from '../model';
import { colorOf, vars } from './style';

/** Where one colour choice puts the card: into the set under way, or a set of its own (a complete set is never joined). */
function outcome(g: TableGame, c: PropertyColor): string {
  const have = g.me.sets.find((s) => s.color === c && s.cards.length > 0 && !isComplete(s))?.cards.length ?? 0;
  if (have + 1 >= setSize(c)) return 'completes set';
  return have === 0 ? 'new set' : `${have + 1}/${setSize(c)}`;
}

/** A wild thrown on the table that could go more than one way: the sheet that asks which colour it plays as. */
export function WildAsk({ g, card: wildAskCard, onClose }: { g: TableGame; card: Card; onClose(): void }) {
  return (
    <Ask onClose={onClose} title="Play it as which state?" many={buildColors(wildAskCard, g.me.sets).length > 3}>
      {buildColors(wildAskCard, g.me.sets).map((c) => (
        <button
          key={c}
          type="button"
          data-testid={`wild-ask-${c}`}
          style={vars({ '--c': colorOf(c) })}
          onClick={() => {
            g.actions.play(wildAskCard.id, 'build', c);
            onClose();
          }}
        >
          <i />
          <b>{stateName(c)}</b>
          <small>{outcome(g, c)}</small>
        </button>
      ))}
    </Ask>
  );
}

function Ask({ children, title, many, onClose }: { children: ReactNode; title: string; many?: boolean; onClose(): void }) {
  return (
    <div className="tb-ask" data-testid="wild-ask" data-many={many} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}
