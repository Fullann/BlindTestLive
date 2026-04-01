import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firebase-errors';
import { socket } from '../lib/socket';
import { Playlist, Track } from '../types';
import { Plus, Trash2, Play, Music, LogOut, Youtube, ExternalLink, Edit } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function AdminDashboard() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [isTeamMode, setIsTeamMode] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let unsubscribeDb: (() => void) | undefined;

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (unsubscribeDb) {
        unsubscribeDb();
        unsubscribeDb = undefined;
      }

      if (!user) {
        navigate('/');
        return;
      }

      const q = query(collection(db, 'playlists'), where('ownerId', '==', user.uid));
      unsubscribeDb = onSnapshot(q, (snapshot) => {
        const lists: Playlist[] = [];
        snapshot.forEach((doc) => {
          lists.push({ id: doc.id, ...doc.data() } as Playlist);
        });
        setPlaylists(lists);
        setLoading(false);
      }, (error) => {
        // Only throw if we are still authenticated, otherwise it's just the expected
        // permission error from the listener being killed during logout
        if (auth.currentUser) {
          handleFirestoreError(error, OperationType.LIST, 'playlists');
        }
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDb) {
        unsubscribeDb();
      }
    };
  }, [navigate]);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim() || !auth.currentUser) return;

    try {
      const newPlaylist = {
        name: newPlaylistName,
        ownerId: auth.currentUser.uid,
        tracks: [],
        createdAt: Date.now()
      };
      const docRef = await addDoc(collection(db, 'playlists'), newPlaylist);
      setNewPlaylistName('');
      setIsCreating(false);
      navigate(`/admin/playlist/${docRef.id}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'playlists');
    }
  };

  const handleDeletePlaylist = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'playlists', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `playlists/${id}`);
    }
  };

  const handleLaunchGame = (playlist: Playlist) => {
    socket.emit('host:createGame', playlist.tracks, isTeamMode, (response: any) => {
      if (response.success) {
        localStorage.setItem(`blindtest_host_${response.gameId}`, response.hostToken);
        navigate(`/admin/game/${response.gameId}`);
      } else {
        alert(response.error || 'Erreur lors de la création de la partie');
      }
    });
  };

  const handleLaunchYoutubeGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl) return;

    const extractYoutubeId = (url: string) => {
      const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      return match ? match[1] : null;
    };

    const videoId = extractYoutubeId(youtubeUrl);
    if (!videoId) {
      alert("URL YouTube invalide");
      return;
    }

    socket.emit('host:createYoutubeGame', videoId, isTeamMode, (response: any) => {
      if (response.success) {
        localStorage.setItem(`blindtest_host_${response.gameId}`, response.hostToken);
        navigate(`/admin/game/${response.gameId}`);
      } else {
        alert(response.error || 'Erreur lors de la création de la partie YouTube');
      }
    });
  };

  const handleLaunchSpotifyGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!spotifyUrl) return;

    const extractSpotifyId = (url: string) => {
      const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
      return match ? match[1] : null;
    };

    const playlistId = extractSpotifyId(spotifyUrl);
    if (!playlistId) {
      alert("URL Spotify invalide");
      return;
    }

    socket.emit('host:createSpotifyGame', playlistId, isTeamMode, (response: any) => {
      if (response.success) {
        localStorage.setItem(`blindtest_host_${response.gameId}`, response.hostToken);
        navigate(`/admin/game/${response.gameId}`);
      } else {
        alert(response.error || 'Erreur lors de la création de la partie Spotify');
      }
    });
  };

  const handleLogout = () => {
    auth.signOut();
    navigate('/');
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Espace Animateur</h1>
            <p className="text-zinc-400 mt-2">Gérez vos playlists et lancez des parties</p>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer bg-zinc-900 border border-white/10 px-4 py-2 rounded-xl hover:bg-zinc-800 transition-colors">
              <input 
                type="checkbox" 
                checked={isTeamMode}
                onChange={(e) => setIsTeamMode(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 text-indigo-500 focus:ring-indigo-500 bg-zinc-800"
              />
              <span className="text-sm font-medium">Mode Équipe</span>
            </label>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Déconnexion
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-500" />
                Partie YouTube
              </h2>
            </div>
            <p className="text-zinc-400 mb-4 text-sm">
              Collez le lien d'une vidéo YouTube (ex: un blind test de 1h) pour jouer directement.
            </p>
            <form onSubmit={handleLaunchYoutubeGame} className="flex gap-4">
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                type="submit"
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Lancer
              </button>
            </form>
          </div>

          <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Music className="w-5 h-5 text-green-500" />
                Partie Spotify
              </h2>
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
            </div>
            <p className="text-zinc-400 mb-4 text-sm">
              Collez le lien d'une playlist Spotify pour jouer directement avec les extraits.
            </p>
            <form onSubmit={handleLaunchSpotifyGame} className="flex gap-4">
              <input
                type="text"
                value={spotifyUrl}
                onChange={(e) => setSpotifyUrl(e.target.value)}
                placeholder="https://open.spotify.com/playlist/..."
                className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Lancer
              </button>
            </form>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-white/5 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Music className="w-5 h-5 text-indigo-400" />
              Vos Playlists
            </h2>
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Nouvelle Playlist
            </button>
          </div>

          {isCreating && (
            <form onSubmit={handleCreatePlaylist} className="mb-6 flex gap-4">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Nom de la playlist..."
                className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <button
                type="submit"
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Créer
              </button>
            </form>
          )}

          {playlists.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              Aucune playlist pour le moment. Créez-en une pour commencer !
            </div>
          ) : (
            <div className="grid gap-4">
              {playlists.map((playlist) => (
                <div key={playlist.id} className="bg-zinc-950 border border-white/5 rounded-xl p-4 flex items-center justify-between group hover:border-white/10 transition-colors">
                  <div>
                    <h3 className="font-medium text-lg">{playlist.name}</h3>
                    <p className="text-sm text-zinc-500">{playlist.tracks.length} morceaux</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => navigate(`/admin/playlist/${playlist.id}`)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
                    >
                      <Edit className="w-4 h-4" />
                      Éditer
                    </button>
                    <button
                      onClick={() => handleLaunchGame(playlist)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
                    >
                      <Play className="w-4 h-4" />
                      Lancer
                    </button>
                    <button
                      onClick={() => handleDeletePlaylist(playlist.id)}
                      className="text-zinc-500 hover:text-red-400 p-2 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
