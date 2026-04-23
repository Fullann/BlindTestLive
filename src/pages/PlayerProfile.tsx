import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../api';

export default function PlayerProfile() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!publicId) return;
    let active = true;
    const load = async () => {
      try {
        const [profileRes, historyRes] = await Promise.all([
          api.playerProfiles.get(publicId),
          api.playerProfiles.history(publicId),
        ]);
        if (!active) return;
        setProfile(profileRes.profile || null);
        setHistory(historyRes.sessions || []);
      } catch {
        if (!active) return;
        setProfile(null);
        setHistory([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [publicId]);

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement...</div>;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-6 app-shell">
        <button onClick={() => navigate('/')} className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>
        <div className="max-w-xl mx-auto mt-10 text-center text-zinc-400">Profil introuvable.</div>
      </div>
    );
  }

  let badges: string[] = [];
  try {
    badges = Array.isArray(profile.badges_json) ? profile.badges_json : JSON.parse(profile.badges_json || '[]');
  } catch {
    badges = [];
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 app-shell">
      <div className="max-w-3xl mx-auto space-y-5">
        <button onClick={() => navigate('/')} className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Retour
        </button>
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5">
          <h1 className="text-2xl font-bold">{profile.nickname}</h1>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4 text-sm">
            <div className="bg-zinc-950 rounded p-2"><p className="text-zinc-500 text-xs">Sessions</p><p className="font-semibold">{profile.total_sessions}</p></div>
            <div className="bg-zinc-950 rounded p-2"><p className="text-zinc-500 text-xs">Score total</p><p className="font-semibold">{profile.total_score}</p></div>
            <div className="bg-zinc-950 rounded p-2"><p className="text-zinc-500 text-xs">Buzz</p><p className="font-semibold">{profile.total_buzzes}</p></div>
            <div className="bg-zinc-950 rounded p-2"><p className="text-zinc-500 text-xs">Bonnes</p><p className="font-semibold">{profile.total_correct}</p></div>
            <div className="bg-zinc-950 rounded p-2"><p className="text-zinc-500 text-xs">Erreurs</p><p className="font-semibold">{profile.total_wrong}</p></div>
          </div>
          <div className="mt-4">
            <p className="text-xs text-zinc-500 mb-1">Badges</p>
            <div className="flex flex-wrap gap-2">
              {badges.length === 0 && <span className="text-xs text-zinc-500">Aucun badge pour le moment</span>}
              {badges.map((badge) => (
                <span key={badge} className="text-xs bg-indigo-600/20 border border-indigo-500/30 rounded-full px-2.5 py-1">
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5">
          <h2 className="text-lg font-semibold mb-3">Historique</h2>
          <div className="space-y-2 max-h-96 overflow-auto pr-1">
            {history.length === 0 && <p className="text-sm text-zinc-500">Aucune partie sauvegardée.</p>}
            {history.map((row, idx) => (
              <div key={`${row.game_id}-${idx}`} className="bg-zinc-950 border border-white/10 rounded-lg p-3 text-sm flex items-center justify-between">
                <div>
                  <p className="font-medium">{row.player_name}</p>
                  <p className="text-xs text-zinc-500">Code: {row.game_id} • {new Date(row.created_at).toLocaleString('fr-FR')}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-indigo-300">{row.score} pts</p>
                  <p className="text-xs text-zinc-500">buzz {row.buzzes} • ok {row.correct_answers} • err {row.wrong_answers}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
