import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { socket } from '../lib/socket';
import { Playlist, Track, MediaType } from '../types';
import { ArrowLeft, Plus, Trash2, Save, Upload, Music, Video, Image as ImageIcon, Type, Youtube, Mic, Link, ArrowUp, ArrowDown, Copy } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const MEDIA_TYPE_OPTIONS: { value: MediaType; label: string; icon: React.ReactNode; accept?: string }[] = [
  { value: 'audio', label: 'Audio', icon: <Music className="w-4 h-4" />, accept: 'audio/*' },
  { value: 'video', label: 'Vidéo', icon: <Video className="w-4 h-4" />, accept: 'video/*' },
  { value: 'image', label: 'Image', icon: <ImageIcon className="w-4 h-4" />, accept: 'image/*' },
  { value: 'voice', label: 'Voix', icon: <Mic className="w-4 h-4" />, accept: 'audio/*' },
  { value: 'youtube', label: 'YouTube', icon: <Youtube className="w-4 h-4" /> },
  { value: 'text', label: 'Texte', icon: <Type className="w-4 h-4" /> },
  { value: 'url', label: 'URL', icon: <Link className="w-4 h-4" /> },
];

function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

function toYouTubeEmbed(url: string): string {
  const id = extractYoutubeId(url) || url;
  return `https://www.youtube.com/embed/${id}?autoplay=1`;
}

export default function EditPlaylist() {
  const { user, loading: authLoading } = useAuth();
  const { error: toastError, warning: toastWarning, success: toastSuccess, info: toastInfo } = useToast();
  const { playlistId } = useParams<{ playlistId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [recordingTrackId, setRecordingTrackId] = useState<string | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeAccept, setActiveAccept] = useState<string>('*');
  const [activeUploadTarget, setActiveUploadTarget] = useState<'media' | 'answer'>('media');
  const [defaultDuration, setDefaultDuration] = useState<number>(30);
  const [defaultQuestionType, setDefaultQuestionType] = useState<MediaType>('audio');
  const [defaultImageRevealMode, setDefaultImageRevealMode] = useState<'none' | 'blur'>('none');
  const [defaultImageRevealDuration, setDefaultImageRevealDuration] = useState<number>(15);
  const [duplicateKeys, setDuplicateKeys] = useState<Set<string>>(new Set());
  const [localPreviewUrls, setLocalPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef<Record<string, string>>({});
  const collabToken = searchParams.get('collab') || '';
  const [activeCollabToken, setActiveCollabToken] = useState(collabToken);
  const [collabLink, setCollabLink] = useState('');
  const [collabPermission, setCollabPermission] = useState<'view' | 'edit'>('edit');
  const [newCollabPermission, setNewCollabPermission] = useState<'view' | 'edit'>('edit');
  const [newCollabExpiryHours, setNewCollabExpiryHours] = useState<number>(24);
  const [collabTokens, setCollabTokens] = useState<Array<{ token: string; created_at: number; expires_at: number; permission: 'view' | 'edit'; revoked_at?: number | null }>>([]);
  const [collabHistoryFilter, setCollabHistoryFilter] = useState<'all' | 'active' | 'expired' | 'revoked'>('all');
  const [collabSort, setCollabSort] = useState<'newest' | 'oldest'>('newest');
  const [bulkRevoking, setBulkRevoking] = useState(false);
  const [collabEditorsCount, setCollabEditorsCount] = useState(1);
  const [youtubePreviewSeedByTrack, setYoutubePreviewSeedByTrack] = useState<Record<string, number>>({});
  const saveDebounceRef = useRef<number | null>(null);
  const isApplyingRemoteRef = useRef(false);

  const toPlaylistObj = (row: any): Playlist => {
    let tracks: Track[] = [];
    if (typeof row.tracks === 'string') {
      try { tracks = JSON.parse(row.tracks); } catch { tracks = []; }
    } else if (Array.isArray(row.tracks)) {
      tracks = row.tracks as Track[];
    }
    return {
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      tracks,
      createdAt: row.created_at,
      visibility: row.visibility || 'private',
      category: row.category || 'general',
    };
  };

  useEffect(() => {
    setActiveCollabToken(collabToken);
  }, [collabToken]);

  useEffect(() => {
    const fetchPlaylist = async () => {
      if (!playlistId) return;
      if (authLoading) return;
      if (!user) { navigate('/'); return; }
      try {
        const result = activeCollabToken
          ? await api.playlists.getWithCollab(playlistId, activeCollabToken)
          : await api.playlists.get(playlistId);
        const data = result.playlist;
        if (!data) { navigate('/playlists'); return; }
        const parsed = toPlaylistObj(data);
        setCollabPermission((result as any).permission === 'view' ? 'view' : 'edit');
        if (parsed.ownerId !== user.id && !activeCollabToken) { navigate('/playlists'); return; }
        setPlaylist(parsed);
      } catch (error) {
        console.error("Error fetching playlist:", error);
        navigate('/playlists');
      } finally {
        setLoading(false);
      }
    };
    fetchPlaylist();
  }, [playlistId, navigate, user, authLoading, activeCollabToken]);

  useEffect(() => {
    if (!playlistId || !activeCollabToken) return;
    socket.emit('playlist:join', { playlistId, collabToken: activeCollabToken }, (res: any) => {
      if (!res?.success) {
        toastError(res?.error || 'Impossible de rejoindre la coédition');
        return;
      }
      if (res.playlist) {
        isApplyingRemoteRef.current = true;
        setPlaylist(toPlaylistObj(res.playlist));
      }
    });
    const onPlaylistState = (payload: any) => {
      if (!payload?.playlist || payload.playlist.id !== playlistId) return;
      isApplyingRemoteRef.current = true;
      setPlaylist(toPlaylistObj(payload.playlist));
      toastInfo('Modification reçue en temps réel');
    };
    const onPlaylistPresence = (payload: any) => {
      if (!payload || payload.playlistId !== playlistId) return;
      setCollabEditorsCount(Number(payload.count || 1));
    };
    socket.on('playlist:state', onPlaylistState);
    socket.on('playlist:presence', onPlaylistPresence);
    return () => {
      socket.off('playlist:state', onPlaylistState);
      socket.off('playlist:presence', onPlaylistPresence);
    };
  }, [playlistId, activeCollabToken, toastError, toastInfo]);

  useEffect(() => {
    if (!playlist || !playlistId || !activeCollabToken) return;
    if (isApplyingRemoteRef.current) {
      isApplyingRemoteRef.current = false;
      return;
    }
    if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = window.setTimeout(() => {
      socket.emit(
        'playlist:update',
        {
          playlistId,
          collabToken: activeCollabToken,
          data: {
            name: playlist.name,
            category: playlist.category || 'general',
            tracks: playlist.tracks,
          },
        },
        () => {},
      );
    }, 350);
    return () => {
      if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    };
  }, [playlist, playlistId, activeCollabToken]);

  useEffect(() => {
    if (!playlist) return;
    const counter = new Map<string, number>();
    playlist.tracks.forEach((t) => {
      const key = `${(t.title || '').trim().toLowerCase()}::${(t.artist || '').trim().toLowerCase()}`;
      if (key !== "::") counter.set(key, (counter.get(key) || 0) + 1);
    });
    const duplicates = new Set<string>();
    counter.forEach((count, key) => { if (count > 1) duplicates.add(key); });
    setDuplicateKeys(duplicates);
  }, [playlist]);

  useEffect(() => { previewUrlsRef.current = localPreviewUrls; }, [localPreviewUrls]);
  useEffect(() => {
    return () => {
      (Object.values(previewUrlsRef.current) as string[]).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleSave = async () => {
    if (!playlist || !playlistId) return;
    if (activeCollabToken && collabPermission === 'view') {
      toastWarning('Lien en lecture seule: sauvegarde non autorisée.');
      return;
    }
    setSaving(true);
    try {
      if (activeCollabToken) {
        await api.playlists.updateWithCollab(playlistId, activeCollabToken, {
          name: playlist.name,
          tracks: playlist.tracks,
          category: playlist.category || 'general',
        });
      } else {
        await api.playlists.update(playlistId, {
          name: playlist.name,
          tracks: playlist.tracks,
          category: playlist.category || 'general',
        });
      }
      toastSuccess('Playlist sauvegardée');
      navigate('/playlists');
    } catch (error) {
      console.error("Error saving playlist:", error);
      toastError("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCollabLink = async () => {
    if (!playlistId) return;
    try {
      const token = activeCollabToken || (await api.playlists.createCollabTokenWithOptions(playlistId, {
        permission: newCollabPermission,
        expiresHours: newCollabExpiryHours,
      })).token;
      const link = `${window.location.origin}/admin/playlist/${playlistId}?collab=${encodeURIComponent(token)}`;
      setCollabLink(link);
      setActiveCollabToken(token);
      await navigator.clipboard.writeText(link);
      toastSuccess('Lien de coédition copié');
    } catch (error: any) {
      toastError(error?.message || 'Impossible de créer le lien de coédition');
    }
  };

  const refreshCollabTokens = useCallback(async () => {
    if (!playlistId || activeCollabToken) return;
    try {
      const res = await api.playlists.listCollabTokens(playlistId);
      setCollabTokens((res.tokens || []) as any);
    } catch {
      // ignore
    }
  }, [playlistId, activeCollabToken]);

  const handleRevokeToken = async (token: string) => {
    if (!playlistId) return;
    try {
      await api.playlists.revokeCollabToken(playlistId, token);
      toastSuccess('Lien révoqué');
      await refreshCollabTokens();
    } catch {
      toastError('Impossible de révoquer ce lien');
    }
  };

  const handleCopyExistingLink = async (token: string) => {
    if (!playlistId) return;
    const link = `${window.location.origin}/admin/playlist/${playlistId}?collab=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(link);
      toastSuccess('Lien copié');
    } catch {
      toastError('Impossible de copier le lien');
    }
  };

  const handleRevokeAllActiveLinks = async () => {
    if (!playlistId) return;
    const activeTokens = collabTokens.filter((entry) => !entry.revoked_at && entry.expires_at > Date.now());
    if (activeTokens.length === 0) {
      toastInfo('Aucun lien actif à révoquer.');
      return;
    }
    if (!window.confirm(`Révoquer ${activeTokens.length} lien(s) actif(s) ?`)) return;
    setBulkRevoking(true);
    try {
      await Promise.all(activeTokens.map((entry) => api.playlists.revokeCollabToken(playlistId, entry.token)));
      toastSuccess(`${activeTokens.length} lien(s) révoqué(s).`);
      await refreshCollabTokens();
    } catch {
      toastError('Impossible de révoquer tous les liens.');
    } finally {
      setBulkRevoking(false);
    }
  };

  useEffect(() => {
    void refreshCollabTokens();
  }, [refreshCollabTokens]);

  const addTrack = () => {
    if (!playlist) return;
    const nextTrackDefaults: Partial<Track> =
      defaultQuestionType === 'image'
        ? {
            imageRevealMode: defaultImageRevealMode,
            imageRevealDuration: defaultImageRevealDuration,
          }
        : {};
    const newTrack: Track = {
      id: uuidv4(),
      title: '',
      artist: '',
      mediaType: defaultQuestionType,
      duration: defaultDuration,
      startTime: 0,
      ...nextTrackDefaults,
    };
    setPlaylist({ ...playlist, tracks: [...playlist.tracks, newTrack] });
  };

  const applyDefaultsToAllTracks = () => {
    if (!playlist || playlist.tracks.length === 0) return;
    const nextTracks = playlist.tracks.map((track) => {
      const base: Track = {
        ...track,
        mediaType: defaultQuestionType,
        duration: defaultDuration,
      };
      if (defaultQuestionType === 'image') {
        return {
          ...base,
          imageRevealMode: defaultImageRevealMode,
          imageRevealDuration: defaultImageRevealDuration,
        };
      }
      return {
        ...base,
        imageRevealMode: track.imageRevealMode,
        imageRevealDuration: track.imageRevealDuration,
      };
    });
    setPlaylist({ ...playlist, tracks: nextTracks });
    toastSuccess('Configuration par défaut appliquée à toutes les questions');
  };

  const removeTrack = (trackId: string) => {
    if (!playlist) return;
    setPlaylist({ ...playlist, tracks: playlist.tracks.filter(t => t.id !== trackId) });
  };

  const updateTrack = (trackId: string, updates: Partial<Track>) => {
    if (!playlist) return;
    setPlaylist({ ...playlist, tracks: playlist.tracks.map(t => t.id === trackId ? { ...t, ...updates } : t) });
  };

  const moveTrack = (fromIndex: number, toIndex: number) => {
    if (!playlist) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= playlist.tracks.length || toIndex >= playlist.tracks.length) return;
    if (fromIndex === toIndex) return;
    const nextTracks = [...playlist.tracks];
    const [moved] = nextTracks.splice(fromIndex, 1);
    nextTracks.splice(toIndex, 0, moved);
    setPlaylist({ ...playlist, tracks: nextTracks });
  };

  const uploadFile = async (file: File, trackId: string, target: 'media' | 'answer' = 'media') => {
    if (!playlistId || !user) {
      toastWarning("Vous devez être connecté pour uploader un fichier.");
      return;
    }
    const previewKey = `${trackId}:${target}`;
    const progressKey = `${trackId}:${target}`;

    try {
      const previewUrl = URL.createObjectURL(file);
      // Store blob URL locally ONLY — never push it into the shared track state
      // so co-editors never receive a blob: URL they can't access.
      setLocalPreviewUrls((prev) => {
        if (prev[previewKey]) URL.revokeObjectURL(prev[previewKey]);
        return { ...prev, [previewKey]: previewUrl };
      });

      setUploadProgress(prev => ({ ...prev, [progressKey]: 10 }));
      const { url } = await api.playlists.upload(playlistId, file);
      setUploadProgress(prev => ({ ...prev, [progressKey]: 100 }));
      // Only now update the shared track state with the real server URL
      if (target === 'answer') {
        updateTrack(trackId, { answerImageUrl: url });
      } else {
        updateTrack(trackId, { mediaUrl: url, url });
      }
      setLocalPreviewUrls((prev) => {
        if (prev[previewKey]) URL.revokeObjectURL(prev[previewKey]);
        const copy = { ...prev };
        delete copy[previewKey];
        return copy;
      });
      setTimeout(() => setUploadProgress(prev => { const n = { ...prev }; delete n[progressKey]; return n; }), 1500);
    } catch (error) {
      console.error("Upload error:", error);
      toastError("Erreur lors de l'upload du fichier.");
      setUploadProgress(prev => { const n = { ...prev }; delete n[progressKey]; return n; });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeTrackId) void uploadFile(file, activeTrackId, activeUploadTarget);
    e.target.value = '';
  };

  const triggerFileInput = (trackId: string, accept: string, target: 'media' | 'answer' = 'media') => {
    setActiveTrackId(trackId);
    setActiveAccept(accept);
    setActiveUploadTarget(target);
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  const playPreviewFromTiming = (track: Track) => {
    const media = document.getElementById(`preview-media-${track.id}`) as HTMLMediaElement | null;
    if (!media) return;
    try {
      media.currentTime = Math.max(0, track.startTime ?? 0);
    } catch {
      // Ignore if media metadata is not ready yet.
    }
    media.play().catch(() => {});
  };

  const testYoutubePreviewFromTiming = (trackId: string) => {
    setYoutubePreviewSeedByTrack((prev) => ({ ...prev, [trackId]: Date.now() }));
  };

  const startRecording = async (trackId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], `voice_${trackId}.webm`, { type: 'audio/webm' });
        updateTrack(trackId, { mediaType: 'voice' });
        await uploadFile(file, trackId);
        setRecordingTrackId(null);
        setMediaRecorder(null);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecordingTrackId(trackId);
    } catch {
      toastError("Impossible d'accéder au microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
    }
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement...</div>;
  if (!playlist) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Playlist introuvable</div>;
  const collabStatusCounters = collabTokens.reduce(
    (acc, entry) => {
      const isRevoked = !!entry.revoked_at;
      const isExpired = entry.expires_at <= Date.now();
      if (isRevoked) acc.revoked += 1;
      else if (isExpired) acc.expired += 1;
      else acc.active += 1;
      acc.all += 1;
      return acc;
    },
    { all: 0, active: 0, expired: 0, revoked: 0 },
  );

  const filteredCollabTokens = collabTokens.filter((entry) => {
    const isRevoked = !!entry.revoked_at;
    const isExpired = entry.expires_at <= Date.now();
    if (collabHistoryFilter === 'all') return true;
    if (collabHistoryFilter === 'revoked') return isRevoked;
    if (collabHistoryFilter === 'expired') return !isRevoked && isExpired;
    if (collabHistoryFilter === 'active') return !isRevoked && !isExpired;
    return true;
  }).sort((a, b) => (collabSort === 'newest' ? b.created_at - a.created_at : a.created_at - b.created_at));

  return (
    <div className="min-h-screen bg-zinc-950 text-white app-shell">
      {/* Breadcrumb header */}
      <header className="sticky top-0 z-20 bg-zinc-950/90 backdrop-blur border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/playlists')} className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Mes playlists
          </button>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-200 text-sm font-medium truncate max-w-xs">{playlist.name || 'Sans titre'}</span>
          {collabEditorsCount > 1 && (
            <span className="text-xs bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full">
              {collabEditorsCount} éditeurs en ligne
            </span>
          )}
          {activeCollabToken && collabPermission === 'view' && (
            <span className="text-xs bg-amber-600/20 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded-full">
              Lecture seule
            </span>
          )}
        </div>
        <button
          onClick={() => void handleSave()}
          disabled={saving || (activeCollabToken && collabPermission === 'view')}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Nom + catégorie */}
        <div className="flex items-center gap-4 mb-6">
          <input
            type="text"
            value={playlist.name}
            onChange={(e) => setPlaylist({ ...playlist, name: e.target.value })}
            className="bg-transparent text-2xl font-bold focus:outline-none border-b-2 border-transparent focus:border-indigo-500 flex-1 min-w-0 transition-colors"
            placeholder="Nom de la playlist"
          />
            <input
              type="text"
              value={playlist.category || 'general'}
              onChange={(e) => setPlaylist({ ...playlist, category: e.target.value })}
              className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm w-36"
              placeholder="Catégorie"
            />
          </div>

        {/* Actions row */}
        <div className="flex items-center gap-3 mb-6">
          {playlist.ownerId === user?.id && (
            <>
              <select
                value={newCollabPermission}
                onChange={(e) => setNewCollabPermission(e.target.value as 'view' | 'edit')}
                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm"
              >
                <option value="edit">Lien édition</option>
                <option value="view">Lien lecture seule</option>
              </select>
              <select
                value={newCollabExpiryHours}
                onChange={(e) => setNewCollabExpiryHours(Math.max(1, Number(e.target.value) || 24))}
                className="bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-sm"
              >
                <option value={6}>Expire dans 6h</option>
                <option value={24}>Expire dans 24h</option>
                <option value={72}>Expire dans 3 jours</option>
                <option value={168}>Expire dans 7 jours</option>
              </select>
              <button onClick={handleCreateCollabLink} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 border border-white/10 hover:border-white/20 rounded-xl px-3 py-2 transition-colors">
                <Link className="w-3.5 h-3.5" />
                Créer lien
              </button>
            </>
          )}
        </div>

        {collabLink && (
          <div className="mb-6 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-200 break-all">
            Lien copié : {collabLink}
          </div>
        )}
        {activeCollabToken && (
          <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            Coédition active ({collabPermission === 'view' ? 'lecture seule' : 'édition'}) · {collabEditorsCount} éditeur(s) connecté(s)
          </div>
        )}
        {playlist.ownerId === user?.id && collabTokens.length > 0 && (
          <div className="mb-6 rounded-xl border border-white/10 bg-zinc-900/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Historique des liens</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-zinc-500">
                  Tous {collabStatusCounters.all} · Actifs {collabStatusCounters.active} · Expirés {collabStatusCounters.expired} · Révoqués {collabStatusCounters.revoked}
                </span>
                <select
                  value={collabHistoryFilter}
                  onChange={(e) => setCollabHistoryFilter(e.target.value as 'all' | 'active' | 'expired' | 'revoked')}
                  className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-xs"
                >
                  <option value="all">Tous</option>
                  <option value="active">Actifs</option>
                  <option value="expired">Expirés</option>
                  <option value="revoked">Révoqués</option>
                </select>
                <select
                  value={collabSort}
                  onChange={(e) => setCollabSort(e.target.value as 'newest' | 'oldest')}
                  className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-xs"
                >
                  <option value="newest">Plus récent</option>
                  <option value="oldest">Plus ancien</option>
                </select>
                <button
                  onClick={() => void handleRevokeAllActiveLinks()}
                  disabled={bulkRevoking || collabStatusCounters.active === 0}
                  className="text-red-300 hover:text-red-200 border border-red-500/30 rounded px-2 py-1 text-xs disabled:opacity-50"
                >
                  {bulkRevoking ? 'Révocation…' : 'Révoquer tous les actifs'}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {filteredCollabTokens.map((entry) => {
                const isRevoked = !!entry.revoked_at;
                const isExpired = entry.expires_at <= Date.now();
                return (
                <div key={`${entry.token}-${entry.created_at}`} className="flex items-center justify-between gap-3 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="text-zinc-300 truncate">
                      {entry.permission === 'view' ? 'Lecture' : 'Edition'} · expire le {new Date(entry.expires_at).toLocaleString('fr-FR')}
                    </p>
                    <p className="text-zinc-500 truncate">…{entry.token.slice(-12)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isRevoked && (
                      <button
                        onClick={() => void handleCopyExistingLink(entry.token)}
                        className="text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 rounded px-2 py-1 inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        Copier
                      </button>
                    )}
                    {!isRevoked && !isExpired ? (
                      <button
                        onClick={() => void handleRevokeToken(entry.token)}
                        className="text-red-300 hover:text-red-200 border border-red-500/30 rounded px-2 py-1"
                      >
                        Révoquer
                      </button>
                    ) : (
                      <span className="text-zinc-500">{isRevoked ? 'Révoqué' : 'Expiré'}</span>
                    )}
                  </div>
                </div>
              );})}
            </div>
          </div>
        )}

        <div className="mb-6 rounded-xl border border-white/10 bg-zinc-900/50 p-4 app-card">
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Préconfiguration des questions</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <label className="text-xs text-zinc-400">
              Type
              <select
                value={defaultQuestionType}
                onChange={(e) => setDefaultQuestionType(e.target.value as MediaType)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white"
              >
                {MEDIA_TYPE_OPTIONS.map((opt) => (
                  <option key={`panel-${opt.value}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Durée (s)
              <input
                type="number"
                min={5}
                max={300}
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(parseInt(e.target.value, 10) || 30)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Révélation image
              <select
                value={defaultImageRevealMode}
                onChange={(e) => setDefaultImageRevealMode(e.target.value as 'none' | 'blur')}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white"
                disabled={defaultQuestionType !== 'image'}
              >
                <option value="none">Immédiate</option>
                <option value="blur">Progressive blur</option>
              </select>
            </label>
            <label className="text-xs text-zinc-400">
              Durée révélation
              <input
                type="number"
                min={1}
                max={300}
                value={defaultImageRevealDuration}
                onChange={(e) => setDefaultImageRevealDuration(parseInt(e.target.value, 10) || 15)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-white"
                disabled={defaultQuestionType !== 'image'}
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={applyDefaultsToAllTracks}
                disabled={playlist.tracks.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg px-3 py-2 text-sm"
              >
                Appliquer à toutes
              </button>
            </div>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Les nouvelles questions utilisent cette configuration automatiquement.
          </p>
        </div>

        {/* Pistes */}
        <div className="space-y-4 mb-6">
          {playlist.tracks.map((track, index) => {
            const dedupeKey = `${(track.title || '').trim().toLowerCase()}::${(track.artist || '').trim().toLowerCase()}`;
            const isDuplicate = duplicateKeys.has(dedupeKey) && dedupeKey !== "::";
            const mediaOption = MEDIA_TYPE_OPTIONS.find(o => o.value === track.mediaType);
            // sourceUrl is used for text inputs — never shows a blob URL
            const sourceUrl = track.mediaUrl || track.url || '';
            // previewSrc includes the local blob URL so the uploader sees a preview immediately
            const previewSrc = localPreviewUrls[`${track.id}:media`] || sourceUrl;
            const answerPreviewSrc = localPreviewUrls[`${track.id}:answer`] || (track.answerImageUrl || '');

            return (
              <div key={track.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 group app-card">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-zinc-400">
                    {index + 1}
                  </div>

                  <div className="flex-1 space-y-3">
                    {/* Titre + Artiste */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Titre de l'œuvre *</label>
                        <input
                          type="text"
                          value={track.title}
                          onChange={(e) => updateTrack(track.id, { title: e.target.value })}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                          placeholder="Ex: La Vie en Rose, Star Wars, ..."
                        />
                        {isDuplicate && <p className="text-xs text-amber-400 mt-1">Doublon détecté</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Artiste / Film / Série</label>
                        <input
                          type="text"
                          value={track.artist}
                          onChange={(e) => updateTrack(track.id, { artist: e.target.value })}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                          placeholder="Ex: Édith Piaf, John Williams, ..."
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-zinc-400">
                        Image de réponse (grand écran, optionnelle)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={track.answerImageUrl || ''}
                          onChange={(e) => updateTrack(track.id, { answerImageUrl: e.target.value })}
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                          placeholder="URL image de la réponse (optionnel)"
                        />
                        <button
                          type="button"
                          onClick={() => triggerFileInput(track.id, 'image/*', 'answer')}
                          className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
                        >
                          <Upload className="w-4 h-4" />
                          Upload réponse
                        </button>
                        {uploadProgress[`${track.id}:answer`] !== undefined && (
                          <span className="text-xs text-indigo-400">
                            {uploadProgress[`${track.id}:answer`] === 100 ? 'Terminé!' : `${uploadProgress[`${track.id}:answer`]}%`}
                          </span>
                        )}
                      </div>
                      {answerPreviewSrc && (
                        <img
                          src={answerPreviewSrc}
                          alt="Réponse"
                          className="max-h-32 rounded-lg border border-zinc-700"
                        />
                      )}
                    </div>

                    {/* Type de média + Durée */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Type de média</label>
                        <div className="flex flex-wrap gap-1.5">
                          {MEDIA_TYPE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateTrack(track.id, { mediaType: opt.value })}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                                track.mediaType === opt.value
                                  ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-300'
                                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                              }`}
                            >
                              {opt.icon}
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Timing de l'extrait</label>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <input
                              type="number"
                              value={track.startTime ?? 0}
                              onChange={(e) => updateTrack(track.id, { startTime: parseInt(e.target.value, 10) || 0 })}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                              min="0"
                              placeholder="Début extrait (s)"
                              title="Début extrait (secondes)"
                            />
                          </div>
                          <div className="flex-1">
                            <input
                              type="number"
                              value={track.duration || 30}
                              onChange={(e) => updateTrack(track.id, { duration: parseInt(e.target.value) || 30 })}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                              min="5"
                              max="300"
                              placeholder="Durée (s)"
                              title="Durée (secondes)"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Source média */}
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">
                        {track.mediaType === 'text' ? 'Contenu texte / indice' : 'Source du média'}
                      </label>

                      {track.mediaType === 'text' ? (
                        <textarea
                          value={track.textContent || ''}
                          onChange={(e) => updateTrack(track.id, { textContent: e.target.value })}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 h-20 resize-none text-sm"
                          placeholder="Entrez le texte, l'indice ou la description..."
                        />
                      ) : track.mediaType === 'youtube' ? (
                        <div className="space-y-2">
                            <input
                            type="text"
                            value={sourceUrl}
                            onChange={(e) => updateTrack(track.id, { mediaUrl: e.target.value, url: e.target.value })}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                            placeholder="https://www.youtube.com/watch?v=... ou https://youtu.be/..."
                          />
                          <p className="text-xs text-zinc-500">
                            L'extrait YouTube démarrera à <span className="text-zinc-300 font-medium">{track.startTime ?? 0}s</span>.
                          </p>
                          {sourceUrl && extractYoutubeId(sourceUrl) && (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => testYoutubePreviewFromTiming(track.id)}
                                className="text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Tester depuis ce timing
                              </button>
                              <div className="relative pt-[28%] rounded-lg overflow-hidden bg-black/50">
                                <iframe
                                  src={`https://www.youtube.com/embed/${extractYoutubeId(sourceUrl)}?start=${Math.max(0, track.startTime ?? 0)}&autoplay=${youtubePreviewSeedByTrack[track.id] ? 1 : 0}&${youtubePreviewSeedByTrack[track.id] ? `seed=${youtubePreviewSeedByTrack[track.id]}` : ''}`}
                                  className="absolute inset-0 w-full h-full rounded-lg"
                                  allow="autoplay; encrypted-media"
                                  title="YouTube preview"
                                />
                              </div>
                            </div>
                          )}
                          <a
                            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.title} ${track.artist}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Youtube className="w-3 h-3" />
                            Rechercher sur YouTube
                          </a>
                        </div>
                      ) : track.mediaType === 'voice' ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            {recordingTrackId === track.id ? (
                              <button
                                onClick={stopRecording}
                                className="flex items-center gap-2 bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg text-sm font-medium animate-pulse"
                              >
                                <Mic className="w-4 h-4" />
                                Arrêter l'enregistrement
                              </button>
                            ) : (
                              <button
                                onClick={() => void startRecording(track.id)}
                                className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded-lg text-sm transition-colors"
                              >
                                <Mic className="w-4 h-4" />
                                Enregistrer votre voix
                              </button>
                            )}
                            <span className="text-xs text-zinc-500">ou</span>
                            <button
                              onClick={() => triggerFileInput(track.id, 'audio/*')}
                              className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded-lg text-sm transition-colors"
                            >
                              <Upload className="w-4 h-4" />
                              Upload fichier audio
                            </button>
                          </div>
                          {previewSrc && (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => playPreviewFromTiming(track)}
                                className="text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Tester depuis ce timing
                              </button>
                              <audio
                                id={`preview-media-${track.id}`}
                                controls
                                src={previewSrc}
                                className="w-full"
                                onLoadedMetadata={(e) => {
                                  if ((track.startTime ?? 0) > 0) {
                                    e.currentTarget.currentTime = track.startTime ?? 0;
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>
                      ) : track.mediaType === 'url' ? (
                        <input
                          type="text"
                          value={sourceUrl}
                          onChange={(e) => updateTrack(track.id, { mediaUrl: e.target.value, url: e.target.value })}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                          placeholder="https://... (lien direct vers le fichier)"
                        />
                      ) : (
                        /* audio, video, image */
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <input
                              type="text"
                              value={sourceUrl}
                              onChange={(e) => updateTrack(track.id, { mediaUrl: e.target.value, url: e.target.value })}
                              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
                              placeholder={uploadProgress[`${track.id}:media`] !== undefined ? 'Envoi en cours…' : 'URL directe ou uploadez un fichier'}
                              readOnly={uploadProgress[`${track.id}:media`] !== undefined}
                            />
                            <button
                              onClick={() => triggerFileInput(track.id, mediaOption?.accept || '*')}
                              className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
                            >
                              <Upload className="w-4 h-4" />
                              Upload
                            </button>
                            {uploadProgress[`${track.id}:media`] !== undefined && (
                              <span className="text-xs text-indigo-400">
                                {uploadProgress[`${track.id}:media`] === 100 ? 'Terminé!' : `${uploadProgress[`${track.id}:media`]}%`}
                              </span>
                            )}
                          </div>

                          {track.mediaType === 'audio' && previewSrc && (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => playPreviewFromTiming(track)}
                                className="text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Tester depuis ce timing
                              </button>
                              <audio
                                id={`preview-media-${track.id}`}
                                controls
                                src={previewSrc}
                                className="w-full"
                                onLoadedMetadata={(e) => {
                                  if ((track.startTime ?? 0) > 0) {
                                    e.currentTarget.currentTime = track.startTime ?? 0;
                                  }
                                }}
                              />
                            </div>
                          )}
                          {track.mediaType === 'video' && previewSrc && (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => playPreviewFromTiming(track)}
                                className="text-xs bg-zinc-700 hover:bg-zinc-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                              >
                                Tester depuis ce timing
                              </button>
                              <video
                                id={`preview-media-${track.id}`}
                                controls
                                src={previewSrc}
                                className="w-full max-h-48 rounded-lg bg-black/30"
                                onLoadedMetadata={(e) => {
                                  if ((track.startTime ?? 0) > 0) {
                                    e.currentTarget.currentTime = track.startTime ?? 0;
                                  }
                                }}
                              />
                            </div>
                          )}
                          {track.mediaType === 'image' && (
                            <div className="space-y-3">
                              {previewSrc && (
                                <img
                                  src={previewSrc}
                                  alt="preview"
                                  className="max-h-48 rounded-lg"
                                  style={{
                                    filter: track.imageRevealMode === 'blur' ? 'blur(8px)' : 'none',
                                  }}
                                />
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <select
                                  value={track.imageRevealMode || 'none'}
                                  onChange={(e) =>
                                    updateTrack(track.id, { imageRevealMode: (e.target.value as 'none' | 'blur') || 'none' })
                                  }
                                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
                                >
                                  <option value="none">Révélation image: immédiate</option>
                                  <option value="blur">Révélation progressive (blur)</option>
                                </select>
                                <input
                                  type="number"
                                  min={1}
                                  max={300}
                                  value={track.imageRevealDuration || track.duration || defaultDuration}
                                  onChange={(e) =>
                                    updateTrack(track.id, { imageRevealDuration: Math.max(1, Math.min(300, Number(e.target.value) || 15)) })
                                  }
                                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
                                  placeholder="Durée révélation (s)"
                                  title="Durée de révélation de l'image (s)"
                                />
                                <input
                                  type="text"
                                  value={track.visualHint || ''}
                                  onChange={(e) => updateTrack(track.id, { visualHint: e.target.value })}
                                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
                                  placeholder="Indice visuel (optionnel)"
                                />
                              </div>
                              <textarea
                                value={track.textContent || ''}
                                onChange={(e) => updateTrack(track.id, { textContent: e.target.value })}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 h-20 resize-none text-sm"
                                placeholder="Texte affiché sur grand écran (optionnel). Exemple: 'Quel film est représenté ?'"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => moveTrack(index, index - 1)}
                      disabled={index === 0}
                      className="text-zinc-500 hover:text-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed p-2 rounded-full transition-colors"
                      title="Monter"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveTrack(index, index + 1)}
                      disabled={index >= playlist.tracks.length - 1}
                      className="text-zinc-500 hover:text-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed p-2 rounded-full transition-colors"
                      title="Descendre"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeTrack(track.id)}
                      className="text-zinc-600 hover:text-red-400 p-2 rounded-full transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {playlist.tracks.length === 0 && (
          <div className="text-center py-16 text-zinc-500">
            <Music className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Aucune piste. Commencez par en ajouter une !</p>
          </div>
        )}

        <button
          onClick={addTrack}
          className="w-full py-4 border-2 border-dashed border-zinc-700 hover:border-indigo-500 hover:bg-indigo-500/5 rounded-xl flex items-center justify-center gap-2 text-zinc-400 hover:text-indigo-400 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Ajouter une piste
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
        accept={activeAccept}
      />
    </div>
  );
}
