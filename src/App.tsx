import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeToggle } from './components/ThemeToggle';

const Home = lazy(() => import('./pages/Home'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const BlindTestStore = lazy(() => import('./pages/BlindTestStore'));
const EditPlaylist = lazy(() => import('./pages/EditPlaylist'));
const HostGame = lazy(() => import('./pages/HostGame'));
const HardwareDashboard = lazy(() => import('./pages/HardwareDashboard'));
const HardwareInventory = lazy(() => import('./pages/HardwareInventory'));
const HardwareTutorial = lazy(() => import('./pages/HardwareTutorial'));
const HardwareProvision = lazy(() => import('./pages/HardwareProvision'));
const AdminTournaments = lazy(() => import('./pages/AdminTournaments'));
const PlayerGame = lazy(() => import('./pages/PlayerGame'));
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'));
const PublicScreen = lazy(() => import('./pages/PublicScreen'));
const HostReturnScreen = lazy(() => import('./pages/HostReturnScreen'));
const SponsorScreen = lazy(() => import('./pages/SponsorScreen'));
const Playlists = lazy(() => import('./pages/Playlists'));

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center app-shell">Chargement...</div>}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/playlists" element={<Playlists />} />
                <Route path="/playlists/:playlistId" element={<EditPlaylist />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/store" element={<BlindTestStore />} />
                <Route path="/admin/playlist/:playlistId" element={<EditPlaylist />} />
                <Route path="/admin/game/:gameId" element={<HostGame />} />
                <Route path="/admin/game/:gameId/hardware" element={<HardwareDashboard />} />
                <Route path="/admin/hardware" element={<HardwareInventory />} />
                <Route path="/admin/hardware/tutorial" element={<HardwareTutorial />} />
                <Route path="/admin/hardware/provision" element={<HardwareProvision />} />
                <Route path="/admin/tournaments" element={<AdminTournaments />} />
                <Route path="/game/:gameId" element={<PlayerGame />} />
                <Route path="/player/profile/:publicId" element={<PlayerProfile />} />
                <Route path="/screen/:gameId" element={<PublicScreen />} />
                <Route path="/screen/:gameId/return" element={<HostReturnScreen />} />
                <Route path="/screen/:gameId/sponsor" element={<SponsorScreen />} />
              </Routes>
              <ThemeToggle />
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
