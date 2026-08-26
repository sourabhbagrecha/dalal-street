/**
 * "Table moments" — the dramatic events at the table (a Sly Deal landing, a
 * Just Say No, rent coming due, money changing hands) that every player must
 * *see*, not merely be able to find in the feed.
 *
 * This file is the contract between the derivation/store layer
 * (`moments/derive.ts`, `moments/copy.ts`, `moments/store.ts`,
 * `moments/useTableMoments.ts`) and the presentation layer
 * (`components/MomentCallout.tsx`, `components/NoticeStack.tsx`, the board
 * highlight hooks and the card-flight overlay). Both layers are written
 * against these shapes; change them only with both sides in hand.
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
   * the feeder treats a shrinking max id as a reset — see `useCardDrawFlights`.
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

/** How the current viewer relates to a moment. Drives tone, wording, and motion intensity. */
export type Perspective = 'victim' | 'actor' | 'beneficiary' | 'spectator';

export type Tone = 'danger' | 'success' | 'warning' | 'neutral';

export interface CalloutCopy {
  /** Display headline, rendered uppercase, ≤ 24 chars: "SLY DEAL!", "JUST SAY NO!", "RENT DUE!". */
  headline: string;
  /** One viewer-relative sentence: "Aarav took Agra from you". No ids, no slugs, currency via formatMoney. */
  detail: string;
  tone: Tone;
  perspective: Perspective;
}

/** A persistent, dismissible line addressed to one player ("Aarav took your Agra"). */
export interface Notice {
  /** Unique per page lifetime (module-level counter). */
  id: number;
  momentId: number;
  forPlayerId: string;
  /** Wall-clock ms when first rendered for its recipient; auto-expiry counts from here, not from creation. */
  shownAt: number | null;
}

export type HighlightKind =
  /** Victim's board/card/set: something was taken. */
  | 'stolen'
  /** Actor's board/card/set: something arrived. */
  | 'received'
  /** Payer's bank: money left. */
  | 'paid'
  /** Payee's bank: money arrived. */
  | 'gained'
  /** A player is the target of a just-declared attack (rail card / peer chip / spotlight). */
  | 'targeted'
  /** The actor whose action was just refused with a Just Say No. */
  | 'denied'
  /** The player who played the Just Say No. */
  | 'blocked';

export interface Highlight {
  id: number;
  kind: HighlightKind;
  playerId: string;
  /** Specific cards to ring/pulse (by `Card.id`), when known. */
  cardIds: string[];
  setId?: string;
  /** Wall-clock ms after which the highlight is pruned. */
  until: number;
}

/** One card (face or back) flying between two on-screen anchors. Extends the draw-flight shape. */
export interface Flight {
  id: string;
  /** Face to render; null renders the generic card back used by draw flights. */
  card: Card | null;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delayMs: number;
  durationMs: number;
  /** Rendered width in px (height follows the 5:7 ratio). */
  width: number;
}

export interface MomentState {
  /** Every moment derived this game, oldest first. Capped at 60. */
  moments: Moment[];
  /** Moment ids waiting to be shown as a callout, FIFO. Head is the one on screen. */
  calloutQueue: number[];
  notices: Notice[];
  highlights: Highlight[];
  flights: Flight[];
  /** Highest `LogEntry.id` the feed drawer has been open to see; drives the unseen badge. */
  feedSeenUpTo: number;
  /**
   * Wall-clock ms at which the viewer last confirmed a payment prompt
   * (network mode only). Feeds `DeriveMoments`' `selfPaymentAt` opt so the
   * viewer's own `payment_made` doesn't also surface as a notice to them.
   */
  selfPaymentAt: number | null;
}

/**
 * The single module-level store (`moments/store.ts`). Shared by the local
 * and network game screens because both mount the same board components;
 * `reset()` on log reset / room change keeps games from bleeding together.
 */
export interface MomentStoreApi {
  getState(): MomentState;
  subscribe(listener: () => void): () => void;

  /**
   * Adds freshly derived moments: appends to `moments`, enqueues callouts
   * that concern the current viewer or are worth seeing as a spectator,
   * creates notices for each recipient in `targetIds` (skipping the viewer
   * for a `selfInitiated` payment), and adds highlights. Callout selection
   * and coalescing rules live in the store, not the caller — see the brief.
   */
  ingest(moments: Moment[], viewerId: string, mode: 'local' | 'network'): void;
  /** Called by the callout component when the head callout's display time has elapsed. */
  advanceCallout(): void;
  /** Records that `viewerId` has now seen `momentId`'s callout. */
  markWitnessed(momentId: number, viewerId: string): void;
  /**
   * Local pass-and-play only: the seat on screen changed. Re-enqueues, in
   * order, every moment (at most the latest 3) that targets `viewerId` and
   * that they have not witnessed yet. Returns the moment ids actually
   * enqueued (empty if none), so the caller can rebuild flights for exactly
   * those moments once the new seat's layout is on screen.
   */
  replayForViewer(viewerId: string): number[];

  dismissNotice(id: number): void;
  markNoticeShown(id: number, now: number): void;
  /** Drops notices whose `shownAt + ttlMs < now`. */
  expireNotices(now: number, ttlMs: number): void;

  addHighlights(highlights: Highlight[]): void;
  pruneHighlights(now: number): void;

  addFlights(flights: Flight[]): void;
  removeFlights(ids: string[]): void;

  markFeedSeen(upToLogId: number): void;

  /**
   * The viewer just confirmed their own payment prompt (network mode). Records
   * `now` as `selfPaymentAt` so the resulting `payment_made` moment can be
   * recognised as self-initiated and skip the viewer's own notice.
   */
  noteSelfPaymentSubmitted(now: number): void;

  /** Clears everything — the log restarted (new game / fixture) or the room changed. */
  reset(): void;
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

/** Wording entry point signature (`moments/copy.ts`). */
export type CalloutCopyFor = (
  moment: Moment,
  state: ClientGameState,
  formatMoney: (n: number) => string,
) => CalloutCopy;

/** Notice wording: same inputs, one sentence addressed to `state.viewerId` (who must be in `moment.targetIds` or the actor). */
export type NoticeCopyFor = (
  moment: Moment,
  state: ClientGameState,
  formatMoney: (n: number) => string,
) => { text: string; tone: Tone };
