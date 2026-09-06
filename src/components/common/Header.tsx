import React from 'react';
import { Building2, RefreshCw, LogOut } from 'lucide-react';

interface HeaderProps {
  syncStatusTitle: string;
  syncStatusDotClass: string;
  syncStatusLabel: string;
  isSyncing: boolean;
  apiLink: string;
  onSync: () => void;
  onLogout: () => void;
}

export function Header({
  syncStatusTitle,
  syncStatusDotClass,
  syncStatusLabel,
  isSyncing,
  apiLink,
  onSync,
  onLogout,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
          <Building2 className="text-white w-6 h-6" />
        </div>
        <div>
          <h2 className="font-bold text-lg leading-tight">KhataBook Pro</h2>
          <div className="text-zinc-500 text-xs flex items-center gap-1" title={syncStatusTitle}>
            <div className={`w-2 h-2 rounded-full ${syncStatusDotClass}`} />
            {syncStatusLabel}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button 
          onClick={onSync}
          disabled={isSyncing || !apiLink}
          className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed"
          title={apiLink ? 'Sync Data' : 'Add Google Sheet API link first'}
        >
          <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
        </button>
        <button 
          onClick={onLogout}
          className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
