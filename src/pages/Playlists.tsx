import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { MediaType } from '../types';
import {
  Music2, Video, Image as ImageIcon, Youtube, Type, Mic, Link,
  Plus, ArrowLeft, Trash2, Edit3, Eye, Lock, Globe, Loader2,
  FileAudio, ChevronRight, Music, List, Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type QuestionType = 'buzz' | 'text_open' | 'qcm';

interface QuestionTypeInfo {
  id: QuestionType;
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
  border: string;
  bg: string;
  expectation: string;
}

const QUESTION_TYPES: QuestionTypeInfo[] = [
  {
    id: 'buzz',
    label: 'Buzz',
    desc: 'Les joueurs appuient sur leur buzzer pour répondre oralement.',
    icon: Music,
    color: 'text-indigo-300',
    border: 'border-indigo-500/40',
    bg: 'bg-indigo-600/15',
    expectation: 'Réponse orale après le buzz',
  },
  {
    id: 'text_open',
    label: 'Réponse écrite',
    desc: 'Les joueurs tapent leur réponse sur leur téléphone. L\'animateur valide.',
    icon: Type,
    color: 'text-amber-300',
    border: 'border-amber-500/40',
    bg: 'bg-amber-600/15',
    expectation: 'Texte libre saisi sur mobile',
  },
  {
    id: 'qcm',
    label: 'QCM',
    desc: 'Choix multiple : les joueurs cliquent sur la bonne réponse parmi les options.',
    icon: List,
    color: 'text-emerald-300',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-600/15',
    expectation: 'Clic sur une option affichée',
  },
];

const MEDIA_TYPES: Array<{ value: MediaType; label: string; icon: React.ElementType; desc: string }> = [
  { value: 'audio', label: 'Audio', icon: FileAudio, desc: 'Fichier MP3, WAV…' },
  { value: 'video', label: 'Vidéo', icon: Video, desc: 'Fichier MP4, MKV…' },
  { value: 'image', label: 'Image', icon: ImageIcon, desc: 'JPEG, PNG, GIF…' },
  { value: 'youtube', label: 'YouTube', icon: Youtube, desc: 'Lien YouTube' },
  { value: 'voice', label: 'Voix', icon: Mic, desc: 'Enregistrement micro' },
  { value: 'text', label: 'Texte', icon: Type, desc: 'Extrait ou indice texte' },
  { value: 'url', label: 'URL directe', icon: Link, desc: 'Lien vers un média' },
];

interface PlaylistItem {
  id: string;
  name: string;
  trackCount: number;
  visibility: 'private' | 'public';
  category?: string;
}

export default function Playlists() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();

  const [view, setView] = useState<'list' | 'create'>('list');
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // New playlist form
  const [name, setName] = useState('');
  const [defaultMediaType, setDefaultMediaType] = useState<MediaType>('audio');
  const [defaultQuestionType, setDefaultQuestionType] = useState<QuestionType>('buzz');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/'); return; }
    fetchPlaylists();
  }, [user, authLoading, navigate]);

  const fetchPlaylists = async () => {
    setLoading(true);
    try {
      const res = await api.playlists.list();
      const getTrackCount = (value: unknown) => {
        if (Array.isArray(value)) return value.length;
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.length : 0;
          } catch {
            return 0;
          }
        }
        return 0;
      };
      setPlaylists(
        (res.playlists || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          trackCount: p.trackCount ?? getTrackCount(p.tracks),
          visibility: p.visibility || 'private',
          category: p.category,
        }))
      );
    } catch (err) {
      console.error('fetchPlaylists error:', err);
      toastError('Impossible de charger les playlists');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const textAnswersEnabled = defaultQuestionType === 'text_open';
      const res = await api.playlists.create(
        name.trim(),
        [
          // Démarre avec un track vide pré-configuré
          {
            id: crypto.randomUUID(),
            title: '',
            answer: '',
            mediaType: defaultMediaType,
            duration: 30,
            textAnswersEnabled,
          } as any,
        ],
        visibility,
        undefined
      );
      toastSuccess('Playlist créée !');
      navigate(`/playlists/${res.playlist.id}`);
    } catch (err: any) {
      toastError(err.message || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    try {
      await api.playlists.delete(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      toastSuccess('Playlist supprimée');
    } catch {
      toastError('Erreur lors de la suppression');
    }
  };

  const handleShare = async (playlistId: string) => {
    try {
      const { token } = await api.playlists.createCollabToken(playlistId);
      const link = `${window.location.origin}/admin/playlist/${playlistId}?collab=${encodeURIComponent(token)}`;
      await navigator.clipboard.writeText(link);
      toastSuccess('Lien de partage copié');
    } catch {
      toastError('Impossible de générer le lien de partage');
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
    </div>
  );
  if (!user) return null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white app-shell">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 border-b border-white/5 sticky top-0 bg-zinc-950/80 backdrop-blur z-10">
        <button
          onClick={() => view === 'create' ? setView('list') : navigate('/admin')}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {view === 'create' ? 'Mes playlists' : 'Dashboard'}
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Music2 className="w-4 h-4 text-indigo-400" />
          <span className="font-bold text-sm">Mes Playlists</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <AnimatePresence mode="wait">
          {view === 'list' ? (
            <motion.div key="list" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-black">Mes playlists</h1>
                  <p className="text-zinc-500 text-sm mt-1">Crée et gère tes playlists de blind test.</p>
                </div>
                <button
                  onClick={() => setView('create')}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Nouvelle playlist
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                </div>
              ) : playlists.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <Music2 className="w-12 h-12 text-zinc-700 mx-auto" />
                  <p className="text-zinc-500">Aucune playlist pour l'instant.</p>
                  <button
                    onClick={() => setView('create')}
                    className="inline-flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Créer ma première playlist
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {playlists.map((pl, i) => (
                    <motion.div
                      key={pl.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-zinc-900 p-4 hover:border-white/15 transition-all"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-300 flex items-center justify-center flex-shrink-0">
                        <Music2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{pl.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-zinc-500">{pl.trackCount} piste{pl.trackCount !== 1 ? 's' : ''}</span>
                          <span className="w-1 h-1 rounded-full bg-zinc-700" />
                          <span className={`text-xs flex items-center gap-1 ${pl.visibility === 'public' ? 'text-emerald-400' : 'text-zinc-600'}`}>
                            {pl.visibility === 'public' ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            {pl.visibility === 'public' ? 'Publique' : 'Privée'}
                          </span>
                          {pl.category && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-zinc-700" />
                              <span className="text-xs text-zinc-600">{pl.category}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => void handleShare(pl.id)}
                          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-emerald-300 border border-white/8 hover:border-emerald-500/30 rounded-lg px-3 py-1.5 transition-all"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          Partager
                        </button>
                        <button
                          onClick={() => navigate(`/playlists/${pl.id}`)}
                          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-300 border border-white/8 hover:border-indigo-500/30 rounded-lg px-3 py-1.5 transition-all"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Éditer
                        </button>
                        <button
                          onClick={() => handleDelete(pl.id, pl.name)}
                          className="text-zinc-700 hover:text-red-400 transition-colors p-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="create" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <form onSubmit={handleCreate} className="space-y-8">
                <div>
                  <h1 className="text-2xl font-black">Nouvelle playlist</h1>
                  <p className="text-zinc-500 text-sm mt-1">Configure les paramètres par défaut — tu pourras les ajuster piste par piste ensuite.</p>
                </div>

                {/* Nom */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Nom de la playlist
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="Ex: Blind test années 80"
                    autoFocus
                    required
                  />
                </div>

                {/* Type de question — le plus important */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                      Comment les joueurs répondent-ils ?
                    </label>
                    <p className="text-xs text-zinc-600">Ce réglage définit ce qu'on attend des joueurs à chaque piste.</p>
                  </div>
                  <div className="space-y-2">
                    {QUESTION_TYPES.map((qt) => (
                      <button
                        key={qt.id}
                        type="button"
                        onClick={() => setDefaultQuestionType(qt.id)}
                        className={`w-full flex items-center gap-4 rounded-2xl border p-4 text-left transition-all ${
                          defaultQuestionType === qt.id
                            ? `${qt.border} ${qt.bg}`
                            : 'border-white/8 bg-zinc-900 hover:border-white/15'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-black/20 flex-shrink-0 ${qt.color}`}>
                          <qt.icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{qt.label}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{qt.desc}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className={`text-[11px] font-medium ${defaultQuestionType === qt.id ? qt.color : 'text-zinc-600'}`}>
                            {qt.expectation}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type de média */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                      Type de média par défaut
                    </label>
                    <p className="text-xs text-zinc-600">Quel type de fichier sera utilisé pour chaque piste ?</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {MEDIA_TYPES.map((mt) => (
                      <button
                        key={mt.value}
                        type="button"
                        onClick={() => setDefaultMediaType(mt.value)}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          defaultMediaType === mt.value
                            ? 'border-indigo-500/40 bg-indigo-600/15 text-indigo-200'
                            : 'border-white/8 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:border-white/15'
                        }`}
                      >
                        <mt.icon className="w-4 h-4 mb-1.5" />
                        <p className="text-xs font-semibold">{mt.label}</p>
                        <p className="text-[10px] opacity-60 mt-0.5">{mt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visibilité */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Visibilité
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibility('private')}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm transition-all ${
                        visibility === 'private'
                          ? 'border-white/30 bg-white/10 text-white'
                          : 'border-white/8 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Lock className="w-4 h-4" />
                      Privée
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility('public')}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm transition-all ${
                        visibility === 'public'
                          ? 'border-emerald-500/40 bg-emerald-600/15 text-emerald-200'
                          : 'border-white/8 bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Globe className="w-4 h-4" />
                      Publique
                    </button>
                  </div>
                  <p className="text-xs text-zinc-600">
                    {visibility === 'public'
                      ? 'Visible dans la bibliothèque partagée.'
                      : 'Seulement accessible par toi et tes co-éditeurs.'}
                  </p>
                </div>

                {/* Résumé avant création */}
                <div className="rounded-2xl border border-white/8 bg-zinc-900/50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Résumé</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs bg-zinc-800 rounded-full px-3 py-1 text-zinc-300">
                      {QUESTION_TYPES.find((q) => q.id === defaultQuestionType)?.label}
                    </span>
                    <span className="text-xs bg-zinc-800 rounded-full px-3 py-1 text-zinc-300">
                      Média : {MEDIA_TYPES.find((m) => m.value === defaultMediaType)?.label}
                    </span>
                    <span className="text-xs bg-zinc-800 rounded-full px-3 py-1 text-zinc-300">
                      {visibility === 'public' ? 'Publique' : 'Privée'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    Ces paramètres seront appliqués à la première piste. Tu pourras tout modifier piste par piste dans l'éditeur.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  {creating ? 'Création...' : 'Créer et ouvrir l\'éditeur'}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
