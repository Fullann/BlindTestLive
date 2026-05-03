import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { socket } from '../lib/socket';
import type {
  GameCheckResult,
  GameLobbyMetaPayload,
  PlayerJoinGameAck,
  PlayerWatchLobbyResult,
} from '../types/socket-events';
import {
  LogIn, Monitor, Play, Users, Tv, LayoutDashboard, Ticket,
  Sparkles, ChevronRight, ArrowLeft, Music2, MicVocal
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'framer-motion';

type AccessMode = 'player' | 'host' | 'cohost' | 'screens';

const MODES: Array<{
  id: AccessMode;
  label: string;
  icon: React.ElementType;
  color: string;
  border: string;
  bg: string;
  tagline: string;
  what: string;
}> = [
  {
    id: 'player',
    label: 'Joueur',
    icon: Users,
    color: 'text-indigo-300',
    border: 'border-indigo-500/40',
    bg: 'bg-indigo-600/20',
    tagline: 'Rejoindre une partie en cours',
    what: 'Code à 6 caractères + pseudo',
  },
  {
    id: 'host',
    label: 'Animateur',
    icon: LayoutDashboard,
    color: 'text-emerald-300',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-600/20',
    tagline: 'Créer et piloter une soirée',
    what: 'Email + mot de passe',
  },
  {
    id: 'cohost',
    label: 'Co-animateur',
    icon: Ticket,
    color: 'text-amber-300',
    border: 'border-amber-500/40',
    bg: 'bg-amber-600/20',
    tagline: "Assister l\u2019animateur principal",
    what: 'Code partie + token reçu',
  },
  {
    id: 'screens',
    label: 'Écran',
    icon: Tv,
    color: 'text-fuchsia-300',
    border: 'border-fuchsia-500/40',
    bg: 'bg-fuchsia-600/20',
    tagline: 'Afficher la partie sur un grand écran',
    what: "Code partie + type d\u2019\u00e9cran",
  },
];

export default function Home() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [activeMode, setActiveMode] = useState<AccessMode | null>(null);

  // Player
  const [gameCode, setGameCode] = useState('');
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('blindtest_player_name') || '');
  const [team, setTeam] = useState(() => localStorage.getItem('blindtest_player_team') || '');
  const [playerStep, setPlayerStep] = useState<'code' | 'details'>('code');
  const [isTeamMode, setIsTeamMode] = useState(false);
  const [availableTeams, setAvailableTeams] = useState<Array<{ id: string; name: string; color: string; enabled: boolean }>>([]);
  const [playerLoading, setPlayerLoading] = useState(false);

  // Host
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminMode, setAdminMode] = useState<'login' | 'signup'>('login');
  const [adminTwoFactorCode, setAdminTwoFactorCode] = useState('');
  const [adminNeedsTwoFactor, setAdminNeedsTwoFactor] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  // Cohost
  const [cohostGameCode, setCohostGameCode] = useState('');
  const [cohostToken, setCohostToken] = useState('');
  const [cohostLoading, setCohostLoading] = useState(false);

  // Screens
  const [screenCode, setScreenCode] = useState('');
  const [screenMode, setScreenMode] = useState<'public' | 'return' | 'sponsor'>('public');

  const [error, setError] = useState('');

  const normalizeCode = (v: string) => v.replace(/\s+/g, '').toUpperCase();

  const ackError = (message: string | undefined, fallback: string) => message || fallback;

  // Auto-rejoin
  useEffect(() => {
    const savedGameId = normalizeCode(localStorage.getItem('blindtest_last_game_id') || '');
    const playerId = localStorage.getItem('blindtest_player_id');
    const playerSecret = localStorage.getItem('blindtest_player_secret');
    const savedName = localStorage.getItem('blindtest_player_name');
    const savedTeam = localStorage.getItem('blindtest_player_team') || undefined;
    if (!savedGameId || !playerId || !playerSecret || !savedName) return;
    setPlayerLoading(true);
    socket.emit('game:check', savedGameId, (check: GameCheckResult) => {
      if (!check.success || check.status === 'finished') {
        localStorage.removeItem('blindtest_last_game_id');
        setPlayerLoading(false);
        return;
      }
      socket.emit('player:joinGame', { gameId: savedGameId, playerId, playerSecret, name: savedName, team: savedTeam }, (res: PlayerJoinGameAck) => {
        setPlayerLoading(false);
        if (res.success) navigate(`/game/${savedGameId}`);
      });
    });
  }, [navigate]);

  useEffect(() => { setError(''); }, [activeMode, playerStep]);

  const checkGameCode = (code: string, onReady?: (teams: Array<{ id: string; name: string; color: string; enabled: boolean }>, teamMode: boolean) => void) => {
    setPlayerLoading(true);
    socket.emit('game:check', code, (res: GameCheckResult) => {
      setPlayerLoading(false);
      if (!res.success) {
        setError(ackError((res as Extract<GameCheckResult, { success: false }>).error, 'Partie introuvable'));
        return;
      }
      if (res.status === 'finished') {
        setError('Cette partie est terminée.');
        return;
      }
      const teamMode = Boolean(res.isTeamMode);
      const teams = Array.isArray(res.teamConfig) ? res.teamConfig.filter((t: any) => t?.enabled) : [];
      setIsTeamMode(teamMode);
      setAvailableTeams(teams);
      if (teams.length > 0 && !teams.some((t: any) => t.id === team)) setTeam('');
      setPlayerStep('details');
      setError('');
      onReady?.(teams, teamMode);
    });
  };

  useEffect(() => {
    if (activeMode !== 'player' || playerStep !== 'details') return;
    const code = normalizeCode(gameCode);
    if (!code) return;

    const applyLobbyPayload = (payload: Pick<GameLobbyMetaPayload, 'status' | 'isTeamMode' | 'teamConfig'>) => {
      if (payload?.status === 'finished') {
        setError('Cette partie est terminée.');
        return;
      }
      const teamMode = Boolean(payload.isTeamMode);
      const teams = Array.isArray(payload.teamConfig) ? payload.teamConfig.filter((t: any) => t?.enabled) : [];
      setIsTeamMode(teamMode);
      setAvailableTeams(teams);
      setTeam((prev) => (teams.some((t: any) => t.id === prev) ? prev : ''));
    };

    const onLobbyMeta = (payload: GameLobbyMetaPayload) => {
      if (!payload?.gameId || normalizeCode(payload.gameId) !== code) return;
      applyLobbyPayload(payload);
    };

    socket.on('game:lobbyMeta', onLobbyMeta);
    socket.emit('player:watchLobby', { gameId: code }, (res: PlayerWatchLobbyResult) => {
      if (res.success) {
        applyLobbyPayload({
          status: res.status,
          isTeamMode: Boolean(res.isTeamMode),
          teamConfig: res.teamConfig ?? [],
        });
      } else {
        setError(ackError((res as Extract<PlayerWatchLobbyResult, { success: false }>).error, 'Partie introuvable'));
      }
    });

    return () => {
      socket.off('game:lobbyMeta', onLobbyMeta);
      socket.emit('player:unwatchLobby', { gameId: code }, () => {});
    };
  }, [activeMode, playerStep, gameCode]);

  const joinGameWithCurrentIdentity = (code: string, forcedTeam?: string, forcedName?: string) => {
    const trimmedName = (forcedName ?? playerName).trim();
    if (!trimmedName) { setError('Entre ton pseudo'); return; }
    const effectiveTeam = forcedTeam ?? team;
    if (isTeamMode && availableTeams.length > 0 && !effectiveTeam) { setError('Choisis une équipe'); return; }
    let playerId = localStorage.getItem('blindtest_player_id');
    let playerSecret = localStorage.getItem('blindtest_player_secret');
    if (!playerId || !playerSecret) {
      playerId = uuidv4(); playerSecret = uuidv4();
      localStorage.setItem('blindtest_player_id', playerId);
      localStorage.setItem('blindtest_player_secret', playerSecret);
    }
    localStorage.setItem('blindtest_player_name', trimmedName);
    if (isTeamMode && effectiveTeam) localStorage.setItem('blindtest_player_team', effectiveTeam);
    else localStorage.removeItem('blindtest_player_team');
    setPlayerLoading(true);
    socket.emit(
      'player:joinGame',
      { gameId: code, playerId, playerSecret, name: trimmedName, team: isTeamMode && availableTeams.length > 0 ? effectiveTeam : undefined },
      (res: PlayerJoinGameAck) => {
        setPlayerLoading(false);
        if (res.success) {
          localStorage.setItem('blindtest_last_game_id', code);
          navigate(`/game/${code}`);
        } else {
          setError(ackError((res as Extract<PlayerJoinGameAck, { success: false }>).error, 'Connexion impossible'));
        }
      },
    );
  };

  const handleCheckGame = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(gameCode);
    if (!code) { setError('Entre un code de partie'); return; }
    checkGameCode(code);
  };

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(gameCode);
    joinGameWithCurrentIdentity(code);
  };

  useEffect(() => {
    const modeParam = searchParams.get('mode');
    const gameParam = normalizeCode(searchParams.get('game') || '');
    if (modeParam !== 'player' || !gameParam) return;
    setActiveMode('player');
    setGameCode(gameParam);
    checkGameCode(gameParam, (teams, teamMode) => {
      const savedName = (localStorage.getItem('blindtest_player_name') || '').trim();
      if (!savedName) return;
      const savedTeam = localStorage.getItem('blindtest_player_team') || '';
      if (teamMode && teams.length > 0 && !teams.some((t) => t.id === savedTeam)) return;
      setPlayerName(savedName);
      if (savedTeam) setTeam(savedTeam);
      joinGameWithCurrentIdentity(gameParam, savedTeam || undefined, savedName);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail || !adminPassword) { setError('Remplis tous les champs'); return; }
    setAdminLoading(true); setError('');
    try {
      if (adminMode === 'login') {
        const result = await api.auth.login(adminEmail, adminPassword);
        if (result.requiresTwoFactor) { setAdminNeedsTwoFactor(true); return; }
        if (!result.user) throw new Error('Connexion impossible');
      } else {
        await register(adminEmail, adminPassword);
      }
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminTwoFactorCode) { setError('Entre le code 2FA'); return; }
    setAdminLoading(true); setError('');
    try {
      await api.auth.verifyLogin2fa(adminTwoFactorCode);
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Code 2FA invalide');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCohostAccess = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(cohostGameCode);
    const token = cohostToken.trim();
    if (!code) { setError('Entre le code de partie'); return; }
    if (!token) { setError('Entre le token co-animateur'); return; }
    setCohostLoading(true);
    socket.emit('host:joinGame', { gameId: code, hostToken: token }, (res: any) => {
      setCohostLoading(false);
      if (!res?.success) { setError(res?.error || 'Token invalide'); return; }
      sessionStorage.setItem(`blindtest_host_${code}`, token);
      navigate(`/admin/game/${code}`);
    });
  };

  const screenTargetPath = useMemo(() => {
    const code = normalizeCode(screenCode);
    if (!code) return '';
    if (screenMode === 'return') return `/screen/${code}/return`;
    if (screenMode === 'sponsor') return `/screen/${code}/sponsor`;
    return `/screen/${code}`;
  }, [screenCode, screenMode]);

  const activeMeta = MODES.find((m) => m.id === activeMode);

  return (
    <div className="min-h-screen bg-zinc-950 text-white app-shell flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Music2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-lg tracking-tight">BlindTest<span className="text-indigo-400">Live</span></span>
        </div>
        <button
          onClick={() => navigate('/store')}
          className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 transition-colors"
        >
          <MicVocal className="w-3.5 h-3.5" />
          Bibliothèque
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <AnimatePresence mode="wait">
          {!activeMode ? (
            /* ── Sélecteur de rôle ── */
            <motion.div
              key="selector"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full max-w-xl space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-2 text-xs text-zinc-500 border border-white/10 rounded-full px-3 py-1 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Blind Test multi-écrans en temps réel
                </div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                  Quel est ton rôle<span className="text-indigo-400"> ce soir ?</span>
                </h1>
                <p className="text-zinc-500 text-sm">Sélectionne ton profil pour accéder à la bonne interface.</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {MODES.map((mode, i) => (
                  <motion.button
                    key={mode.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    onClick={() => { setActiveMode(mode.id); setError(''); setPlayerStep('code'); }}
                    className={`group w-full flex items-center gap-4 rounded-2xl border ${mode.border} ${mode.bg} p-4 text-left transition-all hover:scale-[1.02] hover:brightness-110`}
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-black/20 ${mode.color} flex-shrink-0`}>
                      <mode.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white">{mode.label}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{mode.tagline}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] text-zinc-600 mb-1">Nécessite</p>
                      <p className={`text-[11px] font-medium ${mode.color}`}>{mode.what}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 transition-colors" />
                  </motion.button>
                ))}
              </div>

            </motion.div>
          ) : (
            /* ── Panneau de connexion ── */
            <motion.div
              key={activeMode}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="w-full max-w-md"
            >
              <div className={`rounded-2xl border ${activeMeta?.border} bg-zinc-900 shadow-xl overflow-hidden`}>
                {/* Mode header */}
                <div className={`${activeMeta?.bg} px-6 py-5 border-b ${activeMeta?.border}`}>
                  <button
                    onClick={() => { setActiveMode(null); setError(''); }}
                    className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Changer de rôle
                  </button>
                  <div className="flex items-center gap-3">
                    {activeMeta && (
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-black/20 ${activeMeta.color}`}>
                        <activeMeta.icon className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-lg">{activeMeta?.label}</p>
                      <p className="text-xs text-zinc-400">{activeMeta?.tagline}</p>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-6 space-y-5">
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 text-center">
                      {error}
                    </div>
                  )}

                  {/* ── JOUEUR ── */}
                  {activeMode === 'player' && (
                    <form onSubmit={playerStep === 'code' ? handleCheckGame : handleJoinGame} className="space-y-5">
                      {playerStep === 'code' ? (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Code de la partie
                          </label>
                          <p className="text-xs text-zinc-500">
                            L'animateur affiche un code à 6 caractères sur son écran. Saisis-le ici.
                          </p>
                          <input
                            type="text"
                            maxLength={6}
                            value={gameCode}
                            onChange={(e) => setGameCode(normalizeCode(e.target.value))}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-4 text-center text-3xl font-mono font-black tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:opacity-20"
                            placeholder="ABCDEF"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                              Ton pseudo
                            </label>
                            <p className="text-xs text-zinc-500">
                              Le nom qui s'affichera sur l'écran public et dans le classement.
                            </p>
                            <input
                              type="text"
                              maxLength={20}
                              value={playerName}
                              onChange={(e) => setPlayerName(e.target.value)}
                              className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                              placeholder="Ex: Mozart, Daft Punk…"
                              autoFocus
                            />
                          </div>
                          {isTeamMode && availableTeams.length > 0 && (
                            <div className="space-y-2">
                              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                                Choisis ton équipe
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                {availableTeams.map((t) => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTeam(t.id)}
                                    className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                                      team === t.id
                                        ? 'border-white/40 bg-white/10'
                                        : 'border-white/5 bg-zinc-950 hover:bg-zinc-800'
                                    }`}
                                  >
                                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                                    <span className="text-sm font-medium truncate">{t.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => { setPlayerStep('code'); setError(''); }}
                            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                          >
                            ← Changer le code ({normalizeCode(gameCode)})
                          </button>
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={playerLoading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                      >
                        {playerStep === 'code' ? <Play className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                        {playerLoading ? 'Vérification...' : playerStep === 'code' ? 'Vérifier le code' : 'Rejoindre la partie'}
                      </button>
                    </form>
                  )}

                  {/* ── ANIMATEUR ── */}
                  {activeMode === 'host' && (
                    <form
                      onSubmit={adminNeedsTwoFactor ? handleAdminTwoFactor : handleAdminAuth}
                      autoComplete="on"
                      className="space-y-4"
                    >
                      {!adminNeedsTwoFactor ? (
                        <>
                          <div className="flex rounded-xl border border-white/10 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setAdminMode('login')}
                              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${adminMode === 'login' ? 'bg-emerald-600 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-white'}`}
                            >
                              Connexion
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdminMode('signup')}
                              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${adminMode === 'signup' ? 'bg-emerald-600 text-white' : 'bg-zinc-950 text-zinc-400 hover:text-white'}`}
                            >
                              Créer un compte
                            </button>
                          </div>
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                              Adresse e-mail
                            </label>
                            <input
                              id="admin-email"
                              name="email"
                              type="email"
                              value={adminEmail}
                              onChange={(e) => setAdminEmail(e.target.value)}
                              className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                              placeholder="ton@email.com"
                              autoComplete="username"
                              autoFocus
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                              Mot de passe
                            </label>
                            <input
                              id="admin-password"
                              name="password"
                              type="password"
                              value={adminPassword}
                              onChange={(e) => setAdminPassword(e.target.value)}
                              className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                              placeholder="••••••••"
                              autoComplete={adminMode === 'signup' ? 'new-password' : 'current-password'}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                            Code d'authentification 2FA
                          </label>
                          <p className="text-xs text-zinc-500">Ouvre ton application d'authentification et saisis le code à 6 chiffres.</p>
                          <input
                            type="text"
                            maxLength={6}
                            value={adminTwoFactorCode}
                            onChange={(e) => setAdminTwoFactorCode(e.target.value)}
                            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-4 text-center text-3xl font-mono tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                            placeholder="000000"
                            autoFocus
                          />
                          <button type="button" onClick={() => { setAdminNeedsTwoFactor(false); setAdminTwoFactorCode(''); setError(''); }} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                            ← Retour
                          </button>
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={adminLoading}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                      >
                        <LogIn className="w-4 h-4" />
                        {adminLoading ? 'Chargement...' : adminNeedsTwoFactor ? 'Valider le code 2FA' : adminMode === 'login' ? 'Accéder au dashboard' : 'Créer mon compte'}
                      </button>
                    </form>
                  )}

                  {/* ── CO-ANIMATEUR ── */}
                  {activeMode === 'cohost' && (
                    <form onSubmit={handleCohostAccess} className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          Code de la partie
                        </label>
                        <p className="text-xs text-zinc-500">Le code à 6 caractères de la partie en cours.</p>
                        <input
                          type="text"
                          maxLength={6}
                          value={cohostGameCode}
                          onChange={(e) => setCohostGameCode(normalizeCode(e.target.value))}
                          className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-center font-mono tracking-widest text-xl focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                          placeholder="ABCDEF"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          Token co-animateur
                        </label>
                        <p className="text-xs text-zinc-500">Reçu de l'animateur principal via le dashboard.</p>
                        <input
                          type="text"
                          value={cohostToken}
                          onChange={(e) => setCohostToken(e.target.value)}
                          className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
                          placeholder="Colle le token ici"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={cohostLoading}
                        className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                      >
                        <Ticket className="w-4 h-4" />
                        {cohostLoading ? 'Connexion...' : 'Accéder à la régie'}
                      </button>
                    </form>
                  )}

                  {/* ── ÉCRANS ── */}
                  {activeMode === 'screens' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          Code de la partie
                        </label>
                        <p className="text-xs text-zinc-500">Le code à 6 caractères de la partie en cours.</p>
                        <input
                          type="text"
                          maxLength={6}
                          value={screenCode}
                          onChange={(e) => setScreenCode(normalizeCode(e.target.value))}
                          className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-center font-mono tracking-widest text-xl focus:outline-none focus:ring-2 focus:ring-fuchsia-500 transition-all"
                          placeholder="ABCDEF"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          Type d'écran
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'public', label: 'Public', desc: 'Joueurs + classement', icon: Monitor },
                            { id: 'return', label: 'Retour régie', desc: 'Vue animateur', icon: Tv },
                            { id: 'sponsor', label: 'Sponsor', desc: 'Branding client', icon: Sparkles },
                          ].map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setScreenMode(s.id as any)}
                              className={`rounded-xl border p-3 text-left transition-all ${
                                screenMode === s.id
                                  ? 'bg-fuchsia-600/20 border-fuchsia-500/40 text-fuchsia-200'
                                  : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <s.icon className="w-4 h-4 mb-1" />
                              <p className="text-xs font-semibold">{s.label}</p>
                              <p className="text-[10px] opacity-70">{s.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (!screenTargetPath) { setError('Entre un code de partie'); return; }
                          navigate(screenTargetPath);
                        }}
                        className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                      >
                        <Monitor className="w-4 h-4" />
                        Ouvrir l&apos;écran
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="text-center text-xs text-zinc-700 py-4">
        BlindTestLive &mdash; Soirées musicales interactives
      </footer>
    </div>
  );
}
