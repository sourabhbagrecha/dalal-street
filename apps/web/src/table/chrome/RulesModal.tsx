import { Suspense, lazy, useEffect } from 'react';
import { createPortal } from 'react-dom';

// The manual and its CSS only ship to a client that opens it.
const RulesPage = lazy(() => import('../../pages/RulesPage').then((m) => ({ default: m.RulesPage })));

/** The rules over the table, so a lookup mid-game never leaves it: the seat, its SSE connection and the turn clocks all stay put. */
export function RulesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="rules-modal" role="dialog" aria-modal="true" aria-label="Rules" data-testid="rules-modal">
      <div className="rules-modal__scrim" onClick={onClose} />
      <Suspense fallback={null}>
        <RulesPage onClose={onClose} />
      </Suspense>
    </div>,
    document.body,
  );
}
