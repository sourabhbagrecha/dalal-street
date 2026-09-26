import { useEffect, useState } from 'react';
import { CodeTiles } from './fields';
import { LobbyIcon } from './icons';

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

/**
 * The room code as a plaque: big tiles to read out loud, the invite link to see, and the two ways to send it — the
 * phone's own share sheet (WhatsApp and friends) where there is one, and copy everywhere.
 */
export function InviteCard({ code }: { code: string }) {
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/rooms/${code}` : `/rooms/${code}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const [copied, setCopied] = useState(false);

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
        title: 'Monopoly Deal',
        text: `Join my Monopoly Deal table — room ${code}`,
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
      <code className="lb-invite" data-testid="invite-link">
        {inviteUrl}
      </code>
      <div className="lb-plaque__acts">
        <button type="button" className="lb-btn lb-btn--paper lb-btn--sm" onClick={() => void copy()}>
          <LobbyIcon name={copied ? 'check' : 'copy'} />
          <span aria-live="polite">{copied ? 'Copied!' : 'Copy link'}</span>
        </button>
        {canShare && (
          <button type="button" className="lb-btn lb-btn--gold lb-btn--sm" onClick={() => void share()}>
            <LobbyIcon name="share" />
            Invite friends
          </button>
        )}
      </div>
    </section>
  );
}
