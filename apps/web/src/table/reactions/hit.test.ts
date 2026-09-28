import { describe, expect, it } from 'vitest';
import type { Card } from '@monopoly-deal/shared';
import type { Beat } from '../model';
import { hitsMe } from './hit';

const face: Card = { id: 'face', kind: 'action', action: 'sly_deal', value: 3 };
const card: Card = { id: 'c1', kind: 'property', color: 'red', value: 3, name: 'Jaipur' };

describe('hitsMe', () => {
  it('is false with nothing on stage', () => {
    expect(hitsMe(null, 'me')).toBe(false);
  });

  it('a levy only counts once its own takes names the viewer (settled in the same batch, or broke)', () => {
    const noTakesYet: Beat = { id: 1, kind: 'levy', by: 'rival', played: face, label: 'RENT', takes: [] };
    expect(hitsMe(noTakesYet, 'me')).toBe(false);

    const settled: Beat = { id: 2, kind: 'levy', by: 'rival', played: face, label: 'RENT', takes: [{ from: 'me', owed: 3, cards: [card] }] };
    expect(hitsMe(settled, 'me')).toBe(true);

    const someoneElse: Beat = { id: 3, kind: 'levy', by: 'rival', played: face, label: 'RENT', takes: [{ from: 'other', owed: 3, cards: [] }] };
    expect(hitsMe(someoneElse, 'me')).toBe(false);
  });

  it('a pay counts when the viewer is the one handing cards over, not when they are the one collecting', () => {
    const iPaid: Beat = { id: 4, kind: 'pay', by: 'me', to: 'rival', cards: [card], label: '-3' };
    expect(hitsMe(iPaid, 'me')).toBe(true);

    const iCollected: Beat = { id: 5, kind: 'pay', by: 'rival', to: 'me', cards: [card], label: '+3' };
    expect(hitsMe(iCollected, 'me')).toBe(false);
  });

  it('a loot (Sly Deal / Forced Deal) counts only for the one stolen from', () => {
    const stolenFromMe: Beat = { id: 6, kind: 'loot', by: 'rival', from: 'me', card, setId: 'set1', played: face, label: 'SLY DEAL' };
    expect(hitsMe(stolenFromMe, 'me')).toBe(true);

    const iStole: Beat = { id: 7, kind: 'loot', by: 'me', from: 'rival', card, setId: 'set1', played: face, label: 'SLY DEAL' };
    expect(hitsMe(iStole, 'me')).toBe(false);
  });

  it('a raid (Deal Breaker) counts only for the one raided', () => {
    const raided: Beat = { id: 8, kind: 'raid', by: 'rival', from: 'me', set: { id: 'set1', color: 'red', cards: [card] }, played: face, label: 'DEAL BREAKER' };
    expect(hitsMe(raided, 'me')).toBe(true);
  });

  it('beats with no victim (deal/lay/toss/grab/block/reset) never count', () => {
    const deal: Beat = { id: 9, kind: 'deal', to: 'me', cards: [card] };
    expect(hitsMe(deal, 'me')).toBe(false);
    const lay: Beat = { id: 10, kind: 'lay', by: 'me', card, into: 'bank' };
    expect(hitsMe(lay, 'me')).toBe(false);
    const reset: Beat = { id: 11, kind: 'reset' };
    expect(hitsMe(reset, 'me')).toBe(false);
  });
});
