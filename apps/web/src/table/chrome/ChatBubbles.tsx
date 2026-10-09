import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { useChrome } from './context';
import type { ChatPort } from './context';

/**
 * A chat message floats up over the sending player's seat on the table itself, in addition to (not instead of)
 * the feed sheet's Chat tab — so a line lands where it happened even with the sheet closed. Pure presentation:
 * this never sends anything, it only watches `chat.messages` (already flowing through the ordinary chat/outbox
 * path) for lines that have not been shown yet. Absent wherever there is no chat port (offline /demo).
 */

const vars = (o: Record<string, string | number>) => o as CSSProperties;

/** How long one bubble stays over a seat, entrance to fade. Matches `cb-rise` in gl-chat-bubbles.css. */
const LIFETIME_MS = 5200;
/** A bubble is a quick call-out, not a transcript — the full line is always still in the Chat tab. */
const MAX_CHARS = 90;
/** Beyond this many bubbles in the air, the oldest makes room. */
const MAX_BUBBLES = 6;

interface Bubble {
  key: number;
  playerId: string;
  text: string;
  x: number;
  y: number;
  /** A spectator's line: hangs under the chat button, with their name, instead of rising over a seat. */
  from?: string;
}

interface ChatBubblesProps {
  /** The table's frame (`.tb`): bubbles are placed in its coordinates, over `.tb-world [data-seat]`. */
  root: RefObject<HTMLElement | null>;
}

export function ChatBubbles(props: ChatBubblesProps) {
  const chat = useChrome()?.chat;
  if (!chat) return null;
  return <ChatBubblesLive {...props} chat={chat} />;
}

function ChatBubblesLive({ root, chat }: ChatBubblesProps & { chat: ChatPort }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const nextKey = useRef(1);
  const timers = useRef(new Set<number>());
  // Whatever is already in the log the moment this mounts (a reconnect's resent history, or simply an ongoing
  // game) is not replayed as bubbles — only lines that arrive from here on are "fresh".
  const seenId = useRef<number | null>(null);

  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const t of live) window.clearTimeout(t);
      live.clear();
    };
  }, []);

  useEffect(() => {
    const last = seenId.current;
    const newest = chat.messages.length > 0 ? chat.messages[chat.messages.length - 1]!.id : 0;
    if (last === null) {
      seenId.current = newest;
      return;
    }
    if (newest === last) return;
    const fresh = chat.messages.filter((m) => m.id > last);
    seenId.current = newest;
    const frame = root.current;
    if (!frame) return;
    const f = frame.getBoundingClientRect();
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
    for (const m of fresh) {
      if (m.spectator) {
        const btn = frame.querySelector<HTMLElement>('.tb-hud .cx-hud-btn');
        if (!btn) continue;
        const r = btn.getBoundingClientRect();
        const key = nextKey.current++;
        setBubbles((prev) => {
          const b: Bubble = {
            key,
            playerId: m.playerId,
            from: m.displayName,
            text: m.text.length > MAX_CHARS ? `${m.text.slice(0, MAX_CHARS - 1)}…` : m.text,
            x: Math.max(r.right - f.left, 120),
            y: r.bottom - f.top + 12,
          };
          return [...prev, b].slice(-MAX_BUBBLES);
        });
        const t = window.setTimeout(() => {
          timers.current.delete(t);
          setBubbles((prev) => prev.filter((b) => b.key !== key));
        }, LIFETIME_MS);
        timers.current.add(t);
        continue;
      }
      const seat = frame.querySelector<HTMLElement>(`.tb-world [data-seat="${CSS.escape(m.playerId)}"]`);
      if (!seat) continue;
      const r = seat.getBoundingClientRect();
      const key = nextKey.current++;
      setBubbles((prev) => {
        // A seat that just spoke again while its last line is still up fans them out rather than stacking them.
        const mine = prev.filter((b) => b.playerId === m.playerId).length;
        const b: Bubble = {
          key,
          playerId: m.playerId,
          text: m.text.length > MAX_CHARS ? `${m.text.slice(0, MAX_CHARS - 1)}…` : m.text,
          x: clamp(r.left + r.width / 2, f.left + 76, f.right - 76) - f.left + [0, 30, -30][mine % 3]!,
          y: clamp(r.top + Math.min(r.height / 2, 56), f.top + 40, f.bottom - 90) - f.top,
        };
        return [...prev, b].slice(-MAX_BUBBLES);
      });
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        setBubbles((prev) => prev.filter((b) => b.key !== key));
      }, LIFETIME_MS);
      timers.current.add(t);
    }
  }, [chat.messages, root]);

  return (
    <div className="cb-layer" aria-hidden>
      {bubbles.map((b) => (
        <div key={b.key} className="cb-bubble" data-from={b.from ? 'spectator' : undefined} data-testid={`chat-bubble-${b.playerId}`} style={vars({ left: b.x, top: b.y })}>
          <p>
            {b.from && <b>{b.from}</b>}
            {b.text}
          </p>
        </div>
      ))}
    </div>
  );
}
