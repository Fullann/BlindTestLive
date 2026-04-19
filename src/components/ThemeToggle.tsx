import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="fixed bottom-5 right-5 z-[100] rounded-full border border-white/15 bg-zinc-900/85 backdrop-blur-md p-3 text-zinc-100 shadow-xl transition-all hover:scale-105 hover:border-indigo-400/50"
      title={theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair'}
      aria-label={theme === 'light' ? 'Passer en mode sombre' : 'Passer en mode clair'}
    >
      {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  );
}
