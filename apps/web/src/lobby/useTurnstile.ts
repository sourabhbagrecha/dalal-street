import { useEffect, useRef, useState, type RefObject } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
      theme?: 'light' | 'dark' | 'auto';
      appearance?: 'always' | 'execute' | 'interaction-only';
    },
  ): string;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Mounts a Turnstile widget into `containerRef` and hands back its current
 * single-use token. `enabled` is false when no site key is configured
 * (local dev without a widget set up) — callers should not gate on `token`
 * in that case, since one will never arrive.
 */
export function useTurnstile(containerRef: RefObject<HTMLDivElement | null>) {
  const [token, setToken] = useState<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    let pollId: number | undefined;

    const mount = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (t) => setToken(t),
        'error-callback': () => setToken(null),
        'expired-callback': () => setToken(null),
        theme: 'dark',
        // Stays invisible for the silent-pass case (almost everyone); only
        // shows a challenge when Cloudflare actually needs interaction.
        appearance: 'interaction-only',
      });
    };

    if (window.turnstile) {
      mount();
    } else {
      pollId = window.setInterval(() => {
        if (window.turnstile) {
          window.clearInterval(pollId);
          mount();
        }
      }, 100);
    }

    return () => {
      cancelled = true;
      if (pollId) window.clearInterval(pollId);
    };
  }, [containerRef]);

  const reset = () => {
    setToken(null);
    if (window.turnstile && widgetIdRef.current) window.turnstile.reset(widgetIdRef.current);
  };

  return { token, reset, enabled: Boolean(SITE_KEY) };
}
