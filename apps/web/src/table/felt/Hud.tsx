import type { ReactNode } from 'react';
import { FeedButton } from '../chrome/FeedButton';
import { Icon, Ring, clock } from '../kit';
import { urgencyOf, useTimeoutVibration } from '../live/useSecondsLeft';
import type { TableGame } from '../model';
import { cardName } from '../model';
import type { HandSortMode } from './handSort';
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
  /** The camera keeps the whole table in view through the rivals' turns. */
  wide: boolean;
  /** Toggles between following each turn and keeping the whole table in view. */
  onWide(): void;
  /** 'dealt' (the server's own order) or 'grouped' (money, then properties by colour, wilds, rent, actions) — a
   * purely local view, so a wide hand is still easy to scan while waiting out someone else's turn. */
  sort: HandSortMode;
  onSort(): void;
  /** Extra HUD buttons, right of the built-in ones. */
  right?: ReactNode;
}
/** The strip over the table: the turn clock, what is going on (and the last thing that happened), the feed and the zoom toggle. */
export function Hud({ g, wide, onWide, sort, onSort, right }: HudProps) {
  const last = g.feed[g.feed.length - 1];
  // One vibration source for the whole table: whichever clock is live (turn or a pending window) escalates from here,
  // so a banner or tray showing the same seconds doesn't buzz the phone twice.
  useTimeoutVibration(g.secs);
  const urgency = urgencyOf(g.secs);
  return (
    <header className="tb-hud">
      <Ring
        value={g.secs === null ? 0 : g.secs / g.maxSecs}
        size={40}
        stroke={4}
        color={(g.secs ?? 99) <= 10 ? '#ff6b57' : '#f2c14e'}
        track="#ffffff22"
        className={urgency ? `tb-hud__ring--${urgency}` : ''}
      >
        <span className="tb-hud__t">{g.secs === null ? '—' : clock(g.secs)}</span>
      </Ring>
      <span className="tb-hud__line" data-testid="turn-banner" data-turn-id={g.turn}>
        <b>{hudLine(g)}</b>
        <small>
          {last?.who && `${last.who} `}
          {last?.text}
          {/* A scene is holding the camera: the same tap-anywhere-on-stage that would zoom out moves it on instead. */}
          {g.skippable && ' · tap to skip'}
        </small>
      </span>
      <FeedButton />
      <button
        type="button"
        className="tb-hud__btn"
        data-on={sort === 'grouped'}
        onClick={onSort}
        aria-label={sort === 'grouped' ? 'Show hand as dealt' : 'Group hand by kind'}
        aria-pressed={sort === 'grouped'}
        data-testid="hand-sort-btn"
      >
        <Icon name="swap" />
      </button>
      <button type="button" className="tb-hud__btn" data-on={wide} onClick={onWide} aria-label="See the whole table" aria-pressed={wide}>
        <Icon name={wide ? 'zoomIn' : 'zoomOut'} />
      </button>
      {right}
    </header>
  );
}
