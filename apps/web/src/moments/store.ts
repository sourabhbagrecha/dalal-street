/**
 * The single module-level "table moments" store. See `moments/types.ts` for
 * the full contract and the brief's "Callout selection rules" / "Highlights"
 * sections for the exact policy encoded here.
 */
import { useSyncExternalStore } from 'react';
import type {
  Highlight,
  HighlightKind,
  Moment,
  MomentKind,
  MomentState,
  MomentStoreApi,
  Notice,
} from './types';

const MOMENTS_CAP = 60;
const NOTICES_CAP = 12;
const HIGHLIGHTS_CAP = 40;

/** Kinds that ever get a callout. `set_broken` / `action_cancelled` never do. */
const CALLOUT_KINDS = new Set<MomentKind>([
  'sly_deal',
  'forced_deal',
  'deal_breaker',
  'debt_collector',
  'birthday',
  'rent',
  'just_say_no',
  'payment',
]);

/** Kinds whose callout coalesces per-actor within one `ingest` batch. */
const COALESCED_CALLOUT_KINDS = new Set<MomentKind>(['birthday', 'rent']);

const HIGHLIGHT_DURATION_MS: Record<HighlightKind, number> = {
  targeted: 2600,
  stolen: 1800,
  received: 1800,
  paid: 1400,
  gained: 1400,
  denied: 1800,
  blocked: 1800,
};

interface HighlightSpec {
  kind: HighlightKind;
  playerId: string;
  cardIds: string[];
  setId?: string;
}

function highlightSpecsFor(moment: Moment): HighlightSpec[] {
  switch (moment.kind) {
    case 'sly_deal':
    case 'deal_breaker': {
      const cardIds = moment.cards.map((c) => c.id);
      const victim = moment.targetIds[0];
      const out: HighlightSpec[] = [];
      if (victim) out.push({ kind: 'stolen', playerId: victim, cardIds, setId: moment.setId });
      out.push({ kind: 'received', playerId: moment.actorId, cardIds, setId: moment.setId });
      return out;
    }
    case 'forced_deal': {
      const victim = moment.targetIds[0];
      const takenIds = moment.cards.map((c) => c.id);
      const givenIds = moment.givenCard ? [moment.givenCard.id] : [];
      const out: HighlightSpec[] = [];
      if (victim) {
        out.push({ kind: 'stolen', playerId: victim, cardIds: takenIds });
        if (givenIds.length > 0) out.push({ kind: 'received', playerId: victim, cardIds: givenIds });
      }
      out.push({ kind: 'received', playerId: moment.actorId, cardIds: takenIds });
      return out;
    }
    case 'debt_collector':
    case 'birthday':
    case 'rent': {
      const payer = moment.targetIds[0];
      return payer ? [{ kind: 'targeted', playerId: payer, cardIds: [] }] : [];
    }
    case 'payment': {
      const payee = moment.targetIds[0];
      const cardIds = moment.cards.map((c) => c.id);
      const out: HighlightSpec[] = [{ kind: 'paid', playerId: moment.actorId, cardIds }];
      if (payee) out.push({ kind: 'gained', playerId: payee, cardIds });
      return out;
    }
    case 'just_say_no': {
      const denied = moment.targetIds[0];
      const out: HighlightSpec[] = [{ kind: 'blocked', playerId: moment.actorId, cardIds: [] }];
      if (denied) out.push({ kind: 'denied', playerId: denied, cardIds: [] });
      return out;
    }
    default:
      return [];
  }
}

/** Notice recipients: `targetIds`, plus the payer for `payment` (a receipt).
 * `action_cancelled` is skipped entirely — its target already gets a
 * `just_say_no` notice for the same JSN ("Marcus says NO to your..."), and a
 * second notice ("...was cancelled by Marcus's Just Say No") for the same
 * event just doubles the stack with the same information restated. */
function noticeRecipientsFor(moment: Moment): string[] {
  if (moment.kind === 'action_cancelled') return [];
  const recipients = new Set(moment.targetIds);
  if (moment.kind === 'payment') recipients.add(moment.actorId);
  return [...recipients];
}

function initialState(): MomentState {
  return {
    moments: [],
    calloutQueue: [],
    notices: [],
    highlights: [],
    flights: [],
    feedSeenUpTo: 0,
    selfPaymentAt: null,
  };
}

let state: MomentState = initialState();
const listeners = new Set<() => void>();
// Monotonic id counters — the contract explicitly exempts these from purity.
let noticeSeq = 0;
let highlightSeq = 0;

function setState(next: MomentState): void {
  state = next;
  for (const listener of listeners) listener();
}

export const momentStore: MomentStoreApi = {
  getState() {
    return state;
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  ingest(moments, viewerId) {
    if (moments.length === 0) return;

    const newCalloutIds: number[] = [];
    const coalescedThisBatch = new Set<string>();
    const newNotices: Notice[] = [];
    const newHighlights: Highlight[] = [];

    for (const moment of moments) {
      if (CALLOUT_KINDS.has(moment.kind)) {
        let enqueue = true;
        if (moment.kind === 'payment' && moment.selfInitiated && moment.actorId === viewerId) {
          enqueue = false;
        }
        if (enqueue && COALESCED_CALLOUT_KINDS.has(moment.kind)) {
          const key = `${moment.kind}:${moment.actorId}`;
          if (coalescedThisBatch.has(key)) enqueue = false;
          else coalescedThisBatch.add(key);
        }
        if (enqueue) newCalloutIds.push(moment.id);
      }

      for (const recipient of noticeRecipientsFor(moment)) {
        if (moment.kind === 'payment' && moment.selfInitiated && recipient === viewerId) continue;
        noticeSeq += 1;
        newNotices.push({
          id: noticeSeq,
          momentId: moment.id,
          forPlayerId: recipient,
          shownAt: recipient === viewerId ? moment.at : null,
        });
      }

      for (const spec of highlightSpecsFor(moment)) {
        highlightSeq += 1;
        newHighlights.push({
          id: highlightSeq,
          kind: spec.kind,
          playerId: spec.playerId,
          cardIds: spec.cardIds,
          setId: spec.setId,
          until: moment.at + HIGHLIGHT_DURATION_MS[spec.kind],
        });
      }
    }

    setState({
      ...state,
      moments: [...state.moments, ...moments].slice(-MOMENTS_CAP),
      calloutQueue: [...state.calloutQueue, ...newCalloutIds],
      notices: [...state.notices, ...newNotices].slice(-NOTICES_CAP),
      highlights: [...state.highlights, ...newHighlights].slice(-HIGHLIGHTS_CAP),
    });
  },

  advanceCallout() {
    if (state.calloutQueue.length === 0) return;
    setState({ ...state, calloutQueue: state.calloutQueue.slice(1) });
  },

  markWitnessed(momentId, viewerId) {
    let changed = false;
    const moments = state.moments.map((m) => {
      if (m.id !== momentId || m.witnessedBy.includes(viewerId)) return m;
      changed = true;
      return { ...m, witnessedBy: [...m.witnessedBy, viewerId] };
    });
    if (changed) setState({ ...state, moments });
  },

  replayForViewer(viewerId) {
    const unwitnessed = state.moments.filter(
      (m) => m.targetIds.includes(viewerId) && !m.witnessedBy.includes(viewerId),
    );
    const latest = unwitnessed.slice(-3);
    const alreadyQueued = new Set(state.calloutQueue);
    const toAdd = latest.map((m) => m.id).filter((id) => !alreadyQueued.has(id));
    if (toAdd.length === 0) return [];
    setState({ ...state, calloutQueue: [...state.calloutQueue, ...toAdd] });
    return toAdd;
  },

  dismissNotice(id) {
    const notices = state.notices.filter((n) => n.id !== id);
    if (notices.length !== state.notices.length) setState({ ...state, notices });
  },

  markNoticeShown(id, now) {
    let changed = false;
    const notices = state.notices.map((n) => {
      if (n.id !== id || n.shownAt !== null) return n;
      changed = true;
      return { ...n, shownAt: now };
    });
    if (changed) setState({ ...state, notices });
  },

  expireNotices(now, ttlMs) {
    const notices = state.notices.filter((n) => n.shownAt === null || n.shownAt + ttlMs >= now);
    if (notices.length !== state.notices.length) setState({ ...state, notices });
  },

  addHighlights(highlights) {
    if (highlights.length === 0) return;
    setState({ ...state, highlights: [...state.highlights, ...highlights].slice(-HIGHLIGHTS_CAP) });
  },

  pruneHighlights(now) {
    const highlights = state.highlights.filter((h) => h.until > now);
    if (highlights.length !== state.highlights.length) setState({ ...state, highlights });
  },

  addFlights(flights) {
    if (flights.length === 0) return;
    setState({ ...state, flights: [...state.flights, ...flights] });
  },

  removeFlights(ids) {
    if (ids.length === 0) return;
    const toRemove = new Set(ids);
    const flights = state.flights.filter((f) => !toRemove.has(f.id));
    if (flights.length !== state.flights.length) setState({ ...state, flights });
  },

  markFeedSeen(upToLogId) {
    if (upToLogId <= state.feedSeenUpTo) return;
    setState({ ...state, feedSeenUpTo: upToLogId });
  },

  noteSelfPaymentSubmitted(now) {
    setState({ ...state, selfPaymentAt: now });
  },

  reset() {
    setState(initialState());
  },
};

export function useMomentState(): MomentState {
  return useSyncExternalStore(momentStore.subscribe, momentStore.getState, momentStore.getState);
}
