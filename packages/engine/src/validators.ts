import type { Command, GameState, PropertyColor } from '@monopoly-deal/shared';
import { SET_SIZES } from '@monopoly-deal/shared';
import {
  canAssignWildToColor,
  canBuildHotel,
  canBuildHouse,
  cardPaymentValue,
  completeSetsOf,
  currentPlayer,
  getPlayer,
  isCompleteSet,
  isMulticolorWild,
  stealableProperties,
  totalAssetValue,
} from './board.js';

/** All currently legal commands for the active respondent / current player. */
export function getLegalCommands(state: GameState): Command[] {
  if (state.turnPhase === 'game_over' || state.winnerId) return [];

  const top = state.pendingStack[state.pendingStack.length - 1];
  if (top) {
    return legalForPending(state, top);
  }

  const player = currentPlayer(state);
  const cmds: Command[] = [];

  if (state.turnPhase === 'awaiting_draw' && !state.drawnThisTurn) {
    cmds.push({ type: 'DRAW_TURN_CARDS', playerId: player.id });
    return cmds;
  }

  if (state.turnPhase === 'playing') {
    if (state.playsRemaining > 0) {
      for (const card of player.hand) {
        // Bank
        if (card.kind !== 'property' && card.kind !== 'property_wild' && card.kind !== 'rule') {
          // D9: keep steal cards circulating — do not offer bank for them
          const isSteal =
            card.kind === 'action' &&
            (card.action === 'deal_breaker' ||
              card.action === 'sly_deal' ||
              card.action === 'forced_deal');
          if (!isSteal) {
            cmds.push({
              type: 'PLAY_CARD',
              playerId: player.id,
              cardId: card.id,
              zone: 'bank',
            });
          }
        }
        // Property
        if (card.kind === 'property') {
          cmds.push({
            type: 'PLAY_CARD',
            playerId: player.id,
            cardId: card.id,
            zone: 'property',
          });
        }
        if (card.kind === 'property_wild') {
          const colors: PropertyColor[] =
            card.colors.length === 0
              ? [
                  'brown',
                  'light_blue',
                  'pink',
                  'orange',
                  'red',
                  'yellow',
                  'green',
                  'dark_blue',
                  'railroad',
                  'utility',
                ]
              : card.colors;
          for (const assignedColor of colors) {
            if (canAssignWildToColor(card, assignedColor)) {
              cmds.push({
                type: 'PLAY_CARD',
                playerId: player.id,
                cardId: card.id,
                zone: 'property',
                target: { assignedColor },
              });
            }
          }
        }
        // Action / rent to discard
        if (card.kind === 'rent') {
          cmds.push({
            type: 'PLAY_CARD',
            playerId: player.id,
            cardId: card.id,
            zone: 'discard',
          });
        }
        if (card.kind === 'action' && card.action !== 'just_say_no') {
          if (card.action === 'debt_collector') {
            for (const opp of state.players) {
              if (opp.id === player.id) continue;
              cmds.push({
                type: 'PLAY_CARD',
                playerId: player.id,
                cardId: card.id,
                zone: 'discard',
                target: { targetPlayerId: opp.id },
              });
            }
          } else if (card.action === 'sly_deal') {
            const any = state.players.some(
              (p) => p.id !== player.id && stealableProperties(p).length > 0,
            );
            if (any) {
              cmds.push({
                type: 'PLAY_CARD',
                playerId: player.id,
                cardId: card.id,
                zone: 'discard',
              });
            }
          } else if (card.action === 'forced_deal') {
            const own = stealableProperties(player).length > 0;
            const any = state.players.some(
              (p) => p.id !== player.id && stealableProperties(p).length > 0,
            );
            if (own && any) {
              cmds.push({
                type: 'PLAY_CARD',
                playerId: player.id,
                cardId: card.id,
                zone: 'discard',
              });
            }
          } else if (card.action === 'deal_breaker') {
            const any = state.players.some(
              (p) => p.id !== player.id && completeSetsOf(p).length > 0,
            );
            if (any) {
              cmds.push({
                type: 'PLAY_CARD',
                playerId: player.id,
                cardId: card.id,
                zone: 'discard',
              });
            }
          } else if (card.action === 'house') {
            if (player.board.sets.some(canBuildHouse)) {
              cmds.push({
                type: 'PLAY_CARD',
                playerId: player.id,
                cardId: card.id,
                zone: 'discard',
              });
            }
          } else if (card.action === 'hotel') {
            if (player.board.sets.some(canBuildHotel)) {
              cmds.push({
                type: 'PLAY_CARD',
                playerId: player.id,
                cardId: card.id,
                zone: 'discard',
              });
            }
          } else {
            cmds.push({
              type: 'PLAY_CARD',
              playerId: player.id,
              cardId: card.id,
              zone: 'discard',
            });
          }
        }
      }
    }

    // Rearranges: expose only moves that complete a set (keeps the legal-move
    // list from being dominated by wild×color permutations for the bot).
    // Full rearrange options are available via getLegalRearranges().
    for (const set of player.board.sets) {
      for (const card of set.cards) {
        if (card.kind !== 'property_wild') continue;
        const colors: PropertyColor[] =
          card.colors.length === 0
            ? [
                'brown',
                'light_blue',
                'pink',
                'orange',
                'red',
                'yellow',
                'green',
                'dark_blue',
                'railroad',
                'utility',
              ]
            : card.colors;
        for (const toColor of colors) {
          if (toColor === set.color || !canAssignWildToColor(card, toColor)) continue;
          const dest = player.board.sets.find(
            (s) => s.color === toColor && s.cards.length > 0 && s.cards.length < SET_SIZES[toColor],
          );
          if (dest && dest.cards.length + 1 >= SET_SIZES[toColor]) {
            cmds.push({
              type: 'REARRANGE_PROPERTY',
              playerId: player.id,
              cardId: card.id,
              toColor,
            });
          }
        }
      }
    }

    if (state.drawnThisTurn) {
      cmds.push({ type: 'END_TURN', playerId: player.id });
    }
  }

  return cmds;
}

function legalForPending(
  state: GameState,
  top: GameState['pendingStack'][number],
): Command[] {
  const cmds: Command[] = [];

  switch (top.kind) {
    case 'payment': {
      const payer = getPlayer(state, top.payerId);
      const assets = collectPayableCards(payer);
      // Generate combinations that meet debt or all assets if insufficient
      const needed = top.amountDue;
      const totalAssets = totalAssetValue(payer);
      if (totalAssets === 0) {
        // Nothing to pay — should have been skipped; allow empty payment
        cmds.push({ type: 'SELECT_PAYMENT', playerId: top.payerId, cardIds: [] });
        return cmds;
      }
      const combos = paymentCombos(assets, needed, totalAssets);
      for (const cardIds of combos) {
        cmds.push({ type: 'SELECT_PAYMENT', playerId: top.payerId, cardIds });
      }
      return cmds;
    }
    case 'just_say_no': {
      const respondent = getPlayer(state, top.respondentId);
      cmds.push({ type: 'DECLINE_JUST_SAY_NO', playerId: top.respondentId });
      for (const c of respondent.hand) {
        if (c.kind === 'action' && c.action === 'just_say_no') {
          cmds.push({
            type: 'RESPOND_JUST_SAY_NO',
            playerId: top.respondentId,
            cardId: c.id,
          });
        }
      }
      return cmds;
    }
    case 'hand_limit_discard': {
      const player = getPlayer(state, top.playerId);
      const combos = combinations(
        player.hand.map((c) => c.id),
        top.excess,
      );
      for (const cardIds of combos) {
        cmds.push({ type: 'DISCARD_EXCESS', playerId: top.playerId, cardIds });
      }
      return cmds;
    }
    case 'rent_color_choice': {
      for (const color of top.eligibleColors) {
        cmds.push({ type: 'SELECT_RENT_COLOR', playerId: top.actorId, color });
      }
      return cmds;
    }
    case 'rent_player_choice': {
      for (const p of state.players) {
        if (p.id === top.actorId) continue;
        cmds.push({
          type: 'SELECT_RENT_PLAYER',
          playerId: top.actorId,
          targetPlayerId: p.id,
        });
      }
      return cmds;
    }
    case 'sly_deal_target': {
      for (const p of state.players) {
        if (p.id === top.actorId) continue;
        for (const { card, set } of stealableProperties(p)) {
          if (isCompleteSet(set) && set.cards.some((c) => c.id === card.id)) continue;
          cmds.push({
            type: 'SELECT_STEAL_TARGET',
            playerId: top.actorId,
            targetCardId: card.id,
          });
        }
      }
      // If no targets, still need a way forward — allow picking nothing by... 
      // Deal breaker style waste isn't for sly. Bot may stall — add END not allowed.
      // If empty, legal commands empty would stall simulate — allow cancel by...
      // For empty stealables, pop is not available. Bot harness should still work
      // since cards only playable when targets exist via validator on PLAY.
      return cmds;
    }
    case 'forced_deal_target': {
      const actor = getPlayer(state, top.actorId);
      const ownOptions = stealableProperties(actor);
      for (const p of state.players) {
        if (p.id === top.actorId) continue;
        for (const theirs of stealableProperties(p)) {
          for (const mine of ownOptions) {
            cmds.push({
              type: 'SELECT_STEAL_TARGET',
              playerId: top.actorId,
              targetCardId: theirs.card.id,
              ownCardId: mine.card.id,
            });
          }
        }
      }
      return cmds;
    }
    case 'deal_breaker_target': {
      for (const p of state.players) {
        if (p.id === top.actorId) continue;
        for (const set of completeSetsOf(p)) {
          cmds.push({
            type: 'SELECT_STEAL_TARGET',
            playerId: top.actorId,
            targetSetId: set.id,
          });
        }
      }
      // If none, still need escape — play already consumed; auto-resolve empty
      if (cmds.length === 0) {
        cmds.push({
          type: 'SELECT_STEAL_TARGET',
          playerId: top.actorId,
          targetSetId: '__none__',
        });
      }
      return cmds;
    }
    case 'house_hotel_target': {
      const actor = getPlayer(state, top.actorId);
      for (const set of actor.board.sets) {
        if (top.building === 'house' && canBuildHouse(set)) {
          cmds.push({ type: 'SELECT_BUILDING_SET', playerId: top.actorId, setId: set.id });
        }
        if (top.building === 'hotel' && canBuildHotel(set)) {
          cmds.push({ type: 'SELECT_BUILDING_SET', playerId: top.actorId, setId: set.id });
        }
      }
      return cmds;
    }
    case 'double_rent_pending': {
      // Can still play cards (especially rent) or end turn / bank etc.
      // Filter pending so getLegalCommands sees double_rent as soft
      const without = {
        ...state,
        pendingStack: state.pendingStack.filter((p) => p.kind !== 'double_rent_pending'),
      };
      return getLegalCommands(without);
    }
    default:
      return cmds;
  }
}

function collectPayableCards(player: ReturnType<typeof getPlayer>): { id: string; value: number }[] {
  const out: { id: string; value: number }[] = [];
  for (const c of player.board.bank) {
    const v = cardPaymentValue(c);
    if (v > 0 || !isMulticolorWild(c)) {
      if (!isMulticolorWild(c)) out.push({ id: c.id, value: v });
    }
  }
  for (const set of player.board.sets) {
    for (const c of set.cards) {
      if (isMulticolorWild(c)) continue;
      out.push({ id: c.id, value: cardPaymentValue(c) });
    }
    if (set.house) out.push({ id: set.house.id, value: cardPaymentValue(set.house) });
    if (set.hotel) out.push({ id: set.hotel.id, value: cardPaymentValue(set.hotel) });
  }
  return out;
}

/** Bounded payment combinations for the bot. */
function paymentCombos(
  assets: { id: string; value: number }[],
  needed: number,
  totalAssets: number,
): string[][] {
  if (assets.length === 0) return [[]];
  // If total < needed, only full set is legal
  if (totalAssets <= needed) {
    return [assets.map((a) => a.id)];
  }
  // Find subsets that reach needed (prefer smaller for bot variety)
  const results: string[][] = [];
  const maxN = Math.min(assets.length, 8); // bound explosion
  const ids = assets.map((a) => a.id);
  const values = assets.map((a) => a.value);

  function dfs(start: number, chosen: number[], sum: number): void {
    if (sum >= needed && chosen.length > 0) {
      results.push(chosen.map((i) => ids[i]!));
      if (results.length >= 40) return;
    }
    if (chosen.length >= maxN || results.length >= 40) return;
    for (let i = start; i < assets.length; i++) {
      chosen.push(i);
      dfs(i + 1, chosen, sum + values[i]!);
      chosen.pop();
      if (results.length >= 40) return;
    }
  }
  dfs(0, [], 0);
  if (results.length === 0) {
    // fallback: take cards greedily
    const sorted = [...assets].sort((a, b) => b.value - a.value);
    const greedy: string[] = [];
    let s = 0;
    for (const a of sorted) {
      greedy.push(a.id);
      s += a.value;
      if (s >= needed) break;
    }
    results.push(greedy);
  }
  return results;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  if (k === arr.length) return [[...arr]];
  // Bound for hand limit (max excess typically small)
  if (arr.length > 12 && k > 3) {
    // sample first C-limited
    const out: T[][] = [];
    const limit = 30;
    function dfs(start: number, path: T[]): void {
      if (path.length === k) {
        out.push([...path]);
        return;
      }
      if (out.length >= limit) return;
      for (let i = start; i < arr.length; i++) {
        path.push(arr[i]!);
        dfs(i + 1, path);
        path.pop();
        if (out.length >= limit) return;
      }
    }
    dfs(0, []);
    return out;
  }
  const out: T[][] = [];
  function dfs(start: number, path: T[]): void {
    if (path.length === k) {
      out.push([...path]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      path.push(arr[i]!);
      dfs(i + 1, path);
      path.pop();
    }
  }
  dfs(0, []);
  return out;
}

export function isCommandLegal(state: GameState, command: Command): boolean {
  const legal = getLegalCommands(state);
  return legal.some((c) => JSON.stringify(c) === JSON.stringify(command));
}

/** Full rearrange surface for UI (not flooded into getLegalCommands). */
export function getLegalRearranges(state: GameState, playerId: string): Command[] {
  if (state.pendingStack.some((p) => p.kind !== 'double_rent_pending')) return [];
  if (currentPlayer(state).id !== playerId) return [];
  if (state.turnPhase === 'game_over') return [];
  const player = getPlayer(state, playerId);
  const cmds: Command[] = [];
  for (const set of player.board.sets) {
    for (const card of set.cards) {
      if (card.kind !== 'property_wild') continue;
      const colors: PropertyColor[] =
        card.colors.length === 0
          ? [
              'brown',
              'light_blue',
              'pink',
              'orange',
              'red',
              'yellow',
              'green',
              'dark_blue',
              'railroad',
              'utility',
            ]
          : card.colors;
      for (const toColor of colors) {
        if (toColor !== set.color && canAssignWildToColor(card, toColor)) {
          cmds.push({
            type: 'REARRANGE_PROPERTY',
            playerId,
            cardId: card.id,
            toColor,
          });
        }
      }
    }
  }
  return cmds;
}
