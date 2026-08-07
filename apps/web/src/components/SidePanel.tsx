import { useState } from 'react';
import type { ClientGameState } from '@monopoly-deal/shared';
import type { LogEntry } from '../store';
import { TableFeed } from './TableFeed';
import { ChatPanel } from './ChatPanel';

interface SidePanelProps {
  entries: LogEntry[];
  clientState: ClientGameState;
}

const MOBILE_DRAWER_BREAKPOINT = 700;

export function SidePanel({ entries, clientState }: SidePanelProps) {
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_DRAWER_BREAKPOINT,
  );

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
