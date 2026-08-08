import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import {
  faceOf,
  facesVersion,
  otherFaceOf,
  pruneFaces,
  setFace,
  subscribeFaces,
} from './wildFaceStore';

/** React bindings over the hand-wildcard face map. See `wildFaceStore.ts`. */

/** Re-renders the caller whenever any face changes. */
export function useWildFaces(): number {
  return useSyncExternalStore(subscribeFaces, facesVersion, facesVersion);
}

/**
 * Reads a hand wildcard's current face and returns a flip callback. Board
 * wildcards carry a real `assignedColor` and do not need this.
 */
export function useWildFace(
  card: Card,
  sets: PropertySet[],
): { face: PropertyColor | undefined; other: PropertyColor | undefined; flip: () => void } {
  useWildFaces();
  const face = faceOf(card, sets);
  const other = otherFaceOf(card, sets);
  const flip = useCallback(() => {
    if (other) setFace(card.id, other);
  }, [card.id, other]);
  return { face, other, flip };
}

/** Keeps the face map trimmed to the cards actually in hand. */
export function useWildFacePrune(hand: Card[]): void {
  const ids = hand.map((c) => c.id).join(',');
  useEffect(() => {
    pruneFaces(ids ? ids.split(',') : []);
  }, [ids]);
}
