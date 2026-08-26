import { useEffect, useState, type ReactNode } from 'react';
import type { ClientGameState } from '@monopoly-deal/shared';
import type { LogEntry } from '../store';
import { useIsPhoneBoard } from '../hooks/useIsPhoneBoard';
import { momentStore, useMomentState } from '../moments/store';
import { TableFeed } from './TableFeed';
import { ChatPanel } from './ChatPanel';

interface SidePanelProps {
  entries: LogEntry[];
  clientState: ClientGameState;
  /*
   * Dev-only chrome (scenario picker, seat switcher) for /demo and /local. It
   * lives in this drawer rather than in a bar above the board so those routes
   * lay out exactly like the shipped game does — the top band it used to own
   * is board space on a phone, and the real game never spends it.
   */
  devControls?: ReactNode;
}

export function SidePanel({ entries, clientState, devControls }: SidePanelProps) {
  const phone = useIsPhoneBoard();
  const [collapsed, setCollapsed] = useState(phone);

  /*
   * On a phone the panel is a drawer over the board, so it has to start — and
   * go back to being — closed whenever the layout becomes one. This used to be
   * a one-shot `innerWidth <= 700` read at mount, which meant turning the phone
   * sideways left a full-height drawer parked over half the table, on the very
   * layout with the least room to spare.
   */
  useEffect(() => {
    if (phone) setCollapsed(true);
  }, [phone]);

  const { feedSeenUpTo } = useMomentState();
  const maxLogId = entries.length > 0 ? entries[entries.length - 1]!.id : 0;
  const unseenCount = entries.filter((e) => e.id > feedSeenUpTo).length;

  // Clears the badge the moment the drawer opens, and keeps clearing it as
  // fresh entries arrive while it stays open — closing it again leaves
  // feedSeenUpTo where it is, so anything that happens next builds up again.
  useEffect(() => {
    if (!collapsed && maxLogId > feedSeenUpTo) momentStore.markFeedSeen(maxLogId);
  }, [collapsed, maxLogId, feedSeenUpTo]);

  return (
    <>
      {!collapsed && (
        <button
          type="button"
          className="side-panel__backdrop"
          aria-label="Close table feed"
          onClick={() => setCollapsed(true)}
        />
      )}
      <aside className={`side-panel${collapsed ? ' side-panel--collapsed' : ''}`}>
        <header className="side-panel__header">
          <h2 className="side-panel__title">Table Feed</h2>
          <button
            type="button"
            className="side-panel__collapse"
            aria-label={collapsed ? 'Expand table feed' : 'Collapse table feed'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? '‹' : '›'}
          </button>
        </header>
        {!collapsed && (
          <>
            {devControls && <div className="side-panel__dev">{devControls}</div>}
            <TableFeed entries={entries} clientState={clientState} />
            <ChatPanel />
          </>
        )}
      </aside>
      {collapsed && (
        <button
          type="button"
          className="side-panel__fab"
          aria-label="Open table feed"
          aria-expanded="false"
          onClick={() => setCollapsed(false)}
        >
          <span className="side-panel__fab-icon" aria-hidden>
            ☰
          </span>
          <span className="side-panel__fab-label">Feed</span>
          {unseenCount > 0 && (
            <span className="side-panel__fab-badge" data-testid="feed-badge" aria-hidden>
              {unseenCount > 99 ? '99+' : String(unseenCount)}
            </span>
          )}
        </button>
      )}
    </>
  );
}
