import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  ShieldCheck, 
  UserCheck,
  ArrowRightLeft,
  Lock,
  Key, 
  FileCode, 
  RefreshCw, 
  Trash2, 
  AlertCircle 
} from 'lucide-react';
import { db, type Transaction, type Order } from '../../db';
import { 
  DEFAULT_EXPENSE_CATEGORIES, 
  DEFAULT_PAYMENT_MODES 
} from '../../utils/categoriesAndModes';
import { useBackHandler } from '../../utils/backHandler';
import { GoogleAppsScriptModal } from '../../components/GoogleAppsScriptModal';
import { ExpenseCategoriesManager } from '../../components/ExpenseCategoriesManager';
import { PaymentModesManager } from '../../components/PaymentModesManager';
import { 
  getRegisteredUsers, 
  updateRegisteredUserStatus, 
  deleteRegisteredUser 
} from '../auth';
import { 
  fetchUsersWithGoogleSheet, 
  updateUserWithGoogleSheet, 
  deleteUserWithGoogleSheet, 
  parseIsActive 
} from '../../sync';
import { LOCAL_USERS_KEY } from '../../constants/keys';
import { type RegisteredUser, type AuthSession } from '../../types/auth';
import { UserManagementSection } from './components/UserManagementSection';
import { PWASection } from './components/PWASection';

export interface AdminModuleProps {
  apiLink: string;
  setApiLink: (link: string) => void;
  transactions: Transaction[];
  orders: Order[];
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  isAdmin: boolean;
  setIsAdmin?: (isAdmin: boolean) => void;
  resetSyncState: () => void;
  onGoogleSheetReset: () => Promise<void> | void;
  isSyncing: boolean;
  onSync: () => Promise<boolean>;
  expenseCategories?: string[];
  onUpdateCategories?: (cats: string[]) => void;
  paymentModes?: string[];
  onUpdatePaymentModes?: (modes: string[]) => void;
  markSyncPending?: () => void;
  onRefreshData?: () => void;
  onOpenChangePassword?: () => void;
  onOpenRoleChange?: () => void;
  authSession?: AuthSession | null;
  isOnline: boolean;
}

export function AdminModule({ 
  apiLink, 
  setApiLink, 
  transactions, 
  orders, 
  showToast, 
  isAdmin, 
  resetSyncState, 
  onGoogleSheetReset, 
  isSyncing, 
  onSync,
  expenseCategories = DEFAULT_EXPENSE_CATEGORIES,
  onUpdateCategories,
  paymentModes = DEFAULT_PAYMENT_MODES,
  onUpdatePaymentModes,
  markSyncPending,
  onRefreshData,
  onOpenChangePassword,
  onOpenRoleChange,
  authSession,
  isOnline,
}: AdminModuleProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showGoogleResetConfirm, setShowGoogleResetConfirm] = useState(false);
  const [showAppsScriptModal, setShowAppsScriptModal] = useState(false);
  const [isResettingGoogleSheet, setIsResettingGoogleSheet] = useState(false);
  const [syncButtonLabel, setSyncButtonLabel] = useState('Sync Data');
  const [localUsersList, setLocalUsersList] = useState<RegisteredUser[]>(() => getRegisteredUsers());
  const [isSyncingUsers, setIsSyncingUsers] = useState(false);
  const [updatingUsername, setUpdatingUsername] = useState<string | null>(null);

  // Sync registered users from Google Sheet to ensure approval status stays up-to-date
  const syncUsersFromSheet = useCallback(async (notify = false) => {
    if (!apiLink || !isOnline || !isAdmin || !authSession?.username) return;
    setIsSyncingUsers(true);
    try {
      const res = await fetchUsersWithGoogleSheet(apiLink, authSession.username, authSession.password);
      if (res.success && res.users) {
        const currentLocal = getRegisteredUsers();
        const localMap = new Map<string, RegisteredUser>();

        currentLocal.forEach((u) => {
          localMap.set(u.username.toLowerCase(), u);
        });

        // Merge Sheet users into local list
        res.users.forEach((su: any) => {
          const key = su.username.toLowerCase();
          const existing = localMap.get(key);
          const isAct = parseIsActive(su.active ?? su.status);
          localMap.set(key, {
            username: su.username,
            name: su.name || existing?.name || su.username,
            password: existing?.password || '',
            role: su.role,
            active: isAct,
            requestedAt: su.requested_at || existing?.requestedAt || new Date().toISOString(),
          });
        });

        const mergedList = Array.from(localMap.values());
        localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(mergedList));
        setLocalUsersList(mergedList);
        if (notify) {
          showToast(`Synced ${res.users.length} user accounts from Google Sheet!`, 'success');
        }
      } else if (res.isScriptOutdated && notify) {
        showToast('Update your Google Apps Script in Settings to sync users directly from Google Sheet', 'info');
      }
    } catch (err: any) {
      console.warn('User accounts sync notice:', err);
    } finally {
      setIsSyncingUsers(false);
    }
  }, [apiLink, isOnline, isAdmin, authSession, showToast]);

  useEffect(() => {
    syncUsersFromSheet();
  }, [syncUsersFromSheet]);

  const handleToggleUserActive = async (username: string, active: boolean) => {
    updateRegisteredUserStatus(username, { active });
    setLocalUsersList(getRegisteredUsers());
    setUpdatingUsername(username);

    if (apiLink && isOnline && authSession?.username) {
      try {
        const res = await updateUserWithGoogleSheet(apiLink, {
          adminUsername: authSession.username,
          adminPassword: authSession.password,
          targetUsername: username,
          active: active,
        });

        if (res.success) {
          showToast(`User @${username} is now ${active ? 'Active & Approved' : 'Disabled'} in Google Sheet!`, 'success');
          await syncUsersFromSheet(false);
        } else if (res.isScriptOutdated) {
          showToast(
            `User @${username} approved locally! To also sync approval to Google Sheet, update Google Apps Script.`,
            'info'
          );
        } else {
          showToast(res.message || `Could not update user in Google Sheet`, 'error');
        }
      } catch (err: any) {
        showToast(`User updated locally (${err?.message || 'Network blip'})`, 'info');
      } finally {
        setUpdatingUsername(null);
      }
    } else {
      showToast(`User @${username} is now ${active ? 'Active' : 'Disabled'} locally`, 'success');
      setUpdatingUsername(null);
    }
  };

  const handleToggleUserRole = async (username: string, role: 'admin' | 'staff') => {
    updateRegisteredUserStatus(username, { role });
    setLocalUsersList(getRegisteredUsers());
    setUpdatingUsername(username);

    if (apiLink && isOnline && authSession?.username) {
      try {
        const res = await updateUserWithGoogleSheet(apiLink, {
          adminUsername: authSession.username,
          adminPassword: authSession.password,
          targetUsername: username,
          role: role,
        });

        if (res.success) {
          showToast(`User @${username} role updated to ${role} in Google Sheet!`, 'success');
        } else if (res.isScriptOutdated) {
          showToast(`User role updated locally. Update Apps Script to sync roles to Google Sheet.`, 'info');
        } else {
          showToast(res.message || `Failed to update user role in Google Sheet`, 'error');
        }
      } catch {
        showToast(`User role updated locally`, 'info');
      } finally {
        setUpdatingUsername(null);
      }
    } else {
      showToast(`User @${username} role updated to ${role}`, 'success');
      setUpdatingUsername(null);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (username.toLowerCase() === 'admin') {
      showToast('The default administrator account cannot be deleted', 'error');
      return;
    }

    deleteRegisteredUser(username);
    setLocalUsersList(getRegisteredUsers());
    setUpdatingUsername(username);

    if (apiLink && isOnline && authSession?.username) {
      try {
        await deleteUserWithGoogleSheet(apiLink, {
          adminUsername: authSession.username,
          adminPassword: authSession.password,
          targetUsername: username,
        });
        showToast(`User @${username} removed from app & Google Sheet`, 'info');
      } catch {
        showToast(`User @${username} removed locally`, 'info');
      } finally {
        setUpdatingUsername(null);
      }
    } else {
      showToast(`User @${username} removed`, 'info');
      setUpdatingUsername(null);
    }
  };

  // Back button & gesture handlers for Admin
  useBackHandler(() => {
    setShowClearConfirm(false);
    return true;
  }, showClearConfirm, 50);

  useBackHandler(() => {
    if (isResettingGoogleSheet) return true;
    setShowGoogleResetConfirm(false);
    return true;
  }, showGoogleResetConfirm, 50);

  const handleSaveApi = () => {
    localStorage.setItem('BT_API_LINK', apiLink);
    showToast('Settings Saved!', 'success');
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setSyncButtonLabel('Syncing...');
    const succeeded = await onSync();
    setSyncButtonLabel(succeeded ? 'Sync Complete' : 'Sync Data');
    if (succeeded) {
      window.setTimeout(() => setSyncButtonLabel('Sync Data'), 2500);
    }
  };

  const clearData = async () => {
    await db.transactions.clear();
    await db.orders.clear();
    await db.orderPayments.clear();
    await db.deletedRecords.clear();
    resetSyncState();
    window.location.reload();
  };

  const resetGoogleSheetData = async () => {
    if (!apiLink) {
      showToast('Please set Google Sheet API link in Admin settings', 'error');
      setShowGoogleResetConfirm(false);
      return;
    }

    setIsResettingGoogleSheet(true);

    try {
      await fetch(apiLink, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          action: 'resetAll',
        }),
      });

      await onGoogleSheetReset();
      setShowGoogleResetConfirm(false);
      showToast('Google Sheet data cleared. Headers are kept.', 'success');
    } catch (error) {
      console.error('Google Sheet reset failed', error);
      showToast('Failed to reset Google Sheet data.', 'error');
    } finally {
      setIsResettingGoogleSheet(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl sm:rounded-[40px] p-4 sm:p-8 sm:p-10 shadow-xl overflow-hidden">
        <div className="flex items-center gap-3 mb-6 sm:mb-10">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center shrink-0">
            <Settings className="text-orange-500 w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">System Settings</h3>
        </div>
        
        <div className="space-y-6 sm:space-y-10">
          {/* Authenticated Role Status */}
          <div className="flex items-center justify-between p-4 sm:p-6 bg-zinc-800/30 rounded-2xl sm:rounded-[32px] border border-zinc-800/50 gap-3 sm:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="font-bold text-base sm:text-lg text-white">
                  {isAdmin ? 'Administrator Privileges' : 'Staff Member Access'}
                </p>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                  isAdmin 
                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                }`}>
                  {isAdmin ? 'Verified Admin' : 'Staff Member'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-400 leading-relaxed max-w-md">
                {isAdmin ? (
                  <>Identified automatically from your account in the Google Sheet <span className="text-zinc-300 font-mono">Users</span> tab.</>
                ) : (
                  <>Signed in as <span className="text-white font-semibold">{authSession?.name || authSession?.username}</span> (@{authSession?.username || 'user'}). Standard ledger and transaction editing active.</>
                )}
              </p>
            </div>
            <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${
              isAdmin 
                ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' 
                : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
            }`}>
              {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
            </div>
          </div>

          {/* Change Role Request Card */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 bg-zinc-800/30 rounded-2xl sm:rounded-[32px] border border-zinc-800/50 gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="font-bold text-base sm:text-lg text-white">Change Role Request</p>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                  isAdmin 
                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                }`}>
                  {isAdmin ? 'Admin' : 'Staff'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-400 leading-relaxed max-w-md">
                {isAdmin 
                  ? 'Request to switch your role to Staff, or adjust account permissions in the cloud registry.' 
                  : 'Submit a role elevation request to be granted Administrator privileges with full sync and system control.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenRoleChange}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl sm:rounded-2xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-300 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0 cursor-pointer shadow-sm"
              title="Request Role Change"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>{isAdmin ? 'Switch / Change Role' : 'Request Admin Role'}</span>
            </button>
          </div>

          {/* Account Password & Security */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-6 bg-zinc-800/30 rounded-2xl sm:rounded-[32px] border border-zinc-800/50 gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="font-bold text-base sm:text-lg text-white">Account Password & Security</p>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Security
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-zinc-400 leading-relaxed max-w-md">
                Change your password from the default <span className="text-zinc-300 font-mono font-semibold">admin</span> to prevent Google Password Manager breach warnings and secure your system.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenChangePassword}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl sm:rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0 cursor-pointer shadow-sm"
            >
              <Key className="w-4 h-4" />
              <span>Change Password</span>
            </button>
          </div>

          {/* Notice for Staff Accounts */}
          {!isAdmin && (
            <div className="p-4 sm:p-5 bg-zinc-800/20 rounded-2xl border border-zinc-800/50 flex items-start sm:items-center gap-3">
              <Lock className="w-5 h-5 text-orange-400 shrink-0 mt-0.5 sm:mt-0" />
              <div className="text-xs text-zinc-400 leading-relaxed">
                <span className="font-semibold text-zinc-300">Staff Mode:</span> Google Sheet cloud synchronization link, category management, and database resets are restricted to Administrator accounts. Use the <strong className="text-orange-400">Change Role Request</strong> card above if you need Administrator privileges.
              </div>
            </div>
          )}

          {/* User Accounts & Registration Approvals (Admin Only) */}
          {isAdmin && (
            <UserManagementSection
              localUsersList={localUsersList}
              apiLink={apiLink}
              isSyncingUsers={isSyncingUsers}
              isOnline={isOnline}
              updatingUsername={updatingUsername}
              onSyncUsersFromSheet={syncUsersFromSheet}
              onToggleUserActive={handleToggleUserActive}
              onToggleUserRole={handleToggleUserRole}
              onDeleteUser={handleDeleteUser}
            />
          )}

          {/* API Link Section (Admin Only) */}
          {isAdmin && (
            <div className="space-y-4">
              <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-2">Google Sheet API Link</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={apiLink}
                    onChange={(e) => setApiLink(e.target.value)}
                    placeholder="https://script.google.com/macros/s/..."
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none focus:border-orange-500/50 transition-all placeholder:text-zinc-600"
                  />
                </div>
                <button 
                  onClick={handleSaveApi} 
                  className="bg-orange-500 hover:bg-orange-600 px-8 py-4 rounded-2xl font-bold text-sm text-white transition-all shadow-lg shadow-orange-500/20 active:scale-95 whitespace-nowrap cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
              <button
                onClick={() => void handleSync()}
                disabled={isSyncing || !apiLink}
                className="w-full bg-emerald-500 hover:bg-emerald-600 px-8 py-4 rounded-2xl font-bold text-sm text-white transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSyncing ? 'Syncing...' : syncButtonLabel}
              </button>
              <button
                onClick={() => setShowAppsScriptModal(true)}
                className="w-full bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-200 px-6 py-3.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all active:scale-98 shadow-sm cursor-pointer"
              >
                <FileCode className="w-4 h-4 text-orange-400" />
                View & Copy Google Apps Script Code
              </button>
              <div className="ml-2 text-[10px] text-zinc-600 flex items-center gap-1.5">
                <div className="w-1 h-1 bg-zinc-600 rounded-full" />
                This link connects your app to Google Sheets for cloud backup and reconnect auto-sync.
              </div>
            </div>
          )}

          {/* Data Management (Admin Only) */}
          {isAdmin && (
            <div className="pt-10 border-t border-zinc-800/50">
              <h4 className="font-bold mb-6 text-sm flex items-center gap-2 text-white">
                <RefreshCw className="w-4 h-4 text-zinc-500" />
                Data Management
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-zinc-800/20 p-6 rounded-[28px] border border-zinc-800/50">
                  <p className="text-zinc-500 text-[10px] uppercase font-black tracking-wider mb-2">Total Records</p>
                  <p className="text-2xl font-bold text-white">{transactions.length + orders.length}</p>
                </div>
                <div className="bg-zinc-800/20 p-6 rounded-[28px] border border-zinc-800/50">
                  <p className="text-zinc-500 text-[10px] uppercase font-black tracking-wider mb-2">Storage Used</p>
                  <p className="text-2xl font-bold text-white">~{(JSON.stringify(transactions).length / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            </div>
          )}

          {/* Progressive Web App (PWA) & Offline Capabilities Section */}
          <PWASection
            transactionsCount={transactions.length}
            ordersCount={orders.length}
            isOnline={isOnline}
            showToast={showToast}
          />

          {/* Reset Action (Admin Only) */}
          {isAdmin && (
            <div className="pt-6">
              <div className="space-y-4">
                <button 
                  onClick={() => setShowClearConfirm(true)}
                  className="w-full bg-red-500/5 hover:bg-red-500/10 text-red-500 py-5 rounded-[28px] font-bold text-sm flex items-center justify-center gap-3 transition-all border border-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> Reset Local Database
                </button>
                <button 
                  onClick={() => setShowGoogleResetConfirm(true)}
                  disabled={isResettingGoogleSheet}
                  className="w-full bg-blue-500/5 hover:bg-blue-500/10 text-blue-400 py-5 rounded-[28px] font-bold text-sm flex items-center justify-center gap-3 transition-all border border-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> {isResettingGoogleSheet ? 'Resetting Google Sheet...' : 'Reset Google Sheet Data'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expense Categories Manager (Admin Only) */}
      {isAdmin && (
        <ExpenseCategoriesManager
          categories={expenseCategories}
          onUpdateCategories={onUpdateCategories}
          transactions={transactions}
          showToast={showToast}
          markSyncPending={markSyncPending}
          onRefreshData={onRefreshData}
        />
      )}

      {/* Payment Modes Manager (Admin Only) */}
      {isAdmin && (
        <PaymentModesManager
          paymentModes={paymentModes}
          onUpdatePaymentModes={onUpdatePaymentModes}
          transactions={transactions}
          showToast={showToast}
          markSyncPending={markSyncPending}
          onRefreshData={onRefreshData}
        />
      )}

      {/* Clear Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setShowClearConfirm(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-white">Delete All Data?</h3>
              <p className="text-zinc-500 text-sm mb-8">This action cannot be undone. All your local transactions and orders will be permanently deleted.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm text-zinc-300 hover:text-white cursor-pointer">Cancel</button>
                <button onClick={clearData} className="flex-1 bg-red-500 hover:bg-red-600 py-4 rounded-2xl font-bold text-sm text-white cursor-pointer">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGoogleResetConfirm && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => !isResettingGoogleSheet && setShowGoogleResetConfirm(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-white">Clear Google Sheet Data?</h3>
              <p className="text-zinc-500 text-sm mb-8">
                This will delete all rows from your Google Sheets cloud backup and keep only the headers.
                Local phone data will stay safe, and you can sync it again later if needed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowGoogleResetConfirm(false)}
                  disabled={isResettingGoogleSheet}
                  className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm text-zinc-300 hover:text-white disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={resetGoogleSheetData}
                  disabled={isResettingGoogleSheet}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 py-4 rounded-2xl font-bold text-sm text-white disabled:opacity-50 cursor-pointer"
                >
                  {isResettingGoogleSheet ? 'Resetting...' : 'Reset Sheet'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="bg-orange-500/10 border border-orange-500/20 rounded-[32px] p-8">
        <h4 className="font-bold text-orange-500 mb-2 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Admin Notice</h4>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Ensure your Google Sheet has the correct headers (auto-created by the Apps Script): <br/>
          <strong>Transactions:</strong> id, date, type, category, amount, payment_type, description, reference, order_id, synced <br/>
          <strong>Orders:</strong> order_id, items (JSON), supplier, total_amount, paid_amount, remaining_amount, status, date, synced <br/>
          <strong>OrderPayments:</strong> payment_id, order_id, amount, payment_type, date, synced <br/>
          <strong>Categories:</strong> name (Custom expense categories auto-synced across devices) <br/>
          <strong>PaymentModes:</strong> name (Custom payment modes auto-synced across devices) <br/>
          Pending offline changes now sync automatically when the device reconnects. Reset Google Sheet Data clears cloud rows only and keeps the sheet headers.
        </p>
      </div>

      {/* Google Apps Script Modal */}
      <GoogleAppsScriptModal
        isOpen={showAppsScriptModal}
        onClose={() => setShowAppsScriptModal(false)}
        showToast={showToast}
      />
    </motion.div>
  );
}
