import { Music, Cpu, Settings2, LogOut, Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';

type AdminDashboardHeaderProps = {
  userEmail?: string | null;
  activeSessionCount: number;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigateHardware: () => void;
  onNavigateSettings: () => void;
  onLogout: () => void;
};

export function AdminDashboardHeader({
  userEmail,
  activeSessionCount,
  theme,
  onToggleTheme,
  onNavigateHardware,
  onNavigateSettings,
  onLogout,
}: AdminDashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur-lg border-b border-white/5 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Music className="w-4 h-4 text-white" />
          </div>
          {activeSessionCount > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-zinc-950 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping absolute" />
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="font-black text-base tracking-tight leading-none">
            BlindTest<span className="text-indigo-400">Live</span>
          </span>
          <span className="text-[11px] text-zinc-500 mt-0.5 leading-none">{userEmail}</span>
        </div>
        {activeSessionCount > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="hidden sm:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2.5 py-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-emerald-300 font-semibold">{activeSessionCount} en cours</span>
          </motion.div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onNavigateHardware}
          className="text-xs text-zinc-500 hover:text-zinc-200 hover:bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-all"
        >
          <Cpu className="w-3.5 h-3.5" />
          Matériel
        </button>
        <button
          type="button"
          onClick={onNavigateSettings}
          className="text-xs text-zinc-500 hover:text-zinc-200 hover:bg-white/5 border border-white/8 rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-all"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Paramètres
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          className="text-xs text-zinc-500 hover:text-zinc-200 hover:bg-white/5 border border-white/8 rounded-lg p-1.5 transition-all"
          title="Changer de thème"
        >
          {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="text-xs text-zinc-500 hover:text-red-400 hover:bg-red-500/5 border border-white/8 rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          Déco
        </button>
      </div>
    </header>
  );
}
