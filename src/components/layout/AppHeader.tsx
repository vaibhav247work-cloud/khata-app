import React from 'react';
import { motion } from 'motion/react';
import { 
  Building2, 
  Menu, 
  ChevronRight, 
  ShieldCheck, 
  UserCheck, 
  RefreshCw, 
  Key, 
  LogOut 
} from 'lucide-react';
import { type Tab } from '../../types/common';
import { type AuthSession } from '../../types/auth';
import { PWAHeaderInstallButton } from '../PWAInstallBanner';

interface AppHeaderProps {
  activeTab: Tab;
  onOpenSidebar: () => void;
  syncStatusTitle: string;
  syncStatusDotClass: string;
  syncStatusLabel: string;
  isSyncing: boolean;
  hasPendingSync: boolean;
  authSession: AuthSession | null;
  isAdmin: boolean;
  apiLink: string;
  onOpenRoleChange: () => void;
  onManualSync: () => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

export function AppHeader({
  activeTab,
  onOpenSidebar,
  syncStatusTitle,
  syncStatusDotClass,
  syncStatusLabel,
  isSyncing,
  hasPendingSync,
  authSession,
  isAdmin,
  apiLink,
  onOpenRoleChange,
  onManualSync,
  onOpenChangePassword,
  onLogout,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800 px-2.5 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between w-full max-w-full overflow-hidden">
      <motion.button
        type="button"
        onClick={onOpenSidebar}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        className="flex items-center gap-2 sm:gap-3 text-left group p-1 sm:p-1.5 -ml-1 sm:-ml-1.5 rounded-2xl hover:bg-zinc-900/90 active:bg-zinc-850 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 cursor-pointer min-w-0"
        title="Open Menu Sidebar"
        aria-label="Open Navigation Menu"
      >
        <div className="relative w-9 h-9 sm:w-11 sm:h-11 bg-gradient-to-tr from-orange-600 via-orange-500 to-amber-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/25 ring-2 ring-orange-500/30 group-hover:ring-orange-500/60 group-hover:shadow-orange-500/40 transition-all shrink-0">
          <Building2 className="text-white w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover:scale-105" />
          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-zinc-900 border border-zinc-700 rounded-full flex items-center justify-center text-zinc-400 group-hover:text-orange-400 transition-colors shadow-sm">
            <Menu className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5">
            <h2 className="font-bold text-sm sm:text-lg leading-tight tracking-tight group-hover:text-orange-400 transition-colors truncate">
              KhataBook<span className="hidden xs:inline"> Pro</span>
            </h2>
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-600 group-hover:text-orange-400 transition-transform group-hover:translate-x-0.5 shrink-0" />
          </div>
          <div className="text-zinc-500 text-[10px] sm:text-xs flex items-center gap-1.5 mt-0.5" title={syncStatusTitle}>
            <span className="relative flex h-2 w-2 shrink-0">
              {isSyncing ? (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
              ) : hasPendingSync ? (
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              ) : (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-30" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${syncStatusDotClass}`} />
            </span>
            <span className="truncate max-w-[70px] sm:max-w-none">{syncStatusLabel}</span>
          </div>
        </div>
      </motion.button>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Active User role badge */}
        <button
          type="button"
          onClick={onOpenRoleChange}
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-xs shadow-sm transition-all group cursor-pointer shrink-0"
          title="Click to request role change"
        >
          {isAdmin ? (
            <ShieldCheck className="w-3.5 h-3.5 text-orange-400 group-hover:scale-110 transition-transform shrink-0" />
          ) : (
            <UserCheck className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform shrink-0" />
          )}
          <span className="font-semibold text-zinc-200 hidden md:inline max-w-[90px] truncate">
            {authSession?.name || authSession?.username || (isAdmin ? 'Admin' : 'Staff')}
          </span>
          <span className={`text-[10px] px-1 sm:px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${isAdmin ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
            {isAdmin ? 'Admin' : 'Staff'}
          </span>
        </button>

        {/* Active Tab indicator badge (desktop only) */}
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <span className="font-medium text-zinc-300">{activeTab}</span>
        </div>

        {/* In-App PWA Install Trigger (hidden on mobile header to preserve essential space) */}
        <div className="hidden md:block">
          <PWAHeaderInstallButton />
        </div>

        {/* Sync Button */}
        <button 
          onClick={onManualSync}
          disabled={isSyncing || !apiLink}
          className="p-1.5 sm:p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
          title={apiLink ? 'Sync Data' : 'Add Google Sheet API link first'}
          aria-label="Sync Data"
        >
          <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isSyncing ? 'animate-spin' : ''}`} />
        </button>

        {/* Change Account Password (hidden on mobile header; accessible via sidebar) */}
        <button 
          onClick={onOpenChangePassword}
          className="hidden sm:inline-flex p-1.5 sm:p-2 hover:bg-zinc-800 hover:text-amber-400 rounded-full transition-colors text-zinc-400 cursor-pointer shrink-0"
          title="Change Account Password"
          aria-label="Change Account Password"
        >
          <Key className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Logout Button: ALWAYS visible and cleanly contained */}
        <button 
          onClick={onLogout}
          className="p-1.5 sm:p-2 hover:bg-red-500/15 hover:text-red-400 text-zinc-400 hover:border-red-500/30 rounded-xl transition-all active:scale-95 cursor-pointer shrink-0 border border-transparent"
          title="Logout"
          aria-label="Logout"
        >
          <LogOut className="w-4 h-4 sm:w-5 sm:h-5 text-red-400/90 sm:text-zinc-400 group-hover:text-red-400" />
        </button>
      </div>
    </header>
  );
}
