import { motion } from 'framer-motion';
import type { BlindTestSession } from '../../types';

type AdminActiveSessionRowProps = {
  session: BlindTestSession;
  endingSessionId: string | null;
  onResume: () => void;
  onEnd: () => void;
  variant: 'motion' | 'static';
};

export function AdminActiveSessionRow({
  session,
  endingSessionId,
  onResume,
  onEnd,
  variant,
}: AdminActiveSessionRowProps) {
  const inner = (
    <div
      className="bg-zinc-950 border border-emerald-500/25 rounded-xl p-4 flex items-center justify-between transition-all hover:border-emerald-400/50"
      style={{ boxShadow: '0 0 20px rgba(52,211,153,0.06)' }}
    >
      <div>
        <p className="font-semibold">{session.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-zinc-500">Code:</span>
          <code className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
            {session.gameId}
          </code>
          <span className="text-xs text-zinc-600">
            {new Date(session.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={onResume}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors shadow-md shadow-indigo-500/20"
        >
          Reprendre →
        </motion.button>
        <button
          type="button"
          onClick={onEnd}
          disabled={endingSessionId === session.id}
          className="bg-red-600/15 hover:bg-red-600/25 disabled:opacity-50 text-red-400 px-3 py-2 rounded-xl text-xs border border-red-500/20 transition-colors"
        >
          {endingSessionId === session.id ? 'Arrêt…' : 'Terminer'}
        </button>
      </div>
    </div>
  );

  if (variant === 'motion') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.98 }}
        whileHover={{ y: -2, scale: 1.005 }}
      >
        {inner}
      </motion.div>
    );
  }

  return inner;
}
