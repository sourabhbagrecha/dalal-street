import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// The one global stylesheet entry. Its @import order is the cascade:
// cards.css first (the card shell/faces and sizing contract), then base.css
// (tokens/shell/shared primitives). Everything that places a card must load
// after cards.css - both address a card through one class, so source order
// decides and the placement must win. Per-surface CSS (styles/table.css,
// lobby.css, rules.css) is intentionally NOT imported here - each screen
// component imports its own, so it only ships to clients that reach that
// surface and still lands after cards.css; see table/TableScreen.tsx /
// lobby/LobbyShell.tsx / pages/RulesPage.tsx.
import './styles/index.css';
// Importing this kicks off sound-effect preload (see soundEngine.ts) as early
// as possible, well before any table mounts and needs a sound played.
import './sound/soundEngine';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
