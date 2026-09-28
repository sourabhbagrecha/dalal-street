import type { ActionType, Card, PropertyColor, PropertySet } from '@monopoly-deal/shared';
import { RENT_TABLE, SET_SIZES } from '@monopoly-deal/shared';
import { canBuildHotel, canBuildHouse, isCompleteSet, jokerHostColors } from '@monopoly-deal/engine';
import { theme } from '../theme';

/**
 * The table screen's view-model. `TableScreen` renders a `TableGame` and calls its actions — it knows nothing
 * about the store or the wire, and of the engine only its pure `isCompleteSet` predicate. `useLiveGame` builds one
 * from a server projection.
 * Everything a rival sees or does arrives here already redacted.
 */

/** 'draw': your turn, cards not drawn yet. 'play': your turn. 'rivals': someone else's turn. */
export type Phase = 'draw' | 'play' | 'rivals';
/** Where a card can be dropped: your bank, your properties, or "play it". */
export type Zone = 'bank' | 'build' | 'play';

/**
 * What a pending target choice is aiming at.
 * sly_deal / deal_breaker: a rival's card / complete set. forced_deal: your own property first ('own'), then a rival's ('rival').
 * debt_collector / rent_player: a rival seat. rent: one of your own sets. building: one of your complete sets.
 */
export type TargetKind = 'sly_deal' | 'deal_breaker' | 'debt_collector' | 'rent' | 'rent_player' | 'forced_deal' | 'building';

export interface Seat {
  id: string;
  name: string;
  color: string;
  ink: string;
  handCount: number;
  connected: boolean;
  bank: Card[];
  sets: PropertySet[];
  /** Disconnect-grace remaining, ms — only present for a rival mid-grace (see `deadlines.disconnectGraceMs`). */
  graceMs?: number;
}

/** A choice the viewer owes the game. */
export type Prompt =
  | {
      kind: 'target';
      action: TargetKind;
      /** The card that started it, when the viewer can see it (their own play). */
      card: Card | null;
      /** forced_deal: which half is being picked. */
      step?: 'own' | 'rival';
      /** forced_deal, rival step: your property already chosen to give. */
      give?: string;
      /** rent: the colours the card can charge, with what each would charge. rent_player: the single colour. */
      colors?: { color: PropertyColor; amount: number }[];
      /** rent_player / debt_collector: what the picked rival owes. */
      amount?: number;
      /** building: 'house' | 'hotel', and the set ids that can take it. */
      building?: 'house' | 'hotel';
      eligibleSets?: string[];
      /** How many Double the Rent cards are stacked on this rent. */
      doubles?: number;
      /** sly_deal / forced_deal / deal_breaker: nothing anywhere to pick, so the play resolves on its own. */
      empty?: boolean;
    }
  | {
      kind: 'pay';
      toId: string;
      amount: number;
      reason: string;
      sel: string[];
      /** Everything the viewer may hand over: bank, properties, buildings. */
      assets: Card[];
      /** Whether `sel` covers the debt (or everything, when the debt is bigger than the viewer's whole table). */
      valid: boolean;
      /** The demand still waits on your Just Say No: paying lets it stand, a Just Say No from your hand stops it. */
      jsn?: true;
    }
  | {
      kind: 'jsn';
      fromId: string;
      /** The synthesized face of the contested action. */
      card: Card;
      /** Your card at stake, when the action is aimed at one of your properties. */
      at: Card | null;
      label: string;
      /** Who is behind it: the rival whose play this is, or whoever just said no to the viewer's own. */
      who: string;
      /** What they are doing, without the name: "wants to take your Agra". */
      what: string;
      /** Which payment-round payer this answer is for, when several are pending. */
      payerId?: string;
    }
  | { kind: 'discard'; excess: number; sel: string[]; canResume: boolean };

/** A held play waiting for the viewer's OK — the rules allow it but it is probably a mistake or ambiguous. */
export type Confirm =
  | { kind: 'wasted'; card: Card; copy: string; yes(): void; undo(): void }
  | { kind: 'bank_action'; card: Card; canPlay: boolean; cash(): void; play(): void; keep(): void }
  /** A house/hotel: build on one of `sets`, or bank it. `blocked` says why `sets` is empty. */
  | { kind: 'building_choice'; card: Card; sets: Pick<PropertySet, 'id' | 'color'>[]; blocked: string | null; cash(): void; build(setId: string): void; undo(): void }
  | { kind: 'rent_double'; card: Card; double: Card; twice(): void; plain(): void; undo(): void }
  | { kind: 'flip'; card: Card; toColor: PropertyColor; copy: string; yes(): void; undo(): void };

export interface FeedItem {
  id: number;
  tone: 'you' | 'rival' | 'good' | 'bad' | 'sys';
  who: string;
  text: string;
}

export interface Fx {
  id: number;
  kind: 'draw' | 'bank' | 'build' | 'set' | 'steal' | 'stolen' | 'pay' | 'collect' | 'jsn' | 'win';
  text: string;
  color?: PropertyColor;
  amount?: number;
}

/**
 * What physically happened on the table, for the stage to act out (stage/choreo.ts). The state has already
 * moved when a beat arrives; a beat only says who moved which cards where. Ids are unique across beats.
 */
export type Beat = { id: number } & (
  | { kind: 'reset' }
  /** Cards drawn from the deck into `to`'s hand; `played` is the Pass Go that paid for them. */
  | { kind: 'deal'; to: string; cards: Card[]; played?: Card }
  /** A seat laid a card into its bank or a property set. */
  | { kind: 'lay'; by: string; card: Card; into: 'bank' | 'set'; setId?: string; completed?: boolean }
  /** Sly Deal: one property changes tables. */
  | { kind: 'loot'; by: string; from: string; card: Card; setId: string; played: Card; label: string }
  /** Deal Breaker: a whole set changes tables. */
  | { kind: 'raid'; by: string; from: string; set: PropertySet; played: Card; label: string }
  /** Debt Collector, It's My Birthday, Rent: money is asked for; `takes` is what each payer handed over. */
  | { kind: 'levy'; by: string; played: Card; label: string; setId?: string; takes: { from: string; owed: number; cards: Card[] }[]; aimed?: string }
  /**
   * A payer handed cards to `to`. `also`: more payers who landed in the same backlog moment (see `beats.ts`'s
   * `advance`) folded into this one scene instead of each holding the camera on `to` in turn.
   */
  | { kind: 'pay'; by: string; to: string; cards: Card[]; label: string; also?: { by: string; cards: Card[]; label: string }[] }
  /** A rival's Sly Deal has a hand on one of your cards and waits on your Just Say No. */
  | { kind: 'grab'; by: string; from: string; card: Card; played: Card; label: string }
  /** You said no to the grab. */
  | { kind: 'block'; by: string; against: string; played: Card; card: Card; label: string }
  /** A card went to the discard pile. */
  | { kind: 'toss'; by: string; card: Card }
);

/**
 * A card the viewer has just put down that the server has not confirmed yet. It is already gone from `TableGame.hand`;
 * the stage parks it where it was put down until the game moves on (then it becomes the real card) or the server says
 * no (then it goes back to the hand). Presentation only: nothing here is game state.
 */
export interface SentPlay {
  card: Card;
  zone: Zone;
  /** The colour a wild was put down as. */
  color?: PropertyColor;
}

/** What the viewer has sent that the server has not yet answered: 'end' their turn, or an 'answer' to a prompt. */
export type Sending = 'end' | 'answer';

export interface TableActions {
  draw(): void;
  play(cardId: string, zone: Zone, color?: PropertyColor): void;
  /** Answer a target prompt: a rival, a card, a set (by id) or a colour, whatever the prompt is aiming at. */
  target(pick: { rivalId?: string; cardId?: string; setId?: string; color?: PropertyColor }): void;
  endTurn(): void;
  /** Hand-limit discard: toggles a card in the selection (a lone tap in the mock discards at once). */
  discard(cardId: string): void;
  discardConfirm(): void;
  /** Hand-limit discard: leave it and go on playing (only while plays remain). */
  resumePlay(): void;
  paySel(cardId: string): void;
  payAuto(): void;
  payConfirm(): void;
  /** Play a Just Say No from the hand; `cardId` when the viewer holds more than one. */
  jsn(cardId?: string): void;
  /** Decline the Just Say No: let it happen. */
  allow(): void;
  /** Move a property/wild you own into another colour (wild flip); the game may ask to confirm first. */
  rearrange(cardId: string, toColor: PropertyColor): void;
  /** Back out of a target choice, when the game lets you. */
  cancel?(): void;
  /** Deal a fresh game (the /demo table only). */
  reset?(): void;
  /** Tap "Rematch" on a finished networked room's own seat (see `TableGame.rematch`). Absent in /demo, which has `reset` instead. */
  requestRematch?(): void;
}

/**
 * Networked rooms only, once the game has ended: who has tapped "Rematch" so far. `readyCount` reaching
 * `totalSeats` is what starts the next game server-side — the client only ever shows the tally.
 */
export interface RematchStatus {
  readyCount: number;
  totalSeats: number;
  /** Has the viewer's own seat already tapped? */
  mine: boolean;
}

export interface TableGame {
  me: Seat;
  rivals: Seat[];
  /** The cards in hand, less any that have just been put down and are awaiting the server (see `sent`). */
  hand: Card[];
  /** Cards put down and awaiting the server's confirmation, oldest first. */
  sent: SentPlay[];
  /** A command of the viewer's is in flight; the table shows it as done and stops taking more of the same. */
  sending: Sending | null;
  deck: number;
  discardTop: Card | null;
  discardCount: number;
  /** Whose turn it is (a seat id). */
  turn: string;
  phase: Phase;
  plays: number;
  prompt: Prompt | null;
  /** A held play waiting for an OK; the table shows it over everything else. */
  confirm: Confirm | null;
  /** What the viewer is waiting on while a rival owes a choice or a payment ("Priya is choosing who pays…"). */
  wait: string | null;
  /** Whole seconds left on the clock that matters right now, or null when nothing is timed (pass-and-play demo). */
  secs: number | null;
  /** The length of that clock, for the ring. */
  maxSecs: number;
  feed: FeedItem[];
  fx: Fx | null;
  beat: Beat | null;
  /** A scene is holding the camera right now: a tap on bare table (see `skipScene`) shortens it instead of playing out in full. */
  skippable: boolean;
  /** Tap-anywhere-on-stage: ends the beat now on stage as soon as it has had a minimum moment on screen, moving the queue on. A no-op with nothing playing. */
  skipScene(): void;
  /** Seat id of the winner. */
  won: string | null;
  /** Networked rooms only: rematch tally once `won` is set. Null in /demo, or before the game ends. */
  rematch: RematchStatus | null;
  canAct: boolean;
  hasJsn: boolean;
  /** Wilds and same-colour naturals in your sets may move between colours right now. */
  canRearrange: boolean;
  actions: TableActions;
}

// ── card + set helpers ───────────────────────────────────────────────────────

export const setSize = (color: PropertyColor) => SET_SIZES[color];
export const isComplete = isCompleteSet;
export const completeCount = (sets: PropertySet[]) => sets.filter(isComplete).length;
export const bankTotal = (cards: Card[]) => cards.reduce((n, c) => n + c.value, 0);
export const stateName = (color: PropertyColor) => theme.propertyNames[color] ?? color;
export const cardName = (c: Card): string =>
  c.kind === 'money'
    ? theme.formatMoney(c.amount)
    : c.kind === 'property'
      ? c.name
      : c.kind === 'property_wild'
        ? 'Wild'
        : c.kind === 'action'
          ? (theme.actionNames[c.action] ?? c.action)
          : c.kind === 'rent'
            ? 'Rent'
            : 'Card';

/** The sets that can take this building right now — the engine's own rule (complete, never a railroad or utility, a house before a hotel). */
export const buildTargets = (sets: PropertySet[], building: 'house' | 'hotel'): PropertySet[] =>
  sets.filter(building === 'house' ? canBuildHouse : canBuildHotel);

/** What the set charges right now: rent for its card count, plus buildings. */
export function rentFor(set: PropertySet): number {
  const ladder = RENT_TABLE[set.color];
  const n = Math.min(set.cards.length, ladder.length);
  return (ladder[n - 1] ?? 0) + (set.house ? 3 : 0) + (set.hotel ? 4 : 0);
}

/** Colours a card can be built into right now (a wild picks; a plain property is fixed). The Joker only joins a set already under way, so it offers just those colours. */
export function buildColors(card: Card, sets: PropertySet[]): PropertyColor[] {
  if (card.kind === 'property') return [card.color];
  if (card.kind !== 'property_wild') return [];
  return card.colors.length === 0 ? jokerHostColors(sets) : card.colors;
}

/** Colours a wild on the table can flip to: its own, or for the Joker (the engine sends it with an empty list) only sets already under way, not counting itself. */
export function flipColors(card: Extract<Card, { kind: 'property_wild' }>, sets: PropertySet[]): PropertyColor[] {
  return card.colors.length === 0 ? jokerHostColors(sets, card.id) : card.colors;
}

/** Which zones a card may legally land in. */
export function zonesFor(card: Card): Zone[] {
  switch (card.kind) {
    case 'money':
      return ['bank'];
    case 'property':
    case 'property_wild':
      return ['build'];
    case 'action':
      return card.action === 'just_say_no' ? ['bank'] : ['bank', 'play'];
    default:
      return ['bank', 'play'];
  }
}

export const targetLabel: Record<TargetKind, string> = {
  sly_deal: 'Pick a property to steal',
  deal_breaker: 'Pick a complete set to take',
  debt_collector: 'Pick who pays ₹5',
  rent: 'Pick a set to charge rent on',
  rent_player: 'Pick who pays the rent',
  forced_deal: 'Pick a property to swap',
  building: 'Pick a set to build on',
};

/** Everyone at the table, you first. */
const seatsOf = (g: Pick<TableGame, 'me' | 'rivals'>): Seat[] => [g.me, ...g.rivals];
export const seatById = (g: Pick<TableGame, 'me' | 'rivals'>, id: string): Seat | undefined => seatsOf(g).find((x) => x.id === id);

/** Cards the viewer could hand over for the pending payment (empty when nothing is owed). */
export const payAssets = (g: Pick<TableGame, 'prompt'>): Card[] => (g.prompt?.kind === 'pay' ? g.prompt.assets : []);
export const paySum = (g: Pick<TableGame, 'prompt'>, sel: string[]): number =>
  payAssets(g)
    .filter((c) => sel.includes(c.id))
    .reduce((n, c) => n + c.value, 0);

/** Action cards' banked value, for cards the mock invents. */
export const ACTION_VALUE: Record<ActionType, number> = {
  pass_go: 1,
  deal_breaker: 5,
  sly_deal: 3,
  forced_deal: 3,
  debt_collector: 3,
  its_my_birthday: 2,
  just_say_no: 4,
  double_the_rent: 1,
  house: 3,
  hotel: 4,
};
