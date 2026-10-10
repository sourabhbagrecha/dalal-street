import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { soundEngine } from '../../sound/soundEngine';
import { useGameStore } from '../../store';
import { Icon } from '../kit';
import { RulesModal } from './RulesModal';
import { useChrome } from './context';

/**
 * The HUD's menu button: the things a player reaches for now and then, kept out of the chat sheet so that sheet is only
 * about talking and reading what happened. Switches (view, sound) stay open so the new state is seen; the
 * rest act and close. Leave is last, red and behind a confirm.
 */

function Switch({ on, label, hint, icon, testId, onToggle }: { on: boolean; label: string; hint?: string; icon: ReactNode; testId: string; onToggle(): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} aria-description={hint} className="cx-menu__row" data-testid={testId} onClick={onToggle}>
      <span className="cx-menu__icon">{icon}</span>
      <span className="cx-menu__label">
        {label}
        {hint && <small className="cx-menu__sub">{hint}</small>}
      </span>
      <span className="cx-menu__switch" aria-hidden />
    </button>
  );
}

const SPEAKER = (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
    <path d="M4 9.5v5h3.6l4.9 3.9V5.6L7.6 9.5z" fill="currentColor" />
    <path d="M15.8 9a4.2 4.2 0 0 1 0 6m2.6-8.6a7.8 7.8 0 0 1 0 11.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
  </svg>
);

function SoundSwitch() {
  const muted = useSyncExternalStore(
    (listener) => soundEngine.subscribe(listener),
    () => soundEngine.getMuted(),
  );
  return <Switch on={!muted} label="Sound" icon={SPEAKER} testId="sound-toggle" onToggle={() => soundEngine.toggleMuted()} />;
}

/** Tap to copy the room code, to paste into an invite. */
function RoomRow({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // No clipboard (insecure origin, denied): the code is on the row, they can read it out.
    }
  };
  return (
    <button type="button" className="cx-menu__row" data-testid="room-chip" onClick={() => void copy()}>
      <span className="cx-menu__icon" aria-hidden>
        <Icon name="plus" />
      </span>
      <span className="cx-menu__label">
        Room <b className="cx-menu__code">{code}</b>
      </span>
      <span className="cx-menu__hint" role="status">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}

/** Gives up the seat for good, behind a confirm dialog so a stray tap never costs a hand. Their cards go back into the game. */
function LeaveConfirm({ frame, onStay }: { frame: Element | null; onStay(): void }) {
  const leaveRoom = useGameStore((a) => a.leaveRoom);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (!busy) onStay();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onStay]);
  const leave = async () => {
    setBusy(true);
    await leaveRoom?.();
    navigate('/');
  };
  const dialog = (
    <div className="cx-confirm" role="alertdialog" aria-modal="true" aria-labelledby="cx-leave-title" data-testid="leave-confirm">
      <div className="cx-confirm__scrim" onClick={() => !busy && onStay()} />
      <div className="cx-confirm__card">
        <h3 id="cx-leave-title">Leave this game?</h3>
        <p>Your cards go back into the deck and discard pile. You can't rejoin this game.</p>
        <div className="cx-confirm__acts">
          <button type="button" className="cx-confirm__stay" disabled={busy} onClick={onStay} data-testid="leave-stay">
            Stay
          </button>
          <button type="button" className="cx-confirm__leave" disabled={busy} onClick={() => void leave()} data-testid="leave-confirm-btn">
            Leave
          </button>
        </div>
      </div>
    </div>
  );
  return frame ? createPortal(dialog, frame) : dialog;
}

export function TableMenu({ wide, onWide }: { wide: boolean; onWide(): void }) {
  const roomCode = useChrome()?.net?.roomCode ?? null;
  const canLeave = !!useGameStore((a) => a.leaveRoom);
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Outside tap and Escape close; focus goes back to the button.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="cx-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="tb-hud__btn"
        data-on={open}
        data-testid="menu-button"
        aria-label="Settings"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="gear" />
      </button>
      {open && (
        <div className="cx-menu__pop" role="group" aria-label="Settings" data-testid="menu-pop">
          <Switch
            on={wide}
            label="Stay zoomed out"
            hint="Camera won't follow turns"
            icon={<Icon name="zoomOut" />}
            testId="wide-toggle"
            onToggle={onWide}
          />
          <SoundSwitch />
          <button
            type="button"
            className="cx-menu__row"
            data-testid="rules-link"
            onClick={() => {
              setOpen(false);
              setRules(true);
            }}
          >
            <span className="cx-menu__icon" aria-hidden>
              <Icon name="info" />
            </span>
            <span className="cx-menu__label">Rules</span>
          </button>
          {roomCode && <RoomRow code={roomCode} />}
          {roomCode && canLeave && (
            <button
              type="button"
              className="cx-menu__row cx-menu__row--leave"
              data-testid="leave-game"
              onClick={() => {
                setOpen(false);
                setLeaving(true);
              }}
            >
              <span className="cx-menu__icon" aria-hidden>
                <Icon name="x" />
              </span>
              <span className="cx-menu__label">Leave game</span>
            </button>
          )}
        </div>
      )}
      {rules && <RulesModal onClose={() => setRules(false)} />}
      {leaving && <LeaveConfirm frame={root.current?.closest('.gl__phone') ?? null} onStay={() => setLeaving(false)} />}
    </span>
  );
}
