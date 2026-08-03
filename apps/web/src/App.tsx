import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LocalGameApp } from './LocalGameApp';
import { GamePage } from './pages/GamePage';
import { LobbyPage } from './pages/LobbyPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/local" element={<LocalGameApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
