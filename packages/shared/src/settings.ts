import { z } from 'zod';

/**
 * Per-room settings the host picks before the first deal. They change how the
 * table reads (card titles, currency) and how long a turn may run — never a
 * rule: the engine deals the same deck and prices it the same way under every
 * combination. Locked once the game starts; a rematch keeps them.
 */

/** Turn clock choices, in seconds. `null` is "no timer": a turn never expires on its own. */
export const TURN_SECONDS_OPTIONS = [10, 30, 60, null] as const;
export type TurnSeconds = (typeof TURN_SECONDS_OPTIONS)[number];

/** Which names the property cards wear — see propertyThemes.ts. */
export const PROPERTY_THEME_IDS = ['india', 'classic', 'usa', 'europe'] as const;
export type PropertyThemeId = (typeof PROPERTY_THEME_IDS)[number];

/** `MONO` is the Classic deck's own money, the struck-through M; it is no real-world currency. */
export const CURRENCY_CODES = ['INR', 'USD', 'EUR', 'MONO'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** The currency a property theme is dealt with: the host picks the theme, the money follows. */
export const THEME_CURRENCY: Record<PropertyThemeId, CurrencyCode> = {
  india: 'INR',
  classic: 'MONO',
  usa: 'USD',
  europe: 'EUR',
};

export const roomSettingsSchema = z
  .object({
    turnSeconds: z.union([z.literal(10), z.literal(30), z.literal(60), z.null()]),
    propertyTheme: z.enum(PROPERTY_THEME_IDS),
    currency: z.enum(CURRENCY_CODES),
  })
  .strict();

export type RoomSettings = z.infer<typeof roomSettingsSchema>;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  turnSeconds: 60,
  propertyTheme: 'india',
  currency: 'INR',
};

/** The turn length every timing constant is written against; other choices scale from it. */
export const STANDARD_TURN_SECONDS = 60;
