/**
 * Owns audio playback for the table. Every buffer is synthesized (see
 * `synth.ts`) and rendered up front via `preload()` — called once at module
 * load, from `main.tsx`, well before any game screen mounts — so `play()`
 * never waits on synthesis or a network round trip; a call that lands before
 * preload finishes just drops the sound rather than delaying it.
 *
 * Playback itself still needs a real `AudioContext`, which browsers keep
 * suspended until a user gesture; the first pointerdown/keydown on the page
 * resumes it, mirroring `theme.ts`'s localStorage-backed module store.
 */
import { SOUND_BUILDERS, type SoundKey } from './synth';

const MUTE_KEY = 'monopoly-deal:sound-muted';

function hasWebAudio(): boolean {
  return typeof window !== 'undefined' && (typeof AudioContext !== 'undefined' || 'webkitAudioContext' in window);
}

function readMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // ignore
  }
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SoundKey, AudioBuffer>();
  private muted = readMuted();
  private unlocked = false;
  private readonly listeners = new Set<() => void>();

  constructor() {
    if (!hasWebAudio()) return;
    this.preload();
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /** Renders every sound now, off the main AudioContext, so playback is instant later. */
  private preload(): void {
    for (const key of Object.keys(SOUND_BUILDERS) as SoundKey[]) {
      SOUND_BUILDERS[key]()
        .then((buffer) => this.buffers.set(key, buffer))
        .catch(() => {
          // A buffer that fails to render just never plays — not worth surfacing.
        });
    }
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private unlock(): void {
    if (this.unlocked || !hasWebAudio()) return;
    this.unlocked = true;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  play(key: SoundKey): void {
    if (this.muted || !hasWebAudio()) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master!);
    source.start();
  }

  getMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    if (muted === this.muted) return;
    this.muted = muted;
    writeMuted(muted);
    for (const listener of this.listeners) listener();
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const soundEngine = new SoundEngine();
