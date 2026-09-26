import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CHAT_MESSAGE_MAX_LEN } from '@monopoly-deal/shared';
import type { ChatMessage } from '@monopoly-deal/shared';
import { useCurrency } from '../../hooks/useCurrency';
import { soundEngine } from '../../sound/soundEngine';
import { Icon } from '../kit';
import { useChrome } from './context';
import type { ChatPort, ChromeValue, SheetTab } from './context';
import { localizeCurrency } from './rows';
import type { FeedRow } from './rows';
import '../../styles/gl-chrome.css';

/** The bottom sheet behind the HUD's chat button: the game feed, table chat and (in /demo) the dev drawer. */

const TAB_LABEL: Record<SheetTab, string> = { feed: 'Feed', chat: 'Chat', dev: 'Dev' };

/** How far the on-screen keyboard covers the bottom of the layout viewport, while a field in the sheet has focus. */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) {
      setInset(0);
      return;
    }
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setInset(0);
    };
  }, [active]);
  return inset;
}

function SoundButton() {
  const muted = useSyncExternalStore(
    (listener) => soundEngine.subscribe(listener),
    () => soundEngine.getMuted(),
  );
  return (
    <button
      type="button"
      className="cx-icon-btn cx-sound"
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      aria-pressed={muted}
      data-testid="sound-toggle"
      onClick={() => soundEngine.toggleMuted()}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
        <path d="M4 9.5v5h3.6l4.9 3.9V5.6L7.6 9.5z" fill="currentColor" />
        {muted ? (
          <path d="m16 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M15.8 9a4.2 4.2 0 0 1 0 6m2.6-8.6a7.8 7.8 0 0 1 0 11.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        )}
      </svg>
    </button>
  );
}

function CurrencyToggle() {
  const { code, setCurrency } = useCurrency();
  return (
    <div className="cx-currency" role="group" aria-label="Currency" data-testid="currency-toggle">
      <button type="button" aria-pressed={code === 'INR'} data-testid="currency-INR" onClick={() => setCurrency('INR')}>
        ₹ Cr
      </button>
      <button type="button" aria-pressed={code === 'USD'} data-testid="currency-USD" onClick={() => setCurrency('USD')}>
        $ M
      </button>
    </div>
  );
}

function FeedPanel({ rows, hidden }: { rows: FeedRow[]; hidden: boolean }) {
  const { formatMoney } = useCurrency();
  return (
    <section className="cx-panel cx-feed" role="tabpanel" aria-label="Game log" hidden={hidden}>
      <div className="cx-feed__bar">
        <span>Game log</span>
        <CurrencyToggle />
      </div>
      <ul className="cx-feed__list" data-testid="table-feed">
        {rows.length === 0 && <li className="cx-feed__empty">Nothing has happened yet.</li>}
        {[...rows].reverse().map((r) => (
          <li
            key={r.id}
            className="cx-feed__row"
            data-testid="log-entry"
            data-log-type={r.type}
            data-moment={r.moment ? 'true' : undefined}
            data-mine={r.mine ? 'true' : undefined}
            data-tone={r.tone}
          >
            <span className="cx-feed__dot" aria-hidden />
            <span className="cx-feed__msg">{localizeCurrency(r.text, formatMoney)}</span>
            {r.at && <span className="cx-feed__time">{r.at}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

function ChatLine({ m, mine }: { m: ChatMessage; mine: boolean }) {
  return (
    <div className="cx-msg" data-mine={mine}>
      <span className="cx-msg__av" aria-hidden>
        {initials(m.displayName)}
      </span>
      <div className="cx-msg__bubble">
        {!mine && <b>{m.displayName}</b>}
        <p>{m.text}</p>
      </div>
    </div>
  );
}

function ChatPanel({ chat, hidden }: { chat: ChatPort; hidden: boolean }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Newest at the bottom, and back to it whenever a line lands or the tab is opened.
  useEffect(() => {
    const el = listRef.current;
    if (el && !hidden) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, hidden]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || !chat.online || sending) return;
    setSending(true);
    const result = await chat.send(text);
    setSending(false);
    if (result.ok) setDraft('');
  };

  return (
    <section className="cx-panel cx-chat" role="tabpanel" aria-label="Table chat" hidden={hidden}>
      <div className="cx-chat__list" ref={listRef}>
        {chat.messages.length === 0 ? (
          <p className="cx-chat__empty">{chat.online ? 'Say hello to everyone at the table.' : 'Chat is available in online games.'}</p>
        ) : (
          chat.messages.map((m) => <ChatLine key={m.id} m={m} mine={m.playerId === chat.selfId} />)
        )}
      </div>
      <div className="cx-chat__row">
        <input
          type="text"
          placeholder={chat.online ? 'Say something…' : 'Online games only'}
          disabled={!chat.online || sending}
          aria-label="Chat message"
          maxLength={CHAT_MESSAGE_MAX_LEN}
          value={draft}
          enterKeyHint="send"
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          data-testid="chat-input"
        />
        <button type="button" disabled={!chat.online || sending || !draft.trim()} onClick={() => void submit()} data-testid="chat-send-btn">
          SEND
        </button>
      </div>
    </section>
  );
}

function tabsOf(c: ChromeValue): SheetTab[] {
  const tabs: SheetTab[] = ['feed'];
  if (c.chat) tabs.push('chat');
  if (c.dev) tabs.push('dev');
  return tabs;
}

export function FeedSheet() {
  const c = useChrome();
  const [typing, setTyping] = useState(false);
  const kb = useKeyboardInset(!!c?.open && typing);
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const open = !!c?.open;
  const close = c?.closeSheet;

  // Escape closes; focus goes into the sheet and comes back to what opened it.
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true });
    };
  }, [open, close]);

  if (!c) return null;
  const tabs = tabsOf(c);
  const roomCode = c.net?.roomCode;

  const body: ReactNode = (
    <>
      <FeedPanel rows={c.feed} hidden={c.tab !== 'feed'} />
      {c.chat && <ChatPanel chat={c.chat} hidden={c.tab !== 'chat'} />}
      {c.dev && (
        <section className="cx-panel cx-dev" role="tabpanel" aria-label="Dev controls" hidden={c.tab !== 'dev'}>
          {c.dev}
        </section>
      )}
    </>
  );

  return (
    <div className="cx-sheet" data-open={open} data-typing={typing && kb > 0} role="dialog" aria-modal="true" aria-label="Table feed" aria-hidden={!open} inert={!open}>
      <div className="cx-sheet__scrim" onClick={c.closeSheet} />
      <div
        className="cx-sheet__panel"
        style={{ '--kb': `${kb}px` } as CSSProperties}
        onFocusCapture={(e) => setTyping(e.target instanceof HTMLInputElement)}
        onBlurCapture={() => setTyping(false)}
      >
        <header className="cx-sheet__head">
          <span className="cx-sheet__grip" aria-hidden />
          {roomCode ? (
            <span className="cx-room" data-testid="room-chip">
              <small>ROOM</small>
              <b>{roomCode}</b>
            </span>
          ) : (
            <span className="cx-room cx-room--plain">
              <b>Table</b>
            </span>
          )}
          <span className="cx-sheet__acts">
            <SoundButton />
            {roomCode && (
              <Link to="/" className="cx-lobby" onClick={c.closeSheet}>
                Lobby
              </Link>
            )}
            <button ref={closeRef} type="button" className="cx-icon-btn" aria-label="Collapse table feed" onClick={c.closeSheet}>
              <Icon name="x" />
            </button>
          </span>
        </header>
        {tabs.length > 1 && (
          <div className="cx-tabs" role="tablist" aria-label="Feed sections">
            {tabs.map((t) => {
              const n = t === 'feed' ? c.unread.feed : t === 'chat' ? c.unread.chat : 0;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={c.tab === t}
                  data-testid={`feed-tab-${t}`}
                  onClick={() => c.setTab(t)}
                >
                  {TAB_LABEL[t]}
                  {n > 0 && c.tab !== t && <i aria-label={`${n} unread`}>{n > 99 ? '99+' : n}</i>}
                </button>
              );
            })}
          </div>
        )}
        <div className="cx-sheet__body">{body}</div>
      </div>
    </div>
  );
}
