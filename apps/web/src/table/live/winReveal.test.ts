import { describe, expect, it } from 'vitest';
import { shouldRevealWin } from './winReveal';

describe('shouldRevealWin', () => {
  it('never reveals before the minimum hold, even once the stage is idle', () => {
    expect(shouldRevealWin(0, false)).toBe(false);
    expect(shouldRevealWin(1199, false)).toBe(false);
  });

  it('reveals once the stage is idle and the minimum hold has passed', () => {
    expect(shouldRevealWin(1200, false)).toBe(true);
    expect(shouldRevealWin(3000, false)).toBe(true);
  });

  it('withholds the reveal past the minimum hold while a scene is still on stage', () => {
    expect(shouldRevealWin(1200, true)).toBe(false);
    expect(shouldRevealWin(3999, true)).toBe(false);
  });

  it('reveals at the ceiling even if the stage never goes idle (a dropped beat)', () => {
    expect(shouldRevealWin(4000, true)).toBe(true);
    expect(shouldRevealWin(5000, true)).toBe(true);
  });
});
