import { FeedButton } from './FeedButton';
import { ChromeOverlays } from './ChromeOverlays';
import '../../styles/gl-chrome.css';
import '../../styles/gl-shell.css';

/**
 * The table's stand-in until the first projection lands. Same shell as the table, so nothing jumps when it swaps in,
 * and the feed sheet stays reachable: /demo's dev drawer must work while a scenario is still being dealt.
 */
export function TableLoading({ label, exit }: { label: string; exit?: { label: string; onClick(): void } }) {
  return (
    <div className="gl">
      <div className="gl__stage">
        <div className="gl__phone">
          <div className="cx-loading" data-testid="table-loading">
            <header className="cx-loading__bar">
              <FeedButton />
            </header>
            {exit ? (
              // Nothing is coming (a finished game sends no projection): say so and offer the way out, instead of a spinner.
              <div className="cx-loading__end" role="status" data-testid="table-ended">
                <p>{label}</p>
                <button type="button" className="cx-loading__exit" data-testid="table-ended-exit" onClick={exit.onClick}>
                  {exit.label}
                </button>
              </div>
            ) : (
              <p role="status" aria-live="polite">
                <span className="cx-loading__spin" aria-hidden />
                {label}
              </p>
            )}
          </div>
          <ChromeOverlays />
        </div>
      </div>
    </div>
  );
}
