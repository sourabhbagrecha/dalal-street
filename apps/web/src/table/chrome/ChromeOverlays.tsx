import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useChrome } from './context';
import type { NetStatus, ToastPort } from './context';
import { FeedSheet } from './FeedSheet';

/**
 * Slim strip under the HUD while the server connection is down, so it shows during play and not only in the sheet.
 * Always mounted (empty while connected): specs and screen readers read `sse-status`.
 */
function ConnectionBanner({ status }: { status: NetStatus }) {
  // The first connect (and a seat switch in /demo) is 'connecting': the loading screen says so, no need for a red strip on top of it.
  const down = status === 'error';
  return (
    <div className="cx-conn" data-testid="sse-status" data-on={down} role="status" aria-live="polite">
      {down ? 'Reconnecting…' : ''}
    </div>
  );
}

/** The server turned a command down. Sits just above the tray, so it never covers the cards you are playing with. */
function RejectedToast({ toast }: { toast: ToastPort }) {
  const { text, clear } = toast;
  const ref = useRef<HTMLDivElement>(null);
  const [bottom, setBottom] = useState(200);

  useAutoClear(text, clear);
  useLayoutEffect(() => {
    const tray = ref.current?.closest('.tb')?.querySelector<HTMLElement>('.tb-tray');
    if (!tray) return;
    // The end-turn button overhangs the tray by ~30px; clear it too.
    const measure = () => setBottom(tray.offsetHeight + 36);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(tray);
    return () => ro.disconnect();
  }, [text]);

  if (!text) return null;
  return (
    <div ref={ref} className="cx-toast" role="alert" data-testid="toast-rejected" style={{ bottom }}>
      {text}
    </div>
  );
}

/** Clears the toast after a moment; restarts when the text changes. */
function useAutoClear(text: string | null, clear: () => void) {
  useEffect(() => {
    if (!text) return;
    const t = window.setTimeout(clear, 2800);
    return () => window.clearTimeout(t);
  }, [text, clear]);
}

/** Everything the chrome draws over the table: connection banner, rejected-command toast and the feed sheet. */
export function ChromeOverlays() {
  const c = useChrome();
  if (!c) return null;
  return (
    <>
      {c.net && <ConnectionBanner status={c.net.status} />}
      {c.toast && <RejectedToast toast={c.toast} />}
      <FeedSheet />
    </>
  );
}
