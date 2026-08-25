import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DemoGameApp } from './DemoGameApp';
import { LocalGameApp } from './LocalGameApp';
import { CardGalleryPage } from './pages/CardGalleryPage';
import { GamePage } from './pages/GamePage';
import { LobbyPage } from './pages/LobbyPage';
import { RulesPage } from './pages/RulesPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/local" element={<LocalGameApp />} />
        <Route path="/demo" element={<DemoGameApp />} />
        {/* Player-facing manual: how the game works plus every card in the
            110-card deck, grouped by type (see RulesPage.tsx). */}
        <Route path="/rules" element={<RulesPage />} />
        {/* Dev-only visual gallery for the action/money-10/Joker card face
            redesign (see ActionCardFaces.tsx) — not linked from the app. */}
        <Route path="/cards" element={<CardGalleryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
