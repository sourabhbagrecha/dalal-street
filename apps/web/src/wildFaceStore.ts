import type { Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { pickWildcardColor } from './wildcardTarget';

/**
 * Which face a two-colour property wildcard is currently showing while it sits
 * in the player's hand.
 *
 * A hand card has no colour in game state — the colour is only chosen when the
 * card is played — so this lives entirely on the client and is never sent
 * anywhere. Its job is to make the card tell the truth: whatever face is up is
 * the colour the card will be played as.
 *
 * The face is seeded once, the first time the card is looked at, from
 * `pickWildcardColor` (which prefers a colour the player already has an
 * incomplete set of) and then pinned. It never recomputes on its own, so a card
 * the player has not touched never appears to turn over by itself. Flipping, or
 * dropping the card on a set of its other colour, overwrites it.
 *
 * Faces are lost on reload or reconnect and simply re-seed. Nothing in game
 * state depends on them.
 */
const faces = new Map<string, PropertyColor>();
const listeners = new Set<() => void>();

/** Bumped on every write so `useSyncExternalStore` has a stable scalar to diff. */
let version = 0;

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeFaces(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function facesVersion(): number {
  return version;
}

/** Two-colour wildcards are the only cards with two faces to turn between. */
export function isFlippableWild(card: Card): boolean {
  return card.kind === 'property_wild' && card.colors.length === 2;
}

/**
 * The face this wildcard is showing, seeding it on first read.
 *
 * Seeding writes without notifying: it is idempotent, produces the value the
 * caller is about to render anyway, and notifying here would loop.
 */
export function faceOf(card: Card, sets: PropertySet[]): PropertyColor | undefined {
  if (!isFlippableWild(card)) return undefined;
  const existing = faces.get(card.id);
  if (existing) return existing;
  const seeded = pickWildcardColor(card, sets);
  if (seeded) faces.set(card.id, seeded);
  return seeded;
}

/** The other printed colour — what a flip turns the card to. */
export function otherFaceOf(card: Card, sets: PropertySet[]): PropertyColor | undefined {
  if (card.kind !== 'property_wild' || !isFlippableWild(card)) return undefined;
  const current = faceOf(card, sets);
  return card.colors.find((c) => c !== current);
}

export function setFace(cardId: string, color: PropertyColor): void {
  if (faces.get(cardId) === color) return;
  faces.set(cardId, color);
  notify();
}

/**
 * The colour an untargeted hand wildcard plays as. For a two-colour wildcard
 * that is the face it is showing — the flip is authoritative, which is the whole
 * point of it. The multicolour wildcard has no face, so it still falls back to
 * the board-aware heuristic.
 */
export function resolveWildPlayColor(card: Card, sets: PropertySet[]): PropertyColor | undefined {
  if (card.kind !== 'property_wild') return undefined;
  if (isFlippableWild(card)) return faceOf(card, sets);
  return pickWildcardColor(card, sets);
}

/** Drops faces for cards that have left the hand, so the map cannot grow without bound. */
export function pruneFaces(keepCardIds: Iterable<string>): void {
  const keep = new Set(keepCardIds);
  let changed = false;
  for (const id of [...faces.keys()]) {
    if (keep.has(id)) continue;
    faces.delete(id);
    changed = true;
  }
  if (changed) notify();
}

/** Test seam — the map is module state that outlives any single game. */
export function resetFaces(): void {
  if (faces.size === 0) return;
  faces.clear();
  notify();
}
