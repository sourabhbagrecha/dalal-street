import type { Card, GameEvent, GameState, PlayerState } from '@monopoly-deal/shared';
import { MAX_PLAYS } from '@monopoly-deal/shared';
import { buildDeck } from './deck.js';
import { createRng, shuffle } from './rng.js';
import { resetSetIdSequence } from './board.js';

export function createGame(playerIds: string[], seed: number): {
  state: GameState;
  events: GameEvent[];
} {
  if (playerIds.length < 2 || playerIds.length > 5) {
    throw new Error('Monopoly Deal supports 2–5 players');
  }
  resetSetIdSequence();
  const rng = createRng(seed);
  const fullDeck = buildDeck();
  const outOfPlay = fullDeck.filter((c) => c.kind === 'rule');
  const playable = fullDeck.filter((c) => c.kind !== 'rule');
  const shuffled = shuffle(playable, rng);

  const players: PlayerState[] = playerIds.map((id) => ({
    id,
    hand: [] as Card[],
    board: { bank: [], sets: [] },
  }));

  // Deal 5 each
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
      message: `Game started with ${playerIds.length} players (seed ${seed})`,
      data: { playerIds, seed },
    },
  ];

  console.log('deck', {fullDeck});

  return { state, events };
}
