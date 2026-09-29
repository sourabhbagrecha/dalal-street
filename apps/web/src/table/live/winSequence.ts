import { useEffect, useRef, useState } from 'react';
import type { PropertySet } from '@monopoly-deal/shared';
import { soundEngine } from '../../sound/soundEngine';

/**
 * One beat of the win celebration `Victory` plays out before it settles on the summary card (`WinSummary`
 * in `table/kit.tsx`): a wordless intro, the winner's name, then one beat per full set they won with, in
 * board order. `winSteps` is pure so its ordering and durations are unit-tested without a DOM; the sounds
 * and timers that drive it live in `useWinSequence` below.
 */
export type WinStep = { kind: 'intro' } | { kind: 'name' } | { kind: 'set'; set: PropertySet; index: number; total: number };

const INTRO_MS = 1000;
const NAME_MS = 1800;
const SET_MS = 1700;

export function stepMs(step: WinStep): number {
  return step.kind === 'set' ? SET_MS : step.kind === 'intro' ? INTRO_MS : NAME_MS;
}

/** Intro, then the name, then one step per full set — the order the celebration plays in. */
export function winSteps(sets: readonly PropertySet[]): WinStep[] {
  return [
    { kind: 'intro' },
    { kind: 'name' },
    ...sets.map((set, index) => ({ kind: 'set' as const, set, index, total: sets.length })),
  ];
}

/** `reveal`'s pitch climbs a bit with every further set, so the third one doesn't sound identical to the first. */
export function revealRate(index: number): number {
  return 1 + index * 0.12;
}

function playStepSound(step: WinStep): void {
  if (step.kind === 'intro') {
    soundEngine.play('drumroll');
  } else if (step.kind === 'name') {
    soundEngine.play('fanfare');
  } else {
    soundEngine.play('whoosh');
    window.setTimeout(() => soundEngine.play('reveal', { rate: revealRate(step.index) }), 150);
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Drives the celebration through `winSteps`, one timed beat at a time, playing each beat's sound as it
 * starts. Returns `step: null` once the sequence is done (or was never started), which is `Victory`'s cue
 * to show the summary card instead.
 *
 * A win already on screen when this mounts (a reload into a finished game) — and reduced-motion — skip
 * straight to the summary, same as `useWinReveal` skips its own hold. Detected the same way: `winnerId`
 * already set the first time this hook runs, before any live win has happened, is a reload, not a win
 * this viewer watched happen.
 */
export function useWinSequence(winnerId: string | null, sets: readonly PropertySet[]): { step: WinStep | null; skip(): void } {
  const isReload = useRef(winnerId !== null);
  const setsRef = useRef(sets);
  setsRef.current = sets;

  const [steps, setSteps] = useState<WinStep[]>([]);
  const [index, setIndex] = useState(0);
  const resolvedRef = useRef<string | null>(null);

  useEffect(() => {
    if (winnerId === null) {
      resolvedRef.current = null;
      setSteps([]);
      setIndex(0);
      return;
    }
    if (resolvedRef.current === winnerId) return;
    resolvedRef.current = winnerId;
    setSteps(isReload.current || prefersReducedMotion() ? [] : winSteps(setsRef.current));
    setIndex(0);
  }, [winnerId]);

  useEffect(() => {
    if (index >= steps.length) return;
    const step = steps[index]!;
    playStepSound(step);
    const t = window.setTimeout(() => setIndex((i) => i + 1), stepMs(step));
    return () => window.clearTimeout(t);
  }, [index, steps]);

  return {
    step: index < steps.length ? steps[index]! : null,
    skip: () => setIndex(steps.length),
  };
}
