/** Stable property color ids used by the engine (theme maps display names). */
export type PropertyColor =
  | 'brown'
  | 'light_blue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'dark_blue'
  | 'railroad'
  | 'utility';

export type CardKind =
  | 'money'
  | 'property'
  | 'property_wild'
  | 'action'
  | 'rent'
  | 'rule';

export type ActionType =
  | 'pass_go'
  | 'deal_breaker'
  | 'sly_deal'
  | 'forced_deal'
  | 'debt_collector'
  | 'its_my_birthday'
  | 'just_say_no'
  | 'double_the_rent'
  | 'house'
  | 'hotel';

export type RentType = 'dual' | 'wild';

export interface CardBase {
  id: string;
  kind: CardKind;
  /** Face value in millions when banked / used as payment. Multicolor wilds are 0. */
  value: number;
}

export interface MoneyCard extends CardBase {
  kind: 'money';
  amount: number;
}

export interface PropertyCard extends CardBase {
  kind: 'property';
  color: PropertyColor;
  /** Official street / utility / railroad title printed on the card. */
  name: string;
}

export interface PropertyWildCard extends CardBase {
  kind: 'property_wild';
  /** Empty array means multicolor (any color). */
  colors: PropertyColor[];
  /** Assigned when placed on the board. */
  assignedColor?: PropertyColor;
}

export interface ActionCard extends CardBase {
  kind: 'action';
  action: ActionType;
}

export interface RentCard extends CardBase {
  kind: 'rent';
  rentType: RentType;
  /** For dual rent: the two colors. Empty for wild rent. */
  colors: PropertyColor[];
}

export interface RuleCard extends CardBase {
  kind: 'rule';
}

export type Card =
  | MoneyCard
  | PropertyCard
  | PropertyWildCard
  | ActionCard
  | RentCard
  | RuleCard;

export interface PropertySet {
  id: string;
  color: PropertyColor;
  cards: Card[];
  house?: Card;
  hotel?: Card;
}

export interface PlayerBoard {
  bank: Card[];
  sets: PropertySet[];
}

export interface PlayerState {
  id: string;
  hand: Card[];
  board: PlayerBoard;
  /** Seat liveness; defaults to true when omitted (fixtures / older states). */
  connected?: boolean;
}

export interface PendingPayment {
  kind: 'payment';
  payerId: string;
  payeeId: string;
  amountDue: number;
  /** Source action for logging / JSN context. */
  reason: string;
}

export type PaymentRoundEntryPhase = 'jsn' | 'payment' | 'done' | 'skipped';

export interface PaymentRoundJsn {
  respondentId: string;
  initiatorId: string;
  contestedAction: ContestedAction;
  jsnCount: number;
}

export interface PaymentRoundEntry {
  payerId: string;
  amountDue: number;
  phase: PaymentRoundEntryPhase;
  jsn?: PaymentRoundJsn;
}

export interface PendingPaymentRound {
  kind: 'payment_round';
  payeeId: string;
  reason: string;
  entries: PaymentRoundEntry[];
}

export interface PendingJustSayNo {
  kind: 'just_say_no';
  /** Player who may play Just Say No now. */
  respondentId: string;
  /** Player who initiated / last played into the chain. */
  initiatorId: string;
  /** The underlying action being contested (for resolution when chain ends). */
  contestedAction: ContestedAction;
  /** Number of Just Say Nos already played in this chain (odd = negated). */
  jsnCount: number;
}

export interface ContestedAction {
  type:
    | 'rent'
    | 'debt_collector'
    | 'its_my_birthday'
    | 'sly_deal'
    | 'forced_deal'
    | 'deal_breaker'
    | 'double_the_rent';
  actorId: string;
  /** For multi-target (birthday / dual rent): which payer this JSN applies to. */
  targetPlayerId?: string;
  /** Payload needed to resume the action if not cancelled. */
  payload: Record<string, unknown>;
}

export interface PendingSlyDealTarget {
  kind: 'sly_deal_target';
  actorId: string;
  cardId: string;
}

export interface PendingForcedDealTarget {
  kind: 'forced_deal_target';
  actorId: string;
  cardId: string;
}

export interface PendingDealBreakerTarget {
  kind: 'deal_breaker_target';
  actorId: string;
  cardId: string;
}

export interface PendingDebtCollectorTarget {
  kind: 'debt_collector_target';
  actorId: string;
  cardId: string;
}

export interface PendingRentColorChoice {
  kind: 'rent_color_choice';
  actorId: string;
  cardId: string;
  /** Eligible colors based on rent card + player's properties. */
  eligibleColors: PropertyColor[];
  /** Whether Double the Rent is attached (and how many). */
  doubleCount: number;
  rentType: RentType;
}

export interface PendingRentPlayerChoice {
  kind: 'rent_player_choice';
  actorId: string;
  cardId: string;
  color: PropertyColor;
  doubleCount: number;
  amount: number;
}

export interface PendingHouseHotelTarget {
  kind: 'house_hotel_target';
  actorId: string;
  cardId: string;
  building: 'house' | 'hotel';
}

export interface PendingHandLimitDiscard {
  kind: 'hand_limit_discard';
  playerId: string;
  excess: number;
}

/** After playing Double the Rent, waiting for a rent card (or bank/cancel via other plays). */
export interface PendingDoubleRent {
  kind: 'double_rent_pending';
  actorId: string;
  doubleCardIds: string[];
}

export type PendingInteraction =
  | PendingPayment
  | PendingPaymentRound
  | PendingJustSayNo
  | PendingSlyDealTarget
  | PendingForcedDealTarget
  | PendingDealBreakerTarget
  | PendingDebtCollectorTarget
  | PendingRentColorChoice
  | PendingRentPlayerChoice
  | PendingHouseHotelTarget
  | PendingHandLimitDiscard
  | PendingDoubleRent;

export type TurnPhase = 'awaiting_draw' | 'playing' | 'awaiting_discard' | 'game_over';

export interface GameState {
  players: PlayerState[];
  deck: Card[];
  discard: Card[];
  /** Quick Start Rules and other non-playable cards. */
  outOfPlay: Card[];
  currentPlayerIndex: number;
  playsRemaining: number;
  turnPhase: TurnPhase;
  pendingStack: PendingInteraction[];
  /** Doubles attached and waiting to apply to next rent this turn. */
  pendingDoubles: number;
  winnerId: string | null;
  seed: number;
  turnNumber: number;
  drawnThisTurn: boolean;
}

export type PlayZone = 'bank' | 'property' | 'discard';

export type Command =
  | { type: 'DRAW_TURN_CARDS'; playerId: string }
  | {
      type: 'PLAY_CARD';
      playerId: string;
      cardId: string;
      zone: PlayZone;
      /** Target extras depending on card. */
      target?: PlayTarget;
    }
  | {
      type: 'SELECT_PAYMENT';
      playerId: string;
      /** Card ids from bank and/or property (including house/hotel). */
      cardIds: string[];
    }
  | { type: 'RESPOND_JUST_SAY_NO'; playerId: string; cardId: string }
  | { type: 'DECLINE_JUST_SAY_NO'; playerId: string }
  | {
      type: 'REARRANGE_PROPERTY';
      playerId: string;
      /** Move a wild/property to a color (may create/split sets). */
      cardId: string;
      toColor: PropertyColor;
      toSetId?: string;
    }
  | { type: 'DISCARD_EXCESS'; playerId: string; cardIds: string[] }
  | { type: 'END_TURN'; playerId: string }
  /** Cancel a pending hand-limit discard and return to the play phase (only while plays remain). */
  | { type: 'RESUME_PLAY'; playerId: string }
  | {
      type: 'SELECT_RENT_COLOR';
      playerId: string;
      color: PropertyColor;
    }
  | {
      type: 'SELECT_RENT_PLAYER';
      playerId: string;
      targetPlayerId: string;
    }
  | {
      type: 'SELECT_DEBT_COLLECTOR_PLAYER';
      playerId: string;
      targetPlayerId: string;
    }
  | {
      type: 'SELECT_STEAL_TARGET';
      playerId: string;
      /** For sly/forced: property card id. For forced also own card. For deal breaker: set id. */
      targetCardId?: string;
      targetSetId?: string;
      ownCardId?: string;
    }
  | {
      type: 'SELECT_BUILDING_SET';
      playerId: string;
      setId: string;
    }
  /** Scheduler: auto-discard to hand limit (keep highest value) and end turn. */
  | { type: 'FORCE_END_TURN'; playerId: string }
  /** Scheduler: default resolution for the top pendingStack entry. */
  | { type: 'AUTO_RESOLVE_PENDING'; playerId: string }
  /** Marks seat connected/disconnected; no rules effect. */
  | { type: 'PLAYER_CONNECTION_CHANGED'; playerId: string; connected: boolean };

export interface PlayTarget {
  /** Property color when placing a wild. */
  assignedColor?: PropertyColor;
  /** Set to place onto / building target. */
  setId?: string;
  /** For dual-purpose plays that need a target player upfront. */
  targetPlayerId?: string;
  /** For Forced Deal: own property to give. */
  ownCardId?: string;
  /** For Sly/Forced: opponent property card. */
  targetCardId?: string;
  /** For Deal Breaker. */
  targetSetId?: string;
  /** Rent color when known at play time. */
  rentColor?: PropertyColor;
}

export type GameEventType =
  | 'game_started'
  | 'cards_drawn'
  | 'card_played'
  | 'card_banked'
  | 'property_placed'
  | 'pass_go'
  | 'rent_charged'
  | 'payment_made'
  | 'just_say_no'
  | 'just_say_no_declined'
  | 'sly_deal'
  | 'forced_deal'
  | 'deal_breaker'
  | 'debt_collector'
  | 'birthday'
  | 'double_the_rent'
  | 'house_placed'
  | 'hotel_placed'
  | 'set_completed'
  | 'set_broken'
  | 'rearranged'
  | 'discarded'
  | 'hand_limit_discard'
  | 'turn_ended'
  | 'turn_resumed'
  | 'deck_reshuffled'
  | 'winner'
  | 'action_cancelled'
  | 'player_connection'
  | 'rejected';

export interface GameEvent {
  type: GameEventType;
  playerId?: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface DispatchResult {
  state: GameState;
  events: GameEvent[];
  rejected?: string;
}

export const HOUSE_RENT_BONUS = 3;
export const HOTEL_RENT_BONUS = 4;
export const HAND_LIMIT = 7;
export const MAX_PLAYS = 3;
export const WIN_SETS = 3;
export const DECK_SIZE = 110;

export {
  PROPERTY_SET_DEFS,
  SET_SIZES,
  STATE_NAMES,
  WILD_CITY_NAMES,
  RENT_TABLE,
  assertPropertyCatalog,
  type PropertySetDef,
} from './properties.js';
