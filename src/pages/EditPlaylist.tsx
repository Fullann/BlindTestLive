import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { Playlist, Track, MediaType } from '../types';
import { ArrowLeft, Plus, Trash2, Save, Upload, Music, Video, Image as ImageIcon, Type, Youtube, PlayCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function EditPlaylist() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [defaultDuration, setDefaultDuration] = useState<number>(30);

  useEffect(() => {
    const fetchPlaylist = async () => {
      if (!playlistId) return;
      try {
        const docRef = doc(db, 'playlists', playlistId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Playlist;
          if (data.ownerId !== auth.currentUser?.uid) {
            navigate('/admin');
            return;
          }
          setPlaylist({ id: docSnap.id, ...data });
        } else {
          navigate('/admin');
        }
      } catch (error) {
        console.error("Error fetching playlist:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlaylist();
  }, [playlistId, navigate]);

  const handleSave = async () => {
    if (!playlist || !playlistId) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'playlists', playlistId);
      await updateDoc(docRef, {
        name: playlist.name,
        tracks: playlist.tracks
      });
      navigate('/admin');
    } catch (error) {
      console.error("Error saving playlist:", error);
      alert("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const addTrack = () => {
    if (!playlist) return;
    const newTrack: Track = {
      id: uuidv4(),
      title: 'Nouvelle piste',
      artist: 'Artiste inconnu',
      mediaType: 'audio',
      duration: defaultDuration,
      startTime: 0
    };
    setPlaylist({
      ...playlist,
      tracks: [...playlist.tracks, newTrack]
    });
  };

  const removeTrack = (trackId: string) => {
    if (!playlist) return;
    setPlaylist({
      ...playlist,
      tracks: playlist.tracks.filter(t => t.id !== trackId)
    });
  };

  const updateTrack = (trackId: string, updates: Partial<Track>) => {
    if (!playlist) return;
    setPlaylist({
      ...playlist,
      tracks: playlist.tracks.map(t => t.id === trackId ? { ...t, ...updates } : t)
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, trackId: string) => {
    const file = e.target.files?.[0];
    if (!file || !playlistId) return;

    try {
      setUploadProgress(prev => ({ ...prev, [trackId]: 10 })); // Fake progress start
      const fileExt = file.name.split('.').pop();
      const fileName = `${trackId}_${Date.now()}.${fileExt}`;
      const storageRef = ref(storage, `playlists/${playlistId}/${fileName}`);
      
      await uploadBytes(storageRef, file);
      setUploadProgress(prev => ({ ...prev, [trackId]: 50 }));
      
      const url = await getDownloadURL(storageRef);
      setUploadProgress(prev => ({ ...prev, [trackId]: 100 }));
      
      updateTrack(trackId, { mediaUrl: url, url: url });
      
      setTimeout(() => {
        setUploadProgress(prev => {
          const newProg = { ...prev };
          delete newProg[trackId];
          return newProg;
        });
      }, 1000);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Erreur lors du téléchargement du fichier. Vérifiez les permissions Firebase Storage.");
      setUploadProgress(prev => {
        const newProg = { ...prev };
        delete newProg[trackId];
        return newProg;
      });
    }
  };

  const triggerFileInput = (trackId: string) => {
    setActiveTrackId(trackId);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement...</div>;
  }

  if (!playlist) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Playlist introuvable</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/admin')} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <input
              type="text"
              value={playlist.name}
              onChange={(e) => setPlaylist({ ...playlist, name: e.target.value })}
              className="bg-transparent text-3xl font-bold focus:outline-none focus:border-b-2 border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-zinc-400">Durée par défaut :</label>
              <input
                type="number"
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(parseInt(e.target.value) || 30)}
                className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                min="5"
                max="300"
              />
              <span className="text-sm text-zinc-400">s</span>
              <button
                onClick={() => {
                  if (!playlist) return;
                  setPlaylist({
                    ...playlist,
                    tracks: playlist.tracks.map(t => ({ ...t, duration: defaultDuration }))
                  });
                }}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded transition-colors ml-2"
                title="Appliquer à toutes les pistes"
              >
                Appliquer à tout
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-full font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          {playlist.tracks.map((track, index) => (
            <div key={track.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 relative group">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => removeTrack(track.id)} className="p-2 text-red-400 hover:bg-red-400/10 rounded-full">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex items-start gap-6">
                <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 text-xl font-bold text-zinc-400">
                  {index + 1}
                </div>
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Titre de l'œuvre</label>
                    <input
                      type="text"
                      value={track.title}
                      onChange={(e) => updateTrack(track.id, { title: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                      placeholder="Ex: Bohemian Rhapsody"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Artiste / Auteur</label>
                    <input
                      type="text"
                      value={track.artist}
                      onChange={(e) => updateTrack(track.id, { artist: e.target.value })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                      placeholder="Ex: Queen"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Type de média</label>
                    <select
                      value={track.mediaType || 'audio'}
                      onChange={(e) => updateTrack(track.id, { mediaType: e.target.value as MediaType })}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="audio">Audio (MP3, etc.)</option>
                      <option value="video">Vidéo (MP4, etc.)</option>
                      <option value="image">Image (JPG, PNG)</option>
                      <option value="text">Texte / Indice</option>
                      <option value="youtube">YouTube</option>
                      <option value="spotify">Spotify</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-1">Temps (secondes)</label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          value={track.startTime || 0}
                          onChange={(e) => updateTrack(track.id, { startTime: parseInt(e.target.value) || 0 })}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                          min="0"
                          placeholder="Début"
                          title="Début (secondes)"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="number"
                          value={track.duration || 30}
                          onChange={(e) => updateTrack(track.id, { duration: parseInt(e.target.value) || 30 })}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                          min="5"
                          max="300"
                          placeholder="Durée"
                          title="Durée (secondes)"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                      {track.mediaType === 'text' ? 'Contenu texte' : 'Source du média'}
                    </label>
                    
                    {track.mediaType === 'text' ? (
                      <textarea
                        value={track.textContent || ''}
                        onChange={(e) => updateTrack(track.id, { textContent: e.target.value })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 h-24 resize-none"
                        placeholder="Entrez le texte ou l'indice ici..."
                      />
                    ) : track.mediaType === 'youtube' || track.mediaType === 'spotify' ? (
                      <input
                        type="text"
                        value={track.mediaUrl || track.url || ''}
                        onChange={(e) => updateTrack(track.id, { mediaUrl: e.target.value, url: e.target.value })}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                        placeholder={track.mediaType === 'youtube' ? "URL ou ID YouTube" : "URL ou URI Spotify"}
                      />
                    ) : (
                      <div className="flex items-center gap-4">
                        <input
                          type="text"
                          value={track.mediaUrl || track.url || ''}
                          onChange={(e) => updateTrack(track.id, { mediaUrl: e.target.value, url: e.target.value })}
                          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                          placeholder="URL du fichier ou uploadez un fichier"
                        />
                        <button
                          onClick={() => triggerFileInput(track.id)}
                          className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Upload className="w-4 h-4" />
                          Upload
                        </button>
                        {uploadProgress[track.id] !== undefined && (
                          <div className="text-sm text-indigo-400">
                            {uploadProgress[track.id] === 100 ? 'Terminé!' : 'Upload...'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addTrack}
          className="w-full py-4 border-2 border-dashed border-zinc-700 hover:border-indigo-500 hover:bg-indigo-500/10 rounded-xl flex items-center justify-center gap-2 text-zinc-400 hover:text-indigo-400 transition-colors font-medium"
        >
          <Plus className="w-5 h-5" />
          Ajouter une piste
        </button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => activeTrackId && handleFileUpload(e, activeTrackId)}
        accept="audio/*,video/*,image/*"
      />
    </div>
  );
}
