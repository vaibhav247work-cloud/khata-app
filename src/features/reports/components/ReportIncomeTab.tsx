import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { EXPENSE_PALETTE } from '../../../constants/theme';
import { type Transaction } from '../../../db';
import { type CategoryMetric } from './ReportExpensesTab';

interface ReportIncomeTabProps {
  totalCredit: number;
  creditCategoryData: CategoryMetric[];
  reportSearchQuery: string;
  renderReportActiveShape: (props: any) => React.ReactElement;
  getCategoryTransactions: (categoryName: string, type: 'Debit' | 'Credit') => Transaction[];
}

export function ReportIncomeTab({
  totalCredit,
  creditCategoryData,
  reportSearchQuery,
  renderReportActiveShape,
  getCategoryTransactions,
}: ReportIncomeTabProps) {
  const [activeIncomeCatIndex, setActiveIncomeCatIndex] = useState<number | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  // Group into Top 5 + Others for clean, non-collapsing donut chart
  const chartData = useMemo(() => {
    if (creditCategoryData.length <= 6) {
      return creditCategoryData.map((d, i) => ({ ...d, colorIndex: i }));
    }
    const top5 = creditCategoryData.slice(0, 5).map((d, i) => ({ ...d, colorIndex: i }));
    const others = creditCategoryData.slice(5);
    const othersTotal = others.reduce((s, d) => s + d.value, 0);
    const othersCount = others.reduce((s, d) => s + d.count, 0);
    top5.push({
      name: 'इतर स्रोत (Others)',
      value: othersTotal,
      count: othersCount,
      percentage: totalCredit > 0 ? (othersTotal / totalCredit) * 100 : 0,
      colorIndex: 5,
    });
    return top5;
  }, [creditCategoryData, totalCredit]);

  const activeCategory = activeIncomeCatIndex !== null && chartData[activeIncomeCatIndex]
    ? chartData[activeIncomeCatIndex]
    : null;

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-white">Inflow & Income Sources</h3>
            <p className="text-zinc-500 text-xs">Total Inflow: ₹{totalCredit.toLocaleString('en-IN')} across {creditCategoryData.length} streams</p>
          </div>
          {expandedCategory && (
            <button
              type="button"
              onClick={() => setExpandedCategory(null)}
              className="text-xs text-orange-400 hover:text-orange-300 font-semibold self-start sm:self-auto cursor-pointer"
            >
              Collapse Details
            </button>
          )}
        </div>

        {creditCategoryData.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-xs">No income or credit transactions recorded in this period.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            <div className="md:col-span-5 flex items-center justify-center sticky top-4">
              <div className="w-56 h-56 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%" minWidth={190} minHeight={190}>
                  <PieChart width={224} height={224}>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={82}
                      paddingAngle={chartData.length > 1 ? 2 : 0}
                      minAngle={4}
                      dataKey="value"
                      stroke="#18181b"
                      strokeWidth={chartData.length > 1 ? 2 : 0}
                      activeIndex={activeIncomeCatIndex !== null && activeIncomeCatIndex < chartData.length ? activeIncomeCatIndex : undefined}
                      activeShape={renderReportActiveShape}
                      onMouseEnter={(_, index) => setActiveIncomeCatIndex(index)}
                      onMouseLeave={() => setActiveIncomeCatIndex(null)}
                      onClick={(_, index) => {
                        setActiveIncomeCatIndex(prev => prev === index ? null : index);
                        const cat = chartData[index];
                        if (cat && !cat.name.includes('इतर स्रोत')) {
                          setExpandedCategory(prev => prev === cat.name ? null : cat.name);
                        }
                      }}
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`rep-cr-cell-${index}`} fill={EXPENSE_PALETTE[(entry.colorIndex + 3) % EXPENSE_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-zinc-950/95 border border-zinc-800 p-2.5 rounded-xl shadow-xl text-xs backdrop-blur-md z-50">
                              <div className="font-bold text-white mb-0.5">{d.name}</div>
                              <div className="text-emerald-400 font-mono font-semibold">
                                ₹{d.value.toLocaleString('en-IN')} ({d.percentage.toFixed(1)}%)
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2 py-1 transition-all">
                  {activeCategory ? (
                    <div className="flex flex-col items-center justify-center max-w-[110px]">
                      <span 
                        className="text-[11px] font-bold truncate max-w-[105px] block leading-tight text-center"
                        style={{ color: EXPENSE_PALETTE[(activeCategory.colorIndex + 3) % EXPENSE_PALETTE.length] }}
                        title={activeCategory.name}
                      >
                        {activeCategory.name}
                      </span>
                      <span className="text-base sm:text-lg font-black text-white font-mono tracking-tight leading-none my-1">
                        {activeCategory.value >= 100000 
                          ? (activeCategory.value / 100000).toFixed(2) + 'L' 
                          : `₹${activeCategory.value.toLocaleString('en-IN')}`}
                      </span>
                      <span className="text-[10px] text-zinc-300 font-medium leading-tight">
                        {activeCategory.percentage.toFixed(1)}% · {activeCategory.count} receipts
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center max-w-[110px]">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block leading-tight">Inflow</span>
                      <span className="text-base sm:text-lg font-black text-white font-mono tracking-tight leading-none my-1">
                        {totalCredit >= 100000 ? `₹${(totalCredit / 100000).toFixed(1)}L` : `₹${totalCredit.toLocaleString('en-IN')}`}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-medium leading-tight">
                        {creditCategoryData.length} streams
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="md:col-span-7 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 font-semibold uppercase tracking-wider pb-1.5 border-b border-zinc-800">
                <span>Source (Tap to inspect)</span>
                <span>Amount (% Share)</span>
              </div>
              {creditCategoryData
                .filter((cat) => !reportSearchQuery || cat.name.toLowerCase().includes(reportSearchQuery.toLowerCase()))
                .map((cat, idx) => {
                  const color = EXPENSE_PALETTE[(idx + 3) % EXPENSE_PALETTE.length];
                  const isHovered = activeIncomeCatIndex === idx;
                  const isExpanded = expandedCategory === cat.name;
                  const categoryTxns = isExpanded ? getCategoryTransactions(cat.name, 'Credit') : [];

                  return (
                    <div 
                      key={cat.name} 
                      className={`rounded-2xl transition-all border ${
                        isExpanded 
                          ? 'bg-zinc-950/80 border-emerald-500/40 p-3 space-y-3' 
                          : isHovered 
                          ? 'bg-zinc-850/60 border-zinc-700/80 p-2' 
                          : 'bg-zinc-900/40 border-transparent hover:bg-zinc-850/40 p-2'
                      }`}
                    >
                      <div 
                        className="space-y-1.5 cursor-pointer"
                        onMouseEnter={() => setActiveIncomeCatIndex(idx)}
                        onMouseLeave={() => setActiveIncomeCatIndex(null)}
                        onClick={() => setExpandedCategory(prev => prev === cat.name ? null : cat.name)}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className={`font-semibold truncate ${isExpanded ? 'text-emerald-400' : 'text-white'}`}>
                              {cat.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 shrink-0">({cat.count} txns)</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-white font-mono">₹{cat.value.toLocaleString('en-IN')}</span>
                            <span className="text-emerald-400 text-[11px] font-bold">{cat.percentage.toFixed(1)}%</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(cat.percentage, 2)}%`, backgroundColor: color }} />
                        </div>
                      </div>

                      {/* Inline Category Transaction Drilldown */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-zinc-400">
                            <span className="font-medium">Recorded Receipts in {cat.name}</span>
                            <span className="font-mono text-[10px] text-zinc-500">
                              Avg: ₹{cat.count > 0 ? Math.round(cat.value / cat.count).toLocaleString('en-IN') : 0}
                            </span>
                          </div>
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                            {categoryTxns.map((t: any) => (
                              <div 
                                key={t.id} 
                                className="p-2 rounded-xl bg-zinc-900 border border-zinc-800/80 flex items-center justify-between text-xs hover:border-zinc-700 transition-colors"
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-1.5 text-[11px]">
                                    <span className="font-bold text-white">{format(parseISO(t.date), 'dd MMM yyyy')}</span>
                                    <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 text-[10px]">
                                      {t.payment_type || 'Cash'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">{t.description || 'No description'}</p>
                                </div>
                                <span className="font-mono font-bold text-emerald-400 shrink-0">
                                  +₹{(Number(t.amount) || 0).toLocaleString('en-IN')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
