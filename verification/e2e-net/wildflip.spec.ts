import { test, expect } from '@playwright/test';
import type { ClientGameState, PropertyWildCard } from '@monopoly-deal/shared';
import {
  closePlayers,
  getClientState,
  hostCreateRoom,
  joinRoom,
  openPlayers,
  postCommand,
  startGame,
  type NetPlayer,
} from './helpers.js';

/**
 * Turns to play while waiting for a two-colour wildcard to reach a hand. Every
 * wildcard in the deck has to pass through somebody's hand to leave it, and two
 * seats drawing two cards a turn get through the deck well inside this — the cap
 * is a guard against an infinite loop, not a probability bet.
 */
const MAX_TURNS = 60;

function dualWildInHand(state: ClientGameState | null): PropertyWildCard | undefined {
  return state?.you.hand.find(
    (c): c is PropertyWildCard => c.kind === 'property_wild' && c.colors.length === 2,
  );
}

function boardWild(state: ClientGameState | null, playerId: string, cardId: string) {
  const player = state?.players.find((p) => p.id === playerId);
  const card = player?.board.sets.flatMap((s) => s.cards).find((c) => c.id === cardId);
  return card?.kind === 'property_wild' ? card : undefined;
}

test.describe('wildcard flip over the network', () => {
  test('a board flip reaches the opponent projection with the new colour', async ({ browser }) => {
    test.slow();
    const players = await openPlayers(browser, 2);
    try {
      const code = await hostCreateRoom(players[0]!);
      await joinRoom(players[1]!, code);
      await startGame(players[0]!);
      // `hand-fan`, not `draw-pile` — always on screen for every seat, unlike
      // draw-pile which only renders for whoever's currently acting.
      for (const p of players) {
        await expect(p.page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });
      }

      let actor: NetPlayer | undefined;
      let watcher: NetPlayer | undefined;
      let wild: PropertyWildCard | undefined;
      let actorId = '';

      for (let turn = 0; turn < MAX_TURNS && !wild; turn++) {
        // Whichever seat is on turn is the one that can draw, play and rearrange.
        const states = await Promise.all(players.map((p) => getClientState(p.page)));
        const currentIdx = states.findIndex((s) => s && s.currentPlayerId === s.viewerId);
        if (currentIdx < 0) {
          await players[0]!.page.waitForTimeout(200);
          continue;
        }
        const current = players[currentIdx]!;

        await postCommand(current.page, 'DRAW_TURN_CARDS');
        await expect
          .poll(async () => (await getClientState(current.page))?.turnPhase, { timeout: 10_000 })
          .not.toBe('awaiting_draw');

        const after = await getClientState(current.page);
        const found = dualWildInHand(after);
        if (found) {
          actor = current;
          watcher = players[currentIdx === 0 ? 1 : 0];
          wild = found;
          actorId = after!.viewerId;
          break;
        }

        await postCommand(current.page, 'END_TURN');
        // Nobody plays anything, so by a seat's second turn its hand is over
        // the limit and END_TURN parks on a discard instead of passing the turn.
        await expect
          .poll(async () => {
            const s = await getClientState(current.page);
            const top = s?.pendingStack[s.pendingStack.length - 1];
            return top?.kind === 'hand_limit_discard' || s?.currentPlayerId !== after!.viewerId;
          }, { timeout: 10_000 })
          .toBe(true);
        const parked = await getClientState(current.page);
        const top = parked?.pendingStack[parked.pendingStack.length - 1];
        if (top?.kind === 'hand_limit_discard' && top.playerId === after!.viewerId) {
          await postCommand(current.page, 'DISCARD_EXCESS', {
            cardIds: parked!.you.hand.slice(0, top.excess).map((c) => c.id),
          });
        }
        await expect
          .poll(async () => (await getClientState(current.page))?.currentPlayerId, {
            timeout: 10_000,
          })
          .not.toBe(after!.viewerId);
      }

      expect(wild, `no two-colour wildcard reached a hand in ${MAX_TURNS} turns`).toBeTruthy();

      const [first, second] = wild!.colors;
      await postCommand(actor!.page, 'PLAY_CARD', {
        cardId: wild!.id,
        zone: 'property',
        target: { assignedColor: first },
      });

      // The opponent sees the placement, and sees the colour it was placed as.
      await expect
        .poll(
          async () => boardWild(await getClientState(watcher!.page), actorId, wild!.id)?.assignedColor,
          { timeout: 10_000 },
        )
        .toBe(first);

      // Everything so far went through postCommand, which numbers commands from
      // its own counter; the app numbers the badge's command from another, read
      // from `md_seq:<ROOM>` when it enters the room. The server swallows any seq
      // at or below the highest it has applied for the seat (as a `duplicate` or
      // `stale` ack), so the flip would silently vanish. Hand the app the
      // helper's count and let it re-enter the room, as a reload would.
      await actor!.page.evaluate((roomCode) => {
        const key = `md_seq:${roomCode.toUpperCase()}`;
        const next = Math.max(
          Number(sessionStorage.getItem('md_test_seq') ?? '0'),
          Number(sessionStorage.getItem(key) ?? '0'),
        );
        sessionStorage.setItem(key, String(next));
      }, code);
      await actor!.page.reload();
      await expect(actor!.page.getByTestId('hand-fan')).toBeVisible({ timeout: 20_000 });

      // A wildcard alone in a fresh set breaks nothing, so its badge commits on
      // the first tap.
      const flip = actor!.page.getByTestId(`flip-wild-btn-${wild!.id}`);
      await expect(flip).toBeEnabled({ timeout: 10_000 });
      await flip.click();

      // The whole point: the flip went out as a command, the server re-projected,
      // and the *other* seat's stream carries the new colour.
      await expect
        .poll(
          async () => boardWild(await getClientState(watcher!.page), actorId, wild!.id)?.assignedColor,
          { timeout: 10_000 },
        )
        .toBe(second);

      await expect(watcher!.page.getByTestId('table-feed')).toContainText(/rearranged/i);
    } finally {
      await closePlayers(players);
    }
  });
});
