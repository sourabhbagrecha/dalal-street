import type {
  Card,
  GameState,
  PlayerState,
  PropertyColor,
  PropertySet,
  PropertyWildCard,
} from '@monopoly-deal/shared';
import {
  HOUSE_RENT_BONUS,
  HOTEL_RENT_BONUS,
  RENT_TABLE,
  SET_SIZES,
} from '@monopoly-deal/shared';

let setSeq = 0;
export function newSetId(): string {
  setSeq += 1;
  return `set_${setSeq}`;
}

export function resetSetIdSequence(): void {
  setSeq = 0;
}

export function getPlayer(state: GameState, playerId: string): PlayerState {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new Error(`Unknown player ${playerId}`);
  return p;
}

export function currentPlayer(state: GameState): PlayerState {
  const p = state.players[state.currentPlayerIndex];
  if (!p) throw new Error('Invalid currentPlayerIndex');
  return p;
}

export function isCompleteSet(set: PropertySet): boolean {
  return set.cards.length >= SET_SIZES[set.color];
}

export function countCompleteSets(player: PlayerState): number {
  return player.board.sets.filter(isCompleteSet).length;
}

export function rentForSet(set: PropertySet): number {
  const size = Math.min(set.cards.length, SET_SIZES[set.color]);
  if (size <= 0) return 0;
  const table = RENT_TABLE[set.color];
  let rent = table[size - 1] ?? 0;
  // Hasbro ruling: hotel replaces house bonus → +4 total, not +7
  if (set.hotel) rent += HOTEL_RENT_BONUS;
  else if (set.house) rent += HOUSE_RENT_BONUS;
  return rent;
}

export function cardPaymentValue(card: Card): number {
  if (card.kind === 'property_wild' && card.colors.length === 0) return 0;
  return card.value;
}

export function isMulticolorWild(card: Card): card is PropertyWildCard {
  return card.kind === 'property_wild' && card.colors.length === 0;
}

export function canAssignWildToColor(card: PropertyWildCard, color: PropertyColor): boolean {
  if (card.colors.length === 0) return true;
  return card.colors.includes(color);
}

export function findCardInHand(player: PlayerState, cardId: string): Card | undefined {
  return player.hand.find((c) => c.id === cardId);
}

export function removeFromHand(player: PlayerState, cardId: string): Card {
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new Error(`Card ${cardId} not in hand`);
  const [card] = player.hand.splice(idx, 1);
  return card!;
}

export function findPropertyCard(
  player: PlayerState,
  cardId: string,
): { set: PropertySet; card: Card; index: number } | undefined {
  for (const set of player.board.sets) {
    const index = set.cards.findIndex((c) => c.id === cardId);
    if (index >= 0) return { set, card: set.cards[index]!, index };
    if (set.house?.id === cardId) return { set, card: set.house, index: -1 };
    if (set.hotel?.id === cardId) return { set, card: set.hotel, index: -2 };
  }
  return undefined;
}

export function findBankCard(player: PlayerState, cardId: string): Card | undefined {
  return player.board.bank.find((c) => c.id === cardId);
}

export function totalBankValue(player: PlayerState): number {
  return player.board.bank.reduce((s, c) => s + cardPaymentValue(c), 0);
}

export function totalAssetValue(player: PlayerState): number {
  let total = totalBankValue(player);
  for (const set of player.board.sets) {
    for (const c of set.cards) total += cardPaymentValue(c);
    if (set.house) total += cardPaymentValue(set.house);
    if (set.hotel) total += cardPaymentValue(set.hotel);
  }
  return total;
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

/** Draw with explicit reshuffle using provided rng. */
export function drawCardsWithRng(
  state: GameState,
  count: number,
  rng: () => number,
): { cards: Card[]; reshuffled: boolean } {
  const drawn: Card[] = [];
  let reshuffled = false;
  for (let i = 0; i < count; i++) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break;
      // shuffle discard into deck
      const pile = [...state.discard];
      state.discard = [];
      for (let j = pile.length - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        const tmp = pile[j]!;
        pile[j] = pile[k]!;
        pile[k] = tmp;
      }
      state.deck = pile;
      reshuffled = true;
    }
    const c = state.deck.pop();
    if (!c) break;
    drawn.push(c);
  }
  return { cards: drawn, reshuffled };
}

export function placePropertyCard(
  player: PlayerState,
  card: Card,
  color: PropertyColor,
  preferredSetId?: string,
): PropertySet {
  const maxSize = SET_SIZES[color];
  // Prefer incomplete set of that color that already has properties (avoid
  // attaching to orphan building-only sets unless no better option).
  let target =
    (preferredSetId
      ? player.board.sets.find((s) => s.id === preferredSetId && s.color === color)
      : undefined) ??
    player.board.sets.find(
      (s) => s.color === color && s.cards.length > 0 && s.cards.length < maxSize,
    ) ??
    player.board.sets.find((s) => s.color === color && s.cards.length < maxSize);

  if (!target) {
    target = { id: newSetId(), color, cards: [] };
    player.board.sets.push(target);
  }

  if (card.kind === 'property_wild') {
    card.assignedColor = color;
  }
  target.cards.push(card);

  // Overflow: if somehow over max, split extras into new set
  while (target.cards.length > maxSize) {
    const overflow = target.cards.pop()!;
    const neu: PropertySet = { id: newSetId(), color, cards: [overflow] };
    player.board.sets.push(neu);
  }

  return target;
}

export function removeCardFromBoard(
  player: PlayerState,
  cardId: string,
): { card: Card; brokeSet: boolean; orphanedBuildings: Card[] } {
  const orphanedBuildings: Card[] = [];
  for (let si = 0; si < player.board.sets.length; si++) {
    const set = player.board.sets[si]!;
    const wasComplete = isCompleteSet(set);

    if (set.house?.id === cardId) {
      const card = set.house;
      set.house = undefined;
      return { card, brokeSet: false, orphanedBuildings };
    }
    if (set.hotel?.id === cardId) {
      const card = set.hotel;
      set.hotel = undefined;
      return { card, brokeSet: false, orphanedBuildings };
    }

    const ci = set.cards.findIndex((c) => c.id === cardId);
    if (ci >= 0) {
      const [card] = set.cards.splice(ci, 1);
      const brokeSet = wasComplete && !isCompleteSet(set);
      if (brokeSet) {
        if (set.house) {
          orphanedBuildings.push(set.house);
          set.house = undefined;
        }
        if (set.hotel) {
          orphanedBuildings.push(set.hotel);
          set.hotel = undefined;
        }
      }
      if (set.cards.length === 0) {
        // Salvage any buildings still attached (e.g. properties were placed onto an
        // orphan house set, then removed again without a full-set break).
        if (set.house) {
          orphanedBuildings.push(set.house);
          set.house = undefined;
        }
        if (set.hotel) {
          orphanedBuildings.push(set.hotel);
          set.hotel = undefined;
        }
        player.board.sets.splice(si, 1);
      }
      return { card: card!, brokeSet, orphanedBuildings };
    }
  }
  throw new Error(`Card ${cardId} not on board`);
}

/** Orphaned buildings sit as singleton "building" sets — represented as bank? 
 * Rules: place next to property section until another set completes.
 * We model orphans as cards on a special incomplete utility of holding: bank is wrong.
 * Use sets with a synthetic approach: keep them as PropertySet with color of original
 * but empty cards and house/hotel — actually rules say "next to property section".
 * Simplest: add as 0-card set markers OR put house/hotel as lone cards in a holding area.
 * We'll attach orphaned buildings to a new incomplete set of the SAME color with 0 properties
 * — invalid for rent. Better: store in board as sets with cards=[] and house/hotel set.
 * Actually re-read: "House or Hotel must be placed on the table next to your property section"
 * and can be stolen with Sly/Forced Deal. So they are standalone stealable cards.
 * Model: PropertySet with color matching previous, cards=[], and house OR hotel set.
 */
export function placeOrphanedBuildings(player: PlayerState, buildings: Card[], color: PropertyColor): void {
  for (const b of buildings) {
    if (b.kind === 'action' && b.action === 'house') {
      player.board.sets.push({ id: newSetId(), color, cards: [], house: b });
    } else if (b.kind === 'action' && b.action === 'hotel') {
      player.board.sets.push({ id: newSetId(), color, cards: [], hotel: b });
    }
  }
}

export function transferSet(from: PlayerState, to: PlayerState, setId: string): PropertySet {
  const idx = from.board.sets.findIndex((s) => s.id === setId);
  if (idx < 0) throw new Error(`Set ${setId} not found`);
  const [set] = from.board.sets.splice(idx, 1);
  // Give new id to avoid collisions conceptually
  const moved: PropertySet = { ...set!, id: newSetId() };
  to.board.sets.push(moved);
  return moved;
}

export function playerColorsOnBoard(player: PlayerState): PropertyColor[] {
  const colors = new Set<PropertyColor>();
  for (const s of player.board.sets) {
    if (s.cards.length > 0) colors.add(s.color);
  }
  return [...colors];
}

export function findSet(player: PlayerState, setId: string): PropertySet | undefined {
  return player.board.sets.find((s) => s.id === setId);
}

export function stealableProperties(player: PlayerState): { card: Card; set: PropertySet }[] {
  const out: { card: Card; set: PropertySet }[] = [];
  for (const set of player.board.sets) {
    if (isCompleteSet(set)) continue; // cannot steal from complete set with sly/forced
    for (const card of set.cards) {
      out.push({ card, set });
    }
    // Orphaned house/hotel on incomplete (empty) set can be stolen
    if (set.cards.length === 0) {
      if (set.house) out.push({ card: set.house, set });
      if (set.hotel) out.push({ card: set.hotel, set });
    }
  }
  return out;
}

export function completeSetsOf(player: PlayerState): PropertySet[] {
  return player.board.sets.filter(isCompleteSet);
}

export function canBuildHouse(set: PropertySet): boolean {
  if (set.color === 'railroad' || set.color === 'utility') return false;
  return isCompleteSet(set) && !set.house && !set.hotel;
}

export function canBuildHotel(set: PropertySet): boolean {
  if (set.color === 'railroad' || set.color === 'utility') return false;
  return isCompleteSet(set) && !!set.house && !set.hotel;
}
