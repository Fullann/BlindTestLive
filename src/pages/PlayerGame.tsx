import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, Player } from '../types';
import { useToast } from '../context/ToastContext';
import { api } from '../api';
import { motion } from 'framer-motion';
import clsx from 'clsx';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// Simple sound synthesizer
const playSound = (type: 'buzz' | 'correct' | 'wrong') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    if (type === 'buzz') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'correct') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.1); // C#
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.2); // E
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'wrong') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    console.error("Audio error:", e);
  }
};

export default function PlayerGame() {
  const { error: toastError, success: toastSuccess } = useToast();
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [jokerLoading, setJokerLoading] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('blindtest_sound_enabled') !== 'false');
  const [hapticEnabled, setHapticEnabled] = useState(() => localStorage.getItem('blindtest_haptic_enabled') !== 'false');
  const [profileNickname, setProfileNickname] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
  const [profilePreviewBadges, setProfilePreviewBadges] = useState<string[]>([]);
  const [textAnswerDraft, setTextAnswerDraft] = useState('');
  const [sendingTextAnswer, setSendingTextAnswer] = useState(false);
  const [pingMs, setPingMs] = useState<number | null>(null);
  // WebRTC mic
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState('');
  const playerPeerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!gameId) return;
    localStorage.setItem('blindtest_last_game_id', gameId);

    const playerId = localStorage.getItem('blindtest_player_id');
    const playerSecret = localStorage.getItem('blindtest_player_secret');
    const savedName = localStorage.getItem('blindtest_player_name');
    const savedTeam = localStorage.getItem('blindtest_player_team');
    const publicId =
      localStorage.getItem('blindtest_player_public_id') ||
      `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('blindtest_player_public_id', publicId);
    setProfileNickname(localStorage.getItem('blindtest_profile_nickname') || savedName || '');
    
    if (!playerId || !playerSecret || !savedName) {
      navigate('/');
      return;
    }

    const handleStateUpdate = (state: GameState) => {
      setGameState(state);
      if (state.players[playerId]) {
        setPlayer(state.players[playerId]);
      } else {
        // Player not in game, maybe kicked or game restarted
        navigate('/');
      }
    };

    const handleSound = (type: 'buzz' | 'correct' | 'wrong') => {
      if (soundEnabled) playSound(type);
      if (hapticEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        if (type === 'buzz') navigator.vibrate(100);
        if (type === 'correct') navigator.vibrate([60, 40, 60]);
        if (type === 'wrong') navigator.vibrate([150, 50, 150]);
      }
    };

    const handleForcedQuit = () => {
      localStorage.removeItem('blindtest_last_game_id');
      navigate('/');
    };

    const joinGame = () => {
      socket.emit('player:joinGame', { 
        gameId, 
        playerId, 
        playerSecret,
        publicId,
        name: savedName,
        team: savedTeam || undefined
      }, (res: any) => {
        if (!res.success) {
          navigate('/');
          return;
        }
        socket.emit('game:requestState', { gameId, playerId, playerSecret }, () => {});
      });
    };

    // Attempt to rejoin if we just connected (e.g., page refresh)
    socket.on('connect', joinGame);

    socket.on('game:stateUpdate', handleStateUpdate);
    socket.on('game:playSound', handleSound);
    socket.on('player:kicked', handleForcedQuit);
    socket.on('player:forceLogout', handleForcedQuit);

    // ── WebRTC mic: host requests mic ──────────────────────────────────────
    const startMicSession = async () => {
      setMicError('');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;

        const pc = new RTCPeerConnection(RTC_CONFIG);
        playerPeerRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('player:micIceCandidate', { gameId, playerId, candidate: e.candidate }, () => {});
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') setMicActive(true);
          if (['disconnected', 'closed', 'failed'].includes(pc.connectionState)) stopMicSession();
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('player:micOffer', { gameId, playerId, sdp: pc.localDescription }, () => {});
        setMicActive(true);
      } catch (err: any) {
        setMicError(err.name === 'NotAllowedError' ? 'Accès micro refusé' : 'Impossible d\'activer le micro');
        setMicActive(false);
      }
    };

    const stopMicSession = () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      playerPeerRef.current?.close();
      playerPeerRef.current = null;
      setMicActive(false);
      setMicError('');
    };

    const handleRequestPlayerMic = () => {
      void startMicSession();
    };

    const handleMicAnswer = ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      playerPeerRef.current?.setRemoteDescription(new RTCSessionDescription(sdp)).catch(() => {});
    };

    const handleMicIceCandidate = ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      playerPeerRef.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    };

    const handleMicStop = () => {
      stopMicSession();
      socket.emit('player:micStopped', { gameId, playerId }, () => {});
    };

    socket.on('host:requestPlayerMic', handleRequestPlayerMic);
    socket.on('player:micAnswer', handleMicAnswer);
    socket.on('player:micIceCandidate', handleMicIceCandidate);
    socket.on('player:micStop', handleMicStop);

    // Initial fetch of state if we are already connected
    if (socket.connected) {
      joinGame();
    }

    return () => {
      socket.off('game:stateUpdate', handleStateUpdate);
      socket.off('game:playSound', handleSound);
      socket.off('player:kicked', handleForcedQuit);
      socket.off('player:forceLogout', handleForcedQuit);
      socket.off('connect', joinGame);
      socket.off('host:requestPlayerMic', handleRequestPlayerMic);
      socket.off('player:micAnswer', handleMicAnswer);
      socket.off('player:micIceCandidate', handleMicIceCandidate);
      socket.off('player:micStop', handleMicStop);
      stopMicSession();
    };
  }, [gameId, navigate, soundEnabled, hapticEnabled]);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const measure = () => {
      const startedAt = performance.now();
      socket.emit('game:check', gameId, () => {
        if (!active) return;
        setPingMs(Math.round(Math.max(0, performance.now() - startedAt)));
      });
    };
    measure();
    const id = window.setInterval(measure, 10000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [gameId]);

  const handleClaimProfile = async () => {
    if (!gameState || !player || !gameId) return;
    const publicId = localStorage.getItem('blindtest_player_public_id');
    const nickname = profileNickname.trim();
    if (!publicId || !nickname) {
      toastError('Pseudo requis');
      return;
    }
    setSavingProfile(true);
    try {
      await api.playerProfiles.claim({
        publicId,
        nickname,
        gameId,
        playerName: player.name,
        score: player.score,
        buzzes: player.stats?.buzzes || 0,
        correctAnswers: player.stats?.correctAnswers || 0,
        wrongAnswers: player.stats?.wrongAnswers || 0,
      });
      localStorage.setItem('blindtest_profile_nickname', nickname);
      setProfileSaved(true);
      toastSuccess('Profil sauvegardé');
    } catch (error) {
      toastError((error as Error).message || 'Erreur sauvegarde profil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleBuzz = () => {
    if (gameState?.status === 'playing' && player && !player.lockedOut) {
      socket.emit('player:buzz', { gameId, playerId: player.id }, () => {});
    }
  };

  const handleUseJoker = (jokerType: 'double' | 'steal' | 'skip') => {
    if (!player || !gameId) return;
    const target = jokerType === 'steal'
      ? (Object.values(gameState?.players || {}).filter((p: any) => p.id !== player.id).sort((a: any, b: any) => b.score - a.score)[0] as Player | undefined)
      : undefined;
    setJokerLoading(jokerType);
    socket.emit('player:useJoker', {
      gameId,
      playerId: player.id,
      jokerType,
      targetPlayerId: target?.id,
    }, (res: any) => {
      setJokerLoading(null);
      if (!res?.success) {
        toastError(res?.error || 'Joker indisponible');
      }
    });
  };

  const handleSubmitTextAnswer = () => {
    if (!player || !gameId) return;
    const answer = textAnswerDraft.trim();
    if (!answer) return;
    setSendingTextAnswer(true);
    socket.emit('player:submitTextAnswer', { gameId, playerId: player.id, answer }, (res: any) => {
      setSendingTextAnswer(false);
      if (!res?.success) {
        toastError(res?.error || 'Envoi impossible');
        return;
      }
      setTextAnswerDraft('');
      toastSuccess('Réponse envoyée');
    });
  };

  useEffect(() => {
    if (gameState?.status !== 'finished') return;
    setShowProfilePrompt(true);
    localStorage.removeItem('blindtest_last_game_id');
    const timeout = window.setTimeout(() => {
      navigate('/');
    }, 10000);
    return () => window.clearTimeout(timeout);
  }, [gameState?.status, navigate]);

  useEffect(() => {
    if (!player) return;
    const predictedBadges: string[] = [];
    const totalCorrect = Number(player.stats?.correctAnswers || 0);
    const totalWrong = Number(player.stats?.wrongAnswers || 0);
    if (totalCorrect >= 8) predictedBadges.push('oreille d\'or');
    if (totalCorrect >= 3 && totalWrong <= 1) predictedBadges.push('sniper');
    if (player.score >= 10) predictedBadges.push('top score');
    setProfilePreviewBadges(predictedBadges);
  }, [player]);

  if (!gameState || !player) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4 text-center">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-zinc-400">Connexion à la partie...</p>
      </div>
    );
  }

  const isMyBuzz = gameState.buzzedPlayerId === player.id;
  const isSomeoneElseBuzzed = gameState.status === 'paused' && !isMyBuzz;
  const canBuzz = gameState.status === 'playing' && !player.lockedOut;

  const displayScore = gameState.isTeamMode && player.team
    ? (Object.values(gameState.players) as Player[]).reduce((acc, p) => p.team === player.team ? acc + p.score : acc, 0)
    : player.score;

  const getTeamColor = (teamId: string) => {
    const configured = gameState.teamConfig?.find((team) => team.id === teamId);
    return configured?.color || '#ffffff';
  };

  const uiColor = gameState.isTeamMode && player.team ? getTeamColor(player.team) : player.color;
  const rankedPlayers = (Object.values(gameState.players) as Player[])
    .slice()
    .sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));
  const myRank = rankedPlayers.findIndex((p) => p.id === player.id) + 1;

  const rankedTeams = Object.entries(
    (Object.values(gameState.players) as Player[]).reduce<Record<string, number>>((acc, current) => {
      if (!current.team) return acc;
      acc[current.team] = (acc[current.team] || 0) + current.score;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const myTeamRank = player.team ? rankedTeams.findIndex(([teamId]) => teamId === player.team) + 1 : 0;
  const myTeamName = player.team ? (gameState.teamConfig?.find((team) => team.id === player.team)?.name || player.team) : '';
  const currentRound = (gameState.rounds || []).find(
    (round) => gameState.currentTrackIndex >= round.startIndex && gameState.currentTrackIndex <= round.endIndex,
  );
  const textModeEnabled = Boolean(currentRound?.textAnswersEnabled);
  const buzzLatencyMs = isMyBuzz && gameState.trackStartTime && gameState.buzzTimestamp
    ? Math.max(0, gameState.buzzTimestamp - gameState.trackStartTime)
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden app-shell">
      {/* Background glow based on player color */}
      <div 
        className="absolute inset-0 opacity-20 transition-colors duration-1000"
        style={{ background: `radial-gradient(circle at center, ${uiColor} 0%, transparent 70%)` }}
      />

      <div className="z-10 w-full max-w-sm flex flex-col items-center justify-center h-full space-y-12">
        {/* Header info */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-zinc-900 border border-white/10 text-sm font-medium mb-4">
            {gameState.isTeamMode ? 'Score Équipe' : 'Score'}: <span className="ml-2 font-bold font-mono text-lg">{displayScore}</span>
          </div>
          <h2 className="text-2xl font-bold">{player.name}</h2>
          
          <p className={clsx(
            "text-sm font-medium uppercase tracking-widest mt-4 transition-colors",
            gameState.status === 'lobby' && "text-yellow-400",
            gameState.status === 'countdown' && "text-indigo-400",
            gameState.status === 'playing' && "text-emerald-400",
            gameState.status === 'paused' && "text-red-400",
            gameState.status === 'revealed' && "text-blue-400",
            gameState.status === 'finished' && "text-purple-400"
          )}>
            {gameState.status === 'lobby' && 'En attente...'}
            {gameState.status === 'countdown' && 'Préparez-vous !'}
            {gameState.status === 'playing' && 'Écoutez !'}
            {gameState.status === 'paused' && (isMyBuzz ? 'À vous de jouer !' : 'Quelqu\'un a buzzé')}
            {gameState.status === 'revealed' && 'Réponse révélée'}
            {gameState.status === 'finished' && 'Partie terminée'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-2 text-[11px] text-zinc-500">
            {pingMs !== null && <span>Latence réseau: {pingMs} ms</span>}
            {buzzLatencyMs !== null && <span>• Réaction buzz: {(buzzLatencyMs / 1000).toFixed(2)} s</span>}
          </div>
        </div>

        {/* Mic active indicator */}
        {micActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full bg-red-500/15 border border-red-500/40 rounded-2xl px-5 py-4 flex items-center gap-3"
          >
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm0 2a2 2 0 0 1 2 2v7a2 2 0 0 1-4 0V5a2 2 0 0 1 2-2zm-7 8a7 7 0 0 0 14 0h-2a5 5 0 0 1-10 0H5zm7 8v2h-2v-2a9 9 0 0 0 2 0z"/>
                </svg>
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full animate-ping" />
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full" />
            </div>
            <div>
              <p className="text-red-300 font-semibold text-sm">Micro activé</p>
              <p className="text-red-400/70 text-xs">L&apos;animateur vous écoute — parlez normalement</p>
            </div>
          </motion.div>
        )}
        {micError && (
          <div className="w-full bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 text-sm text-center">
            {micError}
          </div>
        )}

        {/* Main action / end screen */}
        {gameState.status === 'finished' ? (
          <div className="w-full bg-zinc-900/85 border border-white/10 rounded-2xl p-5 space-y-4 text-center">
            <p className="text-sm uppercase tracking-widest text-zinc-500">Classement final</p>
            <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-xl p-4">
              <p className="text-zinc-300 text-sm">Ta position</p>
              <p className="text-4xl font-black mt-1">#{myRank}</p>
              <p className="text-zinc-400 text-xs mt-1">
                sur {rankedPlayers.length} joueur{rankedPlayers.length > 1 ? 's' : ''}
              </p>
              {gameState.isTeamMode && player.team && myTeamRank > 0 && (
                <p className="text-sm text-indigo-200 mt-2">
                  Equipe {myTeamName}: #{myTeamRank}
                </p>
              )}
            </div>

            <div className="text-left bg-zinc-950 border border-white/10 rounded-xl p-3">
              <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Top joueurs</p>
              <div className="space-y-2">
                {rankedPlayers.slice(0, 5).map((rankedPlayer, index) => (
                  <div
                    key={rankedPlayer.id}
                    className={clsx(
                      'flex items-center justify-between rounded-lg px-3 py-2 text-sm border',
                      rankedPlayer.id === player.id
                        ? 'bg-indigo-500/15 border-indigo-400/30'
                        : 'bg-zinc-900 border-white/5',
                    )}
                  >
                    <span className="text-zinc-200">#{index + 1} {rankedPlayer.name}</span>
                    <span className="font-mono text-zinc-300">{rankedPlayer.score} pts</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {showProfilePrompt && (
                <div className="bg-zinc-900 border border-indigo-500/30 rounded-lg p-3 text-left">
                  <p className="text-xs text-zinc-400 mb-1 uppercase tracking-wider">Profil joueur (optionnel)</p>
                  <p className="text-sm text-zinc-200 mb-3">
                    Sauvegarde ton pseudo pour garder ton historique et tes badges entre les soirées.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div className="bg-zinc-800 rounded p-2 border border-white/10">
                      <p className="text-zinc-500">Score partie</p>
                      <p className="font-semibold text-indigo-300">{player.score} pts</p>
                    </div>
                    <div className="bg-zinc-800 rounded p-2 border border-white/10">
                      <p className="text-zinc-500">Réussite</p>
                      <p className="font-semibold text-indigo-300">
                        {player.stats?.buzzes ? Math.round(((player.stats?.correctAnswers || 0) / player.stats.buzzes) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                  <div className="mb-3">
                    <p className="text-xs text-zinc-500 mb-1">Badges potentiels</p>
                    <div className="flex flex-wrap gap-2">
                      {profilePreviewBadges.length === 0 && <span className="text-xs text-zinc-500">Continue à jouer pour débloquer des badges</span>}
                      {profilePreviewBadges.map((badge) => (
                        <span key={badge} className="text-xs bg-indigo-600/20 border border-indigo-500/30 rounded-full px-2.5 py-1 text-indigo-200">
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={profileNickname}
                      onChange={(e) => setProfileNickname(e.target.value)}
                      placeholder="Ton pseudo"
                      className="flex-1 bg-zinc-800 border border-white/10 rounded px-2 py-2 text-sm"
                    />
                    <button
                      onClick={() => void handleClaimProfile()}
                      disabled={savingProfile || profileSaved}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded px-3 py-2 text-xs font-medium"
                    >
                      {profileSaved ? 'Sauvé' : savingProfile ? 'Sauvegarde...' : 'Sauvegarder'}
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      onClick={() => navigate(`/player/profile/${encodeURIComponent(localStorage.getItem('blindtest_player_public_id') || '')}`)}
                      className="text-xs text-indigo-300 hover:text-indigo-200"
                    >
                      Voir mon profil
                    </button>
                    <button
                      onClick={() => setShowProfilePrompt(false)}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Plus tard
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => navigate('/')}
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 text-sm font-medium"
              >
                Retour à l&apos;accueil
              </button>
              <p className="text-xs text-zinc-500">Redirection automatique dans quelques secondes...</p>
            </div>
          </div>
        ) : gameState.status === 'onboarding' ? (
          <div className="w-full bg-zinc-900/85 border border-white/10 rounded-2xl p-5 space-y-4 text-center">
            <p className="text-sm uppercase tracking-widest text-zinc-500">Tutoriel joueur</p>
            <p className="text-zinc-300 text-sm">
              Utilise le bouton BUZZ quand la musique démarre. Tu peux aussi activer/désactiver les effets.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setSoundEnabled((prev) => {
                    const next = !prev;
                    localStorage.setItem('blindtest_sound_enabled', String(next));
                    return next;
                  });
                }}
                className={clsx('rounded-lg py-2 text-sm border', soundEnabled ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-200' : 'bg-zinc-800 border-white/10 text-zinc-300')}
              >
                Son: {soundEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => {
                  setHapticEnabled((prev) => {
                    const next = !prev;
                    localStorage.setItem('blindtest_haptic_enabled', String(next));
                    return next;
                  });
                }}
                className={clsx('rounded-lg py-2 text-sm border', hapticEnabled ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-200' : 'bg-zinc-800 border-white/10 text-zinc-300')}
              >
                Vibration: {hapticEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Début dans {gameState.countdown || gameState.tutorialSeconds || 10}s...
            </p>
          </div>
        ) : gameState.status === 'countdown' ? (
          <div className="relative w-64 h-64 rounded-full shadow-2xl flex items-center justify-center bg-zinc-900 border-8 border-indigo-500/30">
            <motion.span 
              key={gameState.countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              className="text-8xl font-black text-indigo-400"
            >
              {gameState.countdown}
            </motion.span>
          </div>
        ) : (
          <motion.button
            whileTap={canBuzz ? { scale: 0.95 } : {}}
            onClick={handleBuzz}
            disabled={!canBuzz}
            className={clsx(
              "relative w-64 h-64 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300",
              canBuzz ? "cursor-pointer hover:brightness-110 active:brightness-90" : "cursor-not-allowed opacity-50 grayscale",
              isMyBuzz && "ring-8 ring-white shadow-[0_0_100px_rgba(255,255,255,0.5)] grayscale-0 opacity-100 scale-105"
            )}
            style={{ 
              backgroundColor: uiColor,
              boxShadow: canBuzz ? `0 20px 50px -10px ${uiColor}80, inset 0 10px 20px -10px rgba(255,255,255,0.5)` : undefined
            }}
          >
            <span className="text-4xl font-black tracking-tighter uppercase text-white drop-shadow-md">
              {player.lockedOut ? 'Bloqué' : isMyBuzz ? 'BUZZ !' : 'BUZZ'}
            </span>
          </motion.button>
        )}

        {gameState.status !== 'finished' && textModeEnabled && (
          <div className="w-full bg-zinc-900/80 border border-white/10 rounded-2xl p-4">
            <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Question ouverte</p>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={200}
                value={textAnswerDraft}
                onChange={(e) => setTextAnswerDraft(e.target.value)}
                placeholder="Ta réponse texte..."
                className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={handleSubmitTextAnswer}
                disabled={
                  sendingTextAnswer ||
                  textAnswerDraft.trim().length === 0 ||
                  !['playing', 'paused'].includes(gameState.status)
                }
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg px-3 py-2 text-xs font-medium"
              >
                {sendingTextAnswer ? '...' : 'Envoyer'}
              </button>
            </div>
          </div>
        )}

        {gameState.status !== 'finished' && gameState.enableBonuses !== false && (
        <div className="w-full bg-zinc-900/80 border border-white/10 rounded-2xl p-4">
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Jokers (1 utilisation)</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleUseJoker('double')}
              disabled={!player.jokers?.doublePoints || !!jokerLoading}
              className="bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 rounded-lg py-2 text-xs disabled:opacity-40"
            >
              {jokerLoading === 'double' ? '...' : 'x2 points'}
            </button>
            <button
              onClick={() => handleUseJoker('steal')}
              disabled={!player.jokers?.stealPoints || !!jokerLoading}
              className="bg-amber-600/20 border border-amber-500/30 text-amber-300 rounded-lg py-2 text-xs disabled:opacity-40"
            >
              {jokerLoading === 'steal' ? '...' : 'Vol'}
            </button>
            <button
              onClick={() => handleUseJoker('skip')}
              disabled={!player.jokers?.skipRound || !!jokerLoading}
              className="bg-fuchsia-600/20 border border-fuchsia-500/30 text-fuchsia-300 rounded-lg py-2 text-xs disabled:opacity-40"
            >
              {jokerLoading === 'skip' ? '...' : 'Skip'}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
