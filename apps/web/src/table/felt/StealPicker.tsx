import { useState } from 'react';
import type { Card, PropertySet } from '@monopoly-deal/shared';
import { Cd, Icon, useBox } from '../kit';
import type { Seat } from '../model';
import { cardName, completeCount, isComplete, setSize, stateName } from '../model';
import { colorOf, vars } from './style';

/**
 * Sly Deal, as one screen: a tab per rival and, under it, only what can be taken from the one picked — each loose
 * property as a big card, grouped by set. Nothing else from the felt is in the way (no bank, no hands, no sets that
 * cannot be touched), and a rival with nothing to take is greyed out instead of leading to an empty table.
 */

/** Widest a card is dealt out here (world-free css px): a set of three fits one row of a 390px phone. */
const CARD_MAX = 112;
const CARD_MIN = 72;
const GAP = 12;
const PAD = 16;
/** Cards to a row the picker sizes for. */
const PER_ROW = 3;

/** What can be taken from a rival: the sets that are not yet complete. */
export const takeable = (seat: Seat): PropertySet[] => seat.sets.filter((s) => !isComplete(s) && s.cards.length > 0);
const count = (sets: PropertySet[]) => sets.reduce((n, s) => n + s.cards.length, 0);

interface StealPickerProps {
  rivals: Seat[];
  /** Take this card from this rival. */
  onSteal(rivalId: string, cardId: string): void;
}
export function StealPicker({ rivals, onSteal }: StealPickerProps) {
  const [ref, box] = useBox<HTMLDivElement>({ w: 393, h: 500 });
  const [chosen, setChosen] = useState<string | null>(null);
  // Straight onto a rival who has something to take; the picked tab holds while it still does.
  const view = rivals.find((r) => r.id === chosen && takeable(r).length > 0) ?? rivals.find((r) => takeable(r).length > 0);
  const w = Math.max(CARD_MIN, Math.min(CARD_MAX, Math.floor((box.w - PAD * 2 - GAP * (PER_ROW - 1)) / PER_ROW)));
  // The sets nearest to complete first: taking from them hurts most.
  const sets = view ? [...takeable(view)].sort((a, b) => b.cards.length / setSize(b.color) - a.cards.length / setSize(a.color)) : [];
  const safe = view ? view.sets.filter(isComplete).length : 0;

  return (
    <div className="tb-steal" ref={ref} data-testid="steal-picker">
      <nav className="tb-steal__tabs" aria-label="Rivals">
        {rivals.map((r) => {
          const n = count(takeable(r));
          return (
            <button
              key={r.id}
              type="button"
              className="tb-steal__tab"
              aria-pressed={r.id === view?.id}
              disabled={n === 0}
              data-danger={completeCount(r.sets) >= 2}
              data-testid={`steal-rival-${r.id}`}
              style={vars({ '--seat': r.color })}
              onClick={() => setChosen(r.id)}
            >
              <span className="tb-steal__who">
                <i aria-hidden />
                <b>{r.name}</b>
              </span>
              <small>{n === 0 ? 'none to take' : `${n} to take`}</small>
            </button>
          );
        })}
      </nav>
      {view && (
        <div className="tb-steal__body" key={view.id} data-testid="steal-body">
          {sets.map((s) => (
            <section className="tb-steal__set" key={s.id} style={vars({ '--c': colorOf(s.color) })}>
              <h3>
                <i aria-hidden />
                <b>{stateName(s.color)}</b>
                <small>
                  {s.cards.length}/{setSize(s.color)}
                </small>
              </h3>
              <div className="tb-steal__cards">
                {s.cards.map((c) => (
                  <StealCard key={c.id} card={c} w={w} owner={view.name} onSteal={() => onSteal(view.id, c.id)} />
                ))}
              </div>
            </section>
          ))}
          {safe > 0 && (
            <p className="tb-steal__safe">
              <Icon name="crown" />
              {safe === 1 ? '1 complete set' : `${safe} complete sets`} can’t be taken
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StealCard({ card, w, owner, onSteal }: { card: Card; w: number; owner: string; onSteal(): void }) {
  return (
    <button type="button" className="tb-steal__card" data-testid={`steal-card-${card.id}`} aria-label={`Take ${cardName(card)} from ${owner}`} onClick={onSteal}>
      <Cd card={card} w={w} />
    </button>
  );
}
