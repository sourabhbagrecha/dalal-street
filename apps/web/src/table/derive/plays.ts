/** Entries for cards played out of the hand: actions on their way, banked money, properties, buildings, Pass Go, Double the Rent. */
import { cardName, stateName } from '../model';
import type { DeriveCtx, EntryCtx } from './context';
import { boardsOf, colorOf, locate, money, num, str } from './helpers';
import type { BeatSpec } from './step';

/** Steps for a card played out of the hand; false when `e` is not one. */
export function playEntry(cx: DeriveCtx, ev: EntryCtx): boolean {
  const { next, me, mem, who, ownTone, prevHand, goneHand, claimed, oldBuildings, completed, add, claim, playedCard, recall, dealFor } = cx;
  const { e, actor, mine } = ev;
  switch (e.type) {
    // ── plays out of the hand ──
    case 'card_played': {
      if (!actor) break;
      const id = str(e.data?.cardId);
      if (id) {
        // An action or rent card on its way to a target or a Just Say No window: remember it for when that resolves.
        const card = claim(playedCard(id, actor));
        if (card) mem.played[actor] = card;
        break;
      }
      // No card id: the engine's "nothing to do with it" plays (a rent with no matching set, a Deal Breaker with no target).
      const wasted = /rent/i.test(e.message)
        ? mine
          ? goneHand.find((c) => c.kind === 'rent' && !claimed.has(c.id))
          : next.discardTop?.kind === 'rent'
            ? next.discardTop
            : undefined
        : mem.played[actor];
      claim(wasted);
      add({
        beat: wasted ? { kind: 'toss', by: actor, card: wasted } : undefined,
        feed: [{ tone: ownTone(actor), who: who(actor), text: wasted ? `wasted ${cardName(wasted)}` : 'wasted a card' }],
      });
      break;
    }
    case 'card_banked': {
      if (!actor) break;
      const id = str(e.data?.cardId);
      const found = locate(next, id);
      const card = claim(found?.kind === 'bank' ? found.card : playedCard(id, actor));
      add({
        beat: card ? { kind: 'lay', by: actor, card, into: 'bank' } : undefined,
        fx: mine && card ? { kind: 'bank', text: `+${money(card.value)}`, amount: card.value } : undefined,
        feed: [{ tone: ownTone(actor), who: who(actor), text: card ? `banked ${cardName(card)}${card.kind === 'money' ? '' : ` (${money(card.value)})`}` : 'banked a card' }],
      });
      break;
    }
    case 'property_placed': {
      if (!actor) break;
      const id = str(e.data?.cardId);
      const found = locate(next, id);
      const card = claim(found?.card ?? (mine && id ? prevHand.get(id) : undefined));
      const setId = found?.set?.id ?? str(e.data?.setId);
      const color = colorOf(e.data?.color) ?? found?.set?.color;
      const finished = !!setId && completed.has(setId);
      const state = color ? stateName(color) : 'a set';
      const name = !card ? 'a property' : card.kind === 'property_wild' ? `Wild as ${state}` : cardName(card);
      add({
        beat: card && setId ? { kind: 'lay', by: actor, card, into: 'set', setId, completed: finished } : undefined,
        fx: mine
          ? finished
            ? { kind: 'set', text: `${state} complete!`, color }
            : { kind: 'build', text: card?.kind === 'property_wild' ? `${state} +1` : card ? cardName(card) : state, color }
          : undefined,
        feed: [{ tone: mine && finished ? 'good' : ownTone(actor), who: who(actor), text: `played ${name}${finished ? ` — ${state} complete!` : ''}` }],
      });
      break;
    }
    case 'house_placed':
    case 'hotel_placed': {
      if (!actor) break;
      const kind = e.type === 'house_placed' ? 'house' : 'hotel';
      // The engine's message is all there is: the new building on the actor's table, else the card they played.
      const fresh = boardsOf(next)
        .filter((b) => b.id === actor)
        .flatMap((b) => b.board.sets.map((s) => ({ set: s, card: kind === 'house' ? s.house : s.hotel })))
        .find((x) => x.card && !oldBuildings.has(x.card.id));
      const remembered = mem.played[actor];
      const homed = remembered ? locate(next, remembered.id) : undefined;
      const set = fresh?.set ?? homed?.set;
      const card = claim(fresh?.card ?? homed?.card);
      add({
        beat: card && set ? { kind: 'lay', by: actor, card, into: 'set', setId: set.id } : undefined,
        fx: mine ? { kind: 'build', text: kind === 'house' ? 'House' : 'Hotel', color: set?.color } : undefined,
        feed: [{ tone: ownTone(actor), who: who(actor), text: `built a ${kind === 'house' ? 'House' : 'Hotel'} on ${set ? stateName(set.color) : 'a set'}` }],
      });
      break;
    }
    case 'pass_go': {
      if (!actor) break;
      const played = claim(recall(actor, 'pass_go'));
      const cards = mine ? dealFor(num(e.data?.count)) : [];
      const n = mine ? cards.length || (num(e.data?.count) ?? 0) : 0;
      // A rival's cards come off the deck unseen: only the Pass Go itself is thrown.
      const beat: BeatSpec | undefined =
        mine && cards.length ? { kind: 'deal', to: me, cards, ...(played ? { played } : {}) } : played ? { kind: 'toss', by: actor, card: played } : undefined;
      add({
        beat,
        fx: n ? { kind: 'draw', text: `+${n} cards`, amount: n } : undefined,
        feed: [{ tone: ownTone(actor), who: who(actor), text: 'played Pass Go' }],
      });
      break;
    }
    case 'double_the_rent': {
      if (!actor) break;
      const played = claim(recall(actor, 'double_the_rent'));
      add({
        beat: played ? { kind: 'toss', by: actor, card: played } : undefined,
        feed: [{ tone: ownTone(actor), who: who(actor), text: 'played Double the Rent' }],
      });
      break;
    }
    default:
      return false;
  }
  return true;
}
