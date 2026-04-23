import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, Player } from '../types';

export default function HostReturnScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const [gameState, setGameState] = useState<GameState | null>(null);

  useEffect(() => {
    if (!gameId) return;
    const join = () =>
      socket.emit('screen:joinGame', gameId, (res: any) => {
        if (!res?.success) return;
        socket.emit('game:requestState', { gameId, asScreen: true }, () => {});
      });
    join();
    socket.on('connect', join);
    const onState = (state: GameState) => setGameState(state);
    socket.on('game:stateUpdate', onState);
    return () => {
      socket.off('connect', join);
      socket.off('game:stateUpdate', onState);
    };
  }, [gameId]);

  if (!gameState) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement retour animateur...</div>;

  const players = (Object.values(gameState.players) as Player[]).sort((a, b) => b.score - a.score);
  const track = gameState.playlist?.[gameState.currentTrackIndex];

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 app-shell">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-zinc-900 border border-white/10 rounded-2xl p-5">
          <p className="text-xs text-zinc-500 uppercase">Retour animateur</p>
          <h1 className="text-2xl font-bold mt-1">Partie {gameState.id}</h1>
          <p className="text-sm text-zinc-400 mt-1">Statut: {gameState.status}</p>
          {!gameState.youtubeVideoId && (
            <div className="mt-4 bg-zinc-950 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-zinc-500">Question en cours</p>
              <p className="text-lg font-semibold mt-1">{track?.title || 'Titre masqué'}</p>
              <p className="text-zinc-400 text-sm">{track?.artist || 'Artiste inconnu'}</p>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="bg-zinc-950 border border-white/10 rounded p-3"><p className="text-zinc-500 text-xs">Joueurs</p><p className="font-bold">{players.length}</p></div>
            <div className="bg-zinc-950 border border-white/10 rounded p-3"><p className="text-zinc-500 text-xs">Piste</p><p className="font-bold">{gameState.currentTrackIndex + 1}/{gameState.playlist.length || 1}</p></div>
            <div className="bg-zinc-950 border border-white/10 rounded p-3"><p className="text-zinc-500 text-xs">Buzzé</p><p className="font-bold">{gameState.buzzedPlayerId ? gameState.players[gameState.buzzedPlayerId]?.name || '-' : '-'}</p></div>
            <div className="bg-zinc-950 border border-white/10 rounded p-3"><p className="text-zinc-500 text-xs">Mode</p><p className="font-bold">{gameState.youtubeVideoId ? 'YouTube' : 'Playlist'}</p></div>
          </div>
        </div>
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5">
          <p className="text-xs text-zinc-500 uppercase mb-3">Classement live</p>
          <div className="space-y-2">
            {players.map((p, idx) => (
              <div key={p.id} className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                <span>#{idx + 1} {p.name}</span>
                <span className="font-semibold text-indigo-300">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
