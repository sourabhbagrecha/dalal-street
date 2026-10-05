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
  feedHistory: unknown[][];
  roomUpdates: unknown[];
  reactions: unknown[];
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
    body: JSON.stringify({ v: 1, displayName, turnstileToken: '' }),
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
    feedHistory: [],
    roomUpdates: [],
    reactions: [],
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
    feedHistory: [],
    roomUpdates: [],
    reactions: [],
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
            entries?: unknown[];
            room?: unknown;
            reaction?: unknown;
          };
          if (payload.type === 'projection') client.projections.push(payload.state);
          else if (payload.type === 'event') client.events.push(payload.event);
          else if (payload.type === 'feedHistory') client.feedHistory.push(payload.entries ?? []);
          else if (payload.type === 'roomUpdate') client.roomUpdates.push(payload.room);
          else if (payload.type === 'reaction') client.reactions.push(payload.reaction);
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

async function addBot(
  baseUrl: string,
  host: ClientIdentity,
): Promise<{ status: number; ok: boolean; reason?: string; code?: string }> {
  const res = await fetch(`${baseUrl}/rooms/${host.roomCode}/bots`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ v: 1, playerToken: host.playerToken }),
  });
  const body = (await res.json()) as { ok: boolean; reason?: string; code?: string };
  return { status: res.status, ...body };
}

async function removeBot(
  baseUrl: string,
  host: ClientIdentity,
  botPlayerId: string,
): Promise<{ status: number; ok: boolean; reason?: string; code?: string }> {
  const res = await fetch(`${baseUrl}/rooms/${host.roomCode}/bots/remove`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ v: 1, playerToken: host.playerToken, botPlayerId }),
  });
  const body = (await res.json()) as { ok: boolean; reason?: string; code?: string };
  return { status: res.status, ...body };
}

async function roomSeats(
  baseUrl: string,
  host: ClientIdentity,
): Promise<{ playerId: string; displayName: string; isBot: boolean }[]> {
  const res = await fetch(`${baseUrl}/rooms/${host.roomCode}`, {
    headers: { origin: 'http://127.0.0.1:5173' },
  });
  return ((await res.json()) as { room: { seats: { playerId: string; displayName: string; isBot: boolean }[] } })
    .room.seats;
}

async function playVsComputer(baseUrl: string, displayName: string): Promise<ClientIdentity> {
  const res = await fetch(`${baseUrl}/rooms/vs-computer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
    body: JSON.stringify({ v: 1, displayName, turnstileToken: '' }),
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
    feedHistory: [],
    reactions: [],
  };
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

  it('a player can leave a game in progress: their seat goes, the table closes up, the rest play on', async () => {
    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    const c3 = await joinRoom(baseUrl, host.roomCode, 'Three');
    const clients = [host, c2, c3];
    for (const c of clients) await openSse(baseUrl, c);
    await startGame(baseUrl, host);
    await waitFor(() => clients.every((c) => c.projections.length > 0));

    const res = await fetch(`${baseUrl}/rooms/${host.roomCode}/leave`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
      body: JSON.stringify({ v: 1, playerToken: c2.playerToken }),
    });
    expect(res.status).toBe(200);

    await waitFor(() => {
      const last = host.projections[host.projections.length - 1] as { players: { id: string }[] };
      return last.players.length === 2;
    });
    const last = host.projections[host.projections.length - 1] as { players: { id: string }[] };
    expect(last.players.map((p) => p.id)).not.toContain(c2.playerId);
    expect((await roomSeats(baseUrl, host)).map((s) => s.playerId)).not.toContain(c2.playerId);

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

    // The window closed by the clock, not a tap on "Let it go" — the client's timeout copy ("Time ran out: ...")
    // hangs on this flag, which only the server can set (the engine has no notion of a deadline).
    const declined = (c2.events as { type: string; data?: { timeout?: boolean } }[]).find((e) => e.type === 'just_say_no_declined');
    expect(declined?.data?.timeout).toBe(true);

    host.abort?.abort();
    c2.abort?.abort();
  });

  it('arms a fresh payment deadline after a payment_round JSN window expires, then auto-pays', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setTimingConfig({ jsnMs: 1_000, turnMs: 600_000, paymentMs: 1_000, targetingMs: 600_000 });

    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    await openSse(baseUrl, host);
    await openSse(baseUrl, c2);
    await startGame(baseUrl, host);
    await waitFor(() => host.projections.length > 0 && c2.projections.length > 0);

    const { getRoom } = await import('./registry.js');
    const { syncDeadlinesFromState } = await import('./scheduler.js');
    const room = getRoom(host.roomCode)!;
    expect(room.gameState).toBeTruthy();

    // c2 is both the JSN respondent and the payer — the single-payer case where the
    // pending kind, acting player, and stack length never change across the jsn -> payment
    // transition, so a signature that ignores sub-phase would never re-arm a deadline.
    const payer = room.gameState!.players.find((p) => p.id === c2.playerId)!;
    payer.board.bank.push(
      { id: 'auto_pay_m1', kind: 'money', amount: 1, value: 1 },
      { id: 'auto_pay_m5', kind: 'money', amount: 5, value: 5 },
    );
    room.gameState!.pendingStack.push({
      kind: 'payment_round',
      payeeId: host.playerId,
      reason: 'rent',
      entries: [
        {
          payerId: c2.playerId,
          amountDue: 1,
          phase: 'jsn',
          jsn: {
            respondentId: c2.playerId,
            initiatorId: host.playerId,
            jsnCount: 0,
            contestedAction: {
              type: 'debt_collector',
              actorId: host.playerId,
              targetPlayerId: c2.playerId,
              payload: {},
            },
          },
        },
      ],
    });
    syncDeadlinesFromState(room.deadlines, room.gameState!, Date.now());
    room.projectToAll();

    await waitFor(() => {
      const p = c2.projections[c2.projections.length - 1] as {
        pendingStack: { kind: string; entries?: { phase: string }[] }[];
      };
      const top = p?.pendingStack?.[p.pendingStack.length - 1];
      return top?.kind === 'payment_round' && top.entries?.[0]?.phase === 'jsn';
    });

    // Let the JSN window expire — the entry should flip to 'payment' *and* a fresh
    // payment deadline must be armed (this is the regression: previously the deadline
    // stayed null forever because the pending signature didn't change).
    await vi.advanceTimersByTimeAsync(1_200);
    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => {
      const p = c2.projections[c2.projections.length - 1] as {
        pendingStack: { kind: string; entries?: { phase: string }[] }[];
        deadlines?: { pendingMs?: number };
      };
      const top = p?.pendingStack?.[p.pendingStack.length - 1];
      return (
        top?.kind === 'payment_round' &&
        top.entries?.[0]?.phase === 'payment' &&
        typeof p.deadlines?.pendingMs === 'number'
      );
    }, 10_000);

    // Let the payment deadline itself expire — auto-pay should fire (cheapest bank
    // card first) and clear the pending stack.
    await vi.advanceTimersByTimeAsync(1_200);
    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => {
      const p = c2.projections[c2.projections.length - 1] as {
        pendingStack: { kind: string }[];
      };
      return !p?.pendingStack?.some((x) => x.kind === 'payment_round');
    }, 10_000);

    const finalState = room.gameState!;
    const finalPayer = finalState.players.find((p) => p.id === c2.playerId)!;
    // The cheapest bank card (1M) paid the 1M debt; the 5M card is untouched.
    expect(finalPayer.board.bank.some((c) => c.id === 'auto_pay_m1')).toBe(false);
    expect(finalPayer.board.bank.some((c) => c.id === 'auto_pay_m5')).toBe(true);

    // Both windows resolved themselves on the clock, not a tap — the server flags every event either fired so the
    // client can say "Time ran out: ..." instead of narrating it as a choice c2 never made.
    const c2Events = c2.events as { type: string; data?: { timeout?: boolean } }[];
    expect(c2Events.find((e) => e.type === 'just_say_no_declined')?.data?.timeout).toBe(true);
    expect(c2Events.find((e) => e.type === 'payment_made')?.data?.timeout).toBe(true);

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

  it('reconnect resends recent feed history, sanitized the same as the live fan-out', async () => {
    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    await openSse(baseUrl, host);
    await openSse(baseUrl, c2);
    await startGame(baseUrl, host);
    await waitFor(() => host.events.length > 0);

    const before = [...host.events];
    c2.abort?.abort();
    await waitFor(() => {
      const proj = host.projections[host.projections.length - 1] as {
        players: { id: string; connected: boolean }[];
      };
      return proj?.players?.find((x) => x.id === c2.playerId)?.connected === false;
    });

    // Reconnect a fresh client (nothing in its own log yet, same as a page reload).
    c2.projections = [];
    c2.events = [];
    c2.feedHistory = [];
    c2.roomUpdates = [];
    await openSse(baseUrl, c2);
    await waitFor(() => c2.feedHistory.length > 0);

    const history = c2.feedHistory[0] as Array<{
      type: string;
      playerId?: string;
      message: string;
      data?: Record<string, unknown>;
    }>;
    // Everything the game has said so far (the deal, at least) is there to catch up on.
    expect(history.length).toBeGreaterThanOrEqual(before.length);
    // Same redaction the live fan-out already applies: never a seed, a deck, or a hand.
    for (const entry of history) {
      expect(entry.data?.['seed']).toBeUndefined();
      expect(entry.data?.['deck']).toBeUndefined();
      expect(entry.data?.['hand']).toBeUndefined();
      expect(entry.data?.['hands']).toBeUndefined();
    }

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

  it('fans a reaction out to every seat, paces it, and never replays it', async () => {
    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    for (const c of [host, c2]) await openSse(baseUrl, c);
    await startGame(baseUrl, host);
    await waitFor(() => host.projections.length > 0 && c2.projections.length > 0);

    const react = async (client: ClientIdentity, kind: string) => {
      const res = await fetch(`${baseUrl}/rooms/${client.roomCode}/react`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
        body: JSON.stringify({ v: 1, playerToken: client.playerToken, kind }),
      });
      return { status: res.status, body: (await res.json()) as { ok: boolean; code?: string } };
    };

    const sent = await react(c2, 'laugh');
    expect(sent.status).toBe(200);
    await waitFor(() => host.reactions.length === 1 && c2.reactions.length === 1);
    expect(host.reactions[0]).toEqual({ playerId: c2.playerId, kind: 'laugh' });

    // Too soon after the last one: turned down, nobody sees it.
    const spam = await react(c2, 'laugh');
    expect(spam.status).toBe(429);
    expect(spam.body.ok).toBe(false);

    // Unknown faces and unknown seats never reach the table.
    expect((await react(host, 'smug')).status).toBe(400);
    expect((await react({ ...host, playerToken: 'x'.repeat(40) }, 'happy')).status).toBe(401);

    // Reactions are not game state: the projection is untouched and a late connect hears nothing.
    const projections = host.projections.length;
    c2.abort?.abort();
    c2.reactions = [];
    await openSse(baseUrl, c2);
    await waitFor(() => c2.projections.length > 0);
    expect(c2.reactions).toEqual([]);
    expect(host.projections.length).toBe(projections);

    host.abort?.abort();
    c2.abort?.abort();
  });

  it('rematches once every seat taps, dealing a fresh game to the same seats', async () => {
    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    await openSse(baseUrl, host);
    await openSse(baseUrl, c2);
    await startGame(baseUrl, host);
    await waitFor(() => host.projections.length > 0 && c2.projections.length > 0);

    const rematch = async (client: ClientIdentity) => {
      const res = await fetch(`${baseUrl}/rooms/${client.roomCode}/rematch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' },
        body: JSON.stringify({ v: 1, playerToken: client.playerToken }),
      });
      return { status: res.status, body: (await res.json()) as { ok: boolean; reason?: string; code?: string } };
    };

    // Too early: the game is still being played.
    const early = await rematch(host);
    expect(early.body.ok).toBe(false);
    expect(early.body.code).toBe('bad_state');

    const { getRoom } = await import('./registry.js');
    const room = getRoom(host.roomCode)!;
    const firstGameState = room.gameState;
    // Force the game to a finished state without playing it out — only `requestRematch`'s own
    // gating is under test here, not how a game reaches game_over.
    room.status = 'finished';
    room.broadcastRoomUpdate();
    await waitFor(() => host.roomUpdates.length > 0 && c2.roomUpdates.length > 0);

    // One tap: not enough on its own, and it never touches the game.
    const first = await rematch(host);
    expect(first.body.ok).toBe(true);
    await waitFor(() => {
      const latest = host.roomUpdates[host.roomUpdates.length - 1] as {
        status: string;
        seats: { playerId: string; rematchReady: boolean }[];
      };
      return latest.status === 'finished' && latest.seats.find((s) => s.playerId === host.playerId)?.rematchReady === true;
    });
    const stillWaiting = host.roomUpdates[host.roomUpdates.length - 1] as {
      seats: { playerId: string; rematchReady: boolean }[];
    };
    expect(stillWaiting.seats.find((s) => s.playerId === c2.playerId)?.rematchReady).toBe(false);
    expect(room.gameState).toBe(firstGameState);

    // A duplicate tap from the same seat is a harmless no-op, still short of every seat.
    const dup = await rematch(host);
    expect(dup.body.ok).toBe(true);
    expect(room.status).toBe('finished');

    // The last seat taps: the room deals a fresh game and resets everyone's tap.
    const second = await rematch(c2);
    expect(second.body.ok).toBe(true);
    await waitFor(() => room.status === 'playing');
    expect(room.gameState).not.toBe(firstGameState);

    await waitFor(() => {
      const latest = host.roomUpdates[host.roomUpdates.length - 1] as {
        status: string;
        seats: { rematchReady: boolean }[];
      };
      return latest.status === 'playing' && latest.seats.every((s) => !s.rematchReady);
    });

    // Fresh projections land for the same two seats.
    await waitFor(() => {
      const proj = host.projections[host.projections.length - 1] as { winnerId: string | null; turnNumber: number };
      return proj.winnerId === null && proj.turnNumber === 1;
    });

    // An unknown token is rejected the same way every other room endpoint rejects one.
    const bad = await rematch({ ...host, playerToken: 'x'.repeat(40) });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('unauthorized');

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

  it('host fills an open chair with a bot; non-host and a full room are rejected', async () => {
    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');

    const forbidden = await addBot(baseUrl, c2);
    expect(forbidden.status).toBe(403);
    expect(forbidden.ok).toBe(false);

    // 2 seated already; MAX_SEATS is 5, so 3 more bots fit.
    for (let i = 0; i < 3; i++) {
      const ack = await addBot(baseUrl, host);
      expect(ack.ok).toBe(true);
    }
    const full = await addBot(baseUrl, host);
    expect(full.status).toBe(409);
    expect(full.code).toBe('room_full');

    const view = await fetch(`${baseUrl}/rooms/${host.roomCode}`, {
      headers: { origin: 'http://127.0.0.1:5173' },
    });
    const body = (await view.json()) as {
      room: { seats: { playerId: string; isBot: boolean }[] };
    };
    expect(body.room.seats).toHaveLength(5);
    expect(body.room.seats.filter((s) => s.isBot)).toHaveLength(3);
  });

  it('host removes a bot; humans, non-hosts and unknown ids are refused, re-adding never reuses a live name', async () => {
    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    await addBot(baseUrl, host);
    await addBot(baseUrl, host);
    const [, , bot1, bot2] = await roomSeats(baseUrl, host);

    expect((await removeBot(baseUrl, c2, bot1!.playerId)).status).toBe(403);
    expect((await removeBot(baseUrl, host, c2.playerId)).status).toBe(404); // a human is not a bot
    expect((await removeBot(baseUrl, host, 'nope')).status).toBe(404);

    expect((await removeBot(baseUrl, host, bot1!.playerId)).ok).toBe(true);
    expect((await roomSeats(baseUrl, host)).map((s) => s.playerId)).not.toContain(bot1!.playerId);

    await addBot(baseUrl, host);
    const names = (await roomSeats(baseUrl, host)).filter((s) => s.isBot).map((s) => s.displayName);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain(bot2!.displayName);
  });

  it('play vs computer seats a full table of bots and starts immediately, bots keep the game moving', async () => {
    setTimingConfig({ botMinDelayMs: 5, botMaxDelayMs: 20 });
    const solo = await playVsComputer(baseUrl, 'Solo');
    await openSse(baseUrl, solo);
    await waitFor(() => solo.projections.length > 0);

    const first = solo.projections[0] as {
      players: { id: string; isBot: boolean }[];
      currentPlayerId: string;
      viewerId: string;
    };
    expect(first.players).toHaveLength(5);
    expect(first.players.filter((p) => p.isBot)).toHaveLength(4);
    expect(first.currentPlayerId).toBe(solo.playerId); // host always goes first

    // Hand the turn to the bots and confirm the table keeps moving without any
    // further human input — this is the whole point of a bot seat.
    const draw = await sendCommand(baseUrl, solo, 'DRAW_TURN_CARDS');
    expect(draw.ok).toBe(true);
    const turnAfterDraw = (solo.projections[solo.projections.length - 1] as { turnNumber: number })
      .turnNumber;
    const end = await sendCommand(baseUrl, solo, 'END_TURN');
    expect(end.ok).toBe(true);

    await waitFor(() => {
      const last = solo.projections[solo.projections.length - 1] as {
        turnNumber: number;
        winnerId: string | null;
      };
      return last.turnNumber > turnAfterDraw || last.winnerId !== null;
    }, 10_000);

    solo.abort?.abort();
  });

  it('a bot policy takes over a seat once its disconnect grace expires, and hands back on reconnect', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setTimingConfig({
      disconnectGraceMs: 200,
      turnMs: 600_000,
      // Short, not disabled: with a real randomized deck the bot can draw and play a
      // targeted action (e.g. Debt Collector) at the host, opening a Just Say No window
      // only the host — a real, non-bot client that never answers in this test — could
      // resolve. A short window lets the scheduler auto-decline it, exactly like an idle
      // human would time out in production, so the turn always completes deterministically.
      jsnMs: 1_000,
      paymentMs: 1_000,
      targetingMs: 600_000,
      botMinDelayMs: 5,
      botMaxDelayMs: 20,
    });

    const host = await createRoom(baseUrl, 'Host');
    const c2 = await joinRoom(baseUrl, host.roomCode, 'Two');
    await openSse(baseUrl, host);
    await openSse(baseUrl, c2);
    await startGame(baseUrl, host);
    await waitFor(() => host.projections.length > 0 && c2.projections.length > 0);

    // Host always goes first — hand the turn to c2 so their disconnect matters.
    await sendCommand(baseUrl, host, 'DRAW_TURN_CARDS');
    await sendCommand(baseUrl, host, 'END_TURN');
    await waitFor(() => {
      const last = host.projections[host.projections.length - 1] as { currentPlayerId: string };
      return last.currentPlayerId === c2.playerId;
    });

    c2.abort?.abort();
    await waitFor(() => {
      const last = host.projections[host.projections.length - 1] as {
        players: { id: string; connected: boolean }[];
      };
      return last.players.find((p) => p.id === c2.playerId)?.connected === false;
    });

    // Cross the disconnect grace window, then give the scheduler (250ms tick) a beat.
    await vi.advanceTimersByTimeAsync(1000);

    await waitFor(() => {
      const last = host.projections[host.projections.length - 1] as {
        players: { id: string; botControlled: boolean }[];
      };
      return last.players.find((p) => p.id === c2.playerId)?.botControlled === true;
    }, 10_000);

    // Let the bot policy actually play c2's seat forward (draw, a few plays, end turn).
    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => {
      const last = host.projections[host.projections.length - 1] as {
        currentPlayerId: string;
        turnNumber: number;
      };
      return last.currentPlayerId === host.playerId && last.turnNumber > 1;
    }, 15_000);

    // Reconnect: control hands back immediately.
    c2.projections = [];
    await openSse(baseUrl, c2);
    await vi.advanceTimersByTimeAsync(500);
    await waitFor(() => {
      const last = host.projections[host.projections.length - 1] as {
        players: { id: string; botControlled: boolean }[];
      };
      return last.players.find((p) => p.id === c2.playerId)?.botControlled === false;
    }, 10_000);

    host.abort?.abort();
    c2.abort?.abort();
  });
});
