import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ClientGameState } from '@monopoly-deal/shared';
import { useCurrency } from '../hooks/useCurrency';
import { noticeCopyFor } from '../moments/copy';
import { momentStore, useMomentState } from '../moments/store';

const MAX_VISIBLE = 4;
const DISMISS_FADE_MS = 150;

/**
 * A persistent, dismissible stack addressed to the viewer specifically —
 * every notice the store holds for every player, filtered down to this
 * seat's own. See `moments/store.ts`'s `ingest`: the payer of a `payment`
 * gets a receipt notice too (unless it was their own self-initiated
 * payment), and that recipient is already baked into `notices` the same way
 * any attack victim is — nothing extra to special-case here.
 */
export function NoticeStack({ clientState }: { clientState: ClientGameState }) {
  const { formatMoney } = useCurrency();
  const { notices, moments } = useMomentState();
  const viewerId = clientState.viewerId;

  const mine = useMemo(
    () => notices.filter((n) => n.forPlayerId === viewerId).sort((a, b) => a.id - b.id),
    [notices, viewerId],
  );

  useEffect(() => {
    const now = Date.now();
    for (const n of mine) {
      if (n.shownAt === null) momentStore.markNoticeShown(n.id, now);
    }
  }, [mine]);

  // Dismissal fades out before actually removing the notice from the store —
  // an id in here plays the exit animation; the store removal lands after it.
  const [dismissingIds, setDismissingIds] = useState<Set<number>>(() => new Set());

  const handleDismiss = (id: number) => {
    setDismissingIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      momentStore.dismissNotice(id);
      setDismissingIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, DISMISS_FADE_MS);
  };

  if (mine.length === 0) return null;

  const overflow = Math.max(0, mine.length - MAX_VISIBLE);
  const visible = mine.slice(-MAX_VISIBLE);

  // Portalled to document.body for the same reason as MomentCallout
  // (PLAN-UI-R5 item A): html/body/.app/.app__layout all set `overflow:
  // hidden`, which clips a position:fixed descendant regardless of transforms.
  return createPortal(
    <div className="notice-stack" data-testid="notice-stack">
      {overflow > 0 && <div className="notice-stack__overflow">+{overflow} more</div>}
      {visible.map((notice) => {
        const moment = moments.find((m) => m.id === notice.momentId);
        if (!moment) return null;
        const copy = noticeCopyFor(moment, clientState, formatMoney);
        const dismissing = dismissingIds.has(notice.id);
        return (
          <div
            key={notice.id}
            className={`notice${dismissing ? ' notice--dismissing' : ''}`}
            data-testid="notice"
            data-tone={copy.tone}
          >
            <span className="notice__text">{copy.text}</span>
            <button
              type="button"
              className="notice__dismiss"
              data-testid="notice-dismiss"
              aria-label="Dismiss notice"
              onClick={() => handleDismiss(notice.id)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
