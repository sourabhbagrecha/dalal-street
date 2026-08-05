import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../store/types';

const CARD_W = 46;
const CARD_H = 64;
const FLIGHT_MS = 700;
const STAGGER_MS = 110;

export interface FlightCard {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delayMs: number;
}

/** Watches the event log for the viewer's own draws (turn draw, Pass Go) and
 * produces short-lived flight specs animating cards from the draw pile to the hand. */
export function useCardDrawFlights(log: LogEntry[], viewerId: string | undefined): FlightCard[] {
  const [flights, setFlights] = useState<FlightCard[]>([]);
  const lastSeenId = useRef<number | null>(null);
  const seq = useRef(0);
  const timeouts = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const pending = timeouts.current;
    return () => {
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);

  useEffect(() => {
    if (lastSeenId.current === null) {
      lastSeenId.current = log.length > 0 ? log[log.length - 1]!.id : 0;
      return;
    }
    const currentMaxId = log.length > 0 ? log[log.length - 1]!.id : 0;
    // Dev tools (fixture reload, new game) restart the log's id sequence — treat
    // a shrinking max id as a reset so future entries aren't mistaken for "already seen".
    const baseline = currentMaxId < lastSeenId.current ? 0 : lastSeenId.current;
    const fresh = log.filter((e) => e.id > baseline);
    lastSeenId.current = currentMaxId;
    if (fresh.length === 0) return;

    const drawEntries = fresh.filter(
      (e) => (e.type === 'cards_drawn' || e.type === 'pass_go') && e.playerId === viewerId,
    );
    if (drawEntries.length === 0) return;

    const pile = document.querySelector<HTMLElement>('[data-testid="draw-pile"]');
    const hand = document.querySelector<HTMLElement>('[data-testid="hand-fan"]');
    if (!pile || !hand) return;
    const pileRect = pile.getBoundingClientRect();
    const handRect = hand.getBoundingClientRect();

    const newFlights: FlightCard[] = [];
    for (const entry of drawEntries) {
      const count = entry.type === 'cards_drawn' ? Number(entry.data?.count ?? 2) : 2;
      for (let i = 0; i < count; i++) {
        seq.current += 1;
        const jitter = (i - (count - 1) / 2) * 18;
        newFlights.push({
          id: `flight-${seq.current}`,
          fromX: pileRect.left + pileRect.width / 2 - CARD_W / 2,
          fromY: pileRect.top + pileRect.height / 2 - CARD_H / 2,
          toX: handRect.left + handRect.width / 2 - CARD_W / 2 + jitter,
          toY: handRect.top + handRect.height / 2 - CARD_H / 2,
          delayMs: i * STAGGER_MS,
        });
      }
    }
    if (newFlights.length === 0) return;

    setFlights((prev) => [...prev, ...newFlights]);
    const ids = new Set(newFlights.map((f) => f.id));
    const maxDelay = Math.max(...newFlights.map((f) => f.delayMs));
    const timeout = setTimeout(() => {
      setFlights((prev) => prev.filter((f) => !ids.has(f.id)));
      timeouts.current.delete(timeout);
    }, maxDelay + FLIGHT_MS + 80);
    timeouts.current.add(timeout);
  }, [log, viewerId]);

  return flights;
}
