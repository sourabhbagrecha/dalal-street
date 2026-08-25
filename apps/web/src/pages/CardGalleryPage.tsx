import type { CSSProperties } from 'react';
import type { Card, PropertyColor } from '@monopoly-deal/shared';
import { PROPERTY_SET_DEFS } from '@monopoly-deal/shared';
import { PlayingCard } from '../components/PlayingCard';

/**
 * Dev-only visual gallery of every card face — one property per colour, the
 * two-colour wildcards (a 2-row pair and the 4-row railroad pair), the Joker,
 * a dual rent and a wild rent, every money denomination and every action —
 * each at a fixed 300×420px cell so a screenshot of `/cards` can be diffed
 * against a baseline. Not linked from anywhere in the app; reached only by
 * navigating to /cards directly.
 */
interface GalleryEntry {
  name: string;
  card: Card;
  /** Two-colour wildcards: which half renders upright. */
  activeColor?: PropertyColor;
}

const PROPERTY_COLORS: PropertyColor[] = [
  'brown',
  'light_blue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'dark_blue',
  'railroad',
  'utility',
];

const GALLERY_CARDS: GalleryEntry[] = [
  ...PROPERTY_COLORS.map((color): GalleryEntry => {
    const def = PROPERTY_SET_DEFS[color];
    return {
      name: `property-${color}`,
      card: {
        id: `gallery-property-${color}`,
        kind: 'property',
        color,
        value: def.value,
        name: def.names[0] ?? color,
      },
    };
  }),
  {
    name: 'wild-light-blue-brown',
    card: { id: 'gallery-wild-light-blue-brown', kind: 'property_wild', colors: ['light_blue', 'brown'], value: 1 },
    activeColor: 'light_blue',
  },
  {
    name: 'wild-green-railroad',
    card: { id: 'gallery-wild-green-railroad', kind: 'property_wild', colors: ['green', 'railroad'], value: 4 },
    activeColor: 'railroad',
  },
  {
    name: 'multicolor-wild',
    // Empty `colors` is what marks a property wildcard as the multicolour
    // ("any") wild — see PropertyWildCard in packages/shared/src/types.ts
    // and the same convention in packages/engine/src/autoPayment.test.ts.
    card: { id: 'gallery-multicolor-wild', kind: 'property_wild', colors: [], value: 0 },
  },
  {
    name: 'rent-dual',
    card: { id: 'gallery-rent-dual', kind: 'rent', rentType: 'dual', colors: ['dark_blue', 'green'], value: 1 },
  },
  {
    // The two longest state names in the deck on one card: the worst case for
    // the rent face's row and footer widths.
    name: 'rent-dual-long',
    card: { id: 'gallery-rent-dual-long', kind: 'rent', rentType: 'dual', colors: ['railroad', 'utility'], value: 1 },
  },
  {
    name: 'rent-wild',
    card: { id: 'gallery-rent-wild', kind: 'rent', rentType: 'wild', colors: [], value: 3 },
  },
  { name: 'money-1', card: { id: 'gallery-money-1', kind: 'money', amount: 1, value: 1 } },
  { name: 'money-2', card: { id: 'gallery-money-2', kind: 'money', amount: 2, value: 2 } },
  { name: 'money-3', card: { id: 'gallery-money-3', kind: 'money', amount: 3, value: 3 } },
  { name: 'money-4', card: { id: 'gallery-money-4', kind: 'money', amount: 4, value: 4 } },
  { name: 'money-5', card: { id: 'gallery-money-5', kind: 'money', amount: 5, value: 5 } },
  { name: 'money-10', card: { id: 'gallery-money-10', kind: 'money', amount: 10, value: 10 } },
  { name: 'pass-go', card: { id: 'gallery-pass-go', kind: 'action', action: 'pass_go', value: 1 } },
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
  { name: 'hotel', card: { id: 'gallery-hotel', kind: 'action', action: 'hotel', value: 4 } },
  { name: 'just-say-no', card: { id: 'gallery-just-say-no', kind: 'action', action: 'just_say_no', value: 4 } },
];

export function CardGalleryPage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#17131C',
        padding: '32px',
        display: 'grid',
        // `auto-fill` + `minmax` (rather than the old fixed `repeat(4, 300px)`)
        // lets the track count shrink with viewport width instead of
        // overflowing it — see the `.rules-cards` pattern in styles.css,
        // which the D5 fix mirrors: a placement sets --card-w and lets layout
        // do the wrapping, never a fixed px column that can outgrow the
        // viewport.
        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 300px))',
        gap: '20px',
        justifyContent: 'start',
      }}
    >
      {GALLERY_CARDS.map(({ name, card, activeColor }) => (
        <div key={card.id} data-testid={`gallery-${name}`}>
          <PlayingCard
            card={card}
            activeColor={activeColor}
            style={{ ['--card-w']: '100%' } as CSSProperties}
          />
        </div>
      ))}
    </div>
  );
}
