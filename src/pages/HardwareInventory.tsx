import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Cpu, ArrowLeft, MonitorUp, BookOpen, Trash2, RefreshCw } from 'lucide-react';
import { BlindTestSession } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

interface RegisteredDevice {
  deviceId: string;
  name: string;
  firmware: string;
  createdAt: number;
}

function getSessionsFromStorage(): BlindTestSession[] {
  try {
    const raw = localStorage.getItem('blindtest_admin_sessions_cache');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function HardwareInventory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const sessions = useMemo(() => getSessionsFromStorage(), []);

  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  async function loadDevices() {
    setLoadingDevices(true);
    try {
      const { devices: list } = await api.hardware.listDevices();
      setDevices(list);
    } catch {
      // silencieux si pas connecté
    } finally {
      setLoadingDevices(false);
    }
  }

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    loadDevices();
  }, [user]);

  if (!user) return null;

  const activeSessions = sessions.filter((s) => s.status === 'active');

  async function handleDelete(deviceId: string) {
    if (!confirm(`Supprimer le totem "${deviceId}" de votre inventaire ?`)) return;
    setDeletingId(deviceId);
    try {
      await api.hardware.deleteDevice(deviceId);
      setDevices((prev) => prev.filter((d) => d.deviceId !== deviceId));
    } catch (err: any) {
      toastError(err?.message ?? 'Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 app-shell">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/admin')}
            className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour dashboard
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cpu className="w-6 h-6 text-indigo-400" />
            Inventaire matériel
          </h1>
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/admin/hardware/provision')}
              className="bg-indigo-700 hover:bg-indigo-600 border border-indigo-500/40 rounded-lg px-3 py-2 text-sm flex items-center gap-2 font-semibold"
            >
              <MonitorUp className="w-4 h-4" />
              Provisionner un totem
            </button>
            <button
              onClick={() => navigate('/admin/hardware/tutorial')}
              className="bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Tutoriel montage
            </button>
          </div>
        </div>

        {/* ── Mes totems enregistrés ── */}
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 app-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              Mes totems ({devices.length})
            </h2>
            <button
              onClick={loadDevices}
              disabled={loadingDevices}
              className="text-zinc-400 hover:text-white transition-colors disabled:opacity-40"
              title="Rafraîchir"
            >
              <RefreshCw className={`w-4 h-4 ${loadingDevices ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingDevices ? (
            <p className="text-sm text-zinc-500">Chargement…</p>
          ) : devices.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-zinc-400 text-sm">Aucun totem enregistré sur votre compte.</p>
              <button
                onClick={() => navigate('/admin/hardware/provision')}
                className="bg-indigo-700 hover:bg-indigo-600 px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
              >
                <MonitorUp className="w-4 h-4" />
                Provisionner mon premier totem
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => (
                <div
                  key={d.deviceId}
                  className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{d.name || d.deviceId}</p>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">
                      {d.deviceId}
                      {d.firmware && (
                        <span className="ml-2 text-zinc-600">fw {d.firmware}</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Ajouté le {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(d.deviceId)}
                    disabled={deletingId === d.deviceId}
                    className="shrink-0 text-zinc-500 hover:text-red-400 transition-colors disabled:opacity-40 p-1"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Parties actives ── */}
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 app-card">
          <h2 className="text-lg font-semibold mb-3">Accès rapide inventaire par partie</h2>
          {activeSessions.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Aucune partie active détectée. Lance d&apos;abord une partie depuis le dashboard.
            </p>
          ) : (
            <div className="space-y-3">
              {activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-zinc-950 border border-white/10 rounded-xl p-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{session.title}</p>
                    <p className="text-xs text-zinc-500">
                      Code: <span className="font-mono">{session.gameId}</span> · {session.mode}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/admin/game/${session.gameId}/hardware`)}
                    className="bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg text-sm flex items-center gap-2"
                  >
                    <MonitorUp className="w-4 h-4" />
                    Ouvrir inventaire
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
