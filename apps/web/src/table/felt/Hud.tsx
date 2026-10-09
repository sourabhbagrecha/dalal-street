import type { ReactNode } from 'react';
import { FeedButton } from '../chrome/FeedButton';
import { TableMenu } from '../chrome/TableMenu';
import { Ring, clock } from '../kit';
import { urgencyOf, useTimeoutEscalation } from '../live/useSecondsLeft';
import type { TableGame } from '../model';
import { cardName } from '../model';
import { money } from './style';

// ── HUD line ──
/**
 * `revealedWinnerId` — not `g.won` — decides when the top bar announces a win: `g.won` flips the instant
 * the server's projection says so, but the stage is still pacing out the winning card's own lay and its
 * "SET COMPLETE!" label (see `table/live/winReveal.ts`). Holding this line blank until the reveal is what
 * stops the top bar from announcing the winner before the viewer has seen the winning play land.
 */
function hudLine(g: TableGame, revealedWinnerId: string | null): string {
  const p = g.prompt;
  const targeting = p?.kind === 'target' ? p : null;
  const targetCard = targeting?.card ?? undefined;
  /** A spectator's anchor seat is just another player, so it can be the one acting or winning. */
  const seatOf = (id: string) => g.rivals.find((r) => r.id === id) ?? (g.spectating && g.me.id === id ? g.me : undefined);
  const actor = seatOf(g.turn);
  if (g.won) {
    if (!revealedWinnerId) return '';
    if (revealedWinnerId === g.me.id && !g.spectating) return 'You win!';
    return `${seatOf(revealedWinnerId)?.name ?? 'Someone'} wins`;
  }
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
  /** Extra HUD buttons, right of the built-in ones. */
  right?: ReactNode;
  /** `g.won`, held until the winning play's own animation has finished — see `hudLine`. */
  revealedWinnerId: string | null;
}
/** The strip over the table: the turn clock, what is going on (and the last thing that happened), the chat sheet and the menu. */
export function Hud({ g, wide, onWide, right, revealedWinnerId }: HudProps) {
  const last = g.feed[g.feed.length - 1];
  // One escalation source for the whole table: whichever clock is live (turn or a pending window) ticks and buzzes
  // from here, so a banner or tray showing the same seconds doesn't sound or buzz twice.
  useTimeoutEscalation(g.secs);
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
        <b>{hudLine(g, revealedWinnerId)}</b>
        <small>
          {last?.who && `${last.who} `}
          {last?.text}
          {/* A scene is holding the camera: the same tap-anywhere-on-stage that would zoom out moves it on instead. */}
          {g.skippable && ' · tap to skip'}
        </small>
      </span>
      {/* The stage's card flights are aria-hidden (purely visual); this is the same line the feed already shows, spoken
          once per play so a screen reader hears what happened without narrating every animation frame. */}
      <span className="tb-sr" role="status" aria-live="polite">
        {last?.who ? `${last.who} ${last.text}` : last?.text}
      </span>
      <FeedButton />
      <TableMenu wide={wide} onWide={onWide} />
      {right}
    </header>
  );
}
