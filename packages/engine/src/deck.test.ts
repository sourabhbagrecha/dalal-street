import { describe, expect, it } from 'vitest';
import { buildDeck, deckCompositionSummary } from './deck.js';
import { createGame } from './createGame.js';
import { dispatch } from './dispatch.js';
import { getLegalCommands } from './validators.js';
import { DECK_SIZE } from '@monopoly-deal/shared';

describe('deck', () => {
  it('has exactly 110 cards', () => {
    expect(buildDeck()).toHaveLength(DECK_SIZE);
  });

  it('matches general_rules.md composition', () => {
    const s = deckCompositionSummary(buildDeck());
    expect(s['rule']).toBe(4);
    expect(s['money_1']).toBe(6);
    expect(s['money_2']).toBe(5);
    expect(s['money_3']).toBe(3);
    expect(s['money_4']).toBe(3);
    expect(s['money_5']).toBe(2);
    expect(s['money_10']).toBe(1);
    expect(s['action_deal_breaker']).toBe(2);
    expect(s['action_just_say_no']).toBe(3);
    expect(s['action_pass_go']).toBe(10);
    expect(s['action_forced_deal']).toBe(3);
    expect(s['action_sly_deal']).toBe(3);
    expect(s['action_debt_collector']).toBe(3);
    expect(s['action_its_my_birthday']).toBe(3);
    expect(s['action_double_the_rent']).toBe(2);
    expect(s['action_house']).toBe(3);
    expect(s['action_hotel']).toBe(2);
    expect(s['rent_wild']).toBe(3);
    expect(s['property_railroad']).toBe(4);
    expect(s['wild_multi']).toBe(2);
  });
});

describe('createGame', () => {
  it('deals 5 cards each and puts rules out of play', () => {
    const { state } = createGame(['a', 'b', 'c', 'd'], 123);
    expect(state.outOfPlay).toHaveLength(4);
    for (const p of state.players) expect(p.hand).toHaveLength(5);
    expect(state.deck.length).toBe(106 - 20);
    expect(state.turnPhase).toBe('awaiting_draw');
  });
});

describe('basic turn', () => {
  it('draws 2 and can end turn', () => {
    let { state } = createGame(['a', 'b'], 7);
    const draw = dispatch(state, { type: 'DRAW_TURN_CARDS', playerId: 'a' });
    expect(draw.rejected).toBeUndefined();
    state = draw.state;
    expect(state.players[0]!.hand.length).toBe(7);
    const end = dispatch(state, { type: 'END_TURN', playerId: 'a' });
    expect(end.rejected).toBeUndefined();
    expect(end.state.currentPlayerIndex).toBe(1);
  });

  it('draws 5 on empty hand', () => {
    const { state: s0 } = createGame(['a', 'b'], 9);
    const hand = [...s0.players[0]!.hand];
    s0.players[0]!.hand = [];
    s0.discard.push(...hand);
    const r = dispatch(s0, { type: 'DRAW_TURN_CARDS', playerId: 'a' });
    expect(r.rejected).toBeUndefined();
    expect(r.state.players[0]!.hand.length).toBe(5);
  });
});

describe('validators', () => {
  it('returns DRAW at start', () => {
    const { state } = createGame(['a', 'b'], 1);
    const legal = getLegalCommands(state);
    expect(legal).toEqual([{ type: 'DRAW_TURN_CARDS', playerId: 'a' }]);
  });
});
