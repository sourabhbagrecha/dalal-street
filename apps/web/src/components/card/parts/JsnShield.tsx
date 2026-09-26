/** The Just Say No card's yellow shield — on the face, and as the emblem of the table's Just Say No button. */
export function JsnShield({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 43 49" aria-hidden>
      <path d="M21.5 1 L41 8 V26 C41 37 32 44 21.5 48 C11 44 2 37 2 26 V8 Z" fill="#FFCE3F" stroke="#2B1608" strokeWidth="2.4" />
      <path d="M21.5 6 L36.5 11.5 V25.5 C36.5 34 29.5 39.6 21.5 43 C13.5 39.6 6.5 34 6.5 25.5 V11.5 Z" fill="#E3A81F" />
    </svg>
  );
}
