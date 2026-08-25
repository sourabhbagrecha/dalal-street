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

  /*
   * FIX 2 / C10 & E7: the badge used to just be `entries.length` — a lifetime
   * total that only ever grows (it reached 52 in one short session with no
   * meaning left). `LogEntry.id`s are assigned from a module-level counter
   * that only ever increases (see `logUtils.ts`), so "everything with an id
   * past the last one I actually saw" is a real unread count. Marking
   * everything seen the moment the drawer is open — not just on the tap that
   * opened it — means a fresh entry that arrives while it's already open
   * never gets counted either.
   */
  const latestEntryId = entries.length > 0 ? entries[entries.length - 1]!.id : 0;
  const [lastSeenId, setLastSeenId] = useState(latestEntryId);
  useEffect(() => {
    if (!collapsed) setLastSeenId(latestEntryId);
  }, [collapsed, latestEntryId]);
  const unseenCount = collapsed ? entries.filter((e) => e.id > lastSeenId).length : 0;

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
          {unseenCount > 0 && (
            <span className="side-panel__fab-badge" aria-hidden>
              {unseenCount > 99 ? '99+' : String(unseenCount)}
            </span>
          )}
        </button>
      )}
    </>
  );
}
