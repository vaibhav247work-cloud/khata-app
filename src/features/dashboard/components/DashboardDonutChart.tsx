import React, { useState, useMemo, useCallback } from 'react';
import { 
  PieChart as PieChartIcon, 
  ChevronRight, 
  Plus 
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer, 
  Sector 
} from 'recharts';
import { 
  parseISO, 
  isWithinInterval, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  subDays 
} from 'date-fns';
import { type Transaction } from '../../../db';
import { EXPENSE_PALETTE } from '../../../constants/theme';

interface DashboardDonutChartProps {
  transactions: Transaction[];
  onNavigateToReports?: (subTab?: 'overview' | 'expenses' | 'income' | 'payments' | 'suppliers') => void;
  onOpenAddTransaction?: () => void;
}

export function DashboardDonutChart({
  transactions,
  onNavigateToReports,
  onOpenAddTransaction,
}: DashboardDonutChartProps) {
  const [expenseTimeframe, setExpenseTimeframe] = useState<'all' | 'this_month' | 'last_30_days' | 'this_week'>('all');
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number | null>(null);

  // Filter and aggregate debit / expense transactions by category
  const expenseCategoryData = useMemo(() => {
    const now = new Date();
    const filteredDebits = transactions.filter((t) => {
      if (t.type !== 'Debit') return false;
      const amt = Number(t.amount) || 0;
      if (amt <= 0) return false;

      if (expenseTimeframe === 'all') return true;
      try {
        const txDate = parseISO(t.date);
        if (expenseTimeframe === 'this_week') {
          return isWithinInterval(txDate, { 
            start: startOfWeek(now, { weekStartsOn: 1 }), 
            end: endOfWeek(now, { weekStartsOn: 1 }) 
          });
        }
        if (expenseTimeframe === 'this_month') {
          return isWithinInterval(txDate, { start: startOfMonth(now), end: endOfMonth(now) });
        }
        if (expenseTimeframe === 'last_30_days') {
          return isWithinInterval(txDate, { start: subDays(now, 30), end: now });
        }
      } catch {
        return true;
      }
      return true;
    });

    const categoryMap = new Map<string, { total: number; count: number }>();
    let grandTotal = 0;

    filteredDebits.forEach((t) => {
      const amt = Number(t.amount) || 0;
      grandTotal += amt;
      const cat = t.category || 'General';
      const cur = categoryMap.get(cat) || { total: 0, count: 0 };
      categoryMap.set(cat, { total: cur.total + amt, count: cur.count + 1 });
    });

    const items = Array.from(categoryMap.entries())
      .map(([name, data]) => ({
        name,
        value: data.total,
        count: data.count,
        percentage: grandTotal > 0 ? (data.total / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const avgPerTxn = filteredDebits.length > 0 ? Math.round(grandTotal / filteredDebits.length) : 0;

    return { 
      items, 
      total: grandTotal, 
      txnCount: filteredDebits.length,
      avgPerTxn,
      topCategory: items[0] || null,
    };
  }, [transactions, expenseTimeframe]);

  const renderDashboardActiveShape = useCallback((props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius - 2}
          outerRadius={outerRadius + 5}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 7}
          outerRadius={outerRadius + 9}
          fill={fill}
          opacity={0.35}
        />
      </g>
    );
  }, []);

  const activeCategoryItem = activeCategoryIndex !== null && expenseCategoryData.items[activeCategoryIndex] 
    ? expenseCategoryData.items[activeCategoryIndex] 
    : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-400 shrink-0">
            <PieChartIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-base sm:text-lg text-white">Expense Distribution by Category</h3>
            <p className="text-zinc-500 text-[11px]">Visual analysis of your business spending habits</p>
          </div>
        </div>

        {/* Timeframe Selector & Reports Link */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="flex items-center p-1 bg-zinc-950/80 rounded-xl border border-zinc-800/80 text-[11px]">
            <button
              type="button"
              onClick={() => { setExpenseTimeframe('this_week'); setActiveCategoryIndex(null); }}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                expenseTimeframe === 'this_week'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => { setExpenseTimeframe('this_month'); setActiveCategoryIndex(null); }}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                expenseTimeframe === 'this_month'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => { setExpenseTimeframe('last_30_days'); setActiveCategoryIndex(null); }}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                expenseTimeframe === 'last_30_days'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => { setExpenseTimeframe('all'); setActiveCategoryIndex(null); }}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                expenseTimeframe === 'all'
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All Time
            </button>
          </div>

          {onNavigateToReports && (
            <button
              type="button"
              onClick={() => onNavigateToReports('expenses')}
              className="text-xs font-semibold text-orange-400 hover:text-orange-300 flex items-center gap-0.5 px-2.5 py-1.5 rounded-xl hover:bg-orange-500/10 transition-colors shrink-0 cursor-pointer"
              title="Open detailed Reports & Analytics"
            >
              <span>Report</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Spending Habit Insights Strip */}
      {expenseCategoryData.items.length > 0 && (
        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/70 text-[11px]">
          <div className="text-left px-1">
            <span className="text-zinc-500 text-[10px] block font-medium">Top Category</span>
            <span className="font-bold text-orange-400 truncate block">
              {expenseCategoryData.topCategory?.name || 'None'}
            </span>
          </div>
          <div className="text-center px-1 border-x border-zinc-800/80">
            <span className="text-zinc-500 text-[10px] block font-medium">Category Share</span>
            <span className="font-bold text-white font-mono block">
              {expenseCategoryData.topCategory ? `${expenseCategoryData.topCategory.percentage.toFixed(1)}%` : '0%'}
            </span>
          </div>
          <div className="text-right px-1">
            <span className="text-zinc-500 text-[10px] block font-medium">Avg Spend / Txn</span>
            <span className="font-bold text-emerald-400 font-mono block">
              ₹{expenseCategoryData.avgPerTxn.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      )}

      {expenseCategoryData.items.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-zinc-950/40 border border-zinc-800/60 space-y-2">
          <p className="text-zinc-400 text-xs font-medium">No expense records logged in this timeframe</p>
          <p className="text-zinc-500 text-[11px] max-w-sm mx-auto">
            Add your first material purchase or debit transaction to see your spending breakdown.
          </p>
          {onOpenAddTransaction && (
            <button
              type="button"
              onClick={onOpenAddTransaction}
              className="mt-2 px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-all inline-flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Expense</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center pt-1">
          {/* Donut Chart with Center Metric Callout */}
          <div className="md:col-span-5 flex items-center justify-center">
            <div className="w-48 h-48 sm:w-52 sm:h-52 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseCategoryData.items}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="#18181b"
                    strokeWidth={2}
                    activeIndex={activeCategoryIndex !== null ? activeCategoryIndex : undefined}
                    activeShape={renderDashboardActiveShape}
                    onMouseEnter={(_, index) => setActiveCategoryIndex(index)}
                    onMouseLeave={() => setActiveCategoryIndex(null)}
                    onClick={(_, index) => {
                      setActiveCategoryIndex(prev => prev === index ? null : index);
                    }}
                  >
                    {expenseCategoryData.items.map((entry, index) => (
                      <Cell 
                        key={`expense-donut-${entry.name}-${index}`} 
                        fill={EXPENSE_PALETTE[index % EXPENSE_PALETTE.length]} 
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const fillColor = payload[0].payload.fill || payload[0].color || '#f97316';
                        return (
                          <div className="bg-zinc-950/95 border border-zinc-800 p-2.5 rounded-xl shadow-xl text-xs backdrop-blur-md z-50">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fillColor }} />
                              <span className="font-bold text-white truncate max-w-[140px]">{data.name}</span>
                            </div>
                            <div className="text-zinc-200 font-mono font-semibold">
                              ₹{data.value.toLocaleString('en-IN')}
                              <span className="text-orange-400 ml-1.5 font-sans text-[11px] font-bold">
                                ({data.percentage.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              {data.count} transaction{data.count === 1 ? '' : 's'}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Center Callout Metric */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2 transition-all">
                {activeCategoryItem ? (
                  <>
                    <span 
                      className="text-[10px] uppercase font-bold tracking-wider truncate max-w-[125px] px-2 py-0.5 rounded-full border mb-0.5"
                      style={{ 
                        color: EXPENSE_PALETTE[activeCategoryIndex! % EXPENSE_PALETTE.length],
                        borderColor: `${EXPENSE_PALETTE[activeCategoryIndex! % EXPENSE_PALETTE.length]}40`,
                        backgroundColor: `${EXPENSE_PALETTE[activeCategoryIndex! % EXPENSE_PALETTE.length]}18`
                      }}
                    >
                      {activeCategoryItem.name}
                    </span>
                    <span className="text-sm sm:text-base font-black text-white font-mono tracking-tight">
                      ₹{activeCategoryItem.value >= 100000 
                        ? (activeCategoryItem.value / 100000).toFixed(1) + 'L' 
                        : activeCategoryItem.value.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-zinc-300 font-medium">
                      {activeCategoryItem.percentage.toFixed(1)}% · {activeCategoryItem.count} txn{activeCategoryItem.count === 1 ? '' : 's'}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Total Spent</span>
                    <span className="text-base sm:text-lg font-black text-white font-mono tracking-tight">
                      ₹{expenseCategoryData.total >= 100000 
                        ? (expenseCategoryData.total / 100000).toFixed(1) + 'L' 
                        : expenseCategoryData.total.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[9px] text-zinc-500 font-medium">
                      {expenseCategoryData.items.length} categor{expenseCategoryData.items.length === 1 ? 'y' : 'ies'} · {expenseCategoryData.txnCount} txns
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Ranked Category Distribution Breakdown */}
          <div className="md:col-span-7 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-semibold uppercase tracking-wider pb-1 border-b border-zinc-800/60">
              <span>Top Categories</span>
              <span>Amount & Share</span>
            </div>
            {expenseCategoryData.items.slice(0, 5).map((item, index) => {
              const color = EXPENSE_PALETTE[index % EXPENSE_PALETTE.length];
              const isSelected = activeCategoryIndex === index;
              return (
                <div 
                  key={`exp-rank-${item.name}`} 
                  className={`space-y-1 p-1.5 rounded-xl transition-all cursor-pointer ${
                    isSelected ? 'bg-zinc-800/80 ring-1 ring-orange-500/40 shadow-xs' : 'hover:bg-zinc-850/50'
                  }`}
                  onMouseEnter={() => setActiveCategoryIndex(index)}
                  onMouseLeave={() => setActiveCategoryIndex(null)}
                  onClick={() => setActiveCategoryIndex(prev => prev === index ? null : index)}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className={`font-medium truncate ${isSelected ? 'text-orange-300 font-bold' : 'text-zinc-200'}`}>
                        {item.name}
                      </span>
                      <span className="text-[10px] text-zinc-500 shrink-0">({item.count})</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-semibold text-white font-mono">₹{item.value.toLocaleString('en-IN')}</span>
                      <span className="text-zinc-400 text-[11px] ml-1.5 tabular-nums font-medium">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ width: `${Math.max(item.percentage, 2.5)}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}

            {expenseCategoryData.items.length > 5 && (
              <div className="pt-1.5 flex items-center justify-between text-[11px] text-zinc-500">
                <span>+{expenseCategoryData.items.length - 5} more categories</span>
                {onNavigateToReports && (
                  <button 
                    type="button" 
                    onClick={() => onNavigateToReports('expenses')} 
                    className="text-orange-400 hover:text-orange-300 font-semibold underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    See All in Reports →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
