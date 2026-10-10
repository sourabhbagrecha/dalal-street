import type { PropertyColor } from '@monopoly-deal/shared';
import type { Landmark } from './types';

/** India: the original glyphs (state emblems drawn for the Indian edition), on a 32-unit grid. */
export const INDIA_LANDMARKS: Record<PropertyColor, Landmark> = {
  // Gujarat: Gir lion, face-on. A tufted mane falling to a beard, the face cut out of it with round ears,
  // and eyes, nose and mouth drawn back in.
  brown: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path
          d="M16 0.8L18.6 3.6L22.5 1.8L23.6 5.4L28 5L27 9L31.2 10.5L28.6 13.6L31.6 17L28.3 18.6L30.4 23L26.6 22.9L27 28L23.2 26.2L22 31L19.2 28.4L16 31.6L12.8 28.4L10 31L8.8 26.2L5 28L5.4 22.9L1.6 23L3.7 18.6L0.4 17L3.4 13.6L0.8 10.5L5 9L4 5L8.4 5.4L9.5 1.8L13.4 3.6ZM12.3 9.3A3.3 3.3 0 1 0 8 13.9C7.6 18.5 10 22.6 12.6 24.8Q16 27.6 19.4 24.8C22 22.6 24.4 18.5 24 13.9A3.3 3.3 0 1 0 19.7 9.3Q16 7.4 12.3 9.3Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <circle cx="9.3" cy="10.9" r="1.4" fill="currentColor" />
        <circle cx="22.7" cy="10.9" r="1.4" fill="currentColor" />
        <circle cx="12.4" cy="15.2" r="1.5" fill="currentColor" />
        <circle cx="19.6" cy="15.2" r="1.5" fill="currentColor" />
        <path d="M13.4 18.6H18.6Q18.6 20.4 16 22.2Q13.4 20.4 13.4 18.6Z" fill="currentColor" />
        <path
          d="M16 22V23.4M12.9 23.2Q14.6 25 16 23.4Q17.4 25 19.1 23.2"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          fill="none"
        />
      </>
    ),
  },
  // Kerala: a kettuvallam houseboat, a long thatched roof with three arched openings and a raised
  // upper deck, on a hull whose ends curl up out of the backwater.
  light_blue: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path d="M10.5 9.7Q10.5 6 14 6H18Q21.5 6 21.5 9.7Z" fill="currentColor" />
        <path
          d="M4 20.7C4 14 6.5 10.5 11 10.5H21C25.5 10.5 28 14 28 20.7ZM7.4 19V16A2.2 2.2 0 0 1 11.8 16V19ZM13.8 19V16A2.2 2.2 0 0 1 18.2 16V19ZM20.2 19V16A2.2 2.2 0 0 1 24.6 16V19Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <path
          d="M0.5 17Q2.5 21.6 6 21.6H25Q29 21.6 31.5 15.5Q31 25.5 25 26.6H8Q2 26.6 0.5 17Z"
          fill="currentColor"
        />
        <path
          d="M1 29.8Q3.5 28 6 29.8T11 29.8T16 29.8T21 29.8T26 29.8T31 29.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
      </>
    ),
  },
  // Rajasthan: Hawa Mahal, a honeycomb of small arched windows stepping up five storeys to a crown,
  // a domed kiosk with its finial on every shoulder.
  pink: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path
          d="M1 31V18H4V13H8V8.5H12V4.5H20V8.5H24V13H28V18H31V31ZM2.9 29.3V27A1.1 1.1 0 0 1 5.1 27V29.3ZM6.9 29.3V27A1.1 1.1 0 0 1 9.1 27V29.3ZM10.9 29.3V27A1.1 1.1 0 0 1 13.1 27V29.3ZM14.9 29.3V27A1.1 1.1 0 0 1 17.1 27V29.3ZM18.9 29.3V27A1.1 1.1 0 0 1 21.1 27V29.3ZM22.9 29.3V27A1.1 1.1 0 0 1 25.1 27V29.3ZM26.9 29.3V27A1.1 1.1 0 0 1 29.1 27V29.3ZM2.9 23.2V21A1.1 1.1 0 0 1 5.1 21V23.2ZM6.9 23.2V21A1.1 1.1 0 0 1 9.1 21V23.2ZM10.9 23.2V21A1.1 1.1 0 0 1 13.1 21V23.2ZM14.9 23.2V21A1.1 1.1 0 0 1 17.1 21V23.2ZM18.9 23.2V21A1.1 1.1 0 0 1 21.1 21V23.2ZM22.9 23.2V21A1.1 1.1 0 0 1 25.1 21V23.2ZM26.9 23.2V21A1.1 1.1 0 0 1 29.1 21V23.2ZM6.9 17V15.4A1.1 1.1 0 0 1 9.1 15.4V17ZM10.9 17V15.4A1.1 1.1 0 0 1 13.1 15.4V17ZM14.9 17V15.4A1.1 1.1 0 0 1 17.1 15.4V17ZM18.9 17V15.4A1.1 1.1 0 0 1 21.1 15.4V17ZM22.9 17V15.4A1.1 1.1 0 0 1 25.1 15.4V17ZM10.9 12.2V10.7A1.1 1.1 0 0 1 13.1 10.7V12.2ZM14.9 12.2V10.7A1.1 1.1 0 0 1 17.1 10.7V12.2ZM18.9 12.2V10.7A1.1 1.1 0 0 1 21.1 10.7V12.2ZM14.9 7.8V6.6A1.1 1.1 0 0 1 17.1 6.6V7.8Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <path
          d="M1 18A1.5 1.5 0 0 1 4 18ZM28 18A1.5 1.5 0 0 1 31 18ZM4.4 13A1.6 1.6 0 0 1 7.6 13ZM24.4 13A1.6 1.6 0 0 1 27.6 13ZM8.4 8.5A1.6 1.6 0 0 1 11.6 8.5ZM20.4 8.5A1.6 1.6 0 0 1 23.6 8.5ZM13.2 4.5A2.8 2.8 0 0 1 18.8 4.5Z"
          fill="currentColor"
        />
        <rect x="2.1" y="15.2" width="0.8" height="1.5" fill="currentColor" />
        <rect x="29.1" y="15.2" width="0.8" height="1.5" fill="currentColor" />
        <rect x="5.6" y="10" width="0.8" height="1.6" fill="currentColor" />
        <rect x="25.6" y="10" width="0.8" height="1.6" fill="currentColor" />
        <rect x="9.6" y="5.5" width="0.8" height="1.6" fill="currentColor" />
        <rect x="21.6" y="5.5" width="0.8" height="1.6" fill="currentColor" />
        <rect x="15.5" y="0.3" width="1" height="1.6" fill="currentColor" />
      </>
    ),
  },
  // North East: Kaziranga's one-horned rhinoceros in profile, head low, a single horn on the snout,
  // armour folds behind the shoulder and ahead of the hip.
  orange: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path
          d="M2.5 12.5C3 8.5 7 7 10.5 7.2C13 7.4 14.5 8.6 16.5 8.4C18 8.2 18.8 7.5 19.6 7.5L19.8 5L21.3 7.3L22.2 4.6L23.8 8.2C25.5 9 27 11 27.8 13.4L29.2 8.2Q30.4 11.5 30 14.8C31.2 15.8 31.5 18 30.8 19.6C29.5 21.2 27 21 25.5 20.5C24.6 21.5 24.2 22.5 24 23.5V29Q24 30.5 22.5 30.5H20.5Q19 30.5 19 29V23.5Q14.5 25 10 23.5V29Q10 30.5 8.5 30.5H6.5Q5 30.5 5 29V23C3 20.5 2.2 16.5 2.5 12.5ZM16.4 10.2Q18.4 15 17.4 22.2L18.4 22.4Q19.7 15 17.4 10ZM8.6 9Q10 15 8.8 21.8L9.8 22Q11.2 15 9.6 8.8ZM25.6 13.6A0.8 0.8 0 1 0 27.2 13.6A0.8 0.8 0 1 0 25.6 13.6Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <path d="M10.9 23V28.4Q10.9 29.6 12.1 29.6H12.5Q13.7 29.6 13.7 28.4V23Z" fill="currentColor" />
        <path d="M15.3 23V28.4Q15.3 29.6 16.5 29.6H16.9Q18.1 29.6 18.1 28.4V23Z" fill="currentColor" />
        <path
          d="M2.6 12.5Q1 15.5 1.4 19.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
        />
      </>
    ),
  },
  // NCR: India Gate, one tall arch between two piers, an overhanging cornice, a stepped attic
  // and the shallow bowl on top, all on a stepped plinth.
  red: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path d="M12 3A4 2 0 0 1 20 3Z" fill="currentColor" />
        <rect x="10" y="3" width="12" height="2.5" fill="currentColor" />
        <rect x="7" y="5.5" width="18" height="2.5" fill="currentColor" />
        <rect x="3.5" y="8.8" width="25" height="1.8" fill="currentColor" />
        <path
          d="M5 11.4H27V28H5ZM11.5 28V18.5A4.5 4.5 0 0 1 20.5 18.5V28Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <rect x="3" y="28" width="26" height="1.5" fill="currentColor" />
        <rect x="1" y="29.5" width="30" height="1.5" fill="currentColor" />
      </>
    ),
  },
  // Tamil Nadu: a gopuram, a gateway base under four tapering tiers, the barrel-vault roof on top
  // with its row of kalasha finials.
  yellow: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <rect x="12.4" y="0.8" width="1.2" height="2.6" fill="currentColor" />
        <rect x="15.4" y="0.8" width="1.2" height="2.6" fill="currentColor" />
        <rect x="18.4" y="0.8" width="1.2" height="2.6" fill="currentColor" />
        <path d="M9 6.6Q9 3.2 12.5 3.2H19.5Q23 3.2 23 6.6Z" fill="currentColor" />
        <path
          d="M11.5 7.2H20.5L21.5 9.9H10.5ZM15 9.9V8.6H17V9.9Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <path
          d="M10 10.6H22L23.5 13.9H8.5ZM15 13.9V12H17V13.9Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <path
          d="M8 14.6H24L25.5 17.9H6.5ZM15 17.9V16H17V17.9Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <path
          d="M6 18.6H26L27.5 22.3H4.5ZM15 22.3V20.2H17V22.3Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <path
          d="M3 23H29V31H3ZM13.5 31V27.5A2.5 2.5 0 0 1 18.5 27.5V31Z"
          fill="currentColor"
          fillRule="evenodd"
        />
      </>
    ),
  },
  // Goa: a coconut palm leaning off its sandbar over the sea, the sun going down on the water behind it.
  green: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path d="M18.5 23.5A6 6 0 0 1 30.5 23.5Z" fill="currentColor" />
        <path
          d="M6 27C6.5 20 9 13.5 13 9.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M13 9.5Q22 4.5 26 15Q20.5 9.5 13 9.5ZM13 9.5Q17 2 24.5 2.5Q17.5 4.5 13 9.5ZM13 9.5Q12.5 2.5 7 0.8Q10 5 13 9.5ZM13 9.5Q7 3.5 0.8 7Q7.5 6.5 13 9.5ZM13 9.5Q5 8.5 2.2 16.5Q7 11 13 9.5Z"
          fill="currentColor"
        />
        <circle cx="11.6" cy="11.6" r="1.4" fill="currentColor" />
        <circle cx="14.4" cy="11.4" r="1.4" fill="currentColor" />
        <path d="M0.8 27.6Q6 23.4 11.6 27.6Z" fill="currentColor" />
        <path
          d="M15 26.4Q17 25 19 26.4T23 26.4T27 26.4T31 26.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M1 30.2Q3.5 28.6 6 30.2T11 30.2T16 30.2T21 30.2T26 30.2T31 30.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </>
    ),
  },
  // Maharashtra: Gateway of India, a tall pointed arch in the centre block between domed turrets,
  // a low dome behind, and a lower wing with its own arch and turret on each side.
  dark_blue: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <path d="M12.8 8A3.2 3.2 0 0 1 19.2 8V10H12.8Z" fill="currentColor" />
        <rect x="15.5" y="3.2" width="1" height="2" fill="currentColor" />
        <path d="M8.4 10V6.4A1.4 1.4 0 0 1 11.2 6.4V10Z" fill="currentColor" />
        <path d="M20.8 10V6.4A1.4 1.4 0 0 1 23.6 6.4V10Z" fill="currentColor" />
        <rect x="9.4" y="3.4" width="0.8" height="1.8" fill="currentColor" />
        <rect x="21.8" y="3.4" width="0.8" height="1.8" fill="currentColor" />
        <path d="M0.8 15V12.2A1.2 1.2 0 0 1 3.2 12.2V15Z" fill="currentColor" />
        <path d="M28.8 15V12.2A1.2 1.2 0 0 1 31.2 12.2V15Z" fill="currentColor" />
        <path
          d="M8.4 10H23.6V15H31.2V29H0.8V15H8.4ZM12 29V19.5Q12 16 16 14.2Q20 16 20 19.5V29ZM3.4 29V22.5Q3.4 20.4 5.4 19.2Q7.4 20.4 7.4 22.5V29ZM24.6 29V22.5Q24.6 20.4 26.6 19.2Q28.6 20.4 28.6 22.5V29ZM11.6 11.2H20.4V12H11.6Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <rect x="0.5" y="29" width="31" height="2" fill="currentColor" />
      </>
    ),
  },
  // Himachal: two Himalayan peaks, a snow cap split off each by a zigzag gap, and two deodars
  // cut out of the foot of the slope.
  railroad: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <polygon points="15,1.5 18.45,8.4 16.9,6.8 15.5,9 14.1,7 13.3,8.5 11.8,8" fill="currentColor" />
        <polygon
          points="24,6.5 25.19,10.4 24.3,9.2 23.5,10.8 22.7,9.4 21.96,10"
          fill="currentColor"
        />
        <path
          d="M11.07 9.5L13.3 10L14.1 8.5L15.5 10.5L16.9 8.3L19.2 9.9L20.5 12.5L21.14 11.4L22.7 10.9L23.5 12.3L24.3 10.7L25.62 11.8L31.5 31H0.5ZM11 15.5L13.6 20.2H12.2L14.6 24.8H12.9L15.6 29.2H11.9V31H10.1V29.2H6.4L9.1 24.8H7.4L9.8 20.2H8.4ZM21.5 19.5L23.7 23.6H22.5L24.9 28.2H22.3V31H20.7V28.2H18.1L20.5 23.6H19.3Z"
          fill="currentColor"
          fillRule="evenodd"
        />
      </>
    ),
  },
  // Uttar Pradesh: Taj Mahal, the onion dome on its drum over a pointed iwan, a chhatri and stacked
  // niches on each side, a minaret at either end of the plinth.
  utility: {
    viewBox: '0 0 32 32',
    paths: (
      <>
        <rect x="15.6" y="0.3" width="0.8" height="2" fill="currentColor" />
        <path
          d="M12.8 11.8C10 9.5 10.8 5.2 14.2 3.8C15.3 3.3 15.8 2.6 16 1.2C16.2 2.6 16.7 3.3 17.8 3.8C21.2 5.2 22 9.5 19.2 11.8Z"
          fill="currentColor"
        />
        <rect x="12.5" y="11.8" width="7" height="2.7" fill="currentColor" />
        <path d="M7.8 16.5V15.4A1.7 1.7 0 0 1 11.2 15.4V16.5Z" fill="currentColor" />
        <path d="M20.8 16.5V15.4A1.7 1.7 0 0 1 24.2 15.4V16.5Z" fill="currentColor" />
        <path
          d="M7 16.5H11.5V14.5H20.5V16.5H25V28H7ZM13.5 28V21.5Q13.5 19 16 17.5Q18.5 19 18.5 21.5V28ZM8.3 21.6V19.6Q8.3 18.6 9.3 17.9Q10.3 18.6 10.3 19.6V21.6ZM21.7 21.6V19.6Q21.7 18.6 22.7 17.9Q23.7 18.6 23.7 19.6V21.6ZM8.3 26.8V24.6Q8.3 23.6 9.3 22.9Q10.3 23.6 10.3 24.6V26.8ZM21.7 26.8V24.6Q21.7 23.6 22.7 22.9Q23.7 23.6 23.7 24.6V26.8Z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <path d="M1.4 28V9.6H1V8.4H1.6A1.3 1.3 0 0 1 4.2 8.4H4.8V9.6H4.4V28Z" fill="currentColor" />
        <path
          d="M27.6 28V9.6H27.2V8.4H27.8A1.3 1.3 0 0 1 30.4 8.4H31V9.6H30.6V28Z"
          fill="currentColor"
        />
        <rect x="0.5" y="28" width="31" height="3" fill="currentColor" />
      </>
    ),
  },
};
