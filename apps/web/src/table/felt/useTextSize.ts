import { useEffect, useState } from 'react';

/**
 * A per-viewer text-size preference for the HUD line and seat names, which are otherwise fixed at 9-12px with no
 * larger-text option. Cosmetic only (nothing here is game state), so `localStorage` is the right home for it — it
 * never needs to be shared with anyone else at the table.
 */
export type TextSize = 'small' | 'default' | 'large';

const KEY = 'md.textSize';
const ORDER: TextSize[] = ['small', 'default', 'large'];

function read(): TextSize {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'small' || v === 'large' ? v : 'default';
  } catch {
    return 'default';
  }
}

/** The current size and a setter that cycles small → default → large → small. */
export function useTextSize(): [TextSize, () => void] {
  const [size, setSize] = useState<TextSize>(read);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, size);
    } catch {
      /* private browsing / storage disabled: the preference just doesn't persist */
    }
  }, [size]);
  const cycle = () => setSize((s) => ORDER[(ORDER.indexOf(s) + 1) % ORDER.length]!);
  return [size, cycle];
}
