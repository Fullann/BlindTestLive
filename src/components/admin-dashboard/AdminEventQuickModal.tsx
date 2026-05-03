import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import type { NavigateFunction } from 'react-router-dom';
import type { Playlist } from '../../types';

export type EventQuickBranding = {
  clientName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
};

type AdminEventQuickModalProps = {
  open: boolean;
  onClose: () => void;
  eventQuickStep: 1 | 2 | 3;
  setEventQuickStep: (s: 1 | 2 | 3) => void;
  eventQuickPlaylistId: string;
  setEventQuickPlaylistId: (id: string) => void;
  playlists: Playlist[];
  eventQuickBranding: EventQuickBranding;
  setEventQuickBranding: Dispatch<SetStateAction<EventQuickBranding>>;
  eventQuickBusy: boolean;
  onPrepareEventQuick: () => void;
  eventQuickCreated: { gameId: string; joinUrl: string; screenUrl: string } | null;
  navigate: NavigateFunction;
};

export function AdminEventQuickModal({
  open,
  onClose,
  eventQuickStep,
  setEventQuickStep,
  eventQuickPlaylistId,
  setEventQuickPlaylistId,
  playlists,
  eventQuickBranding,
  setEventQuickBranding,
  eventQuickBusy,
  onPrepareEventQuick,
  eventQuickCreated,
  navigate,
}: AdminEventQuickModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

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
          key="eq-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
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
            className="w-full max-w-2xl bg-zinc-900 border border-white/12 rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/60 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 id={titleId} className="text-xl font-semibold">
                  Mode événement — lancement guidé
                </h3>
                <div className="flex items-center gap-1.5 mt-2">
                  {[1, 2, 3].map((s) => (
                    <div
                      key={s}
                      className={`h-1 rounded-full transition-all duration-300 ${
                        s <= eventQuickStep ? 'bg-indigo-500 w-8' : 'bg-zinc-700 w-5'
                      }`}
                    />
                  ))}
                  <span className="text-xs text-zinc-500 ml-1">Étape {eventQuickStep}/3</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer la fenêtre"
                className="text-zinc-500 hover:text-zinc-300 hover:bg-white/5 w-8 h-8 rounded-lg flex items-center justify-center transition-all text-lg"
              >
                ×
              </button>
            </div>
            <AnimatePresence mode="wait">
              {eventQuickStep === 1 && (
                <motion.div
                  key="eq-step-1"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4"
                >
                  <p className="text-sm text-zinc-400">Choisis la playlist à lancer.</p>
                  <select
                    value={eventQuickPlaylistId}
                    onChange={(e) => setEventQuickPlaylistId(e.target.value)}
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">Sélectionner une playlist</option>
                    {playlists.map((playlist) => (
                      <option key={playlist.id} value={playlist.id}>
                        {playlist.name} ({playlist.tracks.length} pistes)
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm transition-colors"
                    >
                      Annuler
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      onClick={() => setEventQuickStep(2)}
                      disabled={!eventQuickPlaylistId}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-5 py-2 rounded-xl text-sm font-semibold transition-colors"
                    >
                      Continuer →
                    </motion.button>
                  </div>
                </motion.div>
              )}
              {eventQuickStep === 2 && (
                <motion.div
                  key="eq-step-2"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4"
                >
                  <p className="text-sm text-zinc-400">Configure le branding à appliquer automatiquement.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={eventQuickBranding.clientName}
                      onChange={(e) =>
                        setEventQuickBranding((prev) => ({ ...prev, clientName: e.target.value }))
                      }
                      placeholder="Nom client / événement"
                      className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                    <input
                      type="text"
                      value={eventQuickBranding.logoUrl}
                      onChange={(e) =>
                        setEventQuickBranding((prev) => ({ ...prev, logoUrl: e.target.value }))
                      }
                      placeholder="URL logo (optionnel)"
                      className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                    <label className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm flex items-center justify-between">
                      Couleur primaire
                      <input
                        type="color"
                        value={eventQuickBranding.primaryColor}
                        onChange={(e) =>
                          setEventQuickBranding((prev) => ({ ...prev, primaryColor: e.target.value }))
                        }
                      />
                    </label>
                    <label className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm flex items-center justify-between">
                      Couleur accent
                      <input
                        type="color"
                        value={eventQuickBranding.accentColor}
                        onChange={(e) =>
                          setEventQuickBranding((prev) => ({ ...prev, accentColor: e.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setEventQuickStep(1)}
                      className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm transition-colors"
                    >
                      ← Retour
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      onClick={() => void onPrepareEventQuick()}
                      disabled={eventQuickBusy}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-5 py-2 rounded-xl text-sm font-semibold transition-colors"
                    >
                      {eventQuickBusy ? (
                        <span className="flex items-center gap-2">
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                            className="w-3.5 h-3.5 rounded-full border border-white/30 border-t-white inline-block"
                          />
                          Préparation…
                        </span>
                      ) : (
                        'Préparer QR live'
                      )}
                    </motion.button>
                  </div>
                </motion.div>
              )}
              {eventQuickStep === 3 && eventQuickCreated && (
                <motion.div
                  key="eq-step-3"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2 text-emerald-400">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xs">
                      ✓
                    </div>
                    <p className="text-sm font-medium">Session créée — QR prêt !</p>
                  </div>
                  <div className="bg-zinc-950 border border-white/10 rounded-2xl p-5 flex flex-col items-center gap-4">
                    <div className="p-3 bg-white rounded-xl">
                      <QRCodeSVG value={eventQuickCreated.joinUrl} size={160} />
                    </div>
                    <p className="text-xs text-zinc-500 text-center break-all">{eventQuickCreated.joinUrl}</p>
                    <a
                      href={eventQuickCreated.screenUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 hover:text-indigo-200 text-sm underline underline-offset-2 transition-colors"
                    >
                      Ouvrir l'écran public →
                    </a>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm transition-colors"
                    >
                      Fermer
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      onClick={() => navigate(`/admin/game/${eventQuickCreated.gameId}?safe=1`)}
                      className="bg-emerald-600 hover:bg-emerald-500 px-5 py-2 rounded-xl text-sm font-semibold transition-colors"
                    >
                      Démarrer (safe mode) →
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
