import type { Card, ClientGameState, PlayZone, PropertyColor } from '@monopoly-deal/shared';
import type { SentPlay, Zone } from '../model';

/**
 * Cards the viewer has put down that the server has not confirmed.
 *
 * The table shows a played card leaving the hand at once and the stage parks it where it was put down. That is
 * presentation, not prediction: nothing here touches the projection, every rule still lives on the server, and an entry
 * is dropped the moment the projection speaks (the card has left the server's hand) or the command fails (the card
 * goes back). Pure — `useLiveGame` holds the list and calls these.
 */

export interface Outgoing extends SentPlay {
  /** When the server answered yes (ms); null while it has not answered. */
  ackedAt: number | null;
}

/** How long a card waits, after the server's yes, for the projection that shows the move before it is handed back. */
export const ACK_GRACE_MS = 8000;

/** The table's word for the zone a command's `PlayZone` puts a card in. */
export const uiZone = (zone: PlayZone): Zone => (zone === 'bank' ? 'bank' : zone === 'property' ? 'build' : 'play');

export function begin(list: Outgoing[], card: Card, zone: PlayZone, color: PropertyColor | undefined): Outgoing[] {
  return [...list.filter((o) => o.card.id !== card.id), { card, zone: uiZone(zone), color, ackedAt: null }];
}

export const acked = (list: Outgoing[], cardId: string, at: number): Outgoing[] =>
  list.map((o) => (o.card.id === cardId && o.ackedAt === null ? { ...o, ackedAt: at } : o));

export const failed = (list: Outgoing[], cardId: string): Outgoing[] => list.filter((o) => o.card.id !== cardId);

/** Entries still waiting: the server's hand holds the card and it has not run out of patience. */
export function waiting(list: Outgoing[], state: ClientGameState | null, now: number): Outgoing[] {
  if (!state) return [];
  return list.filter((o) => state.you.hand.some((c) => c.id === o.card.id) && (o.ackedAt === null || now - o.ackedAt < ACK_GRACE_MS));
}

/** The soonest an acknowledged entry runs out of patience, in ms from `now` (null when none is waiting on the projection). */
export function nextExpiry(list: Outgoing[], now: number): number | null {
  let soonest: number | null = null;
  for (const o of list) {
    if (o.ackedAt === null) continue;
    const left = Math.max(0, o.ackedAt + ACK_GRACE_MS - now);
    soonest = soonest === null ? left : Math.min(soonest, left);
  }
  return soonest;
}

/** The hand the table shows: the server's, less what is on its way out. */
export const handLess = (hand: Card[], sent: Pick<SentPlay, 'card'>[]): Card[] =>
  sent.length === 0 ? hand : hand.filter((c) => !sent.some((o) => o.card.id === c.id));

/** How many of the plays on their way out will cost one of the turn's plays: a Double the Rent rides along free. */
export const spentPlays = (sent: Pick<SentPlay, 'card'>[]): number =>
  sent.filter((o) => !(o.card.kind === 'action' && o.card.action === 'double_the_rent')).length;

/** Whether what is on its way out could open a prompt or hand the turn on, so nothing further may be played until it lands. */
export const mayChangePhase = (sent: Pick<SentPlay, 'card' | 'zone'>[]): boolean => sent.some((o) => o.zone === 'play');
