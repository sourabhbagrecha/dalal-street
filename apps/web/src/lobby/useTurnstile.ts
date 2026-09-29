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

/** How long a passed widget stays visible before it eases out — matches the
 * CSS transition duration in lobby.css (`.lb-turnstile--fading`). */
const SUCCESS_HOLD_MS = 600;
const FADE_MS = 320;

export type TurnstileWidgetPhase = 'active' | 'fading' | 'hidden';

/**
 * Mounts a Turnstile widget into `containerRef` and hands back its current
 * single-use token. `enabled` is false when no site key is configured
 * (local dev without a widget set up) — callers should not gate on `token`
 * in that case, since one will never arrive. `phase` drives the widget's own
 * hold-then-fade-out once it passes; callers only need it for a className.
 */
export function useTurnstile(containerRef: RefObject<HTMLDivElement | null>) {
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<TurnstileWidgetPhase>('active');
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

  useEffect(() => {
    if (!token) {
      setPhase('active');
      return undefined;
    }
    const holdTimer = window.setTimeout(() => setPhase('fading'), SUCCESS_HOLD_MS);
    return () => window.clearTimeout(holdTimer);
  }, [token]);

  useEffect(() => {
    if (phase !== 'fading') return undefined;
    const fadeTimer = window.setTimeout(() => setPhase('hidden'), FADE_MS);
    return () => window.clearTimeout(fadeTimer);
  }, [phase]);

  const reset = () => {
    setToken(null);
    if (window.turnstile && widgetIdRef.current) window.turnstile.reset(widgetIdRef.current);
  };

  return { token, reset, phase, enabled: Boolean(SITE_KEY) };
}
