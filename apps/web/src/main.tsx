import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// cards.css first: it defines the card shell/faces, everything after it the
// placements that position those cards (hand fan, set stacking, cash pile).
// Both address a card through one class, so source order is what decides -
// the placement must win, and only this order guarantees it. styles.css
// (shell/tokens/shared primitives) loads next, then the split-out feature
// stylesheets, each of which may itself place cards and so must also load
// after cards.css. Route-only CSS (lobby, rules) is intentionally NOT
// imported here - it's imported by its own page component so it only ships
// to clients that visit that route; see App.tsx / LobbyPage.tsx / RoomPage.tsx
// / RulesPage.tsx.
import './cards.css';
import './styles.css';
import './styles/board.css';
import './styles/hand.css';
import './styles/side-panel.css';
import './styles/prompts.css';
import './styles/moments.css';
// Importing this kicks off sound-effect preload (see soundEngine.ts) as early
// as possible, well before any table mounts and needs a sound played.
import './sound/soundEngine';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
