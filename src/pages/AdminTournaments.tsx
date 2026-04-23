import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Trophy, Palette } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api';

interface SessionRow {
  id: string;
  title: string;
  game_id: string;
  status: 'active' | 'finished';
  created_at: number;
}

interface TournamentRow {
  id: string;
  name: string;
  created_at: number;
}

function reportToCsv(report: any) {
  const rows = [
    ['Session', report?.blindtest?.title || ''],
    ['Mode', report?.blindtest?.mode || ''],
    ['Code partie', report?.blindtest?.game_id || ''],
    ['Participants', String(report?.kpi?.participants || 0)],
    ['Buzz', String(report?.kpi?.totalBuzzes || 0)],
    ['Bonnes reponses', String(report?.kpi?.totalCorrect || 0)],
    ['Erreurs', String(report?.kpi?.totalWrong || 0)],
    ['Taux reussite (%)', String(report?.kpi?.successRate || 0)],
    [],
    ['Top joueurs', 'Score'],
    ...((report?.topPlayers || []).map((p: any) => [String(p?.name || 'Joueur'), String(p?.score || 0)]) as string[][]),
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export default function AdminTournaments() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [newTournamentName, setNewTournamentName] = useState('');
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [leaderboard, setLeaderboard] = useState<Array<{ name: string; score: number; sessions: number }>>([]);

  const [selectedBrandingBlindtestId, setSelectedBrandingBlindtestId] = useState('');
  const [brandingDraft, setBrandingDraft] = useState({
    clientName: '',
    logoUrl: '',
    primaryColor: '#6366f1',
    accentColor: '#a855f7',
  });
  const [brandingReport, setBrandingReport] = useState<any | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const [tRes, bRes] = await Promise.all([
          api.events.listTournaments(),
          api.blindtests.list(),
        ]);
        if (!active) return;
        setTournaments((tRes.tournaments || []) as TournamentRow[]);
        setSessions((bRes.blindtests || []) as SessionRow[]);
      } catch (error) {
        if (!active) return;
        toastError((error as Error).message || 'Erreur chargement');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [user, navigate, toastError]);

  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0)),
    [sessions],
  );

  const createTournament = async () => {
    if (!newTournamentName.trim()) return;
    try {
      const { tournament } = await api.events.createTournament({ name: newTournamentName.trim() });
      setTournaments((prev) => [tournament as TournamentRow, ...prev]);
      setNewTournamentName('');
      toastSuccess('Tournoi créé');
    } catch (error) {
      toastError((error as Error).message || 'Erreur création tournoi');
    }
  };

  const loadLeaderboard = async (tournamentId: string) => {
    setSelectedTournamentId(tournamentId);
    try {
      const res = await api.events.getTournamentLeaderboard(tournamentId);
      setLeaderboard((res.leaderboard || []) as Array<{ name: string; score: number; sessions: number }>);
    } catch (error) {
      toastError((error as Error).message || 'Erreur chargement classement');
    }
  };

  const attachSession = async (blindtestId: string) => {
    if (!selectedTournamentId) return;
    try {
      await api.events.attachSessionToTournament(selectedTournamentId, blindtestId);
      toastSuccess('Session ajoutée au tournoi');
      await loadLeaderboard(selectedTournamentId);
    } catch (error) {
      toastError((error as Error).message || 'Erreur association session');
    }
  };

  const loadBranding = async (blindtestId: string) => {
    setSelectedBrandingBlindtestId(blindtestId);
    try {
      const [{ branding }, report] = await Promise.all([
        api.events.getBranding(blindtestId),
        api.events.getReport(blindtestId),
      ]);
      setBrandingDraft({
        clientName: branding?.client_name || '',
        logoUrl: branding?.logo_url || '',
        primaryColor: branding?.primary_color || '#6366f1',
        accentColor: branding?.accent_color || '#a855f7',
      });
      setBrandingReport(report || null);
    } catch (error) {
      toastError((error as Error).message || 'Erreur chargement branding');
    }
  };

  const saveBranding = async () => {
    if (!selectedBrandingBlindtestId) return;
    try {
      await api.events.saveBranding(selectedBrandingBlindtestId, brandingDraft);
      const report = await api.events.getReport(selectedBrandingBlindtestId);
      setBrandingReport(report || null);
      toastSuccess('Branding sauvegardé');
    } catch (error) {
      toastError((error as Error).message || 'Erreur sauvegarde branding');
    }
  };

  const exportReportCsv = () => {
    if (!brandingReport) return;
    const csv = reportToCsv(brandingReport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report_${brandingReport?.blindtest?.game_id || 'session'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 app-shell">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/admin')}
            className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour dashboard
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-indigo-400" />
            Tournois & Rapports B2B
          </h1>
          <div />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 app-card">
            <h2 className="text-lg font-semibold mb-3">Tournoi multi-soirées</h2>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newTournamentName}
                onChange={(e) => setNewTournamentName(e.target.value)}
                placeholder="Nom du tournoi"
                className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={createTournament} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-3 py-2 text-sm">
                Créer
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-auto pr-1 mb-3">
              {tournaments.length === 0 && <p className="text-xs text-zinc-500">Aucun tournoi.</p>}
              {tournaments.map((t) => (
                <button
                  key={t.id}
                  onClick={() => void loadLeaderboard(t.id)}
                  className={`w-full text-left border rounded-lg px-3 py-2 text-sm ${
                    selectedTournamentId === t.id ? 'bg-indigo-600/20 border-indigo-500/40' : 'bg-zinc-950 border-white/10'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
            {selectedTournamentId && (
              <>
                <p className="text-xs text-zinc-500 uppercase mb-2">Ajouter une session</p>
                <div className="flex flex-wrap gap-2 max-h-28 overflow-auto pr-1">
                  {orderedSessions.slice(0, 20).map((session) => (
                    <button
                      key={session.id}
                      onClick={() => void attachSession(session.id)}
                      className="text-xs bg-zinc-950 hover:bg-zinc-800 border border-white/10 rounded px-2 py-1"
                    >
                      {session.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 app-card">
            <h2 className="text-lg font-semibold mb-3">Classement cumulé</h2>
            <div className="space-y-1 max-h-80 overflow-auto pr-1">
              {selectedTournamentId === '' && <p className="text-xs text-zinc-500">Sélectionne un tournoi.</p>}
              {selectedTournamentId !== '' && leaderboard.length === 0 && <p className="text-xs text-zinc-500">Pas de scores pour le moment.</p>}
              {leaderboard.map((entry, idx) => (
                <div key={`${entry.name}-${idx}`} className="flex items-center justify-between text-sm border-b border-white/5 py-1.5">
                  <span className="text-zinc-200">#{idx + 1} {entry.name}</span>
                  <span className="text-indigo-300 font-semibold">{entry.score} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 app-card">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Palette className="w-5 h-5 text-indigo-400" />
            Rapport B2B & marque blanche
          </h2>
          <div className="flex gap-2 mb-3">
            <select
              value={selectedBrandingBlindtestId}
              onChange={(e) => void loadBranding(e.target.value)}
              className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Choisir une session</option>
              {orderedSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.game_id})
                </option>
              ))}
            </select>
            <button onClick={saveBranding} disabled={!selectedBrandingBlindtestId} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg px-3 py-2 text-sm">
              Enregistrer
            </button>
            <button onClick={exportReportCsv} disabled={!brandingReport} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg px-3 py-2 text-sm inline-flex items-center gap-1.5">
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <input
              type="text"
              value={brandingDraft.clientName}
              onChange={(e) => setBrandingDraft((prev) => ({ ...prev, clientName: e.target.value }))}
              placeholder="Nom client"
              className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={brandingDraft.logoUrl}
              onChange={(e) => setBrandingDraft((prev) => ({ ...prev, logoUrl: e.target.value }))}
              placeholder="URL logo"
              className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
            <label className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
              Couleur primaire
              <input type="color" value={brandingDraft.primaryColor} onChange={(e) => setBrandingDraft((prev) => ({ ...prev, primaryColor: e.target.value }))} />
            </label>
            <label className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
              Couleur accent
              <input type="color" value={brandingDraft.accentColor} onChange={(e) => setBrandingDraft((prev) => ({ ...prev, accentColor: e.target.value }))} />
            </label>
          </div>

          {brandingReport && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <div className="bg-zinc-950 border border-white/10 rounded p-2"><p className="text-zinc-500">Participants</p><p className="text-lg font-bold">{brandingReport.kpi?.participants || 0}</p></div>
              <div className="bg-zinc-950 border border-white/10 rounded p-2"><p className="text-zinc-500">Buzz</p><p className="text-lg font-bold">{brandingReport.kpi?.totalBuzzes || 0}</p></div>
              <div className="bg-zinc-950 border border-white/10 rounded p-2"><p className="text-zinc-500">Bonnes</p><p className="text-lg font-bold">{brandingReport.kpi?.totalCorrect || 0}</p></div>
              <div className="bg-zinc-950 border border-white/10 rounded p-2"><p className="text-zinc-500">Erreurs</p><p className="text-lg font-bold">{brandingReport.kpi?.totalWrong || 0}</p></div>
              <div className="bg-zinc-950 border border-white/10 rounded p-2"><p className="text-zinc-500">Taux réussite</p><p className="text-lg font-bold">{brandingReport.kpi?.successRate || 0}%</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
