import type { CSSProperties } from 'react';
import type { Card } from '@monopoly-deal/shared';
import { PROPERTY_SET_DEFS } from '@monopoly-deal/shared';
import { PlayingCard } from '../components/card/PlayingCard';

const property = (id: string, color: keyof typeof PROPERTY_SET_DEFS): Card => ({
  id,
  kind: 'property',
  color,
  value: PROPERTY_SET_DEFS[color].value,
  name: PROPERTY_SET_DEFS[color].names[0]!,
});

/** The hand on the home screen: five real cards, fanned. `i` is the card's place either side of the middle one. */
const FAN: { i: number; card: Card }[] = [
  { i: -2, card: property('lb-a', 'orange') },
  { i: -1, card: property('lb-b', 'pink') },
  { i: 0, card: { id: 'lb-c', kind: 'money', amount: 10, value: 10 } },
  { i: 1, card: property('lb-d', 'dark_blue') },
  { i: 2, card: property('lb-e', 'green') },
];

/**
 * The splash: a hand of real cards dealt out over a felt spotlight and a skyline of monuments, the title lockup above.
 * It takes whatever height the tray under it leaves, and the tray overlaps the bottom of the fan (see `.lb-fan`), so the
 * hand reads as held from below.
 */
export function Hero() {
  return (
    <section className="lb-hero">
      <Skyline />
      <div className="lb-lockup">
        <h1 className="lb-title">
          <span className="lb-title__a">Monopoly</span>
          <span className="lb-title__b">Deal</span>
        </h1>
        <p className="lb-ribbon">India edition</p>
      </div>
      <div className="lb-fan" aria-hidden>
        {FAN.map(({ i, card }) => (
          <div key={card.id} className="lb-fan__c" style={{ '--i': i } as CSSProperties}>
            <PlayingCard card={card} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Sanchi stupa, a domed mausoleum with minarets, palms — flat silhouettes in the felt's own dark green. */
function Skyline() {
  return (
    <svg className="lb-skyline" viewBox="0 0 400 130" preserveAspectRatio="xMidYMax meet" aria-hidden focusable="false">
      <g fill="currentColor">
        <path d="M10,130 C10,100 32,82 54,82 C76,82 98,100 98,130Z" />
        <rect x="46" y="68" width="16" height="16" rx="3" />
        <rect x="52" y="54" width="4" height="16" rx="2" />
        <rect x="128" y="62" width="10" height="68" rx="4" />
        <path d="M128,62 C128,52 133,46 133,46 C133,46 138,52 138,62Z" />
        <rect x="262" y="62" width="10" height="68" rx="4" />
        <path d="M262,62 C262,52 267,46 267,46 C267,46 272,52 272,62Z" />
        <path d="M160,100 C144,74 162,44 200,32 C238,44 256,74 240,100Z" />
        <rect x="198" y="12" width="4" height="22" rx="2" />
        <circle cx="200" cy="11" r="4" />
        <rect x="152" y="100" width="96" height="30" />
        <rect x="144" y="118" width="112" height="12" rx="4" />
        <path d="M330,130 C332,104 338,86 348,68 L354,71 C346,88 341,106 340,130Z" />
        <path d="M350,68 C334,54 314,54 302,64 C318,62 334,66 348,76Z" />
        <path d="M350,68 C340,50 322,40 306,40 C322,48 336,60 346,76Z" />
        <path d="M350,68 C366,52 386,50 398,58 C382,58 366,64 354,76Z" />
        <path d="M350,68 C362,48 380,38 394,38 C380,46 366,58 356,76Z" />
      </g>
    </svg>
  );
}
