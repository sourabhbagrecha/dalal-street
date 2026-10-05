import { useEffect, useState } from 'react';
import { CodeTiles } from './fields';
import { LobbyIcon } from './icons';
import type { RoomSeat } from './seatRing';

/** Copy to the clipboard, falling back to a hidden textarea where the async API needs a secure context (LAN dev over http). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    field.remove();
    return ok;
  }
}

export function inviteUrlFor(code: string): string {
  return typeof window !== 'undefined' ? `${window.location.origin}/rooms/${code}` : `/rooms/${code}`;
}

/** The QR sheet's module, fetched on first touch so the encoder never loads for players who don't use it. */
export const loadQrSheet = () => import('./QrSheet');
const preloadQr = () => void loadQrSheet();

/** Who else is already seated, in one line: "Kunal is at the table" / "Kunal and 2 others are at the table". */
function whoIsWaiting(seats: readonly RoomSeat[], viewerId: string | null): string | null {
  const others = seats.filter((s) => s.playerId !== viewerId);
  if (others.length === 0) return null;
  const [first, ...rest] = others;
  return rest.length === 0 ? `${first!.displayName} is at the table` : `${first!.displayName} and ${rest.length} other${rest.length === 1 ? '' : 's'} are at the table`;
}

/**
 * The room code as a plaque: big tiles to read out loud, the invite link to see, and the two ways to send it — the
 * phone's own share sheet (WhatsApp and friends) where there is one, and copy everywhere. When the room already
 * holds other seats (a host sharing the link, or a fresh joiner seeing the waiting room), names them so the invite
 * doubles as "here's who you'd be joining".
 */
export function InviteCard({
  code,
  seats = [],
  viewerId = null,
  onShowQr,
}: {
  code: string;
  seats?: readonly RoomSeat[];
  viewerId?: string | null;
  /** Shows the QR button when given; the page owns the sheet so it can sit over the whole stage. */
  onShowQr?(): void;
}) {
  const inviteUrl = inviteUrlFor(code);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const [copied, setCopied] = useState(false);
  const whoText = whoIsWaiting(seats, viewerId);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (await copyText(inviteUrl)) setCopied(true);
  };

  const share = async () => {
    try {
      await navigator.share({
        title: 'Lagaan',
        text: `Join my Lagaan table — room ${code}`,
        url: inviteUrl,
      });
    } catch {
      // Dismissing the share sheet rejects; nothing to do.
    }
  };

  return (
    <section className="lb-plaque" aria-label="Invite friends">
      <span className="lb-eyebrow">Room code</span>
      <CodeTiles code={code} testId="room-code" />
      {whoText && (
        <p className="lb-plaque__who" data-testid="invite-who">
          {whoText}
        </p>
      )}
      <code className="lb-invite" data-testid="invite-link">
        {inviteUrl}
      </code>
      <div className="lb-plaque__acts">
        <button type="button" className="lb-btn lb-btn--paper lb-btn--sm" onClick={() => void copy()}>
          <LobbyIcon name={copied ? 'check' : 'copy'} />
          <span aria-live="polite">{copied ? 'Copied!' : 'Copy'}</span>
        </button>
        {canShare && (
          <button type="button" className="lb-btn lb-btn--gold lb-btn--sm" onClick={() => void share()}>
            <LobbyIcon name="share" />
            Share
          </button>
        )}
        {onShowQr && (
          <button
            type="button"
            className="lb-btn lb-btn--paper lb-btn--sm lb-btn--icon"
            aria-label="Show QR code"
            data-testid="show-qr"
            onPointerDown={preloadQr}
            onClick={onShowQr}
          >
            <LobbyIcon name="qr" />
          </button>
        )}
      </div>
    </section>
  );
}
