import type { Card, GameEvent, GameState, PlayerState } from '@monopoly-deal/shared';
import { MAX_PLAYS } from '@monopoly-deal/shared';
import { buildDeck } from './deck.js';
import { createRng, createSecureRng, shuffle } from './rng.js';
import { resetSetIdSequence } from './board.js';

export interface CreateGameOptions {
  /**
   * Test-only seeded shuffle. Omit in production so the deck is shuffled with CSPRNG.
   * When set, `state.seed` stores the value for deterministic replays.
   */
  seed?: number;
}

/**
 * Create a new game. Production callers omit `seed` / options for CSPRNG shuffle.
 * Tests and sims pass `{ seed }` (or a bare number) for reproducibility.
 */
export function createGame(
  playerIds: string[],
  seedOrOptions?: number | CreateGameOptions,
): {
  state: GameState;
  events: GameEvent[];
} {
  if (playerIds.length < 2 || playerIds.length > 5) {
    throw new Error('Monopoly Deal supports 2–5 players');
  }

  const options: CreateGameOptions =
    typeof seedOrOptions === 'number' ? { seed: seedOrOptions } : (seedOrOptions ?? {});
  const seeded = options.seed !== undefined;
  const seed = options.seed ?? 0;
  const rng = seeded ? createRng(seed) : createSecureRng();

  resetSetIdSequence();
  const fullDeck = buildDeck();
  const outOfPlay = fullDeck.filter((c) => c.kind === 'rule');
  const playable = fullDeck.filter((c) => c.kind !== 'rule');
  const shuffled = shuffle(playable, rng);

  const players: PlayerState[] = playerIds.map((id) => ({
    id,
    hand: [] as Card[],
    board: { bank: [], sets: [] },
    connected: true,
  }));

  for (let round = 0; round < 5; round++) {
    for (const p of players) {
      const card = shuffled.pop();
      if (card) p.hand.push(card);
    }
  }

  const state: GameState = {
    players,
    deck: shuffled,
    discard: [],
    outOfPlay,
    currentPlayerIndex: 0,
    playsRemaining: MAX_PLAYS,
    turnPhase: 'awaiting_draw',
    pendingStack: [],
    pendingDoubles: 0,
    winnerId: null,
    seed,
    turnNumber: 1,
    drawnThisTurn: false,
  };

  const events: GameEvent[] = [
    {
      type: 'game_started',
      message: seeded
        ? `Game started with ${playerIds.length} players (seed ${seed})`
        : `Game started with ${playerIds.length} players`,
      data: seeded ? { playerIds, seed } : { playerIds },
    },
  ];

  return { state, events };
}
