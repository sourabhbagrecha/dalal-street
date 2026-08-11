/**
 * Redaction / projection secrecy tests.
 * Append-only verification: every fixture and 200 random mid-game states
 * must project without leaking opponent hands, deck contents, or seed.
 */
import { describe, expect, it } from 'vitest';
import {
  createGame,
  dispatch,
  fixtures,
  getLegalCommands,
  project,
  type FixtureName,
} from '@monopoly-deal/engine';
import type { Card, ClientGameState, Command, GameState } from '@monopoly-deal/shared';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function allBoardCardIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const p of state.players) {
    for (const c of p.board.bank) ids.add(c.id);
    for (const s of p.board.sets) {
      for (const c of s.cards) ids.add(c.id);
      if (s.house) ids.add(s.house.id);
      if (s.hotel) ids.add(s.hotel.id);
    }
  }
  for (const c of state.discard) ids.add(c.id);
  for (const c of state.outOfPlay) ids.add(c.id);
  return ids;
}

function opponentHandIds(state: GameState, viewerId: string): Set<string> {
  const ids = new Set<string>();
  for (const p of state.players) {
    if (p.id === viewerId) continue;
    for (const c of p.hand) ids.add(c.id);
  }
  return ids;
}

function deckIds(state: GameState): Set<string> {
  return new Set(state.deck.map((c) => c.id));
}

function collectCardIdsFromJson(value: unknown, out: Set<string>): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const v of value) collectCardIdsFromJson(v, out);
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === 'string' && typeof obj.kind === 'string') {
      out.add(obj.id);
    }
    for (const v of Object.values(obj)) collectCardIdsFromJson(v, out);
  }
}

function assertProjectionSecret(
  state: GameState,
  viewerId: string,
  projection: ClientGameState,
): void {
  const json = JSON.stringify(projection);
  const parsed = JSON.parse(json) as unknown;

  expect(json).not.toMatch(/"seed"\s*:/);
  expect(json).not.toContain('"deck":[');
  expect(projection).not.toHaveProperty('seed');
  expect(projection).not.toHaveProperty('deck');

  const oppHands = opponentHandIds(state, viewerId);
  const deck = deckIds(state);
  const visibleBoard = allBoardCardIds(state);
  const ownHand = new Set(state.players.find((p) => p.id === viewerId)!.hand.map((c) => c.id));

  const idsInProjection = new Set<string>();
  collectCardIdsFromJson(parsed, idsInProjection);

  for (const id of oppHands) {
    expect(idsInProjection.has(id), `opponent hand card ${id} leaked to ${viewerId}`).toBe(
      false,
    );
  }
  for (const id of deck) {
    // Deck cards must not appear unless they somehow also sit on a public zone (they shouldn't).
    if (!visibleBoard.has(id) && !ownHand.has(id)) {
      expect(idsInProjection.has(id), `deck card ${id} leaked to ${viewerId}`).toBe(false);
    }
  }

  // Physical-game information bound: own hand + public boards + discard top + counts.
  expect(projection.you.hand.map((c: Card) => c.id).sort()).toEqual([...ownHand].sort());
  expect(projection.deckCount).toBe(state.deck.length);
  expect(projection.discardCount).toBe(state.discard.length);

  for (const p of state.players) {
    if (p.id === viewerId) continue;
    const pub = projection.players.find((x) => x.id === p.id);
    expect(pub).toBeDefined();
    expect(pub!.handCount).toBe(p.hand.length);
    expect(pub).not.toHaveProperty('hand');
  }

  // Viewer must not learn more unique private card ids than own hand.
  const privateLeaks = [...idsInProjection].filter(
    (id) => oppHands.has(id) || (deck.has(id) && !visibleBoard.has(id) && !ownHand.has(id)),
  );
  expect(privateLeaks).toEqual([]);
}

function playRandomMoves(seed: number, moves: number): GameState {
  const rng = mulberry32(seed);
  const ids = ['p1', 'p2', 'p3', 'p4'];
  let { state } = createGame(ids, seed);
  let n = 0;
  while (!state.winnerId && n < moves) {
    const legal = getLegalCommands(state);
    if (legal.length === 0) break;
    const cmd = legal[Math.floor(rng() * legal.length)] as Command;
    const result = dispatch(state, cmd);
    if (result.rejected) break;
    state = result.state;
    n += 1;
  }
  return state;
}

describe('projection redaction', () => {
  const fixtureNames = Object.keys(fixtures) as FixtureName[];

  for (const name of fixtureNames) {
    it(`fixture ${name}: no hidden leaks for any seat`, () => {
      const state = fixtures[name]();
      for (const p of state.players) {
        const proj = project(state, p.id);
        assertProjectionSecret(state, p.id, proj);
      }
    });
  }

  it('200 random mid-game states: no hidden leaks', () => {
    for (let i = 0; i < 200; i++) {
      const seed = 10_000 + i * 97;
      const moves = 15 + (i % 40);
      const state = playRandomMoves(seed, moves);
      for (const p of state.players) {
        const proj = project(state, p.id);
        assertProjectionSecret(state, p.id, proj);
      }
    }
  });

  it('CSPRNG createGame omits seed from start event data when unseeded', () => {
    const { events, state } = createGame(['a', 'b']);
    // Unseeded games draw a real CSPRNG seed (not the fixed 0 stand-in) so later
    // in-game reshuffles aren't seeded off a predictable constant.
    expect(state.seed).not.toBe(0);
    expect(events[0]?.data).not.toHaveProperty('seed');
    const proj = project(state, 'a');
    expect(JSON.stringify(proj)).not.toMatch(/"seed"\s*:/);
  });
});
