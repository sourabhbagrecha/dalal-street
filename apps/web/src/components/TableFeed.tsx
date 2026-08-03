import type { LogEntry } from '../derivations';

interface TableFeedProps {
  entries: LogEntry[];
}

export function TableFeed({ entries }: TableFeedProps) {
  return (
    <section className="table-feed" aria-label="Table feed">
      <header className="side-panel__header">
        <h2 className="side-panel__title">Table Feed</h2>
      </header>
      <ul className="table-feed__list">
        {entries.map((entry, i) => (
          <li key={`${entry.type}-${i}`} className="table-feed__entry">
            <span className="table-feed__time">{entry.at}</span>
            <span className="table-feed__message">{entry.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
