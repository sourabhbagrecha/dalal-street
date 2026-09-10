/**
 * Every sound effect is synthesized, not recorded — zero audio asset bytes to
 * ship or fetch. Each recipe renders through an `OfflineAudioContext`, which
 * runs synchronously in the background with no user-gesture requirement, so
 * every buffer can be ready well before a real `AudioContext` is unlocked.
 */

export type SoundKey =
  | 'place'
  | 'draw'
  | 'discard'
  | 'pay'
  | 'attack'
  | 'block'
  | 'break'
  | 'setComplete'
  | 'win'
  | 'lose'
  | 'yourTurn'
  | 'error';

const SAMPLE_RATE = 44100;

interface ToneSpec {
  type: OscillatorType;
  freqStart: number;
  freqEnd?: number;
  start: number;
  duration: number;
  peakGain: number;
  attack?: number;
  release?: number;
}

function scheduleTone(ctx: BaseAudioContext, dest: AudioNode, spec: ToneSpec): void {
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  const gain = ctx.createGain();
  const t0 = spec.start;
  const attack = spec.attack ?? 0.005;
  const release = spec.release ?? spec.duration * 0.6;
  osc.frequency.setValueAtTime(spec.freqStart, t0);
  if (spec.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(spec.freqEnd, 1), t0 + spec.duration);
  }
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(spec.peakGain, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.duration + release);
  osc.connect(gain).connect(dest);
  osc.start(t0);
  osc.stop(t0 + spec.duration + release + 0.02);
}

interface NoiseSpec {
  start: number;
  duration: number;
  peakGain: number;
  filterType: BiquadFilterType;
  freqStart: number;
  freqEnd?: number;
  q?: number;
}

function scheduleNoise(ctx: OfflineAudioContext, dest: AudioNode, spec: NoiseSpec): void {
  const frames = Math.max(1, Math.ceil(ctx.sampleRate * spec.duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = spec.filterType;
  filter.frequency.setValueAtTime(spec.freqStart, spec.start);
  if (spec.freqEnd !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(spec.freqEnd, 1), spec.start + spec.duration);
  }
  if (spec.q !== undefined) filter.Q.value = spec.q;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, spec.start);
  gain.gain.linearRampToValueAtTime(spec.peakGain, spec.start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, spec.start + spec.duration);

  src.connect(filter).connect(gain).connect(dest);
  src.start(spec.start);
}

async function render(duration: number, build: (ctx: OfflineAudioContext) => void): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.ceil(SAMPLE_RATE * duration), SAMPLE_RATE);
  build(ctx);
  return ctx.startRendering();
}

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

export const SOUND_BUILDERS: Record<SoundKey, () => Promise<AudioBuffer>> = {
  place: () =>
    render(0.1, (ctx) =>
      scheduleNoise(ctx, ctx.destination, { start: 0, duration: 0.045, peakGain: 0.35, filterType: 'highpass', freqStart: 1500 }),
    ),

  draw: () =>
    render(0.2, (ctx) =>
      scheduleNoise(ctx, ctx.destination, {
        start: 0,
        duration: 0.16,
        peakGain: 0.22,
        filterType: 'bandpass',
        freqStart: 800,
        freqEnd: 3000,
        q: 1.2,
      }),
    ),

  discard: () =>
    render(0.12, (ctx) =>
      scheduleTone(ctx, ctx.destination, { type: 'sine', freqStart: 260, freqEnd: 170, start: 0, duration: 0.07, peakGain: 0.28, release: 0.05 }),
    ),

  pay: () =>
    render(0.24, (ctx) => {
      scheduleTone(ctx, ctx.destination, { type: 'triangle', freqStart: NOTE.C6, start: 0, duration: 0.06, peakGain: 0.24 });
      scheduleTone(ctx, ctx.destination, { type: 'triangle', freqStart: NOTE.E5 * 2, start: 0.07, duration: 0.08, peakGain: 0.24 });
    }),

  attack: () =>
    render(0.3, (ctx) => {
      scheduleTone(ctx, ctx.destination, { type: 'sawtooth', freqStart: 220, freqEnd: 140, start: 0, duration: 0.18, peakGain: 0.2, release: 0.08 });
      scheduleNoise(ctx, ctx.destination, { start: 0, duration: 0.05, peakGain: 0.14, filterType: 'highpass', freqStart: 2000 });
    }),

  block: () =>
    render(0.32, (ctx) =>
      scheduleTone(ctx, ctx.destination, { type: 'square', freqStart: 520, freqEnd: 180, start: 0, duration: 0.22, peakGain: 0.16, release: 0.06 }),
    ),

  break: () =>
    render(0.3, (ctx) => {
      scheduleTone(ctx, ctx.destination, { type: 'sawtooth', freqStart: 300, freqEnd: 90, start: 0, duration: 0.2, peakGain: 0.2, release: 0.06 });
      scheduleNoise(ctx, ctx.destination, { start: 0, duration: 0.08, peakGain: 0.16, filterType: 'lowpass', freqStart: 1200, freqEnd: 300 });
    }),

  setComplete: () =>
    render(0.5, (ctx) => {
      [NOTE.C5, NOTE.E5, NOTE.G5].forEach((freq, i) =>
        scheduleTone(ctx, ctx.destination, { type: 'triangle', freqStart: freq, start: i * 0.09, duration: 0.14, peakGain: 0.22 }),
      );
    }),

  win: () =>
    render(0.9, (ctx) => {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((freq, i) =>
        scheduleTone(ctx, ctx.destination, { type: 'triangle', freqStart: freq, start: i * 0.12, duration: 0.22, peakGain: 0.28 }),
      );
    }),

  lose: () =>
    render(0.6, (ctx) =>
      scheduleTone(ctx, ctx.destination, { type: 'sawtooth', freqStart: 392, freqEnd: 150, start: 0, duration: 0.5, peakGain: 0.2, release: 0.15 }),
    ),

  yourTurn: () =>
    render(0.35, (ctx) => {
      scheduleTone(ctx, ctx.destination, { type: 'sine', freqStart: NOTE.E5, start: 0, duration: 0.14, peakGain: 0.16 });
      scheduleTone(ctx, ctx.destination, { type: 'sine', freqStart: NOTE.C6, start: 0.12, duration: 0.18, peakGain: 0.18 });
    }),

  error: () =>
    render(0.16, (ctx) =>
      scheduleTone(ctx, ctx.destination, { type: 'square', freqStart: 180, start: 0, duration: 0.1, peakGain: 0.18, release: 0.03 }),
    ),
};
