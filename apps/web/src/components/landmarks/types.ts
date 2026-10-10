import type { ReactNode } from 'react';

/** One property-colour emblem: a viewBox and the single-colour shapes drawn in it (fill/stroke = currentColor). */
export interface Landmark {
  viewBox: string;
  paths: ReactNode;
}
