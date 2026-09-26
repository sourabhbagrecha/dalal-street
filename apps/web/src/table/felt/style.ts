import type { CSSProperties } from 'react';
import type { PropertyColor } from '@monopoly-deal/shared';
import { theme } from '../../theme';

/** Small render helpers every part of the felt shares. */
export const money = theme.formatMoney;
export const vars = (o: Record<string, string | number>) => o as CSSProperties;
export const colorOf = (c: PropertyColor) => theme.propertyColors[c] ?? '#888';
