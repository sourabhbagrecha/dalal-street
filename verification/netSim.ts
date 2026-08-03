/**
 * Network simulation: N full games through the real Express server with
 * HTTP command POSTs + SSE streams. Bot brains peek at authoritative
 * room.gameState (via registry) only to choose legal moves; all mutations
 * go through the public command API.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetch } from 'undici';
import { getLegalCommands } from '@monopoly-deal/engine';
import type { Command } from '@monopoly-deal/shared';
import { createExpressApp } from '../apps/server/src/app.js';
import { clearAllRooms, getRoom } from '../apps/server/src/registry.js';
import { resetTimingConfig, setTimingConfig } from '../apps/server/src/config.js';
import { checkInvariants } from './invariants.js';

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_DISPATCHES = 8000;
const ORIGIN = 'http://127.0.0.1:5173';

interface Bot {
  playerToken: string;
  playerId: string;
  seq: number;
  abort?: AbortController;
}

async function listen(): Promise<{ server: Server; baseUrl: string }> {
  const app = createExpressApp();
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function openSse(baseUrl: string, roomCode: string, bot: Bot): Promise<void> {
  const abort = new AbortController();
  bot.abort = abort;
  const res = await fetch(
    `${baseUrl}/rooms/${roomCode}/events?token=${encodeURIComponent(bot.playerToken)}`,
    { headers: { origin: ORIGIN, accept: 'text/event-stream' }, signal: abort.signal },
  );
  if (!res.ok) throw new Error(`SSE failed ${res.status}`);
  // Drain stream in background so backpressure does not stall writes
  void (async () => {
    try {
      const reader = res.body!.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch {
      /* aborted */
    }
  })();
}

async function postJson(
  url: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function commandToWire(cmd: Command): { type: string; payload: Record<string, unknown> } {
  const { type, playerId: _pid, ...rest } = cmd as Command & { playerId: string };
  return { type, payload: rest as Record<string, unknown> };
}

export interface NetSimResult {
  seed: number;
  winnerId: string | null;
  dispatches: number;
  terminated: boolean;
  violations: string[];
}

export async function simulateNetworkGame(
  baseUrl: string,
  seed: number,
  playerCount = 4,
): Promise<NetSimResult> {
  const rng = mulberry32(seed);
  const violations: string[] = [];

  const created = await postJson(`${baseUrl}/rooms`, { v: 1, displayName: 'Bot0' });
  if (!created.json.ok) {
    return {
      seed,
      winnerId: null,
      dispatches: 0,
      terminated: false,
      violations: [`create failed: ${JSON.stringify(created.json)}`],
    };
  }
  const roomCode = created.json.roomCode as string;
  const bots: Bot[] = [
    {
      playerToken: created.json.playerToken as string,
      playerId: created.json.playerId as string,
      seq: 0,
    },
  ];

  for (let i = 1; i < playerCount; i++) {
    const joined = await postJson(`${baseUrl}/rooms/${roomCode}/join`, {
      v: 1,
      displayName: `Bot${i}`,
    });
    if (!joined.json.ok) {
      violations.push(`join failed: ${JSON.stringify(joined.json)}`);
      break;
    }
    bots.push({
      playerToken: joined.json.playerToken as string,
      playerId: joined.json.playerId as string,
      seq: 0,
    });
  }

  for (const bot of bots) await openSse(baseUrl, roomCode, bot);

  const start = await postJson(`${baseUrl}/rooms/${roomCode}/start`, {
    v: 1,
    playerToken: bots[0]!.playerToken,
  });
  if (!start.json.ok) {
    for (const b of bots) b.abort?.abort();
    return {
      seed,
      winnerId: null,
      dispatches: 0,
      terminated: false,
      violations: [`start failed: ${JSON.stringify(start.json)}`],
    };
  }

  const room = getRoom(roomCode)!;
  let dispatches = 0;

  while (room.status === 'playing' && room.gameState && !room.gameState.winnerId && dispatches < MAX_DISPATCHES) {
    const state = room.gameState;
    const inv = checkInvariants(state);
    for (const v of inv) violations.push(`${v.name}: ${v.detail}`);
    if (inv.length) break;

    const legal = getLegalCommands(state).filter(
      (c) =>
        c.type !== 'FORCE_END_TURN' &&
        c.type !== 'AUTO_RESOLVE_PENDING' &&
        c.type !== 'PLAYER_CONNECTION_CHANGED',
    );

    // Prefer real player moves; if only scheduler cmds remain, nudge time via scheduler
    if (legal.length === 0) {
      // Let scheduler auto-resolve / force-end by advancing wall clock deadlines
      const now = Date.now();
      if (room.deadlines.pendingDeadlineAt) room.deadlines.pendingDeadlineAt = now - 1;
      if (room.deadlines.turnDeadlineAt) room.deadlines.turnDeadlineAt = now - 1;
      // Invoke tick by waiting briefly — call private path via expired force
      await new Promise((r) => setTimeout(r, 300));
      dispatches += 1;
      if (!room.gameState?.winnerId && room.status === 'playing') {
        const still = getLegalCommands(room.gameState!).filter(
          (c) =>
            c.type !== 'FORCE_END_TURN' &&
            c.type !== 'AUTO_RESOLVE_PENDING' &&
            c.type !== 'PLAYER_CONNECTION_CHANGED',
        );
        if (still.length === 0 && room.gameState!.pendingStack.length === 0) {
          // Force end via scheduler command API path
          const cur = room.gameState!.players[room.gameState!.currentPlayerIndex]!;
          room.dispatchSchedulerCommand({ type: 'FORCE_END_TURN', playerId: cur.id });
        }
      }
      continue;
    }

    const cmd = legal[Math.floor(rng() * legal.length)]!;
    const bot = bots.find((b) => b.playerId === cmd.playerId);
    if (!bot) {
      violations.push(`No bot for playerId ${cmd.playerId}`);
      break;
    }

    const wire = commandToWire(cmd);
    const seq = bot.seq;
    bot.seq += 1;
    const ack = await postJson(`${baseUrl}/rooms/${roomCode}/commands`, {
      v: 1,
      playerToken: bot.playerToken,
      seq,
      type: wire.type,
      payload: wire.payload,
    });
    dispatches += 1;

    if (!ack.json.ok) {
      violations.push(`Rejected: ${ack.json.reason} cmd=${JSON.stringify(cmd)}`);
      break;
    }
  }

  const winnerId = room.gameState?.winnerId ?? null;
  if (room.gameState) {
    for (const v of checkInvariants(room.gameState)) {
      violations.push(`${v.name}: ${v.detail}`);
    }
  }

  for (const b of bots) b.abort?.abort();

  return {
    seed,
    winnerId,
    dispatches,
    terminated: !!winnerId,
    violations,
  };
}

export async function runNetSimulations(n: number, baseSeed = 1): Promise<void> {
  resetTimingConfig();
  // Generous turn so bots play; pending still auto-resolves if stuck
  setTimingConfig({ turnMs: 120_000, jsnMs: 5_000, paymentMs: 5_000, targetingMs: 5_000 });
  clearAllRooms();

  const { server, baseUrl } = await listen();
  let finished = 0;
  let bad = 0;
  const samples: string[] = [];

  try {
    for (let i = 0; i < n; i++) {
      const seed = baseSeed + i * 9973;
      clearAllRooms();
      const r = await simulateNetworkGame(baseUrl, seed, 4);
      if (r.winnerId) finished += 1;
      if (r.violations.length > 0 || !r.terminated) {
        bad += 1;
        if (samples.length < 5) {
          samples.push(
            `seed=${r.seed}: ${r.violations[0] ?? 'non-termination'} (disp=${r.dispatches})`,
          );
        }
      }
    }
  } finally {
    clearAllRooms();
    resetTimingConfig();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('=== Net Simulation Summary ===');
  console.log(`Games played: ${n}`);
  console.log(`Finished with winner: ${finished}`);
  console.log(`Games with violations / hangs: ${bad}`);
  if (samples.length) {
    console.log('Sample failures:');
    for (const s of samples) console.log(`  - ${s}`);
  }
  if (bad > 0) process.exitCode = 1;
}

const argN = process.argv[2] ? parseInt(process.argv[2], 10) : 100;
const argSeed = process.argv[3] ? parseInt(process.argv[3], 10) : 1;

const isMain = process.argv[1]?.includes('netSim');
if (isMain) {
  void runNetSimulations(argN, argSeed);
}
