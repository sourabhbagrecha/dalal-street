import { useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PropertyColor } from '@monopoly-deal/shared';
import { theme } from '../../../theme';

/** How long a destructive flip stays armed before it forgets the first tap. */
const FLIP_ARM_MS = 3000;

/**
 * The corner badge that turns a wildcard over.
 *
 * It deliberately swallows the pointer: the card underneath arms an HTML5 drag
 * from any press (see `useTouchDragPolyfill`), and a tap that is sometimes a
 * flip and sometimes a drag is worse than a small patch of the card where drags
 * no longer start.
 *
 * A flip that would break a complete set or strand a house/hotel is never
 * blocked — breaking your own set to reach a third one can be the winning move
 * — but it takes two taps, because the first tap is easy to make by accident on
 * a board card and the move is not undoable in place.
 */
export function WildFlipButton({
  cardId,
  toColor,
  disabled,
  disabledReason,
  destructive,
  onFlip,
}: {
  cardId: string;
  toColor?: PropertyColor;
  disabled?: boolean;
  disabledReason?: string;
  destructive?: boolean;
  onFlip: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), FLIP_ARM_MS);
    const disarm = () => setArmed(false);
    // Any press elsewhere on the page is a decision not to go through with it.
    document.addEventListener('pointerdown', disarm);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', disarm);
    };
  }, [armed]);

  useEffect(() => {
    if (disabled) setArmed(false);
  }, [disabled]);

  const swallow = (e: ReactPointerEvent<HTMLButtonElement>) => {
    // Stops the card's touch-drag polyfill from arming underneath the badge.
    e.stopPropagation();
  };

  const commit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (disabled) return;
    if (destructive && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    onFlip();
  };

  const label = disabled
    ? (disabledReason ?? 'Cannot flip right now')
    : armed
      ? 'Breaks a set — tap again to confirm'
      : toColor
        ? `Flip to ${theme.propertyNames[toColor] ?? toColor}`
        : 'Flip wildcard';

  return (
    <button
      type="button"
      className={`playing-card__flip${armed ? ' playing-card__flip--armed' : ''}`}
      data-testid={`flip-wild-btn-${cardId}`}
      data-armed={armed ? 'true' : undefined}
      aria-label={label}
      title={label}
      disabled={disabled}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={swallow}
      onClick={commit}
    >
      {armed ? (
        <span className="playing-card__flip-warn" aria-hidden>
          !
        </span>
      ) : (
        <>
          <svg viewBox="0 0 24 24" aria-hidden focusable="false">
            <path
              d="M4 9a8 8 0 0 1 13.7-5.6M20 15A8 8 0 0 1 6.3 20.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path d="M4 3.5V9h5.5M20 20.5V15h-5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="playing-card__flip-label" aria-hidden>
            FLIP
          </span>
        </>
      )}
    </button>
  );
}
