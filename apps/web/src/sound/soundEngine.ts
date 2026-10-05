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

const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'] as const;

/** 0.1s of 8-bit mono silence as a WAV data URI — an <audio> element that moves iOS off the ambient session. */
const SILENT_WAV = (() => {
  const rate = 8000;
  const n = rate / 10;
  const bytes = new Uint8Array(44 + n).fill(128);
  const view = new DataView(bytes.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => bytes.set([c.charCodeAt(0)], at + i));
  tag(0, 'RIFF');
  view.setUint32(4, 36 + n, true);
  tag(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  tag(36, 'data');
  view.setUint32(40, n, true);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${typeof btoa === 'function' ? btoa(bin) : ''}`;
})();

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
    // touchend/click count as iOS audio activations; pointerdown alone does not.
    const unlock = () => {
      this.unlock();
      if (this.unlocked) for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock);
    };
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock);
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

  /**
   * iOS Safari mounts Web Audio on the "ambient" session, which the hardware
   * silent switch mutes. Ask for "playback" (iOS 17+); older iOS honours that
   * category only while an HTMLAudioElement plays, so also loop a silent clip.
   */
  private routeThroughPlaybackSession(): void {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'playback';
      } catch {
        // ignore
      }
    }
    try {
      const el = new Audio(SILENT_WAV);
      el.loop = true;
      el.setAttribute('playsinline', '');
      void el.play().catch(() => {
        // Autoplay refused; the next gesture retries.
        this.unlocked = false;
      });
    } catch {
      // ignore
    }
  }

  private unlock(): void {
    if (this.unlocked || !hasWebAudio()) return;
    this.unlocked = true;
    this.routeThroughPlaybackSession();
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
  }

  /** `rate`: `playbackRate` on the buffer source — the win sequence pitches `reveal` up per set revealed. */
  play(key: SoundKey, opts?: { rate?: number }): void {
    if (this.muted || !hasWebAudio()) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (opts?.rate) source.playbackRate.value = opts.rate;
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
