import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import Home from './pages/Home';
import AdminDashboard from './pages/AdminDashboard';
import EditPlaylist from './pages/EditPlaylist';
import HostGame from './pages/HostGame';
import PlayerGame from './pages/PlayerGame';
import PublicScreen from './pages/PublicScreen';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/playlist/:playlistId" element={<EditPlaylist />} />
          <Route path="/admin/game/:gameId" element={<HostGame />} />
          <Route path="/game/:gameId" element={<PlayerGame />} />
          <Route path="/screen/:gameId" element={<PublicScreen />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
