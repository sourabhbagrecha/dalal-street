import type { FixtureName } from '@monopoly-deal/engine';

export type { FixtureName };

/** All dev scenario fixture keys for the scenario dropdown. */
export const FIXTURE_NAMES: FixtureName[] = [
  'responsiveMidGame',
  'standardMidGame',
  'doubleRentCombo',
  'oneSetFromWinning',
  'emptyHand',
  'overHandLimit',
  'rentWithEmptyBank',
  'dealBreakerOnSetWithHotel',
  'debtCollectorChoice',
  'parallelRentCollection',
  'parallelBirthdayCollection',
  'doubleJustSayNoChain',
  'payBreaksCompletedSet',
  'insufficientPayment',
  'wildcardUsage',
];

export function fixtureLabel(name: FixtureName): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
