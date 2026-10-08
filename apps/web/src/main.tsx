import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The one global stylesheet entry, and it must stay the FIRST import: ES modules
// evaluate in import order and App eagerly pulls in TableScreen/LobbyShell (and so
// table.css/lobby.css), so anything imported above this line lands ahead of
// cards.css and loses every equal-specificity placement rule to it (the cash
// pile's stacked cards went from overlaid to a column that way).
// Its @import order is the cascade:
// cards.css first (the card shell/faces and sizing contract), then base.css
// (tokens/shell/shared primitives). Everything that places a card must load
// after cards.css - both address a card through one class, so source order
// decides and the placement must win. Per-surface CSS (styles/table.css,
// lobby.css, rules.css) is intentionally NOT imported here - each screen
// component imports its own, so it only ships to clients that reach that
// surface and still lands after cards.css; see table/TableScreen.tsx /
// lobby/LobbyShell.tsx / pages/RulesPage.tsx.
import './styles/index.css';
import { App } from './App';
// Importing this kicks off sound-effect preload (see soundEngine.ts) as early
// as possible, well before any table mounts and needs a sound played.
import './sound/soundEngine';
import { initPwa } from './pwa/pwa';
import { warmGlyphs } from './warmGlyphs';

initPwa();
warmGlyphs();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
