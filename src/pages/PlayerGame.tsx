import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, Player } from '../types';
import { useToast } from '../context/ToastContext';
import { motion } from 'framer-motion';
import clsx from 'clsx';

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
  const { error: toastError } = useToast();
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [jokerLoading, setJokerLoading] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('blindtest_sound_enabled') !== 'false');
  const [hapticEnabled, setHapticEnabled] = useState(() => localStorage.getItem('blindtest_haptic_enabled') !== 'false');

  useEffect(() => {
    if (!gameId) return;
    localStorage.setItem('blindtest_last_game_id', gameId);

    const playerId = localStorage.getItem('blindtest_player_id');
    const playerSecret = localStorage.getItem('blindtest_player_secret');
    const savedName = localStorage.getItem('blindtest_player_name');
    const savedTeam = localStorage.getItem('blindtest_player_team');
    
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
    };
  }, [gameId, navigate, soundEnabled, hapticEnabled]);

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

  useEffect(() => {
    if (gameState?.status !== 'finished') return;
    localStorage.removeItem('blindtest_last_game_id');
    const timeout = window.setTimeout(() => {
      navigate('/');
    }, 10000);
    return () => window.clearTimeout(timeout);
  }, [gameState?.status, navigate]);

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
        </div>

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
