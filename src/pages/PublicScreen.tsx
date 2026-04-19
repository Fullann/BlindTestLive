import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, Player } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Music, Users } from 'lucide-react';
import confetti from 'canvas-confetti';

const Timer = ({ gameState, duration }: { gameState: GameState, duration: number }) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!gameState.trackStartTime) return;
      
      let elapsed = 0;
      if (gameState.status === 'paused' && gameState.buzzTimestamp) {
        elapsed = (gameState.buzzTimestamp - gameState.trackStartTime) / 1000;
      } else {
        elapsed = (Date.now() - gameState.trackStartTime) / 1000;
      }
      
      const remaining = Math.max(0, duration - elapsed);
      setTimeLeft(Math.ceil(remaining));
      setProgress((remaining / duration) * 100);
    }, 100);
    return () => clearInterval(interval);
  }, [gameState.trackStartTime, gameState.status, gameState.buzzTimestamp, duration]);

  return (
    <div className="mt-12 w-full max-w-2xl mx-auto">
      <div className="flex justify-between text-zinc-400 mb-2 font-mono text-xl">
        <span>00:00</span>
        <span className={timeLeft <= 5 ? 'text-red-500 font-bold animate-pulse' : ''}>
          00:{timeLeft.toString().padStart(2, '0')}
        </span>
      </div>
      <div className="h-4 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div 
          className={`h-full ${timeLeft <= 5 ? 'bg-red-500' : 'bg-indigo-500'}`}
          style={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
    </div>
  );
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

export default function PublicScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const hasFinishedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (gameState?.playlist && gameState.currentTrackIndex !== undefined) {
      const track = gameState.playlist[gameState.currentTrackIndex];
      // Reset audio/video to start time when track changes
      try {
        if (audioRef.current) {
          audioRef.current.currentTime = track?.startTime || 0;
        }
        if (videoRef.current) {
          videoRef.current.currentTime = track?.startTime || 0;
        }
      } catch (e) {
        // Ignore if media is not loaded yet, onLoadedMetadata will handle it
      }
    }
  }, [gameState?.currentTrackIndex, gameState?.playlist]);

  useEffect(() => {
    if (gameState?.status === 'playing') {
      audioRef.current?.play().catch(() => {});
      videoRef.current?.play().catch(() => {});
    } else {
      audioRef.current?.pause();
      videoRef.current?.pause();
    }
  }, [gameState?.status]);

  useEffect(() => {
    if (!gameId) return;

    const joinAsScreen = () => socket.emit('screen:joinGame', gameId, (response: any) => {
      if (!response.success) {
        console.error("Failed to join game screen");
        return;
      }
      socket.emit('game:requestState', { gameId, asScreen: true }, () => {});
    });
    joinAsScreen();
    socket.on('connect', joinAsScreen);

    const handleStateUpdate = (state: GameState) => {
      setGameState(state);
      
      if (state.status === 'finished' && !hasFinishedRef.current) {
        hasFinishedRef.current = true;
        // Trigger confetti
        const duration = 3000;
        const end = Date.now() + duration;

        const frame = () => {
          confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#818cf8', '#c084fc', '#f472b6']
          });
          confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#818cf8', '#c084fc', '#f472b6']
          });

          if (Date.now() < end) {
            requestAnimationFrame(frame);
          }
        };
        frame();
      } else if (state.status !== 'finished') {
        hasFinishedRef.current = false;
      }
    };

    const handleSound = (type: 'buzz' | 'correct' | 'wrong') => {
      playSound(type);
    };

    socket.on('game:stateUpdate', handleStateUpdate);
    socket.on('game:playSound', handleSound);

    return () => {
      socket.off('game:stateUpdate', handleStateUpdate);
      socket.off('game:playSound', handleSound);
      socket.off('connect', joinAsScreen);
    };
  }, [gameId]);

  useEffect(() => {
    if (document.fullscreenElement) return;
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  if (!gameState) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center text-2xl">En attente de la partie...</div>;
  }

  const joinUrl = `${window.location.origin}/game/${gameId}`;
  const buzzedPlayer = gameState.buzzedPlayerId ? gameState.players[gameState.buzzedPlayerId] : null;
  const isYoutubeMode = !!gameState.youtubeVideoId;
  const currentTrack = !isYoutubeMode ? gameState.playlist[gameState.currentTrackIndex] : null;
  const trackDuration = currentTrack?.duration || gameState.defaultTrackDuration || 20;
  const progressPct = !isYoutubeMode && gameState.playlist.length > 0
    ? Math.round(((gameState.currentTrackIndex + 1) / gameState.playlist.length) * 100)
    : 0;
  const sortedPlayers = (Object.values(gameState.players) as Player[]).sort((a, b) => b.score - a.score);
  const top3 = sortedPlayers.slice(0, 3);

  // Calculate team scores if in team mode
  const teamScores = gameState.isTeamMode ? (Object.values(gameState.players) as Player[]).reduce((acc, player) => {
    if (player.team) {
      acc[player.team] = (acc[player.team] || 0) + player.score;
    }
    return acc;
  }, {} as Record<string, number>) : null;

  const getTeamName = (teamId: string) => {
    const configured = gameState.teamConfig?.find((team) => team.id === teamId);
    return configured?.name || teamId;
  };

  const getTeamColor = (teamId: string) => {
    const configured = gameState.teamConfig?.find((team) => team.id === teamId);
    return configured?.color || '#ffffff';
  };

  const themeClass =
    gameState.theme === 'neon'
      ? 'bg-black text-cyan-100'
      : gameState.theme === 'retro'
        ? 'bg-amber-950 text-amber-100'
        : gameState.theme === 'minimal'
          ? 'bg-zinc-100 text-zinc-900'
          : 'bg-zinc-950 text-white';

  return (
    <div className={`min-h-screen ${themeClass} flex flex-col overflow-hidden app-shell`}>
      <div className="px-6 py-2 text-sm border-b border-white/10 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-4 overflow-hidden whitespace-nowrap">
          <span className="font-semibold">Top 3:</span>
          {top3.map((p, i) => (
            <span key={p.id}>{i + 1}. {p.name} ({p.score})</span>
          ))}
        </div>
        <div className="font-mono">Progression: {progressPct}%</div>
      </div>
      {/* Top Bar */}
      <div className="bg-black/20 border-b border-white/10 p-6 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="bg-white p-2 rounded-xl">
            <QRCodeSVG value={joinUrl} size={80} />
          </div>
          <div>
            <p className="text-zinc-400 text-lg uppercase tracking-widest font-semibold">Rejoignez la partie sur</p>
            <p className="text-2xl font-medium">{window.location.host}</p>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-zinc-400">Code :</p>
              <span className="bg-indigo-600 text-white px-4 py-1 rounded-lg text-3xl font-mono font-bold tracking-widest">
                {gameState.id}
              </span>
            </div>
          </div>
        </div>
        
        <div className="text-right">
          <p className="text-zinc-500 text-xl font-medium uppercase tracking-widest mb-2">
            {isYoutubeMode ? `Manche ${gameState.roundNumber || 1}` : `Piste ${gameState.currentTrackIndex + 1} / ${gameState.playlist.length}`}
          </p>
          <div className="flex items-center justify-end gap-3 text-zinc-300">
            <Users className="w-6 h-6" />
            <span className="text-2xl font-bold">{Object.keys(gameState.players).length} Joueurs</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex relative">
        
        {/* Left: Game Status / Track Info / Buzzer Animation */}
        <div className="flex-1 flex flex-col items-center justify-center p-12 relative z-10">
          <AnimatePresence mode="wait">
            {gameState.status === 'lobby' && (
              <motion.div 
                key="lobby"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                className="text-center"
              >
                <Music className="w-32 h-32 text-indigo-500/50 mx-auto mb-8 animate-pulse" />
                <h1 className="text-6xl font-bold tracking-tight mb-4">En attente de joueurs</h1>
                <p className="text-2xl text-zinc-400">Scannez le QR code pour rejoindre !</p>
              </motion.div>
            )}

            {gameState.status === 'onboarding' && (
              <motion.div
                key="onboarding"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="text-center bg-zinc-900/85 border border-white/10 rounded-3xl p-12 max-w-4xl"
              >
                <h1 className="text-5xl font-bold mb-6">Tutoriel joueur</h1>
                <div className="space-y-3 text-zinc-300 text-2xl">
                  <p>1. Rejoins avec le QR code ou le code partie</p>
                  <p>2. Appuie sur BUZZ dès que tu penses avoir la réponse</p>
                  <p>3. L&apos;animateur valide et les points s&apos;ajoutent</p>
                </div>
                <p className="mt-8 text-3xl font-semibold text-indigo-300">
                  Lancement dans {gameState.countdown || gameState.tutorialSeconds || 10}s
                </p>
              </motion.div>
            )}

            {gameState.status === 'countdown' && (
              <motion.div 
                key="countdown"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.5 }}
                className="text-center absolute inset-0 flex flex-col items-center justify-center z-50 bg-zinc-950/80 backdrop-blur-sm"
              >
                <motion.div
                  key={gameState.countdown}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-[15rem] font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 to-purple-600 drop-shadow-2xl"
                >
                  {gameState.countdown}
                </motion.div>
                <p className="text-4xl text-zinc-300 mt-8 font-medium tracking-widest uppercase">Préparez-vous...</p>
              </motion.div>
            )}

            {(gameState.status === 'playing' || gameState.status === 'paused') && (
              <motion.div 
                key="playing"
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="text-center w-full max-w-4xl mx-auto"
              >
                {currentTrack?.mediaType === 'image' && currentTrack.mediaUrl ? (
                  <div className="mb-8 rounded-2xl overflow-hidden shadow-2xl border-4 border-indigo-500/30">
                    <img src={currentTrack.mediaUrl} alt="Indice" className="w-full h-auto max-h-[50vh] object-contain bg-black/50" />
                  </div>
                ) : currentTrack?.mediaType === 'video' && currentTrack.mediaUrl ? (
                  <div className="mb-8 rounded-2xl overflow-hidden shadow-2xl border-4 border-indigo-500/30">
                    <video 
                      ref={videoRef} 
                      src={currentTrack.mediaUrl} 
                      loop 
                      className="w-full h-auto max-h-[50vh] object-contain bg-black/50" 
                      onLoadedMetadata={(e) => {
                        if (currentTrack.startTime) {
                          e.currentTarget.currentTime = currentTrack.startTime;
                        }
                      }}
                    />
                  </div>
                ) : currentTrack?.mediaType === 'youtube' && currentTrack.mediaUrl ? (
                  <div className="mb-8 rounded-2xl p-12 shadow-2xl border-4 border-indigo-500/30 bg-zinc-900/80 backdrop-blur-sm w-full max-w-5xl mx-auto min-h-[320px] flex flex-col justify-center">
                    <p className="text-3xl font-semibold text-center mb-10">Lecture en cours...</p>
                    <div className="flex items-end justify-center gap-3 h-44">
                      {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                        <motion.div
                          key={bar}
                          className="w-5 rounded-full bg-gradient-to-t from-indigo-500 to-fuchsia-400"
                          initial={{ height: 20 }}
                          animate={{ height: [20, 120, 48, 156, 34, 110, 20] }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: bar * 0.08,
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-zinc-400 mt-8 text-center text-lg">
                      Source privée animateur
                    </p>
                  </div>
                ) : currentTrack?.mediaType === 'text' && currentTrack.textContent ? (
                  <div className="mb-8 rounded-2xl p-12 shadow-2xl border-4 border-indigo-500/30 bg-zinc-900/80 backdrop-blur-sm">
                    <p className="text-4xl font-medium leading-relaxed">{currentTrack.textContent}</p>
                  </div>
                ) : (
                  <div className="w-48 h-48 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-12 border-4 border-indigo-500/30 relative">
                    <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
                    <Music className="w-20 h-20 text-indigo-400" />
                    {(currentTrack?.mediaType === 'audio' || !currentTrack?.mediaType) && currentTrack?.mediaUrl && (
                      <audio 
                        ref={audioRef} 
                        src={currentTrack.mediaUrl} 
                        loop 
                        className="hidden" 
                        onLoadedMetadata={(e) => {
                          if (currentTrack.startTime) {
                            e.currentTarget.currentTime = currentTrack.startTime;
                          }
                        }}
                      />
                    )}
                  </div>
                )}
                
                <h1 className="text-7xl font-bold tracking-tight italic text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                  {currentTrack?.mediaType === 'image' ? 'Regardez bien...' : 
                   currentTrack?.mediaType === 'text' ? 'Lisez bien...' : 
                   'Écoutez bien...'}
                </h1>
                
                {gameState.trackStartTime && (
                  <Timer gameState={gameState} duration={trackDuration} />
                )}
              </motion.div>
            )}

            {gameState.status === 'paused' && buzzedPlayer && (
              <motion.div 
                key="paused"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.5 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-md z-50 rounded-3xl"
              >
                <div 
                  className="absolute inset-0 opacity-20 -z-10 rounded-3xl"
                  style={{ background: `radial-gradient(circle at center, ${buzzedPlayer.color} 0%, transparent 70%)` }}
                />
                <h2 className="text-4xl uppercase tracking-widest font-bold mb-6" style={{ color: buzzedPlayer.color }}>
                  Buzz !
                </h2>
                <div 
                  className="text-9xl font-black tracking-tighter uppercase drop-shadow-2xl"
                  style={{ color: buzzedPlayer.color, textShadow: `0 0 40px ${buzzedPlayer.color}80` }}
                >
                  {buzzedPlayer.name}
                </div>
              </motion.div>
            )}

            {gameState.status === 'revealed' && (
              <motion.div 
                key="revealed"
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="text-center bg-zinc-900/80 backdrop-blur-xl p-16 rounded-3xl border border-white/10 shadow-2xl"
              >
                {isYoutubeMode ? (
                  <>
                    <h2 className="text-3xl text-zinc-400 uppercase tracking-widest font-semibold mb-8">Points attribués !</h2>
                    <h1 className="text-5xl font-bold mb-6 text-indigo-400">Préparez-vous pour la suite...</h1>
                  </>
                ) : (
                  <>
                    <h2 className="text-3xl text-zinc-400 uppercase tracking-widest font-semibold mb-8">La réponse était</h2>
                    <h1 className="text-7xl font-bold mb-6">{currentTrack?.title}</h1>
                    <p className="text-5xl text-indigo-400">{currentTrack?.artist}</p>
                  </>
                )}
              </motion.div>
            )}

            {gameState.status === 'finished' && (
              <motion.div 
                key="finished"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-5xl mx-auto"
              >
                <h1 className="text-6xl font-bold text-center mb-16 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">
                  Podium Final
                </h1>
                
                <div className="flex items-end justify-center gap-8 h-96 mb-16">
                  {(() => {
                    const sorted = (Object.values(gameState.players) as Player[]).sort((a, b) => b.score - a.score);
                    const top3 = sorted.slice(0, 3);
                    
                    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
                    
                    return podiumOrder.map((player) => {
                      const isFirst = player === top3[0];
                      const isSecond = player === top3[1];
                      
                      const height = isFirst ? 'h-full' : isSecond ? 'h-3/4' : 'h-1/2';
                      const color = isFirst ? 'bg-yellow-500' : isSecond ? 'bg-zinc-300' : 'bg-amber-600';
                      const delay = isFirst ? 0.4 : isSecond ? 0.2 : 0;
                      
                      return (
                        <motion.div 
                          key={player.id}
                          initial={{ height: 0 }}
                          animate={{ height: '100%' }}
                          transition={{ delay, duration: 0.5 }}
                          className={`relative w-48 flex flex-col justify-end ${height}`}
                        >
                          <div className="absolute -top-24 left-0 right-0 text-center">
                            <div className="w-12 h-12 mx-auto rounded-full mb-2" style={{ backgroundColor: player.color }} />
                            <p className="font-bold text-xl truncate px-2">{player.name}</p>
                            <p className="text-2xl font-black" style={{ color: player.color }}>{player.score} pts</p>
                          </div>
                          <div className={`w-full ${color} rounded-t-xl border-t-4 border-white/20 shadow-2xl flex items-start justify-center pt-4`}>
                            <span className="text-4xl font-black text-black/20">
                              {isFirst ? '1' : isSecond ? '2' : '3'}
                            </span>
                          </div>
                        </motion.div>
                      );
                    });
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Leaderboard */}
        <div className="w-1/3 bg-black/20 border-l border-white/5 p-8 flex flex-col">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-4">
            <Trophy className="w-8 h-8 text-yellow-500" />
            Classement {gameState.isTeamMode ? 'par Équipe' : ''}
          </h2>
          <div className="flex-1 overflow-y-auto space-y-4 pr-4">
            <AnimatePresence>
              {gameState.isTeamMode && teamScores ? (
                Object.entries(teamScores)
                  .sort(([, a], [, b]) => b - a)
                  .map(([teamId, score], index) => (
                    <motion.div 
                      key={teamId}
                      layout
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-zinc-950 border border-white/5 p-6 rounded-2xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-6">
                        <span className="text-3xl font-black text-zinc-600 w-8">{index + 1}</span>
                        <div 
                          className="w-6 h-6 rounded-full shadow-lg"
                          style={{ backgroundColor: getTeamColor(teamId), boxShadow: `0 0 20px ${getTeamColor(teamId)}80` }}
                        />
                        <span className="text-2xl font-bold">Équipe {getTeamName(teamId)}</span>
                      </div>
                      <span className="text-3xl font-mono font-bold text-indigo-400">{score}</span>
                    </motion.div>
                  ))
              ) : (
                (Object.values(gameState.players) as Player[])
                  .sort((a, b) => b.score - a.score)
                  .map((player, index) => (
                  <motion.div 
                    key={player.id}
                    layout
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-zinc-950 border border-white/5 p-6 rounded-2xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-6">
                      <span className="text-3xl font-black text-zinc-600 w-8">{index + 1}</span>
                      <div 
                        className="w-6 h-6 rounded-full shadow-lg"
                        style={{ backgroundColor: player.color, boxShadow: `0 0 20px ${player.color}80` }}
                      />
                      <span className="text-2xl font-bold">{player.name}</span>
                    </div>
                    <span className="text-3xl font-mono font-bold text-indigo-400">{player.score}</span>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}
