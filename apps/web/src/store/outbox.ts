/**
 * The commands a client has sent but the server has not answered, delivered strictly one at a time and in the order
 * they were made.
 *
 * Why serial: the server keeps a per-seat sequence number and rejects anything at or below the highest it has applied.
 * Two POSTs in flight at once can overtake each other on a slow or jittery link; the later one lands first and the
 * earlier is thrown out as "stale", so a card the player dropped first goes nowhere. One in flight at a time cannot
 * reorder.
 *
 * Why retry: a request that never got an answer may or may not have been applied. Sending it again with the *same*
 * sequence number is safe either way (a replay of an applied one is acknowledged as a silent duplicate), so a dropped
 * connection costs a beat, not a card. After the last try the command has failed and so has everything queued behind
 * it, which was made on the assumption that it would land.
 */

export interface Delivery {
  ok: boolean;
  reason?: string;
  /** `network`: no answer came back, so the command may be retried unchanged. Anything else is the server's verdict. */
  code?: string;
}

export interface OutboxOptions<T> {
  /** One try at delivering `item`. `n` counts from 0; a retry of the same item is called with the same `item`. */
  attempt(item: T, n: number): Promise<Delivery>;
  /** Tries per command before giving up (default 3). */
  attempts?: number;
  /** Wait before try 1, 2, … in ms (default 400, 1000). */
  backoff?: number[];
  sleep?(ms: number): Promise<void>;
}

export interface Outbox<T> {
  /** Queue `item`; resolves with how it ended. Never rejects. */
  push(item: T): Promise<Delivery>;
  /** Commands not yet answered, the one in flight included. */
  size(): number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createOutbox<T>(opts: OutboxOptions<T>): Outbox<T> {
  const attempts = opts.attempts ?? 3;
  const backoff = opts.backoff ?? [400, 1000];
  const sleep = opts.sleep ?? wait;
  const queue: { item: T; resolve(d: Delivery): void }[] = [];
  let draining = false;

  const deliver = async (item: T): Promise<Delivery> => {
    let last: Delivery = { ok: false, code: 'network' };
    for (let n = 0; n < attempts; n++) {
      if (n > 0) await sleep(backoff[Math.min(n - 1, backoff.length - 1)] ?? 0);
      try {
        last = await opts.attempt(item, n);
      } catch {
        last = { ok: false, code: 'network' };
      }
      if (last.code !== 'network') return last;
    }
    return last;
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        const head = queue[0]!;
        const result = await deliver(head.item);
        queue.shift();
        head.resolve(result);
        if (result.code === 'network') {
          // The line is down: what was queued behind this was made expecting it to land.
          for (const rest of queue.splice(0)) rest.resolve(result);
        }
      }
    } finally {
      draining = false;
    }
  };

  return {
    push: (item) =>
      new Promise<Delivery>((resolve) => {
        queue.push({ item, resolve });
        void drain();
      }),
    size: () => queue.length,
  };
}
