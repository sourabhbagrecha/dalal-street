import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChatPanel } from '../components/ChatPanel';
import { LobbyIcon } from './icons';

/** How far the on-screen keyboard covers the bottom of the layout viewport, so the sheet's input rides above it. */
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

/** The waiting room's chat: a bottom sheet over the stage, the same shape as the table's feed sheet. */
export function ChatSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const kb = useKeyboardInset(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className="lb-sheet" data-open={open} role="dialog" aria-modal="true" aria-label="Table talk" aria-hidden={!open} inert={!open}>
      <div className="lb-sheet__scrim" onClick={onClose} />
      <div className="lb-sheet__panel" style={{ '--kb': `${kb}px` } as CSSProperties}>
        <div className="lb-sheet__head">
          <span className="lb-sheet__grip" aria-hidden />
          <b>Table talk</b>
          <button type="button" className="lb-iconbtn" aria-label="Close chat" onClick={onClose}>
            <LobbyIcon name="x" />
          </button>
        </div>
        <ChatPanel />
      </div>
    </div>
  );
}
