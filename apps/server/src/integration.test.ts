/**
 * Integration tests: 4 fake HTTP+SSE clients against createExpressApp.
 */
import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetch } from 'undici';
import type { AddressInfo } from 'node:net';
import { createExpressApp } from './app.js';
import { resetTimingConfig, setTimingConfig } from './config.js';
import { clearAllRooms, hydrateRooms, unloadAllRooms } from './registry.js';

interface ClientIdentity {
  displayName: string;
  playerToken: string;
  playerId: string;
  isHost: boolean;
  roomCode: string;
  seq: number;
  projections: unknown[];
  events: unknown[];
  roomUpdates: unknown[];
  abort?: AbortController;
}

async function listen(): Promise<{ server: Server; baseUrl: string }> {
  const app = createExpressApp();
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function createRoom(
  baseUrl: string,
  displayName: string,
): Promise<ClientIdentity> {
  const res = await fetch(`${baseUrl}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ v: 1, displayName }),
  });
  const body = (await res.json()) as {
    ok: true;
    roomCode: string;
    playerToken: string;
    playerId: string;
    isHost: boolean;
  };
  expect(body.ok).toBe(true);
  return {
    displayName,
    playerToken: body.playerToken,
    playerId: body.playerId,
    isHost: body.isHost,
    roomCode: body.roomCode,
    seq: 0,
    projections: [],
    events: [],
    roomUpdates: [],
  };
}

async function joinRoom(
  baseUrl: string,
  roomCode: string,
  displayName: string,
): Promise<ClientIdentity> {
  const res = await fetch(`${baseUrl}/rooms/${roomCode}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ v: 1, displayName }),
  });
  const body = (await res.json()) as {
    ok: true;
    roomCode: string;
    playerToken: string;
    playerId: string;
    isHost: boolean;
  };
  expect(body.ok).toBe(true);
  return {
    displayName,
    playerToken: body.playerToken,
    playerId: body.playerId,
    isHost: body.isHost,
    roomCode: body.roomCode,
    seq: 0,
    projections: [],
    events: [],
    roomUpdates: [],
  };
}

async function openSse(baseUrl: string, client: ClientIdentity): Promise<void> {
  const abort = new AbortController();
  client.abort = abort;
  const res = await fetch(
    `${baseUrl}/rooms/${client.roomCode}/events?token=${encodeURIComponent(client.playerToken)}`,
    {
      headers: { origin: 'http://127.0.0.1:5173', accept: 'text/event-stream' },
      signal: abort.signal,
    },
  );
  expect(res.ok).toBe(true);
  expect(res.headers.get('content-type')).toContain('text/event-stream');

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (part.startsWith(':')) continue; // comment ping
          const dataLine = part
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.slice(6)) as {
            type: string;
            state?: unknown;
            event?: unknown;
            room?: unknown;
          };
          if (payload.type === 'projection') client.projections.push(payload.state);
          else if (payload.type === 'event') client.events.push(payload.event);
          else if (payload.type === 'roomUpdate') client.roomUpdates.push(payload.room);
        }
      }
    } catch {
      // aborted
    }
  })();
}

async function startGame(baseUrl: string, host: ClientIdentity): Promise<void> {
  const res = await fetch(`${baseUrl}/rooms/${host.roomCode}/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ v: 1, playerToken: host.playerToken }),
  });
  const body = (await res.json()) as { ok: boolean };
  expect(body.ok).toBe(true);
}

async function sendCommand(
  baseUrl: string,
  client: ClientIdentity,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<{ ok: boolean; reason?: string; code?: string; duplicate?: boolean; status: number }> {
  const seq = client.seq;
  client.seq += 1;
  const res = await fetch(`${baseUrl}/rooms/${client.roomCode}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({
      v: 1,
      playerToken: client.playerToken,
      seq,
      type,
      payload,
    }),
  });
  const body = (await res.json()) as {
    ok: boolean;
    reason?: string;
    code?: string;
    duplicate?: boolean;
  };
  return { ...body, status: res.status };
}

function waitFor(
  pred: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (pred()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe('server integration', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    clearAllRooms();
    resetTimingConfig();
    vi.useRealTimers();
    ({ server, baseUrl } = await listen());
  });

  afterEach(async () => {
    vi.useRealTimers();
    resetTimingConfig();
    clearAllRooms();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('drives 4 clients through lobby→start with per-seat projections', async () => {
    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    const c3 = await joinRoom(baseUrl, host.roomCode, 'Three');
    const c4 = await joinRoom(baseUrl, host.roomCode, 'Four');
    const clients = [host, c2, c3, c4];

    for (const c of clients) await openSse(baseUrl, c);
    await startGame(baseUrl, host);

    await waitFor(() => clients.every((c) => c.projections.length > 0));

    for (const c of clients) {
      const proj = c.projections[c.projections.length - 1] as {
        viewerId: string;
        you: { id: string; hand: { id: string }[]; handCount: number };
        players: { id: string; handCount: number; hand?: unknown }[];
        deckCount: number;
      };
      expect(proj.viewerId).toBe(c.playerId);
      expect(proj.you.id).toBe(c.playerId);
      expect(proj.you.hand.length).toBe(5);
      expect(proj.deckCount).toBeGreaterThan(0);
      for (const p of proj.players) {
        if (p.id !== c.playerId) {
          expect(p.hand).toBeUndefined();
          expect(p.handCount).toBe(5);
        }
      }
    }

    // Projections diverge: each seat sees its own hand ids
    const hands = clients.map(
      (c) =>
        (c.projections[c.projections.length - 1] as { you: { hand: { id: string }[] } }).you.hand
          .map((h) => h.id)
          .sort()
          .join(','),
    );
    expect(new Set(hands).size).toBe(4);

    for (const c of clients) c.abort?.abort();
  });

  it('rejects wrong token, ignores duplicate seq, Zod-rejects malformed body', async () => {
    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    await openSse(baseUrl, host);
    await openSse(baseUrl, c2);
    await startGame(baseUrl, host);
    await waitFor(() => host.projections.length > 0);

    const wrong = await fetch(`${baseUrl}/rooms/${host.roomCode}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({
        v: 1,
        playerToken: 'x'.repeat(32),
        seq: 0,
        type: 'DRAW_TURN_CARDS',
        payload: {},
      }),
    });
    expect(wrong.status).toBe(401);

    const draw = await sendCommand(baseUrl, host, 'DRAW_TURN_CARDS');
    expect(draw.ok).toBe(true);

    // Replay same seq
    host.seq -= 1;
    const dup = await sendCommand(baseUrl, host, 'DRAW_TURN_CARDS');
    expect(dup.ok).toBe(true);
    expect(dup.duplicate).toBe(true);

    const malformed = await fetch(`${baseUrl}/rooms/${host.roomCode}/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ v: 1, playerToken: host.playerToken, seq: 'nope' }),
    });
    const malBody = (await malformed.json()) as { ok: false; code: string };
    expect(malformed.status).toBe(400);
    expect(malBody.ok).toBe(false);
    expect(malBody.code).toBe('validation');

    host.abort?.abort();
    c2.abort?.abort();
  });

  it('auto-declines stalled Just Say No at 20s (fake timers)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setTimingConfig({ jsnMs: 20_000, turnMs: 600_000, paymentMs: 600_000, targetingMs: 600_000 });

    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    await openSse(baseUrl, host);
    await openSse(baseUrl, c2);
    await startGame(baseUrl, host);
    await waitFor(() => host.projections.length > 0 && c2.projections.length > 0);

    // Put a JSN pending directly via room registry internals is hard; drive via engine
    // by using shortened config and injecting through scheduler path in a unit-style way.
    // Instead: force pending by mutating through a debt collector play if cards allow.
    // Fallback: call room.dispatchSchedulerCommand after constructing pending via createGame seed — skip.
    // Use registry + Room API: get room and apply state with pending.

    const { getRoom } = await import('./registry.js');
    const room = getRoom(host.roomCode)!;
    expect(room.gameState).toBeTruthy();

    // Give c2 a JSN in hand and open a just_say_no pending against them
    const jsnCard = {
      id: 'jsn_test',
      kind: 'action' as const,
      action: 'just_say_no' as const,
      value: 4,
    };
    const payer = room.gameState!.players.find((p) => p.id === c2.playerId)!;
    payer.hand.push(jsnCard);
    room.gameState!.pendingStack.push({
      kind: 'just_say_no',
      respondentId: c2.playerId,
      initiatorId: host.playerId,
      jsnCount: 0,
      contestedAction: {
        type: 'debt_collector',
        actorId: host.playerId,
        targetPlayerId: c2.playerId,
        payload: {},
      },
    });
    const { syncDeadlinesFromState } = await import('./scheduler.js');
    syncDeadlinesFromState(room.deadlines, room.gameState!, Date.now());
    room.projectToAll();

    await waitFor(() => {
      const p = c2.projections[c2.projections.length - 1] as {
        pendingStack: { kind: string }[];
      };
      return p?.pendingStack?.some((x) => x.kind === 'just_say_no');
    });

    await vi.advanceTimersByTimeAsync(20_500);
    // Allow scheduler interval to fire
    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => {
      const p = c2.projections[c2.projections.length - 1] as {
        pendingStack: { kind: string }[];
      };
      return p && !p.pendingStack.some((x) => x.kind === 'just_say_no');
    }, 10_000);

    host.abort?.abort();
    c2.abort?.abort();
  });

  it('closed SSE marks disconnected; reconnect gets full snapshot first', async () => {
    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    await openSse(baseUrl, host);
    await openSse(baseUrl, c2);
    await startGame(baseUrl, host);
    await waitFor(() => host.projections.length > 0);

    const before = host.projections.length;
    c2.abort?.abort();

    await waitFor(() => {
      const seat = (host.roomUpdates[host.roomUpdates.length - 1] as {
        seats: { playerId: string; connected: boolean }[];
      })?.seats?.find((s) => s.playerId === c2.playerId);
      // roomUpdate may arrive via projection connected flags
      const proj = host.projections[host.projections.length - 1] as {
        players: { id: string; connected: boolean }[];
      };
      const p = proj?.players?.find((x) => x.id === c2.playerId);
      return p?.connected === false || seat?.connected === false;
    });

    // Reconnect
    c2.projections = [];
    c2.events = [];
    c2.roomUpdates = [];
    await openSse(baseUrl, c2);
    await waitFor(() => c2.projections.length + c2.roomUpdates.length > 0);

    // First meaningful game event after reconnect during play should be a projection
    expect(c2.projections.length).toBeGreaterThan(0);
    const firstProj = c2.projections[0] as { viewerId: string; you: { hand: unknown[] } };
    expect(firstProj.viewerId).toBe(c2.playerId);
    expect(firstProj.you.hand.length).toBeGreaterThan(0);
    expect(host.projections.length).toBeGreaterThanOrEqual(before);

    host.abort?.abort();
    c2.abort?.abort();
  });

  it('survives a server restart: room, state, tokens and seq resume from sqlite', async () => {
    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    await openSse(baseUrl, host);
    await openSse(baseUrl, c2);
    await startGame(baseUrl, host);
    await waitFor(() => host.projections.length > 0 && c2.projections.length > 0);

    type Proj = {
      currentPlayerId: string;
      turnPhase: string;
      you: { id: string; hand: { id: string }[] };
      deckCount: number;
    };
    const current = (host.projections[0] as Proj).currentPlayerId;
    const actor = current === host.playerId ? host : c2;
    const draw = await sendCommand(baseUrl, actor, 'DRAW_TURN_CARDS');
    expect(draw.ok).toBe(true);
    await waitFor(
      () => (actor.projections[actor.projections.length - 1] as Proj).turnPhase === 'playing',
    );
    const beforeHost = host.projections[host.projections.length - 1] as Proj;
    const beforeC2 = c2.projections[c2.projections.length - 1] as Proj;

    // Chat is persisted too.
    await fetch(`${baseUrl}/rooms/${host.roomCode}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ v: 1, playerToken: host.playerToken, text: 'brb' }),
    });

    // "Crash": drop every room from memory (SSE streams close), then boot again
    // from the store on a brand-new HTTP server.
    host.abort?.abort();
    c2.abort?.abort();
    unloadAllRooms();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(hydrateRooms()).toBe(1);
    ({ server, baseUrl } = await listen());

    const info = await fetch(
      `${baseUrl}/rooms/${host.roomCode}?token=${encodeURIComponent(c2.playerToken)}`,
      { headers: { origin: 'http://127.0.0.1:5173' } },
    );
    const infoBody = (await info.json()) as {
      ok: boolean;
      room: { status: string; seats: unknown[] };
      seat: { playerId: string } | null;
    };
    expect(infoBody.ok).toBe(true);
    expect(infoBody.room.status).toBe('playing');
    expect(infoBody.room.seats.length).toBe(2);
    expect(infoBody.seat?.playerId).toBe(c2.playerId);

    for (const c of [host, c2]) {
      c.projections = [];
      c.events = [];
      c.roomUpdates = [];
      await openSse(baseUrl, c);
    }
    await waitFor(() => host.projections.length > 0 && c2.projections.length > 0);

    const afterHost = host.projections[0] as Proj;
    const afterC2 = c2.projections[0] as Proj;
    expect(afterHost.you.hand.map((h) => h.id)).toEqual(beforeHost.you.hand.map((h) => h.id));
    expect(afterC2.you.hand.map((h) => h.id)).toEqual(beforeC2.you.hand.map((h) => h.id));
    expect(afterHost.deckCount).toBe(beforeHost.deckCount);
    expect(afterHost.currentPlayerId).toBe(current);
    expect(afterHost.turnPhase).toBe('playing');

    // Old seq numbers are still remembered across the restart; a fresh one is accepted.
    const replay = await sendCommand(baseUrl, { ...actor, seq: 0 }, 'DRAW_TURN_CARDS');
    expect(replay.duplicate).toBe(true);
    const end = await sendCommand(baseUrl, actor, 'END_TURN');
    expect(end.ok).toBe(true);
    await waitFor(
      () =>
        (host.projections[host.projections.length - 1] as Proj).currentPlayerId !== current,
    );

    host.abort?.abort();
    c2.abort?.abort();
  });

  it('drops a stored room once it has been GC-eligible', async () => {
    const host = await createRoom(baseUrl, 'Host');
    unloadAllRooms();
    // Empty for longer than the empty-room window: not restored, row removed.
    expect(hydrateRooms(Date.now() + 10 * 60_000)).toBe(0);
    const res = await fetch(`${baseUrl}/rooms/${host.roomCode}`, {
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    expect(res.status).toBe(404);
  });
});
