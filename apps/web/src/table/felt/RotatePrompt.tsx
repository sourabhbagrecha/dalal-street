/**
 * A landscape phone is too short for the felt's camera math to keep the deck and the
 * discard pile in frame (see gl-table.css: the same `max-height: 520px` orientation query
 * the bank's cash pile already uses to spot "held sideways"): the "whole table" zoom still
 * technically has them on screen, but shrunk well past anything tappable. Rather than teach
 * the camera an extra layout for that one aspect ratio, this covers the camera and asks for
 * portrait back — the hand tray and END TURN below it are untouched and stay playable
 * sideways exactly as before, since they were never the part that got lost. CSS-only, so it
 * shows and hides with the media query alone and never needs the game's own state.
 */
export function RotatePrompt() {
  return (
    <div className="tb-rotate" role="alert">
      <svg className="tb-rotate__icon" viewBox="0 0 64 64" aria-hidden>
        <rect x="20" y="4" width="24" height="40" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
        <path
          d="M46 24a18 18 0 1 1-6.5-13.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M46 8v9h-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <b>Rotate your phone</b>
      <span>Turn it upright to see the deck and discard pile — your hand still plays fine sideways.</span>
    </div>
  );
}
