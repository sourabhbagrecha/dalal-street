/**
 * Watches the event log and client state for sound-worthy moments and fires
 * them through `soundEngine`. Deliberately independent of `moments/`'s
 * callout/notice/flight machinery (whose shapes are a documented contract
 * between two presentation layers) — this re-derives its own moments off the
 * same pure `deriveMoments` and keeps its own "fresh since last seen id"
 * baseline, mirroring the pattern in `useTableMoments` / `useCardDrawFlights`.
 */
import { useEffect, useRef } from 'react';
import type { ClientGameState } from '@monopoly-deal/shared';
import type { LogEntry } from '../store/types';
import { deriveMoments } from '../moments/derive';
import type { MomentKind } from '../moments/types';
import { soundEngine } from './soundEngine';
import type { SoundKey } from './synth';

const MOMENT_SOUND: Partial<Record<MomentKind, SoundKey>> = {
  sly_deal: 'attack',
  forced_deal: 'attack',
  deal_breaker: 'attack',
  debt_collector: 'attack',
  birthday: 'attack',
  rent: 'attack',
  payment: 'pay',
  just_say_no: 'block',
  set_broken: 'break',
};

const EVENT_SOUND: Partial<Record<string, SoundKey>> = {
  property_placed: 'place',
  card_banked: 'place',
  rearranged: 'place',
  cards_drawn: 'draw',
  pass_go: 'draw',
  discarded: 'discard',
  hand_limit_discard: 'discard',
  card_played: 'discard',
  set_completed: 'setComplete',
};

export function useSoundEffects(
  log: LogEntry[],
  clientState: ClientGameState | null,
  rejected: string | null,
  mode: 'local' | 'network',
): void {
  const lastSeenId = useRef<number | null>(null);
  const lastTurnPlayer = useRef<string | null>(null);
  const wasRejected = useRef(false);

  useEffect(() => {
    if (lastSeenId.current === null) {
      lastSeenId.current = log.length > 0 ? log[log.length - 1]!.id : 0;
      return;
    }
    const currentMaxId = log.length > 0 ? log[log.length - 1]!.id : 0;
    if (currentMaxId < lastSeenId.current) {
      // Log restarted (new game / fixture / room change) — no catch-up sounds.
      lastSeenId.current = currentMaxId;
      return;
    }
    const baseline = lastSeenId.current;
    lastSeenId.current = currentMaxId;
    if (!clientState) return;

    const fresh = log.filter((e) => e.id > baseline);
    if (fresh.length === 0) return;

    for (const entry of fresh) {
      if (entry.type === 'winner') {
        soundEngine.play(entry.playerId === clientState.viewerId ? 'win' : 'lose');
        continue;
      }
      const key = EVENT_SOUND[entry.type];
      if (key) soundEngine.play(key);
    }

    const moments = deriveMoments(fresh, clientState, { now: Date.now(), viewerId: clientState.viewerId, mode });
    for (const moment of moments) {
      const key = MOMENT_SOUND[moment.kind];
      if (key) soundEngine.play(key);
    }
  }, [log, clientState, mode]);

  useEffect(() => {
    if (!clientState) return;
    if (lastTurnPlayer.current !== null && lastTurnPlayer.current !== clientState.currentPlayerId) {
      if (clientState.currentPlayerId === clientState.you.id) soundEngine.play('yourTurn');
    }
    lastTurnPlayer.current = clientState.currentPlayerId;
  }, [clientState]);

  useEffect(() => {
    if (rejected && !wasRejected.current) soundEngine.play('error');
    wasRejected.current = Boolean(rejected);
  }, [rejected]);
}
