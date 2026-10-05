import type { Dispatch, SetStateAction } from 'react';
import type { Card, PropertySet, PropertyWildCard } from '@monopoly-deal/shared';
import type { TableGame } from '../model';
import { buildColors, cardName, flipColors, isComplete, setSize, stateName, zonesFor } from '../model';
import { colorOf, money } from './style';

// ── pills over a tapped card ──
export type Pill = { key: string; label: string; sub?: string; act(): void; gold?: boolean; testId?: string; dot?: string; disabled?: boolean };
export type BoardPick = { card: PropertyWildCard; set: PropertySet };

/** The wild picked in one of your sets, with the set it sits in. */
export function boardPickOf(g: TableGame, selBoard: string | null): BoardPick | null {
  if (!selBoard || !g.canRearrange) return null;
  for (const s of g.me.sets) {
    const c = s.cards.find((x) => x.id === selBoard);
    if (c && c.kind === 'property_wild') return { card: c, set: s };
  }
  return null;
}

interface PillsArgs {
  g: TableGame;
  boardPick: BoardPick | null;
  /** The hand card you tapped. */
  selCard: Card | undefined;
  dropCard(id: string, zone: string, color?: string): void;
  setSelBoard: Dispatch<SetStateAction<string | null>>;
}
/** What a tapped card can do, one pill each: flip a picked wild on your table, or play, build or bank a hand card. */
export function pillsFor({ g, boardPick, selCard, dropCard, setSelBoard }: PillsArgs): Pill[] {
  const flipTargets = boardPick ? flipColors(boardPick.card, g.me.sets).filter((c) => c !== boardPick.set.color) : [];
  const out: Pill[] = [];
  if (boardPick) {
    // Flipping a wild is a move to its other colour; with a rainbow wild there is one pill per colour.
    const many = flipTargets.length > 3;
    for (const c of flipTargets) {
      const have = g.me.sets.find((s) => s.color === c && !isComplete(s))?.cards.length ?? 0;
      out.push({
        key: `flip${c}`,
        label: many ? stateName(c) : `Flip to ${stateName(c)}`,
        // A long row of colours keeps to names; what they cost is said once, in the hint above them.
        sub: many ? undefined : isComplete(boardPick.set) ? 'breaks a set' : have + 1 >= setSize(c) ? 'completes set' : `${have + 1}/${setSize(c)}`,
        testId: flipTargets.length === 1 ? `flip-wild-btn-${boardPick.card.id}` : `flip-wild-btn-${boardPick.card.id}-${c}`,
        gold: have + 1 >= setSize(c) && !isComplete(boardPick.set),
        dot: many ? colorOf(c) : undefined,
        act: () => {
          setSelBoard(null);
          g.actions.rearrange(boardPick.card.id, c);
        },
      });
    }
    return out;
  }
  // Not the viewer's turn: a tapped card is only inspected — no play options are offered.
  if (!selCard || !g.canAct) return out;
  for (const z of zonesFor(selCard)) {
    if (z === 'play') out.push({ key: 'play', label: `Play ${cardName(selCard)}`, act: () => dropCard(selCard.id, 'auto'), gold: true });
    if (z === 'build')
      {
        const options = buildColors(selCard, g.me.sets);
        // A Joker with no set under way has nowhere to go; tapping says why.
        if (options.length === 0) out.push({ key: 'nowhere', label: 'Needs a set to join', sub: 'start one first', act: () => dropCard(selCard.id, 'auto') });
        for (const c of options) {
          const have = g.me.sets.find((s) => s.color === c && !isComplete(s))?.cards.length ?? 0;
          const done = have + 1 >= setSize(c);
          out.push({
            key: `b${c}`,
            label: `Build ${stateName(c)}`,
            sub: done ? 'completes set' : `${have + 1}/${setSize(c)}`,
            act: () => dropCard(selCard.id, 'build', c),
            gold: done,
            dot: options.length > 3 ? colorOf(c) : undefined,
          });
        }
      }
    if (z === 'bank') out.push({ key: 'bank', label: `Bank ${money(selCard.value)}`, act: () => dropCard(selCard.id, 'bank') });
  }
  return out;
}
