/**
 * Watches the event log for fresh table moments, feeds them into the store,
 * and — the one place that has both moments and the DOM — builds the card
 * flights that fly between the two players' on-screen anchors.
 *
 * Mirrors `useCardDrawFlights`'s "last seen id + reset detection" pattern
 * exactly: a shrinking max log id means the log restarted (fixture reload,
 * new game, room change), so the moment store resets and re-baselines too.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { ClientGameState, ContestedAction } from '@monopoly-deal/shared';
import type { LogEntry } from '../store/types';
import { anchorRectFor, bankAnchorRectFor } from './anchors';
import {
  collectPendingContested,
  deriveMomentForContested,
  deriveMoments,
  deriveThreatMoments,
  momentKindForEventType,
  resolvedThreatKeyFor,
  STEAL_KINDS,
  threatKeyForContested,
  threatKeyForMoment,
} from './derive';
import { installDevMomentsHook } from './devHook';
import { momentStore } from './store';
import type { Flight, Moment } from './types';

const FLIGHT_WIDTH_DESKTOP = 96;
const FLIGHT_WIDTH_PHONE = 72;
const FLIGHT_DURATION_MS = 950;
const FLIGHT_STAGGER_MS = 90;
const PAYMENT_FLIGHT_CAP = 4;
/** The card sizing invariant's 5:7 (width:height) ratio. */
const CARD_HEIGHT_RATIO = 7 / 5;
const PRUNE_INTERVAL_MS = 500;
const NOTICE_TTL_MS = 9000;

let flightSeq = 0;

function flightWidth(): number {
  return typeof window !== 'undefined' && window.innerWidth <= 700 ? FLIGHT_WIDTH_PHONE : FLIGHT_WIDTH_DESKTOP;
}

function centerOf(rect: DOMRect, width: number): { x: number; y: number } {
  const height = width * CARD_HEIGHT_RATIO;
  return {
    x: rect.left + rect.width / 2 - width / 2,
    y: rect.top + rect.height / 2 - height / 2,
  };
}

function buildFlightsFor(moments: readonly Moment[], viewerId: string): Flight[] {
  const width = flightWidth();
  const flights: Flight[] = [];

  const pushFlight = (card: Flight['card'], from: DOMRect, to: DOMRect, delayMs: number) => {
    const fromC = centerOf(from, width);
    const toC = centerOf(to, width);
    flightSeq += 1;
    flights.push({
      id: `moment-flight-${flightSeq}`,
      card,
      fromX: fromC.x,
      fromY: fromC.y,
      toX: toC.x,
      toY: toC.y,
      delayMs,
      durationMs: FLIGHT_DURATION_MS,
      width,
    });
  };

  for (const moment of moments) {
    if (moment.kind === 'sly_deal' || moment.kind === 'deal_breaker') {
      const victim = moment.targetIds[0];
      if (!victim) continue;
      const from = anchorRectFor(victim, viewerId);
      const to = anchorRectFor(moment.actorId, viewerId);
      if (from && to) pushFlight(moment.cards[0] ?? moment.faceCard, from, to, 0);
      continue;
    }
    if (moment.kind === 'forced_deal') {
      const victim = moment.targetIds[0];
      if (!victim) continue;
      const victimAnchor = anchorRectFor(victim, viewerId);
      const actorAnchor = anchorRectFor(moment.actorId, viewerId);
      if (!victimAnchor || !actorAnchor) continue;
      if (moment.cards[0]) pushFlight(moment.cards[0], victimAnchor, actorAnchor, 0);
      if (moment.givenCard) pushFlight(moment.givenCard, actorAnchor, victimAnchor, FLIGHT_STAGGER_MS);
      continue;
    }
    if (moment.kind === 'payment') {
      const payee = moment.targetIds[0];
      if (!payee) continue;
      const from = bankAnchorRectFor(moment.actorId, viewerId);
      const to = bankAnchorRectFor(payee, viewerId);
      if (!from || !to) continue;
      moment.cards.slice(0, PAYMENT_FLIGHT_CAP).forEach((card, i) => {
        pushFlight(card, from, to, i * FLIGHT_STAGGER_MS);
      });
    }
  }

  return flights;
}

export function useTableMoments(
  log: LogEntry[],
  clientState: ClientGameState | null,
  mode: 'local' | 'network',
): void {
  const lastSeenId = useRef<number | null>(null);
  const lastViewerId = useRef<string | null>(null);
  const timeouts = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const rafs = useRef<Set<number>>(new Set());
  const clientStateRef = useRef<ClientGameState | null>(clientState);
  clientStateRef.current = clientState;
  /** Dedup keys (see `threatKey`) for pending contested actions already announced
   * ahead of Just Say No resolving, so the eventual resolved/cancelled event
   * doesn't announce or fly them a second time. */
  const firedThreatKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    const pendingTimeouts = timeouts.current;
    const pendingRafs = rafs.current;
    return () => {
      for (const t of pendingTimeouts) clearTimeout(t);
      pendingTimeouts.clear();
      for (const r of pendingRafs) cancelAnimationFrame(r);
      pendingRafs.clear();
    };
  }, []);

  /** Builds flights for `moments` and schedules their removal on landing. Shared by
   * live ingest and by the seat-switch replay so both animate identically. */
  const scheduleFlights = useCallback((moments: Moment[], viewerId: string) => {
    const flights = buildFlightsFor(moments, viewerId);
    if (flights.length === 0) return;
    momentStore.addFlights(flights);
    const maxLanding = Math.max(...flights.map((f) => f.delayMs + f.durationMs));
    const timeout = setTimeout(() => {
      momentStore.removeFlights(flights.map((f) => f.id));
      timeouts.current.delete(timeout);
    }, maxLanding + 80);
    timeouts.current.add(timeout);
  }, []);

  const runMoments = useCallback(
    (moments: Moment[], viewerId: string) => {
      if (moments.length === 0) return;
      momentStore.ingest(moments, viewerId, mode);
      const raf = requestAnimationFrame(() => {
        rafs.current.delete(raf);
        scheduleFlights(moments, viewerId);
      });
      rafs.current.add(raf);
    },
    [mode, scheduleFlights],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return installDevMomentsHook({
      getClientState: () => clientStateRef.current,
      runMoments,
    });
  }, [runMoments]);

  useEffect(() => {
    if (lastSeenId.current === null) {
      lastSeenId.current = log.length > 0 ? log[log.length - 1]!.id : 0;
      return;
    }
    const currentMaxId = log.length > 0 ? log[log.length - 1]!.id : 0;
    const isReset = currentMaxId < lastSeenId.current;
    if (isReset) {
      momentStore.reset();
      firedThreatKeys.current.clear();
    }
    const baseline = isReset ? 0 : lastSeenId.current;
    lastSeenId.current = currentMaxId;
    if (!clientState) return;

    const fresh = log.filter((e) => e.id > baseline);
    if (fresh.length === 0) return;

    const viewerId = clientState.viewerId;

    // A threat already announced ahead of Just Say No must not announce/fly again once
    // it actually resolves or gets cancelled — match it here and route around it below.
    const skipFlightKeys = new Set<string>();
    const dropMomentKeys = new Set<string>();
    const reversals: ContestedAction[] = [];
    for (const e of fresh) {
      const key = resolvedThreatKeyFor(e);
      if (!key || !firedThreatKeys.current.has(key)) continue;
      firedThreatKeys.current.delete(key);
      if (e.type === 'action_cancelled') {
        const contested = e.data?.contested as ContestedAction | undefined;
        if (contested) reversals.push(contested);
        continue;
      }
      const kind = momentKindForEventType(e.type);
      if (kind && STEAL_KINDS.has(kind)) skipFlightKeys.add(key);
      else dropMomentKeys.add(key);
    }

    const rawMoments = deriveMoments(fresh, clientState, { now: Date.now(), viewerId, mode });
    const moments = rawMoments.filter((m) => !dropMomentKeys.has(threatKeyForMoment(m)));
    if (moments.length > 0) momentStore.ingest(moments, viewerId, mode);

    const reversalMoments = reversals
      .map((c) => deriveMomentForContested(c, clientState, { now: Date.now() }, true))
      .filter((m): m is Moment => m !== undefined && STEAL_KINDS.has(m.kind));
    const flightMoments = moments.filter((m) => !skipFlightKeys.has(threatKeyForMoment(m)));

    if (flightMoments.length > 0 || reversalMoments.length > 0) {
      const raf = requestAnimationFrame(() => {
        rafs.current.delete(raf);
        scheduleFlights([...flightMoments, ...reversalMoments], viewerId);
      });
      rafs.current.add(raf);
    }
  }, [log, clientState, mode, scheduleFlights]);

  useEffect(() => {
    if (!clientState) return;
    const live = collectPendingContested(clientState);
    const fresh = live.filter((entry) => {
      const key = threatKeyForContested(entry.contestedAction);
      return key !== undefined && !firedThreatKeys.current.has(key);
    });
    if (fresh.length === 0) return;
    for (const entry of fresh) {
      const key = threatKeyForContested(entry.contestedAction);
      if (key) firedThreatKeys.current.add(key);
    }

    const viewerId = clientState.viewerId;
    const threatMoments = deriveThreatMoments(fresh, clientState, { now: Date.now() });
    const stealMoments = threatMoments.filter((m) => STEAL_KINDS.has(m.kind));
    const paymentMoments = threatMoments.filter((m) => !STEAL_KINDS.has(m.kind));

    if (stealMoments.length > 0) {
      const raf = requestAnimationFrame(() => {
        rafs.current.delete(raf);
        scheduleFlights(stealMoments, viewerId);
      });
      rafs.current.add(raf);
    }
    if (paymentMoments.length > 0) runMoments(paymentMoments, viewerId);
  }, [clientState, scheduleFlights, runMoments]);

  useEffect(() => {
    if (mode !== 'local' || !clientState) return;
    const viewerId = clientState.viewerId;
    if (lastViewerId.current !== null && lastViewerId.current !== viewerId) {
      // The seat on screen just changed. Any flight still animating belongs to the
      // previous seat's layout — its from/to coordinates are now stale — so cancel
      // it before anything new is scheduled (PLAN-UI-R5 item B).
      for (const t of timeouts.current) clearTimeout(t);
      timeouts.current.clear();
      for (const r of rafs.current) cancelAnimationFrame(r);
      rafs.current.clear();
      const staleFlightIds = momentStore.getState().flights.map((f) => f.id);
      if (staleFlightIds.length > 0) momentStore.removeFlights(staleFlightIds);

      momentStore.replayForViewer(viewerId);
      // Rebuild flights for every moment still in the queue after replay, not just
      // the ones replay actually re-enqueued: a moment whose callout was already
      // mid-display when the seat switched (still the queue head, so replay left
      // it alone) just had its only flight wiped above and needs a fresh one built
      // against the new seat's anchors too (PLAN-UI-R5 item B).
      const queuedIds = new Set(momentStore.getState().calloutQueue);
      if (queuedIds.size > 0) {
        // One rAF so the new seat's board has laid out before anchors are read.
        const raf = requestAnimationFrame(() => {
          rafs.current.delete(raf);
          const moments = momentStore.getState().moments.filter((m) => queuedIds.has(m.id));
          scheduleFlights(moments, viewerId);
        });
        rafs.current.add(raf);
      }
    }
    lastViewerId.current = viewerId;
  }, [mode, clientState, scheduleFlights]);

  useEffect(() => {
    const interval = setInterval(() => {
      const s = momentStore.getState();
      if (s.highlights.length === 0 && s.notices.length === 0) return;
      const now = Date.now();
      momentStore.pruneHighlights(now);
      momentStore.expireNotices(now, NOTICE_TTL_MS);
    }, PRUNE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
