import type { ReactNode } from 'react';

/** The few glyphs the lobby needs. Stroke/fill follow `currentColor`; size follows the font (see `.lb-ic`). */
const PATHS: Record<string, ReactNode> = {
  crown: <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor" />,
  chat: <path d="M4 5h16v11H10l-5 4v-4H4z" fill="currentColor" />,
  plus: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />,
  check: (
    <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  x: <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />,
  chevron: (
    <path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  book: (
    <path
      d="M12 6.5C10.5 5.3 8 4.8 4 5v13c4-.2 6.5.3 8 1.5 1.5-1.2 4-1.7 8-1.5V5c-4-.2-6.5.3-8 1.5zM12 6.5v13"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
      fill="none"
    />
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.7" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <circle cx="6" cy="12" r="2.7" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <circle cx="18" cy="18.5" r="2.7" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <path d="m8.4 10.7 7.2-3.9M8.4 13.3l7.2 3.9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  cards: (
    <>
      <rect x="3.5" y="6" width="10" height="14" rx="2" transform="rotate(-12 8.5 13)" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <rect x="10.5" y="4" width="10" height="14" rx="2" transform="rotate(10 15.5 11)" fill="currentColor" />
    </>
  ),
};

export function LobbyIcon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="lb-ic" viewBox="0 0 24 24" aria-hidden focusable="false">
      {PATHS[name]}
    </svg>
  );
}
