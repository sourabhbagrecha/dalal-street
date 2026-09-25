import { useLayoutEffect, useReducer, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { CardBack, Cd } from '../kit';
import { CARD_W, Stage } from './stage';
import type { Actor } from './stage';

/** One Stage per table, mounted on the table's root element. */
export function useStage(rootRef: RefObject<HTMLElement | null>): Stage {
  const [stage] = useState(() => new Stage());
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    stage.mount(root);
    return () => stage.unmount();
  }, [stage, rootRef]);
  return stage;
}

/** The actors currently on stage. Re-renders on its own, so a flight never re-renders the table. */
export function StageLayer({ stage }: { stage: Stage }) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useLayoutEffect(() => stage.subscribe(bump), [stage]);
  return (
    <div className="st" aria-hidden>
      {stage.actors.map((a) => (
        <ActorView key={a.key} a={a} />
      ))}
    </div>
  );
}

function ActorView({ a }: { a: Actor }) {
  return (
    <>
      {a.kind === 'card' &&
        Array.from({ length: a.trail }, (_, i) => (
          <i
            key={i}
            className="st-ghost"
            style={{ '--tint': a.tint, visibility: 'hidden' } as CSSProperties}
            ref={(el) => {
              if (el) a.ghosts[i] = el;
            }}
          />
        ))}
      <div
        className={`st-actor st-actor--${a.kind}`}
        style={{ '--tint': a.tint, visibility: 'hidden' } as CSSProperties}
        ref={(el) => {
          a.el = el;
        }}
      >
        {a.kind === 'card' ? (
          <div className="st-flip" data-flips={a.flips}>
            <div className="st-face">{a.card ? <Cd card={a.card} w={CARD_W} /> : <CardBack w={CARD_W} />}</div>
            {a.flips && (
              <div className="st-back">
                <CardBack w={CARD_W} />
              </div>
            )}
          </div>
        ) : (
          <Glove />
        )}
      </div>
    </>
  );
}

/** A cartoon glove, fingertips up; the cuff takes the owner's colour. `--pinch` closes the fingers. */
function Glove() {
  return (
    <svg className="st-glove" viewBox="0 0 60 76" width="60" height="76" focusable="false">
      <g className="st-glove__ink" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <g className="st-glove__fingers">
          <rect x="12" y="14" width="9" height="30" rx="4.5" />
          <rect x="21" y="6" width="9" height="36" rx="4.5" />
          <rect x="30" y="4" width="9" height="38" rx="4.5" />
          <rect x="39" y="12" width="9" height="32" rx="4.5" />
        </g>
        <rect className="st-glove__thumb" x="2" y="32" width="10" height="21" rx="5" transform="rotate(-24 7 43)" />
        <rect x="11" y="32" width="38" height="28" rx="9" />
        <rect className="st-glove__patch" x="13.5" y="31.5" width="33" height="5" stroke="none" />
        <rect className="st-glove__cuff" x="10" y="58" width="40" height="15" rx="5" />
      </g>
    </svg>
  );
}
