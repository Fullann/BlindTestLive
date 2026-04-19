import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { socket } from '../lib/socket';
import { Playlist, Track, MediaType } from '../types';
import { ArrowLeft, Plus, Trash2, Save, Upload, Music, Video, Image as ImageIcon, Type, Youtube, Mic, Link, ArrowUp, ArrowDown } from 'lucide-react';
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
  const { user } = useAuth();
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
  const [defaultDuration, setDefaultDuration] = useState<number>(30);
  const [duplicateKeys, setDuplicateKeys] = useState<Set<string>>(new Set());
  const [localPreviewUrls, setLocalPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef<Record<string, string>>({});
  const collabToken = searchParams.get('collab') || '';
  const [collabLink, setCollabLink] = useState('');
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
    const fetchPlaylist = async () => {
      if (!playlistId) return;
      if (!user) { navigate('/'); return; }
      try {
        const { playlist: data } = collabToken
          ? await api.playlists.getWithCollab(playlistId, collabToken)
          : await api.playlists.get(playlistId);
        if (!data) { navigate('/admin'); return; }
        const parsed = toPlaylistObj(data);
        if (parsed.ownerId !== user.id && !collabToken) { navigate('/admin'); return; }
        setPlaylist(parsed);
      } catch (error) {
        console.error("Error fetching playlist:", error);
        navigate('/admin');
      } finally {
        setLoading(false);
      }
    };
    fetchPlaylist();
  }, [playlistId, navigate, user, collabToken]);

  useEffect(() => {
    if (!playlistId || !collabToken) return;
    socket.emit('playlist:join', { playlistId, collabToken }, (res: any) => {
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
  }, [playlistId, collabToken]);

  useEffect(() => {
    if (!playlist || !playlistId || !collabToken) return;
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
          collabToken,
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
  }, [playlist, playlistId, collabToken]);

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
    setSaving(true);
    try {
      if (collabToken) {
        await api.playlists.updateWithCollab(playlistId, collabToken, {
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
      navigate('/admin');
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
      const { token } = await api.playlists.createCollabToken(playlistId);
      const link = `${window.location.origin}/admin/playlist/${playlistId}?collab=${encodeURIComponent(token)}`;
      setCollabLink(link);
      await navigator.clipboard.writeText(link);
      toastSuccess('Lien de coédition copié');
    } catch (error: any) {
      toastError(error?.message || 'Impossible de créer le lien de coédition');
    }
  };

  const addTrack = () => {
    if (!playlist) return;
    const newTrack: Track = {
      id: uuidv4(),
      title: '',
      artist: '',
      mediaType: 'youtube',
      duration: defaultDuration,
      startTime: 0,
    };
    setPlaylist({ ...playlist, tracks: [...playlist.tracks, newTrack] });
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

  const uploadFile = async (file: File, trackId: string) => {
    if (!playlistId || !user) {
      toastWarning("Vous devez être connecté pour uploader un fichier.");
      return;
    }

    try {
      const previewUrl = URL.createObjectURL(file);
      setLocalPreviewUrls((prev) => {
        if (prev[trackId]) URL.revokeObjectURL(prev[trackId]);
        return { ...prev, [trackId]: previewUrl };
      });
      updateTrack(trackId, { mediaUrl: previewUrl, url: previewUrl });

      setUploadProgress(prev => ({ ...prev, [trackId]: 10 }));
      const { url } = await api.playlists.upload(playlistId, file);
      setUploadProgress(prev => ({ ...prev, [trackId]: 100 }));
      updateTrack(trackId, { mediaUrl: url, url });
      setLocalPreviewUrls((prev) => {
        if (prev[trackId]) URL.revokeObjectURL(prev[trackId]);
        const copy = { ...prev };
        delete copy[trackId];
        return copy;
      });
      setTimeout(() => setUploadProgress(prev => { const n = { ...prev }; delete n[trackId]; return n; }), 1500);
    } catch (error) {
      console.error("Upload error:", error);
      toastError("Erreur lors de l'upload du fichier.");
      setUploadProgress(prev => { const n = { ...prev }; delete n[trackId]; return n; });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeTrackId) void uploadFile(file, activeTrackId);
    e.target.value = '';
  };

  const triggerFileInput = (trackId: string, accept: string) => {
    setActiveTrackId(trackId);
    setActiveAccept(accept);
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 app-shell">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button onClick={() => navigate('/admin')} className="p-2 hover:bg-zinc-800 rounded-full transition-colors flex-shrink-0">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <input
              type="text"
              value={playlist.name}
              onChange={(e) => setPlaylist({ ...playlist, name: e.target.value })}
              className="bg-transparent text-2xl font-bold focus:outline-none focus:border-b-2 border-indigo-500 min-w-0 flex-1"
            />
            <input
              type="text"
              value={playlist.category || 'general'}
              onChange={(e) => setPlaylist({ ...playlist, category: e.target.value })}
              className="ml-3 app-input bg-zinc-900/70 border border-white/10 rounded-lg px-3 py-1.5 text-sm max-w-[180px]"
              placeholder="Catégorie"
            />
          </div>
          <div className="flex items-center gap-4 flex-shrink-0 ml-4">
            {playlist.ownerId === user?.id && (
              <button
                onClick={handleCreateCollabLink}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-full font-medium transition-colors"
                title="Générer un lien pour coéditer en temps réel"
              >
                <Link className="w-4 h-4" />
                Lien coédition
              </button>
            )}
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-400">Durée par défaut :</label>
              <input
                type="number"
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(parseInt(e.target.value) || 30)}
                className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-indigo-500 text-sm"
                min="5"
                max="300"
              />
              <span className="text-sm text-zinc-400">s</span>
              <button
                onClick={() => setPlaylist({ ...playlist, tracks: playlist.tracks.map(t => ({ ...t, duration: defaultDuration })) })}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded transition-colors"
                title="Appliquer à toutes les pistes"
              >
                Tout
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-full font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>
        {collabLink && (
          <div className="mb-6 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-200 break-all">
            {collabLink}
          </div>
        )}
        {collabToken && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            Mode coédition temps réel actif. {collabEditorsCount} éditeur(s) connecté(s).
          </div>
        )}

        {/* Pistes */}
        <div className="space-y-4 mb-6">
          {playlist.tracks.map((track, index) => {
            const dedupeKey = `${(track.title || '').trim().toLowerCase()}::${(track.artist || '').trim().toLowerCase()}`;
            const isDuplicate = duplicateKeys.has(dedupeKey) && dedupeKey !== "::";
            const mediaOption = MEDIA_TYPE_OPTIONS.find(o => o.value === track.mediaType);
            const sourceUrl = track.mediaUrl || track.url || '';

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
                          {sourceUrl && (
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
                                src={sourceUrl}
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
                              placeholder="URL directe ou uploadez un fichier"
                            />
                            <button
                              onClick={() => triggerFileInput(track.id, mediaOption?.accept || '*')}
                              className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
                            >
                              <Upload className="w-4 h-4" />
                              Upload
                            </button>
                            {uploadProgress[track.id] !== undefined && (
                              <span className="text-xs text-indigo-400">
                                {uploadProgress[track.id] === 100 ? 'Terminé!' : `${uploadProgress[track.id]}%`}
                              </span>
                            )}
                          </div>

                          {track.mediaType === 'audio' && sourceUrl && (
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
                                src={sourceUrl}
                                className="w-full"
                                onLoadedMetadata={(e) => {
                                  if ((track.startTime ?? 0) > 0) {
                                    e.currentTarget.currentTime = track.startTime ?? 0;
                                  }
                                }}
                              />
                            </div>
                          )}
                          {track.mediaType === 'video' && sourceUrl && (
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
                                src={sourceUrl}
                                className="w-full max-h-48 rounded-lg bg-black/30"
                                onLoadedMetadata={(e) => {
                                  if ((track.startTime ?? 0) > 0) {
                                    e.currentTarget.currentTime = track.startTime ?? 0;
                                  }
                                }}
                              />
                            </div>
                          )}
                          {track.mediaType === 'image' && sourceUrl && (
                            <img src={sourceUrl} alt="preview" className="max-h-48 rounded-lg" />
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
