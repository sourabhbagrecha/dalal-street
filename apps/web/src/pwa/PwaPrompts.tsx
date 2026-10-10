import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  applyUpdate,
  installSnoozed,
  openShareSheet,
  promptInstall,
  shouldShowIosHint,
  snoozeInstall,
  usePwa,
} from './pwa';
import './pwa.css';

/** Offline pill, "update ready" toast, install chip and iOS install hint. The install chip only
 *  shows on the landing route so it never covers a live table. */
export function PwaPrompts() {
  const { updateReady, canInstall, online } = usePwa();
  const onLanding = useLocation().pathname === '/';
  const [iosHint, setIosHint] = useState(shouldShowIosHint);
  const [iosSteps, setIosSteps] = useState(false);
  const showIosHint = iosHint && onLanding && !canInstall;
  const [installDismissed, setInstallDismissed] = useState(installSnoozed);
  const showInstall = canInstall && onLanding && !installDismissed;
  if (online && !updateReady && !showInstall && !showIosHint) return null;

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
      {showInstall && (
        <div className="pwa-toast" role="status">
          <span>Install for full-screen play</span>
          <button type="button" onClick={() => void promptInstall()}>
            Install
          </button>
          <button
            type="button"
            className="pwa-dismiss"
            aria-label="Dismiss install prompt"
            onClick={() => {
              snoozeInstall();
              setInstallDismissed(true);
            }}
          >
            ×
          </button>
        </div>
      )}
      {showIosHint && (
        <div className="pwa-toast" role="status">
          <span>
            {iosSteps ? (
              <>
                Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>
              </>
            ) : (
              'Install for full-screen play'
            )}
          </span>
          {!iosSteps && (
            <button
              type="button"
              onClick={() =>
                void openShareSheet().then((opened) => {
                  if (!opened) setIosSteps(true);
                })
              }
            >
              Install
            </button>
          )}
          <button
            type="button"
            className="pwa-dismiss"
            aria-label="Dismiss install prompt"
            onClick={() => {
              snoozeInstall();
              setIosHint(false);
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
