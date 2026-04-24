import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../lib/socket';
import { GameState, Player } from '../types';
import { api } from '../api';

export default function SponsorScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [branding, setBranding] = useState<{ client_name?: string; logo_url?: string; primary_color?: string; accent_color?: string } | null>(null);

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

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    const loadBranding = async () => {
      try {
        const res = await api.events.getBrandingByGame(gameId);
        if (!active) return;
        setBranding(res.branding || null);
      } catch {
        if (!active) return;
        setBranding(null);
      }
    };
    void loadBranding();
    return () => {
      active = false;
    };
  }, [gameId]);

  if (!gameState) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Chargement écran sponsor...</div>;

  const top = (Object.values(gameState.players) as Player[]).sort((a, b) => b.score - a.score).slice(0, 3);
  const primary = branding?.primary_color || '#4f46e5';
  const accent = branding?.accent_color || '#a855f7';

  return (
    <div className="min-h-screen text-white app-shell" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>
      <div className="max-w-6xl mx-auto p-10 h-screen flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/70 text-sm uppercase">Événement</p>
            <h1 className="text-4xl font-black">{branding?.client_name || 'BlindTest Live'}</h1>
            <div className="flex items-center gap-3 mt-3">
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/25 rounded-full px-3 py-1.5">
                <span className="w-3 h-3 rounded-full border border-white/60" style={{ backgroundColor: primary }} />
                <span className="text-xs text-white/90 font-mono">{primary}</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/25 rounded-full px-3 py-1.5">
                <span className="w-3 h-3 rounded-full border border-white/60" style={{ backgroundColor: accent }} />
                <span className="text-xs text-white/90 font-mono">{accent}</span>
              </div>
            </div>
          </div>
          {branding?.logo_url && <img src={branding.logo_url} alt="logo" className="h-28 max-w-[320px] object-contain" />}
        </div>
        <div className="bg-black/30 border border-white/20 rounded-3xl p-8 backdrop-blur-sm">
          <p className="text-white/70 text-sm uppercase mb-2">Classement en direct</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {top.map((p, idx) => (
              <div key={p.id} className="bg-white/10 rounded-2xl p-4 border border-white/15">
                <p className="text-sm text-white/70">#{idx + 1}</p>
                <p className="text-2xl font-bold">{p.name}</p>
                <p className="text-xl mt-1">{p.score} pts</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-white/80">Code participation : <span className="font-mono font-bold">{gameState.id}</span></p>
        </div>
        <p className="text-center text-white/80">Propulsé par BlindTestLive</p>
      </div>
    </div>
  );
}
