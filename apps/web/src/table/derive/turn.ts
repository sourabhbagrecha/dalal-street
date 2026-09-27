/** Entries about the turn itself (draws, turn changes, discards, connections) and the rest of the story (moves, the win). */
import { nameFor } from '../../derivations';
import { cardName, stateName } from '../model';
import type { DeriveCtx, EntryCtx } from './context';
import { colorOf, locate, num, plural } from './helpers';
import type { FeedSpec } from './step';

/** Steps for a turn or story entry; false when `e` is not one. */
export function turnEntry(cx: DeriveCtx, ev: EntryCtx): boolean {
  const { next, me, who, possessive, ownTone, goneHand, claimed, add, claim, dealFor } = cx;
  const { e, actor, mine } = ev;
  switch (e.type) {
    // ── the turn ──
    case 'cards_drawn': {
      if (!actor || !mine) break;
      const count = num(e.data?.count);
      const cards = dealFor(count);
      const n = cards.length || (count ?? 0);
      add({
        beat: cards.length ? { kind: 'deal', to: me, cards } : undefined,
        fx: n ? { kind: 'draw', text: `+${n} cards`, amount: n } : undefined,
        feed: [{ tone: 'you', who: 'You', text: n ? `drew ${plural(n, 'card')}` : 'drew cards' }],
      });
      break;
    }
    case 'turn_ended': {
      if (!actor) break;
      const order = next.players.map((p) => p.id);
      const to = order[(order.indexOf(actor) + 1) % Math.max(1, order.length)];
      const nextLine: FeedSpec = { tone: 'sys', who: '', text: to === me ? 'Your turn' : to ? `${nameFor(next, to)}'s turn` : 'Next turn' };
      // The turn clock hit zero rather than an END TURN tap (see room.ts's TIMEOUT_COMMANDS): say so before naming who's up next.
      const feed = e.data?.timeout ? [{ tone: 'sys', who: '', text: `Time ran out: ${possessive(actor)} turn ended` } as FeedSpec, nextLine] : [nextLine];
      add({ feed });
      break;
    }
    case 'deck_reshuffled':
      add({ feed: [{ tone: 'sys', who: '', text: 'Discard pile reshuffled into the deck' }] });
      break;
    case 'player_connection': {
      // Your own link coming and going is the connection banner's business, not the table's.
      if (actor && !mine) add({ feed: [{ tone: 'sys', who: who(actor), text: e.data?.connected === false ? 'is away' : 'is back' }] });
      break;
    }
    case 'discarded': {
      if (mine) add({ feed: [{ tone: 'sys', who: '', text: `Hand limit — discard ${num(e.data?.count) ?? ''}`.trim() }] });
      break;
    }
    case 'turn_resumed': {
      if (actor) add({ feed: [{ tone: ownTone(actor), who: who(actor), text: 'kept playing' }] });
      break;
    }
    case 'hand_limit_discard': {
      if (!actor) break;
      const n = num(e.data?.count) ?? 1;
      const line: FeedSpec = { tone: ownTone(actor), who: who(actor), text: `discarded ${plural(n, 'card')}` };
      if (mine) {
        const cards = goneHand.filter((c) => !claimed.has(c.id)).slice(-n);
        if (cards.length === 0) add({ feed: [line] });
        cards.forEach((c, i) => {
          claim(c);
          add({ beat: { kind: 'toss', by: me, card: c }, feed: i === 0 ? [line] : [] });
        });
      } else {
        // Their cards are public once thrown, but only the top of the pile is in the projection.
        const top = next.discardTop && !claimed.has(next.discardTop.id) ? claim(next.discardTop) : undefined;
        add({ beat: top ? { kind: 'toss', by: actor, card: top } : undefined, feed: [line] });
      }
      break;
    }

    // ── the rest of the story ──
    case 'rearranged': {
      if (!actor) break;
      const m = /rearranged (\S+) to (\S+)$/.exec(e.message);
      const found = locate(next, m?.[1]);
      const color = colorOf(m?.[2]);
      add({ feed: [{ tone: ownTone(actor), who: who(actor), text: `moved ${found ? cardName(found.card) : 'a card'}${color ? ` to ${stateName(color)}` : ''}` }] });
      break;
    }
    case 'winner': {
      if (!actor) break;
      const n = num(e.data?.setCount) ?? 3;
      add({
        fx: mine ? { kind: 'win', text: n === 3 ? 'Three sets!' : `${n} sets!` } : undefined,
        feed: [{ tone: mine ? 'good' : 'bad', who: who(actor), text: mine ? `won with ${n} sets!` : `wins with ${n} sets` }],
      });
      break;
    }
    // Folded into the property that completed the set / the new deal.
    case 'set_completed':
    case 'game_started':
      break;
    default:
      return false;
  }
  return true;
}
