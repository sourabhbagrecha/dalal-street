/**
 * One batch: entries + (prev → next) → steps. Each entry goes to the handler of its family (`turn.ts`, `plays.ts`,
 * `attacks.ts`, `money.ts`, `jsn.ts`), all sharing one `DeriveCtx`; then the pending threats aimed at the viewer get
 * their `grab`.
 */
import type { ClientGameState } from '@monopoly-deal/shared';
import { humanizePlayerIds } from '../../derivations';
import type { LogEntry } from '../../store/types';
import { attackEntry, grabThreats } from './attacks';
import { makeContext } from './context';
import type { EntryCtx } from './context';
import { jsnEntry } from './jsn';
import { moneyEntry } from './money';
import { playEntry } from './plays';
import type { Memory, Step } from './step';
import { turnEntry } from './turn';

interface DeriveResult {
  steps: Step[];
  memory: Memory;
}

/**
 * The steps a batch of fresh entries adds up to. `prev` is the projection before the batch and `next` the one after
 * it (the same object on a flush with no projection to diff, where cards can only be found on the table).
 */
export function deriveSteps(entries: readonly LogEntry[], prev: ClientGameState, next: ClientGameState, memory: Memory): DeriveResult {
  const cx = makeContext(entries, prev, next, memory);
  const { known, me, done, add, ownTone } = cx;

  for (const e of entries) {
    if (done.has(e)) continue;
    const actor = e.playerId && known.has(e.playerId) ? e.playerId : undefined;
    const mine = actor === me;
    /** An event missing what its beat needs still gets its line, in the engine's own words. */
    const say = () => add({ feed: [{ tone: actor ? ownTone(actor) : 'sys', who: '', text: humanizePlayerIds(next, e.message) }] });
    const ev: EntryCtx = { e, actor, mine, say };

    if (turnEntry(cx, ev) || playEntry(cx, ev) || attackEntry(cx, ev) || moneyEntry(cx, ev) || jsnEntry(cx, ev)) continue;
    if (e.message) add({ feed: [{ tone: 'sys', who: '', text: humanizePlayerIds(next, e.message) }] });
  }

  grabThreats(cx);

  return { steps: cx.steps, memory: cx.mem };
}
