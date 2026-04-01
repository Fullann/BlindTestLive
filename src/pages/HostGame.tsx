import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, Player, Track } from '../types';
import { Play, Pause, SkipForward, Check, X, Users, Music, Trophy, Youtube, MonitorUp, Copy, Unlock, UserMinus, Flag, ArrowLeft, ExternalLink, Download } from 'lucide-react';
import clsx from 'clsx';
import YouTube from 'react-youtube';

const Timer = ({ gameState, duration, onTimeUp }: { gameState: GameState, duration: number, onTimeUp?: () => void }) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [progress, setProgress] = useState(100);
  const hasCalledTimeUp = useRef(false);

  useEffect(() => {
    if (gameState.status !== 'playing') {
      hasCalledTimeUp.current = false;
    }
  }, [gameState.status]);

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

      if (remaining <= 0 && gameState.status === 'playing' && !hasCalledTimeUp.current) {
        hasCalledTimeUp.current = true;
        onTimeUp?.();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [gameState.trackStartTime, gameState.status, gameState.buzzTimestamp, duration, onTimeUp]);

  return (
    <div className="mt-6 w-full">
      <div className="flex justify-between text-zinc-400 mb-2 font-mono text-sm">
        <span>00:00</span>
        <span className={timeLeft <= 5 ? 'text-red-500 font-bold animate-pulse' : ''}>
          00:{timeLeft.toString().padStart(2, '0')}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-100 ${timeLeft <= 5 ? 'bg-red-500' : 'bg-indigo-500'}`}
          style={{ width: `${progress}%` }}
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

export default function HostGame() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  const [spotifyPlayer, setSpotifyPlayer] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [playerToKick, setPlayerToKick] = useState<string | null>(null);
  const [hostRole, setHostRole] = useState<'owner' | 'cohost'>('owner');
  const [cohostToken, setCohostToken] = useState<string | null>(null);
  const [copiedCohostToken, setCopiedCohostToken] = useState(false);
  const [cohostError, setCohostError] = useState('');
  const loadedSpotifyUri = useRef<string | null>(null);
  const hostToken = gameId ? localStorage.getItem(`blindtest_host_${gameId}`) : null;

  useEffect(() => {
    if (!gameId) return;

    if (!hostToken) {
      alert("Vous n'êtes pas autorisé à administrer cette partie.");
      navigate('/');
      return;
    }

    const joinAsHost = () => socket.emit('host:joinGame', { gameId, hostToken }, (response: any) => {
      if (!response.success) {
        alert(response.error || "Erreur de connexion");
        navigate('/');
        return;
      }
      setHostRole(response.role === 'cohost' ? 'cohost' : 'owner');
      socket.emit('game:requestState', { gameId, hostToken }, () => {});
    });
    joinAsHost();
    socket.on('connect', joinAsHost);

    const handleStateUpdate = (state: GameState) => {
      setGameState(state);
    };

    const handleSound = (type: 'buzz' | 'correct' | 'wrong') => {
      playSound(type);
    };

    socket.on('game:stateUpdate', handleStateUpdate);
    socket.on('game:playSound', handleSound);

    return () => {
      socket.off('game:stateUpdate', handleStateUpdate);
      socket.off('game:playSound', handleSound);
      socket.off('connect', joinAsHost);
    };
  }, [gameId, navigate, hostToken]);

  useEffect(() => {
    if (ytPlayer) {
      if (gameState?.status === 'paused' || gameState?.status === 'countdown' || gameState?.status === 'revealed' || gameState?.status === 'lobby') {
        ytPlayer.pauseVideo();
      } else if (gameState?.status === 'playing') {
        ytPlayer.playVideo();
      }
    }
  }, [gameState?.status, ytPlayer]);

  useEffect(() => {
    if (gameState?.isSpotifyMode && !spotifyPlayer) {
      const script = document.createElement("script");
      script.src = "https://open.spotify.com/embed/iframe-api/v1";
      script.async = true;
      document.body.appendChild(script);

      (window as any).onSpotifyIframeApiReady = (IFrameAPI: any) => {
        const element = document.getElementById('spotify-iframe');
        if (!element) return;
        
        const track = gameState?.playlist?.[gameState?.currentTrackIndex || 0];
        const isCurrentTrackSpotify = track?.mediaType === 'spotify' || track?.url?.startsWith('spotify:');
        const initialUri = isCurrentTrackSpotify ? (track?.mediaUrl || track?.url) : 'spotify:track:4cOdK2wGLETKBW3PvgPWqT';
        loadedSpotifyUri.current = initialUri;
        
        const options = {
          uri: initialUri,
          width: '100%',
          height: '152'
        };
        const callback = (EmbedController: any) => {
          setSpotifyPlayer(EmbedController);
        };
        IFrameAPI.createController(element, options, callback);
      };
    }
  }, [gameState?.isSpotifyMode, spotifyPlayer, gameState?.playlist, gameState?.currentTrackIndex]);

  useEffect(() => {
    if (spotifyPlayer && gameState?.isSpotifyMode) {
      const track = gameState.playlist[gameState.currentTrackIndex];
      const isCurrentTrackSpotify = track?.mediaType === 'spotify' || track?.url?.startsWith('spotify:');
      const uriToLoad = isCurrentTrackSpotify ? (track.mediaUrl || track.url) : null;
      
      if (uriToLoad && loadedSpotifyUri.current !== uriToLoad) {
        spotifyPlayer.loadUri(uriToLoad);
        loadedSpotifyUri.current = uriToLoad;
      }
    }
  }, [gameState?.currentTrackIndex, spotifyPlayer, gameState?.isSpotifyMode, gameState?.playlist]);

  useEffect(() => {
    if (spotifyPlayer) {
      const track = gameState?.playlist?.[gameState?.currentTrackIndex || 0];
      const isCurrentTrackSpotify = track?.mediaType === 'spotify' || track?.url?.startsWith('spotify:');
      
      if (gameState?.status === 'paused' || gameState?.status === 'countdown' || gameState?.status === 'revealed' || gameState?.status === 'lobby' || !isCurrentTrackSpotify) {
        spotifyPlayer.pause();
      } else if (gameState?.status === 'playing' && isCurrentTrackSpotify) {
        if (track?.startTime && gameState?.trackStartTime && Date.now() - gameState.trackStartTime < 1000) {
          // If just started playing, seek to start time
          spotifyPlayer.seek(track.startTime);
        }
        spotifyPlayer.play();
      }
    }
  }, [gameState?.status, gameState?.currentTrackIndex, gameState?.playlist, spotifyPlayer, gameState?.trackStartTime]);

  if (!gameState) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement...</div>;
  }

  const isYoutubeMode = !!gameState.youtubeVideoId;
  const isSpotifyMode = !!gameState.isSpotifyMode;
  const currentTrack = !isYoutubeMode ? gameState.playlist[gameState.currentTrackIndex] : null;
  const buzzedPlayer = gameState.buzzedPlayerId ? gameState.players[gameState.buzzedPlayerId] : null;

  const handleStartTrack = () => {
    if (isYoutubeMode) {
      socket.emit('host:resumeYoutube', { gameId, hostToken }, () => {});
    } else {
      socket.emit('host:startTrack', { gameId, hostToken }, () => {});
    }
  };

  const handleAwardPoints = (playerId: string) => {
    let points = 1;
    if (gameState?.trackStartTime && gameState?.buzzTimestamp) {
      const timeTaken = gameState.buzzTimestamp - gameState.trackStartTime;
      if (timeTaken < 5000) {
        points = 3;
      } else if (timeTaken < 10000) {
        points = 2;
      }
    }
    socket.emit('host:awardPoints', { gameId, playerId, points, hostToken }, () => {});
  };

  const handlePenalize = (playerId: string) => {
    socket.emit('host:penalize', { gameId, playerId, hostToken }, () => {});
  };

  const handleUnlockPlayer = (playerId: string) => {
    socket.emit('host:unlockPlayer', { gameId, playerId, hostToken }, () => {});
  };

  const handleEndGame = () => {
    socket.emit('host:endGame', { gameId, hostToken }, () => {});
    setShowEndConfirm(false);
  };

  const handleKickPlayer = (playerId: string) => {
    socket.emit('host:kickPlayer', { gameId, playerId, hostToken }, () => {});
    setPlayerToKick(null);
  };

  const handleRevealAnswer = () => {
    socket.emit('host:revealAnswer', { gameId, hostToken }, () => {});
  };

  const handleNextTrack = () => {
    socket.emit('host:nextTrack', { gameId, hostToken }, () => {});
  };

  const handleResumeYoutube = () => {
    socket.emit('host:resumeYoutube', { gameId, hostToken }, () => {});
  };

  const onYoutubeReady = (event: any) => {
    setYtPlayer(event.target);
  };

  const onYoutubeStateChange = (event: any) => {
    // If the host manually plays the video, we could sync it to the players
    // For now, we just rely on the host clicking the UI buttons to change state
  };

  const copyPublicScreenUrl = () => {
    const url = `${window.location.origin}/screen/${gameState.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCreateCohostToken = () => {
    if (!gameId || !hostToken) return;
    setCohostError('');
    socket.emit('host:createCohostToken', { gameId, hostToken }, (res: any) => {
      if (!res?.success || !res?.cohostToken) {
        setCohostError(res?.error || "Impossible de générer un token co-animateur.");
        return;
      }
      setCohostToken(String(res.cohostToken));
    });
  };

  const handleCopyCohostToken = () => {
    if (!cohostToken) return;
    navigator.clipboard.writeText(cohostToken).then(() => {
      setCopiedCohostToken(true);
      setTimeout(() => setCopiedCohostToken(false), 2000);
    });
  };

  const handleExportScores = () => {
    if (!gameState) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    
    if (gameState.isTeamMode) {
      csvContent += "Équipe,Score\n";
      const teamScores = (Object.values(gameState.players) as Player[]).reduce((acc, player) => {
        if (player.team) {
          acc[player.team] = (acc[player.team] || 0) + player.score;
        }
        return acc;
      }, {} as Record<string, number>);
      
      Object.entries(teamScores)
        .sort(([, a], [, b]) => b - a)
        .forEach(([team, score]) => {
          csvContent += `${team},${score}\n`;
        });
    } else {
      csvContent += "Joueur,Score\n";
      (Object.values(gameState.players) as Player[])
        .sort((a, b) => b.score - a.score)
        .forEach(player => {
          csvContent += `${player.name},${player.score}\n`;
        });
    }
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `scores_${gameState.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTeamName = (teamId: string) => {
    const names: Record<string, string> = { red: 'Rouge', blue: 'Bleue', green: 'Verte', yellow: 'Jaune' };
    return names[teamId] || teamId;
  };

  const getTeamColor = (teamId: string) => {
    const colors: Record<string, string> = { red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308' };
    return colors[teamId] || '#ffffff';
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Game Controls */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between bg-zinc-900 p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin')}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white p-3 rounded-xl transition-colors"
                title="Retour au tableau de bord"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight flex items-center gap-4">
                  Partie en cours
                  {isSpotifyMode && (
                    <a 
                      href="https://open.spotify.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 px-3 py-1.5 rounded-full font-medium transition-colors flex items-center gap-1.5"
                      title="Connectez-vous à Spotify pour jouer les morceaux en entier"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Se connecter à Spotify
                    </a>
                  )}
                </h1>
                <p className="text-zinc-400 mt-1 flex items-center gap-2">
                  Code: <span className="font-mono text-indigo-400 text-xl font-bold">{gameState.id}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              {gameState.status !== 'finished' && hostRole === 'owner' && (
                <div className="relative">
                  {showEndConfirm ? (
                    <div className="absolute top-full right-0 mt-2 bg-zinc-800 p-4 rounded-xl border border-white/10 shadow-xl z-50 w-64">
                      <p className="text-sm mb-3">Terminer la partie et afficher le podium ?</p>
                      <div className="flex gap-2">
                        <button onClick={handleEndGame} className="flex-1 bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-medium">Oui</button>
                        <button onClick={() => setShowEndConfirm(false)} className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 rounded-lg text-sm font-medium">Non</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowEndConfirm(true)}
                      className="bg-red-600/20 hover:bg-red-600/30 text-red-400 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium border border-red-500/20"
                    >
                      <Flag className="w-4 h-4" />
                      Terminer
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                {gameState.status === 'finished' && (
                  <button
                    onClick={handleExportScores}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
                    title="Exporter les scores (CSV)"
                  >
                    <Download className="w-4 h-4" />
                    Exporter
                  </button>
                )}
                <a
                  href={`/screen/${gameState.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
                >
                  <MonitorUp className="w-4 h-4" />
                  Ouvrir l'écran public
                </a>
                <button
                  onClick={copyPublicScreenUrl}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white p-2 rounded-lg transition-colors"
                  title="Copier le lien"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Rôle</p>
                <p className="font-medium text-zinc-300 mb-1">{hostRole === 'owner' ? 'Owner' : 'Co-host'}</p>
                <p className="text-sm text-zinc-500 uppercase tracking-wider font-semibold">Statut</p>
                <p className={clsx(
                  "font-medium",
                  gameState.status === 'lobby' && "text-yellow-400",
                  gameState.status === 'countdown' && "text-indigo-400",
                  gameState.status === 'playing' && "text-emerald-400",
                  gameState.status === 'paused' && "text-red-400",
                  gameState.status === 'revealed' && "text-blue-400",
                  gameState.status === 'finished' && "text-purple-400"
                )}>
                  {gameState.status === 'lobby' && 'En attente'}
                  {gameState.status === 'countdown' && `Décompte... ${gameState.countdown}`}
                  {gameState.status === 'playing' && 'Musique en cours'}
                  {gameState.status === 'paused' && 'Buzz !'}
                  {gameState.status === 'revealed' && 'Réponse révélée'}
                  {gameState.status === 'finished' && 'Terminé'}
                </p>
              </div>
            </div>
          </div>

          {hostRole === 'owner' && (
            <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Accès co-animateur</h2>
                  <p className="text-zinc-400 text-sm mt-1">Générez un token pour déléguer le contrôle de manche (sans kick/fin).</p>
                </div>
                <button
                  onClick={handleCreateCohostToken}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                >
                  Générer un token
                </button>
              </div>
              {cohostError && <p className="text-red-400 text-sm mt-3">{cohostError}</p>}
              {cohostToken && (
                <div className="mt-4 bg-zinc-950 border border-white/10 rounded-xl p-3 flex items-center gap-2">
                  <code className="flex-1 text-xs md:text-sm text-indigo-300 break-all">{cohostToken}</code>
                  <button
                    onClick={handleCopyCohostToken}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white p-2 rounded-lg transition-colors"
                    title="Copier le token"
                  >
                    {copiedCohostToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Current Track Info */}
          <div className="bg-zinc-900 p-8 rounded-2xl border border-white/5 relative overflow-hidden">
            {isSpotifyMode && (
              <div className="absolute w-[1px] h-[1px] opacity-0 overflow-hidden pointer-events-none">
                <div id="spotify-iframe"></div>
              </div>
            )}
            {!isYoutubeMode && (
              <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-500"
                  style={{ width: `${((gameState.currentTrackIndex) / gameState.playlist.length) * 100}%` }}
                />
              </div>
            )}
            
            <div className="flex items-start justify-between mb-8">
              <div className="w-full">
                {isYoutubeMode ? (
                  <>
                    <p className="text-sm text-zinc-500 uppercase tracking-wider font-semibold mb-4">
                      Manche {gameState.roundNumber || 1}
                    </p>
                    <div className="w-full aspect-video rounded-xl overflow-hidden bg-black mb-4">
                      <YouTube 
                        videoId={gameState.youtubeVideoId} 
                        opts={{ width: '100%', height: '100%', playerVars: { autoplay: 0, controls: 1 } }} 
                        onReady={onYoutubeReady}
                        onStateChange={onYoutubeStateChange}
                        className="w-full h-full"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-zinc-500 uppercase tracking-wider font-semibold mb-2">
                      Piste {gameState.currentTrackIndex + 1} / {gameState.playlist.length}
                    </p>
                    {gameState.status === 'revealed' || gameState.status === 'finished' ? (
                      <>
                        <h2 className="text-4xl font-bold mb-2">{currentTrack?.title}</h2>
                        <p className="text-2xl text-zinc-400">{currentTrack?.artist}</p>
                      </>
                    ) : (
                      <div className="flex items-center gap-4 text-zinc-600">
                        <Music className="w-12 h-12" />
                        <h2 className="text-3xl font-bold italic">Titre masqué</h2>
                      </div>
                    )}
                    {(gameState.status === 'playing' || gameState.status === 'paused') && gameState.trackStartTime && currentTrack?.duration && (
                      <Timer gameState={gameState} duration={currentTrack.duration} onTimeUp={handleRevealAnswer} />
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              {gameState.status === 'lobby' || gameState.status === 'revealed' ? (
                <button
                  onClick={handleStartTrack}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl flex items-center justify-center gap-3 font-semibold text-lg transition-colors"
                >
                  <Play className="w-6 h-6" />
                  {isYoutubeMode ? (gameState.status === 'lobby' ? 'Démarrer la vidéo' : 'Reprendre la vidéo') : 'Lancer la musique'}
                </button>
              ) : gameState.status === 'countdown' ? (
                <button
                  disabled
                  className="flex-1 bg-indigo-600/50 text-white py-4 rounded-xl flex items-center justify-center gap-3 font-semibold text-lg cursor-not-allowed"
                >
                  Préparation...
                </button>
              ) : gameState.status === 'playing' ? (
                <button
                  onClick={isYoutubeMode ? handleResumeYoutube : handleRevealAnswer}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl flex items-center justify-center gap-3 font-semibold text-lg transition-colors"
                >
                  {isYoutubeMode ? <Pause className="w-6 h-6" /> : <Check className="w-6 h-6" />}
                  {isYoutubeMode ? 'Mettre en pause' : 'Révéler la réponse'}
                </button>
              ) : gameState.status === 'paused' && buzzedPlayer ? (
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <button
                    onClick={() => handleAwardPoints(buzzedPlayer.id)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl flex items-center justify-center gap-3 font-semibold text-lg transition-colors"
                  >
                    <Check className="w-6 h-6" />
                    Bonne réponse (Bonus)
                  </button>
                  <button
                    onClick={() => handlePenalize(buzzedPlayer.id)}
                    className="bg-red-600 hover:bg-red-500 text-white py-4 rounded-xl flex items-center justify-center gap-3 font-semibold text-lg transition-colors"
                  >
                    <X className="w-6 h-6" />
                    Mauvaise réponse
                  </button>
                </div>
              ) : null}

              {!isYoutubeMode && (
                <button
                  onClick={handleNextTrack}
                  disabled={gameState.currentTrackIndex >= gameState.playlist.length - 1}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-4 rounded-xl flex items-center justify-center transition-colors"
                >
                  <SkipForward className="w-6 h-6" />
                </button>
              )}
            </div>
          </div>

          {/* Buzzed Player Alert */}
          {gameState.status === 'paused' && buzzedPlayer && (
            <div 
              className="p-8 rounded-2xl border-2 animate-pulse flex items-center justify-between"
              style={{ borderColor: buzzedPlayer.color, backgroundColor: `${buzzedPlayer.color}20` }}
            >
              <div>
                <p className="text-sm uppercase tracking-wider font-bold" style={{ color: buzzedPlayer.color }}>A buzzé !</p>
                <h3 className="text-4xl font-bold mt-1">{buzzedPlayer.name}</h3>
              </div>
              <div 
                className="w-16 h-16 rounded-full"
                style={{ backgroundColor: buzzedPlayer.color }}
              />
            </div>
          )}
        </div>

        {/* Right Column: Players */}
        <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5 h-fit">
          <h2 className="text-xl font-semibold flex items-center gap-2 mb-6">
            <Users className="w-5 h-5 text-indigo-400" />
            Joueurs ({Object.keys(gameState.players).length})
          </h2>
          
          {gameState.isTeamMode && (
            <div className="mb-6 space-y-2">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Scores par équipe</h3>
              {Object.entries(
                (Object.values(gameState.players) as Player[]).reduce((acc, player) => {
                  if (player.team) {
                    acc[player.team] = (acc[player.team] || 0) + player.score;
                  }
                  return acc;
                }, {} as Record<string, number>)
              )
                .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
                .map(([teamId, score]) => (
                  <div key={teamId} className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getTeamColor(teamId) }} />
                      <span className="font-medium">Équipe {getTeamName(teamId)}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xl font-bold">
                      {score}
                      <Trophy className="w-4 h-4 text-yellow-500" />
                    </div>
                  </div>
                ))}
            </div>
          )}

          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Détail des joueurs</h3>
          <div className="space-y-3">
            {(Object.values(gameState.players) as Player[])
              .sort((a, b) => b.score - a.score)
              .map((player) => (
              <div 
                key={player.id} 
                className={clsx(
                  "p-4 rounded-xl flex items-center justify-between border transition-all",
                  player.lockedOut ? "border-red-500/50 bg-red-500/10 opacity-50" : "border-white/5 bg-zinc-950"
                )}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: gameState.isTeamMode && player.team ? getTeamColor(player.team) : player.color }}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium text-lg">{player.name}</span>
                    {gameState.isTeamMode && player.team && (
                      <span className="text-xs text-zinc-500">Équipe {getTeamName(player.team)}</span>
                    )}
                  </div>
                  {player.lockedOut && (
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-xs text-red-400 font-bold uppercase">Bloqué</span>
                      <button
                        onClick={() => handleUnlockPlayer(player.id)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white p-1.5 rounded-md transition-colors"
                        title="Débloquer ce joueur"
                      >
                        <Unlock className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-xl font-bold">
                  {player.score}
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  
                  {hostRole === 'owner' && (
                    <div className="relative ml-2">
                      {playerToKick === player.id ? (
                        <div className="absolute right-0 top-full mt-2 bg-zinc-800 p-3 rounded-xl border border-white/10 shadow-xl z-50 w-48">
                          <p className="text-xs mb-2 text-center font-sans font-normal">Exclure {player.name} ?</p>
                          <div className="flex gap-2 font-sans">
                            <button onClick={() => handleKickPlayer(player.id)} className="flex-1 bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded-md text-xs font-medium">Oui</button>
                            <button onClick={() => setPlayerToKick(null)} className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded-md text-xs font-medium">Non</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setPlayerToKick(player.id)}
                          className="text-zinc-500 hover:text-red-400 p-1.5 rounded-md transition-colors"
                          title="Exclure ce joueur"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {Object.keys(gameState.players).length === 0 && (
              <p className="text-zinc-500 text-center py-8">En attente de joueurs...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
