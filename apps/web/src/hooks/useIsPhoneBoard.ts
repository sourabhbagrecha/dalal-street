import { useEffect, useState } from 'react';

/**
 * Matches the phone breakpoint the rules in styles.css use — the point at which
 * the side panel becomes a drawer and the board's bank column collapses into a
 * pill floating over the properties. Components that have to render *different
 * markup* there (rather than merely restyle) read this.
 *
 * The landscape half of the query is the same phone held sideways: 852 x 393 is
 * wide enough to clear every width breakpoint but far too short for the board
 * the desktop layout would otherwise hand it.
 *
 * Kept in sync with styles.css by hand — if that breakpoint moves, move this
 * one too.
 */
const PHONE_BOARD_QUERY =
  '(max-width: 700px), (max-height: 520px) and (orientation: landscape)';

export function useIsPhoneBoard(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_BOARD_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(PHONE_BOARD_QUERY);
    const onChange = (e: MediaQueryListEvent) => setPhone(e.matches);
    setPhone(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return phone;
}
