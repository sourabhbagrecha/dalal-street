import { useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Card, PropertyColor } from '@monopoly-deal/shared';
import type { Prompt, TableGame } from '../model';
import { buildColors, zonesFor } from '../model';
import { handKey } from '../tableGlance';
import { useCardDrag } from '../useCardDrag';
import type { Cam } from './layout';

/** Where the finger let go of a dragged card, and when. */
export type LetGo = { id: string; x: number; y: number; at: number };

const DOUBLE_TAP_MS = 300;

export const isJsn =(c: Card) => c.kind === 'action' && c.action === 'just_say_no';

interface HandDragArgs {
  g: TableGame;
  discarding: Extract<Prompt, { kind: 'discard' }> | null;
  jsnAsk: Extract<Prompt, { kind: 'jsn' }> | null;
  letGo: RefObject<LetGo | null>;
  setSel: Dispatch<SetStateAction<string | null>>;
  setSelBoard: Dispatch<SetStateAction<string | null>>;
  setWildAsk: Dispatch<SetStateAction<string | null>>;
  setManual: Dispatch<SetStateAction<Cam | null>>;
  /** Opens the same loupe the board sets and bank use, on this hand card — see tableGlance.tsx. */
  openPeek(key: string, y: number): void;
  /** Closes it again, however it was opened. */
  closePeek(): void;
}

/**
 * Your hand under the finger: a tap selects (or discards, or says no), a throw plays the card where it lands, and
 * holding still — on any turn, legal or not — opens the loupe on it so rule text too small to read at hand size is
 * still legible (the same fix the board's sets and bank already had).
 */
export function useHandDrag({ g, discarding, jsnAsk, letGo, setSel, setSelBoard, setWildAsk, setManual, openPeek, closePeek }: HandDragArgs) {
  const dropCard = (id: string, zone: string, color?: string) => {
    const card = g.hand.find((c) => c.id === id);
    if (!card) return;
    setSel(null);
    if (zone === 'bank') return g.actions.play(id, 'bank');
    if (zone === 'build') {
      const picked = color as PropertyColor | undefined;
      // A wild dropped on a set it can join joins it. Dropped anywhere else (another colour's set), it is never refused:
      // with one way to go it goes there, and a two-colour wild asks which, since starting a separate set can be the point.
      if (card.kind === 'property_wild') {
        const options = buildColors(card, g.me.sets);
        if (!(picked && options.includes(picked))) return options.length > 1 ? setWildAsk(id) : g.actions.play(id, 'build', options[0]);
      }
      return g.actions.play(id, 'build', picked);
    }
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

  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const { drag, bind } = useCardDrag({
    onTap: (id) => {
      // Hand-limit discard: a tap marks the card. A Just Say No prompt: a tap on a glowing Just Say No plays it.
      if (discarding) return g.actions.discard(id);
      if (jsnAsk) {
        const c = g.hand.find((x) => x.id === id);
        return c && isJsn(c) ? g.actions.jsn(id) : undefined;
      }
      // A second tap on the same card, quickly, plays it the obvious way (as a throw on the felt would).
      const now = performance.now();
      const last = lastTap.current;
      lastTap.current = { id, at: now };
      if (last && last.id === id && now - last.at <= DOUBLE_TAP_MS && g.canAct) {
        lastTap.current = null;
        return dropCard(id, 'auto');
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
    onHold: (id, y) => openPeek(handKey(id), y),
    onHoldEnd: closePeek,
    // The hand stays interactive through a rival's turn — tap to inspect/preselect a card, or pick it up to see
    // it big — so waiting is not just watching. Only *committing* a play is turn-gated: `onDrop` above already
    // no-ops on `!g.canAct` outside a hand-limit discard, so a drop that lands while it is not the viewer's turn
    // never reaches the server.
    enabled: true,
  });
  return { drag, bind, dropCard };
}
