const REDACT_KEYS = new Set([
  'playerToken',
  'token',
  'hand',
  'hands',
  'deck',
  'seed',
]);

function redactValue(key: string, value: unknown): unknown {
  if (REDACT_KEYS.has(key)) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redactUnknown(v));
  if (typeof value === 'object') return redactObject(value as Record<string, unknown>);
  if (typeof value === 'string' && value.length >= 32 && /^[A-Za-z0-9_-]+$/.test(value)) {
    return '[REDACTED]';
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

function redactUnknown(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redactUnknown(v));
  if (typeof value === 'object') return redactObject(value as Record<string, unknown>);
  return value;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function log(
  level: LogLevel,
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...redactObject(fields),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}
