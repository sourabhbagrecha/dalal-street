import type { CSSProperties } from 'react';
import { initialsFromName } from '../components/PlayerAvatar';
import { LobbyIcon } from './icons';
import { MAX_SEATS, RING, orderSeats } from './seatRing';
import type { RoomSeat } from './seatRing';

/**
 * The waiting room's table: a felt oval with a chair for each of the five possible players, you at the bottom, everyone
 * in the colour the game table will give them. Open chairs stay drawn (dashed) so the room reads as "who's missing".
 * The `<ul>` is the seat list — one `<li>` per seated player, nothing else — laid out by absolute position on the
 * felt; the open chairs are a decorative layer beside it.
 */
export function SeatTable({ seats, viewerId }: { seats: readonly RoomSeat[]; viewerId: string | null }) {
  const placed = orderSeats(seats, viewerId);
  const firstOpen = placed.findIndex((p) => p.seat === null);
  const n = seats.length;

  return (
    <div className="lb-felt">
      <div className="lb-felt__ring" aria-hidden>
        {placed.map((p) => {
          if (p.seat) return null;
          const at = RING[p.slot]!;
          return (
            <div
              key={`open-${p.slot}`}
              className="lb-seat lb-seat--open"
              data-next={p.slot === firstOpen}
              style={{ '--x': `${at.x}%`, '--y': `${at.y}%` } as CSSProperties}
            >
              <span className="lb-coin lb-coin--open">
                <LobbyIcon name="plus" />
              </span>
              <span className="lb-seat__name">Open seat</span>
            </div>
          );
        })}
      </div>

      <ul className="lb-felt__ring" data-testid="seat-list">
        {placed.map((p) => {
          if (!p.seat) return null;
          const at = RING[p.slot]!;
          const pos = { '--x': `${at.x}%`, '--y': `${at.y}%` } as CSSProperties;
          const { seat } = p;
          return (
            <li
              key={seat.playerId}
              className={`lb-seat${p.you ? ' lb-seat--you' : ''}`}
              data-away={!seat.connected}
              style={{ ...pos, '--seat': p.color, '--seat-ink': p.ink } as CSSProperties}
            >
              <span className="lb-coin lb-coin--lg" aria-hidden>
                {initialsFromName(seat.displayName)}
                {seat.isHost && (
                  <span className="lb-crown" title="Host">
                    <LobbyIcon name="crown" />
                  </span>
                )}
              </span>
              <span className="lb-seat__name">
                {seat.displayName}
                {seat.isHost && <span className="lb-sr"> (host)</span>}
                {p.you && <span className="lb-sr"> (you)</span>}
              </span>
              {p.you && (
                <span className="lb-seat__tag" aria-hidden>
                  You
                </span>
              )}
              {!seat.connected && <span className="lb-seat__tag lb-seat__tag--away">Disconnected</span>}
            </li>
          );
        })}
      </ul>

      <div className="lb-felt__mid">
        <div className="lb-deck" aria-hidden>
          {[0, 1, 2].map((k) => (
            <i key={k} style={{ '--k': k } as CSSProperties} />
          ))}
          <b>₹</b>
        </div>
        <span className="lb-felt__count">
          <b>{n}</b> of {MAX_SEATS} seated
        </span>
      </div>
    </div>
  );
}
