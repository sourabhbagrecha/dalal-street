import type { Card, GameState, PlayerState } from '@monopoly-deal/shared';
import {
  cardPaymentValue,
  getPlayer,
  isCompleteSet,
  isMulticolorWild,
} from './board.js';

interface PayableAsset {
  id: string;
  value: number;
  /** True when taking this card breaks a completed monopoly. */
  breaksSet: boolean;
  source: 'bank' | 'property';
}

function collectBankAssets(player: PlayerState): PayableAsset[] {
  const out: PayableAsset[] = [];
  for (const c of player.board.bank) {
    if (isMulticolorWild(c)) continue;
    out.push({ id: c.id, value: cardPaymentValue(c), breaksSet: false, source: 'bank' });
  }
  return out.sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
}

function collectPropertyAssets(
  player: PlayerState,
  completeSetsOnly: boolean,
): PayableAsset[] {
  const out: PayableAsset[] = [];
  for (const set of player.board.sets) {
    const complete = isCompleteSet(set);
    if (completeSetsOnly !== complete) continue;
    const breaksSet = complete;
    for (const c of set.cards) {
      if (isMulticolorWild(c)) continue;
      out.push({
        id: c.id,
        value: cardPaymentValue(c),
        breaksSet,
        source: 'property',
      });
    }
    if (set.house) {
      out.push({
        id: set.house.id,
        value: cardPaymentValue(set.house),
        breaksSet,
        source: 'property',
      });
    }
    if (set.hotel) {
      out.push({
        id: set.hotel.id,
        value: cardPaymentValue(set.hotel),
        breaksSet,
        source: 'property',
      });
    }
  }
  return out.sort((a, b) => a.value - b.value || a.id.localeCompare(b.id));
}

function sumValues(assets: PayableAsset[], ids: Set<string>): number {
  let s = 0;
  for (const a of assets) {
    if (ids.has(a.id)) s += a.value;
  }
  return s;
}

/**
 * Find a cheapest-sufficient subset: minimize total value among subsets with
 * sum >= needed; tie-break fewer cards, then lexicographically smaller id list.
 */
function cheapestSufficient(pool: PayableAsset[], needed: number): string[] | null {
  if (needed <= 0) return [];
  const total = pool.reduce((s, a) => s + a.value, 0);
  if (total < needed) return null;

  const n = pool.length;
  let best: string[] | null = null;
  let bestSum = Infinity;

  // n is small (board assets); enumerate subsets.
  const limit = 1 << n;
  for (let mask = 1; mask < limit; mask++) {
    let sum = 0;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += pool[i]!.value;
        ids.push(pool[i]!.id);
      }
    }
    if (sum < needed) continue;
    if (
      sum < bestSum ||
      (sum === bestSum &&
        best !== null &&
        (ids.length < best.length ||
          (ids.length === best.length && ids.slice().sort().join() < best.slice().sort().join())))
    ) {
      bestSum = sum;
      best = ids;
    } else if (best === null) {
      bestSum = sum;
      best = ids;
    }
  }
  return best;
}

/**
 * Cheapest sufficient auto-payment per AGENTS.md:
 * bank first, then properties by ascending value, break completed sets only if
 * unavoidable; multicolor wilds never payable. If total assets < amount, pay everything payable.
 */
export function computeAutoPayment(
  state: GameState,
  playerId: string,
  amount: number,
): string[] {
  const player = getPlayer(state, playerId);
  const bank = collectBankAssets(player);
  const incomplete = collectPropertyAssets(player, false);
  const complete = collectPropertyAssets(player, true);
  const all = [...bank, ...incomplete, ...complete];

  if (all.length === 0) return [];

  const payableTotal = all.reduce((s, a) => s + a.value, 0);
  if (payableTotal <= amount) {
    return all.map((a) => a.id);
  }

  // Prefer bank-only.
  const bankOnly = cheapestSufficient(bank, amount);
  if (bankOnly) return bankOnly;

  // Bank + incomplete-set properties (no monopoly break).
  const noBreak = cheapestSufficient([...bank, ...incomplete], amount);
  if (noBreak) return noBreak;

  // Must break completed sets.
  const withBreak = cheapestSufficient(all, amount);
  if (withBreak) return withBreak;

  return all.map((a) => a.id);
}

/** Pick which hand cards to discard to reach HAND_LIMIT, keeping highest value. */
export function computeAutoDiscard(hand: Card[], excess: number): string[] {
  if (excess <= 0) return [];
  const sorted = [...hand].sort(
    (a, b) => cardPaymentValue(a) - cardPaymentValue(b) || a.id.localeCompare(b.id),
  );
  return sorted.slice(0, excess).map((c) => c.id);
}

export function _sumSelected(state: GameState, playerId: string, ids: string[]): number {
  const player = getPlayer(state, playerId);
  const all = [
    ...collectBankAssets(player),
    ...collectPropertyAssets(player, false),
    ...collectPropertyAssets(player, true),
  ];
  return sumValues(all, new Set(ids));
}
