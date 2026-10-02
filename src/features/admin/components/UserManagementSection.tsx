import React from 'react';
import { RefreshCw, UserCheck, Check, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { type RegisteredUser } from '../../../types/auth';

interface UserManagementSectionProps {
  localUsersList: RegisteredUser[];
  apiLink: string;
  isSyncingUsers: boolean;
  isOnline: boolean;
  updatingUsername: string | null;
  onSyncUsersFromSheet: (notify?: boolean) => void;
  onToggleUserActive: (username: string, active: boolean) => void;
  onToggleUserRole: (username: string, role: 'admin' | 'staff') => void;
  onDeleteUser: (username: string) => void;
}

export function UserManagementSection({
  localUsersList,
  apiLink,
  isSyncingUsers,
  isOnline,
  updatingUsername,
  onSyncUsersFromSheet,
  onToggleUserActive,
  onToggleUserRole,
  onDeleteUser,
}: UserManagementSectionProps) {
  return (
    <div className="p-4 sm:p-6 bg-zinc-800/30 rounded-[32px] border border-zinc-800/50 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-bold text-base sm:text-lg text-white">User Accounts & Approvals</p>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {localUsersList.length} User{localUsersList.length === 1 ? '' : 's'}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30">
              Admin Only
            </span>
          </div>
          <p className="text-[10px] sm:text-xs text-zinc-500 leading-relaxed">
            Manage registered users and instantly activate accounts requested from the login screen.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {apiLink && (
            <button
              type="button"
              onClick={() => onSyncUsersFromSheet(true)}
              disabled={isSyncingUsers || !isOnline}
              className="px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-750 text-zinc-300 hover:text-white text-xs font-medium border border-zinc-700/60 transition-all flex items-center gap-1.5 disabled:opacity-50"
              title="Sync and refresh user list directly from Google Sheet"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isSyncingUsers ? 'animate-spin' : ''}`} />
              <span>{isSyncingUsers ? 'Syncing...' : 'Sync with Sheet'}</span>
            </button>
          )}
          <div className="w-9 h-9 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>
      </div>

      {localUsersList.length === 0 ? (
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-center text-xs text-zinc-500">
          No user registration requests recorded yet. When users submit "Request New User" from the login screen, they will appear here for instant approval.
        </div>
      ) : (
        <div className="space-y-2">
          {localUsersList.map((u) => {
            const isBusy = updatingUsername === u.username;
            return (
              <div
                key={u.username}
                className="p-3 sm:p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:border-zinc-700"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-white truncate">{u.name}</span>
                    <span className="text-xs text-zinc-400 font-mono truncate">@{u.username}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                        u.role === 'admin'
                          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}
                    >
                      {u.role}
                    </span>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                        u.active
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${u.active ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                      <span>{u.active ? 'Active' : 'Pending Approval'}</span>
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Requested: {format(parseISO(u.requestedAt), 'dd MMM yyyy, hh:mm a')}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!u.active ? (
                    <button
                      type="button"
                      onClick={() => onToggleUserActive(u.username, true)}
                      disabled={isBusy}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white text-xs font-semibold shadow-md shadow-emerald-900/30 transition-all active:scale-95 flex items-center gap-1.5 disabled:cursor-not-allowed"
                    >
                      {isBusy ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Activating...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve & Activate</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleUserActive(u.username, false)}
                      disabled={isBusy}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {isBusy ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <span>Deactivate</span>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onToggleUserRole(u.username, u.role === 'admin' ? 'staff' : 'admin')}
                    disabled={isBusy}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs transition-colors disabled:opacity-60"
                    title={u.role === 'admin' ? 'Change to Staff' : 'Make Administrator'}
                  >
                    {u.role === 'admin' ? 'Make Staff' : 'Make Admin'}
                  </button>

                  {u.username.toLowerCase() !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => onDeleteUser(u.username)}
                      disabled={isBusy}
                      className="p-1.5 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors disabled:opacity-60"
                      title="Remove user"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
