/**
 * Dev-only network lag, to feel the table the way a slow link does without leaving the laptop.
 *
 *   /rooms/ABCD?lag=400            every round trip takes 400ms longer (half on the way out, half on the way back)
 *   /rooms/ABCD?lag=400&jitter=300 plus up to 300ms of random extra per request
 *   /rooms/ABCD?drop=0.3           three POSTs in ten never get an answer (they time out and are retried)
 *
 * Read once at load. Compiled out of production builds (`import.meta.env.DEV`); pushes from the server keep their order
 * even when delayed, as a real stream would.
 */

interface Lag {
  lag: number;
  jitter: number;
  drop: number;
}

function read(): Lag | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  const num = (k: string) => {
    const n = Number(q.get(k));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const lag = { lag: num('lag'), jitter: num('jitter'), drop: Math.min(1, num('drop')) };
  return lag.lag || lag.jitter || lag.drop ? lag : null;
}

const cfg = read();

const extra = () => (cfg ? cfg.lag / 2 + Math.random() * (cfg.jitter / 2) : 0);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Whether this dev session is simulating a bad network at all. */
export const lagging = cfg !== null;

/** Hold a request on its way out. Resolves false when the simulated network swallowed it (the caller acts as if it timed out). */
export async function lagOut(): Promise<boolean> {
  if (!cfg) return true;
  await sleep(extra());
  return Math.random() >= cfg.drop;
}

/** Hold an answer on its way back. */
export async function lagBack(): Promise<void> {
  if (cfg) await sleep(extra());
}

let streamAt = 0;
/** Run `fn` after the simulated delay, never before something pushed earlier: a stream is ordered. */
export function lagStream(fn: () => void): void {
  if (!cfg) return fn();
  const at = Math.max(streamAt, performance.now() + extra());
  streamAt = at;
  setTimeout(fn, Math.max(0, at - performance.now()));
}
