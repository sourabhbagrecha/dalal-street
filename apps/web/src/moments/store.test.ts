import { beforeEach, describe, expect, it } from 'vitest';
import { momentStore } from './store';
import type { Moment } from './types';

function moment(overrides: Partial<Moment> & Pick<Moment, 'id' | 'kind' | 'actorId' | 'targetIds'>): Moment {
  return {
    cards: [],
    faceCard: null,
    witnessedBy: [],
    at: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  momentStore.reset();
});

describe('ingest', () => {
  it('enqueues a callout, notices the target, and highlights both sides for an attack', () => {
    const m = moment({ id: 1, kind: 'sly_deal', actorId: 'p1', targetIds: ['p3'], cards: [] });
    momentStore.ingest([m], 'p1', 'local');
    const state = momentStore.getState();

    expect(state.calloutQueue).toEqual([1]);
    expect(state.moments).toHaveLength(1);
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0]!.forPlayerId).toBe('p3');
    expect(state.notices[0]!.momentId).toBe(1);
    // Viewer is the actor, not the target, so the target's notice hasn't been shown yet.
    expect(state.notices[0]!.shownAt).toBeNull();

    const kinds = state.highlights.map((h) => `${h.kind}:${h.playerId}`).sort();
    expect(kinds).toEqual(['received:p1', 'stolen:p3']);
    for (const h of state.highlights) expect(h.until).toBe(1000 + 1800);
  });

  it('coalesces same-actor birthday moments into one callout but keeps every notice and highlight', () => {
    const moments = [
      moment({ id: 1, kind: 'birthday', actorId: 'p1', targetIds: ['p2'], amount: 2 }),
      moment({ id: 2, kind: 'birthday', actorId: 'p1', targetIds: ['p3'], amount: 2 }),
      moment({ id: 3, kind: 'birthday', actorId: 'p1', targetIds: ['p4'], amount: 2 }),
    ];
    momentStore.ingest(moments, 'p1', 'local');
    const state = momentStore.getState();

    expect(state.calloutQueue).toEqual([1]);
    expect(state.moments).toHaveLength(3);
    expect(state.notices.map((n) => n.forPlayerId).sort()).toEqual(['p2', 'p3', 'p4']);
    expect(state.highlights.filter((h) => h.kind === 'targeted')).toHaveLength(3);
  });

  it('skips the callout and the payer\'s own notice for a self-initiated payment, but keeps the payee\'s', () => {
    const m = moment({
      id: 1,
      kind: 'payment',
      actorId: 'p1',
      targetIds: ['p2'],
      amount: 5,
      selfInitiated: true,
    });
    momentStore.ingest([m], 'p1', 'network');
    const state = momentStore.getState();

    expect(state.calloutQueue).toEqual([]);
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0]!.forPlayerId).toBe('p2');
    const kinds = state.highlights.map((h) => `${h.kind}:${h.playerId}`).sort();
    expect(kinds).toEqual(['gained:p2', 'paid:p1']);
  });

  it('never enqueues set_broken or action_cancelled as callouts', () => {
    momentStore.ingest(
      [
        moment({ id: 1, kind: 'set_broken', actorId: 'p1', targetIds: ['p1'], color: 'red', reason: 'payment' }),
        moment({ id: 2, kind: 'action_cancelled', actorId: 'p2', targetIds: ['p1'], contestedType: 'sly_deal' }),
      ],
      'p1',
      'local',
    );
    expect(momentStore.getState().calloutQueue).toEqual([]);
    // Still notices/highlights-worthy moments recorded.
    expect(momentStore.getState().moments).toHaveLength(2);
  });
});

describe('replayForViewer', () => {
  it('re-enqueues at most the latest 3 unwitnessed moments targeting the viewer, deduped against the queue', () => {
    const moments = [1, 2, 3, 4].map((id) =>
      moment({ id, kind: 'sly_deal', actorId: 'p1', targetIds: ['p3'] }),
    );
    momentStore.ingest(moments, 'p1', 'local');
    // Drain the auto-enqueued callouts (simulating they already played out) without marking witnessed.
    for (let i = 0; i < moments.length; i++) momentStore.advanceCallout();
    expect(momentStore.getState().calloutQueue).toEqual([]);

    const replayed = momentStore.replayForViewer('p3');
    expect(momentStore.getState().calloutQueue).toEqual([2, 3, 4]);
    expect(replayed).toEqual([2, 3, 4]);
  });

  it('excludes moments already witnessed by that viewer', () => {
    const moments = [1, 2, 3].map((id) => moment({ id, kind: 'sly_deal', actorId: 'p1', targetIds: ['p3'] }));
    momentStore.ingest(moments, 'p1', 'local');
    for (let i = 0; i < moments.length; i++) momentStore.advanceCallout();
    momentStore.markWitnessed(3, 'p3');

    const replayed = momentStore.replayForViewer('p3');
    expect(momentStore.getState().calloutQueue).toEqual([1, 2]);
    expect(replayed).toEqual([1, 2]);
  });

  it('does not re-add ids still sitting in the queue', () => {
    const moments = [1, 2].map((id) => moment({ id, kind: 'sly_deal', actorId: 'p1', targetIds: ['p3'] }));
    momentStore.ingest(moments, 'p1', 'local');
    // Queue already holds [1, 2] from ingest — replay should add nothing new.
    const replayed = momentStore.replayForViewer('p3');
    expect(momentStore.getState().calloutQueue).toEqual([1, 2]);
    expect(replayed).toEqual([]);
  });
});

describe('expireNotices', () => {
  it('only counts elapsed time from shownAt, never from creation', () => {
    momentStore.ingest(
      [moment({ id: 1, kind: 'sly_deal', actorId: 'p1', targetIds: ['p3'], at: 1000 })],
      // viewer === target, so this notice is shown immediately at moment.at (1000).
      'p3',
      'local',
    );
    momentStore.ingest(
      [moment({ id: 2, kind: 'sly_deal', actorId: 'p1', targetIds: ['p4'], at: 1000 })],
      // viewer !== target, so this notice is never shown (shownAt stays null).
      'p1',
      'local',
    );
    expect(momentStore.getState().notices).toHaveLength(2);

    // Well past the 9s TTL from creation, but only one notice has actually been shown.
    momentStore.expireNotices(1000 + 20_000, 9000);
    const remaining = momentStore.getState().notices;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.forPlayerId).toBe('p4');
    expect(remaining[0]!.shownAt).toBeNull();
  });
});

describe('reset', () => {
  it('clears moments, queue, notices, highlights, flights, feedSeenUpTo and selfPaymentAt', () => {
    momentStore.ingest([moment({ id: 1, kind: 'sly_deal', actorId: 'p1', targetIds: ['p3'] })], 'p1', 'local');
    momentStore.markFeedSeen(5);
    momentStore.noteSelfPaymentSubmitted(2000);
    momentStore.addFlights([
      { id: 'f1', card: null, fromX: 0, fromY: 0, toX: 1, toY: 1, delayMs: 0, durationMs: 800, width: 72 },
    ]);

    momentStore.reset();
    const state = momentStore.getState();
    expect(state).toEqual({
      moments: [],
      calloutQueue: [],
      notices: [],
      highlights: [],
      flights: [],
      feedSeenUpTo: 0,
      selfPaymentAt: null,
    });
  });
});
