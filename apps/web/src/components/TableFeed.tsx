import type { ClientGameState } from '@monopoly-deal/shared';
import { humanizePlayerIds } from '../derivations';
import { useCurrency } from '../hooks/useCurrency';
import type { LogEntry } from '../store';
import { formatEventMessage } from '../store/eventText';

interface TableFeedProps {
  entries: LogEntry[];
  clientState: ClientGameState;
}

function localizeCurrency(message: string, formatMoney: (n: number) => string): string {
  // Server emits ₹Cr (Indian default) and legacy $M — normalize to current selection.
  return message
    .replace(/₹(\d+)Cr/g, (_, n) => formatMoney(Number(n)))
    .replace(/\$(\d+)M/g, (_, n) => formatMoney(Number(n)));
}

export function TableFeed({ entries, clientState }: TableFeedProps) {
  const { code, setCurrency, formatMoney } = useCurrency();
  return (
    <section className="table-feed" aria-label="Table feed">
      <div className="table-feed__header">
        <span className="table-feed__section-label">Game Log</span>
        <div
          className="table-feed__currency-toggle"
          role="group"
          aria-label="Currency"
          data-testid="currency-toggle"
        >
          <button
            type="button"
            className={`currency-toggle__btn${code === 'INR' ? ' currency-toggle__btn--active' : ''}`}
            aria-pressed={code === 'INR'}
            data-testid="currency-INR"
            onClick={() => setCurrency('INR')}
          >
            ₹ Cr
          </button>
          <button
            type="button"
            className={`currency-toggle__btn${code === 'USD' ? ' currency-toggle__btn--active' : ''}`}
            aria-pressed={code === 'USD'}
            data-testid="currency-USD"
            onClick={() => setCurrency('USD')}
          >
            $ M
          </button>
        </div>
      </div>
      <ul className="table-feed__list" data-testid="table-feed">
        {entries.map((entry) => {
          const localized =
            formatEventMessage(clientState, formatMoney, entry) ??
            localizeCurrency(humanizePlayerIds(clientState, entry.message), formatMoney);
          return (
            <li
              key={entry.id}
              className="table-feed__entry"
              data-testid="log-entry"
              data-log-type={entry.type}
            >
              <span className="table-feed__dot" aria-hidden />
              <span className="table-feed__message">{localized}</span>
              <span className="table-feed__time">{entry.at}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
