import { describe, expect, it } from 'vitest';
import type { PropertySet } from '@monopoly-deal/shared';
import { revealRate, stepMs, winSteps } from './winSequence';

const set = (id: string, color: PropertySet['color']): PropertySet => ({ id, color, cards: [] });

describe('winSteps', () => {
  it('opens with the intro and the name, before any set', () => {
    const steps = winSteps([set('a', 'green')]);
    expect(steps[0]).toEqual({ kind: 'intro' });
    expect(steps[1]).toEqual({ kind: 'name' });
  });

  it('adds one step per set, in the order given, with a running index and shared total', () => {
    const sets = [set('a', 'green'), set('b', 'railroad'), set('c', 'pink')];
    const steps = winSteps(sets);
    expect(steps.slice(2)).toEqual([
      { kind: 'set', set: sets[0], index: 0, total: 3 },
      { kind: 'set', set: sets[1], index: 1, total: 3 },
      { kind: 'set', set: sets[2], index: 2, total: 3 },
    ]);
  });

  it('is just intro + name with no complete sets', () => {
    expect(winSteps([])).toEqual([{ kind: 'intro' }, { kind: 'name' }]);
  });
});

describe('stepMs', () => {
  it('gives every kind a positive duration', () => {
    expect(stepMs({ kind: 'intro' })).toBeGreaterThan(0);
    expect(stepMs({ kind: 'name' })).toBeGreaterThan(0);
    expect(stepMs({ kind: 'set', set: set('a', 'green'), index: 0, total: 1 })).toBeGreaterThan(0);
  });
});

describe('revealRate', () => {
  it('climbs with the set index, starting at 1', () => {
    expect(revealRate(0)).toBe(1);
    expect(revealRate(1)).toBeGreaterThan(revealRate(0));
    expect(revealRate(2)).toBeGreaterThan(revealRate(1));
  });
});
