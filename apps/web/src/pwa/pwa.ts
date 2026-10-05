import { useSyncExternalStore } from 'react';

/** Install + service-worker lifecycle as one tiny external store. The worker
 *  only ever caches the app shell (see pwa/sw.js); game state never touches it. */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** A new build is installed and waiting; reloading activates it. */
  updateReady: boolean;
  /** The browser offered an install and it has not been used or dismissed. */
  canInstall: boolean;
  online: boolean;
}

const UPDATE_CHECK_MS = 60 * 60 * 1000;

let state: PwaState = {
  updateReady: false,
  canInstall: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
};
let waiting: ServiceWorker | null = null;
let installEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Activate the waiting worker; the page reloads once it takes control. */
export function applyUpdate(): void {
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
}

export async function promptInstall(): Promise<void> {
  const event = installEvent;
  if (!event) return;
  installEvent = null;
  set({ canInstall: false });
  await event.prompt();
  await event.userChoice;
}

function watch(registration: ServiceWorkerRegistration): void {
  const flagIfWaiting = (): void => {
    // `controller` is null on a first install: nothing to update then.
    if (registration.waiting && navigator.serviceWorker.controller) {
      waiting = registration.waiting;
      set({ updateReady: true });
    }
  };
  flagIfWaiting();
  registration.addEventListener('updatefound', () => {
    const next = registration.installing;
    next?.addEventListener('statechange', () => {
      if (next.state === 'installed') flagIfWaiting();
    });
  });
}

export function initPwa(): void {
  window.addEventListener('online', () => set({ online: true }));
  window.addEventListener('offline', () => set({ online: false }));
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    set({ canInstall: false });
  });

  // Dev serves modules straight from Vite; a worker there only gets in the way.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First install also claims the page; only reload when replacing a worker.
    if (!waiting || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        watch(registration);
        const check = (): void => void registration.update().catch(() => undefined);
        setInterval(check, UPDATE_CHECK_MS);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      })
      .catch(() => undefined);
  });
}

const IOS_HINT_KEY = 'md.iosInstallHintDismissed';

/** iOS has no install prompt (WebKit lacks `beforeinstallprompt`), so the
 *  landing page explains the share-sheet route instead. Not shown once the app
 *  is already running from the home screen, or after the player dismisses it. */
export function shouldShowIosHint(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (!ios || standalone) return false;
  try {
    return localStorage.getItem(IOS_HINT_KEY) !== '1';
  } catch {
    return true;
  }
}

export function dismissIosHint(): void {
  try {
    localStorage.setItem(IOS_HINT_KEY, '1');
  } catch {
    // Private mode: the hint just comes back next visit.
  }
}
