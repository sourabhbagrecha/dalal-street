import { useSyncExternalStore } from 'react';
import { soundEngine } from '../sound/soundEngine';

/** Small mute button for `soundEngine`. */
export function SoundToggle() {
  const muted = useSyncExternalStore(
    (listener) => soundEngine.subscribe(listener),
    () => soundEngine.getMuted(),
  );

  return (
    <button
      type="button"
      className="sound-toggle"
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      aria-pressed={muted}
      onClick={() => soundEngine.toggleMuted()}
      data-testid="sound-toggle"
    >
      S
    </button>
  );
}
