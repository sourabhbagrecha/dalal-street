export function ChatPanel() {
  return (
    <section className="chat-panel" aria-label="Chat">
      <header className="side-panel__header">
        <h2 className="side-panel__title">Chat</h2>
      </header>

      <div className="chat-panel__messages">
        <div className="chat-message chat-message--system">
          <span className="chat-message__author">System</span>
          <p className="chat-message__text">Welcome to Monopoly Deal!</p>
        </div>
        <div className="chat-message">
          <span className="chat-message__author">Priya</span>
          <p className="chat-message__text">Good luck everyone 🎲</p>
        </div>
      </div>

      <div className="chat-panel__input-row">
        <input
          type="text"
          className="chat-panel__input"
          placeholder="Type a message…"
          disabled
          aria-label="Chat message"
        />
        <button type="button" className="chat-panel__send" disabled>
          Send
        </button>
      </div>
    </section>
  );
}
