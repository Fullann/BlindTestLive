import { useState, useEffect, useRef, DragEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, Player, Track } from '../types';
import { Play, Pause, SkipForward, Check, X, Users, Music, Trophy, MonitorUp, Copy, Unlock, UserMinus, Flag, ArrowLeft, Download, ArrowUp, ArrowDown, FileText, Cpu, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import YouTube from 'react-youtube';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

const extractYoutubeId = (url: string) => {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : url;
};

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
  const [draftMode, setDraftMode] = useState(false);
  const [draftUpcomingTracks, setDraftUpcomingTracks] = useState<
    Array<{ title: string; artist: string; duration: string; mediaType: string; mediaUrl: string; textContent: string; startTime: string; url: string }>
  >([]);
  const hostTokenFromUrl = searchParams.get('cohost');
  const hostToken = gameId
    ? hostTokenFromUrl ||
      sessionStorage.getItem(`blindtest_host_${gameId}`) ||
      localStorage.getItem(`blindtest_host_${gameId}`)
    : null;

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

    return () => {
      socket.off('game:stateUpdate', handleStateUpdate);
      socket.off('game:playSound', handleSound);
      socket.off('game:eventLogs', handleEventLogs);
      socket.off('game:hostsPresence', handleHostsPresence);
      socket.off('connect', joinAsHost);
    };
  }, [gameId, navigate, hostToken, hostTokenFromUrl]);

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
      // YouTube peut renvoyer un player invalide si l'iframe est démontée/recréée.
      // On protège pour éviter un crash React dans ce cas.
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

  if (!gameState) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement...</div>;
  }

  const isYoutubeMode = !!gameState.youtubeVideoId;
  const hasQuizStarted = gameState.status !== 'lobby';
  const currentTrack = !isYoutubeMode ? gameState.playlist[gameState.currentTrackIndex] : null;
  const isYoutubeTrack = !!currentTrack && currentTrack.mediaType === 'youtube' && !!currentTrack.mediaUrl;
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
  const topMissedPlayers = playersList
    .map((player) => ({ name: player.name, wrong: player.stats?.wrongAnswers || 0 }))
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 app-shell">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Game Controls */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between bg-zinc-900 p-6 rounded-2xl border border-white/5 app-card">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/admin')}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white p-3 rounded-xl transition-colors"
                title="Retour au tableau de bord"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Partie en cours
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
                  <>
                    <button
                      onClick={handleExportScores}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
                      title="Exporter les scores (CSV)"
                    >
                      <Download className="w-4 h-4" />
                      CSV
                    </button>
                    <button
                      onClick={handleExportPdf}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
                      title="Exporter les scores (PDF)"
                    >
                      <FileText className="w-4 h-4" />
                      PDF
                    </button>
                  </>
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
                  gameState.status === 'onboarding' && "text-fuchsia-400",
                  gameState.status === 'countdown' && "text-indigo-400",
                  gameState.status === 'playing' && "text-emerald-400",
                  gameState.status === 'paused' && "text-red-400",
                  gameState.status === 'revealed' && "text-blue-400",
                  gameState.status === 'finished' && "text-purple-400"
                )}>
                  {gameState.status === 'lobby' && 'En attente'}
                  {gameState.status === 'onboarding' && `Onboarding (${gameState.countdown || gameState.tutorialSeconds || 10}s)`}
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
            <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5 app-card">
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
              {cohostToken && (
                <button
                  onClick={handleCopyCohostInviteLink}
                  className="mt-3 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copier le lien d'invitation co-animateur
                </button>
              )}
            </div>
          )}

          <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5 app-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Co-animateurs connectés</h2>
              {hostRole === 'owner' && cohostToken && (
                <button
                  onClick={handleCopyCohostInviteLink}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copier lien cohost
                </button>
              )}
            </div>
            {hostsPresence.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucun host/cohost connecté pour le moment.</p>
            ) : (
              <div className="space-y-2">
                {hostsPresence.map((host, idx) => (
                  <div key={`${host.socketId}-${idx}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-zinc-950 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${host.role === 'owner' ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
                      <span className="text-sm">
                        {host.role === 'owner' ? 'Owner' : 'Co-host'}
                        {mySocketId && host.socketId === mySocketId ? ' (toi)' : ''}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      En ligne depuis {new Date(host.connectedAt).toLocaleTimeString('fr-FR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!isYoutubeMode && hasQuizStarted && (
            <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5 space-y-4 app-card">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Mode tournoi et manches</h2>
                <span className="text-xs text-zinc-400">
                  Manche {gameState.roundNumber || 1} / {gameState.rounds?.length || 1}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {(gameState.rounds || []).map((round, idx) => (
                  <span
                    key={round.id}
                    className={clsx(
                      'px-3 py-1 rounded-full border',
                      idx + 1 === (gameState.roundNumber || 1)
                        ? 'bg-indigo-600/30 border-indigo-400/40 text-indigo-200'
                        : 'bg-zinc-950 border-white/10 text-zinc-400',
                    )}
                  >
                    {round.name}
                  </span>
                ))}
              </div>
              {hostRole === 'owner' && (
                <div className="flex flex-col md:flex-row gap-2">
                  <select
                    value={selectedRoundPlaylistId}
                    onChange={(e) => setSelectedRoundPlaylistId(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Ajouter une playlist comme nouvelle manche...</option>
                    {availablePlaylists.map((playlist) => (
                      <option key={playlist.id} value={playlist.id}>
                        {playlist.name} ({playlist.tracks.length} pistes)
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAppendRoundPlaylist}
                    disabled={!selectedRoundPlaylistId || roundBusy}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm"
                  >
                    {roundBusy ? 'Ajout...' : 'Ajouter la manche'}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5 app-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-400" />
                Buzzer ESP32
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
                      <div className="md:w-52">
                        <p className="font-medium">{player.name}</p>
                        <p className="text-xs text-zinc-500">
                          {deviceId ? `Assigné: ${deviceId}` : 'Aucun buzzer assigné'}
                        </p>
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
                          <button
                            onClick={() => handleAssignDevice(player.id)}
                            className="bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg text-sm"
                          >
                            Assigner
                          </button>
                        </div>
                      )}
                      {deviceInfo && (
                        <div className="text-xs text-zinc-400 md:text-right space-y-1">
                          <p className={deviceInfo.status === 'online' ? 'text-emerald-400' : 'text-zinc-500'}>
                            {deviceInfo.status === 'online' ? 'En ligne' : 'Hors ligne'}
                          </p>
                          <p>Dernier ping: {new Date(deviceInfo.lastSeenAt).toLocaleTimeString('fr-FR')}</p>
                          {typeof deviceInfo.rssi === 'number' && <p>RSSI: {deviceInfo.rssi} dBm</p>}
                          <p>
                            HP: {deviceInfo.speakerEnabled === false ? 'Désactivé' : deviceInfo.speakerMuted ? 'Muté' : 'Actif'}
                          </p>
                        </div>
                      )}
                    </div>
                    {deviceInfo && hostRole === 'owner' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleToggleDeviceSpeakerEnabled(deviceId, !(deviceInfo.speakerEnabled ?? true))}
                          className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-xs"
                        >
                          {(deviceInfo.speakerEnabled ?? true) ? 'Désactiver HP' : 'Activer HP'}
                        </button>
                        <button
                          onClick={() => handleToggleDeviceMute(deviceId, !(deviceInfo.speakerMuted ?? false))}
                          className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-xs"
                          disabled={deviceInfo.speakerEnabled === false}
                        >
                          {(deviceInfo.speakerMuted ?? false) ? 'Unmute' : 'Mute'}
                        </button>
                        <button
                          onClick={() => handleTestDeviceSpeaker(deviceId)}
                          className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg text-xs"
                          disabled={deviceInfo.speakerEnabled === false || (deviceInfo.speakerMuted ?? false)}
                        >
                          Tester HP
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {!hasQuizStarted ? (
            <div className="bg-zinc-900 p-8 rounded-2xl border border-white/5 app-card">
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2">Préparation</p>
              <h2 className="text-2xl font-bold mb-2">Contrôle des participants</h2>
              <p className="text-zinc-400 mb-6">
                Tu es en phase lobby. Organise les joueurs et les équipes, puis lance le quiz.
              </p>
              <button
                onClick={handleStartTrack}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl flex items-center justify-center gap-3 font-semibold text-lg transition-colors"
              >
                <Play className="w-6 h-6" />
                {isYoutubeMode ? 'Démarrer le quiz YouTube' : 'Start le quiz'}
              </button>
            </div>
          ) : (
          /* Current Track Info */
          <div className="bg-zinc-900 p-8 rounded-2xl border border-white/5 relative overflow-hidden app-card">
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
                    {isYoutubeTrack && (
                      <div className="w-full aspect-video rounded-xl overflow-hidden bg-black mt-6 border border-white/10">
                        <YouTube
                          videoId={currentTrack?.mediaUrl ? extractYoutubeId(currentTrack.mediaUrl) : undefined}
                          opts={{
                            width: '100%',
                            height: '100%',
                            playerVars: {
                              autoplay: 1,
                              controls: 1,
                              start: currentTrack?.startTime || 0,
                            },
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
                    {gameState.enableBonuses ? 'Bonne réponse (Bonus)' : 'Bonne réponse'}
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
          )}

          {!isYoutubeMode && hasQuizStarted && (
            <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5 app-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">File des musiques</h2>
                <p className="text-xs text-zinc-400">
                  Edition temps réel : ajouter, modifier, supprimer et réordonner les questions.
                </p>
              </div>
              {hostRole === 'owner' && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {!draftMode ? (
                    <button
                      onClick={initDraftMode}
                      className="bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg text-sm"
                    >
                      Mode brouillon (édition avancée)
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={publishDraftTracks}
                        className="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg text-sm"
                      >
                        Publier les modifications
                      </button>
                      <button
                        onClick={cancelDraftMode}
                        className="bg-zinc-700 hover:bg-zinc-600 px-3 py-2 rounded-lg text-sm"
                      >
                        Annuler
                      </button>
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
                      className="w-24 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={handleAddTrack}
                      className="bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg text-sm whitespace-nowrap"
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              )}
              {draftMode ? (
                <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
                    Tu édites les questions à venir en brouillon. Rien n'est diffusé avant "Publier les modifications".
                  </div>
                  {draftUpcomingTracks.map((track, index) => (
                    <div key={`draft-${index}`} className="rounded-xl border border-white/10 bg-zinc-950 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-500">Question à venir #{gameState.currentTrackIndex + 2 + index}</p>
                        <button
                          onClick={() => removeDraftTrack(index)}
                          className="bg-red-600 hover:bg-red-500 p-1.5 rounded"
                          title="Supprimer de ce brouillon"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input value={track.title} onChange={(e) => updateDraftTrackField(index, 'title', e.target.value)} placeholder="Titre" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                        <input value={track.artist} onChange={(e) => updateDraftTrackField(index, 'artist', e.target.value)} placeholder="Artiste" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                        <input type="number" min={1} max={300} value={track.duration} onChange={(e) => updateDraftTrackField(index, 'duration', e.target.value)} placeholder="Durée" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input value={track.mediaType} onChange={(e) => updateDraftTrackField(index, 'mediaType', e.target.value)} placeholder="mediaType (audio/video/text...)" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                        <input value={track.mediaUrl} onChange={(e) => updateDraftTrackField(index, 'mediaUrl', e.target.value)} placeholder="mediaUrl" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                        <input value={track.url} onChange={(e) => updateDraftTrackField(index, 'url', e.target.value)} placeholder="url legacy" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input type="number" min={0} value={track.startTime} onChange={(e) => updateDraftTrackField(index, 'startTime', e.target.value)} placeholder="startTime (s)" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                        <input value={track.textContent} onChange={(e) => updateDraftTrackField(index, 'textContent', e.target.value)} placeholder="textContent (indice/texte)" className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm" />
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addDraftTrack}
                    className="w-full bg-indigo-600/80 hover:bg-indigo-500 px-3 py-2 rounded-lg text-sm"
                  >
                    Ajouter une question au brouillon
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
                      onDragOver={(event) => handleDragOverTrack(index, event)}
                      onDrop={() => handleDropTrack(index)}
                      onDragEnd={() => {
                        setDraggedTrackIndex(null);
                        setDragOverTrackIndex(null);
                      }}
                      className={clsx(
                        'rounded-xl border px-3 py-2 flex items-center justify-between gap-3',
                        isCurrent
                          ? 'border-indigo-500/40 bg-indigo-500/10'
                          : index > gameState.currentTrackIndex
                            ? 'border-white/10 bg-zinc-950'
                            : 'border-white/5 bg-zinc-950/40 opacity-70',
                        isUpcoming && 'cursor-move',
                        isDropTarget && 'ring-2 ring-indigo-400/80',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-zinc-500 mb-1">#{index + 1} {isCurrent ? '• En cours' : index > gameState.currentTrackIndex ? '• À venir' : '• Déjà joué'}</p>
                        {canEditTrack ? (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input
                              value={draft.title}
                              onChange={(e) => setTrackDraftField(track.id, 'title', e.target.value)}
                              className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm"
                              placeholder="Titre"
                            />
                            <input
                              value={draft.artist}
                              onChange={(e) => setTrackDraftField(track.id, 'artist', e.target.value)}
                              className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm"
                              placeholder="Artiste"
                            />
                            <input
                              type="number"
                              min={1}
                              max={300}
                              value={draft.duration}
                              onChange={(e) => setTrackDraftField(track.id, 'duration', e.target.value)}
                              className="bg-zinc-900 border border-white/10 rounded px-2 py-1 text-sm"
                              placeholder="Durée"
                            />
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-medium truncate">{track.title || 'Titre masqué'}</p>
                            <p className="text-xs text-zinc-400 truncate">{track.artist || 'Artiste inconnu'}</p>
                          </>
                        )}
                      </div>
                      {(index > gameState.currentTrackIndex && gameState.status !== 'finished') && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleReorderTrack(index, index - 1)}
                            disabled={index === gameState.currentTrackIndex + 1}
                            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed p-2 rounded-lg"
                            title="Monter"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleReorderTrack(index, index + 1)}
                            disabled={index >= gameState.playlist.length - 1}
                            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed p-2 rounded-lg"
                            title="Descendre"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          {canEditTrack && (
                            <>
                              <button
                                onClick={() => handleSaveTrack(index, track)}
                                className="bg-emerald-600 hover:bg-emerald-500 p-2 rounded-lg"
                                title="Enregistrer la modification"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTrack(index)}
                                className="bg-red-600 hover:bg-red-500 p-2 rounded-lg"
                                title="Supprimer la question"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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

          {/* Buzzed Player Alert */}
          {hasQuizStarted && gameState.status === 'paused' && buzzedPlayer && (
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
        <div className="bg-zinc-900 p-6 rounded-2xl border border-white/5 h-fit app-card">
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

              {hostRole === 'owner' && (
                <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-zinc-950 p-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Gérer les équipes</p>
                  <div className="flex flex-wrap gap-2">
                    {(gameState.teamConfig || []).map((team) => (
                      <div key={team.id} className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                        <span className="text-xs">{team.name}</span>
                        <button
                          onClick={() => handleRemoveTeam(team.id)}
                          className="text-zinc-500 hover:text-red-400"
                          title="Supprimer l'équipe"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={teamDraftName}
                      onChange={(e) => setTeamDraftName(e.target.value)}
                      placeholder="Nom équipe"
                      className="flex-1 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs"
                    />
                    <input
                      type="color"
                      value={teamDraftColor}
                      onChange={(e) => setTeamDraftColor(e.target.value)}
                      className="h-8 w-10 bg-zinc-900 border border-white/10 rounded cursor-pointer"
                      title="Couleur équipe"
                    />
                    <button
                      onClick={handleAddTeam}
                      className="bg-indigo-600 hover:bg-indigo-500 rounded px-2 py-1 text-xs flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Ajouter
                    </button>
                  </div>
                </div>
              )}
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
                    {gameState.isTeamMode && hostRole === 'owner' && (
                      <select
                        value={player.team || ''}
                        onChange={(e) => handleAssignPlayerTeam(player.id, e.target.value)}
                        className="mt-1 bg-zinc-900 border border-white/10 rounded px-2 py-1 text-xs"
                      >
                        <option value="">Aucune équipe</option>
                        {(gameState.teamConfig || []).filter((team) => team.enabled).map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
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

          <div className="mt-8 border-t border-white/10 pt-6">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Historique & analytics</h3>
            <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
              <div className="bg-zinc-950 border border-white/5 rounded-lg p-3">
                <p className="text-zinc-500">Buzz totaux</p>
                <p className="text-lg font-bold">{totalBuzzes}</p>
              </div>
              <div className="bg-zinc-950 border border-white/5 rounded-lg p-3">
                <p className="text-zinc-500">Taux de buzz réussi</p>
                <p className="text-lg font-bold">{buzzRate}%</p>
              </div>
              <div className="bg-zinc-950 border border-white/5 rounded-lg p-3">
                <p className="text-zinc-500">Bonnes réponses</p>
                <p className="text-lg font-bold">{totalCorrect}</p>
              </div>
              <div className="bg-zinc-950 border border-white/5 rounded-lg p-3">
                <p className="text-zinc-500">Erreurs</p>
                <p className="text-lg font-bold">{totalWrong}</p>
              </div>
            </div>
            {topMissedPlayers.length > 0 && (
              <div className="mb-4 bg-zinc-950 border border-white/5 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-2">Top ratés</p>
                <div className="space-y-1">
                  {topMissedPlayers.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-300">{entry.name}</span>
                      <span className="text-zinc-400">{entry.wrong} erreur(s)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Logs live admin</h3>
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {eventLogs.length === 0 && <p className="text-xs text-zinc-500">Pas encore d'événement.</p>}
              {eventLogs.map((entry, idx) => (
                <div key={`${entry.ts}-${idx}`} className="text-xs bg-zinc-950 border border-white/5 rounded-lg px-3 py-2">
                  <span className="text-zinc-500 mr-2">{new Date(entry.ts).toLocaleTimeString('fr-FR')}</span>
                  <span className="text-zinc-200">{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
