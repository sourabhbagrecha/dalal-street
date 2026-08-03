/**
 * Bot harness: play N seeded games with uniformly random legal moves.
 * Checks invariants after every dispatch.
 */
import { createGame, dispatch, getLegalCommands } from '@monopoly-deal/engine';
import type { Command } from '@monopoly-deal/shared';
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

const MAX_DISPATCHES = 5000;

export interface SimResult {
  seed: number;
  winnerId: string | null;
  dispatches: number;
  turns: number;
  terminated: boolean;
  violations: { dispatch: number; detail: string }[];
}

export function simulateGame(seed: number, playerCount = 4): SimResult {
  const rng = mulberry32(seed);
  const ids = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  let { state } = createGame(ids, seed);
  const violations: SimResult['violations'] = [];

  const initial = checkInvariants(state);
  for (const v of initial) {
    violations.push({ dispatch: 0, detail: `${v.name}: ${v.detail}` });
  }

  let dispatches = 0;
  while (!state.winnerId && dispatches < MAX_DISPATCHES) {
    // Occasionally flip connection (no rules effect) to exercise the new command.
    if (rng() < 0.02) {
      const p = state.players[Math.floor(rng() * state.players.length)]!;
      const result = dispatch(state, {
        type: 'PLAYER_CONNECTION_CHANGED',
        playerId: p.id,
        connected: p.connected === false,
      });
      dispatches += 1;
      if (!result.rejected) state = result.state;
    }

    const legal = getLegalCommands(state);
    if (legal.length === 0) {
      violations.push({
        dispatch: dispatches,
        detail: `No legal commands (phase=${state.turnPhase}, pending=${state.pendingStack.map((p) => p.kind).join(',')})`,
      });
      break;
    }
    const cmd = legal[Math.floor(rng() * legal.length)] as Command;
    const result = dispatch(state, cmd);
    dispatches += 1;
    if (result.rejected) {
      violations.push({
        dispatch: dispatches,
        detail: `Rejected legal command: ${result.rejected} cmd=${JSON.stringify(cmd)}`,
      });
      // Don't update state on reject — but legal shouldn't reject
      break;
    }
    state = result.state;
    const inv = checkInvariants(state);
    for (const v of inv) {
      violations.push({ dispatch: dispatches, detail: `${v.name}: ${v.detail}` });
    }
    if (inv.length > 0) break;
  }

  return {
    seed,
    winnerId: state.winnerId,
    dispatches,
    turns: state.turnNumber,
    terminated: !!state.winnerId || dispatches < MAX_DISPATCHES,
    violations,
  };
}

export function runSimulations(n: number, baseSeed = 1): void {
  const winners: Record<string, number> = {};
  let totalTurns = 0;
  let totalDisp = 0;
  let finished = 0;
  let violationGames = 0;
  const samples: string[] = [];

  for (let i = 0; i < n; i++) {
    const seed = baseSeed + i * 9973;
    const r = simulateGame(seed);
    totalDisp += r.dispatches;
    totalTurns += r.turns;
    if (r.winnerId) {
      finished += 1;
      winners[r.winnerId] = (winners[r.winnerId] ?? 0) + 1;
    }
    if (r.violations.length > 0) {
      violationGames += 1;
      if (samples.length < 5) {
        samples.push(`seed=${r.seed}: ${r.violations[0]?.detail}`);
      }
    }
    if (!r.winnerId && r.dispatches >= MAX_DISPATCHES) {
      violationGames += 1;
      if (samples.length < 5) samples.push(`seed=${r.seed}: non-termination`);
    }
  }

  console.log('=== Simulation Summary ===');
  console.log(`Games played: ${n}`);
  console.log(`Finished with winner: ${finished}`);
  console.log(`Winners distribution: ${JSON.stringify(winners)}`);
  console.log(`Average turns: ${(totalTurns / n).toFixed(1)}`);
  console.log(`Average dispatches: ${(totalDisp / n).toFixed(1)}`);
  console.log(`Games with invariant violations / stalls: ${violationGames}`);
  if (samples.length) {
    console.log('Sample failures:');
    for (const s of samples) console.log(`  - ${s}`);
  }

  if (violationGames > 0) {
    process.exitCode = 1;
  }
}

const argN = process.argv[2] ? parseInt(process.argv[2], 10) : 500;
const argSeed = process.argv[3] ? parseInt(process.argv[3], 10) : 1;
runSimulations(argN, argSeed);
