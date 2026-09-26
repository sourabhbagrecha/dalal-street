import { describe, expect, it } from 'vitest';
import { humanizeLogText } from './rows';

describe('humanizeLogText', () => {
  it('names action cards instead of their slugs', () => {
    expect(humanizeLogText('Aarav played deal_breaker')).toBe('Aarav played Deal Breaker');
    expect(humanizeLogText('Action sly_deal cancelled by Just Say No')).toBe('Sly Deal cancelled by Just Say No');
  });

  it('says a play with nothing to act on was wasted, and why', () => {
    expect(humanizeLogText('Aarav played Deal Breaker with no valid set')).toBe('Aarav wasted Deal Breaker · no complete set to take');
    expect(humanizeLogText('Aarav played Sly Deal with no property to take')).toBe('Aarav wasted Sly Deal · no property to take');
    expect(humanizeLogText('Aarav played Forced Deal with no property to swap')).toBe('Aarav wasted Forced Deal · no property to swap');
    expect(humanizeLogText('Aarav played rent but has no matching properties')).toBe('Aarav wasted a rent card · no matching properties');
  });

  it('says which play the clock took', () => {
    expect(humanizeLogText('Aarav forfeited sly_deal_target (auto-resolve)')).toBe('Aarav ran out of time · Sly Deal forfeited');
  });

  it('leaves lines already in plain words alone', () => {
    for (const line of ['Aarav played a rent card', 'Aarav played Just Say No (chain 1)', 'Priya paid ₹3Cr to Aarav (owed ₹3Cr)']) {
      expect(humanizeLogText(line)).toBe(line);
    }
  });
});
