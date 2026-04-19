import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, HardwareDeviceState, Player } from '../types';
import { useToast } from '../context/ToastContext';
import { ArrowLeft, Cpu, Link2Off, Speaker, Volume2, VolumeX, WandSparkles } from 'lucide-react';

export default function HardwareDashboard() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [nameDraft, setNameDraft] = useState<Record<string, string>>({});
  const [assignDraft, setAssignDraft] = useState<Record<string, string>>({});
  const hostToken = gameId
    ? sessionStorage.getItem(`blindtest_host_${gameId}`) || localStorage.getItem(`blindtest_host_${gameId}`)
    : null;

  useEffect(() => {
    if (!gameId || !hostToken) {
      navigate('/');
      return;
    }
    const join = () => socket.emit('host:joinGame', { gameId, hostToken }, () => {
      socket.emit('game:requestState', { gameId, hostToken }, () => {});
    });
    join();
    socket.on('connect', join);
    const onState = (state: GameState) => setGameState(state);
    socket.on('game:stateUpdate', onState);
    return () => {
      socket.off('connect', join);
      socket.off('game:stateUpdate', onState);
    };
  }, [gameId, hostToken, navigate]);

  const players = useMemo(() => Object.values((gameState?.players || {}) as Record<string, Player>), [gameState]);
  const devices = useMemo(
    () => Object.values((gameState?.hardwareDevices || {}) as Record<string, HardwareDeviceState>),
    [gameState],
  );

  const assignDevice = (playerId: string, deviceId: string) => {
    if (!gameId || !hostToken) return;
    socket.emit('host:assignDevice', { gameId, hostToken, playerId, deviceId }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Assignation impossible'); else toastSuccess('Buzzer assigné.');
    });
  };

  const unassignDevice = (playerId: string) => {
    if (!gameId || !hostToken) return;
    socket.emit('host:unassignDevice', { gameId, hostToken, playerId }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Dissociation impossible'); else toastSuccess('Buzzer dissocié.');
    });
  };

  const renameDevice = (deviceId: string) => {
    const value = (nameDraft[deviceId] || '').trim();
    if (!value || !gameId || !hostToken) return;
    socket.emit('host:renameDevice', { gameId, hostToken, deviceId, name: value }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Renommage impossible'); else toastSuccess('Renommage effectué.');
    });
  };

  const testLed = (deviceId: string) => {
    if (!gameId || !hostToken) return;
    socket.emit('host:testDeviceLed', { gameId, hostToken, deviceId, pattern: 'blink' }, () => {});
  };

  const testSpeaker = (deviceId: string) => {
    if (!gameId || !hostToken) return;
    socket.emit('host:testDeviceSpeaker', { gameId, hostToken, deviceId, pattern: 'short' }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Test audio impossible'); else toastInfo('Test audio envoyé.');
    });
  };

  const setSpeaker = (deviceId: string, patch: { speakerMuted?: boolean; speakerEnabled?: boolean }) => {
    if (!gameId || !hostToken) return;
    socket.emit('host:setDeviceSpeaker', { gameId, hostToken, deviceId, ...patch }, (res: any) => {
      if (!res?.success) toastError(res?.error || 'Mise à jour haut-parleur impossible');
    });
  };

  if (!gameState) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement matériel...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 app-shell">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(`/admin/game/${gameState.id}`)} className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Retour partie
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cpu className="w-6 h-6 text-indigo-400" />
            Inventaire matériel - {gameState.id}
          </h1>
          <div className="text-xs text-zinc-400">
            {devices.filter((d) => d.status === 'online').length} / {devices.length} en ligne
          </div>
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 app-card">
          <h2 className="font-semibold mb-3">Appareils</h2>
          <div className="space-y-3">
            {devices.length === 0 && <p className="text-sm text-zinc-500">Aucun device détecté.</p>}
            {devices.map((device) => (
              <div key={device.id} className="bg-zinc-950 border border-white/10 rounded-xl p-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-medium">{device.name || device.id}</p>
                    <p className="text-xs text-zinc-500">{device.id} • {device.status === 'online' ? 'En ligne' : 'Hors ligne'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={nameDraft[device.id] ?? device.name ?? ''}
                      onChange={(e) => setNameDraft((prev) => ({ ...prev, [device.id]: e.target.value }))}
                      className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs"
                      placeholder="Nom du buzzer"
                    />
                    <button onClick={() => renameDevice(device.id)} className="bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs">Renommer</button>
                    <button onClick={() => testLed(device.id)} className="bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1"><WandSparkles className="w-3.5 h-3.5" />LED</button>
                    <button onClick={() => testSpeaker(device.id)} className="bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1"><Speaker className="w-3.5 h-3.5" />Audio</button>
                    <button onClick={() => setSpeaker(device.id, { speakerEnabled: !(device.speakerEnabled ?? true) })} className="bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs">
                      {(device.speakerEnabled ?? true) ? 'Désactiver HP' : 'Activer HP'}
                    </button>
                    <button onClick={() => setSpeaker(device.id, { speakerMuted: !(device.speakerMuted ?? false) })} className="bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1">
                      {(device.speakerMuted ?? false) ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                      {(device.speakerMuted ?? false) ? 'Unmute' : 'Mute'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 app-card">
          <h2 className="font-semibold mb-3">Affectation joueurs</h2>
          <div className="space-y-3">
            {players.map((player) => (
              <div key={player.id} className="bg-zinc-950 border border-white/10 rounded-xl p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="font-medium">{player.name}</p>
                  <p className="text-xs text-zinc-500">{player.buzzerDeviceId ? `Device: ${player.buzzerDeviceId}` : 'Aucun device'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={assignDraft[player.id] ?? player.buzzerDeviceId ?? ''}
                    onChange={(e) => setAssignDraft((prev) => ({ ...prev, [player.id]: e.target.value }))}
                    placeholder="deviceId"
                    className="bg-zinc-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs"
                  />
                  <button onClick={() => assignDevice(player.id, (assignDraft[player.id] ?? '').trim())} className="bg-indigo-600 hover:bg-indigo-500 px-2.5 py-1.5 rounded-lg text-xs">
                    Assigner
                  </button>
                  <button onClick={() => unassignDevice(player.id)} className="bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1">
                    <Link2Off className="w-3.5 h-3.5" />
                    Dissocier
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
