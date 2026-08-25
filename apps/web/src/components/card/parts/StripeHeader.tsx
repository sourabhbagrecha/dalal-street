/** The 88px hazard-stripe strip that runs from the badge's right edge to the
 *  card's own right edge on the dark "steal" family (Sly/Forced/Debt) and,
 *  in a different two colours each, House and Hotel. */
export function StripeHeader({ variant }: { variant: 'red' | 'orange' | 'pink' }) {
  return <div className={`playing-card__stripe-hdr playing-card__stripe-hdr--${variant}`} />;
}
