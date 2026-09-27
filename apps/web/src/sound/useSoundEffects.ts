/**
 * Watches the event log and client state for sound-worthy moments and fires
 * them through `soundEngine`. Deliberately independent of `moments/`'s
 * callout/notice/flight machinery (whose shapes are a documented contract
 * between two presentation layers) — this re-derives its own moments off the
 * same pure `deriveMoments` and keeps its own "fresh since last seen id"
 * baseline.
 *
 * Timing: a fresh log entry's sound is not played the instant the entry
 * arrives — the server's events land well before the stage has paced its way
 * to acting them out (`table/beats.ts` holds entries for their projection,
 * then queues and paces the resulting beats so a backlog cannot outrun the
 * eye; see `QUEUE_CAP`/`WAIT_CAP`/`MIN_WAIT` there). Playing on arrival made
 * sound lead picture by ~0.8s at the median (and much more under a backlog).
 * Instead, sounds decided from a batch of fresh entries are queued
 * (`soundQueue.ts`) and released when the next `Beat` actually lands on
 * stage (`beat` — the same value `useStageSync` acts out via `perform()`),
 * which is the table's own "this is happening now" clock. A few sounds
 * decided from one batch (e.g. a rent hitting three payers) release
 * together, staggered so they do not layer into noise. The queue's own
 * fallback timer covers entries whose beat was dropped (a beat "whose cards
 * cannot be found is dropped and its feed line kept", per beats.ts) so a
 * queued sound is never stranded. The viewer's own placements are unaffected
 * in practice: their beat settles a card already parked on the stage, so it
 * lands in the very same commit the sound was queued in.
 *
 * The win/lose sound is the one exception to "queue it and wait for the next beat": the winning entry is
 * the *last* one the game ever logs, so there is no further beat to release it on — queuing it the normal
 * way would mean it never plays. Instead it waits on `revealedWinnerId` (`table/live/winReveal.ts`), which
 * holds the same winner id until the winning play's own beat has finished holding the stage.
 */
import { useEffect, useRef } from 'react';
import type { ClientGameState } from '@monopoly-deal/shared';
import type { Beat } from '../table/model';
import type { LogEntry } from '../store/types';
import { deriveMoments } from '../moments/derive';
import type { MomentKind } from '../moments/types';
import { soundEngine } from './soundEngine';
import { createSoundQueue } from './soundQueue';
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
  beat: Beat | null,
  /** The winner, once its reveal hold has cleared (see the module doc) — null while a game is in progress
   * or while a just-decided win is still being held. */
  revealedWinnerId: string | null = null,
): void {
  const lastSeenId = useRef<number | null>(null);
  const lastTurnPlayer = useRef<string | null>(null);
  const wasRejected = useRef(false);
  const revealedSoundPlayedFor = useRef<string | null>(null);

  /** Sounds decided from the freshest log batch, waiting for a beat (or the queue's own fallback) to release them. */
  const queueRef = useRef<ReturnType<typeof createSoundQueue<SoundKey>> | null>(null);
  if (!queueRef.current) queueRef.current = createSoundQueue<SoundKey>((key) => soundEngine.play(key));
  const queue = (key: SoundKey) => queueRef.current!.push(key);
  const lastBeatId = useRef<number | null>(null);

  useEffect(() => () => queueRef.current?.dispose(), []);

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
      // The win/lose sound does not queue here — see `revealedWinnerId` below.
      if (entry.type === 'winner') continue;
      const key = EVENT_SOUND[entry.type];
      if (key) queue(key);
    }

    const moments = deriveMoments(fresh, clientState, { now: Date.now(), viewerId: clientState.viewerId, mode });
    for (const moment of moments) {
      const key = MOMENT_SOUND[moment.kind];
      if (key) queue(key);
    }
  }, [log, clientState, mode]);

  // The win/lose sound: held until the winning play's own animation has finished (see the module doc),
  // then played once per game. `revealedWinnerId` returns to null when a rematch deals a fresh game, so
  // the ref resets with it and the next win plays its sound too.
  useEffect(() => {
    if (revealedWinnerId === null) {
      revealedSoundPlayedFor.current = null;
      return;
    }
    if (!clientState || revealedSoundPlayedFor.current === revealedWinnerId) return;
    revealedSoundPlayedFor.current = revealedWinnerId;
    soundEngine.play(revealedWinnerId === clientState.viewerId ? 'win' : 'lose');
  }, [revealedWinnerId, clientState]);

  // The stage's own clock: a new beat landing means the picture is moving now, so any sound queued for it goes too.
  // The viewer's own placements settle a card already parked on stage, so this still fires in the same commit as the
  // event that queued the sound — no added delay for the case the report measured as already near-instant.
  useEffect(() => {
    if (!beat || beat.id === lastBeatId.current) return;
    lastBeatId.current = beat.id;
    queueRef.current!.release();
  }, [beat]);

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
