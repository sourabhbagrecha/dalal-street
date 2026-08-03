import type { LogEntry } from '../store';

interface TableFeedProps {
  entries: LogEntry[];
}

export function TableFeed({ entries }: TableFeedProps) {
  return (
    <section className="table-feed" aria-label="Table feed">
      <header className="side-panel__header">
        <h2 className="side-panel__title">Table Feed</h2>
        <button type="button" className="side-panel__collapse" aria-label="Collapse table feed">
          ›
        </button>
      </header>
      <span className="table-feed__section-label">Game Log</span>
      <ul className="table-feed__list" data-testid="table-feed">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="table-feed__entry"
            data-testid="log-entry"
            data-log-type={entry.type}
          >
            <span className="table-feed__dot" aria-hidden />
            <span className="table-feed__message">{entry.message}</span>
            <span className="table-feed__time">{entry.at}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
