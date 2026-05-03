import { Edit, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Playlist } from '../../types';

export type AdminPlaylistLaunchCardProps = {
  playlist: Playlist;
  badges: string[];
  onEdit: () => void;
  onLaunch: () => void;
  /** false = carte statique (listes longues / virtualisation) */
  animate?: boolean;
  /** index pour stagger limité quand animate */
  motionIndex?: number;
};

export function AdminPlaylistLaunchCard({
  playlist,
  badges,
  onEdit,
  onLaunch,
  animate = true,
  motionIndex = 0,
}: AdminPlaylistLaunchCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{playlist.name}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {playlist.tracks.length} piste{playlist.tracks.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 justify-end flex-shrink-0">
          {badges.map((b) => (
            <span
              key={b}
              className="text-[10px] bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 text-xs text-zinc-500 hover:text-zinc-300 border border-white/8 hover:border-white/15 rounded-lg py-1.5 transition-all flex items-center justify-center gap-1"
        >
          <Edit className="w-3.5 h-3.5" />
          Éditer
        </button>
        <button
          type="button"
          onClick={onLaunch}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
        >
          <Play className="w-4 h-4" />
          Lancer
        </button>
      </div>
    </>
  );

  const className =
    'bg-zinc-950 border border-white/8 rounded-2xl p-4 flex flex-col gap-3 hover:border-white/15 transition-all';

  if (animate) {
    const capped = Math.min(motionIndex, 24);
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.015 * capped }}
        whileHover={{ y: -3, scale: 1.01 }}
        className={className}
      >
        {body}
      </motion.div>
    );
  }

  return <div className={className}>{body}</div>;
}
