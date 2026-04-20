import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { socket } from '../lib/socket';
import { BlindTestSession, Playlist, Track, MediaType } from '../types';
import { Plus, Trash2, Play, Music, LogOut, Youtube, Edit, Flag, Upload, Mic, Film, Image as ImageIcon, Type, Link, Settings2, Cpu, BookOpen } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const THEME_PRESETS = [
  'Années 80', 'Années 90', 'Années 2000 FR', 'Films cultes',
  'Disney', 'Rap FR', 'Rock classique', 'Hits soirée',
  'Bandes originales', 'Séries TV', 'Jeux vidéo', 'Génériques anime',
];

const DEFAULT_TEAM_CONFIG = [
  { id: 'red', name: 'Equipe Rouge', color: '#ef4444', enabled: true },
  { id: 'blue', name: 'Equipe Bleue', color: '#3b82f6', enabled: true },
  { id: 'green', name: 'Equipe Verte', color: '#22c55e', enabled: true },
  { id: 'yellow', name: 'Equipe Jaune', color: '#eab308', enabled: true },
];

const MEDIA_TYPE_ICONS: Record<string, React.ReactNode> = {
  audio: <Music className="w-4 h-4" />,
  video: <Film className="w-4 h-4" />,
  image: <ImageIcon className="w-4 h-4" />,
  text: <Type className="w-4 h-4" />,
  voice: <Mic className="w-4 h-4" />,
  youtube: <Youtube className="w-4 h-4" />,
  url: <Link className="w-4 h-4" />,
};

function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

function createTeamConfigItem(index: number) {
  return {
    id: `team-${uuidv4().slice(0, 8)}`,
    name: `Equipe ${index + 1}`,
    color: '#a78bfa',
    enabled: true,
  };
}

function rowToPlaylist(row: any): Playlist {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    tracks: Array.isArray(row.tracks) ? (row.tracks as Track[]) : (typeof row.tracks === 'string' ? JSON.parse(row.tracks) : []),
    createdAt: row.created_at,
    visibility: row.visibility || 'private',
  };
}

function rowToBlindTest(row: any): BlindTestSession {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    mode: row.mode,
    status: row.status,
    createdAt: row.created_at,
    endedAt: row.ended_at || undefined,
    gameId: row.game_id,
    hostToken: row.host_token || undefined,
    playlistId: row.playlist_id || undefined,
    sourceUrl: row.source_url || undefined,
  };
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo, warning: toastWarning } = useToast();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [blindTests, setBlindTests] = useState<BlindTestSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [publicPlaylists, setPublicPlaylists] = useState<Playlist[]>([]);
  const [playlistSearch, setPlaylistSearch] = useState('');
  const [serverMetrics, setServerMetrics] = useState<{ activeGames: number; activeSockets: number; eventsTotal: number; gamesCreated: number } | null>(null);

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardName, setWizardName] = useState('');
  const [wizardThemePrompt, setWizardThemePrompt] = useState('');
  const [wizardTracks, setWizardTracks] = useState<Track[]>([]);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [wizardPreviewTrackId, setWizardPreviewTrackId] = useState<string | null>(null);
  const [blindTestsTab, setBlindTestsTab] = useState<'active' | 'finished'>('active');
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [pendingPlaylistLaunch, setPendingPlaylistLaunch] = useState<Playlist | null>(null);
  const [pendingYoutubeLaunch, setPendingYoutubeLaunch] = useState<{ videoId: string; sourceUrl: string } | null>(null);
  const [launchOptions, setLaunchOptions] = useState({
    isTeamMode: false,
    shuffleQuestions: false,
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
    theme: 'dark' as 'dark' | 'neon' | 'retro' | 'minimal',
    enableBonuses: true,
    onboardingEnabled: true,
    tutorialSeconds: 10,
    tournamentMode: false,
    rules: {
      wrongAnswerPenalty: -1,
      progressiveLock: true,
      progressiveLockBaseMs: 5000,
      antiSpamPenalty: -1,
    },
    teamConfig: DEFAULT_TEAM_CONFIG,
  });

  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    let active = true;

    const loadData = async () => {
      try {
        const [playlistsRes, blindTestsRes, publicPlaylistsRes] = await Promise.all([
          api.playlists.list(),
          api.blindtests.list(),
          api.playlists.listPublic(),
        ]);
        if (!active) return;
        setPlaylists((playlistsRes.playlists || []).map(rowToPlaylist));
        setBlindTests((blindTestsRes.blindtests || []).map(rowToBlindTest));
        setPublicPlaylists((publicPlaylistsRes.playlists || []).map(rowToPlaylist));
      } catch (err) {
        console.error('Erreur chargement données', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadData();
    const refreshId = window.setInterval(() => void loadData(), 6000);

    return () => {
      active = false;
      window.clearInterval(refreshId);
    };
  }, [user, navigate]);

  useEffect(() => {
    let active = true;
    const env = (import.meta as any).env as Record<string, unknown> | undefined;
    const metricsToken = env?.VITE_METRICS_TOKEN as string | undefined;
    const isProd = Boolean(env?.PROD);
    const hasMetricsToken = Boolean(metricsToken && metricsToken.trim().length > 0);

    // En production, /api/metrics exige un token serveur.
    // Sans token frontend explicite, on n'essaie pas de poller pour éviter les 401 en boucle.
    if (isProd && !hasMetricsToken) {
      return () => {
        active = false;
      };
    }

    const pollMetrics = async () => {
      try {
        const headers: Record<string, string> = {};
        if (hasMetricsToken && metricsToken) {
          headers['x-metrics-token'] = metricsToken;
        }
        const res = await fetch('/api/metrics', { headers, credentials: 'include' });
        if (res.status === 401) {
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setServerMetrics({
            activeGames: Number(data.activeGames || 0),
            activeSockets: Number(data.activeSockets || 0),
            eventsTotal: Number(data.eventsTotal || 0),
            gamesCreated: Number(data.gamesCreated || 0),
          });
        }
      } catch {
        // ignore
      }
    };
    void pollMetrics();
    const id = window.setInterval(() => void pollMetrics(), 10000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('blindtest_admin_sessions_cache', JSON.stringify(blindTests));
    } catch {
      // ignore quota/localStorage errors
    }
  }, [blindTests]);

  const saveSession = async (session: Omit<BlindTestSession, 'id'>) => {
    try {
      await api.blindtests.create({
        title: session.title,
        mode: session.mode,
        status: session.status,
        gameId: session.gameId,
        hostToken: session.hostToken,
        playlistId: session.playlistId,
        sourceUrl: session.sourceUrl,
      });
    } catch (err) {
      console.error('Erreur sauvegarde session', err);
    }
  };

  const getDefaultDurationByDifficulty = (value: 'easy' | 'medium' | 'hard') => {
    if (value === 'easy') return 30;
    if (value === 'hard') return 12;
    return 20;
  };

  const createPlaylistFromWizard = async (tracks: Track[]): Promise<string> => {
    if (!user) throw new Error('Utilisateur non connecté');
    const name = wizardName.trim() || `BlindTest ${new Date().toLocaleDateString('fr-FR')}`;
    const { playlist } = await api.playlists.create(name, tracks, 'private');
    return playlist.id as string;
  };

  const computeWizardQuality = (tracks: Track[]) => {
    if (tracks.length === 0) {
      return { score: 0, checks: ['Aucune piste'], duplicates: 0, missingFields: 0 };
    }
    const keys = new Map<string, number>();
    let missingFields = 0;
    tracks.forEach((t) => {
      const k = `${(t.title || '').trim().toLowerCase()}::${(t.artist || '').trim().toLowerCase()}`;
      if (k !== '::') keys.set(k, (keys.get(k) || 0) + 1);
      if (!t.title?.trim() || !t.artist?.trim()) missingFields += 1;
    });
    const duplicates = Array.from(keys.values()).filter((v) => v > 1).length;
    const penalty = duplicates * 8 + missingFields * 5;
    const score = Math.max(0, 100 - penalty);
    const checks = [
      duplicates === 0 ? 'Aucun doublon détecté' : `${duplicates} doublon(s) détecté(s)`,
      missingFields === 0 ? 'Toutes les pistes sont renseignées' : `${missingFields} piste(s) incomplète(s)`,
    ];
    return { score, checks, duplicates, missingFields };
  };

  const updateWizardTrack = (trackId: string, updates: Partial<Track>) => {
    setWizardTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...updates } : t)));
  };

  const removeWizardTrack = (trackId: string) => {
    setWizardTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  const addManualTrack = () => {
    const newTrack: Track = {
      id: uuidv4(),
      title: '',
      artist: '',
      mediaType: 'youtube',
      mediaUrl: '',
      duration: getDefaultDurationByDifficulty(launchOptions.difficulty),
      startTime: 0,
    };
    setWizardTracks((prev) => [...prev, newTrack]);
  };

  const toYouTubeEmbedUrl = (url?: string) => {
    if (!url) return '';
    const id = extractYoutubeId(url) || url;
    return `https://www.youtube.com/embed/${id}`;
  };

  const uploadWizardFiles = async (files: FileList | File[]) => {
    if (!user) {
      setWizardError('Veuillez vous connecter pour importer des fichiers');
      return;
    }
    const list = Array.from(files);
    if (!list.length) return;
    setWizardBusy(true);
    setWizardError('');
    try {
      const uploadedTracks: Track[] = [];
      for (const file of list) {
        const { url } = await api.playlists.upload('wizard', file);
        const mediaType: Track['mediaType'] = file.type.startsWith('audio/')
          ? 'audio'
          : file.type.startsWith('video/')
            ? 'video'
            : file.type.startsWith('image/')
              ? 'image'
              : 'url';
        uploadedTracks.push({
          id: uuidv4(),
          title: file.name.replace(/\.[^.]+$/, ''),
          artist: '',
          mediaType,
          mediaUrl: url,
          url,
          duration: getDefaultDurationByDifficulty(launchOptions.difficulty),
          startTime: 0,
        });
      }
      setWizardTracks((prev) => [...prev, ...uploadedTracks]);
      setWizardStep(3);
    } catch (error) {
      setWizardError((error as Error).message || 'Erreur upload fichiers');
    } finally {
      setWizardBusy(false);
    }
  };

  const finalizeWizard = async () => {
    try {
      setWizardBusy(true);
      setWizardError('');
      if (!wizardName.trim()) throw new Error('Donnez un nom au blind test');
      if (wizardTracks.length === 0) throw new Error('Ajoutez des pistes');
      const playlistId = await createPlaylistFromWizard(wizardTracks);
      setPendingPlaylistLaunch({
        id: playlistId,
        name: wizardName.trim(),
        ownerId: user?.id || '',
        tracks: wizardTracks,
        createdAt: Date.now(),
        visibility: 'private',
      });
      setShowLaunchModal(true);
      setWizardStep(1);
      setWizardName('');
      setWizardThemePrompt('');
      setWizardTracks([]);
    } catch (error) {
      setWizardError((error as Error).message || 'Erreur création');
    } finally {
      setWizardBusy(false);
    }
  };

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim() || !user) return;
    try {
      const { playlist } = await api.playlists.create(newPlaylistName, [], 'private');
      setNewPlaylistName('');
      setIsCreating(false);
      navigate(`/admin/playlist/${playlist.id}`);
    } catch (error) {
      toastError((error as Error).message || 'Erreur création playlist');
    }
  };

  const handleDeletePlaylist = async (id: string) => {
    try {
      await api.playlists.delete(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      toastError((error as Error).message || 'Erreur suppression playlist');
    }
  };

  const launchPlaylistGame = (playlist: Playlist) => {
    if (launchOptions.isTeamMode && launchOptions.teamConfig.filter((team) => team.enabled).length === 0) {
      toastWarning('Activez au moins une équipe avant de lancer la partie.');
      return;
    }
    socket.emit('host:createGame', playlist.tracks, launchOptions, async (response: any) => {
      if (response.success) {
        sessionStorage.setItem(`blindtest_host_${response.gameId}`, response.hostToken);
        if (user) {
          void saveSession({
            ownerId: user.id,
            title: playlist.name,
            mode: 'playlist',
            status: 'active',
            createdAt: Date.now(),
            gameId: response.gameId,
            hostToken: response.hostToken,
            playlistId: playlist.id,
          });
        }
        navigate(`/admin/game/${response.gameId}`);
      } else {
        toastError(response.error || 'Erreur lors de la création de la partie');
      }
    });
  };

  const handleLaunchYoutubeGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl) return;

    const videoId = extractYoutubeId(youtubeUrl);
    if (!videoId) {
      toastError("URL YouTube invalide");
      return;
    }

    setPendingYoutubeLaunch({ videoId, sourceUrl: youtubeUrl });
    setShowLaunchModal(true);
  };

  const launchYoutubeGame = (videoId: string, sourceUrl: string) => {
    if (launchOptions.isTeamMode && launchOptions.teamConfig.filter((team) => team.enabled).length === 0) {
      toastWarning('Activez au moins une équipe avant de lancer la partie.');
      return;
    }
    socket.emit('host:createYoutubeGame', videoId, launchOptions, async (response: any) => {
      if (response.success) {
        sessionStorage.setItem(`blindtest_host_${response.gameId}`, response.hostToken);
        if (user) {
          void saveSession({
            ownerId: user.id,
            title: `YouTube ${videoId}`,
            mode: 'youtube',
            status: 'active',
            createdAt: Date.now(),
            gameId: response.gameId,
            hostToken: response.hostToken,
            sourceUrl,
          });
        }
        navigate(`/admin/game/${response.gameId}`);
      } else {
        toastError(response.error || 'Erreur lors de la création de la partie YouTube');
      }
    });
  };

  const handleTogglePlaylistVisibility = async (playlist: Playlist) => {
    try {
      const newVisibility = playlist.visibility === 'public' ? 'private' : 'public';
      await api.playlists.update(playlist.id, { visibility: newVisibility });
      setPlaylists((prev) =>
        prev.map((p) => (p.id === playlist.id ? { ...p, visibility: newVisibility } : p)),
      );
    } catch (error) {
      toastError((error as Error).message || 'Erreur mise à jour visibilité');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleEndBlindTest = (session: BlindTestSession) => {
    if (session.status === 'finished') return;
    const hostToken = sessionStorage.getItem(`blindtest_host_${session.gameId}`) || session.hostToken;
    setEndingSessionId(session.id);

    const forceCloseFromApi = async () => {
      const endedAt = Date.now();
      try {
        let result: { endedAt: number } | null = null;
        try {
          result = await api.blindtests.forceEnd(session.id);
        } catch (forceError) {
          // Compatibilité serveur: si la route /force-end n'existe pas encore (404),
          // on repasse sur la route PATCH historique.
          await api.blindtests.update(session.id, { status: 'finished', endedAt });
          result = { endedAt };
        }
        setBlindTests((prev) =>
          prev.map((bt) => (bt.id === session.id ? { ...bt, status: 'finished', endedAt: result.endedAt } : bt)),
        );
        toastSuccess('Partie marquée comme terminée.');
      } catch (error) {
        console.error('Erreur clôture blindtest', error);
        toastError((error as Error).message || "Impossible de terminer cette partie");
      } finally {
        setEndingSessionId(null);
      }
    };

    if (!hostToken) {
      void forceCloseFromApi();
      return;
    }

    socket.emit('host:endGame', { gameId: session.gameId, hostToken }, async (response: any) => {
      if (!response?.success) {
        void forceCloseFromApi();
        return;
      }
      try {
        await api.blindtests.update(session.id, { status: 'finished', endedAt: Date.now() });
        setBlindTests((prev) =>
          prev.map((bt) => (bt.id === session.id ? { ...bt, status: 'finished', endedAt: Date.now() } : bt)),
        );
      } catch (error) {
        console.error('Erreur fin blindtest', error);
      } finally {
        setEndingSessionId(null);
      }
    });
  };

  const handleLaunchWithOptions = () => {
    if (pendingPlaylistLaunch) {
      launchPlaylistGame(pendingPlaylistLaunch);
    } else if (pendingYoutubeLaunch) {
      launchYoutubeGame(pendingYoutubeLaunch.videoId, pendingYoutubeLaunch.sourceUrl);
    }
    setShowLaunchModal(false);
    setPendingPlaylistLaunch(null);
    setPendingYoutubeLaunch(null);
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement...</div>;
  }

  const previewTrack = wizardTracks.find((t) => t.id === wizardPreviewTrackId) || wizardTracks[0];
  const activeBlindTests = blindTests.filter((session) => session.status === 'active');
  const finishedBlindTests = blindTests.filter((session) => session.status === 'finished');
  const visibleBlindTests = blindTestsTab === 'active' ? activeBlindTests : finishedBlindTests;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 md:p-8 app-shell">
      <div className="max-w-5xl mx-auto">

        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Espace Animateur</h1>
            <p className="text-zinc-400 mt-1">Dashboard simplifié pour créer et lancer rapidement</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/hardware')}
              className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-xl px-4 py-2 text-sm flex items-center gap-2"
            >
              <Cpu className="w-4 h-4" />
              Matériel
            </button>
            <button
              onClick={() => navigate('/admin/hardware/tutorial')}
              className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-xl px-4 py-2 text-sm flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Tuto buzzer
            </button>
            <button
              onClick={() => navigate('/admin/settings')}
              className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-xl px-4 py-2 text-sm flex items-center gap-2"
            >
              <Settings2 className="w-4 h-4" />
              Paramètres
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </div>

        {/* Metrics */}
        {serverMetrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[
              { label: 'Parties actives', value: serverMetrics.activeGames },
              { label: 'Sockets actifs', value: serverMetrics.activeSockets },
              { label: 'Events total', value: serverMetrics.eventsTotal },
              { label: 'Parties créées', value: serverMetrics.gamesCreated },
            ].map(({ label, value }) => (
              <div key={label} className="bg-zinc-900 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Wizard Création */}
        <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6 mb-8 app-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold">Créer un Blind Test</h2>
            <div className="flex gap-1">
              {([1, 2, 3] as const).map((s) => (
                <div key={s} className={`w-2 h-2 rounded-full ${wizardStep >= s ? 'bg-indigo-500' : 'bg-zinc-700'}`} />
              ))}
            </div>
          </div>
          {wizardError && <div className="mb-4 bg-red-500/10 text-red-400 p-3 rounded-lg text-sm">{wizardError}</div>}

          {wizardStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Nom du blind test *</label>
                <input
                  type="text"
                  value={wizardName}
                  onChange={(e) => setWizardName(e.target.value)}
                  placeholder="Ex: Blind Test Films & Séries"
                  className="w-full bg-zinc-950 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Thème / Catégorie</label>
                <div className="flex flex-wrap gap-2">
                  {THEME_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setWizardThemePrompt(preset)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        wizardThemePrompt === preset
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'border-white/15 bg-zinc-950 hover:bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setWizardStep(2)}
                disabled={!wizardName.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Continuer →
              </button>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-5">
              <p className="text-sm text-zinc-400">
                Ajoutez vos pistes : <span className="text-white">uploadez des fichiers</span> (audio, vidéo, image, voix) ou <span className="text-white">collez des liens YouTube</span>.
              </p>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  void uploadWizardFiles(e.dataTransfer.files);
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragActive ? 'border-indigo-400 bg-indigo-500/10' : 'border-white/15 bg-zinc-950 hover:border-white/30'
                }`}
              >
                <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-3" />
                <p className="text-sm text-zinc-300 mb-1">Glisse-dépose tes fichiers ici</p>
                <p className="text-xs text-zinc-500 mb-3">Audio (MP3, WAV), Vidéo (MP4), Image (JPG, PNG), Voix (WebM)</p>
                <label className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 cursor-pointer px-4 py-2 rounded-lg text-sm transition-colors">
                  <Upload className="w-4 h-4" />
                  Choisir des fichiers
                  <input
                    type="file"
                    multiple
                    accept="audio/*,video/*,image/*"
                    onChange={(e) => e.target.files && void uploadWizardFiles(e.target.files)}
                    className="hidden"
                  />
                </label>
                {wizardBusy && <p className="text-xs text-indigo-400 mt-2">Upload en cours...</p>}
              </div>

              <div className="bg-zinc-950 border border-white/10 rounded-xl p-4">
                <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-red-400" />
                  Ou ajoutez des pistes YouTube
                </h3>
                <button
                  onClick={addManualTrack}
                  className="text-sm bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter une piste manuellement
                </button>
              </div>

              {wizardTracks.length > 0 && (
                <div className="bg-zinc-950 border border-white/10 rounded-xl p-3 space-y-2 max-h-60 overflow-y-auto">
                  <p className="text-xs text-zinc-500 mb-2">{wizardTracks.length} piste(s) ajoutée(s)</p>
                  {wizardTracks.map((t, i) => (
                    <div key={t.id} className="flex items-center gap-2 bg-zinc-900 rounded p-2">
                      <span className="text-xs text-zinc-500 w-5 text-right">{i + 1}</span>
                      <span className="text-zinc-400">{MEDIA_TYPE_ICONS[t.mediaType || 'url']}</span>
                      <span className="flex-1 text-xs truncate">{t.title || <span className="text-zinc-500">Sans titre</span>}</span>
                      <button onClick={() => removeWizardTrack(t.id)} className="text-red-400 hover:text-red-300 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setWizardStep(1)} className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm">← Retour</button>
                <button
                  onClick={() => setWizardStep(3)}
                  disabled={wizardTracks.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2 rounded-lg text-sm"
                >
                  Réviser et lancer →
                </button>
              </div>
            </div>
          )}

          {wizardStep === 3 && (
            <div className="space-y-4">
              {(() => {
                const quality = computeWizardQuality(wizardTracks);
                return (
                  <div className="bg-zinc-950 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold">Qualité de la playlist</p>
                      <span className={`text-lg font-bold ${quality.score >= 80 ? 'text-emerald-400' : quality.score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                        {quality.score}/100
                      </span>
                    </div>
                    <ul className="text-xs text-zinc-400 space-y-1">
                      {quality.checks.map((c) => <li key={c}>• {c}</li>)}
                    </ul>
                  </div>
                );
              })()}

              <div className="bg-zinc-950 border border-white/10 rounded-xl p-3 max-h-80 overflow-y-auto space-y-2">
                {wizardTracks.length === 0 && <p className="text-xs text-zinc-500">Aucune piste.</p>}
                {wizardTracks.map((track, index) => (
                  <div key={track.id} className="bg-zinc-900 rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <span className="col-span-1 text-xs text-zinc-500">{index + 1}</span>
                      <div className="col-span-4">
                        <input
                          value={track.title}
                          onChange={(e) => updateWizardTrack(track.id, { title: e.target.value })}
                          placeholder="Titre"
                          className="w-full bg-zinc-800 border border-white/10 rounded px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          value={track.artist}
                          onChange={(e) => updateWizardTrack(track.id, { artist: e.target.value })}
                          placeholder="Artiste / Film"
                          className="w-full bg-zinc-800 border border-white/10 rounded px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min={5}
                          max={300}
                          value={track.duration || 20}
                          onChange={(e) => updateWizardTrack(track.id, { duration: Number(e.target.value) || 20 })}
                          className="w-full bg-zinc-800 border border-white/10 rounded px-2 py-1 text-xs"
                          title="Durée (s)"
                        />
                      </div>
                      <div className="col-span-2 flex gap-1 justify-end">
                        <button
                          onClick={() => setWizardPreviewTrackId(track.id)}
                          className="text-xs bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded px-2 py-1"
                        >
                          ▶
                        </button>
                        <button
                          onClick={() => removeWizardTrack(track.id)}
                          className="text-xs bg-red-600/20 border border-red-500/30 text-red-300 rounded px-2 py-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {(track.mediaType === 'youtube' || !track.mediaUrl) && (
                      <input
                        value={track.mediaUrl || ''}
                        onChange={(e) => updateWizardTrack(track.id, { mediaUrl: e.target.value, url: e.target.value })}
                        placeholder="URL YouTube (https://youtu.be/...)"
                        className="w-full bg-zinc-800 border border-white/10 rounded px-2 py-1 text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>

              {previewTrack && (() => {
                const source = previewTrack.mediaUrl || previewTrack.url || '';
                return (
                  <div className="bg-zinc-950 border border-white/10 rounded-lg p-3">
                    <p className="text-xs text-zinc-500 mb-2">
                      Préécoute: <span className="text-zinc-300">{previewTrack.title || 'Sans titre'}</span>
                      {previewTrack.artist && <> — {previewTrack.artist}</>}
                    </p>
                    {(previewTrack.mediaType === 'audio' || previewTrack.mediaType === 'voice' || source.match(/\.(mp3|wav|ogg|webm)(\?|$)/i)) && (
                      <audio controls src={source} className="w-full" />
                    )}
                    {(previewTrack.mediaType === 'video' || source.match(/\.(mp4|webm|mov)(\?|$)/i)) && (
                      <video controls src={source} className="w-full max-h-48 rounded" />
                    )}
                    {(previewTrack.mediaType === 'youtube' || source.includes('youtube.com') || source.includes('youtu.be')) && source && (
                      <iframe
                        src={toYouTubeEmbedUrl(source)}
                        className="w-full h-48 rounded border border-white/10"
                        allow="autoplay; encrypted-media"
                      />
                    )}
                    {previewTrack.mediaType === 'image' && source && (
                      <img src={source} alt="preview" className="max-h-48 rounded mx-auto" />
                    )}
                    {previewTrack.mediaType === 'text' && (
                      <div className="text-sm text-zinc-300 bg-zinc-900 rounded p-3">{previewTrack.textContent || 'Aucun texte'}</div>
                    )}
                  </div>
                );
              })()}

              <div className="flex gap-3">
                <button onClick={() => setWizardStep(2)} className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm">← Retour</button>
                <button
                  onClick={() => void finalizeWizard()}
                  disabled={wizardBusy}
                  className="bg-emerald-600 hover:bg-emerald-500 px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {wizardBusy ? 'Création...' : 'Créer et lancer la partie'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Partie YouTube directe */}
        <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6 mb-8 app-card">
          <h2 className="text-xl font-semibold flex items-center gap-2 mb-3">
            <Youtube className="w-5 h-5 text-red-500" />
            Partie YouTube (vidéo unique)
          </h2>
          <p className="text-zinc-400 mb-4 text-sm">
            Collez le lien d'une vidéo YouTube (ex: blind test de 1h) — les joueurs buzzent pendant la vidéo.
          </p>
          <form onSubmit={handleLaunchYoutubeGame} className="flex gap-3">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              type="submit"
              className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Lancer
            </button>
          </form>
        </div>

        {/* Bibliothèque partagée */}
        {publicPlaylists.length > 0 && (
          <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6 mb-8 app-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Bibliothèque partagée</h2>
              <input
                type="text"
                value={playlistSearch}
                onChange={(e) => setPlaylistSearch(e.target.value)}
                placeholder="Rechercher..."
                className="bg-zinc-950 border border-white/10 rounded-lg px-4 py-2 text-sm w-64"
              />
            </div>
            <div className="grid gap-3">
              {publicPlaylists
                .filter((p) => `${p.name} ${(p.tracks || []).map((t) => `${t.title} ${t.artist}`).join(' ')}`.toLowerCase().includes(playlistSearch.toLowerCase()))
                .slice(0, 8)
                .map((playlist) => (
                  <div key={playlist.id} className="bg-zinc-950 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{playlist.name}</p>
                      <p className="text-xs text-zinc-500">{playlist.tracks.length} pistes • public</p>
                    </div>
                    <button
                      onClick={() => {
                        setPendingPlaylistLaunch(playlist);
                        setShowLaunchModal(true);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-sm"
                    >
                      Lancer
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Vos Blind Tests */}
        <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6 mb-8 app-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Flag className="w-5 h-5 text-amber-400" />
              Vos Blind Tests
            </h2>
            <span className="text-sm text-zinc-500">{blindTests.length} session(s)</span>
          </div>

          <div className="inline-flex items-center gap-1 bg-zinc-950 border border-white/10 rounded-xl p-1 mb-4">
            <button
              onClick={() => setBlindTestsTab('active')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                blindTestsTab === 'active'
                  ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              En cours ({activeBlindTests.length})
            </button>
            <button
              onClick={() => setBlindTestsTab('finished')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                blindTestsTab === 'finished'
                  ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Terminés ({finishedBlindTests.length})
            </button>
          </div>

          {visibleBlindTests.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              {blindTestsTab === 'active' ? 'Aucun quiz en cours.' : 'Aucun quiz terminé.'}
            </div>
          ) : (
            <div className="grid gap-2">
              {visibleBlindTests.map((session) => (
                <div key={session.id} className="bg-zinc-950 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{session.title}</p>
                    <p className="text-xs text-zinc-400">
                      Mode: {session.mode} • Code: <span className="font-mono">{session.gameId}</span>
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {new Date(session.createdAt).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full border ${session.status === 'active' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-zinc-400 border-white/10 bg-zinc-800'}`}>
                      {session.status === 'active' ? 'Active' : 'Terminée'}
                    </span>
                    {session.status === 'active' && (
                      <>
                        <button
                          onClick={() => navigate(`/admin/game/${session.gameId}`)}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                        >
                          Reprendre
                        </button>
                        <button
                          onClick={() => handleEndBlindTest(session)}
                          disabled={endingSessionId === session.id}
                          className="bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 text-red-400 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/20"
                        >
                          {endingSessionId === session.id ? 'Arrêt...' : 'Terminer'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vos Playlists */}
        <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6 mb-8 app-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Music className="w-5 h-5 text-indigo-400" />
              Vos Playlists
            </h2>
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Nouvelle Playlist
            </button>
          </div>

          {isCreating && (
            <form onSubmit={handleCreatePlaylist} className="mb-6 flex gap-3">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Nom de la playlist..."
                className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <button
                type="submit"
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Créer
              </button>
            </form>
          )}

          {playlists.length === 0 ? (
            <div className="text-center py-10 text-zinc-500">
              Aucune playlist. Créez-en une ou utilisez le wizard ci-dessus !
            </div>
          ) : (
            <div className="grid gap-3">
              {playlists.map((playlist) => (
                <div key={playlist.id} className="bg-zinc-950 border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-white/10 transition-colors">
                  <div>
                    <h3 className="font-medium">{playlist.name}</h3>
                    <p className="text-sm text-zinc-500">{playlist.tracks.length} pistes</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(`/admin/playlist/${playlist.id}`)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                    >
                      <Edit className="w-4 h-4" />
                      Éditer
                    </button>
                    <button
                      onClick={() => {
                        setPendingPlaylistLaunch(playlist);
                        setShowLaunchModal(true);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
                    >
                      <Play className="w-4 h-4" />
                      Lancer
                    </button>
                    <button
                      onClick={() => handleTogglePlaylistVisibility(playlist)}
                      className="text-xs px-3 py-2 rounded-lg border border-white/10 bg-zinc-900 hover:bg-zinc-800"
                    >
                      {playlist.visibility === 'public' ? 'Public' : 'Privée'}
                    </button>
                    <button
                      onClick={() => handleDeletePlaylist(playlist.id)}
                      className="text-zinc-500 hover:text-red-400 p-2 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showLaunchModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-4">
              <h3 className="text-xl font-semibold">Options de lancement</h3>
              <p className="text-sm text-zinc-400">
                Configure cette partie maintenant. Ces options seront appliquées uniquement à ce lancement.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm space-y-2">
                  <span className="block text-zinc-300">Difficulté</span>
                  <select
                    value={launchOptions.difficulty}
                    onChange={(e) => setLaunchOptions((prev) => ({ ...prev, difficulty: e.target.value as 'easy' | 'medium' | 'hard' }))}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2"
                  >
                    <option value="easy">Facile (30s)</option>
                    <option value="medium">Moyen (20s)</option>
                    <option value="hard">Difficile (12s)</option>
                  </select>
                </label>
                <label className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm space-y-2">
                  <span className="block text-zinc-300">Thème visuel</span>
                  <select
                    value={launchOptions.theme}
                    onChange={(e) => setLaunchOptions((prev) => ({ ...prev, theme: e.target.value as 'dark' | 'neon' | 'retro' | 'minimal' }))}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2"
                  >
                    <option value="dark">Dark</option>
                    <option value="neon">Neon</option>
                    <option value="retro">Retro</option>
                    <option value="minimal">Minimal</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3">
                  <span className="text-sm">Activer bonus et jokers</span>
                  <input
                    type="checkbox"
                    checked={launchOptions.enableBonuses}
                    onChange={(e) => setLaunchOptions((prev) => ({ ...prev, enableBonuses: e.target.checked }))}
                  />
                </label>
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3">
                  <span className="text-sm">Mode équipe</span>
                  <input
                    type="checkbox"
                    checked={launchOptions.isTeamMode}
                    onChange={(e) => setLaunchOptions((prev) => ({ ...prev, isTeamMode: e.target.checked }))}
                  />
                </label>
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 md:col-span-2">
                  <span className="text-sm">Questions / pistes en ordre aléatoire</span>
                  <input
                    type="checkbox"
                    checked={launchOptions.shuffleQuestions}
                    onChange={(e) => setLaunchOptions((prev) => ({ ...prev, shuffleQuestions: e.target.checked }))}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3">
                  <span className="text-sm">Onboarding public (10s)</span>
                  <input
                    type="checkbox"
                    checked={launchOptions.onboardingEnabled}
                    onChange={(e) => setLaunchOptions((prev) => ({ ...prev, onboardingEnabled: e.target.checked }))}
                  />
                </label>
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3">
                  <span className="text-sm">Mode tournoi multi-manches</span>
                  <input
                    type="checkbox"
                    checked={launchOptions.tournamentMode}
                    onChange={(e) => setLaunchOptions((prev) => ({ ...prev, tournamentMode: e.target.checked }))}
                  />
                </label>
              </div>

              <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium">Règles personnalisées</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-xs text-zinc-400">
                    Pénalité mauvaise réponse
                    <input
                      type="number"
                      min={-20}
                      max={0}
                      value={launchOptions.rules.wrongAnswerPenalty}
                      onChange={(e) =>
                        setLaunchOptions((prev) => ({
                          ...prev,
                          rules: { ...prev.rules, wrongAnswerPenalty: Number(e.target.value) || 0 },
                        }))
                      }
                      className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Pénalité anti-spam
                    <input
                      type="number"
                      min={-20}
                      max={0}
                      value={launchOptions.rules.antiSpamPenalty}
                      onChange={(e) =>
                        setLaunchOptions((prev) => ({
                          ...prev,
                          rules: { ...prev.rules, antiSpamPenalty: Number(e.target.value) || 0 },
                        }))
                      }
                      className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
                    />
                  </label>
                  <label className="text-xs text-zinc-400">
                    Verrouillage progressif (ms)
                    <input
                      type="number"
                      min={1000}
                      max={20000}
                      step={500}
                      value={launchOptions.rules.progressiveLockBaseMs}
                      onChange={(e) =>
                        setLaunchOptions((prev) => ({
                          ...prev,
                          rules: { ...prev.rules, progressiveLockBaseMs: Number(e.target.value) || 5000 },
                        }))
                      }
                      className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
                    />
                  </label>
                </div>
                <label className="flex items-center justify-between bg-zinc-900 border border-white/10 rounded-lg px-3 py-2">
                  <span className="text-sm">Activer verrouillage progressif</span>
                  <input
                    type="checkbox"
                    checked={launchOptions.rules.progressiveLock}
                    onChange={(e) =>
                      setLaunchOptions((prev) => ({
                        ...prev,
                        rules: { ...prev.rules, progressiveLock: e.target.checked },
                      }))
                    }
                  />
                </label>
              </div>

              {launchOptions.isTeamMode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-400">Équipes disponibles pour cette partie</p>
                    <button
                      type="button"
                      onClick={() =>
                        setLaunchOptions((prev) => ({
                          ...prev,
                          teamConfig: [...prev.teamConfig, createTeamConfigItem(prev.teamConfig.length)],
                        }))
                      }
                      className="text-xs bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-200 px-3 py-1.5 rounded-lg flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Ajouter une équipe
                    </button>
                  </div>
                  {launchOptions.teamConfig.map((team) => (
                    <div key={team.id} className="grid grid-cols-12 gap-2 items-center bg-zinc-950 border border-white/10 rounded-xl p-3">
                      <div className="col-span-1">
                        <input
                          type="checkbox"
                          checked={team.enabled}
                          onChange={(e) =>
                            setLaunchOptions((prev) => ({
                              ...prev,
                              teamConfig: prev.teamConfig.map((item) =>
                                item.id === team.id ? { ...item, enabled: e.target.checked } : item,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="color"
                          value={team.color}
                          onChange={(e) =>
                            setLaunchOptions((prev) => ({
                              ...prev,
                              teamConfig: prev.teamConfig.map((item) =>
                                item.id === team.id ? { ...item, color: e.target.value } : item,
                              ),
                            }))
                          }
                          className="w-full h-9 bg-transparent border border-white/10 rounded"
                        />
                      </div>
                      <div className="col-span-9">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={team.name}
                            onChange={(e) =>
                              setLaunchOptions((prev) => ({
                                ...prev,
                                teamConfig: prev.teamConfig.map((item) =>
                                  item.id === team.id ? { ...item, name: e.target.value } : item,
                                ),
                              }))
                            }
                            className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setLaunchOptions((prev) => ({
                                ...prev,
                                teamConfig: prev.teamConfig.filter((item) => item.id !== team.id),
                              }))
                            }
                            className="text-red-300 hover:text-red-200 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 rounded-lg p-2"
                            title="Supprimer l'équipe"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowLaunchModal(false);
                    setPendingPlaylistLaunch(null);
                    setPendingYoutubeLaunch(null);
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={handleLaunchWithOptions}
                  className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Lancer la partie
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
