import type { Card } from '@monopoly-deal/shared';
import { PlayingCard } from '../components/PlayingCard';

/**
 * Dev-only visual gallery for the action/money-10/Joker card face redesign
 * (see ActionCardFaces.tsx) — every face at a fixed 300×420px, one per cell,
 * in the same order as the reference sheet, so a screenshot of `/cards` can
 * be diffed directly against the reference PNG. Not linked from anywhere in
 * the app; reached only by navigating to /cards directly.
 */
const GALLERY_CARDS: Array<{ name: string; card: Card }> = [
  { name: 'pass-go', card: { id: 'gallery-pass-go', kind: 'action', action: 'pass_go', value: 1 } },
  { name: 'money-10', card: { id: 'gallery-money-10', kind: 'money', amount: 10, value: 10 } },
  { name: 'sly-deal', card: { id: 'gallery-sly-deal', kind: 'action', action: 'sly_deal', value: 3 } },
  { name: 'forced-deal', card: { id: 'gallery-forced-deal', kind: 'action', action: 'forced_deal', value: 3 } },
  {
    name: 'debt-collector',
    card: { id: 'gallery-debt-collector', kind: 'action', action: 'debt_collector', value: 3 },
  },
  {
    name: 'its-my-birthday',
    card: { id: 'gallery-its-my-birthday', kind: 'action', action: 'its_my_birthday', value: 2 },
  },
  { name: 'deal-breaker', card: { id: 'gallery-deal-breaker', kind: 'action', action: 'deal_breaker', value: 5 } },
  {
    name: 'double-the-rent',
    card: { id: 'gallery-double-the-rent', kind: 'action', action: 'double_the_rent', value: 1 },
  },
  { name: 'house', card: { id: 'gallery-house', kind: 'action', action: 'house', value: 3 } },
  { name: 'just-say-no', card: { id: 'gallery-just-say-no', kind: 'action', action: 'just_say_no', value: 4 } },
  {
    name: 'multicolor-wild',
    // Empty `colors` is what marks a property wildcard as the multicolour
    // ("any") wild — see PropertyWildCard in packages/shared/src/types.ts
    // and the same convention in packages/engine/src/autoPayment.test.ts.
    card: { id: 'gallery-multicolor-wild', kind: 'property_wild', colors: [], value: 0 },
  },
  { name: 'hotel', card: { id: 'gallery-hotel', kind: 'action', action: 'hotel', value: 4 } },
  { name: 'money-1', card: { id: 'gallery-money-1', kind: 'money', amount: 1, value: 1 } },
  { name: 'money-2', card: { id: 'gallery-money-2', kind: 'money', amount: 2, value: 2 } },
  { name: 'money-3', card: { id: 'gallery-money-3', kind: 'money', amount: 3, value: 3 } },
  { name: 'money-4', card: { id: 'gallery-money-4', kind: 'money', amount: 4, value: 4 } },
  { name: 'money-5', card: { id: 'gallery-money-5', kind: 'money', amount: 5, value: 5 } },
];

export function CardGalleryPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#17131C',
        padding: '32px',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 300px)',
        gap: '20px',
        justifyContent: 'start',
      }}
    >
      {GALLERY_CARDS.map(({ name, card }) => (
        <div key={card.id} data-testid={`gallery-${name}`}>
          <PlayingCard card={card} style={{ width: '300px', height: '420px' }} />
        </div>
      ))}
    </div>
  );
}
