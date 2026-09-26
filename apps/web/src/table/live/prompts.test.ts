import { describe, expect, it } from 'vitest';
import { fixtures } from '@monopoly-deal/engine';
import type { Card, GameState } from '@monopoly-deal/shared';
import type { Prompt } from '../model';
import { derivePrompt, payableAssets, type PromptInput } from './prompts';
import { actionCard, promptDeps, step, view, withHand } from './testkit';

const none: PromptInput = { give: null, paySel: [], discardSel: [] };
const promptFor = (state: GameState, viewer: string, input: PromptInput = none): Prompt | null =>
  derivePrompt(view(state, viewer), input, promptDeps(state));

/** p1 plays `cardId` to the discard pile. */
const play = (state: GameState, playerId: string, cardId: string): GameState =>
  step(state, { type: 'PLAY_CARD', playerId, cardId, zone: 'discard' });

describe('derivePrompt — nothing owed', () => {
  it('is null on a quiet turn, for everyone', () => {
    const state = fixtures.responsiveMidGame();
    for (const id of ['p1', 'p2', 'p3', 'p4']) expect(promptFor(state, id)).toBeNull();
  });

  it('is null while only a Double the Rent is pending', () => {
    const state = play(fixtures.doubleRentCombo(), 'p1', 'dbl1');
    expect(state.pendingStack.map((p) => p.kind)).toEqual(['double_rent_pending']);
    expect(promptFor(state, 'p1')).toBeNull();
  });
});

describe('derivePrompt — target choices', () => {
  it('sly deal: the played card is the discard top, and only the actor gets the prompt', () => {
    const state = play(fixtures.responsiveMidGame(), 'p1', 'sd1');
    const prompt = promptFor(state, 'p1');
    expect(prompt).toMatchObject({ kind: 'target', action: 'sly_deal' });
    expect(prompt?.kind === 'target' && prompt.card?.id).toBe('sd1');
    for (const id of ['p2', 'p3', 'p4']) expect(promptFor(state, id)).toBeNull();
  });

  it('deal breaker', () => {
    const state = play(fixtures.dealBreakerOnSetWithHotel(), 'p1', 'dbk1');
    expect(promptFor(state, 'p1')).toMatchObject({ kind: 'target', action: 'deal_breaker' });
  });

  it('debt collector asks who pays 5', () => {
    const state = play(fixtures.debtCollectorChoice(), 'p1', 'dc1');
    expect(promptFor(state, 'p1')).toMatchObject({ kind: 'target', action: 'debt_collector', amount: 5 });
  });

  it('forced deal: your own property first, then theirs (the give is remembered)', () => {
    const start = { ...fixtures.responsiveMidGame(), currentPlayerIndex: 2 }; // p3 holds fd1 and owns u1
    const state = play(start, 'p3', 'fd1');
    expect(promptFor(state, 'p3')).toMatchObject({ kind: 'target', action: 'forced_deal', step: 'own' });
    const second = promptFor(state, 'p3', { ...none, give: 'u1' });
    expect(second).toMatchObject({ kind: 'target', action: 'forced_deal', step: 'rival', give: 'u1' });
    // A give that is no longer on your table is forgotten.
    expect(promptFor(state, 'p3', { ...none, give: 'nope' })).toMatchObject({ step: 'own' });
  });

  it('rent colour: each eligible colour with what its set would charge, dearest first', () => {
    const start = withHand(fixtures.standardMidGame(), 'p1', [{ id: 'wr1', kind: 'rent', rentType: 'wild', colors: [], value: 3 }]);
    const state = play(start, 'p1', 'wr1');
    const prompt = promptFor(state, 'p1');
    expect(prompt).toMatchObject({ kind: 'target', action: 'rent', doubles: 0 });
    if (prompt?.kind !== 'target') throw new Error('unreachable');
    expect(prompt.card?.id).toBe('wr1');
    expect(prompt.colors?.map((c) => c.color).sort()).toEqual(['light_blue', 'orange']);
    const amounts = prompt.colors!.map((c) => c.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(amounts.every((n) => n > 0)).toBe(true);
  });

  it('rent colour: a Double the Rent stacked first shows the doubled amounts, what the rival is then asked to pay', () => {
    const wild: Card = { id: 'wr1', kind: 'rent', rentType: 'wild', colors: [], value: 3 };
    const single = promptFor(play(withHand(fixtures.standardMidGame(), 'p1', [wild]), 'p1', 'wr1'), 'p1');
    const withDouble = withHand(fixtures.standardMidGame(), 'p1', [actionCard('dbl1', 'double_the_rent', 1), wild]);
    const doubled = promptFor(play(play(withDouble, 'p1', 'dbl1'), 'p1', 'wr1'), 'p1');
    if (single?.kind !== 'target' || doubled?.kind !== 'target') throw new Error('unreachable');
    expect(doubled).toMatchObject({ action: 'rent', doubles: 1 });
    expect(doubled.colors).toEqual(single.colors!.map((c) => ({ color: c.color, amount: c.amount * 2 })));
    const asked = promptFor(step(play(play(withDouble, 'p1', 'dbl1'), 'p1', 'wr1'), { type: 'SELECT_RENT_COLOR', playerId: 'p1', color: doubled.colors![0]!.color }), 'p1');
    expect(asked).toMatchObject({ action: 'rent_player', amount: doubled.colors![0]!.amount });
  });

  it('rent player: the single colour with the amount, doubles included', () => {
    const start = withHand(fixtures.standardMidGame(), 'p1', [{ id: 'wr1', kind: 'rent', rentType: 'wild', colors: [], value: 3 }]);
    const state = step(play(start, 'p1', 'wr1'), { type: 'SELECT_RENT_COLOR', playerId: 'p1', color: 'light_blue' });
    const prompt = promptFor(state, 'p1');
    expect(prompt).toMatchObject({ kind: 'target', action: 'rent_player', doubles: 0 });
    if (prompt?.kind !== 'target') throw new Error('unreachable');
    expect(prompt.colors).toEqual([{ color: 'light_blue', amount: prompt.amount }]);
    expect(prompt.amount).toBeGreaterThan(0);
  });

  it('building: only complete sets that lack that building are offered', () => {
    const start = withHand(fixtures.standardMidGame(), 'p1', [actionCard('hz1', 'house', 3)]);
    const state = play(start, 'p1', 'hz1');
    const prompt = promptFor(state, 'p1');
    expect(prompt).toMatchObject({ kind: 'target', action: 'building', building: 'house' });
    // light blue is complete (3 of 3), orange has 2 of 3.
    expect(prompt?.kind === 'target' && prompt.eligibleSets).toEqual(['set_lb']);
    expect(prompt?.kind === 'target' && prompt.card?.id).toBe('hz1');
  });
});

describe('derivePrompt — payment', () => {
  const afterDebtCollector = () =>
    step(play(fixtures.debtCollectorChoice(), 'p1', 'dc1'), { type: 'SELECT_DEBT_COLLECTOR_PLAYER', playerId: 'p1', targetPlayerId: 'p2' });

  it('the payer sees what is owed, to whom, and the cards they may hand over', () => {
    const state = afterDebtCollector();
    const prompt = promptFor(state, 'p2', { ...none, paySel: ['p2b', 'not-mine'] });
    expect(prompt).toMatchObject({ kind: 'pay', toId: 'p1', amount: 5, reason: 'Debt Collector', valid: true });
    if (prompt?.kind !== 'pay') throw new Error('unreachable');
    expect(prompt.assets.map((c) => c.id)).toEqual(['p2b']);
    // Selections that are not payable cards are dropped.
    expect(prompt.sel).toEqual(['p2b']);
    expect(promptFor(state, 'p2')).toMatchObject({ kind: 'pay', valid: false, sel: [] });
    // Nobody else owes anything.
    for (const id of ['p1', 'p3', 'p4']) expect(promptFor(state, id)).toBeNull();
  });

  it('a payment round asks each payer for their own share', () => {
    const state = play(fixtures.parallelRentCollection(), 'p1', 'rent_brown_lb');
    expect(state.pendingStack[0]?.kind).toBe('payment_round');
    const p3 = promptFor(state, 'p3');
    expect(p3).toMatchObject({ kind: 'pay', toId: 'p1', reason: 'Rent', valid: false });
    expect(p3?.kind === 'pay' && p3.amount).toBeGreaterThan(0);
    expect(promptFor(state, 'p1')).toBeNull();
  });

  it('assets never include the multicolour wildcard, but do include buildings', () => {
    const state = fixtures.payBreaksCompletedSet();
    const ids = payableAssets(view(state, 'p2')).map((c) => c.id);
    expect(ids).toEqual(['tiny', 'gg1', 'gg2', 'gg3', 'gh1']);
    const wild = structuredClone(fixtures.wildcardUsage());
    wild.players[0]!.board.sets[0]!.cards.push({ id: 'mw', kind: 'property_wild', colors: [], value: 0 });
    expect(payableAssets(view(wild, 'p1')).map((c) => c.id)).not.toContain('mw');
  });
});

describe('derivePrompt — just say no', () => {
  const chain = (respondentId: string, initiatorId: string, jsnCount: number): GameState => {
    const state = structuredClone(fixtures.doubleJustSayNoChain());
    state.pendingStack = [
      {
        kind: 'just_say_no',
        respondentId,
        initiatorId,
        jsnCount,
        contestedAction: { type: 'debt_collector', actorId: 'p1', targetPlayerId: 'p2', payload: {} },
      },
    ];
    return state;
  };

  it('the target is asked, naming the actor and what they want', () => {
    const state = chain('p2', 'p1', 0);
    const prompt = promptFor(state, 'p2');
    expect(prompt).toMatchObject({ kind: 'jsn', fromId: 'p1', label: 'Debt Collector', at: null });
    expect(prompt?.kind === 'jsn' && prompt.threat).toContain('Aarav');
    expect(prompt?.kind === 'jsn' && prompt.card.kind === 'action' && prompt.card.action).toBe('debt_collector');
    expect(prompt?.kind === 'jsn' && prompt.payerId).toBeUndefined();
    expect(promptFor(state, 'p1')).toBeNull();
  });

  it('the actor countering a Just Say No is told who said it', () => {
    const state = chain('p1', 'p2', 1);
    const prompt = promptFor(state, 'p1');
    expect(prompt).toMatchObject({ kind: 'jsn', fromId: 'p2', label: 'Debt Collector' });
    expect(prompt?.kind === 'jsn' && prompt.threat).toBe('Priya said no to your Debt Collector');
  });

  it('a Sly Deal names the card of yours at stake', () => {
    const state = structuredClone(fixtures.responsiveMidGame());
    state.pendingStack = [
      {
        kind: 'just_say_no',
        respondentId: 'p3',
        initiatorId: 'p1',
        jsnCount: 0,
        contestedAction: { type: 'sly_deal', actorId: 'p1', targetPlayerId: 'p3', payload: { targetCardId: 'u1' } },
      },
    ];
    const prompt = promptFor(state, 'p3');
    expect(prompt).toMatchObject({ kind: 'jsn', fromId: 'p1', label: 'Sly Deal' });
    expect(prompt?.kind === 'jsn' && prompt.at?.id).toBe('u1');
    expect(prompt?.kind === 'jsn' && prompt.threat).toContain('wants to take your');
  });

  it('inside a payment round the answer says which payer it is for', () => {
    const start = withHand(fixtures.standardMidGame(), 'p1', [actionCard('bd1', 'its_my_birthday', 2)]);
    const state = play(start, 'p1', 'bd1');
    expect(state.pendingStack[0]?.kind).toBe('payment_round');
    // p2 holds the only Just Say No; the others go straight to paying.
    const p2 = promptFor(state, 'p2');
    expect(p2).toMatchObject({ kind: 'jsn', fromId: 'p1', label: "It's My Birthday", payerId: 'p2' });
    expect(promptFor(state, 'p3')).toMatchObject({ kind: 'pay', toId: 'p1', amount: 2 });
    expect(promptFor(state, 'p1')).toBeNull();
  });
});

describe('derivePrompt — hand limit', () => {
  it('asks the discarder for the excess, with their picks, and offers "play instead" only while plays remain', () => {
    const state = fixtures.overHandLimit();
    const prompt = promptFor(state, 'p1', { ...none, discardSel: ['oh0', 'oh1', 'oh2', 'gone'] });
    expect(prompt).toEqual({ kind: 'discard', excess: 2, sel: ['oh0', 'oh1'], canResume: true });
    expect(promptFor(state, 'p2')).toBeNull();
    const spent = { ...state, playsRemaining: 0 };
    expect(promptFor(spent, 'p1')).toMatchObject({ kind: 'discard', canResume: false });
  });
});
