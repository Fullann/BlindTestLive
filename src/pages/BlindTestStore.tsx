import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ArrowDownWideNarrow, ArrowLeft, Copy, Heart, Search, Store } from 'lucide-react';
import { Playlist, Track } from '../types';

function rowToPlaylist(row: any): Playlist {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    tracks: Array.isArray(row.tracks) ? (row.tracks as Track[]) : [],
    createdAt: row.created_at,
    visibility: row.visibility || 'public',
    category: row.category || 'general',
    likesCount: Number(row.likes_count || 0),
    downloadsCount: Number(row.downloads_count || 0),
    ownerEmail: row.owner_email || '',
  };
}

export default function BlindTestStore() {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sort, setSort] = useState<'recent' | 'popular'>('popular');

  useEffect(() => {
    let active = true;
    const loadStore = async () => {
      try {
        const response = await api.playlists.storeList({
          sort,
          category: selectedCategory === 'all' ? undefined : selectedCategory,
        });
        if (!active) return;
        setItems((response.playlists || []).map(rowToPlaylist));
      } catch (error) {
        console.error('Erreur chargement magasin', error);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadStore();
    return () => {
      active = false;
    };
  }, [selectedCategory, sort]);

  useEffect(() => {
    let active = true;
    const loadLikes = async () => {
      if (!user) {
        setLikedIds(new Set());
        return;
      }
      try {
        const response = await api.playlists.storeLikes();
        if (!active) return;
        setLikedIds(new Set(response.likedPlaylistIds || []));
      } catch {
        if (active) setLikedIds(new Set());
      }
    };
    void loadLikes();
    return () => {
      active = false;
    };
  }, [user]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((playlist) => {
      const content = `${playlist.name} ${playlist.tracks.map((track) => `${track.title} ${track.artist}`).join(' ')}`.toLowerCase();
      return content.includes(term);
    });
  }, [items, search]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    items.forEach((item) => values.add(item.category || 'general'));
    return ['all', ...Array.from(values)];
  }, [items]);

  const handleToggleLike = async (playlistId: string) => {
    if (!user) {
      navigate('/');
      return;
    }
    try {
      const response = await api.playlists.toggleStoreLike(playlistId);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (response.liked) next.add(playlistId);
        else next.delete(playlistId);
        return next;
      });
      setItems((prev) =>
        prev.map((playlist) =>
          playlist.id === playlistId
            ? {
                ...playlist,
                likesCount: Math.max(
                  0,
                  (playlist.likesCount || 0) + (response.liked ? 1 : -1),
                ),
              }
            : playlist,
        ),
      );
    } catch (error) {
      toastError((error as Error).message || 'Impossible de mettre un like');
    }
  };

  const handleCopyPlaylist = async (playlist: Playlist) => {
    if (!user) {
      navigate('/');
      return;
    }
    setCopyingId(playlist.id);
    try {
      await api.playlists.create(`${playlist.name} (copie)`, playlist.tracks, 'private', playlist.category || 'general');
      await api.playlists.trackStoreDownload(playlist.id);
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === playlist.id
            ? { ...entry, downloadsCount: (entry.downloadsCount || 0) + 1 }
            : entry,
        ),
      );
      toastSuccess('Blind test copié dans ta bibliothèque.');
    } catch (error) {
      toastError((error as Error).message || 'Impossible de copier ce blind test');
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 md:p-8 app-shell">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg p-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Store className="w-7 h-7 text-indigo-400" />
                Magasin Blind Test
              </h1>
              <p className="text-zinc-400 text-sm mt-1">Découvre les blind tests publics partagés par la communauté</p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 mb-6 app-card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-2">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un blind test, un titre ou un artiste..."
                className="w-full bg-zinc-950 border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="app-input bg-zinc-950 border border-white/10 rounded-lg px-3 py-2.5 text-sm flex-1"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category === 'all' ? 'Toutes catégories' : category}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSort((prev) => (prev === 'popular' ? 'recent' : 'popular'))}
                className="bg-zinc-950 hover:bg-zinc-800 border border-white/10 rounded-lg px-3 py-2.5 text-xs text-zinc-200 flex items-center gap-2"
                title="Changer le tri"
              >
                <ArrowDownWideNarrow className="w-3.5 h-3.5" />
                {sort === 'popular' ? 'Populaire' : 'Récent'}
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-14 text-zinc-400">Chargement du magasin...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-14 text-zinc-500">Aucun blind test public trouvé.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredItems.map((playlist) => (
              <div key={playlist.id} className="bg-zinc-900 border border-white/10 rounded-2xl p-4 app-card">
                <h2 className="font-semibold text-lg truncate">{playlist.name}</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  {playlist.tracks.length} piste(s) • publié le {new Date(playlist.createdAt).toLocaleDateString('fr-FR')}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Auteur: {playlist.ownerEmail || 'Inconnu'} • Catégorie: {playlist.category || 'general'}
                </p>
                <div className="mt-3 space-y-1.5 max-h-28 overflow-y-auto pr-1">
                  {playlist.tracks.slice(0, 6).map((track, index) => (
                    <p key={`${track.id}-${index}`} className="text-xs text-zinc-300 truncate">
                      {index + 1}. {track.title || 'Sans titre'} {track.artist ? `— ${track.artist}` : ''}
                    </p>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
                  <span>{playlist.likesCount || 0} likes</span>
                  <span>{playlist.downloadsCount || 0} copies</span>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {user ? (
                    <>
                      <button
                        onClick={() => void handleToggleLike(playlist.id)}
                        className={`w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 border ${
                          likedIds.has(playlist.id)
                            ? 'bg-rose-500/15 text-rose-200 border-rose-400/40'
                            : 'bg-zinc-800 text-zinc-300 border-white/10 hover:bg-zinc-700'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${likedIds.has(playlist.id) ? 'fill-current' : ''}`} />
                        {likedIds.has(playlist.id) ? 'Liké' : 'Liker'}
                      </button>
                      <button
                        onClick={() => void handleCopyPlaylist(playlist)}
                        disabled={copyingId === playlist.id}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm flex items-center justify-center gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        {copyingId === playlist.id ? 'Copie...' : 'Copier'}
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-500 text-center">Connecte-toi en animateur pour copier ce blind test.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
