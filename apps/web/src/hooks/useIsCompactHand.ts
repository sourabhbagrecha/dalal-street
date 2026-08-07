import { useEffect, useState } from 'react';

/**
 * Matches the `max-width: 900px` breakpoint the hand-area CSS uses — the width
 * at which the board stacks and the hand's column stops being wide enough for a
 * single row. Below it the fan wraps into two rows laid out from the left edge;
 * above it the cards stay on the single centred arc. Kept in sync with
 * styles.css by hand — if that breakpoint moves, move this one too.
 */
const COMPACT_HAND_QUERY = '(max-width: 900px)';

export function useIsCompactHand(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_HAND_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(COMPACT_HAND_QUERY);
    const onChange = (e: MediaQueryListEvent) => setCompact(e.matches);
    setCompact(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return compact;
}
