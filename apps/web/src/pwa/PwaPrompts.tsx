import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { applyUpdate, dismissIosHint, promptInstall, shouldShowIosHint, usePwa } from './pwa';
import './pwa.css';

/** Offline pill, "update ready" toast, install chip and iOS install hint. The install chip only
 *  shows on the landing route so it never covers a live table. */
export function PwaPrompts() {
  const { updateReady, canInstall, online } = usePwa();
  const onLanding = useLocation().pathname === '/';
  const [iosHint, setIosHint] = useState(shouldShowIosHint);
  const showIosHint = iosHint && onLanding && !canInstall;
  if (online && !updateReady && !(canInstall && onLanding) && !showIosHint) return null;

  return (
    <div className="pwa-stack" role="region" aria-label="App status">
      {!online && (
        <div className="pwa-pill" role="status">
          Offline - reconnecting when you are back
        </div>
      )}
      {updateReady && (
        <div className="pwa-toast" role="status">
          <span>New version ready</span>
          <button type="button" onClick={applyUpdate}>
            Reload
          </button>
        </div>
      )}
      {canInstall && onLanding && (
        <div className="pwa-toast" role="status">
          <span>Install for full-screen play</span>
          <button type="button" onClick={() => void promptInstall()}>
            Install
          </button>
        </div>
      )}
      {showIosHint && (
        <div className="pwa-toast" role="status">
          <span>
            To install: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              dismissIosHint();
              setIosHint(false);
            }}
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
