import { describe, expect, it } from 'vitest';
import { createOutbox } from './outbox';
import type { Delivery } from './outbox';

const instant = () => Promise.resolve();
const ok: Delivery = { ok: true };
const down: Delivery = { ok: false, code: 'network', reason: 'offline' };
const later = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('outbox', () => {
  it('delivers one command at a time, in the order they were pushed', async () => {
    const log: string[] = [];
    let open = 0;
    let peak = 0;
    const box = createOutbox<string>({
      sleep: instant,
      attempt: async (item) => {
        open++;
        peak = Math.max(peak, open);
        log.push(`start ${item}`);
        // The first one is the slowest: a parallel sender would let the others overtake it.
        await later(item === 'a' ? 20 : 1);
        log.push(`end ${item}`);
        open--;
        return ok;
      },
    });
    await Promise.all([box.push('a'), box.push('b'), box.push('c')]);
    expect(peak).toBe(1);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('retries a request that got no answer with the same item, and succeeds when the line comes back', async () => {
    const seen: number[] = [];
    const box = createOutbox<{ seq: number }>({
      sleep: instant,
      attempt: async (item, n) => {
        seen.push(item.seq);
        return n < 2 ? down : ok;
      },
    });
    expect(await box.push({ seq: 7 })).toEqual(ok);
    expect(seen).toEqual([7, 7, 7]);
  });

  it('waits between tries', async () => {
    const waits: number[] = [];
    const box = createOutbox<string>({
      backoff: [100, 250],
      sleep: async (ms) => {
        waits.push(ms);
      },
      attempt: async () => down,
    });
    await box.push('x');
    expect(waits).toEqual([100, 250]);
  });

  it('does not retry the server saying no', async () => {
    let tries = 0;
    const box = createOutbox<string>({
      sleep: instant,
      attempt: async () => {
        tries++;
        return { ok: false, reason: 'Not your turn', code: 'rejected' };
      },
    });
    expect(await box.push('x')).toMatchObject({ ok: false, code: 'rejected' });
    expect(tries).toBe(1);
  });

  it('a rejection does not stop the commands behind it', async () => {
    const box = createOutbox<string>({
      sleep: instant,
      attempt: async (item) => (item === 'bad' ? { ok: false, code: 'rejected', reason: 'no' } : ok),
    });
    const [a, b, c] = await Promise.all([box.push('a'), box.push('bad'), box.push('c')]);
    expect([a.ok, b.ok, c.ok]).toEqual([true, false, true]);
  });

  it('gives up after the last try, and fails what was queued behind it without sending it', async () => {
    const sent: string[] = [];
    const box = createOutbox<string>({
      attempts: 3,
      sleep: instant,
      attempt: async (item) => {
        sent.push(item);
        return down;
      },
    });
    const results = await Promise.all([box.push('a'), box.push('b'), box.push('c')]);
    expect(results.map((r) => r.code)).toEqual(['network', 'network', 'network']);
    expect(sent).toEqual(['a', 'a', 'a']);
    expect(box.size()).toBe(0);
  });

  it('treats a throwing attempt as no answer', async () => {
    let n = 0;
    const box = createOutbox<string>({
      sleep: instant,
      attempt: async () => {
        if (n++ === 0) throw new Error('boom');
        return ok;
      },
    });
    expect(await box.push('x')).toEqual(ok);
  });

  it('keeps working after a failure', async () => {
    let up = false;
    const box = createOutbox<string>({ sleep: instant, attempt: async () => (up ? ok : down) });
    expect((await box.push('a')).ok).toBe(false);
    up = true;
    expect((await box.push('b')).ok).toBe(true);
  });
});
