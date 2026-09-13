import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DemoGameApp } from './DemoGameApp';
import { LocalGameApp } from './LocalGameApp';
import { CardGalleryPage } from './pages/CardGalleryPage';
import { GamePage } from './pages/GamePage';
import { LobbyPage } from './pages/LobbyPage';
import { RoomPage } from './pages/RoomPage';
import { ScratchpadPage } from './pages/ScratchpadPage';

// LobbyPage stays eager: it's the landing route ("/"), and RoomPage (also
// eager - room routes must stay eager) renders the same `.lobby__*` markup,
// so lobby.css is already pulled into the eager bundle via RoomPage's own
// import regardless of whether LobbyPage is lazy. Lazy-loading LobbyPage
// would add a Suspense flash for zero payload benefit. RulesPage is the one
// page whose CSS (rules.css) and content (the full card manual) have no
// other eager consumer, so it alone is lazy-loaded.
const RulesPage = lazy(() =>
  import('./pages/RulesPage').then((m) => ({ default: m.RulesPage })),
);

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LobbyPage />} />
          {/* A room's waiting area and, once started, its table. The URL is the
              bookmark: a refresh, a new tab or an invite link all land here and
              pick the seat back up from storage (see store/session.ts). */}
          <Route path="/rooms/:code" element={<RoomPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/local" element={<LocalGameApp />} />
          <Route path="/demo" element={<DemoGameApp />} />
          {/* Player-facing manual: how the game works plus every card in the
              110-card deck, grouped by type (see RulesPage.tsx). */}
          <Route path="/rules" element={<RulesPage />} />
          {/* Dev-only visual gallery for the action/money-10/Joker card face
              redesign (see ActionCardFaces.tsx) — not linked from the app. */}
          <Route path="/cards" element={<CardGalleryPage />} />
          {/* Dev-only design preview for whatever's currently being iterated
              on — not linked from the app, wiped/repurposed per exploration. */}
          <Route path="/scratchpad" element={<ScratchpadPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
