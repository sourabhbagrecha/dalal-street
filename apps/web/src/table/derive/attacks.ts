/** Entries for the attacks that resolve (Sly Deal, Forced Deal, Deal Breaker), and the pending ones aimed at the viewer. */
import { isCompleteSet } from '@monopoly-deal/engine';
import { collectPendingContested, threatKeyForContested } from '../../moments/derive';
import { cardName, stateName } from '../model';
import type { DeriveCtx, EntryCtx } from './context';
import { actionLabel, boardsOf, colorOf, findSet, locate, str, strs, withBuildings } from './helpers';

/** Steps for a resolved steal; false when `e` is not one. */
export function attackEntry(cx: DeriveCtx, ev: EntryCtx): boolean {
  const { next, me, known, who, them, possessive, sideTone, add, faceFor } = cx;
  const { e, actor, mine, say } = ev;
  switch (e.type) {
    // ── attacks that resolve ──
    case 'sly_deal': {
      if (!actor) break;
      const victim = str(e.data?.targetPlayerId);
      if (!victim || !known.has(victim)) {
        say();
        break;
      }
      const found = locate(next, str(e.data?.cardId));
      const card = found?.card;
      const played = faceFor(actor, 'sly_deal');
      const name = card ? cardName(card) : 'a property';
      const color = card?.kind === 'property' ? card.color : found?.set?.color;
      add({
        beat: card && found?.set && played ? { kind: 'loot', by: actor, from: victim, card, setId: found.set.id, played, label: 'SLY DEAL' } : undefined,
        fx: mine ? { kind: 'steal', text: `Stole ${name}`, color } : victim === me ? { kind: 'stolen', text: `${who(actor)} stole ${name}`, color } : undefined,
        feed: [{ tone: sideTone(actor, victim), who: who(actor), text: victim === me ? `stole your ${name}` : `Sly Dealt ${name} from ${them(victim)}` }],
      });
      break;
    }
    case 'forced_deal': {
      if (!actor) break;
      const victim = str(e.data?.targetPlayerId);
      if (!victim || !known.has(victim)) {
        say();
        break;
      }
      const theirs = locate(next, str(e.data?.targetCardId));
      const own = locate(next, str(e.data?.ownCardId));
      const played = faceFor(actor, 'forced_deal');
      const got = theirs ? cardName(theirs.card) : 'a property';
      const gave = own ? cardName(own.card) : 'a property';
      const color = theirs?.card.kind === 'property' ? theirs.card.color : theirs?.set?.color;
      add({
        beat: theirs?.set && played ? { kind: 'loot', by: actor, from: victim, card: theirs.card, setId: theirs.set.id, played, label: 'FORCED DEAL' } : undefined,
        fx: mine ? { kind: 'steal', text: `Swapped for ${got}`, color } : victim === me ? { kind: 'stolen', text: `${who(actor)} took ${got}`, color } : undefined,
        feed: [{ tone: sideTone(actor, victim), who: who(actor), text: victim === me ? `swapped their ${gave} for your ${got}` : `swapped ${gave} for ${possessive(victim)} ${got}` }],
      });
      // The other half of the swap: a second card changes hands, staged as a handing-over.
      if (own && own.owner === victim) add({ beat: { kind: 'pay', by: actor, to: victim, cards: [own.card], label: 'SWAP' } });
      break;
    }
    case 'deal_breaker': {
      if (!actor) break;
      const victim = str(e.data?.targetPlayerId);
      if (!victim || !known.has(victim)) {
        say();
        break;
      }
      const color = colorOf(e.data?.color);
      const played = faceFor(actor, 'deal_breaker');
      // The set got a fresh id on its new table: find it by its cards, else by colour.
      const set =
        strs(e.data?.cardIds)
          ?.map((id) => locate(next, id))
          .find((f) => f?.set && f.owner === actor)?.set ??
        boardsOf(next)
          .find((b) => b.id === actor)
          ?.board.sets.find((s) => color && s.color === color && isCompleteSet(s));
      const c = set?.color ?? color;
      const state = c ? stateName(c) : 'a set';
      add({
        beat: set && played ? { kind: 'raid', by: actor, from: victim, set: withBuildings(set), played, label: 'DEAL BREAKER' } : undefined,
        fx: mine ? { kind: 'steal', text: `Took ${state}`, color: c } : undefined,
        feed: [{ tone: sideTone(actor, victim), who: who(actor), text: `took ${possessive(victim)} ${state} — Deal Breaker!` }],
      });
      break;
    }
    default:
      return false;
  }
  return true;
}

/** A rival's Sly Deal, Forced Deal or Deal Breaker with a hand on your card, waiting on your Just Say No. */
export function grabThreats(cx: DeriveCtx): void {
  const { next, me, mem, who, add, faceFor } = cx;
  const live = new Set<string>();
  for (const { contestedAction: c, respondentId } of collectPendingContested(next)) {
    const key = threatKeyForContested(c);
    if (!key) continue;
    live.add(key);
    if (respondentId !== me || c.actorId === me || mem.grabbed.includes(key)) continue;
    if (c.type !== 'sly_deal' && c.type !== 'forced_deal' && c.type !== 'deal_breaker') continue;
    mem.grabbed.push(key);
    const p = c.payload ?? {};
    const set = c.type === 'deal_breaker' ? findSet(next, me, str(p.targetSetId)) : undefined;
    const card = set ? set.cards[0] : locate(next, str(p.targetCardId))?.card;
    const played = faceFor(c.actorId, c.type);
    const label = c.type === 'sly_deal' ? 'SLY DEAL' : c.type === 'forced_deal' ? 'FORCED DEAL' : 'DEAL BREAKER';
    add({
      beat: card && played ? { kind: 'grab', by: c.actorId, from: me, card, played, label } : undefined,
      feed: [{ tone: 'bad', who: who(c.actorId), text: set ? `plays Deal Breaker on your ${stateName(set.color)}` : `plays ${actionLabel(c.type)} on your ${card ? cardName(card) : 'property'}` }],
    });
  }
  mem.grabbed = mem.grabbed.filter((k) => live.has(k));
}
