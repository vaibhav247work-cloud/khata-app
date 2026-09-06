import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Download, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownLeft 
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid 
} from 'recharts';
import { COLORS } from '../../constants';
import type { Transaction, Order } from '../../types';
import { exportReportPdf } from './exportReportPdf';
import { exportReportExcel } from './exportReportExcel';

interface ReportsModuleProps {
  transactions: Transaction[];
  orders: Order[];
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function ReportsModule({ transactions, showToast }: ReportsModuleProps) {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const creditCategoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    transactions.filter((t) => t.type === 'Credit').forEach((t) => {
      counts[t.category] = (counts[t.category] || 0) + t.amount;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const debitCategoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    transactions.filter((t) => t.type === 'Debit').forEach((t) => {
      counts[t.category] = (counts[t.category] || 0) + t.amount;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportReportPdf(transactions, showToast);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    try {
      await exportReportExcel(transactions, showToast);
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
          onClick={handleExportPdf} 
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
          onClick={handleExportExcel} 
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
                {creditCategoryData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 max-h-32 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {creditCategoryData.map((entry, index) => (
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
