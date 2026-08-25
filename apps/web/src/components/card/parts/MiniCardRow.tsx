/**
 * A row of tiny card silhouettes — "N cards" as a picture, the property
 * card's rent-ladder count. Fill colour and border weight come from the
 * enclosing face's `--p-base` / `--p-mini-border-n` tokens.
 */
export function MiniCardRow({ count }: { count: number }) {
  return (
    <span className="playing-card__pcard-row-cards" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="playing-card__pcard-mini-card" />
      ))}
    </span>
  );
}
