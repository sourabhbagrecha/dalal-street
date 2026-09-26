import type { ClientGameState } from '@monopoly-deal/shared';
import { humanizePlayerIds } from '../../derivations';
import { theme } from '../../theme';
import type { LogEntry } from '../../store';
import type { FeedItem } from '../model';

/** One line of the feed sheet. Rows come from the store's event log. */
export interface FeedRow {
  id: number;
  text: string;
  /** Wall-clock label the store stamped on the entry ("10:42"), when there is one. */
  at?: string;
  /** The server's event type, kept as `data-log-type` for specs. */
  type?: string;
  /** Attacks and Just Say No: the entries that used to fire a table moment. */
  moment?: boolean;
  /** Happened *to* the viewer: a victim/payer receipt rather than any table event. */
  mine?: boolean;
  tone?: FeedItem['tone'];
}

/** Attacks and Just Say No — the log types worth a highlight in the feed. */
const MOMENT_LOG_TYPES = new Set([
  'sly_deal',
  'forced_deal',
  'deal_breaker',
  'debt_collector',
  'birthday',
  'rent_charged',
  'just_say_no',
  'action_cancelled',
]);

/** A pending choice the clock ran out on, by the card that opened it. */
const FORFEIT_NAMES: Record<string, string> = {
  sly_deal_target: 'Sly Deal',
  forced_deal_target: 'Forced Deal',
  deal_breaker_target: 'Deal Breaker',
  debt_collector_target: 'Debt Collector',
  rent_color_choice: 'Rent',
  rent_player_choice: 'Rent',
  house_hotel_target: 'building',
};

const actionName = (slug: string): string => theme.actionNames[slug] ?? slug;

/**
 * The engine words some log lines for itself: action slugs ("played deal_breaker"), pending kinds, and the plays that
 * had nothing to act on. Say those the way the table does; every other line passes through untouched.
 */
export function humanizeLogText(message: string): string {
  return message
    .replace(/ played Deal Breaker with no valid set$/, ' wasted Deal Breaker · no complete set to take')
    .replace(/ played Sly Deal with no property to take$/, ' wasted Sly Deal · no property to take')
    .replace(/ played Forced Deal with no property to swap$/, ' wasted Forced Deal · no property to swap')
    .replace(/ played rent but has no matching properties$/, ' wasted a rent card · no matching properties')
    .replace(/ played ([a-z_]+)$/, (_, slug: string) => ` played ${actionName(slug)}`)
    .replace(/^Action ([a-z_]+) cancelled by Just Say No$/, (_, slug: string) => `${actionName(slug)} cancelled by Just Say No`)
    .replace(/ forfeited ([a-z_]+) \(auto-resolve\)$/, (_, kind: string) => ` ran out of time · ${FORFEIT_NAMES[kind] ?? 'the play'} forfeited`);
}

/** The event log as feed rows, with seat ids swapped for display names and engine wording made readable. */
export function rowsFromLog(entries: LogEntry[], state: ClientGameState | null): FeedRow[] {
  return entries.map((e) => ({
    id: e.id,
    text: humanizeLogText(state ? humanizePlayerIds(state, e.message) : e.message),
    at: e.at,
    type: e.type,
    moment: MOMENT_LOG_TYPES.has(e.type),
    mine: !!state && (e.data?.targetPlayerId === state.viewerId || e.data?.payerId === state.viewerId),
    tone: state && e.playerId === state.viewerId ? 'you' : undefined,
  }));
}

/** The server words money as ₹5Cr (and once as $5M); show it in whichever currency the player picked. */
export function localizeCurrency(message: string, formatMoney: (n: number) => string): string {
  return message
    .replace(/₹(\d+)Cr/g, (_, n: string) => formatMoney(Number(n)))
    .replace(/\$(\d+)M/g, (_, n: string) => formatMoney(Number(n)));
}
