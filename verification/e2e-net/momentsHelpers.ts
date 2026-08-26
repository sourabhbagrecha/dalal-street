import type { Browser, Page } from '@playwright/test';
import type { NetPlayer } from './helpers.js';

/**
 * Programmatic HTML5 drag-and-drop for overlapping hand-fan cards — ported
 * from verification/e2e/helpers/dnd.ts (that file is scoped to the local
 * e2e project's tsconfig, so it can't be imported directly here).
 */
export async function dragCardToZone(page: Page, cardTestId: string, dropTestId: string): Promise<void> {
  await page.evaluate(
    ({ cardId, dropId }) => {
      const card = document.querySelector(`[data-testid="${cardId}"]`);
      const drop = document.querySelector(`[data-testid="${dropId}"]`);
      if (!card || !drop) throw new Error(`DnD elements missing: ${cardId} -> ${dropId}`);

      const dataTransfer = new DataTransfer();
      const cardKey = card.getAttribute('data-card-id') ?? '';
      dataTransfer.setData('application/x-monopoly-card', cardKey);

      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
      drop.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
      drop.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
      card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    },
    { cardId: cardTestId, dropId: dropTestId },
  );
}

const API_BASE = 'http://127.0.0.1:8787';

export interface FixtureSeat {
  seatIndex: number;
  playerId: string;
  playerToken: string;
  displayName: string;
  isHost: boolean;
}

export interface FixtureRoom {
  roomCode: string;
  seats: FixtureSeat[];
}

/**
 * Seeds an in-progress room straight from an engine fixture via the
 * dev-only `/dev/rooms/fixture` route (apps/server/src/routes.ts, gated to
 * non-production, active under the e2e-net webServer). `displayNames[i]`
 * maps onto the fixture's own player array in order, so
 * `['Aarav','Priya','Marcus','Yuki']` always yields p1=Aarav, p2=Priya,
 * p3=Marcus, p4=Yuki.
 */
export async function seedFixtureRoom(fixtureName: string, displayNames: string[]): Promise<FixtureRoom> {
  const res = await fetch(`${API_BASE}/dev/rooms/fixture`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fixtureName, displayNames }),
  });
  if (!res.ok) {
    throw new Error(`seedFixtureRoom(${fixtureName}) failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { ok: boolean; roomCode: string; seats: FixtureSeat[] };
  return { roomCode: body.roomCode, seats: body.seats };
}

/**
 * Opens one browser context per fixture seat and drops it straight on
 * `/game` with that seat's session pre-written — skips the lobby entirely,
 * which is the whole point of the dev fixture route.
 */
export async function joinFixtureSeats(browser: Browser, room: FixtureRoom): Promise<NetPlayer[]> {
  const players: NetPlayer[] = [];
  for (const seat of room.seats) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');
    await page.evaluate(
      ({ roomCode, seat }) => {
        sessionStorage.setItem('md_roomCode', roomCode);
        sessionStorage.setItem('md_playerToken', seat.playerToken);
        sessionStorage.setItem('md_playerId', seat.playerId);
        sessionStorage.setItem('md_isHost', seat.isHost ? 'true' : 'false');
      },
      { roomCode: room.roomCode, seat },
    );
    await page.goto('/game');
    players.push({ context, page, name: seat.displayName });
  }
  return players;
}

/** Seed + join in one call — the common case for these specs. */
export async function seedAndJoinFixture(
  browser: Browser,
  fixtureName: string,
  displayNames: string[],
): Promise<{ room: FixtureRoom; players: NetPlayer[] }> {
  const room = await seedFixtureRoom(fixtureName, displayNames);
  const players = await joinFixtureSeats(browser, room);
  return { room, players };
}
