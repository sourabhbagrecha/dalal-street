import type { ReactNode } from 'react';
import type { Card } from '@monopoly-deal/shared';
import type { TableGame } from '../model';
import { buildColors, isComplete, setSize, stateName } from '../model';
import { colorOf, vars } from './style';

/** A wild thrown on the table that could join more than one set: the sheet that asks which. */
export function WildAsk({ g, card: wildAskCard, onClose }: { g: TableGame; card: Card; onClose(): void }) {
  return (
    <Ask onClose={onClose} title="Which set does it join?" many={buildColors(wildAskCard, g.me.sets).length > 3}>
      {buildColors(wildAskCard, g.me.sets).map((c) => (
        <button
          key={c}
          type="button"
          style={vars({ '--c': colorOf(c) })}
          onClick={() => {
            g.actions.play(wildAskCard.id, 'build', c);
            onClose();
          }}
        >
          <i />
          <b>{stateName(c)}</b>
          <small>{g.me.sets.find((s) => s.color === c && !isComplete(s))?.cards.length ?? 0}/{setSize(c)} now</small>
        </button>
      ))}
    </Ask>
  );
}

function Ask({ children, title, many, onClose }: { children: ReactNode; title: string; many?: boolean; onClose(): void }) {
  return (
    <div className="tb-ask" data-many={many} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}
