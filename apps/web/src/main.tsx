import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// cards.css first: it defines the card shell/faces, styles.css the placements
// that position those cards (hand fan, set stacking, cash pile). Both address
// a card through one class, so source order is what decides — the placement
// must win, and only this order guarantees it.
import './cards.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
