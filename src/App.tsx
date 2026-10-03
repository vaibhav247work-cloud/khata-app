import React, { useState, useEffect, useCallback, useMemo, useRef, useEffectEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  parseISO 
} from 'date-fns';

// Database & Synchronization
import { 
  db, 
  type Transaction, 
  type Order 
} from './db';
import { 
  syncLocalAndGoogleSheets, 
  requestRoleChangeWithGoogleSheet, 
  changeUserPasswordWithGoogleSheet, 
  reconcileOrdersWithTransactions, 
  markAllLocalDataSynced, 
  hasUnsyncedLocalChanges, 
  type SyncTrigger 
} from './sync';

// Constants & Types
import { 
  SYNC_PENDING_KEY, 
  LAST_SYNC_AT_KEY, 
  AUTH_SESSION_KEY 
} from './constants/keys';
import { 
  type Tab, 
  type ToastState, 
  type PdfPreviewData, 
  type FilterDate, 
  type CustomDateRange 
} from './types/common';
import { type AuthSession } from './types/auth';

// Utilities
import { 
  getStoredExpenseCategories, 
  saveStoredExpenseCategories, 
  getStoredPaymentModes, 
  saveStoredPaymentModes 
} from './utils/categoriesAndModes';
import { backHandler, useBackHandler } from './utils/backHandler';
import { saveOrShareReport } from './utils/pdfExport';

// Layout & Common Components
import { AppHeader } from './components/layout/AppHeader';
import { AppSidebar } from './components/layout/AppSidebar';
import { ToastNotification } from './components/layout/ToastNotification';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { OfflineStatusIndicator, PWAFloatingBanner } from './components/PWAInstallBanner';

// Feature Modules
import { LoginScreen, ChangePasswordModal, RoleChangeModal, validatePassword } from './features/auth';
import { Dashboard } from './features/dashboard';
import { TransactionsModule } from './features/transactions';
import { OrdersModule } from './features/orders';
import { PassbookModule } from './features/passbook';
import { ReportsModule } from './features/reports';
import { AdminModule } from './features/admin';

export function App() {
  // Authentication session
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_SESSION_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return authSession?.role === 'admin';
  });

  const isLoggedIn = !!authSession;

  // Active navigation & tab history
  const [activeTab, setActiveTab] = useState<Tab>('Dashboard');
  const [tabHistory, setTabHistory] = useState<Tab[]>(['Dashboard']);
  const tabHistoryRef = useRef<Tab[]>(['Dashboard']);
  tabHistoryRef.current = tabHistory;

  const activeTabRef = useRef<Tab>('Dashboard');
  activeTabRef.current = activeTab;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Database State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  // Categories & Modes
  const [expenseCategories, setExpenseCategories] = useState<string[]>(getStoredExpenseCategories);
  const [paymentModes, setPaymentModes] = useState<string[]>(getStoredPaymentModes);

  // Cloud Sync State
  const [apiLink, setApiLink] = useState(localStorage.getItem('BT_API_LINK') || '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [hasPendingSync, setHasPendingSync] = useState(() => localStorage.getItem(SYNC_PENDING_KEY) === 'true');
  const [lastSyncedAt, setLastSyncedAt] = useState(() => localStorage.getItem(LAST_SYNC_AT_KEY) || '');
  const syncInFlightRef = useRef(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState<FilterDate>('All');
  const [customDateRange, setCustomDateRange] = useState<CustomDateRange>({ start: '', end: '' });

  // Quick navigation routing states
  const [orderInitialFilter, setOrderInitialFilter] = useState<'All' | 'Pending' | 'Partial' | 'Completed' | 'Overdue'>('All');
  const [reportsInitialTab, setReportsInitialTab] = useState<'overview' | 'expenses' | 'income' | 'payments' | 'suppliers'>('overview');
  const [autoOpenAddTxn, setAutoOpenAddTxn] = useState(false);
  const [autoOpenAddOrder, setAutoOpenAddOrder] = useState(false);

  // Modals & Popups
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | number | null>(null);
  const [exitConfirm, setExitConfirm] = useState(false);
  const exitConfirmRef = useRef(false);
  const [pdfPreviewData, setPdfPreviewData] = useState<PdfPreviewData | null>(null);
  const [isRoleChangeModalOpen, setIsRoleChangeModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  // Toast handler
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Login handler
  const performLogin = useCallback((session: AuthSession) => {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    localStorage.setItem('BT_IS_ADMIN', (session.role === 'admin').toString());
    setAuthSession(session);
    setIsAdmin(session.role === 'admin');
    showToast(`Welcome back, ${session.name || session.username} (${session.role === 'admin' ? 'Admin' : 'Staff'})`, 'success');
  }, [showToast]);

  const handleLogout = useCallback((reason?: string) => {
    localStorage.removeItem(AUTH_SESSION_KEY);
    setAuthSession(null);
    setIsAdmin(false);
    setActiveTab('Dashboard');
    tabHistoryRef.current = ['Dashboard'];
    activeTabRef.current = 'Dashboard';
    if (reason) {
      showToast(reason, 'error');
    } else {
      showToast('Logged out successfully', 'info');
    }
  }, [showToast]);

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

  const handleUpdateCategories = (newCats: string[]) => {
    setExpenseCategories(newCats);
    saveStoredExpenseCategories(newCats);
  };

  const handleUpdatePaymentModes = (newModes: string[]) => {
    setPaymentModes(newModes);
    saveStoredPaymentModes(newModes);
  };

  // Sync category events from other components
  useEffect(() => {
    const handleCatUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) setExpenseCategories(e.detail);
    };
    const handleModeUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) setPaymentModes(e.detail);
    };
    window.addEventListener('bt_categories_updated', handleCatUpdate);
    window.addEventListener('bt_payment_modes_updated', handleModeUpdate);
    return () => {
      window.removeEventListener('bt_categories_updated', handleCatUpdate);
      window.removeEventListener('bt_payment_modes_updated', handleModeUpdate);
    };
  }, []);

  // Tab Navigation with history stack
  const navigateToTab = useCallback((newTab: Tab) => {
    setActiveTab(newTab);
    setTabHistory(prev => {
      if (newTab === 'Dashboard') {
        return ['Dashboard'];
      }
      if (prev[prev.length - 1] === newTab) {
        return prev;
      }
      return [...prev, newTab];
    });
  }, []);

  const handleNavigateToPendingOrders = useCallback(() => {
    setOrderInitialFilter('Pending');
    navigateToTab('Orders');
  }, [navigateToTab]);

  const handleNavigateToOverdueOrders = useCallback(() => {
    setOrderInitialFilter('Overdue');
    navigateToTab('Orders');
  }, [navigateToTab]);

  const handleNavigateToOrders = useCallback(() => {
    setOrderInitialFilter('All');
    navigateToTab('Orders');
  }, [navigateToTab]);

  const handleOpenAddTxnFromHome = useCallback(() => {
    setAutoOpenAddTxn(true);
    navigateToTab('Transactions');
  }, [navigateToTab]);

  const handleOpenAddOrderFromHome = useCallback(() => {
    setAutoOpenAddOrder(true);
    navigateToTab('Orders');
  }, [navigateToTab]);

  // Back button & gesture handling
  const handleFallbackBack = useCallback(() => {
    const history = tabHistoryRef.current;
    const currentTab = activeTabRef.current;

    if (history.length > 1) {
      const nextHistory = [...history];
      nextHistory.pop();
      const previousTab = nextHistory[nextHistory.length - 1];
      setTabHistory(nextHistory);
      setActiveTab(previousTab);
      return;
    }

    if (currentTab !== 'Dashboard') {
      setTabHistory(['Dashboard']);
      setActiveTab('Dashboard');
      return;
    }

    if (exitConfirmRef.current) {
      backHandler.exitApp();
      return;
    }

    exitConfirmRef.current = true;
    setExitConfirm(true);
    setTimeout(() => {
      exitConfirmRef.current = false;
      setExitConfirm(false);
    }, 2500);
  }, []);

  useEffect(() => {
    backHandler.init(handleFallbackBack);
    backHandler.setFallback(handleFallbackBack);
  }, [handleFallbackBack]);

  useBackHandler(() => {
    setPdfPreviewData(null);
    return true;
  }, !!pdfPreviewData, 100);

  useBackHandler(() => {
    setIsRoleChangeModalOpen(false);
    return true;
  }, isRoleChangeModalOpen, 95);

  useBackHandler(() => {
    setIsChangePasswordModalOpen(false);
    return true;
  }, isChangePasswordModalOpen, 96);

  useBackHandler(() => {
    setIsSidebarOpen(false);
    return true;
  }, isSidebarOpen, 90);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  // Data Loading
  const loadData = useCallback(async () => {
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
    setExpenseCategories(getStoredExpenseCategories());
    setPaymentModes(getStoredPaymentModes());
    setHasPendingSync(localHasUnsyncedChanges || localStorage.getItem(SYNC_PENDING_KEY) === 'true');
  }, []);

  const handleGoogleSheetReset = async () => {
    await markAllLocalDataSynced();
    resetSyncState();
    await loadData();
  };

  useEffect(() => {
    if (isLoggedIn) {
      loadData();
    }
  }, [isLoggedIn, loadData]);

  // Cloud Sync logic
  const syncWithGoogleSheets = useCallback(async (trigger: SyncTrigger = 'manual'): Promise<boolean> => {
    if (syncInFlightRef.current) return false;

    if (!apiLink) {
      if (trigger === 'manual') {
        showToast('Please set Google Sheet API link in Admin settings', 'error');
      }
      return false;
    }

    if (!isOnline) {
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
      const syncResult = await syncLocalAndGoogleSheets(
        apiLink,
        authSession?.password ? { username: authSession.username, password: authSession.password } : undefined
      );

      if (syncResult.authRevoked) {
        handleLogout(syncResult.authReason || 'Credentials or access updated in Google Sheet. Please log in again.');
        return false;
      }

      if (syncResult.userUpdate && authSession) {
        const newRole = syncResult.userUpdate.role;
        const newName = syncResult.userUpdate.name;
        if (newRole !== authSession.role || newName !== authSession.name) {
          const updatedSession: AuthSession = {
            ...authSession,
            role: newRole,
            name: newName,
          };
          localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(updatedSession));
          localStorage.setItem('BT_IS_ADMIN', (newRole === 'admin').toString());
          setAuthSession(updatedSession);
          setIsAdmin(newRole === 'admin');
          showToast(`Access updated to ${newRole === 'admin' ? 'Admin' : 'Staff'} from Google Sheet`, 'info');
        }
      }

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
  }, [apiLink, isOnline, hasPendingSync, authSession, handleLogout, loadData, showToast]);

  const handleOnline = useEffectEvent(() => {
    setIsOnline(true);
    if (localStorage.getItem(SYNC_PENDING_KEY) === 'true') {
      showToast('Internet is back. Syncing pending changes...', 'info');
      if (isLoggedIn && apiLink) {
        void syncWithGoogleSheets('reconnect');
      }
    }
  });

  const handleOffline = useEffectEvent(() => {
    setIsOnline(false);
    showToast('Offline mode active. New entries will sync when internet returns.', 'info');
  });

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !isOnline || !apiLink || !hasPendingSync || isSyncing) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void syncWithGoogleSheets('background');
    }, 1200);
    return () => window.clearTimeout(timeoutId);
  }, [apiLink, hasPendingSync, isLoggedIn, isOnline, isSyncing, syncWithGoogleSheets]);

  // Role change submit
  const handleRoleChangeSubmit = async (targetRole: 'admin' | 'staff', reason: string): Promise<boolean> => {
    if (!authSession) return false;
    if (!apiLink) {
      showToast('Google Sheet API link is not configured', 'error');
      return false;
    }
    if (!isOnline) {
      showToast('Internet connection required to submit role change request', 'error');
      return false;
    }

    try {
      const res = await requestRoleChangeWithGoogleSheet(apiLink, {
        username: authSession.username,
        password: authSession.password,
        targetRole,
        reason,
      });

      if (res.success) {
        showToast(res.message, 'success');
        void syncWithGoogleSheets('manual');
        return true;
      } else {
        showToast(res.message, 'error');
        return false;
      }
    } catch (err: any) {
      console.error('Role change request failed', err);
      showToast(err?.message || 'Failed to submit role change request', 'error');
      return false;
    }
  };

  // Change password submit
  const handleChangePasswordSubmit = async (currPassword: string, newPassword: string): Promise<boolean> => {
    if (!authSession) return false;

    const trimmedNew = newPassword.trim();
    const passValidation = validatePassword(trimmedNew, authSession.username);
    if (!passValidation.isValid) {
      showToast(passValidation.errorMessage || 'Please choose a stronger password', 'error');
      return false;
    }

    if (authSession.password && trimmedNew === authSession.password) {
      showToast('New password cannot be the same as your current password', 'error');
      return false;
    }

    if (authSession.password && currPassword && currPassword !== authSession.password) {
      showToast('Current password is incorrect', 'error');
      return false;
    }

    try {
      if (apiLink && isOnline) {
        try {
          const res = await changeUserPasswordWithGoogleSheet(apiLink, {
            username: authSession.username,
            oldPassword: currPassword || authSession.password,
            newPassword: trimmedNew,
          });
          if (!res.success) {
            showToast(res.message, 'error');
            return false;
          }
        } catch (sheetErr: any) {
          console.warn('Google Sheet password sync failed:', sheetErr);
          showToast('Updated locally. (Google Sheet sync failed: ' + (sheetErr?.message || 'Network error') + ')', 'info');
        }
      }

      const updatedSession: AuthSession = {
        ...authSession,
        password: trimmedNew,
      };
      setAuthSession(updatedSession);
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(updatedSession));
      showToast('Password changed successfully!', 'success');
      return true;
    } catch (err: any) {
      showToast('Failed to change password: ' + (err?.message || 'Error'), 'error');
      return false;
    }
  };

  // Dashboard Stats
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

  // If not logged in, render the clean login screen
  if (!isLoggedIn) {
    return (
      <LoginScreen
        apiLink={apiLink}
        setApiLink={setApiLink}
        isOnline={isOnline}
        onLoginSuccess={performLogin}
        toast={toast}
        showToast={showToast}
        onDismissToast={() => setToast(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-10 w-full max-w-full overflow-x-hidden">
      {/* Navigation Header */}
      <AppHeader
        activeTab={activeTab}
        onOpenSidebar={() => setIsSidebarOpen(true)}
        syncStatusTitle={syncStatusTitle}
        syncStatusDotClass={syncStatusDotClass}
        syncStatusLabel={syncStatusLabel}
        isSyncing={isSyncing}
        hasPendingSync={hasPendingSync}
        authSession={authSession}
        isAdmin={isAdmin}
        apiLink={apiLink}
        onOpenRoleChange={() => setIsRoleChangeModalOpen(true)}
        onManualSync={() => syncWithGoogleSheets('manual')}
        onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content View Container */}
      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'Dashboard' && (
            <Dashboard 
              stats={stats} 
              transactions={transactions} 
              orders={orders}
              onNavigateToTransactions={() => navigateToTab('Transactions')}
              onNavigateToPendingOrders={handleNavigateToPendingOrders}
              onNavigateToOverdueOrders={handleNavigateToOverdueOrders}
              onNavigateToOrders={handleNavigateToOrders}
              onOpenAddTransaction={handleOpenAddTxnFromHome}
              onOpenAddOrder={handleOpenAddOrderFromHome}
              onNavigateToReports={(subTab?: any) => {
                if (subTab) setReportsInitialTab(subTab);
                navigateToTab('Reports');
              }}
              showToast={showToast}
            />
          )}

          {activeTab === 'Transactions' && (
            <TransactionsModule 
              transactions={transactions} 
              onAdd={loadData} 
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              markSyncPending={markSyncPending}
              showToast={showToast}
              isAdmin={isAdmin}
              expenseCategories={expenseCategories}
              paymentModes={paymentModes}
              initialOpenAdd={autoOpenAddTxn}
              onAddModalClosed={() => setAutoOpenAddTxn(false)}
            />
          )}

          {activeTab === 'Orders' && (
            <OrdersModule 
              orders={orders} 
              onUpdate={loadData} 
              showToast={showToast} 
              isAdmin={isAdmin} 
              markSyncPending={markSyncPending} 
              onPreviewPdf={setPdfPreviewData}
              paymentModes={paymentModes}
              initialStatusFilter={orderInitialFilter}
              initialOpenAdd={autoOpenAddOrder}
              onAddModalClosed={() => setAutoOpenAddOrder(false)}
            />
          )}

          {activeTab === 'Passbook' && (
            <PassbookModule 
              transactions={transactions} 
              filterDate={filterDate}
              setFilterDate={setFilterDate}
              customDateRange={customDateRange}
              setCustomDateRange={setCustomDateRange}
              showToast={showToast}
              onPreviewPdf={setPdfPreviewData}
            />
          )}

          {activeTab === 'Reports' && (
            <ReportsModule 
              transactions={transactions} 
              orders={orders} 
              showToast={showToast} 
              onPreviewPdf={setPdfPreviewData}
              initialTab={reportsInitialTab}
            />
          )}

          {activeTab === 'Admin' && (
            <AdminModule 
              apiLink={apiLink} 
              setApiLink={setApiLink} 
              transactions={transactions} 
              orders={orders} 
              showToast={showToast}
              isAdmin={isAdmin}
              setIsAdmin={toggleAdmin}
              resetSyncState={resetSyncState}
              onGoogleSheetReset={handleGoogleSheetReset}
              isSyncing={isSyncing}
              onSync={() => syncWithGoogleSheets('manual')}
              expenseCategories={expenseCategories}
              onUpdateCategories={handleUpdateCategories}
              paymentModes={paymentModes}
              onUpdatePaymentModes={handleUpdatePaymentModes}
              markSyncPending={markSyncPending}
              onRefreshData={loadData}
              onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
              onOpenRoleChange={() => setIsRoleChangeModalOpen(true)}
              authSession={authSession}
              isOnline={isOnline}
            />
          )}
        </AnimatePresence>
      </main>

      {/* PWA In-App Install Prompt Banner */}
      <PWAFloatingBanner />

      {/* Offline & Reconnection Status Indicator */}
      <OfflineStatusIndicator 
        unsyncedCount={transactions.filter(t => !t.synced).length + orders.filter(o => !o.synced).length}
        onSyncNow={() => syncWithGoogleSheets('manual')}
        isSyncing={isSyncing}
      />

      {/* Exit Confirmation Toast */}
      <AnimatePresence>
        {exitConfirm && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 text-white px-6 py-3 rounded-full shadow-2xl z-[100] border border-zinc-700 text-sm font-medium"
          >
            Press back again to exit
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Sidebar Drawer */}
      <AppSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        onSelectTab={navigateToTab}
        syncStatusTitle={syncStatusTitle}
        syncStatusDotClass={syncStatusDotClass}
        syncStatusLabel={syncStatusLabel}
        hasPendingSync={hasPendingSync}
        isAdmin={isAdmin}
        authSession={authSession}
        onOpenRoleChange={() => setIsRoleChangeModalOpen(true)}
        onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
        onLogout={handleLogout}
        showToast={showToast}
      />

      {/* Full-Screen PDF Preview Modal */}
      {pdfPreviewData && (
        <PdfPreviewModal
          previewData={pdfPreviewData}
          onClose={() => setPdfPreviewData(null)}
          onSaveOrShare={saveOrShareReport}
          showToast={showToast}
        />
      )}

      {/* Role Change Request Modal */}
      <RoleChangeModal
        isOpen={isRoleChangeModalOpen}
        onClose={() => setIsRoleChangeModalOpen(false)}
        onSubmit={handleRoleChangeSubmit}
        authSession={authSession}
        isAdmin={isAdmin}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        onSubmit={handleChangePasswordSubmit}
        authSession={authSession}
      />

      {/* Global Toast Notification */}
      <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export default App;
