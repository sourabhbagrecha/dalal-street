/**
 * Board-highlight reads for the presentation layer. Every hook here is a thin,
 * memoized projection of `momentStore`'s `highlights` array (see
 * `moments/types.ts` `Highlight` / `HighlightKind`) — nothing here mutates the
 * store, prunes it, or owns timing; `useTableMoments` already prunes expired
 * highlights on an interval, and `useMomentState` (a `useSyncExternalStore`
 * subscription) is what makes these hooks re-render when that happens.
 */
import { useMemo } from 'react';
import { useMomentState } from './store';
import type { HighlightKind } from './types';

/** Highest-priority active highlight wins when a player has more than one. */
const PRIORITY: HighlightKind[] = ['targeted', 'stolen', 'denied', 'received', 'blocked', 'paid', 'gained'];

/** The single highlight (by priority) currently active for one player, or null. */
export function useAttentionFor(playerId: string): HighlightKind | null {
  const { highlights } = useMomentState();
  return useMemo(() => {
    const active = new Set(highlights.filter((h) => h.playerId === playerId).map((h) => h.kind));
    for (const kind of PRIORITY) {
      if (active.has(kind)) return kind;
    }
    return null;
  }, [highlights, playerId]);
}

/** cardId -> highest-priority active highlight kind, across every player's cards. */
export function useCardAttention(): Map<string, HighlightKind> {
  const { highlights } = useMomentState();
  return useMemo(() => {
    const map = new Map<string, HighlightKind>();
    // Walk lowest priority first so a later (higher-priority) pass overwrites it.
    for (const kind of [...PRIORITY].reverse()) {
      for (const h of highlights) {
        if (h.kind !== kind) continue;
        for (const cardId of h.cardIds) map.set(cardId, kind);
      }
    }
    return map;
  }, [highlights]);
}

/** A player's bank highlight: money just left ('paid') or arrived ('gained'). */
export function useBankAttention(playerId: string): 'paid' | 'gained' | null {
  const { highlights } = useMomentState();
  return useMemo(() => {
    let latest: HighlightKind | null = null;
    let latestId = -1;
    for (const h of highlights) {
      if (h.playerId !== playerId || (h.kind !== 'paid' && h.kind !== 'gained')) continue;
      if (h.id > latestId) {
        latestId = h.id;
        latest = h.kind;
      }
    }
    return latest as 'paid' | 'gained' | null;
  }, [highlights, playerId]);
}
