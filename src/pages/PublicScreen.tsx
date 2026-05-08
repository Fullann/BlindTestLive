import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, Player } from '../types';
import { api } from '../api';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Music, Users, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

const Timer = ({ gameState, duration, strictMode }: { gameState: GameState; duration?: number; strictMode: boolean }) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [remainingSec, setRemainingSec] = useState(duration || 0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!gameState.trackStartTime) return;
      
      let elapsedMs = 0;
      if (gameState.status === 'paused' && gameState.buzzTimestamp) {
        elapsedMs = gameState.buzzTimestamp - gameState.trackStartTime;
      } else {
        elapsedMs = Date.now() - gameState.trackStartTime;
      }
      const elapsed = Math.max(0, Math.floor(elapsedMs / 1000));
      setElapsedSec(elapsed);
      if (strictMode && typeof duration === 'number' && duration > 0) {
        setRemainingSec(Math.max(0, duration - elapsed));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [gameState.trackStartTime, gameState.status, gameState.buzzTimestamp, strictMode, duration]);

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');
  const rm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const rs = String(remainingSec % 60).padStart(2, '0');

  return (
    <div className="mt-12 w-full max-w-2xl mx-auto">
      {strictMode && typeof duration === 'number' && duration > 0 ? (
        <>
          <div className="flex justify-between text-zinc-400 mb-2 font-mono text-xl">
            <span>00:00</span>
            <span className={remainingSec <= 5 ? 'text-red-500 font-bold animate-pulse' : ''}>
              {rm}:{rs}
            </span>
          </div>
          <div className="h-4 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              className={remainingSec <= 5 ? 'h-full bg-red-500' : 'h-full bg-indigo-500'}
              style={{ width: `${Math.min(100, (remainingSec / duration) * 100)}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-between text-zinc-400 mb-2 font-mono text-xl">
            <span>Temps écoulé</span>
            <span className="text-emerald-400 font-bold">
              {mm}:{ss}
            </span>
          </div>
          <div className="h-4 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-emerald-500/70"
              style={{ width: `${Math.min(100, (elapsedSec % 60) * (100 / 60))}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </>
      )}
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
  const [branding, setBranding] = useState<{ client_name?: string; logo_url?: string; primary_color?: string; accent_color?: string } | null>(null);
  const hasFinishedRef = useRef(false);
  const prevTrackIndexRef = useRef<number | null>(null);
  const roundTransitionTimeoutRef = useRef<number | null>(null);
  const [sponsorSlideIndex, setSponsorSlideIndex] = useState(0);
  const [showRoundTransition, setShowRoundTransition] = useState(false);
  const [roundTransitionLabel, setRoundTransitionLabel] = useState('');

  useEffect(() => {
    if (!gameId) return;

    const requestFreshState = () => {
      socket.emit('game:requestState', { gameId, asScreen: true }, () => {});
    };

    const joinAsScreen = () => socket.emit('screen:joinGame', gameId, (response: any) => {
      if (!response.success) {
        console.error("Failed to join game screen");
        return;
      }
      requestFreshState();
    });
    joinAsScreen();
    socket.on('connect', joinAsScreen);

    /** Retour navigateur / onglet : l’état peut être stale si des `game:stateUpdate` ont été manqués. */
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !socket.connected) return;
      requestFreshState();
    };
    document.addEventListener('visibilitychange', onVisibility);

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

    socket.on('game:stateUpdate', handleStateUpdate);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      socket.off('game:stateUpdate', handleStateUpdate);
      socket.off('connect', joinAsScreen);
    };
  }, [gameId]);

  useEffect(() => {
    const hasSponsorContent = Boolean(branding?.client_name || branding?.logo_url);
    if (!hasSponsorContent) {
      setSponsorSlideIndex(0);
      return;
    }
    const interval = window.setInterval(() => {
      setSponsorSlideIndex((prev) => (prev + 1) % 3);
    }, 4500);
    return () => window.clearInterval(interval);
  }, [branding?.client_name, branding?.logo_url]);

  useEffect(() => {
    if (gameState?.showSponsorRoundTransition === false) {
      setShowRoundTransition(false);
      if (roundTransitionTimeoutRef.current) {
        window.clearTimeout(roundTransitionTimeoutRef.current);
        roundTransitionTimeoutRef.current = null;
      }
    }
  }, [gameState?.showSponsorRoundTransition]);

  useEffect(() => {
    if (!gameState || gameState.youtubeVideoId) return;
    if (gameState.showSponsorRoundTransition === false) {
      prevTrackIndexRef.current = gameState.currentTrackIndex;
      return;
    }
    const currentIdx = gameState.currentTrackIndex;
    const prevIdx = prevTrackIndexRef.current;
    if (prevIdx !== null && currentIdx !== prevIdx) {
      setRoundTransitionLabel(`Manche ${currentIdx + 1}`);
      setShowRoundTransition(true);
      if (roundTransitionTimeoutRef.current) {
        window.clearTimeout(roundTransitionTimeoutRef.current);
      }
      roundTransitionTimeoutRef.current = window.setTimeout(() => {
        setShowRoundTransition(false);
        roundTransitionTimeoutRef.current = null;
      }, 1400);
      prevTrackIndexRef.current = currentIdx;
      return;
    }
    prevTrackIndexRef.current = currentIdx;
  }, [gameState?.currentTrackIndex, gameState?.youtubeVideoId, gameState]);

  useEffect(() => {
    return () => {
      if (roundTransitionTimeoutRef.current) {
        window.clearTimeout(roundTransitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const loadBranding = async () => {
      try {
        const res = await api.events.getBrandingByGame(gameId);
        if (!active) return;
        setBranding(res.branding || null);
      } catch {
        if (!active) return;
        setBranding(null);
      }
    };
    void loadBranding();
    return () => {
      active = false;
    };
  }, [gameId]);

  useEffect(() => {
    if (document.fullscreenElement) return;
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  if (!gameState) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center text-2xl">En attente de la partie...</div>;
  }

  const joinUrl = `${window.location.origin}/?mode=player&game=${encodeURIComponent(gameId || '')}`;
  const buzzedPlayer = gameState.buzzedPlayerId ? gameState.players[gameState.buzzedPlayerId] : null;
  const isYoutubeMode = !!gameState.youtubeVideoId;
  const primaryColor = branding?.primary_color || '#4f46e5';
  const accentColor = branding?.accent_color || '#a855f7';
  const currentTrack = !isYoutubeMode ? gameState.playlist[gameState.currentTrackIndex] : null;
  const trackDuration = currentTrack?.duration || gameState.defaultTrackDuration || 20;
  const progressPct = !isYoutubeMode && gameState.playlist.length > 0
    ? Math.round(((gameState.currentTrackIndex + 1) / gameState.playlist.length) * 100)
    : 0;
  const sortedPlayers = (Object.values(gameState.players) as Player[]).sort((a, b) => b.score - a.score);
  const top3 = sortedPlayers.slice(0, 3);
  const elapsedSeconds = gameState.trackStartTime
    ? Math.max(
        0,
        Math.floor(
          ((gameState.status === 'paused' && gameState.buzzTimestamp ? gameState.buzzTimestamp : Date.now()) - gameState.trackStartTime) /
            1000,
        ),
      )
    : 0;
  const revealDuration = Math.max(1, currentTrack?.imageRevealDuration || trackDuration || 30);
  const revealProgress = Math.min(1, elapsedSeconds / revealDuration);
  const imageBlurPx = currentTrack?.imageRevealMode === 'blur' ? Math.round((1 - revealProgress) * 16) : 0;

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
  const sponsorSlides = [
    branding?.client_name ? `Événement ${branding.client_name}` : 'Événement BlindTestLive',
    'Merci à notre sponsor',
    'Merci d’être avec nous',
  ];
  const isPreGame = gameState.status === 'lobby' || gameState.status === 'onboarding' || gameState.status === 'countdown';
  const qrSize = isPreGame ? 220 : 80;
  const ledHeadlineClass = 'font-black uppercase tracking-[0.06em] [text-shadow:0_0_16px_rgba(99,102,241,0.35)]';
  const showSponsorOverlay = Boolean(branding?.client_name || branding?.logo_url) && (
    gameState.status === 'lobby' ||
    gameState.status === 'onboarding' ||
    gameState.status === 'countdown' ||
    gameState.status === 'revealed' ||
    gameState.status === 'finished'
  );

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
            <div className={`${isPreGame ? 'p-4 rounded-2xl' : 'p-2 rounded-xl'} bg-white shadow-2xl transition-all duration-300`}>
              <QRCodeSVG value={joinUrl} size={qrSize} />
            </div>
          <div>
              <p className="text-zinc-400 text-lg uppercase tracking-widest font-semibold">{branding?.client_name ? `${branding.client_name} • ` : ''}Rejoignez la partie sur</p>
            <p className="text-2xl font-medium">{window.location.host}</p>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-zinc-400">Code :</p>
              <span
                className="text-white px-4 py-1 rounded-lg text-3xl font-mono font-bold tracking-widest"
                style={{ backgroundColor: primaryColor }}
              >
                {gameState.id}
              </span>
            </div>
          </div>
        </div>
        
        <div className="text-right">
          {branding?.logo_url && <img src={branding.logo_url} alt="logo client" className="h-24 max-w-[260px] ml-auto mb-2 object-contain" />}
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
        <AnimatePresence>
          {showRoundTransition && (
            <motion.div className="absolute inset-0 z-40 pointer-events-none" key={`transition-${roundTransitionLabel}`}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.35 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
                style={{ background: `radial-gradient(circle at center, ${accentColor}99 0%, ${primaryColor}44 35%, transparent 75%)` }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.04 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="px-10 py-5 rounded-2xl bg-black/70 border border-white/20 backdrop-blur-lg shadow-2xl">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-300 text-center mb-1">Transition sponsor</p>
                  <p className="text-4xl font-black text-center">{roundTransitionLabel}</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {showSponsorOverlay && (
          <div className="absolute top-5 right-5 z-30 pointer-events-none">
            <AnimatePresence mode="wait">
              <motion.div
                key={`sponsor-${sponsorSlideIndex}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.35 }}
                className="min-w-[300px] bg-black/45 border border-white/10 rounded-xl px-4 py-3 backdrop-blur-md"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-300" />
                  <p className="text-xs uppercase tracking-widest text-zinc-400">Sponsor live</p>
                </div>
                <p className="text-sm mt-1 text-zinc-100">{sponsorSlides[sponsorSlideIndex]}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
        
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
                {gameState.onboardingEnabled && (
                  <div className="mt-10 bg-zinc-900/85 border border-white/10 rounded-3xl p-8 max-w-3xl mx-auto text-left space-y-3">
                    <p className="text-center text-xl font-semibold text-indigo-300 mb-4">Comment jouer</p>
                    <p className="text-zinc-300 text-xl">1. Rejoins avec le QR code ou le code partie</p>
                    <p className="text-zinc-300 text-xl">2. Appuie sur <span className="font-bold text-white">BUZZ</span> dès que tu reconnais la musique</p>
                    <p className="text-zinc-300 text-xl">3. L&apos;animateur valide et les points s&apos;ajoutent</p>
                  </div>
                )}
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
                <h1 className={`text-5xl mb-6 ${ledHeadlineClass}`}>Tutoriel joueur</h1>
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
                {isYoutubeMode ? null : currentTrack?.mediaType === 'image' && currentTrack.mediaUrl ? (
                  <div className="mb-8 rounded-2xl overflow-hidden shadow-2xl border-4 border-indigo-500/30">
                    <img
                      src={currentTrack.mediaUrl}
                      alt="Indice"
                      className="w-full h-auto max-h-[50vh] object-contain bg-black/50 transition-all duration-300"
                      style={{ filter: imageBlurPx > 0 ? `blur(${imageBlurPx}px)` : 'none' }}
                    />
                  </div>
                ) : currentTrack?.mediaType === 'video' && currentTrack.mediaUrl ? (
                  <div className="mb-8 rounded-2xl overflow-hidden shadow-2xl border-4 border-indigo-500/30">
                    <video
                      src={currentTrack.mediaUrl}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-auto max-h-[50vh] object-contain bg-black/50"
                      onLoadedMetadata={(e) => {
                        if (currentTrack.startTime) {
                          e.currentTarget.currentTime = currentTrack.startTime;
                        }
                      }}
                    />
                  </div>
                ) : currentTrack?.mediaType === 'youtube' && currentTrack.mediaUrl ? null : currentTrack?.mediaType === 'text' && currentTrack.textContent ? (
                  <div className="mb-8 rounded-2xl p-12 shadow-2xl border-4 border-indigo-500/30 bg-zinc-900/80 backdrop-blur-sm">
                    <p className="text-4xl font-medium leading-relaxed">{currentTrack.textContent}</p>
                  </div>
                ) : (
                  <div className="w-48 h-48 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-12 border-4 border-indigo-500/30">
                    <Music className="w-20 h-20 text-indigo-400" />
                  </div>
                )}
                
                <h1 className={`text-7xl tracking-tight italic text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 ${ledHeadlineClass}`}>
                  {isYoutubeMode
                    ? 'YouTube'
                    : currentTrack?.mediaType === 'image'
                      ? 'Regardez bien...'
                      : currentTrack?.mediaType === 'text'
                        ? 'Lisez bien...'
                        : 'Écoutez bien...'}
                </h1>
                {currentTrack?.mediaType === 'image' && currentTrack?.visualHint && (
                  <p className="mt-5 text-2xl text-zinc-300">{currentTrack.visualHint}</p>
                )}
                {currentTrack?.mediaType === 'image' && currentTrack?.textContent && (
                  <p className="mt-4 text-3xl text-zinc-100 font-medium leading-relaxed">{currentTrack.textContent}</p>
                )}
                
                {gameState.trackStartTime && (
                  <Timer
                    gameState={gameState}
                    duration={trackDuration}
                    strictMode={Boolean(gameState.strictTimerEnabled)}
                  />
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
                    <h2 className={`text-3xl text-zinc-300 uppercase tracking-widest font-semibold mb-8 ${ledHeadlineClass}`}>La réponse était</h2>
                    {currentTrack?.answerImageUrl && (
                      <div className="mb-8 rounded-2xl overflow-hidden shadow-2xl border-4 border-emerald-500/30">
                        <img
                          src={currentTrack.answerImageUrl}
                          alt="Illustration de la réponse"
                          className="w-full h-auto max-h-[44vh] object-contain bg-black/40"
                        />
                      </div>
                    )}
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
                      
                      const medalGlow = isFirst ? 'shadow-[0_0_40px_rgba(250,204,21,0.35)]' : isSecond ? 'shadow-[0_0_35px_rgba(212,212,216,0.28)]' : 'shadow-[0_0_30px_rgba(217,119,6,0.28)]';
                      return (
                        <motion.div 
                          key={player.id}
                          initial={{ height: 0, y: 30, opacity: 0 }}
                          animate={{ height: '100%', y: 0, opacity: 1 }}
                          transition={{ delay, duration: 0.6, ease: 'easeOut' }}
                          className={`relative w-48 flex flex-col justify-end ${height}`}
                        >
                          <div className="absolute -top-24 left-0 right-0 text-center">
                            <motion.div
                              initial={{ scale: 0.8 }}
                              animate={{ scale: [0.92, 1.04, 1] }}
                              transition={{ delay: delay + 0.25, duration: 0.6 }}
                              className={`w-12 h-12 mx-auto rounded-full mb-2 ${medalGlow}`}
                              style={{ backgroundColor: player.color }}
                            />
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
