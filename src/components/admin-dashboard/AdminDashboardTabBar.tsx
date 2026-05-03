import { motion } from 'framer-motion';

export type AdminDashboardTabId = 'sessions' | 'lancer' | 'stats' | 'business';

type TabDef = { id: AdminDashboardTabId; label: string; badge?: number };

type AdminDashboardTabBarProps = {
  tabs: TabDef[];
  activeTab: AdminDashboardTabId;
  onChange: (id: AdminDashboardTabId) => void;
};

export function AdminDashboardTabBar({ tabs, activeTab, onChange }: AdminDashboardTabBarProps) {
  return (
    <div className="flex items-center gap-1 bg-zinc-900 border border-white/8 rounded-2xl p-1.5 mb-8 w-fit">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === tab.id ? 'text-white shadow' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          {activeTab === tab.id && (
            <motion.span
              layoutId="admin-tab-active-pill"
              className="absolute inset-0 rounded-xl bg-indigo-600"
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative">{tab.label}</span>
          {tab.badge !== undefined && (
            <span className="relative ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
