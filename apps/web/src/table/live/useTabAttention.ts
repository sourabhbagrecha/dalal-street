import { useEffect, useRef } from 'react';

/** What the tab wants the viewer back for. Null means nothing does — the title and favicon stay whatever they are. */
type TabAttention = 'turn' | 'targeted' | null;

const LABEL: Record<Exclude<TabAttention, null>, string> = {
  turn: 'Your turn',
  targeted: "You're targeted",
};

/** The ring's own colors (see `felt/Hud.tsx`): gold for a normal clock, red for the urgent one — reused so the
 * favicon badge reads as the same table language rather than inventing a third color. */
const BADGE_COLOR: Record<Exclude<TabAttention, null>, string> = {
  turn: '#f2c14e',
  targeted: '#ff6b57',
};

let baseIcon: Promise<HTMLImageElement> | null = null;
/** One composed badge per kind, cached for the life of the tab — nothing here depends on game state. */
const badgeCache = new Map<Exclude<TabAttention, null>, Promise<string | null>>();

function loadBaseIcon(): Promise<HTMLImageElement> {
  if (!baseIcon) {
    baseIcon = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('icon failed to load'));
      img.src = '/icon.svg';
    });
  }
  return baseIcon;
}

/** The app icon with a small solid dot over its corner, rendered once per `kind` and reused after. */
function badgedIconUrl(kind: Exclude<TabAttention, null>): Promise<string | null> {
  let cached = badgeCache.get(kind);
  if (!cached) {
    cached = loadBaseIcon()
      .then((img) => {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, size, size);
        const r = size * 0.22;
        const cx = size - r - 2;
        const cy = r + 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = BADGE_COLOR[kind];
        ctx.fill();
        return canvas.toDataURL('image/png');
      })
      .catch(() => null);
    badgeCache.set(kind, cached);
  }
  return cached;
}

/**
 * Out-of-tab signal: while the tab is hidden and `attention` names something worth coming back for (the viewer's
 * turn, or a demand aimed at them — Just Say No, a payment), swaps `document.title` and every `<link rel="icon">`
 * for a badged one. Restores both the moment the tab regains focus, or `attention` clears, so a player looking
 * straight at the table never sees their own title change.
 *
 * Feature-detected only by what it touches (`document`, canvas, an `<img>` load) — every browser this app supports
 * has all three, and a canvas or image failure just leaves the title-only signal in place (`badgedIconUrl` resolves
 * `null` rather than throwing).
 */
export function useTabAttention(attention: TabAttention): void {
  const original = useRef<{ title: string; icons: { el: HTMLLinkElement; href: string }[] } | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!original.current) {
      original.current = {
        title: document.title,
        icons: Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')).map((el) => ({ el, href: el.href })),
      };
    }
    const orig = original.current;

    const restore = () => {
      document.title = orig.title;
      for (const { el, href } of orig.icons) el.href = href;
    };

    const apply = () => {
      if (!attention || document.visibilityState !== 'hidden') {
        restore();
        return;
      }
      document.title = `${LABEL[attention]} — Monopoly Deal`;
      void badgedIconUrl(attention).then((url) => {
        // The tab came back, or moved on to a different (or no) attention, while the badge was composing.
        if (!url || document.visibilityState !== 'hidden') return;
        for (const { el } of orig.icons) el.href = url;
      });
    };

    apply();
    document.addEventListener('visibilitychange', apply);
    return () => {
      document.removeEventListener('visibilitychange', apply);
      restore();
    };
  }, [attention]);
}
