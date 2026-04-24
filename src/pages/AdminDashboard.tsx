import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { socket } from '../lib/socket';
import { QRCodeSVG } from 'qrcode.react';
import { BlindTestSession, Playlist, Track, MediaType } from '../types';
import { Plus, Trash2, Play, Music, LogOut, Youtube, Edit, Flag, Upload, Mic, Film, Image as ImageIcon, Type, Link, Settings2, Cpu, BookOpen, Trophy, LayoutDashboard, Rocket, Activity, Moon, Sun } from 'lucide-react';
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
  const { theme, toggleTheme } = useTheme();
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
  const [sessionStats, setSessionStats] = useState<{
    overview: {
      totalSessions: number;
      finishedSessions: number;
      activeSessions: number;
      avgSessionDurationMs: number;
      avgResponseMs: number;
      totalBuzzes: number;
      totalCorrect: number;
      totalWrong: number;
    };
    topFastPlayers: Array<{ id: string; name: string; buzzes: number; avgResponseMs: number }>;
    topFastTracks: Array<{
      trackIndex: number;
      title: string;
      artist: string;
      fastestBuzzMs?: number;
      revealedWithoutAnswer: number;
      wrongAnswers: number;
      totalBuzzes: number;
      correctAnswers: number;
    }>;
    topHardTracks: Array<{
      trackIndex: number;
      title: string;
      artist: string;
      fastestBuzzMs?: number;
      revealedWithoutAnswer: number;
      wrongAnswers: number;
      totalBuzzes: number;
      correctAnswers: number;
    }>;
    coverage: {
      sessionsWithRealtimeStats: number;
      totalSessions: number;
    };
  } | null>(null);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [newTournamentName, setNewTournamentName] = useState('');
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [tournamentLeaderboard, setTournamentLeaderboard] = useState<any[] | null>(null);
  const [selectedBrandingBlindtestId, setSelectedBrandingBlindtestId] = useState('');
  const [brandingDraft, setBrandingDraft] = useState({
    clientName: '',
    logoUrl: '',
    primaryColor: '#6366f1',
    accentColor: '#a855f7',
  });
  const [brandingReport, setBrandingReport] = useState<any | null>(null);

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardName, setWizardName] = useState('');
  const [wizardThemePrompt, setWizardThemePrompt] = useState('');
  const [wizardTracks, setWizardTracks] = useState<Track[]>([]);
  const [wizardDefaultQuestionType, setWizardDefaultQuestionType] = useState<'auto' | MediaType>('auto');
  const [wizardDefaultDuration, setWizardDefaultDuration] = useState(20);
  const [wizardImageRevealMode, setWizardImageRevealMode] = useState<'none' | 'blur'>('none');
  const [wizardImageRevealDuration, setWizardImageRevealDuration] = useState(15);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [wizardPreviewTrackId, setWizardPreviewTrackId] = useState<string | null>(null);
  const [blindTestsTab, setBlindTestsTab] = useState<'active' | 'finished'>('active');
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [showEventQuickModal, setShowEventQuickModal] = useState(false);
  const [eventQuickStep, setEventQuickStep] = useState<1 | 2 | 3>(1);
  const [eventQuickPlaylistId, setEventQuickPlaylistId] = useState('');
  const [eventQuickBusy, setEventQuickBusy] = useState(false);
  const [eventQuickBranding, setEventQuickBranding] = useState({
    clientName: '',
    logoUrl: '',
    primaryColor: '#6366f1',
    accentColor: '#a855f7',
  });
  const [eventQuickCreated, setEventQuickCreated] = useState<{ gameId: string; joinUrl: string; screenUrl: string } | null>(null);
  const [adminTab, setAdminTab] = useState<'sessions' | 'lancer' | 'stats' | 'business'>('sessions');
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
    strictTimerEnabled: false,
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
        const [playlistsRes, blindTestsRes, publicPlaylistsRes, tournamentsRes] = await Promise.all([
          api.playlists.list(),
          api.blindtests.list(),
          api.playlists.listPublic(),
          api.events.listTournaments().catch(() => ({ tournaments: [] })),
        ]);
        if (!active) return;
        setPlaylists((playlistsRes.playlists || []).map(rowToPlaylist));
        setBlindTests((blindTestsRes.blindtests || []).map(rowToBlindTest));
        setPublicPlaylists((publicPlaylistsRes.playlists || []).map(rowToPlaylist));
        setTournaments(tournamentsRes.tournaments || []);
        try {
          const statsRes = await api.blindtests.stats();
          if (!active) return;
          setSessionStats(statsRes);
        } catch {
          // stats optionnelles
        }
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

  const formatMsToSeconds = (value?: number) => {
    if (typeof value !== 'number') return 'n/a';
    return `${(value / 1000).toFixed(2)}s`;
  };

  const formatDuration = (ms: number) => {
    if (!ms || ms <= 0) return 'n/a';
    const totalSec = Math.round(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}m ${String(sec).padStart(2, '0')}s`;
  };

  const handleCreateTournament = async () => {
    if (!newTournamentName.trim()) return;
    try {
      const { tournament } = await api.events.createTournament({ name: newTournamentName.trim() });
      setTournaments((prev) => [tournament, ...prev]);
      setNewTournamentName('');
      toastSuccess('Tournoi créé');
    } catch (error) {
      toastError((error as Error).message || 'Erreur création tournoi');
    }
  };

  const handleAttachSessionToTournament = async (tournamentId: string, blindtestId: string) => {
    try {
      await api.events.attachSessionToTournament(tournamentId, blindtestId);
      toastSuccess('Session ajoutée au tournoi');
      if (selectedTournamentId === tournamentId) {
        const res = await api.events.getTournamentLeaderboard(tournamentId);
        setTournamentLeaderboard(res.leaderboard || []);
      }
    } catch (error) {
      toastError((error as Error).message || 'Erreur association session/tournoi');
    }
  };

  const handleLoadTournamentLeaderboard = async (tournamentId: string) => {
    if (!tournamentId) return;
    setSelectedTournamentId(tournamentId);
    try {
      const res = await api.events.getTournamentLeaderboard(tournamentId);
      setTournamentLeaderboard(res.leaderboard || []);
    } catch (error) {
      toastError((error as Error).message || 'Erreur chargement classement tournoi');
    }
  };

  const handleLoadBranding = async (blindtestId: string) => {
    if (!blindtestId) return;
    setSelectedBrandingBlindtestId(blindtestId);
    setBrandingReport(null);
    try {
      const [{ branding }, report] = await Promise.all([
        api.events.getBranding(blindtestId),
        api.events.getReport(blindtestId),
      ]);
      setBrandingDraft({
        clientName: branding?.client_name || '',
        logoUrl: branding?.logo_url || '',
        primaryColor: branding?.primary_color || '#6366f1',
        accentColor: branding?.accent_color || '#a855f7',
      });
      setBrandingReport(report);
    } catch (error) {
      toastError((error as Error).message || 'Erreur chargement branding/report');
    }
  };

  const handleSaveBranding = async () => {
    if (!selectedBrandingBlindtestId) return;
    try {
      await api.events.saveBranding(selectedBrandingBlindtestId, brandingDraft);
      toastSuccess('Branding sauvegardé');
      const report = await api.events.getReport(selectedBrandingBlindtestId);
      setBrandingReport(report);
    } catch (error) {
      toastError((error as Error).message || 'Erreur sauvegarde branding');
    }
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
    const mediaType: Track['mediaType'] = wizardDefaultQuestionType === 'auto' ? 'audio' : wizardDefaultQuestionType;
    const imageDefaults =
      mediaType === 'image'
        ? {
            imageRevealMode: wizardImageRevealMode,
            imageRevealDuration: wizardImageRevealDuration,
          }
        : {};
    const newTrack: Track = {
      id: uuidv4(),
      title: '',
      artist: '',
      mediaType,
      mediaUrl: '',
      duration: wizardDefaultDuration,
      startTime: 0,
      ...imageDefaults,
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
        const detectedMediaType: Track['mediaType'] = file.type.startsWith('audio/')
          ? 'audio'
          : file.type.startsWith('video/')
            ? 'video'
            : file.type.startsWith('image/')
              ? 'image'
              : 'url';
        const mediaType = wizardDefaultQuestionType === 'auto' ? detectedMediaType : wizardDefaultQuestionType;
        const imageDefaults =
          mediaType === 'image'
            ? {
                imageRevealMode: wizardImageRevealMode,
                imageRevealDuration: wizardImageRevealDuration,
              }
            : {};
        uploadedTracks.push({
          id: uuidv4(),
          title: file.name.replace(/\.[^.]+$/, ''),
          artist: '',
          mediaType,
          mediaUrl: url,
          url,
          duration: wizardDefaultDuration,
          startTime: 0,
          ...imageDefaults,
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
      setWizardDefaultQuestionType('auto');
      setWizardDefaultDuration(getDefaultDurationByDifficulty(launchOptions.difficulty));
      setWizardImageRevealMode('none');
      setWizardImageRevealDuration(15);
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
    if (!window.confirm('Supprimer cette playlist ? Cette action est définitive.')) return;
    try {
      await api.playlists.delete(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      toastError((error as Error).message || 'Erreur suppression playlist');
    }
  };

  const launchPlaylistGame = (
    playlist: Playlist,
    params?: {
      overrideOptions?: typeof launchOptions;
      safeMode?: boolean;
      autoNavigate?: boolean;
      onCreated?: (gameId: string) => Promise<void> | void;
      onFailed?: () => void;
    },
  ) => {
    const effectiveOptions = params?.overrideOptions || launchOptions;
    if (effectiveOptions.isTeamMode && effectiveOptions.teamConfig.filter((team) => team.enabled).length === 0) {
      toastWarning('Activez au moins une équipe avant de lancer la partie.');
      return;
    }
    socket.emit('host:createGame', playlist.tracks, effectiveOptions, async (response: any) => {
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
        if (params?.onCreated) {
          await params.onCreated(response.gameId);
        }
        if (params?.autoNavigate !== false) {
          navigate(`/admin/game/${response.gameId}${params?.safeMode ? '?safe=1' : ''}`);
        }
      } else {
        params?.onFailed?.();
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

  const openEventQuickModal = () => {
    const firstPlaylist = playlists[0];
    setEventQuickPlaylistId(firstPlaylist?.id || '');
    setEventQuickStep(1);
    setEventQuickBusy(false);
    setEventQuickCreated(null);
    setEventQuickBranding({
      clientName: '',
      logoUrl: '',
      primaryColor: '#6366f1',
      accentColor: '#a855f7',
    });
    setShowEventQuickModal(true);
  };

  const saveBrandingForGame = async (gameId: string, branding: { clientName: string; logoUrl: string; primaryColor: string; accentColor: string }) => {
    try {
      const { blindtests } = await api.blindtests.list();
      const session = (blindtests || []).find((row: any) => row.game_id === gameId || row.gameId === gameId);
      if (!session?.id) return;
      await api.events.saveBranding(session.id, branding);
    } catch (error) {
      console.warn('Branding non appliqué automatiquement:', error);
    }
  };

  const handlePrepareEventQuick = async () => {
    const selected = playlists.find((p) => p.id === eventQuickPlaylistId);
    if (!selected) {
      toastWarning('Choisissez une playlist pour continuer.');
      return;
    }
    setEventQuickBusy(true);
    const fastOptions = {
      ...launchOptions,
      isTeamMode: false,
      shuffleQuestions: false,
      difficulty: 'medium' as const,
      theme: 'dark' as const,
      enableBonuses: false,
      onboardingEnabled: true,
      tutorialSeconds: 10,
      tournamentMode: false,
      strictTimerEnabled: false,
      rules: {
        ...launchOptions.rules,
        wrongAnswerPenalty: -1,
        antiSpamPenalty: -1,
        progressiveLock: true,
        progressiveLockBaseMs: 5000,
      },
    };
    launchPlaylistGame(selected, {
      overrideOptions: fastOptions,
      safeMode: true,
      autoNavigate: false,
      onCreated: async (gameId) => {
        await saveBrandingForGame(gameId, eventQuickBranding);
        setEventQuickCreated({
          gameId,
          joinUrl: `${window.location.origin}/?mode=player&game=${encodeURIComponent(gameId)}`,
          screenUrl: `${window.location.origin}/screen/${encodeURIComponent(gameId)}`,
        });
        setEventQuickStep(3);
        setEventQuickBusy(false);
      },
      onFailed: () => {
        setEventQuickBusy(false);
      },
    });
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement...</div>;
  }

  const activeBlindTests = blindTests.filter((s) => s.status === 'active');
  const finishedBlindTests = blindTests.filter((s) => s.status === 'finished');
  const totalTracks = playlists.reduce((sum, p) => sum + (p.tracks?.length || 0), 0);

  const getPlaylistTypeBadge = (playlist: Playlist) => {
    const types = new Set((playlist.tracks || []).map((t) => t.mediaType || 'audio'));
    const badges: string[] = [];
    if (types.has('audio')) badges.push('Audio');
    if (types.has('video')) badges.push('Vidéo');
    if (types.has('image')) badges.push('Image');
    if (types.has('youtube')) badges.push('YouTube');
    if (types.has('text')) badges.push('Texte');
    if (badges.length === 0) badges.push('Buzz');
    return badges.slice(0, 2);
  };

  const TABS: Array<{ id: 'sessions' | 'lancer' | 'stats' | 'business'; label: string; badge?: number }> = [
    { id: 'sessions', label: 'Sessions', badge: activeBlindTests.length > 0 ? activeBlindTests.length : undefined },
    { id: 'lancer', label: 'Lancer une partie' },
    { id: 'stats', label: 'Stats' },
    { id: 'business', label: 'Business' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white app-shell">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Music className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-black text-base tracking-tight">BlindTest<span className="text-indigo-400">Live</span></span>
            <span className="ml-2 text-xs text-zinc-500">{user?.email}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/admin/hardware')} className="text-xs text-zinc-500 hover:text-zinc-300 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors">
            <Cpu className="w-3.5 h-3.5" />Matériel
          </button>
          <button onClick={() => navigate('/admin/settings')} className="text-xs text-zinc-500 hover:text-zinc-300 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors">
            <Settings2 className="w-3.5 h-3.5" />Paramètres
          </button>
          <button onClick={toggleTheme} className="text-xs text-zinc-500 hover:text-zinc-300 border border-white/10 rounded-lg p-1.5 transition-colors" title="Changer de thème">
            {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleLogout} className="text-xs text-zinc-500 hover:text-red-400 border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors">
            <LogOut className="w-3.5 h-3.5" />Déconnexion
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Sessions actives', value: activeBlindTests.length, color: activeBlindTests.length > 0 ? 'text-emerald-400' : 'text-white' },
            { label: 'Sessions terminées', value: finishedBlindTests.length, color: 'text-white' },
            { label: 'Playlists', value: playlists.length, color: 'text-indigo-400' },
            { label: 'Pistes au total', value: totalTracks, color: 'text-white' },
          ].map((stat) => (
            <div key={stat.label} className="bg-zinc-900 border border-white/8 rounded-2xl p-4 hover:border-white/15 transition-colors">
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{stat.label}</p>
              <p className={`text-3xl font-black mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 bg-zinc-900 border border-white/8 rounded-2xl p-1.5 mb-8 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setAdminTab(tab.id)}
              className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                adminTab === tab.id
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* SESSIONS */}
        {adminTab === 'sessions' && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-white/8 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                    Sessions en cours
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Parties actuellement actives</p>
                </div>
                <button
                  onClick={() => setAdminTab('lancer')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Lancer une partie
                </button>
              </div>
              {activeBlindTests.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <Flag className="w-10 h-10 text-zinc-700 mx-auto" />
                  <p className="text-zinc-500 text-sm">Aucune partie en cours.</p>
                  <button onClick={() => setAdminTab('lancer')} className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
                    Lancer une partie →
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeBlindTests.map((session) => (
                    <div key={session.id} className="bg-zinc-950 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{session.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-zinc-500">Code:</span>
                          <code className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{session.gameId}</code>
                          <span className="text-xs text-zinc-600">{new Date(session.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => navigate(`/admin/game/${session.gameId}`)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                          Reprendre →
                        </button>
                        <button onClick={() => handleEndBlindTest(session)} disabled={endingSessionId === session.id} className="bg-red-600/15 hover:bg-red-600/25 disabled:opacity-50 text-red-400 px-3 py-2 rounded-xl text-xs border border-red-500/20 transition-colors">
                          {endingSessionId === session.id ? 'Arrêt…' : 'Terminer'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900 border border-white/8 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-5">Historique des parties</h2>
              {finishedBlindTests.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-6">Aucune partie terminée pour l'instant.</p>
              ) : (
                <div className="space-y-2">
                  {finishedBlindTests.slice(0, 20).map((session) => (
                    <div key={session.id} className="bg-zinc-950 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{session.title}</p>
                        <p className="text-xs text-zinc-500">
                          {new Date(session.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}Code: <code className="font-mono">{session.gameId}</code>
                        </p>
                      </div>
                      <span className="text-xs text-zinc-600 bg-zinc-800 border border-white/8 px-2 py-1 rounded-full">Terminée</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {serverMetrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Parties actives serveur', value: serverMetrics.activeGames },
                  { label: 'Sockets actifs', value: serverMetrics.activeSockets },
                  { label: 'Événements traités', value: serverMetrics.eventsTotal },
                  { label: 'Parties créées', value: serverMetrics.gamesCreated },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-zinc-900 border border-white/8 rounded-xl p-4">
                    <p className="text-[11px] text-zinc-500 uppercase tracking-wide">{label}</p>
                    <p className="text-2xl font-black mt-1">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LANCER */}
        {adminTab === 'lancer' && (
          <div className="space-y-8">
            <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">Mode événement</p>
                <h2 className="text-lg font-bold mt-1">Lancer événement (1 clic)</h2>
                <p className="text-sm text-indigo-100/80 mt-1">Flux court: playlist → branding → QR live → console animateur en safe mode.</p>
              </div>
              <button
                onClick={openEventQuickModal}
                className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                <Rocket className="w-4 h-4" />
                Lancer événement
              </button>
            </div>

            <div className="bg-zinc-900 border border-white/8 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-bold">Depuis une playlist</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Chaque carte indique le type de contenu et ce qu'on attend des joueurs.</p>
                </div>
                <button onClick={() => navigate('/playlists')} className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 rounded-xl px-3 py-2 transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  Gérer mes playlists
                </button>
              </div>

              {playlists.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <Music className="w-10 h-10 text-zinc-700 mx-auto" />
                  <p className="text-zinc-500 text-sm">Aucune playlist. Crée-en une pour commencer.</p>
                  <button onClick={() => navigate('/playlists')} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-xl transition-colors">
                    Créer une playlist
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  {playlists.map((playlist) => {
                    const badges = getPlaylistTypeBadge(playlist);
                    return (
                      <div key={playlist.id} className="bg-zinc-950 border border-white/8 rounded-2xl p-4 flex flex-col gap-3 hover:border-white/15 transition-all">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{playlist.name}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{playlist.tracks.length} piste{playlist.tracks.length !== 1 ? 's' : ''}</p>
                          </div>
                          <div className="flex flex-wrap gap-1 justify-end flex-shrink-0">
                            {badges.map((b) => (
                              <span key={b} className="text-[10px] bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full">{b}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => navigate(`/playlists/${playlist.id}`)} className="flex-1 text-xs text-zinc-500 hover:text-zinc-300 border border-white/8 hover:border-white/15 rounded-lg py-1.5 transition-all flex items-center justify-center gap-1">
                            <Edit className="w-3.5 h-3.5" />Éditer
                          </button>
                          <button onClick={() => { setPendingPlaylistLaunch(playlist); setShowLaunchModal(true); }} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors">
                            <Play className="w-4 h-4" />Lancer
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {publicPlaylists.length > 0 && (
              <div className="bg-zinc-900 border border-white/8 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold">Bibliothèque partagée</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Playlists publiées par la communauté</p>
                  </div>
                  <input type="text" value={playlistSearch} onChange={(e) => setPlaylistSearch(e.target.value)} placeholder="Rechercher…" className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm w-48" />
                </div>
                <div className="space-y-2">
                  {publicPlaylists.filter((p) => `${p.name} ${(p.tracks || []).map((t) => `${t.title} ${t.artist}`).join(' ')}`.toLowerCase().includes(playlistSearch.toLowerCase())).slice(0, 8).map((playlist) => (
                    <div key={playlist.id} className="bg-zinc-950 border border-white/5 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium">{playlist.name}</p>
                        <p className="text-xs text-zinc-500">{playlist.tracks.length} pistes · publique</p>
                      </div>
                      <button onClick={() => { setPendingPlaylistLaunch(playlist); setShowLaunchModal(true); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                        Lancer
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-zinc-900 border border-white/8 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-red-600/20 flex items-center justify-center">
                  <Youtube className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Mode YouTube</h2>
                  <p className="text-xs text-zinc-500">Colle un lien vers une vidéo — les joueurs buzzent dessus en live</p>
                </div>
              </div>
              <form onSubmit={handleLaunchYoutubeGame} className="flex gap-3 mt-4">
                <input type="text" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
                <button type="submit" className="bg-red-600 hover:bg-red-500 text-white px-5 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2 text-sm">
                  <Play className="w-4 h-4" />Lancer
                </button>
              </form>
            </div>
          </div>
        )}

        {/* STATS */}
        {adminTab === 'stats' && (
          <div className="space-y-6">
            {!sessionStats ? (
              <div className="text-center py-16 text-zinc-500">
                <Activity className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <p>Pas encore de statistiques disponibles.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    Cockpit de performance
                  </h2>
                  <span className="text-xs text-zinc-500">{sessionStats.coverage.sessionsWithRealtimeStats}/{sessionStats.coverage.totalSessions} sessions avec données</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Sessions totales', value: sessionStats.overview.totalSessions },
                    { label: 'Durée moyenne', value: formatDuration(sessionStats.overview.avgSessionDurationMs) },
                    { label: 'Temps de réponse moy.', value: formatMsToSeconds(sessionStats.overview.avgResponseMs) },
                    { label: 'Buzz totaux', value: sessionStats.overview.totalBuzzes },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-zinc-900 border border-white/8 rounded-2xl p-4">
                      <p className="text-[11px] text-zinc-500 uppercase tracking-wide">{label}</p>
                      <p className="text-2xl font-black mt-1">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-zinc-900 border border-white/8 rounded-2xl p-5">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Top joueurs les + rapides</p>
                    <div className="space-y-2">
                      {sessionStats.topFastPlayers.length === 0 && <p className="text-xs text-zinc-600">Pas encore de données.</p>}
                      {sessionStats.topFastPlayers.map((entry, i) => (
                        <div key={entry.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2"><span className="text-xs text-zinc-600 w-4">#{i + 1}</span><span className="text-zinc-200 truncate">{entry.name}</span></div>
                          <span className="text-emerald-400 text-xs font-mono">{formatMsToSeconds(entry.avgResponseMs)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-zinc-900 border border-white/8 rounded-2xl p-5">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Musiques trouvées le + vite</p>
                    <div className="space-y-2">
                      {sessionStats.topFastTracks.length === 0 && <p className="text-xs text-zinc-600">Pas encore de données.</p>}
                      {sessionStats.topFastTracks.map((entry, idx) => (
                        <div key={`fast-${idx}`} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-200 truncate flex-1">{entry.title || 'Inconnu'}</span>
                          <span className="text-emerald-400 text-xs font-mono ml-2">{entry.fastestBuzzMs ? formatMsToSeconds(entry.fastestBuzzMs) : 'n/a'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-zinc-900 border border-white/8 rounded-2xl p-5">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Musiques les + difficiles</p>
                    <div className="space-y-2">
                      {sessionStats.topHardTracks.length === 0 && <p className="text-xs text-zinc-600">Pas encore de données.</p>}
                      {sessionStats.topHardTracks.map((entry, idx) => (
                        <div key={`hard-${idx}`} className="flex items-center justify-between text-sm">
                          <span className="text-zinc-200 truncate flex-1">{entry.title || 'Inconnu'}</span>
                          <span className="text-amber-400 text-xs ml-2">{entry.revealedWithoutAnswer} sans rép.</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* BUSINESS */}
        {adminTab === 'business' && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-white/8 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" />Tournoi multi-soirées</h2>
              <p className="text-xs text-zinc-500 mb-4">Crée un tournoi, puis ajoute des sessions pour générer un classement cumulé.</p>
              <div className="flex gap-2 mb-4">
                <input type="text" value={newTournamentName} onChange={(e) => setNewTournamentName(e.target.value)} placeholder="Nom du tournoi (ex: Ligue Campus Avril)" className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm" />
                <button onClick={handleCreateTournament} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-medium">Créer</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-zinc-950 border border-white/8 rounded-xl p-4">
                  <p className="text-xs text-zinc-500 uppercase mb-3">Mes tournois</p>
                  <div className="space-y-2 max-h-56 overflow-auto">
                    {tournaments.length === 0 && <p className="text-xs text-zinc-600">Aucun tournoi.</p>}
                    {tournaments.map((t) => (
                      <button key={t.id} onClick={() => void handleLoadTournamentLeaderboard(t.id)} className={`w-full text-left border rounded-xl px-3 py-2 text-sm transition-all ${selectedTournamentId === t.id ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-200' : 'bg-zinc-900 border-white/8 hover:border-white/15'}`}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-zinc-950 border border-white/8 rounded-xl p-4">
                  <p className="text-xs text-zinc-500 uppercase mb-3">Classement cumulé</p>
                  <div className="space-y-1.5 max-h-56 overflow-auto">
                    {!tournamentLeaderboard && <p className="text-xs text-zinc-600">Sélectionne un tournoi.</p>}
                    {tournamentLeaderboard?.length === 0 && <p className="text-xs text-zinc-600">Pas encore de scores.</p>}
                    {tournamentLeaderboard?.map((entry, idx) => (
                      <div key={`${entry.name}-${idx}`} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-200">#{idx + 1} {entry.name}</span>
                        <span className="text-indigo-300 font-mono text-xs">{entry.score} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {selectedTournamentId && (
                <div className="mt-4 bg-zinc-950 border border-white/8 rounded-xl p-4">
                  <p className="text-xs text-zinc-500 uppercase mb-3">Ajouter une session au tournoi</p>
                  <div className="flex flex-wrap gap-2">
                    {blindTests.slice(0, 12).map((session) => (
                      <button key={session.id} onClick={() => void handleAttachSessionToTournament(selectedTournamentId, session.id)} className="text-xs bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg px-2.5 py-1.5 transition-colors">{session.title}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-zinc-900 border border-white/8 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Flag className="w-5 h-5 text-fuchsia-400" />Animation événement pro (marque blanche)</h2>
              <p className="text-xs text-zinc-500 mb-4">Personnalise les couleurs/logo et récupère les KPIs client.</p>
              <div className="flex gap-2 mb-4">
                <select value={selectedBrandingBlindtestId} onChange={(e) => void handleLoadBranding(e.target.value)} className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm">
                  <option value="">Choisir une session</option>
                  {blindTests.map((session) => (<option key={session.id} value={session.id}>{session.title} ({session.gameId})</option>))}
                </select>
                <button onClick={handleSaveBranding} disabled={!selectedBrandingBlindtestId} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">Sauvegarder</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <input type="text" value={brandingDraft.clientName} onChange={(e) => setBrandingDraft((p) => ({ ...p, clientName: e.target.value }))} placeholder="Nom client / événement" className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm" />
                <input type="text" value={brandingDraft.logoUrl} onChange={(e) => setBrandingDraft((p) => ({ ...p, logoUrl: e.target.value }))} placeholder="URL du logo" className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm" />
                <label className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm flex items-center justify-between">Couleur primaire<input type="color" value={brandingDraft.primaryColor} onChange={(e) => setBrandingDraft((p) => ({ ...p, primaryColor: e.target.value }))} /></label>
                <label className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm flex items-center justify-between">Couleur accent<input type="color" value={brandingDraft.accentColor} onChange={(e) => setBrandingDraft((p) => ({ ...p, accentColor: e.target.value }))} /></label>
              </div>
              {brandingReport && (
                <div className="bg-zinc-950 border border-white/8 rounded-xl p-4">
                  <p className="text-xs text-zinc-500 uppercase mb-3">Rapport client (B2B)</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs mb-3">
                    {[{ label: 'Participants', value: brandingReport.kpi?.participants || 0 }, { label: 'Buzz', value: brandingReport.kpi?.totalBuzzes || 0 }, { label: 'Bonnes rép.', value: brandingReport.kpi?.totalCorrect || 0 }, { label: 'Erreurs', value: brandingReport.kpi?.totalWrong || 0 }, { label: 'Taux réussite', value: `${brandingReport.kpi?.successRate || 0}%` }].map(({ label, value }) => (
                      <div key={label} className="bg-zinc-900 border border-white/8 rounded-xl p-3"><p className="text-zinc-500">{label}</p><p className="text-xl font-bold mt-0.5">{value}</p></div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {(brandingReport.topPlayers || []).slice(0, 5).map((entry: any, idx: number) => (
                      <div key={`${entry.name}-${idx}`} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-200">#{idx + 1} {entry.name}</span>
                        <span className="text-indigo-300 text-xs font-mono">{entry.score} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* EVENT QUICK MODAL */}
        {showEventQuickModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Mode événement — lancement guidé</h3>
                <span className="text-xs text-zinc-500">Étape {eventQuickStep}/3</span>
              </div>
              {eventQuickStep === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">Choisis la playlist à lancer.</p>
                  <select
                    value={eventQuickPlaylistId}
                    onChange={(e) => setEventQuickPlaylistId(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">Sélectionner une playlist</option>
                    {playlists.map((playlist) => (
                      <option key={playlist.id} value={playlist.id}>
                        {playlist.name} ({playlist.tracks.length} pistes)
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowEventQuickModal(false)} className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm">Annuler</button>
                    <button
                      onClick={() => setEventQuickStep(2)}
                      disabled={!eventQuickPlaylistId}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded-xl text-sm font-semibold"
                    >
                      Continuer
                    </button>
                  </div>
                </div>
              )}
              {eventQuickStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">Configure le branding à appliquer automatiquement.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={eventQuickBranding.clientName}
                      onChange={(e) => setEventQuickBranding((prev) => ({ ...prev, clientName: e.target.value }))}
                      placeholder="Nom client / événement"
                      className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={eventQuickBranding.logoUrl}
                      onChange={(e) => setEventQuickBranding((prev) => ({ ...prev, logoUrl: e.target.value }))}
                      placeholder="URL logo (optionnel)"
                      className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm"
                    />
                    <label className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm flex items-center justify-between">
                      Couleur primaire
                      <input
                        type="color"
                        value={eventQuickBranding.primaryColor}
                        onChange={(e) => setEventQuickBranding((prev) => ({ ...prev, primaryColor: e.target.value }))}
                      />
                    </label>
                    <label className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm flex items-center justify-between">
                      Couleur accent
                      <input
                        type="color"
                        value={eventQuickBranding.accentColor}
                        onChange={(e) => setEventQuickBranding((prev) => ({ ...prev, accentColor: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setEventQuickStep(1)} className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm">Retour</button>
                    <button
                      onClick={() => void handlePrepareEventQuick()}
                      disabled={eventQuickBusy}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-5 py-2 rounded-xl text-sm font-semibold"
                    >
                      {eventQuickBusy ? 'Préparation…' : 'Préparer QR live'}
                    </button>
                  </div>
                </div>
              )}
              {eventQuickStep === 3 && eventQuickCreated && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-400">La session est créée. Le QR est prêt, puis ouvre la console animateur en mode sécurisé.</p>
                  <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 flex flex-col items-center gap-3">
                    <QRCodeSVG value={eventQuickCreated.joinUrl} size={180} />
                    <p className="text-xs text-zinc-500 text-center break-all">{eventQuickCreated.joinUrl}</p>
                    <a href={eventQuickCreated.screenUrl} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200 text-sm">
                      Ouvrir l'écran public
                    </a>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowEventQuickModal(false)} className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm">Fermer</button>
                    <button
                      onClick={() => navigate(`/admin/game/${eventQuickCreated.gameId}?safe=1`)}
                      className="bg-emerald-600 hover:bg-emerald-500 px-5 py-2 rounded-xl text-sm font-semibold"
                    >
                      Démarrer (safe mode)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* LAUNCH MODAL */}
        {showLaunchModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold">Options de lancement</h3>
              <p className="text-sm text-zinc-400">Configure cette partie. Ces options s'appliquent uniquement à ce lancement.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm space-y-2">
                  <span className="block text-zinc-300">Difficulté</span>
                  <select value={launchOptions.difficulty} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, difficulty: e.target.value as 'easy' | 'medium' | 'hard' }))} className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2">
                    <option value="easy">Facile (30s)</option><option value="medium">Moyen (20s)</option><option value="hard">Difficile (12s)</option>
                  </select>
                </label>
                <label className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm space-y-2">
                  <span className="block text-zinc-300">Thème visuel</span>
                  <select value={launchOptions.theme} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, theme: e.target.value as 'dark' | 'neon' | 'retro' | 'minimal' }))} className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2">
                    <option value="dark">Dark</option><option value="neon">Neon</option><option value="retro">Retro</option><option value="minimal">Minimal</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3"><span className="text-sm">Bonus et jokers</span><input type="checkbox" checked={launchOptions.enableBonuses} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, enableBonuses: e.target.checked }))} /></label>
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3"><span className="text-sm">Mode équipe</span><input type="checkbox" checked={launchOptions.isTeamMode} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, isTeamMode: e.target.checked }))} /></label>
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 md:col-span-2"><span className="text-sm">Ordre aléatoire</span><input type="checkbox" checked={launchOptions.shuffleQuestions} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, shuffleQuestions: e.target.checked }))} /></label>
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3"><span className="text-sm">Onboarding public (10s)</span><input type="checkbox" checked={launchOptions.onboardingEnabled} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, onboardingEnabled: e.target.checked }))} /></label>
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3"><span className="text-sm">Mode tournoi multi-manches</span><input type="checkbox" checked={launchOptions.tournamentMode} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, tournamentMode: e.target.checked }))} /></label>
                <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 md:col-span-2"><span className="text-sm">Timer strict (révélation auto)</span><input type="checkbox" checked={launchOptions.strictTimerEnabled} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, strictTimerEnabled: e.target.checked }))} /></label>
              </div>

              <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium">Règles personnalisées</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-xs text-zinc-400">Pénalité mauvaise réponse<input type="number" min={-20} max={0} value={launchOptions.rules.wrongAnswerPenalty} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, rules: { ...prev.rules, wrongAnswerPenalty: Number(e.target.value) || 0 } }))} className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200" /></label>
                  <label className="text-xs text-zinc-400">Pénalité anti-spam<input type="number" min={-20} max={0} value={launchOptions.rules.antiSpamPenalty} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, rules: { ...prev.rules, antiSpamPenalty: Number(e.target.value) || 0 } }))} className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200" /></label>
                  <label className="text-xs text-zinc-400">Verrouillage progressif (ms)<input type="number" min={1000} max={20000} step={500} value={launchOptions.rules.progressiveLockBaseMs} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, rules: { ...prev.rules, progressiveLockBaseMs: Number(e.target.value) || 5000 } }))} className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200" /></label>
                </div>
                <label className="flex items-center justify-between bg-zinc-900 border border-white/10 rounded-lg px-3 py-2"><span className="text-sm">Verrouillage progressif actif</span><input type="checkbox" checked={launchOptions.rules.progressiveLock} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, rules: { ...prev.rules, progressiveLock: e.target.checked } }))} /></label>
              </div>

              {launchOptions.isTeamMode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-400">Équipes disponibles</p>
                    <button type="button" onClick={() => setLaunchOptions((prev) => ({ ...prev, teamConfig: [...prev.teamConfig, createTeamConfigItem(prev.teamConfig.length)] }))} className="text-xs bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-200 px-3 py-1.5 rounded-lg flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Ajouter</button>
                  </div>
                  {launchOptions.teamConfig.map((team) => (
                    <div key={team.id} className="grid grid-cols-12 gap-2 items-center bg-zinc-950 border border-white/10 rounded-xl p-3">
                      <div className="col-span-1"><input type="checkbox" checked={team.enabled} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, teamConfig: prev.teamConfig.map((item) => item.id === team.id ? { ...item, enabled: e.target.checked } : item) }))} /></div>
                      <div className="col-span-2"><input type="color" value={team.color} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, teamConfig: prev.teamConfig.map((item) => item.id === team.id ? { ...item, color: e.target.value } : item) }))} className="w-full h-9 bg-transparent border border-white/10 rounded" /></div>
                      <div className="col-span-9 flex items-center gap-2">
                        <input type="text" value={team.name} onChange={(e) => setLaunchOptions((prev) => ({ ...prev, teamConfig: prev.teamConfig.map((item) => item.id === team.id ? { ...item, name: e.target.value } : item) }))} className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                        <button type="button" onClick={() => setLaunchOptions((prev) => ({ ...prev, teamConfig: prev.teamConfig.filter((item) => item.id !== team.id) }))} className="text-red-300 hover:text-red-200 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 rounded-lg p-2"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setShowLaunchModal(false); setPendingPlaylistLaunch(null); setPendingYoutubeLaunch(null); }} className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm">Annuler</button>
                <button onClick={handleLaunchWithOptions} className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-xl text-sm font-semibold">Lancer la partie</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
