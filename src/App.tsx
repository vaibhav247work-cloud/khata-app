import React, { useState, useEffect, useMemo, useRef, useEffectEvent } from 'react';
import { 
  LayoutDashboard, 
  ArrowUpRight, 
  ArrowDownLeft, 
  History, 
  FileText, 
  Settings, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  LogOut, 
  ChevronRight,
  Package,
  CreditCard,
  Wallet,
  Building2,
  Calendar,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Smartphone,
  Check,
  CheckSquare,
  Square,
  ListChecks,
  X,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, type Transaction, type Order, type OrderPayment, type OrderItem } from './db';
import { hasUnsyncedLocalChanges, markAllLocalDataSynced, syncLocalAndGoogleSheets, type SyncTrigger } from './sync';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
} from 'recharts';
import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// --- Types & Constants ---

type Tab = 'Dashboard' | 'Transactions' | 'Orders' | 'Passbook' | 'Reports' | 'Admin';

const PAYMENT_TYPES = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Online'] as const;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
const SYNC_PENDING_KEY = 'BT_PENDING_SYNC';
const LAST_SYNC_AT_KEY = 'BT_LAST_SYNC_AT';

// --- Components ---

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('Dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
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
    // Push initial state
    window.history.pushState({ tab: activeTab }, '');

    const handleBack = (event: PopStateEvent) => {
      if (activeTab !== 'Dashboard') {
        setActiveTab('Dashboard');
        window.history.pushState({ tab: 'Dashboard' }, '');
      } else {
        if (exitConfirmRef.current) {
          // Allow exit - don't push state
          // The browser will go back to whatever was before this app
          return;
        }

        setExitConfirm(true);
        exitConfirmRef.current = true;
        setTimeout(() => {
          setExitConfirm(false);
          exitConfirmRef.current = false;
        }, 3000);
        
        // Push state again to prevent exit on first back press
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
    const [txs, ords, localHasUnsyncedChanges] = await Promise.all([
      db.transactions.toArray(),
      db.orders.toArray(),
      hasUnsyncedLocalChanges(),
    ]);
    
    // Explicitly sort descending by date to ensure correct order in all modules
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
  }, [apiLink, hasPendingSync, isLoggedIn, isOnline, isSyncing]);

  // --- Filtered Data ---
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

  // --- Renderers ---

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-orange-500/20">
              <Building2 className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white">KhataBook Pro</h1>
            <div className="flex flex-col items-center">
              <p className="text-zinc-500 text-sm">Business Management Software</p>
              <p className="text-zinc-600 text-[10px]">made by VaibhavK</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Username</label>
              <input 
                name="username"
                type="text" 
                defaultValue="admin"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                placeholder="Enter username"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Password</label>
              <input 
                name="password"
                type="password" 
                defaultValue="admin123"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                placeholder="Enter password"
              />
            </div>
            <button 
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-orange-500/20 active:scale-95"
            >
              Login to Dashboard
            </button>
          </form>
          <div className="mt-8 text-center text-zinc-600 text-xs space-y-1">
            <p>Default: admin / admin123</p>
            <p>Default user: user / user123</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-24">
      {/* Header */}
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
            onClick={() => void syncWithGoogleSheets('manual')}
            disabled={isSyncing || !apiLink}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 disabled:opacity-40 disabled:cursor-not-allowed"
            title={apiLink ? 'Sync Data' : 'Add Google Sheet API link first'}
          >
            <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setIsLoggedIn(false)}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'Dashboard' && (
            <Dashboard 
              stats={stats} 
              transactions={transactions} 
              onNavigateToTransactions={() => setActiveTab('Transactions')}
            />
          )}
          {activeTab === 'Transactions' && (
            <TransactionsModule 
              transactions={filteredTransactions} 
              onAdd={() => loadData()} 
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              markSyncPending={markSyncPending}
              showToast={showToast}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === 'Orders' && <OrdersModule orders={orders} onUpdate={() => loadData()} showToast={showToast} isAdmin={isAdmin} markSyncPending={markSyncPending} />}
          {activeTab === 'Passbook' && (
            <PassbookModule 
              transactions={filteredTransactions} 
              filterDate={filterDate}
              setFilterDate={setFilterDate}
              customDateRange={customDateRange}
              setCustomDateRange={setCustomDateRange}
            />
          )}
          {activeTab === 'Reports' && <ReportsModule transactions={transactions} orders={orders} showToast={showToast} />}
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
            />
          )}
        </AnimatePresence>
      </main>

      {/* Global Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-24 left-1/2 bg-zinc-800 text-white px-6 py-3 rounded-full shadow-2xl z-[200] border border-zinc-700 text-sm font-medium flex items-center gap-2 ${
              toast.type === 'success' ? 'border-green-500/50' : 
              toast.type === 'error' ? 'border-red-500/50' : ''
            }`}
          >
            {toast.type === 'success' && <div className="w-2 h-2 rounded-full bg-green-500" />}
            {toast.type === 'error' && <div className="w-2 h-2 rounded-full bg-red-500" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit Confirmation Toast */}
      <AnimatePresence>
        {exitConfirm && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-zinc-800 text-white px-6 py-3 rounded-full shadow-2xl z-[100] border border-zinc-700 text-sm font-medium"
          >
            Press back again to exit
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800 px-2 pb-6 pt-3 z-50 pb-safe overflow-x-auto no-scrollbar">
        <div className="min-w-max sm:min-w-0 max-w-4xl mx-auto flex justify-around items-center gap-1 px-2">
          <NavItem icon={LayoutDashboard} label="Home" active={activeTab === 'Dashboard'} onClick={() => setActiveTab('Dashboard')} />
          <NavItem icon={ArrowUpRight} label="Txs" active={activeTab === 'Transactions'} onClick={() => setActiveTab('Transactions')} />
          <NavItem icon={Package} label="Orders" active={activeTab === 'Orders'} onClick={() => setActiveTab('Orders')} />
          <NavItem icon={History} label="Passbook" active={activeTab === 'Passbook'} onClick={() => setActiveTab('Passbook')} />
          <NavItem icon={FileText} label="Reports" active={activeTab === 'Reports'} onClick={() => setActiveTab('Reports')} />
          <NavItem icon={Settings} label="Admin" active={activeTab === 'Admin'} onClick={() => setActiveTab('Admin')} />
        </div>
      </nav>
    </div>
  );
}

// --- Sub-Components ---

function NavItem({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2 sm:px-3 py-1 rounded-2xl transition-all shrink-0 ${active ? 'text-orange-500' : 'text-zinc-500'}`}
    >
      <div className={`p-1.5 sm:p-2 rounded-xl transition-all ${active ? 'bg-orange-500/10' : ''}`}>
        <Icon className="w-5 h-5 sm:w-6 h-6" />
      </div>
      <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function Dashboard({ 
  stats, 
  transactions, 
  onNavigateToTransactions 
}: { 
  stats: any; 
  transactions: Transaction[]; 
  onNavigateToTransactions?: () => void;
}) {
  const recentTxs = useMemo(() => {
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [transactions]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Net Balance" value={stats.netBalance} icon={Wallet} color="text-white" bg="bg-zinc-900" full />
        <StatCard label="Total Credit" value={stats.totalCredit} icon={ArrowUpRight} color="text-green-500" bg="bg-zinc-900" />
        <StatCard label="Total Debit" value={stats.totalDebit} icon={ArrowDownLeft} color="text-red-500" bg="bg-zinc-900" />
        <StatCard label="Pending Payments" value={stats.pendingPayments} icon={Clock} color="text-orange-500" bg="bg-zinc-900" />
        <StatCard label="Active Orders" value={stats.pendingOrders} icon={Package} color="text-blue-500" bg="bg-zinc-900" isCount />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
        <div 
          id="dashboard-recent-txs-header"
          onClick={onNavigateToTransactions}
          className="flex items-center justify-between mb-6 cursor-pointer group select-none"
        >
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-white group-hover:text-orange-400 transition-colors">Recent Transactions</h3>
          </div>
          <button
            id="recent-txs-arrow-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToTransactions?.();
            }}
            title="View all transactions"
            className="p-1.5 rounded-xl bg-zinc-800/80 group-hover:bg-orange-500/20 text-zinc-400 group-hover:text-orange-400 transition-all flex items-center justify-center"
          >
            <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
        <div className="space-y-4">
          {recentTxs.map(tx => (
            <div 
              key={tx.id} 
              onClick={onNavigateToTransactions}
              className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700/60 rounded-2xl cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl shrink-0 ${tx.type === 'Credit' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  {tx.type === 'Credit' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">{tx.category}</p>
                  <p className="text-zinc-500 text-[10px] leading-tight">{tx.description.includes('Payment done for') ? 'Order Payment' : tx.description}</p>
                  <p className="text-zinc-600 text-[9px] mt-0.5">{format(parseISO(tx.date), 'dd MMM, yyyy')}</p>
                </div>
              </div>
              <p className={`font-bold ${tx.type === 'Credit' ? 'text-green-500' : 'text-red-500'}`}>
                {tx.type === 'Credit' ? '+' : '-'}₹{tx.amount.toLocaleString()}
              </p>
            </div>
          ))}
          {recentTxs.length === 0 && (
            <p className="text-center text-zinc-500 py-8">No transactions yet</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, icon: Icon, color, bg, full, isCount }: any) {
  return (
    <div className={`${bg} border border-zinc-800 rounded-3xl p-5 ${full ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-xl bg-zinc-800 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>
        {!isCount && '₹'}{value.toLocaleString()}
      </p>
    </div>
  );
}

function TransactionsModule({ transactions, onAdd, searchQuery, setSearchQuery, markSyncPending, showToast }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions]);

  const selectedTransactions = useMemo(() => {
    return transactions.filter((t: any) => selectedIds.has(t.id));
  }, [transactions, selectedIds]);

  const selectedDebitTotal = useMemo(() => {
    return selectedTransactions
      .filter((t: any) => t.type === 'Debit')
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
  }, [selectedTransactions]);

  const selectedCreditTotal = useMemo(() => {
    return selectedTransactions
      .filter((t: any) => t.type === 'Credit')
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
  }, [selectedTransactions]);

  const allVisibleSelected = sortedTransactions.length > 0 && sortedTransactions.every((t: any) => selectedIds.has(t.id));

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTransactions.map((t: any) => t.id)));
    }
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
  };

  const executeBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);

    try {
      const idsToDelete = Array.from(selectedIds);
      await db.transactions.bulkDelete(idsToDelete);
      
      markSyncPending();
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      
      if (showToast) {
        showToast(`Deleted ${idsToDelete.length} transaction${idsToDelete.length > 1 ? 's' : ''} successfully`, 'success');
      }
      onAdd();
    } catch (err) {
      console.error('Bulk delete error:', err);
      if (showToast) {
        showToast('Failed to delete transactions. Please try again.', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const closeTransactionForm = () => {
    setShowAdd(false);
    setEditingTransaction(null);
  };

  const handleTransactionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = editingTransaction?.date.split('T')[1] || format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const tx: Transaction = {
      id: editingTransaction?.id || crypto.randomUUID(),
      date: fullDate,
      type: formData.get('type') as any,
      category: formData.get('category') as string,
      amount: Number(formData.get('amount')),
      payment_type: formData.get('payment_type') as any,
      description: formData.get('description') as string,
      reference: formData.get('reference') as string,
      order_id: editingTransaction?.order_id,
      synced: false
    };

    if (editingTransaction) {
      await db.transactions.put(tx);
    } else {
      await db.transactions.add(tx);
    }

    markSyncPending();
    closeTransactionForm();
    onAdd();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      {/* Top Search & Action Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            id="transaction-search-input"
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transactions..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {sortedTransactions.length > 0 && (
          <button
            id="toggle-multi-select-btn"
            onClick={() => {
              if (selectedIds.size > 0) {
                cancelSelection();
              } else {
                toggleSelectAll();
              }
            }}
            title={selectedIds.size > 0 ? 'Clear Selection' : 'Select All Transactions'}
            className={`p-4 rounded-2xl border transition-all flex items-center justify-center shrink-0 ${
              selectedIds.size > 0 
                ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-lg shadow-orange-500/20' 
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            <ListChecks className="w-6 h-6" />
          </button>
        )}

        <button 
          id="add-transaction-open-btn"
          onClick={() => {
            setEditingTransaction(null);
            setShowAdd(true);
          }}
          className="bg-orange-500 hover:bg-orange-600 p-4 rounded-2xl text-white shadow-lg shadow-orange-500/20 active:scale-95 transition-all shrink-0"
          title="Add Transaction"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* Multi-Select Action Toolbar - Autohidden if none selected */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.15 }}
            className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-850 border border-orange-500/40 rounded-2xl p-3.5 shadow-xl space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <button
                  id="select-all-transactions-btn"
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                >
                  {allVisibleSelected ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-orange-500" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-zinc-400" />
                      Select All ({sortedTransactions.length})
                    </>
                  )}
                </button>

                <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-bold px-2.5 py-1 rounded-xl">
                  {selectedIds.size} Selected
                </span>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  id="bulk-delete-trigger-btn"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="bg-red-500/15 hover:bg-red-500 border border-red-500/30 hover:border-red-500 text-red-400 hover:text-white text-xs font-bold px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-lg shadow-red-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete ({selectedIds.size})
                </button>

                <button
                  id="cancel-selection-btn"
                  onClick={cancelSelection}
                  className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Selection Breakdown */}
            <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
              <span>Selected totals:</span>
              {selectedCreditTotal > 0 && (
                <span className="text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-md border border-green-500/20">
                  Credit: +₹{selectedCreditTotal.toLocaleString()}
                </span>
              )}
              {selectedDebitTotal > 0 && (
                <span className="text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                  Debit: -₹{selectedDebitTotal.toLocaleString()}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transactions List */}
      <div className="space-y-3">
        {sortedTransactions.map((tx: any) => {
          const isSelected = selectedIds.has(tx.id);

          return (
            <div 
              key={tx.id} 
              id={`transaction-card-${tx.id}`}
              className={`border rounded-2xl p-3.5 sm:p-4 flex items-center justify-between transition-all select-none ${
                isSelected 
                  ? 'bg-orange-500/10 border-orange-500/60 shadow-lg shadow-orange-500/5 ring-1 ring-orange-500/30' 
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2.5 sm:gap-3.5 flex-1 min-w-0 pr-2">
                {/* Small Compact Checkbox Button */}
                <button
                  id={`select-checkbox-${tx.id}`}
                  type="button"
                  onClick={(e) => toggleSelect(tx.id, e)}
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                    isSelected 
                      ? 'bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/30' 
                      : 'border-zinc-700/80 bg-zinc-800/30 hover:border-zinc-500 text-transparent hover:bg-zinc-800'
                  }`}
                  title={isSelected ? 'Deselect transaction' : 'Select transaction'}
                >
                  <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                </button>

                {/* Small Compact Type Indicator */}
                <div className={`p-1.5 rounded-lg shrink-0 ${tx.type === 'Credit' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                  {tx.type === 'Credit' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                </div>

                {/* High-Visibility Expanded Text Block */}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm sm:text-base text-zinc-100 truncate leading-snug">{tx.category}</p>
                  {tx.description && (
                    <p className="text-zinc-400 text-xs truncate mt-0.5 leading-normal">{tx.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                    <span className="bg-zinc-800/90 text-zinc-300 text-[10px] px-2 py-0.5 rounded-md uppercase font-bold tracking-wider">{tx.payment_type}</span>
                    <span className="text-zinc-500 text-[10px]">{format(parseISO(tx.date), 'dd MMM yyyy')}</span>
                    {tx.order_id && (
                      <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] px-1.5 py-0.5 rounded font-bold">
                        Order
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className={`text-base sm:text-lg font-extrabold tracking-tight ${tx.type === 'Credit' ? 'text-green-500' : 'text-red-500'}`}>
                  {tx.type === 'Credit' ? '+' : '-'}₹{Number(tx.amount || 0).toLocaleString()}
                </p>
                {tx.reference && <p className="text-zinc-500 text-[10px] truncate max-w-[110px] mt-0.5">Ref: {tx.reference}</p>}
                
                {!tx.order_id && (
                  <button
                    id={`edit-tx-btn-${tx.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTransaction(tx);
                      setShowAdd(false);
                    }}
                    className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-zinc-400 hover:text-orange-400 transition-colors"
                    title="Edit Transaction"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {transactions.length === 0 && (
          <div className="text-center py-20 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-[40px]">
            <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="text-zinc-600 w-8 h-8" />
            </div>
            <p className="text-zinc-500 font-medium">No transactions found</p>
            <p className="text-zinc-600 text-xs mt-1">Tap the + button to add your first entry</p>
          </div>
        )}
      </div>

      {/* Bulk Delete Confirmation Modal */}
      <AnimatePresence>
        {showBulkDeleteConfirm && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => !isDeleting && setShowBulkDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7" />
              </div>

              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-white">
                  Delete {selectedIds.size} Transaction{selectedIds.size > 1 ? 's' : ''}?
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400">
                  Are you sure you want to permanently delete the selected entries? This will clean up your local records and update your ledger balance.
                </p>
              </div>

              {/* Breakdown */}
              <div className="bg-zinc-800/50 border border-zinc-700/40 rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Selected Records:</span>
                  <span className="font-bold text-white">{selectedIds.size}</span>
                </div>
                {selectedDebitTotal > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Total Expense (Debit):</span>
                    <span className="font-bold">-₹{selectedDebitTotal.toLocaleString()}</span>
                  </div>
                )}
                {selectedCreditTotal > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>Total Income (Credit):</span>
                    <span className="font-bold">+₹{selectedCreditTotal.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  id="cancel-bulk-delete-btn"
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="flex-1 py-3.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="confirm-bulk-delete-btn"
                  type="button"
                  disabled={isDeleting}
                  onClick={executeBulkDelete}
                  className="flex-1 py-3.5 px-4 rounded-2xl bg-red-500 hover:bg-red-600 active:scale-98 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 disabled:opacity-60"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {(showAdd || editingTransaction) && (
          <div 
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={closeTransactionForm}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[85vh] pb-32 sm:pb-8"
            >
              <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-8" />
              <h2 className="text-2xl font-bold mb-6">{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</h2>
              <form onSubmit={handleTransactionSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Type</label>
                    <select name="type" defaultValue={editingTransaction?.type || 'Debit'} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white">
                      <option value="Debit">Debit (Expense)</option>
                      <option value="Credit">Credit (Income)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Date</label>
                    <input name="date" type="date" defaultValue={editingTransaction ? format(parseISO(editingTransaction.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Name / Category</label>
                  <input 
                    name="category" 
                    type="text" 
                    defaultValue={editingTransaction?.category || ''}
                    placeholder="e.g. Cement, Site Payment" 
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" 
                    required 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Amount</label>
                    <input 
                      name="amount" 
                      type="number" 
                      defaultValue={editingTransaction?.amount ?? ''}
                      inputMode="decimal"
                      placeholder="0.00" 
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm no-spinner text-white" 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Payment Mode</label>
                    <select name="payment_type" defaultValue={editingTransaction?.payment_type || PAYMENT_TYPES[0]} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white">
                      {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Description</label>
                  <input name="description" type="text" defaultValue={editingTransaction?.description || ''} placeholder="What is this for?" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Reference (Optional)</label>
                  <input name="reference" type="text" defaultValue={editingTransaction?.reference || ''} placeholder="Bill No / UPI ID" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" />
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={closeTransactionForm} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-4 rounded-2xl font-bold text-sm text-zinc-300 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 bg-orange-500 hover:bg-orange-600 py-4 rounded-2xl font-bold text-sm text-white shadow-lg shadow-orange-500/20 transition-colors">{editingTransaction ? 'Update Entry' : 'Save Entry'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function OrdersModule({ orders, onUpdate, showToast, isAdmin, markSyncPending }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const createEmptyOrderItem = (): OrderItem => ({ id: crypto.randomUUID(), material: '', quantity: '', amount: 0 });
  const [newItems, setNewItems] = useState<OrderItem[]>([createEmptyOrderItem()]);

  const filteredOrders = useMemo(() => {
    const sorted = [...orders].sort((a: Order, b: Order) => b.date.localeCompare(a.date));
    if (!orderSearchQuery.trim()) return sorted;

    const q = orderSearchQuery.toLowerCase().trim();
    return sorted.filter((order: Order) => {
      const matchSupplier = (order.supplier || '').toLowerCase().includes(q);
      const matchItems = (order.items || []).some(item => 
        (item.material || '').toLowerCase().includes(q) ||
        (item.quantity || '').toLowerCase().includes(q)
      );
      return matchSupplier || matchItems;
    });
  }, [orders, orderSearchQuery]);

  const getItemSummary = (items: OrderItem[]) => {
    const validItems = (items || []).filter(i => i.material.trim() !== '');
    if (validItems.length === 0) return 'Untitled Order';
    if (validItems.length === 1) return validItems[0].material;
    return `${validItems[0].material} + ${validItems.length - 1} more`;
  };

  const getFullItemSummary = (items: OrderItem[]) => {
    if (!items) return '';
    return items.map(i => i.material).join(', ');
  };

  const closeOrderForm = () => {
    setShowAdd(false);
    setEditingOrder(null);
    setNewItems([createEmptyOrderItem()]);
  };

  const openAddOrderForm = () => {
    setEditingOrder(null);
    setNewItems([createEmptyOrderItem()]);
    setShowAdd(true);
  };

  const openEditOrderForm = (order: Order) => {
    setShowAdd(false);
    setEditingOrder(order);
    setNewItems(order.items?.length ? order.items.map(item => ({ ...item })) : [createEmptyOrderItem()]);
  };

  const handleAddItemRow = () => {
    setNewItems([...newItems, createEmptyOrderItem()]);
  };

  const handleRemoveItemRow = (id: string) => {
    if (newItems.length > 1) {
      setNewItems(newItems.filter(i => i.id !== id));
    }
  };

  const handleItemChange = (id: string, field: keyof OrderItem, value: any) => {
    setNewItems(newItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleOrderSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const filteredItems = newItems.filter(item => item.material.trim() !== '');
    if (filteredItems.length === 0) {
      showToast('Please add at least one material name', 'error');
      return;
    }

    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = editingOrder?.date.split('T')[1] || format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const total = filteredItems.reduce((sum, item) => sum + Number(item.amount), 0);
    const supplier = formData.get('supplier') as string;

    if (editingOrder) {
      if (total < editingOrder.paid_amount) {
        showToast(`Total amount cannot be less than paid amount of ₹${editingOrder.paid_amount.toLocaleString()}`, 'error');
        return;
      }

      const remaining = total - editingOrder.paid_amount;
      const status = remaining <= 0 ? 'Completed' : editingOrder.paid_amount > 0 ? 'Partial' : 'Pending';

      await db.orders.put({
        ...editingOrder,
        items: filteredItems,
        supplier,
        total_amount: total,
        remaining_amount: remaining,
        status,
        date: fullDate,
        synced: false
      });

      const itemSummary = getItemSummary(filteredItems);
      await db.transactions.where('order_id').equals(editingOrder.order_id).modify((tx) => {
        tx.category = supplier;
        tx.description = `Payment done for ${itemSummary}`;
        tx.synced = false;
      });
    } else {
      const order: Order = {
        order_id: crypto.randomUUID(),
        items: filteredItems,
        supplier,
        total_amount: total,
        paid_amount: 0,
        remaining_amount: total,
        status: 'Pending',
        date: fullDate,
        synced: false
      };
      await db.orders.add(order);
    }

    markSyncPending();
    closeOrderForm();
    onUpdate();
  };

  const handlePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const paymentType = formData.get('payment_type') as string;
    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const newPaid = selectedOrder.paid_amount + amount;
    const newRemaining = selectedOrder.total_amount - newPaid;
    const newStatus = newRemaining <= 0 ? 'Completed' : 'Partial';

    const itemSummary = getItemSummary(selectedOrder.items || []);

    // 1. Update Order
    await db.orders.update(selectedOrder.order_id, {
      paid_amount: newPaid,
      remaining_amount: newRemaining,
      status: newStatus,
      synced: false
    });

    // 2. Add Payment Record
    await db.orderPayments.add({
      payment_id: crypto.randomUUID(),
      order_id: selectedOrder.order_id,
      amount,
      payment_type: paymentType,
      date: fullDate,
      synced: false
    });

    // 3. Add Transaction Entry
    await db.transactions.add({
      id: crypto.randomUUID(),
      date: fullDate,
      type: 'Debit',
      category: selectedOrder.supplier,
      amount,
      payment_type: paymentType as any,
      description: `Payment done for ${itemSummary}`,
      order_id: selectedOrder.order_id,
      synced: false
    });

    markSyncPending();
    setSelectedOrder(null);
    onUpdate();
  };

  const handleDeleteOrder = async (order: Order) => {
    try {
      // Check if payments exist
      const payments = await db.orderPayments.where('order_id').equals(order.order_id).toArray();
      
      // If payments exist and not admin, block deletion
      if (payments.length > 0 && !isAdmin) {
        showToast('Only Admin can delete orders with payments', 'error');
        setOrderToDelete(null);
        return;
      }

      // 1. Delete associated payments
      for (const p of payments) {
        await db.orderPayments.delete(p.payment_id);
      }

      // 2. Delete associated transactions
      // First try by order_id (new system)
      const txsByOrderId = await db.transactions.where('order_id').equals(order.order_id).toArray();
      for (const tx of txsByOrderId) {
        await db.transactions.delete(tx.id);
      }

      // Also try by description for older records (fallback)
      const itemSummary = getItemSummary(order.items || []);
      const txsByDesc = await db.transactions
        .where('category').equals(order.supplier)
        .and(t => t.description === `Payment done for ${itemSummary}`)
        .toArray();
      
      for (const tx of txsByDesc) {
        await db.transactions.delete(tx.id);
      }
      
      // 3. Delete the order itself
      await db.orders.delete(order.order_id);
      
      setOrderToDelete(null);
      markSyncPending();
      showToast('Order and associated transactions deleted', 'success');
      onUpdate();
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Failed to delete order', 'error');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            id="order-search-input"
            type="text" 
            value={orderSearchQuery}
            onChange={(e) => setOrderSearchQuery(e.target.value)}
            placeholder="Search by supplier or material..." 
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-10 py-3.5 sm:py-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
          />
          {orderSearchQuery && (
            <button
              id="clear-order-search-btn"
              type="button"
              onClick={() => setOrderSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button 
          id="add-new-order-btn"
          onClick={openAddOrderForm}
          className="bg-orange-500 hover:bg-orange-600 px-5 py-3.5 sm:py-4 rounded-2xl text-white font-bold shadow-lg shadow-orange-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <Plus className="w-5 h-5 text-white" />
          <span className="text-sm">New Order</span>
        </button>
      </div>

      <div className="grid gap-4">
        {filteredOrders.map((order: Order) => (
          <div key={order.order_id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative group">
            <div className="absolute top-6 right-6 flex items-center gap-2">
              <button
                onClick={() => openEditOrderForm(order)}
                className="p-2 rounded-xl transition-all text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10"
                title="Edit Order"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setOrderToDelete(order)}
                className={`p-2 rounded-xl transition-all ${
                  (order.paid_amount || 0) === 0 
                    ? 'text-zinc-400 hover:text-red-500 hover:bg-red-500/10 opacity-100' 
                    : 'text-zinc-600 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100'
                }`}
                title="Delete Order"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-between items-start mb-4 pr-20">
              <div>
                <h3 className="text-lg font-bold">{order.supplier}</h3>
                <p className="text-zinc-500 text-sm flex items-center gap-1">{getItemSummary(order.items || [])}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                order.status === 'Completed' ? 'bg-green-500/10 text-green-500' : 
                order.status === 'Partial' ? 'bg-orange-500/10 text-orange-500' : 'bg-zinc-800 text-zinc-500'
              }`}>
                {order.status}
              </span>
            </div>

            {/* Items List */}
            <div className="mb-6 space-y-2">
              {(order.items || []).map((item) => (
                <div key={item.id} className="flex justify-between text-xs border-b border-zinc-800 pb-2 last:border-0">
                  <div className="flex flex-col">
                    <span className="font-medium text-zinc-300">{item.material}</span>
                    <span className="text-zinc-500">{item.quantity}</span>
                  </div>
                  <span className="font-bold">₹{item.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Total</p>
                <p className="font-bold text-sm">₹{order.total_amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Paid</p>
                <p className="font-bold text-sm text-green-500">₹{order.paid_amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Balance</p>
                <p className="font-bold text-sm text-red-500">₹{order.remaining_amount.toLocaleString()}</p>
              </div>
            </div>

            <div className="w-full bg-zinc-800 h-2 rounded-full mb-6 overflow-hidden">
              <div 
                className="bg-green-500 h-full transition-all duration-500" 
                style={{ width: `${(order.paid_amount / order.total_amount) * 100}%` }}
              />
            </div>

            {order.status !== 'Completed' && (
              <button 
                onClick={() => setSelectedOrder(order)}
                className="w-full bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl font-bold text-sm transition-all"
              >
                Make Payment
              </button>
            )}
          </div>
        ))}

        {filteredOrders.length === 0 && (
          <div className="text-center py-16 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-[32px] p-6 space-y-2">
            <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto text-zinc-500 mb-2">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-zinc-400 font-bold">
              {orderSearchQuery ? 'No matching orders found' : 'No orders recorded yet'}
            </p>
            <p className="text-zinc-600 text-xs max-w-sm mx-auto">
              {orderSearchQuery 
                ? `No orders match "${orderSearchQuery}". Try searching by a different supplier name or material description.`
                : 'Tap New Order to record your first supplier order.'
              }
            </p>
            {orderSearchQuery && (
              <button
                type="button"
                onClick={() => setOrderSearchQuery('')}
                className="mt-3 inline-block text-xs font-bold text-orange-400 hover:text-orange-300 underline"
              >
                Clear search filter
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add Order Modal */}
      <AnimatePresence>
        {(showAdd || editingOrder) && (
          <div 
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={closeOrderForm}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-2xl rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[90vh] pb-32 sm:pb-8"
            >
              <h2 className="text-2xl font-bold mb-6">{editingOrder ? 'Edit Order' : 'New Order'}</h2>
              <form onSubmit={handleOrderSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Supplier</label>
                    <input name="supplier" type="text" defaultValue={editingOrder?.supplier || ''} placeholder="Supplier Name" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Order Date</label>
                    <input name="date" type="date" defaultValue={editingOrder ? format(parseISO(editingOrder.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" required />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 uppercase">Items / Materials</label>
                    <button 
                      type="button" 
                      onClick={handleAddItemRow}
                      className="text-orange-500 text-xs font-bold flex items-center gap-1 hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add Item
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {newItems.map((item, index) => (
                      <div key={item.id} className="relative bg-zinc-800/30 p-4 rounded-2xl border border-zinc-800/50 group">
                        <div className="grid grid-cols-12 gap-3 items-end">
                          <div className="col-span-12 sm:col-span-5">
                            <label className="block text-[10px] font-bold text-zinc-600 uppercase mb-1">Material</label>
                            <input 
                              type="text" 
                              value={item.material}
                              onChange={(e) => handleItemChange(item.id, 'material', e.target.value)}
                              placeholder="e.g. Cement" 
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-orange-500 outline-none transition-all" 
                              required 
                            />
                          </div>
                          <div className="col-span-6 sm:col-span-3">
                            <label className="block text-[10px] font-bold text-zinc-600 uppercase mb-1">Qty</label>
                            <input 
                              type="text" 
                              value={item.quantity}
                              onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                              placeholder="100 Bags" 
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-orange-500 outline-none transition-all" 
                              required 
                            />
                          </div>
                          <div className="col-span-6 sm:col-span-3">
                            <label className="block text-[10px] font-bold text-zinc-600 uppercase mb-1">Amount</label>
                            <input 
                              type="number" 
                              value={item.amount || ''}
                              onChange={(e) => handleItemChange(item.id, 'amount', Number(e.target.value))}
                              placeholder="0" 
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs no-spinner focus:ring-1 focus:ring-orange-500 outline-none transition-all" 
                              required 
                            />
                          </div>
                          <div className="col-span-12 sm:col-span-1 flex justify-end">
                            <button 
                              type="button" 
                              onClick={() => handleRemoveItemRow(item.id)}
                              className="p-2 text-zinc-600 hover:text-red-500 transition-colors bg-zinc-900 sm:bg-transparent rounded-lg"
                              disabled={newItems.length === 1}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-800/50 p-6 rounded-2xl border border-zinc-800">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-zinc-500 uppercase mb-1">Total Order Value</p>
                      <p className="text-2xl font-bold text-orange-500">
                        ₹{newItems.reduce((sum, item) => sum + Number(item.amount), 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase mb-1">Items Count</p>
                      <p className="text-lg font-bold text-zinc-400">{newItems.length}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={closeOrderForm} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 bg-orange-500 py-4 rounded-2xl font-bold text-sm hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20">{editingOrder ? 'Update Order' : 'Create Order'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div 
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedOrder(null)}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[85vh] pb-32 sm:pb-8"
            >
              <h2 className="text-2xl font-bold mb-2">Make Payment</h2>
              <p className="text-zinc-500 text-sm mb-6">Paying for {getItemSummary(selectedOrder.items)} to {selectedOrder.supplier}</p>
              <form onSubmit={handlePayment} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Amount (Max: ₹{selectedOrder.remaining_amount})</label>
                  <input 
                    name="amount" 
                    type="number" 
                    inputMode="decimal"
                    max={selectedOrder.remaining_amount} 
                    placeholder="0.00" 
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-bold no-spinner" 
                    required 
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Payment Mode</label>
                    <select name="payment_type" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm">
                      {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Date</label>
                    <input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" required />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setSelectedOrder(null)} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm">Cancel</button>
                  <button type="submit" className="flex-1 bg-green-600 py-4 rounded-2xl font-bold text-sm">Confirm Payment</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {orderToDelete && (
          <div 
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setOrderToDelete(null)}
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
              <h3 className="text-xl font-bold mb-2">Delete Order?</h3>
              <p className="text-zinc-500 text-sm mb-8">
                {orderToDelete.paid_amount > 0 
                  ? "This will permanently remove the order and all its payment history. This action cannot be undone."
                  : "Are you sure you want to remove this order? This action cannot be undone."}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setOrderToDelete(null)} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm">Cancel</button>
                <button onClick={() => handleDeleteOrder(orderToDelete)} className="flex-1 bg-red-500 py-4 rounded-2xl font-bold text-sm">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PassbookModule({ transactions, filterDate, setFilterDate, customDateRange, setCustomDateRange }: any) {
  const [typeFilter, setTypeFilter] = useState<'All' | 'Credit' | 'Debit'>('All');

  // Calculate running balance for the chronological list
  const passbookData = useMemo(() => {
    // Sort by date ascending to calculate balance
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    const withBalance = sorted.map(tx => {
      if (tx.type === 'Credit') balance += tx.amount;
      else balance -= tx.amount;
      return { ...tx, runningBalance: balance };
    });

    // Apply type filter after balance calculation to maintain correct running balance
    const filtered = typeFilter === 'All' 
      ? withBalance 
      : withBalance.filter(tx => tx.type === typeFilter);

    return filtered.reverse(); // Show newest first
  }, [transactions, typeFilter]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {['All', 'Today', 'This Week', 'This Month', 'Custom'].map((f) => (
            <button 
              key={f}
              onClick={() => setFilterDate(f as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                filterDate === f ? 'bg-orange-500 text-white' : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {['All', 'Credit', 'Debit'].map((t) => (
            <button 
              key={t}
              onClick={() => setTypeFilter(t as any)}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                typeFilter === t 
                  ? t === 'Credit' ? 'bg-green-500 text-white' : t === 'Debit' ? 'bg-red-500 text-white' : 'bg-zinc-700 text-white'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {filterDate === 'Custom' && (
        <div className="grid grid-cols-2 gap-4 bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <input 
            type="date" 
            value={customDateRange.start} 
            onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs"
          />
          <input 
            type="date" 
            value={customDateRange.end} 
            onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
            className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs"
          />
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] overflow-hidden">
        <div className="grid grid-cols-4 bg-zinc-800/50 p-4 text-[10px] font-bold uppercase tracking-widest text-zinc-500 border-b border-zinc-800">
          <span>Date</span>
          <span>Description</span>
          <span className="text-right">Credit/Debit</span>
          <span className="text-right">Balance</span>
        </div>
        <div className="divide-y divide-zinc-800">
          {passbookData.map((item) => (
            <div key={item.id} className="grid grid-cols-4 p-4 items-center">
              <span className="text-[10px] text-zinc-500">{format(parseISO(item.date), 'dd MMM')}</span>
              <div className="flex flex-col">
                <span className="text-xs font-bold truncate">{item.category}</span>
                <span className="text-[9px] text-zinc-600 truncate">{item.description}</span>
              </div>
              <div className="text-right">
                <span className={`text-xs font-bold ${item.type === 'Credit' ? 'text-green-500' : 'text-red-500'}`}>
                  {item.type === 'Credit' ? '+' : '-'}₹{item.amount.toLocaleString()}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-zinc-300">₹{item.runningBalance.toLocaleString()}</span>
              </div>
            </div>
          ))}
          {passbookData.length === 0 && (
            <div className="p-12 text-center text-zinc-600">No records found for this period</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ReportsModule({ transactions, orders, showToast }: any) {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const creditTxs = transactions.filter((t: any) => t.type === 'Credit');
  const debitTxs = transactions.filter((t: any) => t.type === 'Debit');

  const creditCategoryData = useMemo(() => {
    const counts: any = {};
    transactions.filter((t: any) => t.type === 'Credit').forEach((t: any) => {
      counts[t.category] = (counts[t.category] || 0) + t.amount;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const debitCategoryData = useMemo(() => {
    const counts: any = {};
    transactions.filter((t: any) => t.type === 'Debit').forEach((t: any) => {
      counts[t.category] = (counts[t.category] || 0) + t.amount;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const paymentData = useMemo(() => {
    const counts: any = {};
    transactions.forEach((t: any) => {
      counts[t.payment_type] = (counts[t.payment_type] || 0) + t.amount;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return window.btoa(binary);
  };

  // Helper to safely trigger a browser download for Web / Desktop
  const downloadBlobFallback = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  // Native Android & iOS Capacitor export/share handler
  const saveOrShareReport = async (base64Data: string, filename: string, mimeType: string): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }

    try {
      const cleanBase64 = base64Data.includes('base64,')
        ? base64Data.split('base64,')[1]
        : base64Data;

      // 1. Write file to application Cache directory
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: cleanBase64,
        directory: Directory.Cache,
        recursive: true,
      });

      // 2. Get file URI
      const uriResult = await Filesystem.getUri({
        directory: Directory.Cache,
        path: filename,
      });

      const fileUri = uriResult.uri || writeResult.uri;

      // 3. Share with files array (Crucial for Android FileProvider & iOS)
      try {
        await Share.share({
          title: filename,
          text: `KhataBook Report: ${filename}`,
          files: [fileUri],
          dialogTitle: `Share or Save ${mimeType.includes('pdf') ? 'PDF' : 'Excel'} Report`,
        });
      } catch (shareErr: any) {
        // Fallback for older share implementations
        const errStr = String(shareErr?.message || '').toLowerCase();
        if (errStr.includes('cancel') || errStr.includes('dismiss') || errStr.includes('abort')) {
          return true; // user closed sheet
        }
        await Share.share({
          title: filename,
          url: fileUri,
          dialogTitle: `Save ${filename}`,
        });
      }
      return true;
    } catch (err: any) {
      console.warn('Native report share/save error:', err);
      const errMsg = String(err?.message || '').toLowerCase();
      if (errMsg.includes('cancel') || errMsg.includes('dismiss') || errMsg.includes('abort')) {
        return true;
      }
      return false;
    }
  };

  const exportPDF = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);

    try {
      const doc = new jsPDF();
      (doc as any).autoTable = (options: any) => autoTable(doc, options);

      // Attempt to load Nirmala.ttf safely without crashing if offline or missing
      let hasCustomFont = false;
      try {
        const fontUrls = ['/fonts/Nirmala.ttf', './fonts/Nirmala.ttf', 'fonts/Nirmala.ttf'];
        for (const url of fontUrls) {
          try {
            const fontResponse = await fetch(url);
            if (fontResponse.ok) {
              const fontBuf = await fontResponse.arrayBuffer();
              if (fontBuf && fontBuf.byteLength > 0) {
                const fontBase64 = arrayBufferToBase64(fontBuf);
                doc.addFileToVFS('Nirmala.ttf', fontBase64);
                doc.addFont('Nirmala.ttf', 'Nirmala', 'normal');
                doc.setFont('Nirmala');
                hasCustomFont = true;
                break;
              }
            }
          } catch {
            // Next URL
          }
        }
      } catch (fontErr) {
        console.warn('Custom font load bypassed, falling back to standard font:', fontErr);
      }

      const activeFont = hasCustomFont ? 'Nirmala' : 'helvetica';
      const cur = hasCustomFont ? '₹' : 'Rs. ';

      const formatReportDate = (value: string) => {
        try {
          return format(parseISO(value), 'dd MMM yyyy, hh:mm a');
        } catch {
          return value || '-';
        }
      };

      const creditTotal = creditTxs.reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
      const debitTotal = debitTxs.reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);

      // Branded report header
      doc.setFillColor(24, 24, 27);
      doc.roundedRect(10, 10, 190, 24, 4, 4, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont(activeFont);
      doc.setFontSize(16);
      doc.text('KhataBook Pro', 16, 20);
      doc.setFontSize(9);
      doc.setTextColor(212, 212, 216);
      doc.text('Financial Transaction & Ledger Report', 16, 28);
      doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, 125, 28);

      // Quick summary boxes
      doc.setFillColor(240, 253, 244);
      doc.roundedRect(10, 38, 88, 16, 3, 3, 'F');
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(102, 38, 88, 16, 3, 3, 'F');
      
      doc.setFont(activeFont);
      doc.setFontSize(8);
      doc.setTextColor(22, 101, 52);
      doc.text(`Total Credit:  ${cur}${creditTotal.toLocaleString('en-IN')}`, 16, 48);
      doc.setTextColor(185, 28, 28);
      doc.text(`Total Debit:  ${cur}${debitTotal.toLocaleString('en-IN')}`, 108, 48);

      const tableData = (transactions || []).map((t: any) => [
        formatReportDate(t.date),
        t.type || '-',
        t.category || '-',
        `${cur}${(Number(t.amount) || 0).toLocaleString('en-IN')}`,
        t.payment_type || '-',
        t.description || '-'
      ]);

      autoTable(doc, {
        head: [['Date', 'Type', 'Category', 'Amount', 'Payment', 'Description']],
        body: tableData.length > 0 ? tableData : [['No records', '-', '-', '-', '-', '-']],
        startY: 58,
        theme: 'grid',
        styles: {
          font: activeFont,
          fontSize: 7,
          textColor: [39, 39, 42],
          lineColor: [212, 212, 216],
          lineWidth: 0.15,
          cellPadding: 1.2,
        },
        headStyles: {
          font: activeFont,
          fillColor: [234, 88, 12],
          textColor: [255, 255, 255],
          lineColor: [194, 65, 12],
          lineWidth: 0.15,
          fontStyle: 'normal',
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
          0: { cellWidth: 31 },
          1: { cellWidth: 18 },
          2: { cellWidth: 30 },
          3: { cellWidth: 23, halign: 'right' },
          4: { cellWidth: 27 },
          5: { cellWidth: 'auto' },
        },
        didDrawPage: (data) => {
          doc.setFont(activeFont);
          doc.setFontSize(8);
          doc.setTextColor(113, 113, 122);
          doc.text(`Page ${data.pageNumber}`, 190, 288, { align: 'right' });
        },
      });

      const filename = `KhataBook_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;
      const pdfArrayBuffer = doc.output('arraybuffer');
      const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer);

      const isHandledNatively = await saveOrShareReport(
        pdfBase64,
        filename,
        'application/pdf'
      );

      if (!isHandledNatively) {
        const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
        downloadBlobFallback(pdfBlob, filename);
      }

      if (showToast) {
        showToast('PDF report generated successfully!', 'success');
      }
    } catch (error: any) {
      console.error('PDF export failed:', error);
      if (showToast) {
        showToast('Unable to export PDF. Please check data and try again.', 'error');
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  const exportExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);

    try {
      const formattedRows = (transactions || []).map((t: any, index: number) => {
        let displayDate = t.date;
        try {
          displayDate = format(parseISO(t.date), 'yyyy-MM-dd HH:mm');
        } catch {
          displayDate = t.date || '';
        }

        return {
          'S.No': index + 1,
          'Date & Time': displayDate,
          'Type': t.type || '',
          'Category': t.category || '',
          'Amount (INR)': Number(t.amount) || 0,
          'Payment Mode': t.payment_type || '',
          'Description': t.description || '',
          'Reference': t.reference || '',
          'Order ID': t.order_id || '',
        };
      });

      const ws = XLSX.utils.json_to_sheet(
        formattedRows.length > 0 
          ? formattedRows 
          : [{ 'Message': 'No transactions recorded' }]
      );

      // Auto-size worksheet columns for neat layout
      const colWidths = [
        { wch: 6 },  // S.No
        { wch: 18 }, // Date
        { wch: 10 }, // Type
        { wch: 20 }, // Category
        { wch: 14 }, // Amount
        { wch: 16 }, // Payment Mode
        { wch: 30 }, // Description
        { wch: 16 }, // Reference
        { wch: 16 }, // Order ID
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transactions");

      const filename = `KhataBook_Report_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
      const excelBase64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

      const isHandledNatively = await saveOrShareReport(
        excelBase64,
        filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      if (!isHandledNatively) {
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const excelBlob = new Blob([excelBuffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        downloadBlobFallback(excelBlob, filename);
      }

      if (showToast) {
        showToast('Excel report generated successfully!', 'success');
      }
    } catch (error: any) {
      console.error('Excel export failed:', error);
      if (showToast) {
        showToast('Unable to export Excel file. Please try again.', 'error');
      }
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8"
    >
      <div className="flex gap-4">
        <button 
          onClick={exportPDF} 
          disabled={isExportingPdf}
          className="flex-1 bg-zinc-900 hover:bg-zinc-800 active:scale-98 border border-zinc-800 p-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all disabled:opacity-50"
        >
          {isExportingPdf ? (
            <RefreshCw className="w-4 h-4 text-red-500 animate-spin" />
          ) : (
            <Download className="w-4 h-4 text-red-500" />
          )}
          {isExportingPdf ? 'Exporting PDF...' : 'Export PDF'}
        </button>
        <button 
          onClick={exportExcel} 
          disabled={isExportingExcel}
          className="flex-1 bg-zinc-900 hover:bg-zinc-800 active:scale-98 border border-zinc-800 p-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all disabled:opacity-50"
        >
          {isExportingExcel ? (
            <RefreshCw className="w-4 h-4 text-green-500 animate-spin" />
          ) : (
            <Download className="w-4 h-4 text-green-500" />
          )}
          {isExportingExcel ? 'Exporting Excel...' : 'Export Excel'}
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6">
        <h3 className="font-bold mb-6 flex items-center gap-2"><ArrowUpRight className="text-green-500" /> Credit Breakdown</h3>
        <div className="h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={creditCategoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {creditCategoryData.map((_entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {creditCategoryData.map((entry: any, index: number) => (
            <div key={`credit-legend-${entry.name}-${index}`} className="flex items-center gap-2 min-w-0 text-xs text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
              <span className="truncate" title={entry.name}>{entry.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6">
        <h3 className="font-bold mb-6 flex items-center gap-2"><ArrowDownLeft className="text-red-500" /> Debit Breakdown</h3>
        <div className="h-80 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={debitCategoryData} margin={{ top: 8, right: 8, left: 0, bottom: 55 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="name"
                stroke="#71717a"
                fontSize={10}
                angle={-45}
                textAnchor="end"
                interval={0}
                height={70}
                tickFormatter={(value: string) => value.length > 14 ? `${value.slice(0, 14)}…` : value}
              />
              <YAxis stroke="#71717a" fontSize={10} />
              <Tooltip contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '12px' }} />
              <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}

function AdminModule({ apiLink, setApiLink, transactions, orders, showToast, isAdmin, setIsAdmin, resetSyncState, onGoogleSheetReset, isSyncing, onSync }: any) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showGoogleResetConfirm, setShowGoogleResetConfirm] = useState(false);
  const [isResettingGoogleSheet, setIsResettingGoogleSheet] = useState(false);
  const [syncButtonLabel, setSyncButtonLabel] = useState('Sync Data');

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
          <div className="pt-10 border-t border-zinc-800/50">
            <h4 className="font-bold mb-4 text-sm flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-orange-500" />
              Android Mobile App (APK)
            </h4>
            <div className="bg-gradient-to-br from-orange-500/10 via-zinc-900 to-zinc-900 border border-orange-500/30 p-6 rounded-[28px] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-white">KhataBook Pro APK</span>
                    <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">v1.0 Ready</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Install on any Android smartphone for offline ledger accounting & auto Google Sheets sync.
                  </p>
                </div>
                <a
                  href="/Khatabook.apk"
                  download="Khatabook.apk"
                  className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-sm px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/25 shrink-0"
                >
                  <Download className="w-4 h-4" /> Download APK
                </a>
              </div>
              <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-2xl p-4 text-[11px] text-zinc-400 space-y-1.5">
                <p className="font-bold text-zinc-300">How to install on Android:</p>
                <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                  <li>Tap <span className="text-orange-400 font-semibold">Download APK</span> above on your phone or tablet.</li>
                  <li>Tap the downloaded file in your browser or Notification shade.</li>
                  <li>If prompted, enable <em>"Install unknown apps"</em> for your browser.</li>
                  <li>Tap <strong>Install</strong> to start using Khatabook Pro on Android.</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Reset Action */}
          <div className="pt-6">
            <div className="space-y-4">
              <button 
                onClick={() => setShowClearConfirm(true)}
                className="w-full bg-red-500/5 hover:bg-red-500/10 text-red-500 py-5 rounded-[28px] font-bold text-sm flex items-center justify-center gap-3 transition-all border border-red-500/10"
              >
                <Trash2 className="w-4 h-4" /> Reset Local Database
              </button>
              <button 
                onClick={() => setShowGoogleResetConfirm(true)}
                disabled={isResettingGoogleSheet}
                className="w-full bg-blue-500/5 hover:bg-blue-500/10 text-blue-400 py-5 rounded-[28px] font-bold text-sm flex items-center justify-center gap-3 transition-all border border-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" /> {isResettingGoogleSheet ? 'Resetting Google Sheet...' : 'Reset Google Sheet Data'}
              </button>
            </div>
          </div>
        </div>
      </div>

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
              <h3 className="text-xl font-bold mb-2">Delete All Data?</h3>
              <p className="text-zinc-500 text-sm mb-8">This action cannot be undone. All your local transactions and orders will be permanently deleted.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm">Cancel</button>
                <button onClick={clearData} className="flex-1 bg-red-500 py-4 rounded-2xl font-bold text-sm">Delete</button>
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
              <h3 className="text-xl font-bold mb-2">Clear Google Sheet Data?</h3>
              <p className="text-zinc-500 text-sm mb-8">
                This will delete all rows from your Google Sheets cloud backup and keep only the headers.
                Local phone data will stay safe, and you can sync it again later if needed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowGoogleResetConfirm(false)}
                  disabled={isResettingGoogleSheet}
                  className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={resetGoogleSheetData}
                  disabled={isResettingGoogleSheet}
                  className="flex-1 bg-blue-500 py-4 rounded-2xl font-bold text-sm disabled:opacity-50"
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
          Ensure your Google Sheet has the correct headers: <br/>
          <strong>Transactions:</strong> id, date, type, category, amount, payment_type, description, reference, order_id, synced <br/>
          <strong>Orders:</strong> order_id, items (JSON), supplier, total_amount, paid_amount, remaining_amount, status, date, synced <br/>
          <strong>OrderPayments:</strong> payment_id, order_id, amount, payment_type, date, synced <br/>
          Pending offline changes now sync automatically when the device reconnects. Reset Google Sheet Data clears cloud rows only and keeps the sheet headers.
        </p>
      </div>
    </motion.div>
  );
}
