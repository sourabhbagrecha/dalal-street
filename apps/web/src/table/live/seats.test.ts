import { describe, expect, it } from 'vitest';
import { fixtures, project } from '@monopoly-deal/engine';
import { theme } from '../../theme';
import { buildSeats, rivalsInTurnOrder } from './seats';

describe('rivalsInTurnOrder', () => {
  const game = fixtures.responsiveMidGame(); // p1..p4, seated in that order

  it.each([
    ['p1', ['p2', 'p3', 'p4']],
    ['p2', ['p3', 'p4', 'p1']],
    ['p3', ['p4', 'p1', 'p2']],
    ['p4', ['p1', 'p2', 'p3']],
  ])('viewer %s sees the ring starting after them', (viewer, expected) => {
    expect(rivalsInTurnOrder(project(game, viewer)).map((p) => p.id)).toEqual(expected);
  });
});

describe('buildSeats', () => {
  const game = fixtures.responsiveMidGame();

  it('the viewer is "You" in the self colours, with their real hand size and board', () => {
    const client = project(game, 'p2');
    const { me } = buildSeats(client);
    expect(me.id).toBe('p2');
    expect(me.name).toBe('You');
    expect(me.color).toBe(theme.selfColor);
    expect(me.ink).toBe(theme.selfTextColor);
    expect(me.handCount).toBe(client.you.hand.length);
    expect(me.bank.map((c) => c.id)).toEqual(['mb4', 'mb5']);
    expect(me.sets.map((s) => s.id)).toEqual(['set_pink', 'set_lb']);
  });

  it('rivals are named, coloured by their place among the rivals, and show only public info', () => {
    const client = project(game, 'p2');
    const { rivals } = buildSeats(client);
    expect(rivals.map((r) => r.id)).toEqual(['p3', 'p4', 'p1']);
    expect(rivals.map((r) => r.color)).toEqual([0, 1, 2].map((i) => theme.opponentColor(i)));
    expect(rivals.map((r) => r.ink)).toEqual([0, 1, 2].map((i) => theme.opponentTextColor(i)));
    // p3 is the third seat: the fixture's seat names are Aarav, Priya, Marcus, Yuki.
    expect(rivals[0]!.name).toBe('Marcus');
    expect(rivals[0]!.handCount).toBe(5);
    expect(rivals[0]!.sets.map((s) => s.id)).toEqual(['set_util']);
    expect(rivals.every((r) => r.connected)).toBe(true);
  });

  it('a heads-up game has one rival', () => {
    const two = structuredClone(game);
    two.players = two.players.slice(0, 2);
    const { rivals } = buildSeats(project(two, 'p1'));
    expect(rivals.map((r) => r.id)).toEqual(['p2']);
  });

  it('uses display names when the room has them, and carries connection state', () => {
    const client = project(game, 'p1', { displayNames: { p2: 'Rohan' }, connected: { p3: false } });
    const { rivals } = buildSeats(client);
    expect(rivals.find((r) => r.id === 'p2')!.name).toBe('Rohan');
    expect(rivals.find((r) => r.id === 'p3')!.connected).toBe(false);
  });

  it('carries a disconnected rival\'s grace remaining, and leaves it out for everyone else', () => {
    const client = project(game, 'p1', {
      connected: { p3: false },
      deadlines: { disconnectGraceMs: { p3: 45_000 } },
    });
    const { rivals } = buildSeats(client);
    expect(rivals.find((r) => r.id === 'p3')!.graceMs).toBe(45_000);
    expect(rivals.find((r) => r.id === 'p2')!.graceMs).toBeUndefined();
  });
});
