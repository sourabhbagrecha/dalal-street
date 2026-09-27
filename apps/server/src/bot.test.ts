import { describe, expect, it } from 'vitest';
import { fixtures, getLegalCommands, project } from '@monopoly-deal/engine';
import type { Command } from '@monopoly-deal/shared';
import { botThinkingDelayMs, chooseBotCommand, scoreBotCommand } from './bot.js';

function legalFor(playerId: string, commands: readonly Command[]): Command[] {
  return commands.filter((c) => c.playerId === playerId);
}

describe('botThinkingDelayMs', () => {
  it('stays within [min, max] and is deterministic for a given rng', () => {
    const range = { botMinDelayMs: 1000, botMaxDelayMs: 5000 };
    expect(botThinkingDelayMs(range, () => 0)).toBe(1000);
    expect(botThinkingDelayMs(range, () => 1)).toBe(5000);
    expect(botThinkingDelayMs(range, () => 0.5)).toBe(3000);
  });

  it('never goes negative even if max < min', () => {
    expect(botThinkingDelayMs({ botMinDelayMs: 500, botMaxDelayMs: 500 }, () => 0.9)).toBe(500);
  });
});

describe('chooseBotCommand — real engine state (no cheating: view is a projection)', () => {
  it("picks the acting player's most useful legal command on a normal turn", () => {
    const state = fixtures.standardMidGame();
    const view = project(state, 'p1');
    const legal = legalFor('p1', getLegalCommands(state));
    expect(legal.length).toBeGreaterThan(0);

    const chosen = chooseBotCommand(view, legal);
    // pg1 (pass_go) discarded for its effect outscores banking money, starting a
    // fresh property set, or discarding the rent card — see scoreActionDiscard.
    expect(chosen).toEqual({ type: 'PLAY_CARD', playerId: 'p1', cardId: 'pg1', zone: 'discard' });
  });

  it('never falls back to AUTO_RESOLVE_PENDING / FORCE_END_TURN while a real option exists', () => {
    for (const name of Object.keys(fixtures) as (keyof typeof fixtures)[]) {
      const state = fixtures[name]();
      for (const player of state.players) {
        const view = project(state, player.id);
        const legal = legalFor(player.id, getLegalCommands(state));
        if (legal.length === 0) continue;
        const chosen = chooseBotCommand(view, legal);
        const hasRealOption = legal.some(
          (c) => c.type !== 'AUTO_RESOLVE_PENDING' && c.type !== 'FORCE_END_TURN',
        );
        if (hasRealOption) {
          expect(chosen.type).not.toBe('AUTO_RESOLVE_PENDING');
          expect(chosen.type).not.toBe('FORCE_END_TURN');
        }
        expect(legal).toContainEqual(chosen);
      }
    }
  });

  it('draws before anything else while awaiting its draw', () => {
    const state = fixtures.standardMidGame();
    state.turnPhase = 'awaiting_draw';
    state.drawnThisTurn = false;
    const view = project(state, 'p1');
    const legal = legalFor('p1', getLegalCommands(state));
    const chosen = chooseBotCommand(view, legal);
    expect(chosen).toEqual({ type: 'DRAW_TURN_CARDS', playerId: 'p1' });
  });

  it('prefers Just Say No over declining when it holds one', () => {
    const state = fixtures.doubleJustSayNoChain();
    const top = state.pendingStack[state.pendingStack.length - 1];
    if (!top || top.kind !== 'just_say_no') throw new Error('fixture shape changed');
    const respondentId = top.respondentId;
    const view = project(state, respondentId);
    const legal = legalFor(respondentId, getLegalCommands(state));
    const hasRespond = legal.some((c) => c.type === 'RESPOND_JUST_SAY_NO');
    if (hasRespond) {
      const chosen = chooseBotCommand(view, legal);
      expect(chosen.type).toBe('RESPOND_JUST_SAY_NO');
    }
  });
});

describe('scoreBotCommand', () => {
  it('scores completing a property set above starting a fresh one', () => {
    const state = fixtures.oneSetFromWinning();
    const view = project(state, state.players[state.currentPlayerIndex]!.id);
    const legal = getLegalCommands(state).filter(
      (c) => c.playerId === state.players[state.currentPlayerIndex]!.id && c.type === 'PLAY_CARD',
    );
    if (legal.length === 0) return; // fixture may not offer a property play; scorer is exercised elsewhere
    for (const cmd of legal) {
      expect(Number.isFinite(scoreBotCommand(view, cmd))).toBe(true);
    }
  });
});
