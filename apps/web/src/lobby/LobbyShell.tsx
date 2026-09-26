import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { INDIA_PROPERTY_THEME } from '../indiaPropertyTheme';
import { LobbyIcon } from './icons';
import '../styles/lobby.css';

/**
 * One phone-sized stage for every pre-game screen (home, invite, waiting room), in the table's own wood / felt / gold
 * language. On a phone the stage IS the screen; on a desktop it is a device frame, like the table. The content scrolls
 * inside it — the page itself never does — and `dock` sticks to the bottom edge, where the thumb is.
 */
export function LobbyShell({
  bar,
  children,
  dock,
  overlay,
}: {
  bar: ReactNode;
  children: ReactNode;
  /** A bar pinned to the bottom of the stage (primary actions). */
  dock?: ReactNode;
  /** Sits over the stage, outside the scroll (bottom sheets). */
  overlay?: ReactNode;
}) {
  return (
    <div className="lb">
      <div className="lb__phone">
        <div className="lb__scroll">
          {bar}
          <Bunting />
          {children}
          {dock}
        </div>
        {overlay}
      </div>
    </div>
  );
}

/** The app mark (public/icon.svg): a dome and two minarets on the pink field. */
function BrandMark() {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden focusable="false">
      <rect width="1024" height="1024" fill="#b81a5c" />
      <g fill="#fbf1e2" transform="translate(512 526) scale(1.12) translate(-512 -512)">
        <rect x="186" y="516" width="60" height="336" rx="24" />
        <path d="M186,516 C186,452 216,414 216,414 C216,414 246,452 246,516 Z" />
        <rect x="778" y="516" width="60" height="336" rx="24" />
        <path d="M778,516 C778,452 808,414 808,414 C808,414 838,452 838,516 Z" />
        <path d="M330,556 C248,428 300,268 512,206 C724,268 776,428 694,556 Z" />
        <rect x="496" y="140" width="32" height="72" rx="12" />
        <circle cx="512" cy="124" r="26" />
        <rect x="292" y="556" width="440" height="246" />
        <rect x="236" y="802" width="552" height="52" rx="18" />
        <path d="M436,802 L436,668 C436,592 588,592 588,668 L588,802 Z" fill="#b81a5c" />
      </g>
    </svg>
  );
}

/** Wood bar across the top, like the table's HUD: the mark (home link), an optional two-line title, actions on the right. */
export function LobbyBar({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title?: string;
  /** Right-hand actions. */
  children?: ReactNode;
}) {
  return (
    <header className="lb-bar">
      <Link to="/" className="lb-bar__brand" aria-label="Monopoly Deal home">
        <BrandMark />
      </Link>
      {title && (
        <div className="lb-bar__line">
          {eyebrow && <small>{eyebrow}</small>}
          <b>{title}</b>
        </div>
      )}
      <div className="lb-bar__acts">{children}</div>
    </header>
  );
}

export function RulesLink({ icon = false }: { icon?: boolean }) {
  return icon ? (
    <Link to="/rules" className="lb-iconbtn" aria-label="Rules and cards">
      <LobbyIcon name="book" />
    </Link>
  ) : (
    <Link to="/rules" className="lb-pill">
      <LobbyIcon name="book" />
      Rules
    </Link>
  );
}

/** Festive pennants strung under the bar, one per property colour of the India set, swaying a little out of step. */
const PENNANTS = ['pink', 'orange', 'yellow', 'green', 'light_blue', 'dark_blue', 'utility', 'red', 'brown', 'pink', 'orange', 'yellow'] as const;

function Bunting() {
  return (
    <div className="lb-bunting" aria-hidden>
      {PENNANTS.map((color, n) => (
        <i key={n} style={{ '--c': INDIA_PROPERTY_THEME[color].base, '--n': n } as CSSProperties} />
      ))}
    </div>
  );
}
