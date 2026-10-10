import { describe, expect, it } from 'vitest';
import { assertPropertyThemes, themedPropertyName } from '@monopoly-deal/shared';

describe('property themes', () => {
  it('re-skins every slot of every theme', () => {
    expect(() => assertPropertyThemes()).not.toThrow();
  });

  it('keeps the Indian city under the india theme', () => {
    expect(themedPropertyName('india', { color: 'dark_blue', name: 'Mumbai' })).toBe('Mumbai');
  });

  it('renames a card by its slot under other themes', () => {
    expect(themedPropertyName('classic', { color: 'dark_blue', name: 'Pune' })).toBe('Boardwalk');
    expect(themedPropertyName('europe', { color: 'dark_blue', name: 'Mumbai' })).toBe('Paris');
  });

  it('returns a name it does not know unchanged under a non-india theme', () => {
    expect(themedPropertyName('usa', { color: 'dark_blue', name: 'Nowhere' })).toBe('Nowhere');
  });
});
