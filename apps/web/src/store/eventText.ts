import type { ClientGameState, GameEvent } from '@monopoly-deal/shared';
import { nameFor } from '../derivations';
import { theme } from '../theme';

type FormatMoney = (amount: number) => string;

/** Friendly labels for `ContestedAction.type` ("rent" isn't in `theme.actionNames` — it's a card kind, not an action). */
const CONTESTED_ACTION_LABELS: Record<string, string> = {
  ...theme.actionNames,
  rent: 'Rent',
};

/** Friendly labels for `pendingStack` entry kinds, for events that report a forfeited/dropped interaction. */
const PENDING_KIND_LABELS: Record<string, string> = {
  payment: 'payment',
  payment_round: 'payment',
  just_say_no: 'Just Say No window',
  sly_deal_target: 'Sly Deal',
  forced_deal_target: 'Forced Deal',
  deal_breaker_target: 'Deal Breaker',
  debt_collector_target: 'Debt Collector',
  rent_color_choice: 'Rent',
  rent_player_choice: 'Rent',
  house_hotel_target: 'House/Hotel placement',
  hand_limit_discard: 'discard',
  double_rent_pending: 'Double the Rent',
};

function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** Present-tense subject/verb agreement: "You {base}" vs "Priya {third}". */
function agree(isViewer: boolean, base: string, third: string): string {
  return isViewer ? base : third;
}

function colorLabel(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined;
  return theme.propertyNames[color] ?? color;
}

function actionLabel(action: unknown): string | undefined {
  if (typeof action !== 'string') return undefined;
  return theme.actionNames[action] ?? action;
}

function num(data: Record<string, unknown> | undefined, key: string, fallback = 0): number {
  const v = data?.[key];
  return typeof v === 'number' ? v : fallback;
}

function str(data: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = data?.[key];
  return typeof v === 'string' ? v : undefined;
}

interface Subject {
  name: string;
  isViewer: boolean;
}

function subjectFor(state: ClientGameState, playerId: string | undefined): Subject {
  if (!playerId) return { name: 'Unknown player', isViewer: false };
  return { name: nameFor(state, playerId), isViewer: playerId === state.viewerId };
}

/**
 * Names a party who is *not* the sentence's subject — a rent target, a payee,
 * a steal victim. `nameFor` renders the viewer's own seat as the literal
 * placeholder "You" (correct as a sentence subject: "You charge Priya..."),
 * but reused as the object mid-sentence that reads wrong ("Aarav charges
 * You..."), so lowercase just that placeholder here ("Aarav charges
 * you..."). A real (non-placeholder) display name is left alone — it's a
 * proper noun and stays capitalized wherever it appears in the sentence.
 */
function otherName(state: ClientGameState, playerId: string | undefined, fallback: string): string {
  if (!playerId) return fallback;
  const name = nameFor(state, playerId);
  return name === 'You' ? 'you' : name;
}

/**
 * Possessive determiner for a name already resolved by `subjectFor` (capital
 * "You") or `otherName` (lowercase "you") — "Your"/"your" for the viewer,
 * "Priya's" for anyone else. Pass the capitalized form for a possessive that
 * opens the sentence, the lowercase form for one that doesn't.
 */
function possessive(name: string): string {
  if (name === 'You') return 'Your';
  if (name === 'you') return 'your';
  return `${name}'s`;
}

/**
 * Renders one log line from an event's `type` + structured `data` + the
 * viewer's own identity — viewer-relative ("You" / second person for the
 * viewer's own seat, third person + they/them for everyone else), fully
 * pluralized, with no internal identifiers (card-action slugs, colour slugs,
 * player ids, pendingStack `kind` strings) ever reaching the text.
 *
 * Returns `null` for event types/shapes it doesn't (yet) handle — the caller
 * should fall back to the engine's raw `message` (still passed through
 * currency localization / id humanization) in that case.
 */
export function formatEventMessage(
  state: ClientGameState,
  formatMoney: FormatMoney,
  event: GameEvent,
): string | null {
  const data = event.data;

  switch (event.type) {
    case 'game_started': {
      const ids = data?.playerIds;
      const count = Array.isArray(ids) ? ids.length : undefined;
      return count ? `Game started with ${pluralize(count, 'player')}` : 'Game started';
    }

    case 'cards_drawn': {
      const { name } = subjectFor(state, event.playerId);
      return `${name} drew ${pluralize(num(data, 'count', 0), 'card')}`;
    }

    case 'card_played': {
      const { name } = subjectFor(state, event.playerId);
      const action = str(data, 'action');
      if (action) {
        const label = actionLabel(action) ?? 'a card';
        if (str(data, 'outcome') === 'no_target') {
          return `${name} played ${label} — no valid target`;
        }
        return `${name} played ${label}`;
      }
      if (str(data, 'cardKind') === 'rent') {
        if (str(data, 'outcome') === 'no_match') {
          return `${name} played a Rent card but owned no matching properties`;
        }
        return `${name} played a Rent card`;
      }
      return `${name} played a card`;
    }

    case 'card_banked': {
      const { name } = subjectFor(state, event.playerId);
      return `${name} banked ${formatMoney(num(data, 'amount', 0))}`;
    }

    case 'property_placed': {
      const { name } = subjectFor(state, event.playerId);
      const label = colorLabel(str(data, 'color'));
      return `${name} placed a property in ${label ?? 'a set'}`;
    }

    case 'pass_go': {
      const { name } = subjectFor(state, event.playerId);
      return `${name} played Pass Go and drew ${pluralize(num(data, 'count', 2), 'card')}`;
    }

    case 'rent_charged': {
      const { name, isViewer } = subjectFor(state, event.playerId);
      const label = colorLabel(str(data, 'color'));
      const target = otherName(state, str(data, 'payerId'), 'the table');
      const verb = agree(isViewer, 'charge', 'charges');
      return `${name} ${verb} ${target} ${formatMoney(num(data, 'amount', 0))} rent${label ? ` for ${label}` : ''}`;
    }

    case 'payment_made': {
      const { name } = subjectFor(state, event.playerId);
      const payee = otherName(state, str(data, 'payeeId'), 'the table');
      const total = num(data, 'total', 0);
      const owed = num(data, 'owed', total);
      const shortfall = total < owed ? ` (owed ${formatMoney(owed)})` : '';
      return `${name} paid ${formatMoney(total)} to ${payee}${shortfall}`;
    }

    case 'just_say_no': {
      const { name } = subjectFor(state, event.playerId);
      const chain = num(data, 'chain', 1);
      return chain > 1 ? `${name} played Just Say No (round ${chain})` : `${name} played Just Say No`;
    }

    case 'just_say_no_declined': {
      const { name } = subjectFor(state, event.playerId);
      return `${name} declined to play Just Say No`;
    }

    case 'sly_deal': {
      const { name } = subjectFor(state, event.playerId);
      const target = otherName(state, str(data, 'targetPlayerId'), 'an opponent');
      return `${name} sly-dealt a property from ${target}`;
    }

    case 'forced_deal': {
      const { name } = subjectFor(state, event.playerId);
      const target = otherName(state, str(data, 'targetPlayerId'), 'an opponent');
      return `${name} forced a property trade with ${target}`;
    }

    case 'deal_breaker': {
      const { name } = subjectFor(state, event.playerId);
      const target = otherName(state, str(data, 'targetPlayerId'), 'an opponent');
      const label = colorLabel(str(data, 'color'));
      return `${name} deal-broke ${possessive(target)}${label ? ` ${label}` : ''} set`;
    }

    case 'debt_collector': {
      const { name, isViewer } = subjectFor(state, event.playerId);
      const target = otherName(state, str(data, 'payerId'), 'an opponent');
      const verb = agree(isViewer, 'demand', 'demands');
      return `${name} ${verb} ${formatMoney(num(data, 'amount', 5))} from ${target}`;
    }

    case 'birthday': {
      // The payer is the sentence subject ("You owe...")  the payee (the
      // birthday actor, `event.playerId`) is the object ("...owe Priya" /
      // "...owe you") — opposite roles from `debt_collector`/`rent_charged`
      // above, so the subject/object helpers are swapped accordingly.
      const payerId = str(data, 'payerId');
      const payer = payerId ? subjectFor(state, payerId) : undefined;
      const payerName = payer?.name ?? 'Everyone';
      const verb = agree(payer?.isViewer ?? false, 'owe', 'owes');
      const payee = otherName(state, event.playerId, 'them');
      return `${payerName} ${verb} ${payee} ${formatMoney(num(data, 'amount', 2))} birthday money`;
    }

    case 'double_the_rent': {
      const { name } = subjectFor(state, event.playerId);
      return `${name} played Double the Rent (×${num(data, 'count', 1)})`;
    }

    case 'house_placed':
    case 'hotel_placed': {
      const { name } = subjectFor(state, event.playerId);
      const label = colorLabel(str(data, 'color'));
      const piece = event.type === 'house_placed' ? 'a House' : 'a Hotel';
      return `${name} placed ${piece} on the${label ? ` ${label}` : ''} set`;
    }

    case 'set_completed': {
      const { name } = subjectFor(state, event.playerId);
      const label = colorLabel(str(data, 'color'));
      return `${name} completed the${label ? ` ${label}` : ''} set`;
    }

    case 'set_broken': {
      const { name } = subjectFor(state, event.playerId);
      const subj = possessive(name);
      const label = colorLabel(str(data, 'color'));
      const setDesc = label ? `${label} set` : 'set';
      return str(data, 'reason') === 'payment'
        ? `${subj} ${setDesc} was broken to cover a payment`
        : `${subj} ${setDesc} was broken`;
    }

    case 'rearranged': {
      const { name } = subjectFor(state, event.playerId);
      const label = colorLabel(str(data, 'color'));
      return `${name} rearranged a property${label ? ` into ${label}` : ''}`;
    }

    case 'discarded': {
      const { name } = subjectFor(state, event.playerId);
      return `${name} must discard ${pluralize(num(data, 'count', 1), 'card')}`;
    }

    case 'hand_limit_discard': {
      const { name } = subjectFor(state, event.playerId);
      return `${name} discarded ${pluralize(num(data, 'count', 0), 'card')}`;
    }

    case 'turn_ended': {
      const { name, isViewer } = subjectFor(state, event.playerId);
      return isViewer ? 'You ended your turn' : `${name} ended their turn`;
    }

    case 'turn_resumed': {
      const { name, isViewer } = subjectFor(state, event.playerId);
      return isViewer ? 'You resumed playing' : `${name} resumed playing`;
    }

    case 'winner': {
      const { name, isViewer } = subjectFor(state, event.playerId);
      const verb = agree(isViewer, 'win', 'wins');
      return `${name} ${verb} with ${pluralize(num(data, 'setCount', 3), 'complete set')}!`;
    }

    case 'action_cancelled': {
      const contested = data?.contested;
      if (contested && typeof contested === 'object') {
        const c = contested as { type?: unknown; actorId?: unknown };
        const label =
          (typeof c.type === 'string' ? CONTESTED_ACTION_LABELS[c.type] : undefined) ?? 'action';
        const { name } = subjectFor(state, typeof c.actorId === 'string' ? c.actorId : undefined);
        return `${possessive(name)} ${label} was cancelled with Just Say No`;
      }
      const kind = str(data, 'kind');
      if (kind) {
        const { name } = subjectFor(state, event.playerId);
        const label = PENDING_KIND_LABELS[kind] ?? 'action';
        if (kind === 'double_rent_pending') {
          return `${name} let an unused Double the Rent expire`;
        }
        if (data?.failsafe) {
          return `${possessive(name)} ${label} could not be resolved and was dropped`;
        }
        return `${possessive(name)} ${label} timed out`;
      }
      // No structured data (e.g. Double the Rent negated by JSN) — the raw
      // message is already clean (no ids/slugs), so defer to the fallback.
      return null;
    }

    case 'player_connection': {
      const { name, isViewer } = subjectFor(state, event.playerId);
      const connected = data?.connected === true;
      const verb = connected ? (data?.firstConnection ? 'joined' : 'reconnected') : 'disconnected';
      return isViewer ? `You ${verb}` : `${name} ${verb}`;
    }

    case 'deck_reshuffled':
    case 'rejected':
    default:
      return null;
  }
}
