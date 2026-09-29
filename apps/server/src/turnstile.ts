import { log } from './logger.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function getSecretKey(): string | undefined {
  return process.env['TURNSTILE_SECRET_KEY'];
}

/**
 * Verifies a client-supplied Turnstile token with Cloudflare. Fails closed on
 * any network or API error. With no `TURNSTILE_SECRET_KEY` set, enforcement
 * is off (local dev without a widget configured) and every token passes.
 */
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  const secret = getSecretKey();
  if (!secret) return true;
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch (err) {
    log('warn', 'turnstile_verify_failed', { error: String(err) });
    return false;
  }
}
