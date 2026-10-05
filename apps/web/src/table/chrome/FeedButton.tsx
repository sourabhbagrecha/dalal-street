import { Icon } from '../kit';
import { useChrome } from './context';

/** The HUD button that opens the chat and game-log sheet, with the unread chat count. */
export function FeedButton() {
  const c = useChrome();
  if (!c) return null;
  const n = c.unread;
  return (
    <button
      type="button"
      className="tb-hud__btn cx-hud-btn"
      data-on={c.open}
      aria-label="Open chat and game log"
      aria-haspopup="dialog"
      aria-expanded={c.open}
      onClick={() => (c.open ? c.closeSheet() : c.openSheet())}
    >
      <Icon name="chat" />
      {n > 0 && (
        <span className="cx-badge" data-testid="feed-badge" aria-hidden>
          {n > 99 ? '99+' : String(n)}
        </span>
      )}
    </button>
  );
}
