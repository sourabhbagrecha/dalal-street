import type { ClientGameState, GameEvent } from '@monopoly-deal/shared';
import { formatEventMessage } from './eventText';
import type { Notice, NoticeTone } from './types';

type FormatMoney = (amount: number) => string;

/**
 * Given a candidate recipient's player id, returns the `ClientGameState`
 * *as that player would see it* (`viewerId` = that id, `you`/`players` split
 * redacted accordingly) — or null if that view can't be produced right now.
 *
 * This matters because `formatEventMessage`'s "You" vs. a real name framing
 * is resolved against `state.viewerId` at the moment it's called. A notice
 * addressed to Marcus has to be worded as Marcus would read it ("Aarav
 * sly-dealt a property from you") — composing it once, eagerly, against
 * whoever the *current* live viewer happens to be (the actor, almost always,
 * in local pass-and-play — see the `Notice` doc comment) would bake in the
 * wrong pronoun and stay wrong forever, since the text is stored, not
 * recomputed. Local pass-and-play can build any seat's view cheaply from its
 * own engine state; network mode only ever needs (and only ever safely can
 * produce) the view for its own single fixed viewer.
 */
export type ViewerStateFor = (playerId: string) => ClientGameState | null;

/** Stacked notices are capped so a burst (a Deal Breaker chain, a hand-limit cascade) can't cover the board. Enforced globally, not per-recipient, on the assumption a single adapter/session only ever renders one viewer's queue at a time. */
const MAX_QUEUED_NOTICES = 12;

/** Ever-increasing across the page's lifetime, like `logUtils.ts`'s `entryId` — see that file's comment for why a per-adapter counter would collide. */
let noticeSeq = 0;

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

/** Resolves and appends one candidate notice, skipping it silently if `stateFor` can't produce that recipient's view or the formatter has nothing to say. */
function tryPush(
  out: { forPlayerId: string; text: string; tone: NoticeTone }[],
  stateFor: ViewerStateFor,
  formatMoney: FormatMoney,
  event: GameEvent,
  forPlayerId: string,
  tone: NoticeTone,
  suffix?: string,
): void {
  const state = stateFor(forPlayerId);
  if (!state) return;
  const text = formatEventMessage(state, formatMoney, event);
  if (!text) return;
  out.push({ forPlayerId, text: suffix ? `${text}${suffix}` : text, tone });
}

/**
 * Decides whether `event` is worth surfacing as an ephemeral notice, and to
 * whom. Only events that happen *to* a player — not ones they just performed
 * themselves through an interactive drag/tap they already watched resolve —
 * qualify; see the doc comment on {@link Notice} for why this returns a
 * `forPlayerId` alongside the text. `stateFor` supplies each candidate
 * recipient's own view for wording purposes — see {@link ViewerStateFor}.
 */
export function deriveNoticesForEvent(
  stateFor: ViewerStateFor,
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
      tryPush(out, stateFor, formatMoney, event, victimId, 'danger');
      break;
    }

    // One of the affected player's own sets broke — regardless of what broke it.
    case 'set_broken': {
      if (!event.playerId) break;
      tryPush(out, stateFor, formatMoney, event, event.playerId, 'warning');
      break;
    }

    // A charge just landed on the payer, before any payment has moved.
    case 'rent_charged':
    case 'debt_collector':
    case 'birthday': {
      const payerId = strField(data, 'payerId');
      if (!payerId) break;
      tryPush(out, stateFor, formatMoney, event, payerId, 'warning');
      break;
    }

    // Money actually moved. The payee is always passive — notice them
    // regardless of who initiated it. The payer only needs telling when the
    // payment wasn't something they just clicked through themselves.
    case 'payment_made': {
      const payeeId = strField(data, 'payeeId');
      const payerId = event.playerId;
      if (payeeId) tryPush(out, stateFor, formatMoney, event, payeeId, 'success');
      if (payerId && !opts.selfInitiatedPayment) {
        tryPush(
          out,
          stateFor,
          formatMoney,
          event,
          payerId,
          'warning',
          ' — your payment window expired, so it was paid automatically',
        );
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
  stateFor: ViewerStateFor,
  formatMoney: FormatMoney,
  events: GameEvent[],
  opts: DeriveNoticeOptions = {},
): Notice[] {
  let next = notices;
  for (const event of events) {
    for (const input of deriveNoticesForEvent(stateFor, formatMoney, event, opts)) {
      next = pushNotice(next, input);
    }
  }
  return next;
}
