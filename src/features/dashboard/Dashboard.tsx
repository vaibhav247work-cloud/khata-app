import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Plus, 
  Receipt, 
  PackagePlus, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  Package 
} from 'lucide-react';
import { 
  parseISO, 
  differenceInCalendarDays, 
  startOfDay 
} from 'date-fns';
import { type Transaction, type Order } from '../../db';
import { StatCard } from './components/StatCard';
import { OverdueAlertBanner } from './components/OverdueAlertBanner';
import { DashboardDonutChart } from './components/DashboardDonutChart';
import { RecentTransactionsList } from './components/RecentTransactionsList';

interface DashboardProps {
  stats: any;
  transactions: Transaction[];
  orders?: Order[];
  onNavigateToTransactions?: () => void;
  onNavigateToPendingOrders?: () => void;
  onNavigateToOverdueOrders?: () => void;
  onNavigateToOrders?: () => void;
  onOpenAddTransaction?: () => void;
  onOpenAddOrder?: () => void;
  onNavigateToReports?: (subTab?: 'overview' | 'expenses' | 'income' | 'payments' | 'suppliers') => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function Dashboard({ 
  stats, 
  transactions, 
  orders = [],
  onNavigateToTransactions,
  onNavigateToPendingOrders,
  onNavigateToOverdueOrders,
  onNavigateToOrders,
  onOpenAddTransaction,
  onOpenAddOrder,
  onNavigateToReports,
  showToast,
}: DashboardProps) {
  const recentTxs = useMemo(() => {
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [transactions]);

  // Feature 5: Urgent Overdue Orders calculation (>7 days pending)
  const nowDay = useMemo(() => startOfDay(new Date()), []);
  const overdueOrders = useMemo(() => {
    return (orders || [])
      .filter((o: Order) => {
        if (o.status !== 'Pending' && o.status !== 'Partial') return false;
        try {
          const days = differenceInCalendarDays(nowDay, startOfDay(parseISO(o.date)));
          return days > 7;
        } catch {
          return false;
        }
      })
      .map((o: Order) => {
        let days = 8;
        try {
          days = differenceInCalendarDays(nowDay, startOfDay(parseISO(o.date)));
        } catch {}
        return { ...o, daysOverdue: days };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [orders, nowDay]);

  const totalOverdueAmount = useMemo(() => {
    return overdueOrders.reduce((acc, o) => acc + (Number(o.remaining_amount) || 0), 0);
  }, [overdueOrders]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* Quick Access Action Buttons */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <button
          id="home-quick-add-txn-btn"
          type="button"
          onClick={onOpenAddTransaction}
          className="group relative overflow-hidden bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white p-4 sm:p-5 rounded-3xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all text-left flex items-center justify-between border border-orange-400/30 cursor-pointer"
          title="Add New Transaction (Income / Expense)"
        >
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-100 uppercase tracking-wider">
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>Quick Entry</span>
            </div>
            <div className="text-lg sm:text-2xl font-black mt-0.5 truncate tracking-tight text-white group-hover:translate-x-0.5 transition-transform">
              + Txn
            </div>
            <p className="text-[11px] sm:text-xs text-orange-100/85 truncate mt-0.5 font-medium">
              Income / Expense
            </p>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/25 group-hover:scale-110 transition-transform shadow-inner">
            <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
        </button>

        <button
          id="home-quick-add-order-btn"
          type="button"
          onClick={onOpenAddOrder}
          className="group relative overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-950 hover:from-zinc-850 hover:to-zinc-900 text-white p-4 sm:p-5 rounded-3xl shadow-lg shadow-black/40 active:scale-95 transition-all text-left flex items-center justify-between border border-zinc-800 hover:border-zinc-700 cursor-pointer"
          title="Create New Order (Supplier & Material)"
        >
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 uppercase tracking-wider">
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>New Order</span>
            </div>
            <div className="text-lg sm:text-2xl font-black mt-0.5 truncate tracking-tight text-white group-hover:translate-x-0.5 transition-transform">
              + Order
            </div>
            <p className="text-[11px] sm:text-xs text-zinc-400 truncate mt-0.5 font-medium">
              Supplier & Materials
            </p>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform text-blue-400 shadow-inner">
            <PackagePlus className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </button>
      </div>

      {/* Primary KPI Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Net Balance" value={stats.netBalance} icon={Wallet} color="text-white" bg="bg-zinc-900" full />
        <StatCard label="Total Credit" value={stats.totalCredit} icon={ArrowUpRight} color="text-green-500" bg="bg-zinc-900" />
        <StatCard label="Total Debit" value={stats.totalDebit} icon={ArrowDownLeft} color="text-red-500" bg="bg-zinc-900" />
        <StatCard 
          id="stat-card-pending-payments"
          label="Pending Payments" 
          value={stats.pendingPayments} 
          icon={Clock} 
          color="text-orange-500" 
          bg="bg-zinc-900" 
          onClick={onNavigateToPendingOrders}
          title="View Pending Payment Orders"
        />
        <StatCard 
          id="stat-card-active-orders"
          label="Active Orders" 
          value={stats.pendingOrders} 
          icon={Package} 
          color="text-blue-500" 
          bg="bg-zinc-900" 
          isCount 
          onClick={onNavigateToOrders}
          title="View Orders"
        />
      </div>

      {/* Feature 5: Urgent Overdue Payments Alert (Only shown when overdueOrders.length > 0) */}
      <OverdueAlertBanner 
        overdueOrders={overdueOrders}
        totalOverdueAmount={totalOverdueAmount}
        onNavigateToPendingOrders={onNavigateToPendingOrders}
        onNavigateToOverdueOrders={onNavigateToOverdueOrders}
        showToast={showToast}
      />

      {/* Interactive Expense Distribution Donut Chart */}
      <DashboardDonutChart 
        transactions={transactions}
        onNavigateToReports={onNavigateToReports}
        onOpenAddTransaction={onOpenAddTransaction}
      />

      {/* Recent Activity List */}
      <RecentTransactionsList 
        recentTxs={recentTxs}
        onNavigateToTransactions={onNavigateToTransactions}
      />
    </motion.div>
  );
}
