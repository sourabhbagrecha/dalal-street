import { useState } from 'react';
import type { Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { Cd, Icon, useBox } from '../kit';
import type { Seat } from '../model';
import { cardName, completeCount, isComplete, setSize, stateName } from '../model';
import { colorOf, vars } from './style';

/**
 * Sly Deal, Forced Deal and Deal Breaker, as one screen: a tab per rival and, under it, only what can be taken from the
 * one picked — each loose property as a big card (or each complete set, whole), grouped by set. Nothing else from the
 * felt is in the way (no bank, no hands, nothing that cannot be touched), and a rival with nothing to take is greyed out
 * instead of leading to an empty table.
 *
 * A tap only *arms* the pick (the card or set lights up, the rest dim); the round button under the hand plays it, the
 * same press-to-confirm Debt Collector has. Forced Deal's first half — your own property to give — has no rivals to
 * switch between and moves straight on when tapped.
 */

/** Widest a card is dealt out here (world-free css px): a set of three fits one row of a 390px phone. */
const CARD_MAX = 112;
const CARD_MIN = 64;
const GAP = 12;
const PAD = 16;

/** What the viewer has lined up and not yet played: a rival's card (Sly / Forced Deal) or a whole set (Deal Breaker). */
export interface Armed {
  rivalId: string;
  cardId?: string;
  setId?: string;
}

/** What can be taken from a rival: the sets that are not yet complete. */
const takeable = (seat: Seat): PropertySet[] => seat.sets.filter((s) => !isComplete(s) && s.cards.length > 0);
const count = (sets: PropertySet[]) => sets.reduce((n, s) => n + s.cards.length, 0);

interface StealPickerProps {
  mode: 'sly_deal' | 'forced_deal' | 'deal_breaker';
  /** Forced Deal only: `own` picks the property you give (from `mine`), `rival` the one you get. */
  step?: 'own' | 'rival';
  rivals: Seat[];
  /** Your own sets, for Forced Deal's give step. */
  mine: PropertySet[];
  armed: Armed | null;
  onArm(next: Armed | null): void;
  /** Forced Deal, rival step: the property you are giving, with a way to change it. */
  give?: { card: Card; color: PropertyColor } | null;
  onRegive?(): void;
  /** Forced Deal, own step: your property to give. */
  onGive(cardId: string): void;
}
export function StealPicker({ mode, step, rivals, mine, armed, onArm, give, onRegive, onGive }: StealPickerProps) {
  const [ref, box] = useBox<HTMLDivElement>({ w: 393, h: 500 });
  const [chosen, setChosen] = useState<string | null>(null);
  const giving = mode === 'forced_deal' && step === 'own';
  const whole = mode === 'deal_breaker';
  /** What a rival offers: complete sets for Deal Breaker, loose properties for the others. */
  const offers = (seat: Seat) => (whole ? seat.sets.filter((s) => isComplete(s) && s.cards.length > 0) : takeable(seat));
  const amount = (seat: Seat) => (whole ? offers(seat).length : count(offers(seat)));
  // Straight onto a rival who has something to take; the picked tab holds while it still does.
  const view = rivals.find((r) => r.id === chosen && amount(r) > 0) ?? rivals.find((r) => amount(r) > 0);
  const perRow = whole ? 4 : 3;
  const w = Math.max(CARD_MIN, Math.min(CARD_MAX, Math.floor((box.w - PAD * 2 - GAP * (perRow - 1)) / perRow)));
  // The sets nearest to complete first: taking from them hurts most.
  const fill = (s: PropertySet) => s.cards.length / setSize(s.color);
  const sets = giving ? mine.filter((s) => !isComplete(s) && s.cards.length > 0) : view ? [...offers(view)].sort((a, b) => fill(b) - fill(a)) : [];
  const safeSource = giving ? mine : view?.sets;
  const safe = giving || !whole ? (safeSource ?? []).filter(isComplete).length : 0;

  const arm = (next: Armed) => {
    const same = armed && armed.rivalId === next.rivalId && armed.cardId === next.cardId && armed.setId === next.setId;
    onArm(same ? null : next);
  };

  return (
    <div className="tb-steal" ref={ref} data-testid="steal-picker" data-armed={armed ? true : undefined}>
      {!giving && (
        <nav className="tb-steal__tabs" aria-label="Rivals">
          {rivals.map((r) => {
            const n = amount(r);
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
                onClick={() => {
                  setChosen(r.id);
                  if (armed && armed.rivalId !== r.id) onArm(null);
                }}
              >
                <span className="tb-steal__who">
                  <i aria-hidden />
                  <b>{r.name}</b>
                </span>
                <small>{n === 0 ? (whole ? 'no full set' : 'none to take') : whole ? (n === 1 ? '1 set to take' : `${n} sets to take`) : `${n} to take`}</small>
              </button>
            );
          })}
        </nav>
      )}
      {give && !giving && (
        <div className="tb-steal__give" data-testid="forced-deal-give">
          <Cd card={give.card} w={38} />
          <span>
            <small>You give</small>
            <b>{cardName(give.card)}</b>
          </span>
          {onRegive && (
            <button type="button" data-testid="forced-deal-regive" onClick={onRegive}>
              Change
            </button>
          )}
        </div>
      )}
      {(giving || view) && (
        <div className="tb-steal__body" key={giving ? 'own' : view!.id} data-testid="steal-body">
          {sets.map((s) =>
            whole ? (
              <WholeSet
                key={s.id}
                set={s}
                w={w}
                on={armed?.setId === s.id}
                dim={!!armed && armed.setId !== s.id}
                onPick={() => arm({ rivalId: view!.id, setId: s.id })}
              />
            ) : (
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
                    <StealCard
                      key={c.id}
                      card={c}
                      w={w}
                      label={giving ? `Give ${cardName(c)}` : `Take ${cardName(c)} from ${view!.name}`}
                      on={armed?.cardId === c.id}
                      dim={!!armed && armed.cardId !== c.id}
                      onPick={() => (giving ? onGive(c.id) : arm({ rivalId: view!.id, cardId: c.id }))}
                    />
                  ))}
                </div>
              </section>
            ),
          )}
          {safe > 0 && (
            <p className="tb-steal__safe">
              <Icon name="crown" />
              {safe === 1 ? '1 complete set' : `${safe} complete sets`} can’t be {giving ? 'traded' : 'taken'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StealCard({ card, w, label, on, dim, onPick }: { card: Card; w: number; label: string; on: boolean; dim: boolean; onPick(): void }) {
  return (
    <button type="button" className="tb-steal__card" data-testid={`steal-card-${card.id}`} data-on={on ? true : undefined} data-dim={dim ? true : undefined} aria-pressed={on} aria-label={label} onClick={onPick}>
      <Cd card={card} w={w} />
      {on && (
        <span className="tb-steal__tick" aria-hidden>
          <Icon name="check" />
        </span>
      )}
    </button>
  );
}

/** Deal Breaker: a complete set laid out card by card (houses and hotels too), the whole of it one button. */
function WholeSet({ set, w, on, dim, onPick }: { set: PropertySet; w: number; on: boolean; dim: boolean; onPick(): void }) {
  const cards = [...set.cards, ...(set.house ? [set.house] : []), ...(set.hotel ? [set.hotel] : [])];
  return (
    <button
      type="button"
      className="tb-steal__set tb-steal__set--whole"
      style={vars({ '--c': colorOf(set.color) })}
      data-testid={`deal-breaker-set-${set.id}`}
      data-on={on ? true : undefined}
      data-dim={dim ? true : undefined}
      aria-pressed={on}
      aria-label={`Take the whole ${stateName(set.color)} set`}
      onClick={onPick}
    >
      <h3>
        <i aria-hidden />
        <b>{stateName(set.color)}</b>
        <small>complete{set.hotel ? ' · hotel' : set.house ? ' · house' : ''}</small>
        {on && (
          <span className="tb-steal__tick" aria-hidden>
            <Icon name="check" />
          </span>
        )}
      </h3>
      <div className="tb-steal__cards">
        {cards.map((c) => (
          <span key={c.id} className="tb-steal__static">
            <Cd card={c} w={w} />
          </span>
        ))}
      </div>
    </button>
  );
}
