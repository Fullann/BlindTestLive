import { useState, useEffect, useRef, DragEvent, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, Player, Track } from '../types';
import { Play, Pause, SkipForward, Check, X, Users, Music, Trophy, MonitorUp, Copy, Unlock, UserMinus, Flag, ArrowLeft, Download, ArrowUp, ArrowDown, FileText, Cpu, Plus, Trash2, Mic, MicOff, Volume2, Shuffle } from 'lucide-react';
import clsx from 'clsx';
import YouTube from 'react-youtube';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const extractYoutubeId = (url: string) => {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : url;
};

const Timer = ({ gameState, duration, strictMode, onTimeUp }: { gameState: GameState; duration?: number; strictMode: boolean; onTimeUp?: () => void }) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [remainingSec, setRemainingSec] = useState(duration || 0);
  const hasCalledTimeUp = useRef(false);

  useEffect(() => {
    if (gameState.status !== 'playing') {
      hasCalledTimeUp.current = false;
    }
  }, [gameState.status]);

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
        const nextRemaining = Math.max(0, duration - elapsed);
        setRemainingSec(nextRemaining);
        if (nextRemaining <= 0 && gameState.status === 'playing' && !hasCalledTimeUp.current) {
          hasCalledTimeUp.current = true;
          onTimeUp?.();
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, [gameState.trackStartTime, gameState.status, gameState.buzzTimestamp, strictMode, duration, onTimeUp]);

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');
  const rm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const rs = String(remainingSec % 60).padStart(2, '0');

  const pct = strictMode && duration ? Math.min(100, (remainingSec / duration) * 100) : Math.min(100, (elapsedSec % 60) * (100 / 60));
  const isUrgent = strictMode && remainingSec <= 5 && remainingSec > 0;

  return (
    <div className="mt-5 w-full">
      {strictMode && typeof duration === 'number' && duration > 0 ? (
        <>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-zinc-500 font-mono">Temps restant</span>
            <motion.span
              key={remainingSec}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.12 }}
              className={clsx(
                'font-mono font-black text-sm tabular-nums',
                isUrgent ? 'text-red-400' : remainingSec <= 10 ? 'text-amber-400' : 'text-zinc-200',
              )}
            >
              {rm}:{rs}
            </motion.span>
          </div>
          <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              className={clsx(
                'h-full rounded-full transition-colors duration-300',
                isUrgent ? 'bg-gradient-to-r from-red-500 to-red-400' :
                remainingSec <= 10 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                'bg-gradient-to-r from-indigo-500 to-indigo-400',
              )}
              style={{ width: `${pct}%` }}
              animate={isUrgent ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
              transition={isUrgent ? { duration: 0.6, repeat: Infinity } : { duration: 0.1 }}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-zinc-500 font-mono">Temps écoulé</span>
            <span className="text-emerald-400 font-mono font-bold text-sm tabular-nums">
              {mm}:{ss}
            </span>
          </div>
          <div className="h-2.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-100"
              style={{ width: `${pct}%` }}
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

export default function HostGame() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { success: toastSuccess, error: toastError, warning: toastWarning, info: toastInfo } = useToast();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [ytPlayer, setYtPlayer] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [playerToKick, setPlayerToKick] = useState<string | null>(null);
  const [hostRole, setHostRole] = useState<'owner' | 'cohost'>('owner');
  const [cohostToken, setCohostToken] = useState<string | null>(null);
  const [copiedCohostToken, setCopiedCohostToken] = useState(false);
  const [cohostError, setCohostError] = useState('');
  const [eventLogs, setEventLogs] = useState<Array<{ ts: number; type: string; message: string }>>([]);
  const [hostsPresence, setHostsPresence] = useState<Array<{ socketId: string; role: 'owner' | 'cohost'; connectedAt: number }>>([]);
  const [mySocketId, setMySocketId] = useState<string | null>(null);
  const [availablePlaylists, setAvailablePlaylists] = useState<Array<{ id: string; name: string; tracks: Track[] }>>([]);
  const [selectedRoundPlaylistId, setSelectedRoundPlaylistId] = useState('');
  const [roundBusy, setRoundBusy] = useState(false);
  const [draggedTrackIndex, setDraggedTrackIndex] = useState<number | null>(null);
  const [dragOverTrackIndex, setDragOverTrackIndex] = useState<number | null>(null);
  const [deviceDraftByPlayer, setDeviceDraftByPlayer] = useState<Record<string, string>>({});
  const [teamDraftName, setTeamDraftName] = useState('');
  const [teamDraftColor, setTeamDraftColor] = useState('#a855f7');
  const [trackDraftById, setTrackDraftById] = useState<Record<string, { title: string; artist: string; duration: string }>>({});
  const [newTrackDraft, setNewTrackDraft] = useState<{ title: string; artist: string; duration: string }>({
    title: '',
    artist: '',
    duration: '20',
  });
  const [duelPlayerAId, setDuelPlayerAId] = useState('');
  const [duelPlayerBId, setDuelPlayerBId] = useState('');
  const [duelRewardPoints, setDuelRewardPoints] = useState('2');
  // WebRTC mic
  const [micActivePlayerId, setMicActivePlayerId] = useState<string | null>(null);
  const [micVolume, setMicVolume] = useState(0);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hostTrackAudioRef = useRef<HTMLAudioElement | null>(null);
  const hostAudioFadeRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const [hostAudioEnabled, setHostAudioEnabled] = useState(true);
  const [hostAudioVolume, setHostAudioVolume] = useState(0.9);
  const [hostPrelisten, setHostPrelisten] = useState(false);
  const [draftMode, setDraftMode] = useState(false);
  const [draftUpcomingTracks, setDraftUpcomingTracks] = useState<
    Array<{ title: string; artist: string; duration: string; mediaType: string; mediaUrl: string; textContent: string; startTime: string; url: string }>
  >([]);
  const hostTokenFromUrl = searchParams.get('cohost');
  const isSafeMode = searchParams.get('safe') === '1';
  const hostToken = gameId
    ? hostTokenFromUrl ||
      sessionStorage.getItem(`blindtest_host_${gameId}`) ||
      localStorage.getItem(`blindtest_host_${gameId}`)
    : null;

  const closeMicPeer = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    peerRef.current?.close();
    peerRef.current = null;
    analyserRef.current = null;
    setMicActivePlayerId(null);
    setMicVolume(0);
  }, []);

  useEffect(() => {
    if (!gameId) return;

    if (!hostToken) {
      toastError("Vous n'êtes pas autorisé à administrer cette partie.");
      navigate('/');
      return;
    }
    // Si un token cohost est passé dans l'URL, on le persiste pour les prochains refresh.
    if (hostTokenFromUrl) {
      sessionStorage.setItem(`blindtest_host_${gameId}`, hostTokenFromUrl);
    }

    const joinAsHost = () => socket.emit('host:joinGame', { gameId, hostToken }, (response: any) => {
      if (!response.success) {
        toastError(response.error || "Erreur de connexion");
        navigate('/');
        return;
      }
      setHostRole(response.role === 'cohost' ? 'cohost' : 'owner');
      setMySocketId(socket.id || null);
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
    const handleEventLogs = (logs: Array<{ ts: number; type: string; message: string }>) => {
      setEventLogs(logs || []);
    };
    const handleHostsPresence = (hosts: Array<{ socketId: string; role: 'owner' | 'cohost'; connectedAt: number }>) => {
      const list = Array.isArray(hosts) ? hosts : [];
      // Owner en premier, puis cohosts, puis ancienneté de connexion.
      list.sort((a, b) => {
        if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
        return a.connectedAt - b.connectedAt;
      });
      setHostsPresence(list);
    };

    socket.on('game:stateUpdate', handleStateUpdate);
    socket.on('game:playSound', handleSound);
    socket.on('game:eventLogs', handleEventLogs);
    socket.on('game:hostsPresence', handleHostsPresence);

    // WebRTC: player sends offer → host creates answer
    const handleMicOffer = async ({ playerId, sdp }: { playerId: string; sdp: RTCSessionDescriptionInit }) => {
      try {
        closeMicPeer();
        const pc = new RTCPeerConnection(RTC_CONFIG);
        peerRef.current = pc;
        setMicActivePlayerId(playerId);

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('host:micIceCandidate', { gameId, hostToken, playerId, candidate: e.candidate }, () => {});
          }
        };

        pc.ontrack = (e) => {
          const stream = e.streams[0] ?? (e.track ? new MediaStream([e.track]) : null);
          if (!stream) return;
          // Play audio — pour un MediaStream live, on appelle play() directement
          // sans attendre readyState ou onloadedmetadata (peu fiable sur certains navigateurs)
          if (audioRef.current) {
            audioRef.current.srcObject = stream;
            audioRef.current.muted = false;
            audioRef.current.volume = 1;
            audioRef.current.play().catch(() => {
              toastError("Audio micro bloqué par le navigateur. Clique n'importe où puis réessaie.");
            });
          }
          // Volume analyser
          try {
            const ac = new AudioContext();
            const src = ac.createMediaStreamSource(stream);
            const analyser = ac.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            analyserRef.current = analyser;
            const buf = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
              analyser.getByteFrequencyData(buf);
              const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
              setMicVolume(Math.round((avg / 128) * 100));
              animFrameRef.current = requestAnimationFrame(tick);
            };
            animFrameRef.current = requestAnimationFrame(tick);
          } catch { /* analyser optional */ }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('host:micAnswer', { gameId, hostToken, playerId, sdp: pc.localDescription }, () => {});
      } catch (err) {
        console.error('WebRTC host error:', err);
      }
    };

    const handleMicIceCandidate = ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      peerRef.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    };

    const handleMicStopped = () => {
      closeMicPeer();
    };

    socket.on('player:micOffer', handleMicOffer);
    socket.on('player:micIceCandidate', handleMicIceCandidate);
    socket.on('player:micStopped', handleMicStopped);

    return () => {
      socket.off('game:stateUpdate', handleStateUpdate);
      socket.off('game:playSound', handleSound);
      socket.off('game:eventLogs', handleEventLogs);
      socket.off('game:hostsPresence', handleHostsPresence);
      socket.off('connect', joinAsHost);
      socket.off('player:micOffer', handleMicOffer);
      socket.off('player:micIceCandidate', handleMicIceCandidate);
      socket.off('player:micStopped', handleMicStopped);
    };
  }, [gameId, navigate, hostToken, hostTokenFromUrl, closeMicPeer]);

  useEffect(() => {
    let active = true;
    const loadPlaylists = async () => {
      try {
        const response = await api.playlists.list();
        if (!active) return;
        const rows = (response.playlists || []) as any[];
        const mapped = rows.map((row) => ({
          id: row.id as string,
          name: row.name as string,
          tracks: Array.isArray(row.tracks) ? row.tracks as Track[] : (typeof row.tracks === 'string' ? JSON.parse(row.tracks) : []),
        })).filter((playlist) => Array.isArray(playlist.tracks) && playlist.tracks.length > 0);
        setAvailablePlaylists(mapped);
      } catch {
        // ignore
      }
    };
    void loadPlaylists();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (ytPlayer) {
      try {
        const iframe = typeof ytPlayer.getIframe === 'function' ? ytPlayer.getIframe() : null;
        if (!iframe || !iframe.src) return;
        if (gameState?.status === 'paused' || gameState?.status === 'countdown' || gameState?.status === 'revealed' || gameState?.status === 'lobby') {
          if (typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
        } else if (gameState?.status === 'playing') {
          if (typeof ytPlayer.playVideo === 'function') ytPlayer.playVideo();
        }
      } catch (error) {
        console.warn('YouTube player non prêt, contrôle ignoré:', error);
      }
    }
  }, [gameState?.status, ytPlayer]);

  const handleRequestPlayerMic = (playerId: string) => {
    socket.emit('host:requestPlayerMic', { gameId, hostToken, playerId }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Impossible d\'activer le micro');
    });
  };

  const handleStopPlayerMic = (playerId: string) => {
    socket.emit('host:stopPlayerMic', { gameId, hostToken, playerId }, () => {});
    closeMicPeer();
  };

  const isYoutubeMode = !!gameState?.youtubeVideoId;
  const hasQuizStarted = gameState?.status !== 'lobby';
  const currentTrack = (!isYoutubeMode && gameState)
    ? gameState.playlist[gameState.currentTrackIndex]
    : null;
  const isYoutubeTrack = !!currentTrack && currentTrack.mediaType === 'youtube' && !!currentTrack.mediaUrl;
  const canHostPlayTrackAudio =
    !!currentTrack?.mediaUrl &&
    (
      !currentTrack?.mediaType ||
      currentTrack.mediaType === 'audio' ||
      currentTrack.mediaType === 'voice' ||
      currentTrack.mediaType === 'video' ||
      currentTrack.mediaType === 'url'
    );
  const buzzedPlayer = gameState?.buzzedPlayerId ? gameState.players[gameState.buzzedPlayerId] : null;
  const normalizedTrackGain = currentTrack?.mediaType === 'video' ? 0.85 : 1;

  const fadeHostAudioTo = useCallback((target: number, durationMs = 220) => {
    const media = hostTrackAudioRef.current;
    if (!media) return;
    if (hostAudioFadeRef.current) {
      window.clearInterval(hostAudioFadeRef.current);
      hostAudioFadeRef.current = null;
    }
    const start = media.volume;
    const delta = target - start;
    if (Math.abs(delta) < 0.01 || durationMs <= 0) {
      media.volume = Math.max(0, Math.min(1, target));
      return;
    }
    const steps = Math.max(1, Math.round(durationMs / 30));
    let currentStep = 0;
    hostAudioFadeRef.current = window.setInterval(() => {
      currentStep += 1;
      const next = start + (delta * currentStep) / steps;
      media.volume = Math.max(0, Math.min(1, next));
      if (currentStep >= steps && hostAudioFadeRef.current) {
        window.clearInterval(hostAudioFadeRef.current);
        hostAudioFadeRef.current = null;
      }
    }, 30);
  }, []);

  useEffect(() => {
    return () => {
      if (hostAudioFadeRef.current) {
        window.clearInterval(hostAudioFadeRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const media = hostTrackAudioRef.current;
    if (!media) return;
    if (!gameState) {
      media.pause();
      return;
    }
    const shouldPlay = canHostPlayTrackAudio && (gameState.status === 'playing' || hostPrelisten);
    if (!shouldPlay || !hostAudioEnabled) {
      fadeHostAudioTo(0);
      window.setTimeout(() => media.pause(), 230);
      return;
    }
    const nextSrc = currentTrack?.mediaUrl || '';
    if (!nextSrc) {
      media.pause();
      return;
    }
    if (media.src !== nextSrc) {
      media.src = nextSrc;
    }
    media.volume = Math.max(0, Math.min(1, hostAudioVolume * normalizedTrackGain));
    try {
      media.currentTime = Math.max(0, currentTrack?.startTime ?? 0);
    } catch {
      // Metadata may not be loaded yet.
    }
    media.play().then(() => {
      fadeHostAudioTo(Math.max(0, Math.min(1, hostAudioVolume * normalizedTrackGain)));
    }).catch(() => {});
  }, [
    canHostPlayTrackAudio,
    currentTrack?.id,
    currentTrack?.mediaUrl,
    currentTrack?.startTime,
    gameState?.status,
    hostAudioEnabled,
    hostAudioVolume,
    hostPrelisten,
    normalizedTrackGain,
    fadeHostAudioTo,
  ]);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center gap-5">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-10 h-10 rounded-full border-2 border-indigo-500/20 border-t-indigo-500"
        />
        <p className="text-zinc-500 text-sm tracking-wide">Connexion à la partie…</p>
      </div>
    );
  }

  const handleStartTrack = () => {
    if (isYoutubeMode) {
      socket.emit('host:resumeYoutube', { gameId, hostToken }, () => {});
    } else {
      socket.emit('host:startTrack', { gameId, hostToken }, () => {});
    }
  };

  const handleAwardPoints = (playerId: string) => {
    let points = 1;
    if (gameState?.enableBonuses && gameState?.trackStartTime && gameState?.buzzTimestamp) {
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
    if (!window.confirm('Exclure ce joueur de la partie ?')) return;
    socket.emit('host:kickPlayer', { gameId, playerId, hostToken }, () => {});
    setPlayerToKick(null);
  };

  const handleAssignPlayerTeam = (playerId: string, teamId: string) => {
    socket.emit('host:assignPlayerTeam', { gameId, hostToken, playerId, teamId }, (res: any) => {
      if (!res?.success) {
        toastError(res?.error || "Impossible de changer l'équipe.");
      }
    });
  };

  const handleAddTeam = () => {
    const name = teamDraftName.trim();
    if (!name) {
      toastWarning("Nom d'équipe requis.");
      return;
    }
    socket.emit('host:addTeam', { gameId, hostToken, name, color: teamDraftColor }, (res: any) => {
      if (!res?.success) {
        toastError(res?.error || "Impossible d'ajouter l'équipe.");
        return;
      }
      setTeamDraftName('');
      toastSuccess('Equipe ajoutée.');
    });
  };

  const handleRemoveTeam = (teamId: string) => {
    socket.emit('host:removeTeam', { gameId, hostToken, teamId }, (res: any) => {
      if (!res?.success) {
        toastError(res?.error || "Impossible de supprimer l'équipe.");
        return;
      }
      toastInfo('Equipe supprimée.');
    });
  };

  const handleAssignDevice = (playerId: string) => {
    const deviceId = (deviceDraftByPlayer[playerId] || '').trim();
    if (!deviceId) {
      toastWarning('Renseigne un deviceId ESP32.');
      return;
    }
    socket.emit('host:assignDevice', { gameId, hostToken, playerId, deviceId }, (res: any) => {
      if (!res?.success) toastError(res?.error || "Impossible d'assigner ce buzzer.");
      else toastSuccess('Buzzer assigné.');
    });
  };

  const handleToggleDeviceMute = (deviceId: string, nextMuted: boolean) => {
    socket.emit('host:setDeviceSpeaker', {
      gameId,
      hostToken,
      deviceId,
      speakerMuted: nextMuted,
    }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Impossible de changer le mute.');
    });
  };

  const handleToggleDeviceSpeakerEnabled = (deviceId: string, nextEnabled: boolean) => {
    socket.emit('host:setDeviceSpeaker', {
      gameId,
      hostToken,
      deviceId,
      speakerEnabled: nextEnabled,
    }, (res: any) => {
      if (!res?.success) toastError(res?.error || "Impossible de changer l'état du haut-parleur.");
    });
  };

  const handleTestDeviceSpeaker = (deviceId: string) => {
    socket.emit('host:testDeviceSpeaker', {
      gameId,
      hostToken,
      deviceId,
      pattern: 'short',
    }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Test audio impossible.');
    });
  };

  const handleRevealAnswer = () => {
    socket.emit('host:revealAnswer', { gameId, hostToken }, () => {});
  };

  const handleValidateTextAnswer = (answerId: string, playerId: string, isCorrect: boolean) => {
    socket.emit(
      'host:validateTextAnswer',
      { gameId, hostToken, answerId, playerId, isCorrect, points: 1 },
      (res: any) => {
        if (!res?.success) toastError(res?.error || 'Validation impossible');
      },
    );
  };

  const handleStartDuel = () => {
    if (!duelPlayerAId || !duelPlayerBId || duelPlayerAId === duelPlayerBId) {
      toastWarning('Sélectionne 2 joueurs différents.');
      return;
    }
    socket.emit(
      'host:startDuel',
      {
        gameId,
        hostToken,
        playerAId: duelPlayerAId,
        playerBId: duelPlayerBId,
        rewardPoints: Number(duelRewardPoints) || 2,
      },
      (res: any) => {
        if (!res?.success) toastError(res?.error || 'Impossible de lancer le duel');
      },
    );
  };

  const handleResolveDuel = (winnerId: string) => {
    socket.emit('host:resolveDuel', { gameId, hostToken, winnerId }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Impossible de clôturer le duel');
    });
  };

  const handleApplyEventPower = (power: 'x2' | 'freeze' | 'comeback', targetPlayerId: string) => {
    socket.emit('host:applyEventPower', { gameId, hostToken, power, targetPlayerId }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Power-up impossible');
    });
  };

  const handleSetRoundTextMode = (roundId: string, enabled: boolean) => {
    socket.emit('host:setRoundTextMode', { gameId, hostToken, roundId, enabled }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Impossible de modifier le mode question ouverte');
    });
  };

  const handleNextTrack = () => {
    socket.emit('host:nextTrack', { gameId, hostToken }, () => {});
  };

  const handleReorderTrack = (fromIndex: number, toIndex: number) => {
    socket.emit('host:reorderTrack', { gameId, hostToken, fromIndex, toIndex }, (response: any) => {
      if (!response?.success) {
        toastError(response?.error || "Impossible de réorganiser la file.");
      }
    });
  };

  const handleShuffleUpcomingTracks = () => {
    socket.emit('host:shuffleUpcomingTracks', { gameId, hostToken }, (response: any) => {
      if (!response?.success) {
        toastError(response?.error || "Impossible de mélanger les questions.");
        return;
      }
      toastSuccess(`${response?.shuffledCount || 0} question(s) mélangée(s).`);
    });
  };

  const initDraftMode = () => {
    const upcoming = gameState.playlist.slice(gameState.currentTrackIndex + 1).map((t) => ({
      title: t.title || '',
      artist: t.artist || '',
      duration: String(t.duration || gameState.defaultTrackDuration || 20),
      mediaType: t.mediaType || 'audio',
      mediaUrl: t.mediaUrl || '',
      textContent: t.textContent || '',
      startTime: t.startTime !== undefined ? String(t.startTime) : '',
      url: t.url || '',
    }));
    setDraftUpcomingTracks(upcoming);
    setDraftMode(true);
  };

  const cancelDraftMode = () => {
    setDraftMode(false);
    setDraftUpcomingTracks([]);
  };

  const updateDraftTrackField = (
    index: number,
    field: 'title' | 'artist' | 'duration' | 'mediaType' | 'mediaUrl' | 'textContent' | 'startTime' | 'url',
    value: string,
  ) => {
    setDraftUpcomingTracks((prev) => prev.map((track, i) => (i === index ? { ...track, [field]: value } : track)));
  };

  const addDraftTrack = () => {
    setDraftUpcomingTracks((prev) => [
      ...prev,
      {
        title: '',
        artist: '',
        duration: String(gameState.defaultTrackDuration || 20),
        mediaType: 'audio',
        mediaUrl: '',
        textContent: '',
        startTime: '',
        url: '',
      },
    ]);
  };

  const removeDraftTrack = (index: number) => {
    setDraftUpcomingTracks((prev) => prev.filter((_, i) => i !== index));
  };

  const publishDraftTracks = () => {
    if (draftUpcomingTracks.length === 0) {
      toastWarning('Il faut au moins une question à venir.');
      return;
    }
    const normalized = draftUpcomingTracks.map((track) => {
      const duration = Number(track.duration);
      const startTime = Number(track.startTime);
      return {
        title: track.title.trim() || 'Question sans titre',
        artist: track.artist.trim(),
        duration: Number.isFinite(duration) && duration > 0 ? duration : (gameState.defaultTrackDuration || 20),
        mediaType: track.mediaType.trim() || 'audio',
        mediaUrl: track.mediaUrl.trim() || undefined,
        textContent: track.textContent.trim() || undefined,
        startTime: Number.isFinite(startTime) && startTime >= 0 ? startTime : undefined,
        url: track.url.trim() || undefined,
      };
    });
    socket.emit('host:bulkUpdateUpcomingTracks', { gameId, hostToken, tracks: normalized }, (res: any) => {
      if (!res?.success) {
        toastError(res?.error || 'Impossible de publier le brouillon.');
        return;
      }
      toastSuccess('Brouillon publié en temps réel.');
      cancelDraftMode();
    });
  };

  const getTrackDraft = (track: Track) => {
    return (
      trackDraftById[track.id] || {
        title: track.title || '',
        artist: track.artist || '',
        duration: String(track.duration || gameState.defaultTrackDuration || 20),
      }
    );
  };

  const setTrackDraftField = (trackId: string, field: 'title' | 'artist' | 'duration', value: string) => {
    setTrackDraftById((prev) => {
      const current = prev[trackId] || { title: '', artist: '', duration: '20' };
      return { ...prev, [trackId]: { ...current, [field]: value } };
    });
  };

  const handleSaveTrack = (index: number, track: Track) => {
    const draft = getTrackDraft(track);
    const duration = Number(draft.duration);
    socket.emit(
      'host:updateTrack',
      {
        gameId,
        hostToken,
        index,
        track: {
          title: draft.title.trim() || track.title,
          artist: draft.artist.trim(),
          duration: Number.isFinite(duration) && duration > 0 ? duration : (track.duration || gameState.defaultTrackDuration || 20),
        },
      },
      (res: any) => {
        if (!res?.success) {
          toastError(res?.error || 'Impossible de modifier la question.');
          return;
        }
        toastSuccess('Question modifiée en temps réel.');
      },
    );
  };

  const handleDeleteTrack = (index: number) => {
    if (!window.confirm('Supprimer cette question de la file ?')) return;
    socket.emit('host:deleteTrack', { gameId, hostToken, index }, (res: any) => {
      if (!res?.success) {
        toastError(res?.error || 'Impossible de supprimer cette question.');
        return;
      }
      toastInfo('Question supprimée.');
    });
  };

  const handleAddTrack = () => {
    const title = newTrackDraft.title.trim();
    if (!title) {
      toastWarning('Titre de question requis.');
      return;
    }
    const duration = Number(newTrackDraft.duration);
    socket.emit(
      'host:addTrack',
      {
        gameId,
        hostToken,
        track: {
          title,
          artist: newTrackDraft.artist.trim(),
          duration: Number.isFinite(duration) && duration > 0 ? duration : (gameState.defaultTrackDuration || 20),
          mediaType: 'audio',
        },
      },
      (res: any) => {
        if (!res?.success) {
          toastError(res?.error || "Impossible d'ajouter la question.");
          return;
        }
        setNewTrackDraft({ title: '', artist: '', duration: String(gameState.defaultTrackDuration || 20) });
        toastSuccess('Question ajoutée en temps réel.');
      },
    );
  };

  const handleDragStartTrack = (index: number) => {
    setDraggedTrackIndex(index);
  };

  const handleDragOverTrack = (index: number, event: DragEvent<HTMLDivElement>) => {
    if (draggedTrackIndex === null || draggedTrackIndex === index) return;
    event.preventDefault();
    setDragOverTrackIndex(index);
  };

  const handleDropTrack = (index: number) => {
    if (draggedTrackIndex === null || draggedTrackIndex === index) {
      setDraggedTrackIndex(null);
      setDragOverTrackIndex(null);
      return;
    }
    handleReorderTrack(draggedTrackIndex, index);
    setDraggedTrackIndex(null);
    setDragOverTrackIndex(null);
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

  const handleCopyCohostInviteLink = () => {
    if (!cohostToken || !gameId) return;
    const inviteUrl = `${window.location.origin}/admin/game/${gameId}?cohost=${encodeURIComponent(cohostToken)}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      toastSuccess('Lien co-animateur copié.');
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
      csvContent += "Joueur,Score,Buzz,Bonnes réponses,Erreurs,Taux réussite (%)\n";
      (Object.values(gameState.players) as Player[])
        .sort((a, b) => b.score - a.score)
        .forEach(player => {
          const buzzes = player.stats?.buzzes || 0;
          const correct = player.stats?.correctAnswers || 0;
          const wrong = player.stats?.wrongAnswers || 0;
          const rate = buzzes > 0 ? Math.round((correct / buzzes) * 100) : 0;
          csvContent += `${player.name},${player.score},${buzzes},${correct},${wrong},${rate}\n`;
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

  const handleExportPdf = () => {
    window.print();
  };

  const handleAppendRoundPlaylist = () => {
    if (!selectedRoundPlaylistId || !gameId || !hostToken) return;
    const playlist = availablePlaylists.find((p) => p.id === selectedRoundPlaylistId);
    if (!playlist) return;
    setRoundBusy(true);
    socket.emit(
      'host:appendRoundTracks',
      {
        gameId,
        hostToken,
        name: playlist.name,
        tracks: playlist.tracks,
      },
      (res: any) => {
        setRoundBusy(false);
        if (!res?.success) {
          toastError(res?.error || "Impossible d'ajouter cette manche.");
          return;
        }
        setSelectedRoundPlaylistId('');
      },
    );
  };

  const getTeamName = (teamId: string) => {
    const configured = gameState.teamConfig?.find((team) => team.id === teamId);
    return configured?.name || teamId;
  };

  const getTeamColor = (teamId: string) => {
    const configured = gameState.teamConfig?.find((team) => team.id === teamId);
    return configured?.color || '#ffffff';
  };

  const playersList = Object.values(gameState.players) as Player[];
  const totalBuzzes = playersList.reduce((acc, current) => acc + (current.stats?.buzzes || 0), 0);
  const totalCorrect = playersList.reduce((acc, current) => acc + (current.stats?.correctAnswers || 0), 0);
  const totalWrong = playersList.reduce((acc, current) => acc + (current.stats?.wrongAnswers || 0), 0);
  const buzzRate = totalBuzzes > 0 ? Math.round((totalCorrect / totalBuzzes) * 100) : 0;
  const formatResponseMs = (value?: number) => {
    if (typeof value !== 'number') return 'n/a';
    return `${(value / 1000).toFixed(2)}s`;
  };
  type TrackStat = NonNullable<typeof gameState.trackStats>[string];
  const trackStats = (Object.values(gameState.trackStats || {}) as TrackStat[])
    .sort((a, b) => a.trackIndex - b.trackIndex);
  const fastestTracks = trackStats
    .filter((entry) => typeof entry.fastestBuzzMs === 'number')
    .sort((a, b) => (a.fastestBuzzMs || 999999) - (b.fastestBuzzMs || 999999))
    .slice(0, 5);
  const hardestTracks = trackStats
    .slice()
    .sort((a, b) => b.revealedWithoutAnswer - a.revealedWithoutAnswer || b.wrongAnswers - a.wrongAnswers)
    .slice(0, 5);
  const topMissedPlayers = playersList
    .map((player) => ({ name: player.name, wrong: player.stats?.wrongAnswers || 0 }))
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 3);
  const currentRound = (gameState.rounds || []).find(
    (round) => gameState.currentTrackIndex >= round.startIndex && gameState.currentTrackIndex <= round.endIndex,
  );
  const textModeEnabled = Boolean(currentRound?.textAnswersEnabled);

  return (
    <div className="min-h-screen bg-zinc-950 text-white app-shell">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/95 backdrop-blur-lg border-b border-white/5 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/admin')}
            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 transition-all hover:border-white/20 shrink-0"
            title="Retour au dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="min-w-0">
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest leading-none">Partie en cours</p>
              <p className="font-mono text-indigo-400 text-base font-bold leading-tight truncate">{gameState.id}</p>
            </div>
            <AnimatePresence mode="wait">
            <motion.span
              key={gameState.status}
              initial={{ scale: 0.85, opacity: 0, y: -4 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 4 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={clsx(
              'px-3 py-1 rounded-full text-xs font-bold border shrink-0 flex items-center gap-1.5',
              gameState.status === 'lobby' && 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
              gameState.status === 'onboarding' && 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300',
              gameState.status === 'countdown' && 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200',
              gameState.status === 'playing' && 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200',
              gameState.status === 'paused' && 'bg-orange-500/15 border-orange-500/40 text-orange-200',
              gameState.status === 'revealed' && 'bg-blue-500/15 border-blue-500/40 text-blue-200',
              gameState.status === 'finished' && 'bg-purple-500/10 border-purple-500/30 text-purple-300',
            )}>
              {gameState.status === 'playing' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              {gameState.status === 'paused' && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />}
              {gameState.status === 'countdown' && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />}
              {gameState.status === 'lobby' && 'En attente'}
              {gameState.status === 'onboarding' && `Onboarding (${gameState.countdown || gameState.tutorialSeconds || 10}s)`}
              {gameState.status === 'countdown' && `Décompte ${gameState.countdown}…`}
              {gameState.status === 'playing' && 'En cours'}
              {gameState.status === 'paused' && '⚡ Buzzé !'}
              {gameState.status === 'revealed' && 'Réponse révélée'}
              {gameState.status === 'finished' && 'Terminé'}
            </motion.span>
            </AnimatePresence>
            {!isYoutubeMode && (
              <span className="hidden md:inline text-xs text-zinc-600 shrink-0 font-mono">
                {gameState.currentTrackIndex + 1}<span className="text-zinc-700">/{gameState.playlist.length}</span>
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <a
              href={`/screen/${gameState.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              <MonitorUp className="w-3.5 h-3.5" />
              Écran public
            </a>
            <a
              href={`/screen/${gameState.id}/return`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden lg:flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-xs border border-white/10 transition-colors"
            >
              Retour animateur
            </a>
            {isSafeMode && (
              <span className="hidden md:inline-flex items-center gap-1.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-medium">
                Safe mode
              </span>
            )}
            {gameState.status === 'finished' && (
              <>
                <button
                  onClick={handleExportScores}
                  className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  onClick={handleExportPdf}
                  className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-lg text-xs border border-white/10 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  PDF
                </button>
              </>
            )}
            {gameState.status !== 'finished' && hostRole === 'owner' && !isSafeMode && (
              <div className="relative">
                {showEndConfirm ? (
                  <div className="absolute top-full right-0 mt-2 bg-zinc-800 p-4 rounded-xl border border-white/10 shadow-xl z-50 w-52">
                    <p className="text-sm mb-3 text-center">Terminer la partie ?</p>
                    <div className="flex gap-2">
                      <button onClick={handleEndGame} className="flex-1 bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-medium">Oui</button>
                      <button onClick={() => setShowEndConfirm(false)} className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-2 rounded-lg text-sm font-medium">Non</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowEndConfirm(true)}
                    className="flex items-center gap-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    Terminer
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Buzzed Player Alert */}
          <AnimatePresence>
          {hasQuizStarted && gameState.status === 'paused' && buzzedPlayer && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className="relative p-6 rounded-2xl border-2 flex flex-col gap-4 overflow-hidden"
              style={{
                borderColor: buzzedPlayer.color,
                backgroundColor: `${buzzedPlayer.color}10`,
                boxShadow: `0 0 50px ${buzzedPlayer.color}30, 0 0 100px ${buzzedPlayer.color}12, inset 0 0 80px ${buzzedPlayer.color}06`,
              }}
            >
              {/* animated background glow pulse */}
              <motion.div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                style={{ background: `radial-gradient(ellipse at 70% 50%, ${buzzedPlayer.color}14, transparent 70%)` }}
              />
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <motion.p
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 }}
                    className="text-sm uppercase tracking-widest font-black"
                    style={{ color: buzzedPlayer.color }}
                  >
                    ⚡ A buzzé !
                  </motion.p>
                  <motion.h3
                    initial={{ opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-5xl font-black mt-1 tracking-tight"
                  >
                    {buzzedPlayer.name}
                  </motion.h3>
                  {gameState.buzzTimestamp && gameState.trackStartTime && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="text-xs mt-1.5 font-mono"
                      style={{ color: `${buzzedPlayer.color}90` }}
                    >
                      {((gameState.buzzTimestamp - gameState.trackStartTime) / 1000).toFixed(2)}s après le début
                    </motion.p>
                  )}
                </div>
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black relative"
                  style={{
                    backgroundColor: `${buzzedPlayer.color}25`,
                    border: `2px solid ${buzzedPlayer.color}60`,
                    boxShadow: `0 0 20px ${buzzedPlayer.color}50`,
                    color: buzzedPlayer.color,
                  }}
                >
                  {buzzedPlayer.name.charAt(0).toUpperCase()}
                </motion.div>
              </div>
              <div className="flex items-center gap-3 pt-3 border-t relative z-10" style={{ borderColor: `${buzzedPlayer.color}25` }}>
                {micActivePlayerId === buzzedPlayer.id ? (
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-75" style={{ width: `${micVolume}%` }} />
                      </div>
                      <span className="text-xs text-emerald-400 font-medium">Micro actif</span>
                    </div>
                    <button
                      onClick={() => handleStopPlayerMic(buzzedPlayer.id)}
                      className="flex items-center gap-1.5 bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <MicOff className="w-3.5 h-3.5" />
                      Couper
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleRequestPlayerMic(buzzedPlayer.id)}
                    className="flex items-center gap-2 bg-zinc-900/80 border border-white/10 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                  >
                    <Mic className="w-4 h-4" />
                    Tu ne l&apos;entends pas ? Activer son micro
                  </button>
                )}
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Track Control */}
          {!hasQuizStarted ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="bg-zinc-900 rounded-2xl border border-white/5 p-8"
            >
              <p className="text-xs uppercase tracking-wider text-indigo-400 font-semibold mb-2">Lobby</p>
              <h2 className="text-2xl font-bold mb-2">Prêt à démarrer</h2>
              <p className="text-zinc-400 mb-6">Organise les joueurs et lance le quiz quand tu es prêt.</p>
              <button
                onClick={handleStartTrack}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl flex items-center justify-center gap-3 font-semibold text-lg transition-colors"
              >
                <Play className="w-6 h-6" />
                {isYoutubeMode ? 'Démarrer le quiz YouTube' : 'Lancer le quiz'}
              </button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className={clsx(
                'bg-zinc-900 rounded-2xl border p-6 relative overflow-hidden transition-colors duration-500',
                gameState.status === 'playing' && 'border-emerald-500/20',
                gameState.status === 'paused' && 'border-orange-500/25',
                gameState.status === 'revealed' && 'border-blue-500/20',
                gameState.status === 'countdown' && 'border-indigo-500/25',
                !['playing', 'paused', 'revealed', 'countdown'].includes(gameState.status) && 'border-white/5',
              )}
              style={{
                boxShadow:
                  gameState.status === 'playing' ? '0 0 35px rgba(52,211,153,0.07)' :
                  gameState.status === 'paused' ? '0 0 35px rgba(251,146,60,0.09)' :
                  gameState.status === 'revealed' ? '0 0 35px rgba(96,165,250,0.07)' :
                  gameState.status === 'countdown' ? '0 0 35px rgba(99,102,241,0.09)' :
                  'none',
              }}
            >
              {!isYoutubeMode && (
                <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
                  <motion.div
                    className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full"
                    style={{ width: `${(gameState.currentTrackIndex / Math.max(1, gameState.playlist.length)) * 100}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>
              )}
              <div className="mb-6 mt-2">
                {isYoutubeMode ? (
                  <>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-3">
                      Manche {gameState.roundNumber || 1}
                    </p>
                    <div className="w-full aspect-video rounded-xl overflow-hidden bg-black">
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
                    <AnimatePresence mode="wait">
                    {gameState.status === 'revealed' || gameState.status === 'finished' ? (
                      <motion.div
                        key="revealed"
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22 }}
                      >
                        <p className="text-xs text-blue-400 uppercase tracking-widest font-bold mb-1.5">✓ Réponse révélée</p>
                        <h2 className="text-4xl font-black mb-1 tracking-tight">{currentTrack?.title}</h2>
                        <p className="text-2xl text-zinc-400 font-medium">{currentTrack?.artist}</p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="hidden"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="flex items-center gap-4"
                      >
                        <div className={clsx(
                          'w-14 h-14 rounded-2xl flex items-center justify-center transition-colors',
                          gameState.status === 'playing' ? 'bg-emerald-500/15 text-emerald-400' :
                          gameState.status === 'paused' ? 'bg-orange-500/15 text-orange-400' :
                          'bg-zinc-800 text-zinc-600',
                        )}>
                          <Music className={clsx('w-7 h-7', gameState.status === 'playing' && 'animate-pulse')} />
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mb-1">Question en cours</p>
                          <h2 className="text-2xl font-bold text-zinc-500 italic">Titre masqué</h2>
                          {gameState.status === 'playing' && (
                            <p className="text-xs text-emerald-500/70 mt-0.5">Musique en cours de lecture…</p>
                          )}
                          {gameState.status === 'paused' && (
                            <p className="text-xs text-orange-500/70 mt-0.5">En attente de la réponse…</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                    </AnimatePresence>
                    {(gameState.status === 'playing' || gameState.status === 'paused') && gameState.trackStartTime && (
                      <Timer
                        gameState={gameState}
                        duration={currentTrack?.duration}
                        strictMode={Boolean(gameState.strictTimerEnabled)}
                        onTimeUp={handleRevealAnswer}
                      />
                    )}
                    {isYoutubeTrack && (
                      <div className="w-full aspect-video rounded-xl overflow-hidden bg-black mt-4 border border-white/10">
                        <YouTube
                          videoId={currentTrack?.mediaUrl ? extractYoutubeId(currentTrack.mediaUrl) : undefined}
                          opts={{
                            width: '100%',
                            height: '100%',
                            playerVars: { autoplay: 1, controls: 1, start: currentTrack?.startTime || 0 },
                          }}
                          onReady={onYoutubeReady}
                          onStateChange={onYoutubeStateChange}
                          className="w-full h-full"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
              {!isYoutubeMode && canHostPlayTrackAudio && (
                <audio
                  ref={hostTrackAudioRef}
                  src={currentTrack?.mediaUrl}
                  preload="metadata"
                  className="hidden"
                  onLoadedMetadata={(e) => {
                    const targetTime = Math.max(0, currentTrack?.startTime ?? 0);
                    if (targetTime > 0) {
                      try {
                        e.currentTarget.currentTime = targetTime;
                      } catch {
                        // Ignore seek errors before metadata is fully ready.
                      }
                    }
                  }}
                />
              )}
              <audio ref={audioRef} autoPlay playsInline className="hidden" />
              {!isYoutubeMode && (
                <div className="mb-3 flex flex-wrap items-center gap-3 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2">
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={hostAudioEnabled}
                      onChange={(e) => setHostAudioEnabled(e.target.checked)}
                    />
                    Son admin
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={hostPrelisten}
                      onChange={(e) => setHostPrelisten(e.target.checked)}
                    />
                    Pré-écoute casque
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    Volume
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(hostAudioVolume * 100)}
                      onChange={(e) => setHostAudioVolume(Math.max(0, Math.min(1, Number(e.target.value) / 100)))}
                    />
                    <span className="w-9 text-right text-zinc-300">{Math.round(hostAudioVolume * 100)}%</span>
                  </label>
                </div>
              )}
              {/* Controls */}
              <AnimatePresence mode="wait">
              <motion.div
                key={gameState.status}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="flex items-center gap-3"
              >
                {gameState.status === 'lobby' || gameState.status === 'revealed' ? (
                  <motion.button
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.975 }}
                    onClick={handleStartTrack}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl flex items-center justify-center gap-3 font-bold text-lg transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    <Play className="w-6 h-6" />
                    {isYoutubeMode ? (gameState.status === 'lobby' ? 'Démarrer' : 'Reprendre') : 'Lancer la musique'}
                  </motion.button>
                ) : gameState.status === 'countdown' ? (
                  <div className="flex-1 bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 py-4 rounded-xl flex items-center justify-center gap-3 font-semibold text-lg cursor-not-allowed">
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-5 h-5 rounded-full border-2 border-indigo-300/30 border-t-indigo-300 inline-block"
                    />
                    Préparation…
                  </div>
                ) : gameState.status === 'playing' ? (
                  <motion.button
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.975 }}
                    onClick={isYoutubeMode ? handleResumeYoutube : handleRevealAnswer}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl flex items-center justify-center gap-3 font-bold text-lg transition-colors shadow-lg shadow-blue-500/15"
                  >
                    {isYoutubeMode ? <Pause className="w-6 h-6" /> : <Check className="w-6 h-6" />}
                    {isYoutubeMode ? 'Pause' : 'Révéler la réponse'}
                  </motion.button>
                ) : gameState.status === 'paused' && buzzedPlayer ? (
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleAwardPoints(buzzedPlayer.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-xl flex items-center justify-center gap-2 font-bold text-base transition-colors shadow-xl shadow-emerald-500/25"
                      style={{ boxShadow: '0 8px 32px rgba(52,211,153,0.25)' }}
                    >
                      <Check className="w-6 h-6" />
                      {gameState.enableBonuses ? 'Correct (bonus)' : 'Bonne réponse'}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handlePenalize(buzzedPlayer.id)}
                      className="bg-red-600 hover:bg-red-500 text-white py-5 rounded-xl flex items-center justify-center gap-2 font-bold text-base transition-colors"
                      style={{ boxShadow: '0 8px 32px rgba(239,68,68,0.20)' }}
                    >
                      <X className="w-6 h-6" />
                      Mauvaise réponse
                    </motion.button>
                  </div>
                ) : null}
                {!isYoutubeMode && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={handleNextTrack}
                    disabled={gameState.currentTrackIndex >= gameState.playlist.length - 1}
                    className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-white p-4 rounded-xl transition-colors border border-white/5"
                    title="Piste suivante"
                  >
                    <SkipForward className="w-6 h-6" />
                  </motion.button>
                )}
              </motion.div>
              </AnimatePresence>
            </motion.div>
          )}

          {/* Text Answers */}
          {!isSafeMode && <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Réponses texte ouvertes
              </h2>
              <span className={clsx(
                'text-xs px-2.5 py-0.5 rounded-full border',
                textModeEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-zinc-800 border-white/10 text-zinc-500'
              )}>
                {textModeEnabled ? 'Actif sur manche en cours' : 'Inactif'}
              </span>
            </div>
            <div className="space-y-2 max-h-48 overflow-auto pr-1">
              {(gameState.textAnswers || []).length === 0 ? (
                <p className="text-sm text-zinc-500">Aucune réponse en attente.</p>
              ) : (
                (gameState.textAnswers || []).map((entry) => (
                  <div key={entry.id} className="bg-zinc-950 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{entry.playerName}</p>
                      <p className="text-xs text-zinc-300 mt-0.5">&ldquo;{entry.answer}&rdquo;</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleValidateTextAnswer(entry.id, entry.playerId, true)}
                        className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg text-xs font-medium"
                      >
                        Valider
                      </button>
                      <button
                        onClick={() => handleValidateTextAnswer(entry.id, entry.playerId, false)}
                        className="bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-lg text-xs font-medium"
                      >
                        Refuser
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>}

          {/* Queue */}
          {!isSafeMode && !isYoutubeMode && hasQuizStarted && (
            <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Music className="w-4 h-4 text-indigo-400" />
                  File des musiques
                </h2>
                <p className="text-xs text-zinc-500">Glisser pour réordonner</p>
              </div>
              {hostRole === 'owner' && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {!draftMode ? (
                    <>
                      <button
                        onClick={initDraftMode}
                        className="bg-zinc-800 hover:bg-zinc-700 border border-white/10 px-3 py-1.5 rounded-lg text-xs"
                      >
                        Mode brouillon
                      </button>
                      <button
                        onClick={handleShuffleUpcomingTracks}
                        disabled={gameState.currentTrackIndex >= gameState.playlist.length - 2}
                        className="bg-indigo-600/25 hover:bg-indigo-600/35 border border-indigo-500/30 disabled:opacity-40 px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5"
                      >
                        <Shuffle className="w-3.5 h-3.5" />
                        Aléatoire
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={publishDraftTracks} className="bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg text-xs font-medium">Publier</button>
                      <button onClick={cancelDraftMode} className="bg-zinc-700 hover:bg-zinc-600 px-3 py-1.5 rounded-lg text-xs">Annuler</button>
                    </>
                  )}
                </div>
              )}
              {hostRole === 'owner' && !draftMode && (
                <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-2 rounded-xl border border-white/10 bg-zinc-950 p-3">
                  <input
                    value={newTrackDraft.title}
                    onChange={(e) => setNewTrackDraft((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Titre question"
                    className="md:col-span-2 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    value={newTrackDraft.artist}
                    onChange={(e) => setNewTrackDraft((prev) => ({ ...prev, artist: e.target.value }))}
                    placeholder="Artiste"
                    className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={newTrackDraft.duration}
                      onChange={(e) => setNewTrackDraft((prev) => ({ ...prev, duration: e.target.value }))}
                      placeholder="Durée"
                      className="w-20 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    />
                    <button onClick={handleAddTrack} className="flex-1 bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg text-sm">
                      Ajouter
                    </button>
                  </div>
                </div>
              )}
              {draftMode ? (
                <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
                    Mode brouillon &ndash; modifications non diffusées avant &ldquo;Publier&rdquo;.
                  </div>
                  {draftUpcomingTracks.map((track, index) => (
                    <div key={`draft-${index}`} className="rounded-xl border border-white/10 bg-zinc-950 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-500">Question #{gameState.currentTrackIndex + 2 + index}</p>
                        <button onClick={() => removeDraftTrack(index)} className="bg-red-600 hover:bg-red-500 p-1.5 rounded" title="Supprimer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input value={track.title} onChange={(e) => updateDraftTrackField(index, 'title', e.target.value)} placeholder="Titre" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                        <input value={track.artist} onChange={(e) => updateDraftTrackField(index, 'artist', e.target.value)} placeholder="Artiste" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                        <input type="number" min={1} max={300} value={track.duration} onChange={(e) => updateDraftTrackField(index, 'duration', e.target.value)} placeholder="Durée" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input value={track.mediaType} onChange={(e) => updateDraftTrackField(index, 'mediaType', e.target.value)} placeholder="mediaType" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                        <input value={track.mediaUrl} onChange={(e) => updateDraftTrackField(index, 'mediaUrl', e.target.value)} placeholder="mediaUrl" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                        <input value={track.url} onChange={(e) => updateDraftTrackField(index, 'url', e.target.value)} placeholder="url legacy" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input type="number" min={0} value={track.startTime} onChange={(e) => updateDraftTrackField(index, 'startTime', e.target.value)} placeholder="startTime (s)" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                        <input value={track.textContent} onChange={(e) => updateDraftTrackField(index, 'textContent', e.target.value)} placeholder="textContent" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                      </div>
                    </div>
                  ))}
                  <button onClick={addDraftTrack} className="w-full bg-indigo-600/80 hover:bg-indigo-500 px-3 py-2 rounded-lg text-sm">
                    Ajouter une question
                  </button>
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {gameState.playlist.map((track, index) => {
                    const isCurrent = index === gameState.currentTrackIndex;
                    const isUpcoming = index > gameState.currentTrackIndex && gameState.status !== 'finished';
                    const canEditTrack =
                      hostRole === 'owner' &&
                      gameState.status !== 'finished' &&
                      !(isCurrent && (gameState.status === 'countdown' || gameState.status === 'playing' || gameState.status === 'paused'));
                    const draft = getTrackDraft(track);
                    const isDropTarget = dragOverTrackIndex === index && draggedTrackIndex !== null;
                    return (
                      <div
                        key={track.id || `${track.title}-${index}`}
                        draggable={isUpcoming}
                        onDragStart={() => handleDragStartTrack(index)}
                        onDragOver={(event: DragEvent<HTMLDivElement>) => handleDragOverTrack(index, event)}
                        onDrop={() => handleDropTrack(index)}
                        onDragEnd={() => { setDraggedTrackIndex(null); setDragOverTrackIndex(null); }}
                        className={clsx(
                          'rounded-xl border px-3 py-2 flex items-center justify-between gap-3 transition-all',
                          isCurrent ? 'border-indigo-500/40 bg-indigo-500/10' : index > gameState.currentTrackIndex ? 'border-white/10 bg-zinc-950' : 'border-white/5 bg-zinc-950/40 opacity-60',
                          isUpcoming && 'cursor-move',
                          isDropTarget && 'ring-2 ring-indigo-400/80',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-zinc-500 mb-0.5">
                            #{index + 1} {isCurrent ? '• En cours' : index > gameState.currentTrackIndex ? '• À venir' : '• Joué'}
                          </p>
                          {canEditTrack ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <input value={draft.title} onChange={(e) => setTrackDraftField(track.id, 'title', e.target.value)} className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" placeholder="Titre" />
                              <input value={draft.artist} onChange={(e) => setTrackDraftField(track.id, 'artist', e.target.value)} className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" placeholder="Artiste" />
                              <input type="number" min={1} max={300} value={draft.duration} onChange={(e) => setTrackDraftField(track.id, 'duration', e.target.value)} className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" placeholder="Durée" />
                            </div>
                          ) : (
                            <>
                              <p className="text-sm font-medium truncate">{track.title || 'Titre masqué'}</p>
                              <p className="text-xs text-zinc-400 truncate">{track.artist || 'Artiste inconnu'}</p>
                            </>
                          )}
                        </div>
                        {isUpcoming && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleReorderTrack(index, index - 1)} disabled={index === gameState.currentTrackIndex + 1} className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 p-1.5 rounded-lg" title="Monter"><ArrowUp className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleReorderTrack(index, index + 1)} disabled={index >= gameState.playlist.length - 1} className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 p-1.5 rounded-lg" title="Descendre"><ArrowDown className="w-3.5 h-3.5" /></button>
                            {canEditTrack && (
                              <>
                                <button onClick={() => handleSaveTrack(index, track)} className="bg-emerald-600 hover:bg-emerald-500 p-1.5 rounded-lg" title="Sauvegarder"><Check className="w-3.5 h-3.5" /></button>
                                <button onClick={() => handleDeleteTrack(index)} className="bg-red-600 hover:bg-red-500 p-1.5 rounded-lg" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Rounds + Duel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {!isYoutubeMode && hasQuizStarted && (
              <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold">Manches</h2>
                  <span className="text-xs text-zinc-500">Manche {gameState.roundNumber || 1}/{gameState.rounds?.length || 1}</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(gameState.rounds || []).map((round, idx) => (
                    <div key={round.id} className="flex items-center gap-1.5">
                      <span className={clsx(
                        'px-2.5 py-1 rounded-full border text-xs',
                        idx + 1 === (gameState.roundNumber || 1) ? 'bg-indigo-600/30 border-indigo-400/40 text-indigo-200' : 'bg-zinc-950 border-white/10 text-zinc-400'
                      )}>
                        {round.name}
                      </span>
                      {hostRole === 'owner' && (
                        <button
                          onClick={() => handleSetRoundTextMode(round.id, !round.textAnswersEnabled)}
                          className={clsx(
                            'px-1.5 py-0.5 rounded border text-[10px]',
                            round.textAnswersEnabled ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300' : 'bg-zinc-900 border-white/10 text-zinc-400'
                          )}
                        >
                          Q ouverte {round.textAnswersEnabled ? 'ON' : 'OFF'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {hostRole === 'owner' && !isSafeMode && (
                  <div className="flex flex-col gap-2">
                    <select
                      value={selectedRoundPlaylistId}
                      onChange={(e) => setSelectedRoundPlaylistId(e.target.value)}
                      className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-xs"
                    >
                      <option value="">Ajouter une playlist comme manche&hellip;</option>
                      {availablePlaylists.map((playlist) => (
                        <option key={playlist.id} value={playlist.id}>{playlist.name} ({playlist.tracks.length} pistes)</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAppendRoundPlaylist}
                      disabled={!selectedRoundPlaylistId || roundBusy}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-2 rounded-lg text-xs font-medium"
                    >
                      {roundBusy ? 'Ajout&hellip;' : 'Ajouter la manche'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Duel 1v1 */}
            <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6">
              <h2 className="text-base font-semibold mb-3">Défi 1v1</h2>
              {gameState.duelState?.active ? (
                <div className="bg-zinc-950 border border-indigo-500/30 rounded-xl p-3">
                  <p className="text-sm text-indigo-200 mb-3">
                    {gameState.players[gameState.duelState.playerAId]?.name || 'Joueur A'} vs {gameState.players[gameState.duelState.playerBId]?.name || 'Joueur B'}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => handleResolveDuel(gameState.duelState!.playerAId)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg text-xs">
                      {gameState.players[gameState.duelState.playerAId]?.name || 'A'} gagne
                    </button>
                    <button onClick={() => handleResolveDuel(gameState.duelState!.playerBId)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg text-xs">
                      {gameState.players[gameState.duelState.playerBId]?.name || 'B'} gagne
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select value={duelPlayerAId} onChange={(e) => setDuelPlayerAId(e.target.value)} className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-xs">
                      <option value="">Joueur A</option>
                      {playersList.map((p) => <option key={`a-${p.id}`} value={p.id}>{p.name}</option>)}
                    </select>
                    <select value={duelPlayerBId} onChange={(e) => setDuelPlayerBId(e.target.value)} className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-xs">
                      <option value="">Joueur B</option>
                      {playersList.map((p) => <option key={`b-${p.id}`} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input type="number" min={1} max={20} value={duelRewardPoints} onChange={(e) => setDuelRewardPoints(e.target.value)} className="w-20 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-xs" placeholder="Pts" />
                    <button onClick={handleStartDuel} className="flex-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-2 text-xs font-medium">Lancer le duel</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ESP32 Devices */}
          <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-indigo-400" />
                Buzzers ESP32
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">
                  {Object.values((gameState.hardwareDevices || {}) as Record<string, { status: string }>).filter((d) => d.status === 'online').length} en ligne
                </span>
                <button
                  onClick={() => navigate(`/admin/game/${gameState.id}/hardware`)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-xs px-2.5 py-1.5 rounded-lg border border-white/10"
                >
                  Inventaire
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {(Object.values(gameState.players) as Player[]).map((player) => {
                const deviceId = player.buzzerDeviceId || '';
                const deviceInfo = deviceId ? gameState.hardwareDevices?.[deviceId] : undefined;
                return (
                  <div key={`device-${player.id}`} className="bg-zinc-950 border border-white/10 rounded-xl p-3">
                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                      <div className="md:w-44">
                        <p className="text-sm font-medium">{player.name}</p>
                        <p className="text-xs text-zinc-500">{deviceId ? `Assigné: ${deviceId}` : 'Aucun buzzer'}</p>
                      </div>
                      {hostRole === 'owner' && (
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            value={deviceDraftByPlayer[player.id] ?? player.buzzerDeviceId ?? ''}
                            onChange={(e) => setDeviceDraftByPlayer((prev) => ({ ...prev, [player.id]: e.target.value }))}
                            placeholder="deviceId (ex: bt-buzzer-01)"
                            className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
                          />
                          <button onClick={() => handleAssignDevice(player.id)} className="bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg text-sm">Assigner</button>
                        </div>
                      )}
                      {deviceInfo && (
                        <div className="text-xs text-zinc-400 space-y-0.5 md:text-right">
                          <p className={deviceInfo.status === 'online' ? 'text-emerald-400' : 'text-zinc-500'}>{deviceInfo.status === 'online' ? 'En ligne' : 'Hors ligne'}</p>
                          <p>Ping: {new Date(deviceInfo.lastSeenAt).toLocaleTimeString('fr-FR')}</p>
                          {typeof deviceInfo.rssi === 'number' && <p>RSSI: {deviceInfo.rssi} dBm</p>}
                          <p>HP: {deviceInfo.speakerEnabled === false ? 'Off' : deviceInfo.speakerMuted ? 'Muté' : 'Actif'}</p>
                        </div>
                      )}
                    </div>
                    {deviceInfo && hostRole === 'owner' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => handleToggleDeviceSpeakerEnabled(deviceId, !(deviceInfo.speakerEnabled ?? true))} className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-xs">
                          {(deviceInfo.speakerEnabled ?? true) ? 'Désactiver HP' : 'Activer HP'}
                        </button>
                        <button onClick={() => handleToggleDeviceMute(deviceId, !(deviceInfo.speakerMuted ?? false))} className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-xs" disabled={deviceInfo.speakerEnabled === false}>
                          {(deviceInfo.speakerMuted ?? false) ? 'Unmute' : 'Mute'}
                        </button>
                        <button onClick={() => handleTestDeviceSpeaker(deviceId)} className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg text-xs" disabled={deviceInfo.speakerEnabled === false || (deviceInfo.speakerMuted ?? false)}>
                          Test HP
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Co-host */}
          {hostRole === 'owner' && (
            <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <h2 className="text-base font-semibold">Co-animateur</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Déléguer le contrôle sans droits de kick / fin.</p>
                </div>
                <button onClick={handleCreateCohostToken} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg text-sm border border-white/10 shrink-0">
                  Générer un token
                </button>
              </div>
              {cohostError && <p className="text-red-400 text-sm mt-2">{cohostError}</p>}
              {cohostToken && (
                <>
                  <div className="mt-3 bg-zinc-950 border border-white/10 rounded-xl p-3 flex items-center gap-2">
                    <code className="flex-1 text-xs text-indigo-300 break-all">{cohostToken}</code>
                    <button onClick={handleCopyCohostToken} className="bg-zinc-800 hover:bg-zinc-700 p-2 rounded-lg shrink-0" title="Copier">
                      {copiedCohostToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <button onClick={handleCopyCohostInviteLink} className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                    <Copy className="w-4 h-4" />
                    Copier le lien d&apos;invitation
                  </button>
                </>
              )}
              {hostsPresence.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Connectés</p>
                  {hostsPresence.map((host) => (
                    <div key={host.socketId} className="flex items-center justify-between bg-zinc-950 border border-white/5 rounded-lg px-3 py-2 text-xs">
                      <span className={host.role === 'owner' ? 'text-indigo-300 font-medium' : 'text-zinc-300'}>
                        {host.role === 'owner' ? 'Owner' : 'Co-host'}
                        {mySocketId && host.socketId === mySocketId ? ' (toi)' : ''}
                      </span>
                      <span className="text-zinc-500">depuis {new Date(host.connectedAt).toLocaleTimeString('fr-FR')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Players + Stats */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">

          {/* Players */}
          <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                Joueurs
              </h2>
              <span className="bg-zinc-800 border border-white/8 text-zinc-300 text-xs font-bold px-2 py-0.5 rounded-full">
                {Object.keys(gameState.players).length}
              </span>
            </div>

            {gameState.isTeamMode && (
              <div className="mb-4 space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Scores par équipe</p>
                {Object.entries(
                  (Object.values(gameState.players) as Player[]).reduce((acc, player) => {
                    if (player.team) acc[player.team] = (acc[player.team] || 0) + player.score;
                    return acc;
                  }, {} as Record<string, number>)
                )
                  .sort(([, a], [, b]) => b - a)
                  .map(([teamId, score]) => (
                    <div key={teamId} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getTeamColor(teamId) }} />
                        <span className="text-sm font-medium">{getTeamName(teamId)}</span>
                      </div>
                      <span className="font-mono font-bold text-sm">{score}</span>
                    </div>
                  ))}
                {hostRole === 'owner' && (
                  <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-zinc-950 p-3">
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">Gérer équipes</p>
                    <div className="flex flex-wrap gap-1">
                      {(gameState.teamConfig || []).map((team) => (
                        <div key={team.id} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                          <span className="text-xs">{team.name}</span>
                          <button onClick={() => handleRemoveTeam(team.id)} className="text-zinc-500 hover:text-red-400 ml-0.5" title="Supprimer">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input value={teamDraftName} onChange={(e) => setTeamDraftName(e.target.value)} placeholder="Nom équipe" className="flex-1 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs" />
                      <input type="color" value={teamDraftColor} onChange={(e) => setTeamDraftColor(e.target.value)} className="h-7 w-9 bg-zinc-900 border border-white/10 rounded cursor-pointer" title="Couleur" />
                      <button onClick={handleAddTeam} className="bg-indigo-600 hover:bg-indigo-500 rounded px-2 py-1 text-xs flex items-center gap-1">
                        <Plus className="w-3 h-3" />
                        Ajouter
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
              {(Object.values(gameState.players) as Player[])
                .sort((a, b) => b.score - a.score)
                .map((player, rankIdx) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10, scale: 0.97 }}
                    transition={{ duration: 0.18 }}
                    layout
                    className={clsx(
                      'p-3 rounded-xl flex items-center justify-between border transition-all',
                      player.id === gameState.buzzedPlayerId ? 'border-orange-500/40 bg-orange-500/8' :
                      player.lockedOut ? 'border-red-500/40 bg-red-500/10 opacity-60' : 'border-white/5 bg-zinc-950',
                    )}
                    style={player.id === gameState.buzzedPlayerId ? {
                      boxShadow: `0 0 16px ${player.color}30`,
                    } : undefined}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: gameState.isTeamMode && player.team ? getTeamColor(player.team) : player.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{player.name}</p>
                        {gameState.isTeamMode && player.team && (
                          <p className="text-xs text-zinc-500">Équipe {getTeamName(player.team)}</p>
                        )}
                        {gameState.isTeamMode && hostRole === 'owner' && !isSafeMode && (
                          <select
                            value={player.team || ''}
                            onChange={(e) => handleAssignPlayerTeam(player.id, e.target.value)}
                            className="mt-1 bg-zinc-900 border border-white/10 rounded px-1.5 py-0.5 text-xs"
                          >
                            <option value="">Aucune équipe</option>
                            {(gameState.teamConfig || []).filter((t) => t.enabled).map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        )}
                        {hostRole === 'owner' && !isSafeMode && (
                          <div className="mt-1 flex items-center gap-1">
                            <button onClick={() => handleApplyEventPower('x2', player.id)} className="text-[9px] bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 rounded">x2</button>
                            <button onClick={() => handleApplyEventPower('freeze', player.id)} className="text-[9px] bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 rounded">Freeze</button>
                            <button onClick={() => handleApplyEventPower('comeback', player.id)} className="text-[9px] bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 rounded">Comeback</button>
                          </div>
                        )}
                      </div>
                      {player.lockedOut && (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-red-400 font-bold">Bloqué</span>
                          <button onClick={() => handleUnlockPlayer(player.id)} className="bg-zinc-800 hover:bg-zinc-700 p-1 rounded" title="Débloquer">
                            <Unlock className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="font-mono font-bold text-sm">{player.score}</span>
                      {hostRole === 'owner' && !isSafeMode && (
                        <div className="relative">
                          {playerToKick === player.id ? (
                            <div className="absolute right-0 top-full mt-1 bg-zinc-800 p-3 rounded-xl border border-white/10 shadow-xl z-50 w-40">
                              <p className="text-xs mb-2 text-center">Exclure {player.name} ?</p>
                              <div className="flex gap-1.5">
                                <button onClick={() => handleKickPlayer(player.id)} className="flex-1 bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs">Oui</button>
                                <button onClick={() => setPlayerToKick(null)} className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded text-xs">Non</button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setPlayerToKick(player.id)}
                              className="text-zinc-600 hover:text-red-400 p-1 rounded transition-colors"
                              title="Exclure"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {Object.keys(gameState.players).length === 0 && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                    <Users className="w-5 h-5 text-zinc-600" />
                  </div>
                  <p className="text-zinc-500 text-sm">En attente de joueurs…</p>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6">
            <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
              <Trophy className="w-4 h-4 text-amber-400" />
              Stats de la partie
            </h2>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-zinc-950 border border-white/5 rounded-xl p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Buzz</p>
                <p className="text-2xl font-black">{totalBuzzes}</p>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Réussite</p>
                <p className="text-2xl font-black text-emerald-400">{buzzRate}%</p>
              </div>
              <div className="bg-zinc-950 border border-emerald-500/10 rounded-xl p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Corrects</p>
                <p className="text-2xl font-black text-emerald-400">{totalCorrect}</p>
              </div>
              <div className="bg-zinc-950 border border-red-500/10 rounded-xl p-3">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Erreurs</p>
                <p className="text-2xl font-black text-red-400">{totalWrong}</p>
              </div>
            </div>
            {topMissedPlayers.length > 0 && (
              <div className="mb-3 bg-zinc-950 border border-white/5 rounded-xl p-3">
                <p className="text-xs text-zinc-500 mb-2">Top ratés</p>
                {topMissedPlayers.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-zinc-300">{entry.name}</span>
                    <span className="text-red-400">{entry.wrong} err.</span>
                  </div>
                ))}
              </div>
            )}
            {fastestTracks.length > 0 && (
              <div className="mb-3 bg-zinc-950 border border-white/5 rounded-xl p-3">
                <p className="text-xs text-zinc-500 mb-2">Buzz les + rapides</p>
                {fastestTracks.map((entry) => (
                  <div key={`fast-${entry.trackIndex}`} className="flex items-center justify-between text-xs py-0.5 gap-2">
                    <span className="text-zinc-300 truncate">#{entry.trackIndex + 1} {entry.title || '—'}</span>
                    <span className="text-emerald-400 shrink-0">{formatResponseMs(entry.fastestBuzzMs)}</span>
                  </div>
                ))}
              </div>
            )}
            {hardestTracks.length > 0 && (
              <div className="mb-3 bg-zinc-950 border border-white/5 rounded-xl p-3">
                <p className="text-xs text-zinc-500 mb-2">Musiques les + dures</p>
                {hardestTracks.map((entry) => (
                  <div key={`hard-${entry.trackIndex}`} className="flex items-center justify-between text-xs py-0.5 gap-2">
                    <span className="text-zinc-300 truncate">#{entry.trackIndex + 1} {entry.title || '—'}</span>
                    <span className="text-zinc-400 shrink-0">{entry.revealedWithoutAnswer} skip &middot; {entry.wrongAnswers} err.</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Logs live</p>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {eventLogs.length === 0 && <p className="text-xs text-zinc-500">Pas encore d&apos;événement.</p>}
                {eventLogs.map((entry, idx) => (
                  <div key={`${entry.ts}-${idx}`} className="text-xs bg-zinc-950 border border-white/5 rounded-lg px-2.5 py-1.5">
                    <span className="text-zinc-500 mr-1.5">{new Date(entry.ts).toLocaleTimeString('fr-FR')}</span>
                    <span className="text-zinc-300">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
