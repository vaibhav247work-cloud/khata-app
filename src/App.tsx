import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, type Transaction, type Order, type OrderPayment, type OrderItem } from './db';
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
  Legend
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// --- Types & Constants ---

type Tab = 'Dashboard' | 'Transactions' | 'Orders' | 'Passbook' | 'Reports' | 'Admin';

const PAYMENT_TYPES = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Online'] as const;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

// --- Components ---

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('Dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [apiLink, setApiLink] = useState(localStorage.getItem('BT_API_LINK') || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState<'All' | 'Today' | 'This Week' | 'This Month' | 'Custom'>('All');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [exitConfirm, setExitConfirm] = useState(false);
  const exitConfirmRef = useRef(false);
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
    const txs = await db.transactions.toArray();
    const ords = await db.orders.toArray();
    
    // Explicitly sort descending by date to ensure correct order in all modules
    const sortedTxs = [...txs].sort((a, b) => b.date.localeCompare(a.date));
    const sortedOrds = [...ords].sort((a, b) => b.date.localeCompare(a.date));
    
    setTransactions(sortedTxs);
    setOrders(sortedOrds);
  };

  useEffect(() => {
    if (isLoggedIn) loadData();
  }, [isLoggedIn]);

  // Refresh data when back online
  useEffect(() => {
    const handleOnline = () => {
      if (isLoggedIn) {
        console.log('Back online, refreshing data...');
        loadData();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isLoggedIn]);

  // --- Sync Logic ---
  const pullFromOnline = async () => {
    if (!apiLink) {
      showToast('Please set Google Sheet API link in Admin settings', 'error');
      return;
    }
    setIsSyncing(true);
    try {
      const sheets = ['Transactions', 'Orders', 'OrderPayments'];
      for (const sheet of sheets) {
        const response = await fetch(`${apiLink}?sheet=${sheet}`);
        const data = await response.json();
        
        if (sheet === 'Transactions') {
          await db.transactions.clear();
          await db.transactions.bulkAdd(data);
        } else if (sheet === 'Orders') {
          await db.orders.clear();
          // Parse items JSON, handle potential empty/string issue
          const orders = data.map((o: any) => ({
            ...o, 
            items: typeof o.items === 'string' ? JSON.parse(o.items) : o.items,
            total_amount: Number(o.total_amount),
            paid_amount: Number(o.paid_amount),
            remaining_amount: Number(o.remaining_amount)
          }));
          await db.orders.bulkAdd(orders);
        } else if (sheet === 'OrderPayments') {
          await db.orderPayments.clear();
          await db.orderPayments.bulkAdd(data.map((p: any) => ({ ...p, amount: Number(p.amount) })));
        }
      }
      await loadData();
      showToast('Pulled latest data from online!', 'success');
    } catch (error) {
      console.error('Pull failed', error);
      showToast('Pull failed. Check console.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncWithGoogleSheets();
      await pullFromOnline();
      showToast('Sync complete!', 'success');
    } catch (e) {
      showToast('Sync failed', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const syncWithGoogleSheets = async () => {
    if (!apiLink) {
      showToast('Please set Google Sheet API link in Admin settings', 'error');
      return;
    }
    setIsSyncing(true);
    try {
      const allTxs = await db.transactions.toArray();
      const allOrders = await db.orders.toArray();
      const allPayments = await db.orderPayments.toArray();

      await fetch(apiLink, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync',
          data: { transactions: allTxs, orders: allOrders, payments: allPayments }
        })
      });
      
      showToast('Push successful! Check your Google Sheet.', 'success');
    } catch (error) {
      console.error('Sync failed', error);
      showToast('Push failed. Check console for details.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

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
              <p className="text-zinc-500 text-sm">Business Management <span className="text-sm text-orange-500 font-bold ml-1">VK</span></p>
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
            <div className="text-zinc-500 text-xs flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
              {isSyncing ? 'Syncing...' : 'Cloud Connected'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSync}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
            title="Sync Data"
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
          {activeTab === 'Dashboard' && <Dashboard stats={stats} transactions={transactions} />}
          {activeTab === 'Transactions' && (
            <TransactionsModule 
              transactions={filteredTransactions} 
              onAdd={() => loadData()} 
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          )}
          {activeTab === 'Orders' && <OrdersModule orders={orders} onUpdate={() => loadData()} showToast={showToast} isAdmin={isAdmin} />}
          {activeTab === 'Passbook' && (
            <PassbookModule 
              transactions={filteredTransactions} 
              filterDate={filterDate}
              setFilterDate={setFilterDate}
              customDateRange={customDateRange}
              setCustomDateRange={setCustomDateRange}
            />
          )}
          {activeTab === 'Reports' && <ReportsModule transactions={transactions} orders={orders} />}
          {activeTab === 'Admin' && (
            <AdminModule 
              apiLink={apiLink} 
              setApiLink={setApiLink} 
              transactions={transactions} 
              orders={orders} 
              showToast={showToast}
              isAdmin={isAdmin}
              setIsAdmin={toggleAdmin}
              onSync={handleSync}
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

function Dashboard({ stats, transactions }: { stats: any, transactions: Transaction[] }) {
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
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-lg">Recent Transactions</h3>
          <ChevronRight className="text-zinc-500 w-5 h-5" />
        </div>
        <div className="space-y-4">
          {recentTxs.map(tx => (
            <div key={tx.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${tx.type === 'Credit' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
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

function TransactionsModule({ transactions, onAdd, searchQuery, setSearchQuery }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions]);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const tx: Transaction = {
      id: crypto.randomUUID(),
      date: fullDate,
      type: formData.get('type') as any,
      category: formData.get('category') as string,
      amount: Number(formData.get('amount')),
      payment_type: formData.get('payment_type') as any,
      description: formData.get('description') as string,
      reference: formData.get('reference') as string,
      synced: false
    };
    await db.transactions.add(tx);
    setShowAdd(false);
    onAdd();
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTransaction) return;
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    
    await db.transactions.update(selectedTransaction.id, {
      amount: amount
    });
    setSelectedTransaction(null);
    onAdd();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transactions..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <button 
          onClick={() => setShowAdd(true)}
          className="bg-orange-500 p-4 rounded-2xl text-white shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      <div className="space-y-4">
        {sortedTransactions.map((tx: any) => (
          <div key={tx.id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${tx.type === 'Credit' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                {tx.type === 'Credit' ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownLeft className="w-6 h-6" />}
              </div>
              <div>
                <p className="font-bold">{tx.category}</p>
                <p className="text-zinc-500 text-xs">{tx.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-zinc-800 text-zinc-400 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold">{tx.payment_type}</span>
                  <span className="text-zinc-600 text-[10px]">{format(parseISO(tx.date), 'dd MMM yyyy')}</span>
                </div>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              <p className={`text-lg font-bold ${tx.type === 'Credit' ? 'text-green-500' : 'text-red-500'}`}>
                {tx.type === 'Credit' ? '+' : '-'}₹{tx.amount.toLocaleString()}
              </p>
              <button 
                onClick={() => setSelectedTransaction(tx)}
                className="text-[10px] bg-zinc-800 px-2 py-1 rounded-lg hover:bg-zinc-700"
              >
                Edit Amount
              </button>
            </div>
          </div>
        ))}
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

      {/* Edit Modal */}
      <AnimatePresence>
        {selectedTransaction && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedTransaction(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-sm rounded-[40px] p-8 border border-zinc-800 shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-6">Edit Amount</h2>
              <form onSubmit={handleEdit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">New Amount</label>
                  <input 
                    name="amount" 
                    type="number" 
                    inputMode="decimal"
                    defaultValue={selectedTransaction.amount}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-bold no-spinner" 
                    required 
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setSelectedTransaction(null)} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm">Cancel</button>
                  <button type="submit" className="flex-1 bg-orange-500 py-4 rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/20">Save</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Modal */}
      <AnimatePresence>
        {showAdd && (
          <div 
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAdd(false)}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[85vh] pb-32 sm:pb-8"
            >
              <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-8" />
              <h2 className="text-2xl font-bold mb-6">Add Transaction</h2>
              <form onSubmit={handleAdd} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Type</label>
                    <select name="type" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm">
                      <option value="Debit">Debit (Expense)</option>
                      <option value="Credit">Credit (Income)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Date</label>
                    <input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" required />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Name / Category</label>
                  <input 
                    name="category" 
                    type="text" 
                    placeholder="e.g. Cement, Site Payment" 
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" 
                    required 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Amount</label>
                    <input 
                      name="amount" 
                      type="number" 
                      inputMode="decimal"
                      placeholder="0.00" 
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm no-spinner" 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Payment Mode</label>
                    <select name="payment_type" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm">
                      {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Description</label>
                  <input name="description" type="text" placeholder="What is this for?" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" required />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Reference (Optional)</label>
                  <input name="reference" type="text" placeholder="Bill No / UPI ID" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" />
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm">Cancel</button>
                  <button type="submit" className="flex-1 bg-orange-500 py-4 rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/20">Save Entry</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function OrdersModule({ orders, onUpdate, showToast, isAdmin }: any) {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [newItems, setNewItems] = useState<OrderItem[]>([
    { id: crypto.randomUUID(), material: '', quantity: '', amount: 0 }
  ]);

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

  const handleAddItemRow = () => {
    setNewItems([...newItems, { id: crypto.randomUUID(), material: '', quantity: '', amount: 0 }]);
  };

  const handleRemoveItemRow = (id: string) => {
    if (newItems.length > 1) {
      setNewItems(newItems.filter(i => i.id !== id));
    }
  };

  const handleItemChange = (id: string, field: keyof OrderItem, value: any) => {
    setNewItems(newItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const filteredItems = newItems.filter(item => item.material.trim() !== '');
    if (filteredItems.length === 0) {
      showToast('Please add at least one material name', 'error');
      return;
    }

    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const total = filteredItems.reduce((sum, item) => sum + Number(item.amount), 0);
    const order: Order = {
      order_id: crypto.randomUUID(),
      items: filteredItems,
      supplier: formData.get('supplier') as string,
      total_amount: total,
      paid_amount: 0,
      remaining_amount: total,
      status: 'Pending',
      date: fullDate,
      synced: false
    };
    await db.orders.add(order);
    setShowAdd(false);
    setNewItems([{ id: crypto.randomUUID(), material: '', quantity: '', amount: 0 }]);
    onUpdate();
  };

  const handleEditOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOrderForEdit) return;
    const formData = new FormData(e.currentTarget);
    const totalAmount = Number(formData.get('total_amount'));
    
    const newRemaining = totalAmount - selectedOrderForEdit.paid_amount;
    const newStatus = newRemaining <= 0 ? 'Completed' : (selectedOrderForEdit.paid_amount > 0 ? 'Partial' : 'Pending');

    await db.orders.update(selectedOrderForEdit.order_id, {
      total_amount: totalAmount,
      remaining_amount: newRemaining,
      status: newStatus
    });
    setSelectedOrderForEdit(null);
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
      status: newStatus
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Order</h2>
        <button 
          onClick={() => setShowAdd(true)}
          className="bg-zinc-900 border border-zinc-800 px-5 py-3 rounded-2xl text-white font-bold shadow-xl active:scale-95 transition-all flex items-center gap-2 group"
        >
          <div className="bg-orange-500 p-1.5 rounded-lg group-hover:scale-110 transition-transform">
            <Plus className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm">New Order</span>
        </button>
      </div>

      <div className="grid gap-4">
        {orders.map((order: Order) => (
          <div key={order.order_id} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative group">
            <button 
              onClick={() => setOrderToDelete(order)}
              className={`absolute top-6 right-6 p-2 rounded-xl transition-all ${
                (order.paid_amount || 0) === 0 
                  ? 'text-zinc-400 hover:text-red-500 hover:bg-red-500/10 opacity-100' 
                  : 'text-zinc-600 hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100'
              }`}
              title="Delete Order"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <div className="flex justify-between items-start mb-4 pr-8">
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

            <div className="flex gap-2">
              {order.status !== 'Completed' && (
                <button 
                  onClick={() => setSelectedOrder(order)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl font-bold text-sm transition-all"
                >
                  Make Payment
                </button>
              )}
              <button 
                onClick={() => setSelectedOrderForEdit(order)}
                className="bg-zinc-800 hover:bg-zinc-700 py-3 px-4 rounded-xl font-bold text-sm transition-all"
              >
                Edit Amount
              </button>
            </div>
          </div>
        ))}
        {orders.length === 0 && <p className="text-center text-zinc-500 py-12">No orders found</p>}
      </div>

      {/* Add Order Modal */}
      <AnimatePresence>
        {showAdd && (
          <div 
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAdd(false)}
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-2xl rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[90vh] pb-32 sm:pb-8"
            >
              <h2 className="text-2xl font-bold mb-6">New Order</h2>
              <form onSubmit={handleAdd} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Supplier</label>
                    <input name="supplier" type="text" placeholder="Supplier Name" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Order Date</label>
                    <input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm" required />
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
                  <button type="button" onClick={() => setShowAdd(false)} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
                  <button type="submit" className="flex-1 bg-orange-500 py-4 rounded-2xl font-bold text-sm hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20">Create Order</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Order Modal */}
      <AnimatePresence>
        {selectedOrderForEdit && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedOrderForEdit(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 w-full max-w-sm rounded-[40px] p-8 border border-zinc-800 shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-6">Edit Total Amount</h2>
              <form onSubmit={handleEditOrder} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">New Total Amount</label>
                  <input 
                    name="total_amount" 
                    type="number" 
                    inputMode="decimal"
                    defaultValue={selectedOrderForEdit.total_amount}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-bold no-spinner" 
                    required 
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setSelectedOrderForEdit(null)} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm">Cancel</button>
                  <button type="submit" className="flex-1 bg-orange-500 py-4 rounded-2xl font-bold text-sm shadow-lg shadow-orange-500/20">Save</button>
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

function ReportsModule({ transactions, orders }: any) {
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

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text('BuildTrack Pro - Financial Report', 14, 15);
    doc.text(`Generated on: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 22);
    
    const tableData = transactions.map((t: any) => [
      t.date,
      t.type,
      t.category,
      t.amount,
      t.payment_type,
      t.description
    ]);

    autoTable(doc, {
      head: [['Date', 'Type', 'Category', 'Amount', 'Payment', 'Description']],
      body: tableData,
      startY: 30,
    });

    doc.save(`BuildTrack_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(transactions);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `BuildTrack_Report_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-8"
    >
      <div className="flex gap-4">
        <button onClick={exportPDF} className="flex-1 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm">
          <Download className="w-4 h-4 text-red-500" /> Export PDF
        </button>
        <button onClick={exportExcel} className="flex-1 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm">
          <Download className="w-4 h-4 text-green-500" /> Export Excel
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6">
        <h3 className="font-bold mb-6 flex items-center gap-2"><ArrowUpRight className="text-green-500" /> Credit Breakdown</h3>
        <div className="h-64">
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
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6">
        <h3 className="font-bold mb-6 flex items-center gap-2"><ArrowDownLeft className="text-red-500" /> Debit Breakdown</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={debitCategoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="name" stroke="#71717a" fontSize={10} />
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

function AdminModule({ apiLink, setApiLink, transactions, orders, showToast, isAdmin, setIsAdmin, onSync }: any) {
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleSaveApi = () => {
    localStorage.setItem('BT_API_LINK', apiLink);
    showToast('Settings Saved!', 'success');
  };

  const clearData = async () => {
    await db.transactions.clear();
    await db.orders.clear();
    await db.orderPayments.clear();
    window.location.reload();
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
                className="bg-zinc-800 hover:bg-zinc-700 px-8 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 whitespace-nowrap"
              >
                Save Settings
              </button>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={onSync}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 py-4 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
              >
                Sync Data
              </button>
            </div>
            <div className="ml-2 text-[10px] text-zinc-600 flex items-center gap-1.5">
              <div className="w-1 h-1 bg-zinc-600 rounded-full" />
              This link connects your app to Google Sheets for cloud backup.
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

          {/* Reset Action */}
          <div className="pt-6">
            <button 
              onClick={() => setShowClearConfirm(true)}
              className="w-full bg-red-500/5 hover:bg-red-500/10 text-red-500 py-5 rounded-[28px] font-bold text-sm flex items-center justify-center gap-3 transition-all border border-red-500/10"
            >
              <Trash2 className="w-4 h-4" /> Reset Local Database
            </button>
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

      <div className="bg-orange-500/10 border border-orange-500/20 rounded-[32px] p-8">
        <h4 className="font-bold text-orange-500 mb-2 flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Admin Notice</h4>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Ensure your Google Sheet has the correct headers: <br/>
          <strong>Transactions:</strong> id, date, type, category, amount, payment_type, description, reference <br/>
          <strong>Orders:</strong> order_id, items (JSON), supplier, total_amount, paid_amount, remaining_amount, status, date
        </p>
      </div>
    </motion.div>
  );
}
