import { describe, expect, it } from 'vitest';
import { fixtures, isCompleteSet, isValidPaymentSelection } from '@monopoly-deal/engine';
import type { Card, PlayerBoard } from '@monopoly-deal/shared';
import { autoPaySelection } from './autopay';
import { view } from './testkit';

const money = (id: string, amount: number): Card => ({ id, kind: 'money', amount, value: amount });
const complete = (set: { cards: Card[] }) => set.cards.length >= 3;

/** The store's payment rule: cover the debt, or hand over everything. */
const settles = (board: PlayerBoard, amount: number) => (ids: string[]) => {
  const all = [...board.bank, ...board.sets.flatMap((s) => [...s.cards, ...(s.house ? [s.house] : []), ...(s.hotel ? [s.hotel] : [])])];
  const total = all.filter((c) => ids.includes(c.id)).reduce((n, c) => n + c.value, 0);
  return total >= amount || total === all.reduce((n, c) => n + c.value, 0);
};
const sum = (board: PlayerBoard, ids: string[]) => board.bank.filter((c) => ids.includes(c.id)).reduce((n, c) => n + c.value, 0);

describe('autoPaySelection', () => {
  it('pays from the bank, cheapest notes first, and hands back what the debt does not need', () => {
    const board: PlayerBoard = { bank: [money('m5', 5), money('m1a', 1), money('m1b', 1), money('m4', 4)], sets: [] };
    const ids = autoPaySelection(board, complete, settles(board, 5));
    expect(sum(board, ids)).toBe(5);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('m4');
  });

  it('a bank that covers the debt leaves the properties alone', () => {
    const state = fixtures.standardMidGame();
    const board = view(state, 'p1').you.board; // bank 5 + 1, orange 2 cards, light blue complete
    expect(autoPaySelection(board, isCompleteSet, settles(board, 6)).sort()).toEqual(['mb1', 'mb2']);
    const ids = autoPaySelection(board, isCompleteSet, settles(board, 5));
    expect(ids).toEqual(['mb1']);
  });

  it('reaches for unfinished sets before completed ones, and buildings count', () => {
    const state = fixtures.standardMidGame();
    const board = view(state, 'p1').you.board;
    // 6 from the bank, 2+2 from the unfinished orange set covers 10; light blue (complete) stays whole.
    const ids = autoPaySelection(board, isCompleteSet, settles(board, 10));
    expect(ids.some((id) => id.startsWith('lb'))).toBe(false);
    expect(ids).toEqual(expect.arrayContaining(['mb1', 'mb2']));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('breaks a completed set only when there is no way around it', () => {
    const state = fixtures.payBreaksCompletedSet(); // p2: bank 1, complete green (4,4,4) with a house (3), owes 5
    const board = view(state, 'p2').you.board;
    const ids = autoPaySelection(board, isCompleteSet, (sel) => isValidPaymentSelection(state, 'p2', 5, sel));
    expect(ids.sort()).toEqual(['gg1', 'tiny']);
  });

  it('pays everything when the debt is bigger than the whole table', () => {
    const state = fixtures.insufficientPayment();
    const board = view(state, 'p2').you.board;
    expect(autoPaySelection(board, isCompleteSet, (sel) => isValidPaymentSelection(state, 'p2', 5, sel))).toEqual(['only1']);
  });

  it('never offers the multicolour wildcard', () => {
    const board: PlayerBoard = {
      bank: [money('m1', 1)],
      sets: [{ id: 's', color: 'red', cards: [{ id: 'mw', kind: 'property_wild', colors: [], value: 0 }] }],
    };
    expect(autoPaySelection(board, complete, settles(board, 5))).toEqual(['m1']);
  });

  it('selects nothing when nothing is owed', () => {
    const board: PlayerBoard = { bank: [money('m1', 1)], sets: [] };
    expect(autoPaySelection(board, complete, settles(board, 0))).toEqual([]);
  });
});
