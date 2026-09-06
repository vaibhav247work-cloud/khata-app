import React, { useState, useEffect, useMemo, useRef } from 'react';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { db } from '../db';
import { 
  hasUnsyncedLocalChanges, 
  markAllLocalDataSynced, 
  syncLocalAndGoogleSheets, 
  reconcileOrdersWithTransactions,
  type SyncTrigger 
} from '../sync';
import { SYNC_PENDING_KEY, LAST_SYNC_AT_KEY } from '../constants';
import type { Tab, Transaction, Order } from '../types';
import { useAutoSync } from './useAutoSync';

export function useKhataState() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('Dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasPendingSync, setHasPendingSync] = useState(() => localStorage.getItem(SYNC_PENDING_KEY) === 'true');
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem(LAST_SYNC_AT_KEY) || '');
  const [apiLink, setApiLink] = useState(localStorage.getItem('BT_API_LINK') || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState<'All' | 'Today' | 'This Week' | 'This Month' | 'Custom'>('All');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [exitConfirm, setExitConfirm] = useState(false);
  const exitConfirmRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const [isAdmin, setIsAdmin] = useState(localStorage.getItem('BT_IS_ADMIN') === 'true');
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleAdmin = (val: boolean) => {
    setIsAdmin(val);
    localStorage.setItem('BT_IS_ADMIN', val.toString());
  };

  const markSyncPending = () => {
    localStorage.setItem(SYNC_PENDING_KEY, 'true');
    setHasPendingSync(true);
  };

  const clearSyncPending = () => {
    localStorage.removeItem(SYNC_PENDING_KEY);
    setHasPendingSync(false);
  };

  const resetSyncState = () => {
    clearSyncPending();
    localStorage.removeItem(LAST_SYNC_AT_KEY);
    setLastSyncedAt('');
  };

  // --- Back Button Logic ---
  useEffect(() => {
    window.history.pushState({ tab: activeTab }, '');

    const handleBack = () => {
      if (activeTab !== 'Dashboard') {
        setActiveTab('Dashboard');
        window.history.pushState({ tab: 'Dashboard' }, '');
      } else {
        if (exitConfirmRef.current) {
          return;
        }

        setExitConfirm(true);
        exitConfirmRef.current = true;
        setTimeout(() => {
          setExitConfirm(false);
          exitConfirmRef.current = false;
        }, 3000);
        
        window.history.pushState({ tab: 'Dashboard' }, '');
      }
    };

    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, [activeTab]);

  // --- Auth ---
  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (formData.get('username') === 'admin' && formData.get('password') === 'admin123') {
      setIsLoggedIn(true);
    } else {
      showToast('Invalid credentials', 'error');
    }
  };

  // --- Data Loading ---
  const loadData = async () => {
    await reconcileOrdersWithTransactions();

    const [txs, ords, localHasUnsyncedChanges] = await Promise.all([
      db.transactions.toArray(),
      db.orders.toArray(),
      hasUnsyncedLocalChanges(),
    ]);
    
    const sortedTxs = [...txs].sort((a, b) => b.date.localeCompare(a.date));
    const sortedOrds = [...ords].sort((a, b) => b.date.localeCompare(a.date));
    
    setTransactions(sortedTxs);
    setOrders(sortedOrds);
    setHasPendingSync(localHasUnsyncedChanges || localStorage.getItem(SYNC_PENDING_KEY) === 'true');
  };

  const handleGoogleSheetReset = async () => {
    await markAllLocalDataSynced();
    resetSyncState();
    await loadData();
  };

  useEffect(() => {
    if (isLoggedIn) loadData();
  }, [isLoggedIn]);

  // --- Sync Logic ---
  const syncWithGoogleSheets = async (trigger: SyncTrigger = 'manual'): Promise<boolean> => {
    if (syncInFlightRef.current) {
      return false;
    }

    if (!apiLink) {
      if (trigger === 'manual') {
        showToast('Please set Google Sheet API link in Admin settings', 'error');
      }
      return false;
    }

    if (!navigator.onLine) {
      if (trigger === 'manual') {
        showToast('You are offline. Changes will sync automatically once internet is back.', 'error');
      }
      return false;
    }

    if (trigger !== 'manual' && !hasPendingSync) {
      return false;
    }

    syncInFlightRef.current = true;
    setIsSyncing(true);

    try {
      await syncLocalAndGoogleSheets(apiLink);

      clearSyncPending();
      const syncedAt = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_AT_KEY, syncedAt);
      setLastSyncedAt(syncedAt);

      await loadData();

      if (trigger === 'manual') {
        showToast('Data synced to Google Sheets.', 'success');
      } else if (trigger === 'reconnect') {
        showToast('Back online. Pending changes synced.', 'success');
      }
      return true;
    } catch (error) {
      console.error('Sync failed', error);
      if (trigger !== 'background') {
        showToast('Sync failed. Data is still saved on this phone.', 'error');
      }
      return false;
    } finally {
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
  };

  const { isOnline } = useAutoSync({
    isLoggedIn,
    apiLink,
    hasPendingSync,
    isSyncing,
    onSync: syncWithGoogleSheets,
    showToast,
  });

  // --- Filtered Transactions ---
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           tx.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           tx.reference?.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      if (filterDate === 'All') return true;
      const txDate = parseISO(tx.date);
      const now = new Date();
      
      if (filterDate === 'Today') {
        return isWithinInterval(txDate, { start: startOfDay(now), end: endOfDay(now) });
      }
      if (filterDate === 'This Week') {
        return isWithinInterval(txDate, { start: startOfWeek(now), end: endOfWeek(now) });
      }
      if (filterDate === 'This Month') {
        return isWithinInterval(txDate, { start: startOfMonth(now), end: endOfMonth(now) });
      }
      if (filterDate === 'Custom' && customDateRange.start && customDateRange.end) {
        return isWithinInterval(txDate, { 
          start: startOfDay(parseISO(customDateRange.start)), 
          end: endOfDay(parseISO(customDateRange.end)) 
        });
      }
      return true;
    });
  }, [transactions, searchQuery, filterDate, customDateRange]);

  // --- Dashboard Stats ---
  const stats = useMemo(() => {
    const totalCredit = transactions.filter(t => t.type === 'Credit').reduce((sum, t) => sum + t.amount, 0);
    const totalDebit = transactions.filter(t => t.type === 'Debit').reduce((sum, t) => sum + t.amount, 0);
    const pendingPayments = orders.reduce((sum, o) => sum + o.remaining_amount, 0);
    const pendingOrders = orders.filter(o => o.status !== 'Completed').length;

    return {
      totalCredit,
      totalDebit,
      netBalance: totalCredit - totalDebit,
      pendingPayments,
      pendingOrders
    };
  }, [transactions, orders]);

  const syncStatusLabel = !apiLink
    ? 'Add Sheet Link'
    : !isOnline
      ? 'Offline Mode'
      : isSyncing
        ? 'Syncing...'
        : hasPendingSync
          ? 'Sync Pending'
          : 'Cloud Connected';

  const syncStatusDotClass = !apiLink
    ? 'bg-zinc-500'
    : !isOnline
      ? 'bg-red-500'
      : isSyncing
        ? 'bg-orange-500 animate-pulse'
        : hasPendingSync
          ? 'bg-yellow-500'
          : 'bg-green-500';

  const syncStatusTitle = lastSyncedAt
    ? `Last synced on ${format(parseISO(lastSyncedAt), 'dd MMM yyyy, hh:mm a')}`
    : 'No cloud sync completed yet';

  return {
    isLoggedIn,
    setIsLoggedIn,
    activeTab,
    setActiveTab,
    transactions,
    orders,
    isSyncing,
    apiLink,
    setApiLink,
    searchQuery,
    setSearchQuery,
    filterDate,
    setFilterDate,
    customDateRange,
    setCustomDateRange,
    exitConfirm,
    isAdmin,
    setIsAdmin,
    toggleAdmin,
    toast,
    showToast,
    markSyncPending,
    resetSyncState,
    loadData,
    handleGoogleSheetReset,
    syncWithGoogleSheets,
    handleLogin,
    filteredTransactions,
    stats,
    syncStatusLabel,
    syncStatusDotClass,
    syncStatusTitle,
  };
}
