import { useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  Package, 
  ChevronRight 
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { StatCard } from '../../components/common/StatCard';
import type { Transaction } from '../../types';

interface DashboardProps {
  stats: {
    totalCredit: number;
    totalDebit: number;
    netBalance: number;
    pendingPayments: number;
    pendingOrders: number;
  };
  transactions: Transaction[];
  onNavigateToTransactions?: () => void;
}

export function Dashboard({ stats, transactions, onNavigateToTransactions }: DashboardProps) {
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
