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
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <button
          id="home-quick-add-txn-btn"
          type="button"
          onClick={onOpenAddTransaction}
          className="group bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white p-3 sm:p-3.5 rounded-2xl shadow-md shadow-orange-500/15 active:scale-95 transition-all flex items-center gap-2.5 sm:gap-3 border border-orange-400/30 cursor-pointer"
          title="Add New Transaction (Income / Expense)"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/25 shadow-inner">
            <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="min-w-0 text-left">
            <div className="text-xs sm:text-sm font-bold text-white truncate tracking-tight">
              + Transaction
            </div>
            <div className="text-[10px] sm:text-[11px] text-orange-100/90 truncate font-medium">
              Income / Expense
            </div>
          </div>
        </button>

        <button
          id="home-quick-add-order-btn"
          type="button"
          onClick={onOpenAddOrder}
          className="group bg-zinc-900 hover:bg-zinc-850 text-white p-3 sm:p-3.5 rounded-2xl shadow-md shadow-black/30 active:scale-95 transition-all flex items-center gap-2.5 sm:gap-3 border border-zinc-800 hover:border-zinc-700 cursor-pointer"
          title="Create New Order (Supplier & Material)"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400 shadow-inner">
            <PackagePlus className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
          </div>
          <div className="min-w-0 text-left">
            <div className="text-xs sm:text-sm font-bold text-white truncate tracking-tight">
              + New Order
            </div>
            <div className="text-[10px] sm:text-[11px] text-zinc-400 truncate font-medium">
              Supplier & Items
            </div>
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
