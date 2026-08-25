import { useEffect } from 'react';
import { useGameStore, useStoreSnapshot } from '../store';
import type { Notice } from '../store/types';

/** How long a notice sits on screen once it's actually visible to its recipient before it self-dismisses. */
const NOTICE_TTL_MS = 5200;

/**
 * One stacked notice. The dismiss timer is keyed on `notice.id` alone so it
 * starts counting from the moment *this* notice first renders — not from
 * whenever the event that produced it actually happened. That distinction
 * matters in local pass-and-play: a notice addressed to the victim of a
 * steal is generated while the acting player is still the one looking at
 * the screen (see the `forPlayerId` doc comment on `Notice`), so it can sit
 * queued, invisible, for as long as it takes to hand the device to the
 * victim's seat — the clock should only start once they can actually see it.
 */
function NoticeItem({ notice, onDismiss }: { notice: Notice; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(notice.id), NOTICE_TTL_MS);
    return () => window.clearTimeout(t);
    // Deliberately keyed on `notice.id` alone (not `onDismiss`) — restarting
    // the timer on every unrelated re-render would mean a notice that keeps
    // getting new siblings could sit on screen indefinitely.
  }, [notice.id]);

  return (
    <li className={`toast-item toast-item--${notice.tone}`} data-testid="notice-toast">
      <span className="toast-item__text">{notice.text}</span>
      <button
        type="button"
        className="toast-item__dismiss"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(notice.id)}
      >
        ×
      </button>
    </li>
  );
}

export function Toast() {
  const rejected = useGameStore((api) => api.getSnapshot().rejected);
  const clearRejected = useGameStore((api) => api.clearRejected);
  const dismissNotice = useGameStore((api) => api.dismissNotice);
  const snapshot = useStoreSnapshot();

  useEffect(() => {
    if (!rejected) return;
    const t = window.setTimeout(() => clearRejected(), 2800);
    return () => window.clearTimeout(t);
  }, [rejected, clearRejected]);

  const viewerId = snapshot.clientState?.viewerId;
  // Only entries addressed to whoever is currently being viewed — see the
  // `forPlayerId` doc comment on `Notice` for why generation and display are
  // deliberately decoupled. Capped here (independent of the store's own,
  // larger cap) so a burst can't stack more than a handful on screen at once.
  const visibleNotices = viewerId
    ? (snapshot.notices ?? []).filter((n) => n.forPlayerId === viewerId).slice(-4)
    : [];

  const handleDismiss = (id: number) => dismissNotice?.(id);

  return (
    <>
      {rejected && (
        <div className="toast toast--error" role="alert" data-testid="toast-rejected">
          {rejected}
        </div>
      )}
      {visibleNotices.length > 0 && (
        <ul className="toast-stack" aria-live="polite" data-testid="notice-stack">
          {visibleNotices.map((notice) => (
            <NoticeItem key={notice.id} notice={notice} onDismiss={handleDismiss} />
          ))}
        </ul>
      )}
    </>
  );
}
