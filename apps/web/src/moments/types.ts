/**
 * "Table moments" — the dramatic events at the table (a Sly Deal landing, a
 * Just Say No, rent coming due, money changing hands) that every player must
 * *see*, not merely be able to find in the feed.
 *
 * This file is the contract the derivation layer (`moments/derive.ts`)
 * produces and its consumers read.
 *
 * Everything here is client-only presentation state. Nothing in this module
 * ever reaches the engine, the server, or the wire.
 */
import type { Card, ClientGameState, PropertyColor } from '@monopoly-deal/shared';

export type MomentKind =
  | 'sly_deal'
  | 'forced_deal'
  | 'deal_breaker'
  | 'debt_collector'
  | 'birthday'
  | 'rent'
  | 'payment'
  | 'just_say_no'
  | 'action_cancelled'
  | 'set_broken';

export interface Moment {
  /**
   * The `LogEntry.id` of the source event. Unique within one game's log;
   * the sequence restarts when the log does (fixture reload, new game), and
   * a feeder should treat a shrinking max id as a reset.
   */
  id: number;
  kind: MomentKind;
  /** Who did it: the card's player; the Just Say No player; the payer for `payment`. */
  actorId: string;
  /**
   * Who it happened to. Victim(s) / payer(s) for attacks; the payee for
   * `payment`; for `just_say_no` and `action_cancelled` the player whose
   * action was denied; for `set_broken` the set's owner.
   */
  targetIds: string[];
  /**
   * The cards that changed hands, resolved from the `ClientGameState` at
   * derive time (public boards only — never hand contents). Stolen property,
   * the whole set for a Deal Breaker, the cards paid for `payment`. Empty
   * when not applicable or not resolvable.
   */
  cards: Card[];
  /** `forced_deal` only: the card the actor gave away. */
  givenCard?: Card;
  /**
   * The card face the callout shows. A *synthesized* card (`kind: 'action'`
   * or `'rent'`) with a fake id such as `moment-face-sly_deal` — the real
   * played card is already on the discard pile and its id is irrelevant.
   * `PlayingCard` renders any `Card`, so no real id is needed. Null for
   * `payment` and `set_broken`.
   */
  faceCard: Card | null;
  /** Money involved, in millions/crore units as the engine counts them. */
  amount?: number;
  /** Set colour involved (stolen card's set, deal-broken set, rent colour, broken set). */
  color?: PropertyColor;
  setId?: string;
  /** `just_say_no`: how many JSNs deep the chain is (1 = first). */
  chain?: number;
  /** `just_say_no` / `action_cancelled`: the contested action type (`'sly_deal'`, `'rent'`, ...). */
  contestedType?: string;
  /** `set_broken`: `'payment' | 'steal' | 'rearrange'`. */
  reason?: string;
  /**
   * `payment` only: the viewer chose these cards themselves in the payment
   * prompt an instant ago, so they need no notice about it. Network mode
   * sets it from the SELECT_PAYMENT round trip; local pass-and-play sets it
   * whenever the payer is the seat that was on screen when the event fired.
   */
  selfInitiated?: boolean;
  /**
   * Viewer ids that have already had this moment's callout shown to them.
   * Local pass-and-play replays a victim's unwitnessed moments when their
   * seat comes on screen; network mode only ever has one viewer.
   */
  witnessedBy: string[];
  /** `Date.now()` at derive time. UI-only; the engine never sees wall-clock. */
  at: number;
}

/** Derivation entry point signature (`moments/derive.ts`). */
export type DeriveMoments = (
  entries: ReadonlyArray<{ id: number; type: string; playerId?: string; data?: Record<string, unknown> }>,
  state: ClientGameState,
  opts: {
    now: number;
    viewerId: string;
    mode: 'local' | 'network';
    /**
     * `payment` selfInitiated detection in network mode: the wall-clock time
     * (`Date.now()`) at which the viewer last confirmed their own payment
     * prompt. A payment moment for the viewer lands within ~2.5s of that.
     * Local pass-and-play doesn't need this — it compares `payerId` to
     * `opts.viewerId` directly.
     */
    selfPaymentAt?: number;
  },
) => Moment[];
