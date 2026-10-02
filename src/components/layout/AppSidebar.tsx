import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
  X, 
  ShieldCheck, 
  UserCheck, 
  LogOut, 
  Key, 
  ArrowRightLeft, 
  LayoutDashboard, 
  ArrowUpRight, 
  Package, 
  History, 
  FileText, 
  Settings, 
  Lock, 
  ChevronRight 
} from 'lucide-react';
import { type Tab } from '../../types/common';
import { type AuthSession } from '../../types/auth';

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: Tab;
  onSelectTab: (tab: Tab) => void;
  syncStatusTitle: string;
  syncStatusDotClass: string;
  syncStatusLabel: string;
  hasPendingSync: boolean;
  isAdmin: boolean;
  authSession: AuthSession | null;
  onOpenRoleChange: () => void;
  onOpenChangePassword: () => void;
  onLogout: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function AppSidebar({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  syncStatusTitle,
  syncStatusDotClass,
  syncStatusLabel,
  hasPendingSync,
  isAdmin,
  authSession,
  onOpenRoleChange,
  onOpenChangePassword,
  onLogout,
  showToast,
}: AppSidebarProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop: Animated fade & blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-pointer"
            aria-label="Close sidebar backdrop"
          />

          {/* Sidebar Drawer Panel */}
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320, mass: 0.8 }}
            className="relative w-84 max-w-[86vw] h-full bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 border-r border-zinc-800/80 shadow-2xl flex flex-col justify-between z-10 select-none overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Subtle ambient lighting inside the drawer */}
            <div className="pointer-events-none absolute -top-24 -left-24 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
            <div className="pointer-events-none absolute bottom-10 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-2xl" />

            {/* Top Header inside Sidebar */}
            <div className="relative p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/60 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-gradient-to-tr from-orange-600 via-orange-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/25 ring-2 ring-orange-500/30">
                  <Building2 className="text-white w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-bold text-base leading-tight text-white tracking-tight">KhataBook Pro</h2>
                  <div className="text-zinc-500 text-xs flex items-center gap-1.5 mt-0.5" title={syncStatusTitle}>
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${hasPendingSync ? 'bg-amber-400' : 'bg-emerald-400'} opacity-50`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${syncStatusDotClass}`} />
                    </span>
                    <span>{syncStatusLabel}</span>
                  </div>
                </div>
              </div>

              <motion.button
                type="button"
                whileHover={{ rotate: 90, scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800/80 rounded-xl transition-colors border border-transparent hover:border-zinc-700/60 cursor-pointer"
                title="Close sidebar (Esc)"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </motion.button>
            </div>

            {/* Navigation Items */}
            <div className="relative flex-1 overflow-y-auto px-3.5 py-4 space-y-1.5 no-scrollbar">
              {/* User Session Profile Card */}
              <div className="p-3 mb-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-2.5 shadow-inner">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                      isAdmin ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    }`}>
                      {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {authSession?.name || authSession?.username || (isAdmin ? 'Administrator' : 'Staff Member')}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                          isAdmin ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {isAdmin ? 'Admin' : 'Staff'}
                        </span>
                        <span className="text-[10px] text-zinc-500 truncate">@{authSession?.username || 'user'}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLogout();
                    }}
                    className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800/80 rounded-xl transition-colors shrink-0 cursor-pointer"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>

                {/* Profile Actions: Change Password & Request Role Change */}
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChangePassword();
                      onClose();
                    }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer"
                    title="Change account password"
                  >
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>Password</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenRoleChange();
                      onClose();
                    }}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-[11px] font-semibold text-zinc-300 hover:text-white transition-all shadow-sm cursor-pointer"
                    title="Request role change"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-orange-400" />
                    <span>Role</span>
                  </button>
                </div>
              </div>

              <div className="px-3 pb-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center justify-between">
                <span>Navigation Menu</span>
                <span className="text-[9px] text-zinc-600 font-medium">KhataBook</span>
              </div>

              {[
                { id: 'Dashboard', label: 'Home', subtitle: 'Overview & Statistics', icon: LayoutDashboard },
                { id: 'Transactions', label: 'Transactions', subtitle: 'Ledger & Cash Flow', icon: ArrowUpRight },
                { id: 'Orders', label: 'Orders', subtitle: 'Bills, Invoices & Quotations', icon: Package },
                { id: 'Passbook', label: 'Passbook', subtitle: 'Account Statements', icon: History },
                { id: 'Reports', label: 'Reports', subtitle: 'PDF Statements & Excel', icon: FileText },
                { 
                  id: 'Admin', 
                  label: 'Admin & Settings', 
                  subtitle: isAdmin ? 'Google Sheet Sync & Backup' : 'Locked (Admin only)', 
                  icon: Settings,
                  adminOnly: true
                },
              ].map((item, idx) => {
                const isActive = activeTab === item.id;
                const isLocked = item.adminOnly && !isAdmin;
                const Icon = item.icon;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.035 * idx, type: 'spring', damping: 24, stiffness: 280 }}
                    whileHover={{ x: isLocked ? 0 : 5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (isLocked) {
                        showToast('Admin & Settings is accessible only to Administrator accounts', 'error');
                        return;
                      }
                      onSelectTab(item.id as Tab);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-2xl text-left transition-all group relative overflow-hidden cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-orange-500/20 via-orange-500/10 to-transparent text-orange-400 border border-orange-500/35 shadow-sm'
                        : isLocked
                          ? 'text-zinc-500 hover:text-zinc-400 hover:bg-zinc-900/40 border border-transparent opacity-75'
                          : 'text-zinc-300 hover:text-white hover:bg-zinc-800/60 border border-transparent'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeBarIndicator"
                        className="absolute left-0 top-2 bottom-2 w-1 bg-gradient-to-b from-orange-500 to-amber-500 rounded-r-full"
                      />
                    )}

                    <div
                      className={`p-2.5 rounded-xl transition-all shrink-0 ${
                        isActive
                          ? 'bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-md shadow-orange-500/30'
                          : isLocked
                            ? 'bg-zinc-850 text-zinc-500'
                            : 'bg-zinc-800/80 text-zinc-400 group-hover:text-white group-hover:bg-zinc-750'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm leading-tight truncate">{item.label}</span>
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-orange-500 shadow-sm shadow-orange-500" />
                        )}
                        {isLocked && !isActive && (
                          <Lock className="w-3.5 h-3.5 text-zinc-500" />
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate mt-0.5">{item.subtitle}</p>
                    </div>

                    {!isLocked && (
                      <ChevronRight
                        className={`w-4 h-4 transition-all ${
                          isActive
                            ? 'text-orange-400 translate-x-0'
                            : 'text-zinc-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
                        }`}
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Sidebar Footer */}
            <div className="relative p-4 border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
              <div className="text-center">
                <p className="text-[10px] font-medium text-zinc-500">KhataBook Pro • v1.0</p>
                <p className="text-[9px] text-zinc-600">Offline-first construction ledger</p>
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
