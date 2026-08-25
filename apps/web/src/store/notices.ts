import type { ClientGameState, GameEvent } from '@monopoly-deal/shared';
import { formatEventMessage } from './eventText';
import type { Notice, NoticeTone } from './types';

type FormatMoney = (amount: number) => string;

/** Ever-increasing across the page's lifetime, like `logUtils.ts`'s `entryId` — see that file's comment for why a per-adapter counter would collide. */
let noticeSeq = 0;

/** Stacked notices are capped so a burst (a Deal Breaker chain, a hand-limit cascade) can't cover the board. Enforced globally, not per-recipient, on the assumption a single adapter/session only ever renders one viewer's queue at a time. */
const MAX_QUEUED_NOTICES = 12;

export interface DeriveNoticeOptions {
  /**
   * Network only: true when this `payment_made` is the direct, synchronous
   * result of the viewer's own just-submitted `SELECT_PAYMENT` — they picked
   * the cards and watched the prompt resolve, so a notice would just repeat
   * what they already saw. False (the default) covers the case this fix
   * targets: the payment window expired and the server paid on their behalf
   * with no other acknowledgement anywhere on screen.
   */
  selfInitiatedPayment?: boolean;
}

function strField(data: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = data?.[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Decides whether `event` is worth surfacing as an ephemeral notice, and to
 * whom. Only events that happen *to* a player — not ones they just performed
 * themselves through an interactive drag/tap they already watched resolve —
 * qualify; see the doc comment on {@link Notice} for why this returns a
 * `forPlayerId` rather than filtering against "the current viewer" here.
 * `state` only needs to be roughly current (player roster / names), since it
 * is passed straight through to the already-shipped `formatEventMessage` for
 * the actual wording — this function's own job is purely "does this event
 * deserve a notice, and for whom", not composing prose.
 */
export function deriveNoticesForEvent(
  state: ClientGameState,
  formatMoney: FormatMoney,
  event: GameEvent,
  opts: DeriveNoticeOptions = {},
): { forPlayerId: string; text: string; tone: NoticeTone }[] {
  const data = event.data;
  const out: { forPlayerId: string; text: string; tone: NoticeTone }[] = [];

  switch (event.type) {
    // Theft — the victim only. The actor already watched their own
    // drag/tap resolve on screen; telling them again would be noise.
    case 'sly_deal':
    case 'forced_deal':
    case 'deal_breaker': {
      const victimId = strField(data, 'targetPlayerId');
      if (!victimId || victimId === event.playerId) break;
      const text = formatEventMessage(state, formatMoney, event);
      if (text) out.push({ forPlayerId: victimId, text, tone: 'danger' });
      break;
    }

    // One of the viewer's own sets broke — regardless of what broke it.
    case 'set_broken': {
      if (!event.playerId) break;
      const text = formatEventMessage(state, formatMoney, event);
      if (text) out.push({ forPlayerId: event.playerId, text, tone: 'warning' });
      break;
    }

    // A charge just landed on the payer, before any payment has moved.
    case 'rent_charged':
    case 'debt_collector':
    case 'birthday': {
      const payerId = strField(data, 'payerId');
      if (!payerId) break;
      const text = formatEventMessage(state, formatMoney, event);
      if (text) out.push({ forPlayerId: payerId, text, tone: 'warning' });
      break;
    }

    // Money actually moved. The payee is always passive — notice them
    // regardless of who initiated it. The payer only needs telling when the
    // payment wasn't something they just clicked through themselves.
    case 'payment_made': {
      const payeeId = strField(data, 'payeeId');
      const payerId = event.playerId;
      const text = formatEventMessage(state, formatMoney, event);
      if (!text) break;
      if (payeeId) out.push({ forPlayerId: payeeId, text, tone: 'success' });
      if (payerId && !opts.selfInitiatedPayment) {
        out.push({
          forPlayerId: payerId,
          text: `${text} — your payment window expired, so it was paid automatically`,
          tone: 'warning',
        });
      }
      break;
    }

    default:
      break;
  }

  return out;
}

/** Appends one derived notice, tagging it with a fresh id and enforcing {@link MAX_QUEUED_NOTICES}. */
export function pushNotice(
  notices: Notice[],
  input: { forPlayerId: string; text: string; tone: NoticeTone },
): Notice[] {
  noticeSeq += 1;
  const notice: Notice = { id: noticeSeq, ...input };
  return [...notices, notice].slice(-MAX_QUEUED_NOTICES);
}

/** Convenience: derive + push every notice `events` produces, in one pass. */
export function appendNotices(
  notices: Notice[],
  state: ClientGameState,
  formatMoney: FormatMoney,
  events: GameEvent[],
  opts: DeriveNoticeOptions = {},
): Notice[] {
  let next = notices;
  for (const event of events) {
    for (const input of deriveNoticesForEvent(state, formatMoney, event, opts)) {
      next = pushNotice(next, input);
    }
  }
  return next;
}
