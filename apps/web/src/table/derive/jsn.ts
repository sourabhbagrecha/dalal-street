/** Entries for Just Say No: the block itself, a declined window, and cancelled or timed-out actions. */
import { humanizePlayerIds } from '../../derivations';
import { collectPendingContested, synthesizeFaceCard } from '../../moments/derive';
import type { DeriveCtx, EntryCtx } from './context';
import { actionLabel, contestedOf, findSet, isJsn, locate, num, str } from './helpers';

const FORFEIT_KINDS = new Set(['sly_deal_target', 'forced_deal_target', 'deal_breaker_target', 'debt_collector_target', 'rent_color_choice', 'rent_player_choice', 'house_hotel_target']);

/** Steps for a Just Say No or cancellation entry; false when `e` is not one. */
export function jsnEntry(cx: DeriveCtx, ev: EntryCtx): boolean {
  const { entries, prev, next, me, mem, who, possessive, goneHand, claimed, add, claim, faceFor } = cx;
  const { e, actor, mine } = ev;
  switch (e.type) {
    // ── Just Say No ──
    case 'just_say_no': {
      if (!actor) break;
      // What is being contested: the cancelled/pending action the engine attached, else the pending stack on either side.
      const named = str(e.data?.contestedActorId);
      const contested = entries.map((x) => contestedOf(x.data?.contested)).find((c) => c && c.actorId === named) ?? collectPendingContested(prev).find((p) => p.respondentId === actor)?.contestedAction ?? collectPendingContested(next).find((p) => p.respondentId === actor)?.contestedAction;
      const type = str(e.data?.contestedType) ?? contested?.type;
      const from = named ?? contested?.actorId;
      const target = str(e.data?.contestedTargetId) ?? contested?.targetPlayerId;
      const counter = (num(e.data?.chain) ?? 1) >= 2;
      const against = actor === from ? target : from;
      const jsn = claim((mine ? goneHand.find((c) => isJsn(c) && !claimed.has(c.id)) : undefined) ?? (isJsn(next.discardTop) ? next.discardTop : (synthesizeFaceCard('just_say_no') ?? undefined)));
      const label = actionLabel(type);

      // What the Just Say No lands on: the card at stake, else the play that started it.
      const p = contested?.payload ?? {};
      const victim = str(p.targetPlayerId) ?? contested?.targetPlayerId;
      const stake =
        contested?.type === 'sly_deal' || contested?.type === 'forced_deal'
          ? (locate(next, str(p.targetCardId)) ?? locate(prev, str(p.targetCardId)))?.card
          : contested?.type === 'deal_breaker'
            ? (findSet(next, victim, str(p.targetSetId)) ?? findSet(prev, victim, str(p.targetSetId)))?.cards[0]
            : undefined;
      const onCard = stake ?? (from && type ? faceFor(from, type) : undefined);
      // The stage shows a Just Say No the viewer plays, or one played against the viewer's own play; the rest is a card thrown.
      const staged = !!jsn && !!against && !!onCard && (mine || from === me);

      add({
        beat: staged ? { kind: 'block', by: actor, against, played: jsn, card: onCard, label: 'JUST SAY NO!' } : jsn ? { kind: 'toss', by: actor, card: jsn } : undefined,
        fx: mine ? { kind: 'jsn', text: 'Just Say No!' } : undefined,
        feed: [
          {
            tone: mine ? 'good' : from === me || target === me ? 'bad' : 'rival',
            who: who(actor),
            text: counter ? 'said NO right back!' : `said NO to ${!from ? 'their' : from === actor ? 'their own' : possessive(from)} ${label}`,
          },
        ],
      });
      break;
    }
    case 'just_say_no_declined': {
      // Paying straight through the window lets it through too; the payment line says so.
      const paid = entries.some((x) => x.type === 'payment_made' && x.playerId === me);
      if (mine && !paid) add({ feed: [{ tone: 'you', who: 'You', text: 'let it through' }] });
      break;
    }
    case 'action_cancelled': {
      if (e.data?.forced === true) {
        // A choice that ran out of time: the card was already on the pile.
        const kind = str(e.data?.kind);
        const played = actor && kind && FORFEIT_KINDS.has(kind) ? claim(mem.played[actor]) : undefined;
        add({
          beat: actor && played ? { kind: 'toss', by: actor, card: played } : undefined,
          feed: [{ tone: 'sys', who: '', text: actor ? `${who(actor)} ran out of time` : 'Ran out of time' }],
        });
        break;
      }
      const contested = contestedOf(e.data?.contested);
      // The Just Say No that cancelled it has already said so.
      if (contested && entries.some((x) => x.type === 'just_say_no')) break;
      add({
        feed: [
          contested
            ? { tone: contested.actorId === me ? 'bad' : contested.targetPlayerId === me ? 'good' : 'sys', who: '', text: `${actionLabel(contested.type)} cancelled` }
            : { tone: 'sys', who: '', text: humanizePlayerIds(next, e.message) },
        ],
      });
      break;
    }
    default:
      return false;
  }
  return true;
}
