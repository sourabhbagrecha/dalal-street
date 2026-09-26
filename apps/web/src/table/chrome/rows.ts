import type { ClientGameState } from '@monopoly-deal/shared';
import { humanizePlayerIds } from '../../derivations';
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

/** The event log as feed rows, with seat ids swapped for display names. */
export function rowsFromLog(entries: LogEntry[], state: ClientGameState | null): FeedRow[] {
  return entries.map((e) => ({
    id: e.id,
    text: state ? humanizePlayerIds(state, e.message) : e.message,
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
