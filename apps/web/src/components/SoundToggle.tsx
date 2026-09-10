import { useSyncExternalStore } from 'react';
import { soundEngine } from '../sound/soundEngine';

/** Small mute button for `soundEngine`. Placement (inline vs fixed corner) is the caller's call — see the `fixed` prop. */
export function SoundToggle({ fixed = false }: { fixed?: boolean }) {
  const muted = useSyncExternalStore(
    (listener) => soundEngine.subscribe(listener),
    () => soundEngine.getMuted(),
  );

  return (
    <button
      type="button"
      className={fixed ? 'sound-toggle sound-toggle--fixed' : 'sound-toggle'}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      aria-pressed={muted}
      onClick={() => soundEngine.toggleMuted()}
      data-testid="sound-toggle"
    >
      S
    </button>
  );
}
