import clsx from 'clsx';
import { Unlock, UserMinus } from 'lucide-react';
import type { GameState, Player } from '../../types';

export type HostGamePlayerCardProps = {
  player: Player;
  gameState: GameState;
  hostRole: 'owner' | 'cohost';
  isSafeMode: boolean;
  playerToKick: string | null;
  setPlayerToKick: (id: string | null) => void;
  onAssignTeam: (playerId: string, teamId: string) => void;
  onApplyPower: (power: 'x2' | 'freeze' | 'comeback', playerId: string) => void;
  onUnlock: (playerId: string) => void;
  onKick: (playerId: string) => void;
  onAdjustScore: (playerId: string, delta: number) => void;
};

function teamName(gameState: GameState, teamId: string) {
  return gameState.teamConfig?.find((t) => t.id === teamId)?.name || teamId;
}

function teamColor(gameState: GameState, teamId: string) {
  return gameState.teamConfig?.find((t) => t.id === teamId)?.color || '#ffffff';
}

/** Carte joueur (liste animateur) — sans animation pour réutilisation virtualisée / statique */
export function HostGamePlayerCard({
  player,
  gameState,
  hostRole,
  isSafeMode,
  playerToKick,
  setPlayerToKick,
  onAssignTeam,
  onApplyPower,
  onUnlock,
  onKick,
  onAdjustScore,
}: HostGamePlayerCardProps) {
  return (
    <div
      className={clsx(
        'p-3 rounded-xl flex items-center justify-between border transition-all',
        player.id === gameState.buzzedPlayerId
          ? 'border-orange-500/40 bg-orange-500/8'
          : player.lockedOut
            ? 'border-red-500/40 bg-red-500/10 opacity-60'
            : 'border-white/5 bg-zinc-950',
      )}
      style={
        player.id === gameState.buzzedPlayerId
          ? { boxShadow: `0 0 16px ${player.color}30` }
          : undefined
      }
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{
            backgroundColor:
              gameState.isTeamMode && player.team ? teamColor(gameState, player.team) : player.color,
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{player.name}</p>
          {gameState.isTeamMode && player.team && (
            <p className="text-xs text-zinc-500">Équipe {teamName(gameState, player.team)}</p>
          )}
          {gameState.isTeamMode && hostRole === 'owner' && !isSafeMode && (
            <select
              value={player.team || ''}
              onChange={(e) => onAssignTeam(player.id, e.target.value)}
              className="mt-1 bg-zinc-900 border border-white/10 rounded px-1.5 py-0.5 text-xs"
            >
              <option value="">Aucune équipe</option>
              {(gameState.teamConfig || [])
                .filter((t) => t.enabled)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          )}
          {hostRole === 'owner' && !isSafeMode && (
            <div className="mt-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => onApplyPower('x2', player.id)}
                className="text-[9px] bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 rounded"
              >
                x2
              </button>
              <button
                type="button"
                onClick={() => onApplyPower('freeze', player.id)}
                className="text-[9px] bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 rounded"
              >
                Freeze
              </button>
              <button
                type="button"
                onClick={() => onApplyPower('comeback', player.id)}
                className="text-[9px] bg-zinc-800 hover:bg-zinc-700 px-1.5 py-0.5 rounded"
              >
                Comeback
              </button>
            </div>
          )}
        </div>
        {player.lockedOut && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs text-red-400 font-bold">Bloqué</span>
            <button
              type="button"
              onClick={() => onUnlock(player.id)}
              className="bg-zinc-800 hover:bg-zinc-700 p-1 rounded"
              title="Débloquer"
            >
              <Unlock className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        {hostRole === 'owner' && !isSafeMode && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => onAdjustScore(player.id, -1)}
              className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800 hover:bg-red-900/60 hover:text-red-300 text-zinc-400 text-xs font-bold transition-colors"
              title="Retirer 1 point"
            >
              −
            </button>
            <span className="font-mono font-bold text-sm w-7 text-center">{player.score}</span>
            <button
              type="button"
              onClick={() => onAdjustScore(player.id, 1)}
              className="w-5 h-5 flex items-center justify-center rounded bg-zinc-800 hover:bg-emerald-900/60 hover:text-emerald-300 text-zinc-400 text-xs font-bold transition-colors"
              title="Ajouter 1 point"
            >
              +
            </button>
          </div>
        )}
        {(hostRole !== 'owner' || isSafeMode) && (
          <span className="font-mono font-bold text-sm">{player.score}</span>
        )}
        {hostRole === 'owner' && !isSafeMode && (
          <div className="relative">
            {playerToKick === player.id ? (
              <div className="absolute right-0 top-full mt-1 bg-zinc-800 p-3 rounded-xl border border-white/10 shadow-xl z-50 w-40">
                <p className="text-xs mb-2 text-center">Exclure {player.name} ?</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onKick(player.id)}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs"
                  >
                    Oui
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerToKick(null)}
                    className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded text-xs"
                  >
                    Non
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPlayerToKick(player.id)}
                className="text-zinc-600 hover:text-red-400 p-1 rounded transition-colors"
                title="Exclure"
              >
                <UserMinus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
