import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { theme } from '../../theme';
import type { SentPlay, TableGame } from '../model';
import { isComplete } from '../model';
import { bounce, park, parkKey, perform } from '../stage/choreo';
import type { Spot, Stage } from '../stage/stage';
import { bankKey, setKey } from '../tableGlance';
import type { Cam } from './layout';
import type { LetGo } from './useHandDrag';

/**
 * Keeps the stage in step with the game, every commit: acts out each new beat, parks the cards you put down until
 * the server answers (and flies them home if it refuses), then re-reads where everything stands.
 */
export function useStageSync(g: TableGame, stage: Stage, tableRef: RefObject<HTMLDivElement | null>, letGo: RefObject<LetGo | null>, holdCam: (to: Cam, ms: number) => void) {
  // What just happened on the table plays out on the stage; each commit then re-reads where everything stands,
  // so the next beat can find the cards this one takes away.
  const lastBeat = useRef(0);
  /** Cards put down and awaiting the server, as the stage last saw them: what is parked, so a change can be told from a first sight. */
  const parked = useRef(new Map<string, SentPlay>());
  /** Where a parked card stood when a beat lifted it off the stage, for the beat's other cards to start from. */
  const lifted = useRef(new Map<string, { spot: Spot; at: number }>());

  /** Where a card the viewer just put down goes to wait: the bank, the set it joins (its seat, if none yet) or the pile. */
  const parkTarget = (o: SentPlay) => {
    const me = g.me.id;
    if (o.zone === 'bank') return stage.target(`[data-peek="${bankKey(me)}"] .cash-pile`, `[data-peek="${bankKey(me)}"]`, `[data-seat="${me}"]`);
    if (o.zone === 'play') return stage.target('[data-fly="discard"]');
    const set = o.color ? g.me.sets.find((x) => x.color === o.color && !isComplete(x)) : undefined;
    return stage.target(`[data-cid="${o.card.id}"]`, ...(set ? [`[data-peek="${setKey(me, set.id)}"]`] : []), `[data-seat="${me}"]`);
  };

  /** Cards put down and not yet confirmed: park them where they were put; take them back if the server refused. */
  const syncSent = () => {
    const now = new Set(g.sent.map((o) => o.card.id));
    for (const o of g.sent) {
      const id = o.card.id;
      if (parked.current.has(id)) continue;
      parked.current.set(id, o);
      const d = letGo.current;
      const at = tableRef.current?.getBoundingClientRect();
      // From where the finger let go; a tap on a pill has no such place, so from the card's slot in the hand.
      const from =
        d && d.id === id && at && performance.now() - d.at < 1500
          ? stage.screenSpot(d.x - at.left, d.y - at.top, 90)
          : (stage.snap(id) ?? stage.screenSpot(stage.size.w / 2, stage.size.h - 92));
      park(stage, { card: o.card, from, to: parkTarget(o) });
    }
    for (const [id, o] of parked.current) {
      if (now.has(id)) continue;
      parked.current.delete(id);
      const key = parkKey(id);
      if (g.hand.some((c) => c.id === id)) {
        // Refused (or never heard): the card is back in the hand; the parked copy flies home to it.
        const a = stage.take(key);
        if (a?.last) bounce(stage, o.card, stage.screenSpot(a.last.x, a.last.y, a.last.w ?? 90), stage.target(`[data-cid="${id}"]`));
      } else if (stage.actors.some((a) => a.key === key)) {
        // The game has moved but its scene is queued behind another: the real card waits out of sight until it is
        // this card's turn (its beat settles the parked one), and is let through if that turn never comes.
        if (o.zone === 'build') stage.hide(id);
        stage.later(1500, () => {
          if (stage.take(key)) stage.show(id);
        });
      }
    }
  };

  useLayoutEffect(() => {
    const b = g.beat;
    if (b && b.id !== lastBeat.current) {
      lastBeat.current = b.id;
      perform(b, {
        me: g.me.id,
        stage,
        tint: (id) => g.rivals.find((r) => r.id === id)?.color ?? theme.selfColor,
        dropped: (id) => {
          // A card of yours that was parked: the beat carries on from where it stood.
          const a = stage.actors.find((x) => x.key === parkKey(id));
          if (a) {
            stage.take(a.key);
            if (a.last) lifted.current.set(id, { spot: stage.screenSpot(a.last.x, a.last.y, a.last.w ?? 90), at: performance.now() });
          }
          const l = lifted.current.get(id);
          if (l && performance.now() - l.at < 3000) return l.spot;
          const d = letGo.current;
          const o = tableRef.current?.getBoundingClientRect();
          if (!d || d.id !== id || !o || performance.now() - d.at > 2500) return null;
          return stage.screenSpot(d.x - o.left, d.y - o.top, 90);
        },
        hold: holdCam,
      });
    }
    syncSent();
    stage.snapshot();
  });
}
