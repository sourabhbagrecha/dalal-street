import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Card, PropertyColor } from '@monopoly-deal/shared';
import type { Prompt, TableGame } from '../model';
import { buildColors, zonesFor } from '../model';
import { useCardDrag } from '../useCardDrag';
import type { Cam } from './layout';

/** Where the finger let go of a dragged card, and when. */
export type LetGo = { id: string; x: number; y: number; at: number };

export const isJsn = (c: Card) => c.kind === 'action' && c.action === 'just_say_no';

interface HandDragArgs {
  g: TableGame;
  discarding: Extract<Prompt, { kind: 'discard' }> | null;
  jsnAsk: Extract<Prompt, { kind: 'jsn' }> | null;
  letGo: RefObject<LetGo | null>;
  setSel: Dispatch<SetStateAction<string | null>>;
  setSelBoard: Dispatch<SetStateAction<string | null>>;
  setWildAsk: Dispatch<SetStateAction<string | null>>;
  setManual: Dispatch<SetStateAction<Cam | null>>;
}

/** Your hand under the finger: a tap selects (or discards, or says no), a throw plays the card where it lands. */
export function useHandDrag({ g, discarding, jsnAsk, letGo, setSel, setSelBoard, setWildAsk, setManual }: HandDragArgs) {
  const dropCard = (id: string, zone: string, color?: string) => {
    const card = g.hand.find((c) => c.id === id);
    if (!card) return;
    setSel(null);
    if (zone === 'bank') return g.actions.play(id, 'bank');
    if (zone === 'build') return g.actions.play(id, 'build', color as PropertyColor | undefined);
    // An action thrown on the discard pile is played, as at a real table.
    if (zone === 'play') return zonesFor(card).includes('play') ? g.actions.play(id, 'play') : undefined;
    if (zone === 'auto') {
      const [z] = zonesFor(card);
      if (z === 'build' && buildColors(card, g.me.sets).length > 1) return setWildAsk(id);
      if (z === 'bank' && card.kind === 'action' && card.action === 'just_say_no') return g.actions.play(id, 'bank');
      // The obvious thing: money banks, properties build, actions play.
      const first = zonesFor(card).includes('play') ? 'play' : z;
      if (first) g.actions.play(id, first, first === 'build' ? buildColors(card, g.me.sets)[0] : undefined);
    }
  };

  const { drag, bind } = useCardDrag({
    onTap: (id) => {
      // Hand-limit discard: a tap marks the card. A Just Say No prompt: a tap on a glowing Just Say No plays it.
      if (discarding) return g.actions.discard(id);
      if (jsnAsk) {
        const c = g.hand.find((x) => x.id === id);
        return c && isJsn(c) ? g.actions.jsn(id) : undefined;
      }
      setSelBoard(null);
      setSel((s) => (s === id ? null : id));
    },
    onLift: () => {
      setSel(null);
      setSelBoard(null);
      setManual('me');
    },
    onDrop: (id, hit) => {
      // Throwing a card on the discard pile marks it for the hand-limit discard (a second throw takes it back).
      if (discarding) return hit.zone === 'play' ? g.actions.discard(id) : undefined;
      if (!g.canAct) return;
      if (hit.x !== undefined && hit.y !== undefined) letGo.current = { id, x: hit.x, y: hit.y, at: performance.now() };
      if (hit.zone) dropCard(id, hit.zone, hit.color);
    },
    enabled: g.canAct || !!discarding || !!jsnAsk,
  });
  return { drag, bind, dropCard };
}
