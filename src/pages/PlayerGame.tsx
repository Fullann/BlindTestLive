import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, Player } from '../types';
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
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!gameId) return;

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
      playSound(type);
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

    // Initial fetch of state if we are already connected
    if (socket.connected) {
      joinGame();
    }

    return () => {
      socket.off('game:stateUpdate', handleStateUpdate);
      socket.off('game:playSound', handleSound);
      socket.off('connect', joinGame);
    };
  }, [gameId, navigate]);

  const handleBuzz = () => {
    if (gameState?.status === 'playing' && player && !player.lockedOut) {
      socket.emit('player:buzz', { gameId, playerId: player.id }, () => {});
    }
  };

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
    const colors: Record<string, string> = { red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308' };
    return colors[teamId] || '#ffffff';
  };

  const uiColor = gameState.isTeamMode && player.team ? getTeamColor(player.team) : player.color;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
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

        {/* Big Buzzer Button */}
        {gameState.status === 'countdown' ? (
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
      </div>
    </div>
  );
}
