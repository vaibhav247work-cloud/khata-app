import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Settings, 
  RefreshCw, 
  Trash2 
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { db } from '../../db';
import { checkAppStoragePermission } from '../../utils/permissions';
import type { Transaction, Order } from '../../types';
import { AdminClearConfirmModal } from './AdminClearConfirmModal';
import { AdminGoogleResetModal } from './AdminGoogleResetModal';
import { AdminStoragePermission } from './AdminStoragePermission';
import { AdminApkSection } from './AdminApkSection';

interface AdminModuleProps {
  apiLink: string;
  setApiLink: (link: string) => void;
  transactions: Transaction[];
  orders: Order[];
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  isAdmin: boolean;
  setIsAdmin: (val: boolean) => void;
  resetSyncState: () => void;
  onGoogleSheetReset: () => Promise<void>;
  isSyncing: boolean;
  onSync: () => Promise<boolean>;
}

export function AdminModule({
  apiLink,
  setApiLink,
  transactions,
  orders,
  showToast,
  isAdmin,
  setIsAdmin,
  resetSyncState,
  onGoogleSheetReset,
  isSyncing,
  onSync
}: AdminModuleProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showGoogleResetConfirm, setShowGoogleResetConfirm] = useState(false);
  const [isResettingGoogleSheet, setIsResettingGoogleSheet] = useState(false);
  const [syncButtonLabel, setSyncButtonLabel] = useState('Sync Data');
  const [storagePermState, setStoragePermState] = useState<boolean>(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      checkAppStoragePermission().then(granted => setStoragePermState(granted));
    }
  }, []);

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
      <div className="bg-zinc-900 border border-zinc-800 rounded-[40px] p-8 sm:p-10">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center">
            <Settings className="text-orange-500 w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold tracking-tight">System Settings</h3>
        </div>
        
        <div className="space-y-10">
          {/* Admin Access Toggle */}
          <div className="group flex items-center justify-between p-4 sm:p-6 bg-zinc-800/30 rounded-[32px] border border-zinc-800/50 hover:border-orange-500/30 transition-all gap-4">
            <div className="flex-1">
              <p className="font-bold text-base sm:text-lg mb-1">Admin Access</p>
              <p className="text-[10px] sm:text-xs text-zinc-500 leading-relaxed max-w-[200px] sm:max-w-[240px]">
                Enable restricted features like deleting orders with payment history.
              </p>
            </div>
            <button 
              onClick={() => setIsAdmin(!isAdmin)}
              className={`w-12 h-6 sm:w-14 sm:h-7 rounded-full transition-all relative flex items-center px-1 shrink-0 ${isAdmin ? 'bg-orange-500' : 'bg-zinc-700'}`}
            >
              <motion.div 
                animate={{ x: isAdmin ? (window.innerWidth < 640 ? 24 : 28) : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="w-4 h-4 sm:w-5 sm:h-5 bg-white rounded-full shadow-lg"
              />
            </button>
          </div>

          {/* Device Storage Permission (Android) */}
          <AdminStoragePermission
            storagePermState={storagePermState}
            setStoragePermState={setStoragePermState}
            showToast={showToast}
          />

          {/* API Link Section */}
          <div className="space-y-4">
            <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-2">Google Sheet API Link</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <input 
                  type="text" 
                  value={apiLink}
                  onChange={(e) => setApiLink(e.target.value)}
                  placeholder="https://script.google.com/macros/s/..."
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-orange-500/50 transition-all placeholder:text-zinc-600"
                />
              </div>
              <button 
                onClick={handleSaveApi} 
                className="bg-orange-500 hover:bg-orange-600 px-8 py-4 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-orange-500/20 active:scale-95 whitespace-nowrap"
              >
                Save Changes
              </button>
            </div>
            <button
              onClick={() => void handleSync()}
              disabled={isSyncing || !apiLink}
              className="w-full bg-emerald-500 hover:bg-emerald-600 px-8 py-4 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncing ? 'Syncing...' : syncButtonLabel}
            </button>
            <div className="ml-2 text-[10px] text-zinc-600 flex items-center gap-1.5">
              <div className="w-1 h-1 bg-zinc-600 rounded-full" />
              This link connects your app to Google Sheets for cloud backup and reconnect auto-sync.
            </div>
          </div>

          {/* Data Management */}
          <div className="pt-10 border-t border-zinc-800/50">
            <h4 className="font-bold mb-6 text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-zinc-500" />
              Data Management
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-zinc-800/20 p-6 rounded-[28px] border border-zinc-800/50">
                <p className="text-zinc-500 text-[10px] uppercase font-black tracking-wider mb-2">Total Records</p>
                <p className="text-2xl font-bold">{transactions.length + orders.length}</p>
              </div>
              <div className="bg-zinc-800/20 p-6 rounded-[28px] border border-zinc-800/50">
                <p className="text-zinc-500 text-[10px] uppercase font-black tracking-wider mb-2">Storage Used</p>
                <p className="text-2xl font-bold">~{(JSON.stringify(transactions).length / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          </div>

          {/* Android App & APK Download */}
          <AdminApkSection />

          {/* Danger Zone */}
          <div className="pt-10 border-t border-zinc-800/50">
            <h4 className="font-bold text-red-500 mb-6 text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Danger Zone
            </h4>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-red-500/5 rounded-[32px] border border-red-500/10 gap-4">
                <div>
                  <p className="font-bold text-sm mb-1">Clear Local Database</p>
                  <p className="text-xs text-zinc-500">Deletes all local transactions, orders, and payment history.</p>
                </div>
                <button 
                  onClick={() => setShowClearConfirm(true)} 
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-3 rounded-2xl font-bold text-xs transition-all shrink-0"
                >
                  Clear Local Data
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-red-500/5 rounded-[32px] border border-red-500/10 gap-4">
                <div>
                  <p className="font-bold text-sm mb-1">Reset Google Sheet Data</p>
                  <p className="text-xs text-zinc-500">Clears Transactions, Orders, and Payments in Google Sheets without deleting column headers.</p>
                </div>
                <button 
                  onClick={() => setShowGoogleResetConfirm(true)} 
                  disabled={isResettingGoogleSheet}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-3 rounded-2xl font-bold text-xs transition-all shrink-0 disabled:opacity-50"
                >
                  {isResettingGoogleSheet ? 'Resetting...' : 'Reset Google Sheet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AdminClearConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={clearData}
      />

      <AdminGoogleResetModal
        isOpen={showGoogleResetConfirm}
        isResetting={isResettingGoogleSheet}
        onClose={() => setShowGoogleResetConfirm(false)}
        onConfirm={resetGoogleSheetData}
      />
    </motion.div>
  );
}
