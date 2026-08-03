export function ChatPanel() {
  return (
    <section className="chat-panel" aria-label="Chat">
      <span className="chat-panel__section-label">Table Chat</span>

      <div className="chat-panel__messages">
        <div className="chat-message chat-message--system">
          <span className="chat-message__avatar" aria-hidden>
            SY
          </span>
          <div>
            <span className="chat-message__author">System</span>
            <p className="chat-message__text">Welcome to Monopoly Deal!</p>
          </div>
        </div>
        <div className="chat-message">
          <span className="chat-message__avatar" aria-hidden>
            PR
          </span>
          <div>
            <span className="chat-message__author">Priya</span>
            <p className="chat-message__text">Good luck everyone 🎲</p>
          </div>
        </div>
      </div>

      <div className="chat-panel__input-row">
        <input
          type="text"
          className="chat-panel__input"
          placeholder="Say something…"
          disabled
          aria-label="Chat message"
        />
        <button type="button" className="chat-panel__send" disabled>
          SEND
        </button>
      </div>
    </section>
  );
}
