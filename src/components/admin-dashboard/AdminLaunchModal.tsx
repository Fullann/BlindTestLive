import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, Plus, Trash2 } from 'lucide-react';
import type { Playlist } from '../../types';

export type LaunchOptionsState = {
  isTeamMode: boolean;
  shuffleQuestions: boolean;
  difficulty: 'easy' | 'medium' | 'hard';
  theme: 'dark' | 'neon' | 'retro' | 'minimal';
  enableBonuses: boolean;
  onboardingEnabled: boolean;
  tutorialSeconds: number;
  tournamentMode: boolean;
  strictTimerEnabled: boolean;
  rules: {
    wrongAnswerPenalty: number;
    progressiveLock: boolean;
    progressiveLockBaseMs: number;
    antiSpamPenalty: number;
  };
  teamConfig: Array<{ id: string; name: string; color: string; enabled: boolean }>;
};

type AdminLaunchModalProps = {
  open: boolean;
  onClose: () => void;
  pendingPlaylist: Playlist | null;
  pendingYoutube: { videoId: string; sourceUrl: string } | null;
  launchOptions: LaunchOptionsState;
  setLaunchOptions: Dispatch<SetStateAction<LaunchOptionsState>>;
  onLaunch: () => void;
  createTeamConfigItem: (index: number) => LaunchOptionsState['teamConfig'][number];
};

export function AdminLaunchModal({
  open,
  onClose,
  pendingPlaylist,
  pendingYoutube,
  launchOptions,
  setLaunchOptions,
  onLaunch,
  createTeamConfigItem,
}: AdminLaunchModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const node = panelRef.current;
    if (!node) return;
    const prev = document.activeElement as HTMLElement | null;
    node.focus();
    return () => prev?.focus?.();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="launch-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              handleClose();
            }
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="w-full max-w-2xl bg-zinc-900 border border-white/12 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/60 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 id={titleId} className="text-xl font-semibold">
                  Options de lancement
                </h3>
                <p className="text-sm text-zinc-400 mt-0.5">
                  Configure cette partie — uniquement pour ce lancement.
                  {pendingPlaylist && (
                    <span className="block text-indigo-300/90 mt-1 truncate">{pendingPlaylist.name}</span>
                  )}
                  {pendingYoutube && (
                    <span className="block text-red-300/90 mt-1 truncate">YouTube · {pendingYoutube.videoId}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Fermer la fenêtre"
                className="text-zinc-500 hover:text-zinc-300 hover:bg-white/5 w-8 h-8 rounded-lg flex items-center justify-center transition-all text-lg"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm space-y-2">
                <span className="block text-zinc-300">Difficulté</span>
                <select
                  value={launchOptions.difficulty}
                  onChange={(e) =>
                    setLaunchOptions((prev) => ({
                      ...prev,
                      difficulty: e.target.value as LaunchOptionsState['difficulty'],
                    }))
                  }
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2"
                >
                  <option value="easy">Facile (30s)</option>
                  <option value="medium">Moyen (20s)</option>
                  <option value="hard">Difficile (12s)</option>
                </select>
              </label>
              <label className="bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm space-y-2">
                <span className="block text-zinc-300">Thème visuel</span>
                <select
                  value={launchOptions.theme}
                  onChange={(e) =>
                    setLaunchOptions((prev) => ({
                      ...prev,
                      theme: e.target.value as LaunchOptionsState['theme'],
                    }))
                  }
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2"
                >
                  <option value="dark">Dark</option>
                  <option value="neon">Neon</option>
                  <option value="retro">Retro</option>
                  <option value="minimal">Minimal</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3">
                <span className="text-sm">Bonus et jokers</span>
                <input
                  type="checkbox"
                  checked={launchOptions.enableBonuses}
                  onChange={(e) =>
                    setLaunchOptions((prev) => ({ ...prev, enableBonuses: e.target.checked }))
                  }
                />
              </label>
              <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3">
                <span className="text-sm">Mode équipe</span>
                <input
                  type="checkbox"
                  checked={launchOptions.isTeamMode}
                  onChange={(e) =>
                    setLaunchOptions((prev) => ({ ...prev, isTeamMode: e.target.checked }))
                  }
                />
              </label>
              <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 md:col-span-2">
                <span className="text-sm">Ordre aléatoire</span>
                <input
                  type="checkbox"
                  checked={launchOptions.shuffleQuestions}
                  onChange={(e) =>
                    setLaunchOptions((prev) => ({ ...prev, shuffleQuestions: e.target.checked }))
                  }
                />
              </label>
              <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3">
                <span className="text-sm">Onboarding public (10s)</span>
                <input
                  type="checkbox"
                  checked={launchOptions.onboardingEnabled}
                  onChange={(e) =>
                    setLaunchOptions((prev) => ({ ...prev, onboardingEnabled: e.target.checked }))
                  }
                />
              </label>
              <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3">
                <span className="text-sm">Mode tournoi multi-manches</span>
                <input
                  type="checkbox"
                  checked={launchOptions.tournamentMode}
                  onChange={(e) =>
                    setLaunchOptions((prev) => ({ ...prev, tournamentMode: e.target.checked }))
                  }
                />
              </label>
              <label className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 md:col-span-2">
                <span className="text-sm">Timer strict (révélation auto)</span>
                <input
                  type="checkbox"
                  checked={launchOptions.strictTimerEnabled}
                  onChange={(e) =>
                    setLaunchOptions((prev) => ({ ...prev, strictTimerEnabled: e.target.checked }))
                  }
                />
              </label>
            </div>

            <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium">Règles personnalisées</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs text-zinc-400">
                  Pénalité mauvaise réponse
                  <input
                    type="number"
                    min={-20}
                    max={0}
                    value={launchOptions.rules.wrongAnswerPenalty}
                    onChange={(e) =>
                      setLaunchOptions((prev) => ({
                        ...prev,
                        rules: { ...prev.rules, wrongAnswerPenalty: Number(e.target.value) || 0 },
                      }))
                    }
                    className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Pénalité anti-spam
                  <input
                    type="number"
                    min={-20}
                    max={0}
                    value={launchOptions.rules.antiSpamPenalty}
                    onChange={(e) =>
                      setLaunchOptions((prev) => ({
                        ...prev,
                        rules: { ...prev.rules, antiSpamPenalty: Number(e.target.value) || 0 },
                      }))
                    }
                    className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </label>
                <label className="text-xs text-zinc-400">
                  Verrouillage progressif (ms)
                  <input
                    type="number"
                    min={1000}
                    max={20000}
                    step={500}
                    value={launchOptions.rules.progressiveLockBaseMs}
                    onChange={(e) =>
                      setLaunchOptions((prev) => ({
                        ...prev,
                        rules: {
                          ...prev.rules,
                          progressiveLockBaseMs: Number(e.target.value) || 5000,
                        },
                      }))
                    }
                    className="mt-1 w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200"
                  />
                </label>
              </div>
              <label className="flex items-center justify-between bg-zinc-900 border border-white/10 rounded-lg px-3 py-2">
                <span className="text-sm">Verrouillage progressif actif</span>
                <input
                  type="checkbox"
                  checked={launchOptions.rules.progressiveLock}
                  onChange={(e) =>
                    setLaunchOptions((prev) => ({
                      ...prev,
                      rules: { ...prev.rules, progressiveLock: e.target.checked },
                    }))
                  }
                />
              </label>
            </div>

            {launchOptions.isTeamMode && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-400">Équipes disponibles</p>
                  <button
                    type="button"
                    onClick={() =>
                      setLaunchOptions((prev) => ({
                        ...prev,
                        teamConfig: [...prev.teamConfig, createTeamConfigItem(prev.teamConfig.length)],
                      }))
                    }
                    className="text-xs bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-200 px-3 py-1.5 rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ajouter
                  </button>
                </div>
                {launchOptions.teamConfig.map((team) => (
                  <div
                    key={team.id}
                    className="grid grid-cols-12 gap-2 items-center bg-zinc-950 border border-white/10 rounded-xl p-3"
                  >
                    <div className="col-span-1">
                      <input
                        type="checkbox"
                        checked={team.enabled}
                        onChange={(e) =>
                          setLaunchOptions((prev) => ({
                            ...prev,
                            teamConfig: prev.teamConfig.map((item) =>
                              item.id === team.id ? { ...item, enabled: e.target.checked } : item,
                            ),
                          }))
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="color"
                        value={team.color}
                        onChange={(e) =>
                          setLaunchOptions((prev) => ({
                            ...prev,
                            teamConfig: prev.teamConfig.map((item) =>
                              item.id === team.id ? { ...item, color: e.target.value } : item,
                            ),
                          }))
                        }
                        className="w-full h-9 bg-transparent border border-white/10 rounded"
                      />
                    </div>
                    <div className="col-span-9 flex items-center gap-2">
                      <input
                        type="text"
                        value={team.name}
                        onChange={(e) =>
                          setLaunchOptions((prev) => ({
                            ...prev,
                            teamConfig: prev.teamConfig.map((item) =>
                              item.id === team.id ? { ...item, name: e.target.value } : item,
                            ),
                          }))
                        }
                        className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setLaunchOptions((prev) => ({
                            ...prev,
                            teamConfig: prev.teamConfig.filter((item) => item.id !== team.id),
                          }))
                        }
                        className="text-red-300 hover:text-red-200 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 rounded-lg p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm transition-colors"
              >
                Annuler
              </button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={onLaunch}
                className="bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Lancer la partie
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
