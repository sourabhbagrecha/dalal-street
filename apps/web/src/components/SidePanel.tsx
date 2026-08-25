import { useEffect, useState, type ReactNode } from 'react';
import type { ClientGameState } from '@monopoly-deal/shared';
import type { LogEntry } from '../store';
import { useIsPhoneBoard } from '../hooks/useIsPhoneBoard';
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
  /*
   * Player-facing local-only controls (currently just "New game"). Rendered
   * unconditionally — unlike devControls, this must stay visible even when
   * the dev block above it is hidden from ordinary players.
   */
  localControls?: ReactNode;
}

export function SidePanel({ entries, clientState, devControls, localControls }: SidePanelProps) {
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
            {localControls && <div className="side-panel__local">{localControls}</div>}
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
          {entries.length > 0 && (
            <span className="side-panel__fab-badge" aria-hidden>
              {entries.length > 99 ? '99+' : String(entries.length)}
            </span>
          )}
        </button>
      )}
    </>
  );
}
