import type { ReactNode } from 'react';
import { FeedButton } from '../chrome/FeedButton';
import { Icon, Ring, clock } from '../kit';
import type { TableGame } from '../model';
import { cardName } from '../model';
import { money } from './style';

// ── HUD line ──
function hudLine(g: TableGame): string {
  const p = g.prompt;
  const targeting = p?.kind === 'target' ? p : null;
  const targetCard = targeting?.card ?? undefined;
  const actor = g.rivals.find((r) => r.id === g.turn);
  if (g.won) return g.won === g.me.id ? 'You win!' : `${g.rivals.find((r) => r.id === g.won)?.name ?? 'Someone'} wins`;
  if (p?.kind === 'pay') return `${g.rivals.find((r) => r.id === p.toId)?.name} wants ${money(p.amount)}`;
  if (p?.kind === 'jsn') return `${g.rivals.find((r) => r.id === p.fromId)?.name} · ${p.label}!`;
  if (targeting) return `Playing ${targetCard ? cardName(targetCard) : 'a card'}`;
  if (p?.kind === 'discard') return `Hand limit — discard ${p.excess}`;
  if (g.wait) return g.wait;
  if (g.phase === 'draw') return 'Your turn — draw 2';
  if (g.phase === 'rivals') return `${actor?.name ?? ''} is ${actor && !actor.connected ? 'away' : 'playing'}`;
  return g.plays === 0 ? 'No plays left' : `Your turn · ${g.plays} play${g.plays === 1 ? '' : 's'} left`;
}

interface HudProps {
  g: TableGame;
  /** The camera shows the whole table. */
  whole: boolean;
  /** Toggles between the whole table and your seat. */
  onWhole(): void;
  /** Extra HUD buttons, right of the built-in ones. */
  right?: ReactNode;
}
/** The strip over the table: the turn clock, what is going on (and the last thing that happened), the feed and the whole-table toggle. */
export function Hud({ g, whole, onWhole, right }: HudProps) {
  const last = g.feed[g.feed.length - 1];
  return (
    <header className="tb-hud">
      <Ring value={g.secs === null ? 0 : g.secs / g.maxSecs} size={40} stroke={4} color={(g.secs ?? 99) <= 10 ? '#ff6b57' : '#f2c14e'} track="#ffffff22">
        <span className="tb-hud__t">{g.secs === null ? '—' : clock(g.secs)}</span>
      </Ring>
      <span className="tb-hud__line" data-testid="turn-banner" data-turn-id={g.turn}>
        <b>{hudLine(g)}</b>
        <small>
          {last?.who && `${last.who} `}
          {last?.text}
        </small>
      </span>
      <FeedButton />
      <button type="button" className="tb-hud__btn" data-on={whole} onClick={onWhole} aria-label="See the whole table" aria-pressed={whole}>
        <Icon name="menu" />
      </button>
      {right}
    </header>
  );
}
