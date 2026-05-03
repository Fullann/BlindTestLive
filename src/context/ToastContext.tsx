import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ─── Types ──────────────────────────────────────────────── */
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (message: string, type?: ToastType, durationMs?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/* ─── Provider ───────────────────────────────────────────── */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info', durationMs = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
      timers.current[id] = setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const success = useCallback((msg: string) => toast(msg, 'success'), [toast]);
  const error   = useCallback((msg: string) => toast(msg, 'error', 6000), [toast]);
  const info    = useCallback((msg: string) => toast(msg, 'info'), [toast]);
  const warning = useCallback((msg: string) => toast(msg, 'warning', 5000), [toast]);

  /* Écoute l'événement global de session expirée */
  useEffect(() => {
    const handler = () => error('Session expirée. Veuillez vous reconnecter.');
    window.addEventListener('blindtest:session-expired', handler);
    return () => window.removeEventListener('blindtest:session-expired', handler);
  }, [error]);

  return (
    <ToastContext.Provider value={{ toasts, toast, success, error, info, warning, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* ─── Hook ───────────────────────────────────────────────── */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast doit être utilisé dans un ToastProvider');
  return ctx;
}

/* ─── Composant UI ───────────────────────────────────────── */
const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
};

const COLORS: Record<ToastType, string> = {
  success: 'bg-green-600 border-green-500',
  error:   'bg-red-700 border-red-600',
  info:    'bg-blue-700 border-blue-600',
  warning: 'bg-yellow-600 border-yellow-500',
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl text-white text-sm animate-fade-in ${COLORS[t.type]}`}
        >
          <span className="text-base font-bold shrink-0 mt-0.5">{ICONS[t.type]}</span>
          <span className="flex-1 leading-relaxed">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="shrink-0 text-white/60 hover:text-white transition-colors text-base leading-none mt-0.5"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
