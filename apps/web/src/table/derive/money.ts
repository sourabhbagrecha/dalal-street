/** Entries for money owed and paid: rent, birthdays and debts (one levy per play, with the payments settled in the batch), payments, broken sets. */
import type { Card } from '@monopoly-deal/shared';
import type { LogEntry } from '../../store/types';
import { stateName } from '../model';
import type { DeriveCtx, EntryCtx } from './context';
import { boardsOf, colorOf, money, num, str, tableAssets } from './helpers';

const LEVY_CONTESTED = { rent_charged: 'rent', birthday: 'its_my_birthday', debt_collector: 'debt_collector' } as const;

/** Steps for a levy or payment entry; false when `e` is not one. */
export function moneyEntry(cx: DeriveCtx, ev: EntryCtx): boolean {
  const { entries, prev, next, me, known, who, them, done, add, claim, faceFor, payDetail, payNews } = cx;
  const { e, actor, mine, say } = ev;
  switch (e.type) {
    // ── money owed and paid ──
    case 'rent_charged':
    case 'birthday':
    case 'debt_collector': {
      if (!actor) break;
      // One levy per play, however many payers it names.
      const group = entries.filter((x) => x.type === e.type && x.playerId === actor && !done.has(x));
      for (const x of group) done.add(x);
      const type = LEVY_CONTESTED[e.type];
      const payers = [...new Set(group.map((x) => str(x.data?.payerId)).filter((id): id is string => !!id && known.has(id)))];
      const amount = num(group[0]?.data?.amount) ?? (type === 'debt_collector' ? 5 : type === 'its_my_birthday' ? 2 : 0);
      const played = claim(faceFor(actor, type));
      const rentColor = type === 'rent' ? colorOf(group[0]?.data?.color) : undefined;
      const set = rentColor ? boardsOf(next).find((b) => b.id === actor)?.board.sets.find((s) => s.color === rentColor && s.cards.length > 0) : undefined;
      // Payments settled inside the same batch travel with the levy; later ones arrive as their own `pay`.
      const settled: LogEntry[] = [];
      const takes = payers.flatMap((payer) => {
        const paid = entries.filter((x) => x.type === 'payment_made' && x.playerId === payer && str(x.data?.payeeId) === actor && !done.has(x));
        // A payer with nothing on the table is never asked to pay (the engine skips the payment): it is a "BROKE!" on the stage.
        if (paid.length === 0) return tableAssets(prev, payer) === 0 ? [{ from: payer, owed: amount, cards: [] as Card[] }] : [];
        paid.forEach((x) => done.add(x));
        settled.push(...paid);
        return [{ from: payer, owed: amount, cards: paid.flatMap((x) => payDetail(x)?.cards ?? []) }];
      });
      // A card that charges everyone skips the rivals with nothing to pay with, and never names them: they are BROKE too.
      if (type === 'its_my_birthday' || (played?.kind === 'rent' && played.rentType === 'dual')) {
        for (const { id } of boardsOf(next)) {
          if (id !== actor && !payers.includes(id) && tableAssets(prev, id) === 0) takes.push({ from: id, owed: amount, cards: [] });
        }
      }
      const aimed = payers.length === 1 ? payers[0] : undefined;
      const owesMe = payers.includes(me);
      const names = payers.map(them).join(' & ');
      const label =
        type === 'rent' ? `RENT ${money(amount)}` : type === 'its_my_birthday' ? (mine ? 'HAPPY BIRTHDAY!' : `BIRTHDAY ${money(amount)}`) : mine ? 'DEBT COLLECTOR' : `DEBT ${money(amount)}`;
      const text = mine
        ? type === 'rent'
          ? `charged ${money(amount)} rent${rentColor ? ` on ${stateName(rentColor)}` : ''}`
          : type === 'its_my_birthday'
            ? "played It's My Birthday"
            : `demanded ${money(amount)} from ${names}`
        : type === 'rent'
          ? owesMe
            ? `charges you ${money(amount)} rent`
            : `charges ${names} ${money(amount)} rent`
          : type === 'its_my_birthday'
            ? owesMe
              ? `played It's My Birthday — you owe ${money(amount)}`
              : "played It's My Birthday"
            : owesMe
              ? `plays Debt Collector — you owe ${money(amount)}`
              : `demands ${money(amount)} from ${names}`;
      add({
        // A Debt Collector with no known target has nowhere to land.
        beat: played && (type !== 'debt_collector' || aimed) ? { kind: 'levy', by: actor, played, label, ...(set ? { setId: set.id } : {}), takes, ...(aimed ? { aimed } : {}) } : undefined,
        feed: [{ tone: mine ? 'good' : owesMe ? 'bad' : 'rival', who: who(actor), text }],
      });
      for (const x of settled) {
        const d = payDetail(x);
        if (d) add(payNews(d));
      }
      break;
    }
    case 'payment_made': {
      const d = payDetail(e);
      if (!d) {
        say();
        break;
      }
      const { payer, payee, total, cards } = d;
      const label = payer === me ? `−${money(total)}` : payee === me ? `+${money(total)}` : money(total);
      add({ beat: cards.length ? { kind: 'pay', by: payer, to: payee, cards, label } : undefined, ...payNews(d) });
      break;
    }
    case 'set_broken': {
      if (!actor) break;
      const color = colorOf(e.data?.color);
      add({ feed: [{ tone: mine ? 'bad' : 'rival', who: who(actor), text: `${color ? `${stateName(color)} ` : ''}set broke` }] });
      break;
    }
    default:
      return false;
  }
  return true;
}
