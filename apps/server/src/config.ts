/** Timing constants — override in tests via `setTimingConfig`. */
export interface TimingConfig {
  turnMs: number;
  jsnMs: number;
  paymentMs: number;
  targetingMs: number;
  disconnectGraceMs: number;
  sseHeartbeatMs: number;
  roomGcEmptyMs: number;
  roomGcFinishedMs: number;
  gcIntervalMs: number;
}

const DEFAULT_TIMING: TimingConfig = {
  turnMs: 60_000,
  jsnMs: 20_000,
  paymentMs: 30_000,
  targetingMs: 30_000,
  disconnectGraceMs: 60_000,
  sseHeartbeatMs: 15_000,
  roomGcEmptyMs: 5 * 60_000,
  roomGcFinishedMs: 10 * 60_000,
  gcIntervalMs: 30_000,
};

const SHORT_TIMING: TimingConfig = {
  turnMs: 8_000,
  jsnMs: 2_000,
  paymentMs: 2_000,
  targetingMs: 2_000,
  disconnectGraceMs: 3_000,
  sseHeartbeatMs: 1_000,
  roomGcEmptyMs: 5 * 60_000,
  roomGcFinishedMs: 10 * 60_000,
  gcIntervalMs: 30_000,
};

let timing: TimingConfig = {
  ...(process.env.MD_SHORT_TIMING === '1' ? SHORT_TIMING : DEFAULT_TIMING),
};

export function getTimingConfig(): Readonly<TimingConfig> {
  return timing;
}

export function setTimingConfig(overrides: Partial<TimingConfig>): void {
  timing = { ...timing, ...overrides };
}

export function resetTimingConfig(): void {
  timing = { ...DEFAULT_TIMING };
}

function parseOriginAllowlist(): string[] {
  const raw =
    process.env.ORIGIN_ALLOWLIST ??
    'http://127.0.0.1:5173,http://localhost:5173,http://192.168.0.10:5173';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const ORIGIN_ALLOWLIST: readonly string[] = parseOriginAllowlist();

export const DEFAULT_PORT = 8787;

export function getPort(): number {
  const parsed = Number(process.env.PORT ?? DEFAULT_PORT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}
