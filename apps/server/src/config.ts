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

/**
 * Normalise an origin for comparison: lower-case scheme/host, drop a trailing
 * slash (a common paste mistake — browsers never send one in `Origin`).
 */
function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  try {
    return new URL(trimmed).origin.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function parseOriginAllowlist(): string[] {
  const raw = process.env.ORIGIN_ALLOWLIST ?? 'http://127.0.0.1:5173,http://localhost:5173';
  return raw.split(',').map(normalizeOrigin).filter(Boolean);
}

/** Explicit origins that are always allowed (env `ORIGIN_ALLOWLIST`, comma-separated). */
export const ORIGIN_ALLOWLIST: readonly string[] = parseOriginAllowlist();

/** Port the Vite dev server listens on — the only port LAN origins may use. */
function getWebDevPort(): number {
  const parsed = Number(process.env.WEB_PORT ?? 5173);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5173;
}

const IPV4_PRIVATE = [
  /^127\./, // loopback
  /^10\./, // RFC1918
  /^192\.168\./, // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918 172.16/12
  /^169\.254\./, // link-local
];

/** True for hosts that can only be reached from the same machine or LAN. */
export function isPrivateNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1') return true;
  // IPv4-mapped IPv6 (::ffff:192.168.1.2)
  const v4 = host.startsWith('::ffff:') ? host.slice(7) : host;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return IPV4_PRIVATE.some((re) => re.test(v4));
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
  return /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
}

/**
 * Whether LAN origins are accepted without being listed. Default: on outside
 * production so a phone on the same Wi-Fi can hit the Vite dev server at any
 * network address. Force with `MD_ALLOW_LAN_ORIGINS=1|0`.
 */
function lanOriginsEnabled(): boolean {
  const flag = process.env.MD_ALLOW_LAN_ORIGINS;
  if (flag === '1') return true;
  if (flag === '0') return false;
  return process.env['NODE_ENV'] !== 'production';
}

/**
 * Origin gate used by CORS and the request middleware.
 *
 * Allowed when the origin is on `ORIGIN_ALLOWLIST`, or (dev only) when it is a
 * plain-http private-network host on the web dev port. Public hosts are never
 * implicitly allowed.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  const normalized = normalizeOrigin(origin);
  if (ORIGIN_ALLOWLIST.includes(normalized)) return true;
  if (!lanOriginsEnabled()) return false;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  return port === getWebDevPort() && isPrivateNetworkHost(url.hostname);
}

export const DEFAULT_PORT = 8787;

export function getPort(): number {
  const parsed = Number(process.env.PORT ?? DEFAULT_PORT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}
