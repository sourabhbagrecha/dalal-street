import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@monopoly-deal/shared';
import { CHAT_MESSAGE_MAX_LEN } from '@monopoly-deal/shared';
import { useStoreActions, useStoreSnapshot } from '../store';

function chatInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || '?';
}

function ChatMessageRow({
  message,
  isYou,
}: {
  message: ChatMessage;
  isYou: boolean;
}) {
  return (
    <div className={`chat-message${isYou ? ' chat-message--you' : ''}`}>
      <span className="chat-message__avatar avatar" aria-hidden>
        {chatInitials(message.displayName)}
      </span>
      <div>
        <p className="chat-message__text">{message.text}</p>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const snapshot = useStoreSnapshot();
  const { sendChat } = useStoreActions();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  const online = snapshot.mode === 'network' && Boolean(snapshot.roomCode && snapshot.playerToken);
  const messages = snapshot.chatMessages;

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || !online || !sendChat || sending) return;

    setSending(true);
    const result = await sendChat(text);
    setSending(false);
    if (result.ok) {
      setDraft('');
    }
  };

  return (
    <section className="chat-panel" aria-label="Chat">
      <span className="chat-panel__section-label">Table Chat</span>

      <div className="chat-panel__messages" ref={messagesRef}>
        {messages.length === 0 ? (
          <div className="chat-message chat-message--system">
            <span className="chat-message__avatar avatar" aria-hidden>
              SY
            </span>
            <div>
              <p className="chat-message__text">
                {online
                  ? 'Say hello to everyone at the table.'
                  : 'Chat is available in online games.'}
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessageRow
              key={message.id}
              message={message}
              isYou={message.playerId === snapshot.playerId}
            />
          ))
        )}
      </div>

      <div className="chat-panel__input-row">
        <input
          type="text"
          className="chat-panel__input"
          placeholder={online ? 'Say something…' : 'Online games only'}
          disabled={!online || sending}
          aria-label="Chat message"
          maxLength={CHAT_MESSAGE_MAX_LEN}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          data-testid="chat-input"
        />
        <button
          type="button"
          className="chat-panel__send"
          disabled={!online || sending || !draft.trim()}
          onClick={() => void submit()}
          data-testid="chat-send-btn"
        >
          SEND
        </button>
      </div>
    </section>
  );
}
