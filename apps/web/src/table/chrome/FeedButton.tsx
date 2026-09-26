import { Icon } from '../kit';
import { useChrome } from './context';
import '../../styles/gl-chrome.css';

/** The HUD button that opens the feed sheet, with the unread count (log lines and chat you have not looked at). */
export function FeedButton() {
  const c = useChrome();
  if (!c) return null;
  const n = c.unread.total;
  return (
    <button
      type="button"
      className="tb-hud__btn cx-hud-btn"
      data-on={c.open}
      aria-label="Open table feed"
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
