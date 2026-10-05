import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CHAT_MESSAGE_MAX_LEN } from '@monopoly-deal/shared';
import type { ChatMessage } from '@monopoly-deal/shared';
import { useCurrency } from '../../hooks/useCurrency';
import { Icon } from '../kit';
import { useChrome } from './context';
import type { ChatPort, ChromeValue, SheetTab } from './context';
import { localizeCurrency } from './rows';
import type { FeedRow } from './rows';

/** The bottom sheet behind the HUD's chat button: table chat, the game log and (in /demo) the dev drawer. Settings, rules and Leave live in the HUD menu (TableMenu). */

const TAB_LABEL: Record<SheetTab, string> = { feed: 'Log', chat: 'Chat', dev: 'Dev' };

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

function FeedPanel({ rows, hidden }: { rows: FeedRow[]; hidden: boolean }) {
  const { formatMoney } = useCurrency();
  return (
    <section className="cx-panel cx-feed" role="tabpanel" aria-label="Game log" hidden={hidden}>
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

/** A handful of one-tap lines for the moment someone doesn't want to stop and type — thumbs-up, ribbing, and one
 * that names the game's own flavour of property. Sent exactly like anything typed into the input below. */
const QUICK_PHRASES = ['Nice one!', 'Not my Jaipur!', 'Ouch!', 'Good game!'];

function ChatPanel({ chat, hidden }: { chat: ChatPort; hidden: boolean }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Newest at the bottom, and back to it whenever a line lands or the tab is opened.
  useEffect(() => {
    const el = listRef.current;
    if (el && !hidden) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, hidden]);

  const send = async (text: string) => {
    if (!text || !chat.online || sending) return;
    setSending(true);
    const result = await chat.send(text);
    setSending(false);
    if (result.ok) setDraft('');
  };
  const submit = () => send(draft.trim());

  return (
    <section className="cx-panel cx-chat" role="tabpanel" aria-label="Table chat" hidden={hidden}>
      <div className="cx-chat__list" ref={listRef}>
        {chat.messages.length === 0 ? (
          <p className="cx-chat__empty">{chat.online ? 'Say hello to everyone at the table.' : 'Chat is available in online games.'}</p>
        ) : (
          chat.messages.map((m) => <ChatLine key={m.id} m={m} mine={m.playerId === chat.selfId} />)
        )}
      </div>
      <div className="cx-chat__quick" role="group" aria-label="Quick messages">
        {QUICK_PHRASES.map((text) => (
          <button key={text} type="button" disabled={!chat.online || sending} onClick={() => void send(text)} data-testid={`chat-quick-${text}`}>
            {text}
          </button>
        ))}
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
  const tabs: SheetTab[] = [];
  if (c.chat) tabs.push('chat');
  tabs.push('feed');
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
    <div className="cx-sheet" data-open={open} data-typing={typing && kb > 0} role="dialog" aria-modal="true" aria-label="Chat and game log" aria-hidden={!open} inert={!open}>
      <div className="cx-sheet__scrim" onClick={c.closeSheet} />
      <div
        className="cx-sheet__panel"
        style={{ '--kb': `${kb}px` } as CSSProperties}
        onFocusCapture={(e) => setTyping(e.target instanceof HTMLInputElement)}
        onBlurCapture={() => setTyping(false)}
      >
        <header className="cx-sheet__head">
          <button ref={closeRef} type="button" className="cx-sheet__grip" aria-label="Close chat and game log" onClick={c.closeSheet} />
          <span className="cx-room cx-room--plain">
            <b>{c.chat ? 'Table talk' : 'Table'}</b>
          </span>
          <button type="button" className="cx-icon-btn cx-sheet__close" aria-label="Close" onClick={c.closeSheet}>
            <Icon name="x" size={18} />
          </button>
        </header>
        {tabs.length > 1 && (
          <div className="cx-tabs" role="tablist" aria-label="Chat sections">
            {tabs.map((t) => {
              const n = t === 'chat' ? c.unread : 0;
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
