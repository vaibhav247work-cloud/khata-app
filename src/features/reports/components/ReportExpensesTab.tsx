import React, { useState } from 'react';
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

export interface CategoryMetric {
  name: string;
  value: number;
  count: number;
  percentage: number;
}

interface ReportExpensesTabProps {
  totalDebit: number;
  debitCategoryData: CategoryMetric[];
  reportSearchQuery: string;
  renderReportActiveShape: (props: any) => React.ReactElement;
  getCategoryTransactions: (categoryName: string, type: 'Debit' | 'Credit') => Transaction[];
}

export function ReportExpensesTab({
  totalDebit,
  debitCategoryData,
  reportSearchQuery,
  renderReportActiveShape,
  getCategoryTransactions,
}: ReportExpensesTabProps) {
  const [activeExpenseCatIndex, setActiveExpenseCatIndex] = useState<number | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-white">Expense Distribution by Category</h3>
            <p className="text-zinc-500 text-xs">
              Total Outflow: ₹{totalDebit.toLocaleString('en-IN')} across {debitCategoryData.length} categories
            </p>
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

        {debitCategoryData.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-xs">No expense transactions recorded in this period.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Donut Chart with Active Sector & Center Callout */}
            <div className="md:col-span-5 flex items-center justify-center sticky top-4">
              <div className="w-56 h-56 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={debitCategoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={82}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="#18181b"
                      strokeWidth={2}
                      activeIndex={activeExpenseCatIndex !== null ? activeExpenseCatIndex : undefined}
                      activeShape={renderReportActiveShape}
                      onMouseEnter={(_, index) => setActiveExpenseCatIndex(index)}
                      onMouseLeave={() => setActiveExpenseCatIndex(null)}
                      onClick={(_, index) => {
                        setActiveExpenseCatIndex(prev => prev === index ? null : index);
                        const cat = debitCategoryData[index];
                        if (cat) {
                          setExpandedCategory(prev => prev === cat.name ? null : cat.name);
                        }
                      }}
                    >
                      {debitCategoryData.map((_entry, index) => (
                        <Cell key={`rep-exp-cell-${index}`} fill={EXPENSE_PALETTE[index % EXPENSE_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          const fillColor = payload[0].payload.fill || payload[0].color || '#f97316';
                          return (
                            <div className="bg-zinc-950/95 border border-zinc-800 p-2.5 rounded-xl shadow-xl text-xs backdrop-blur-md z-50">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: fillColor }} />
                                <span className="font-bold text-white">{d.name}</span>
                              </div>
                              <div className="text-orange-400 font-mono font-semibold">
                                ₹{d.value.toLocaleString('en-IN')} ({d.percentage.toFixed(1)}%)
                              </div>
                              <div className="text-[10px] text-zinc-500 mt-0.5">{d.count} transaction{d.count === 1 ? '' : 's'}</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Dynamic Center Metric Callout */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2 transition-all">
                  {activeExpenseCatIndex !== null && debitCategoryData[activeExpenseCatIndex] ? (
                    <>
                      <span 
                        className="text-[10px] uppercase font-bold tracking-wider truncate max-w-[130px] px-2 py-0.5 rounded-full border mb-0.5"
                        style={{ 
                          color: EXPENSE_PALETTE[activeExpenseCatIndex % EXPENSE_PALETTE.length],
                          borderColor: `${EXPENSE_PALETTE[activeExpenseCatIndex % EXPENSE_PALETTE.length]}40`,
                          backgroundColor: `${EXPENSE_PALETTE[activeExpenseCatIndex % EXPENSE_PALETTE.length]}18`
                        }}
                      >
                        {debitCategoryData[activeExpenseCatIndex].name}
                      </span>
                      <span className="text-base sm:text-lg font-black text-white font-mono tracking-tight">
                        {debitCategoryData[activeExpenseCatIndex].value >= 100000 
                          ? (debitCategoryData[activeExpenseCatIndex].value / 100000).toFixed(2) + 'L' 
                          : `₹${debitCategoryData[activeExpenseCatIndex].value.toLocaleString('en-IN')}`}
                      </span>
                      <span className="text-[10px] text-zinc-300 font-medium">
                        {debitCategoryData[activeExpenseCatIndex].percentage.toFixed(1)}% · {debitCategoryData[activeExpenseCatIndex].count} txns
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Expenses</span>
                      <span className="text-base sm:text-lg font-black text-white font-mono tracking-tight">
                        {totalDebit >= 100000 ? `₹${(totalDebit / 100000).toFixed(1)}L` : `₹${totalDebit.toLocaleString('en-IN')}`}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {debitCategoryData.length} categories
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Ranked Breakdown Table with Drilldown Accordion */}
            <div className="md:col-span-7 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-zinc-500 font-semibold uppercase tracking-wider pb-1.5 border-b border-zinc-800">
                <span>Category (Tap to inspect)</span>
                <span>Amount (% Share)</span>
              </div>

              {debitCategoryData
                .filter((cat) => !reportSearchQuery || cat.name.toLowerCase().includes(reportSearchQuery.toLowerCase()))
                .map((cat, idx) => {
                  const color = EXPENSE_PALETTE[idx % EXPENSE_PALETTE.length];
                  const isHovered = activeExpenseCatIndex === idx;
                  const isExpanded = expandedCategory === cat.name;
                  const categoryTxns = isExpanded ? getCategoryTransactions(cat.name, 'Debit') : [];

                  return (
                    <div 
                      key={cat.name} 
                      className={`rounded-2xl transition-all border ${
                        isExpanded 
                          ? 'bg-zinc-950/80 border-orange-500/40 p-3 space-y-3' 
                          : isHovered 
                          ? 'bg-zinc-850/60 border-zinc-700/80 p-2' 
                          : 'bg-zinc-900/40 border-transparent hover:bg-zinc-850/40 p-2'
                      }`}
                    >
                      <div 
                        className="space-y-1.5 cursor-pointer"
                        onMouseEnter={() => setActiveExpenseCatIndex(idx)}
                        onMouseLeave={() => setActiveExpenseCatIndex(null)}
                        onClick={() => setExpandedCategory(prev => prev === cat.name ? null : cat.name)}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                            <span className={`font-semibold truncate ${isExpanded ? 'text-orange-400' : 'text-white'}`}>
                              {cat.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 shrink-0">({cat.count} txns)</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-white font-mono">₹{cat.value.toLocaleString('en-IN')}</span>
                            <span className="text-orange-400 text-[11px] font-bold">{cat.percentage.toFixed(1)}%</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-orange-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500" 
                            style={{ width: `${Math.max(cat.percentage, 2)}%`, backgroundColor: color }} 
                          />
                        </div>
                      </div>

                      {/* Inline Category Transaction Drilldown */}
                      {isExpanded && (
                        <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-zinc-400">
                            <span className="font-medium">Recorded Expenses in {cat.name}</span>
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
                                <span className="font-mono font-bold text-rose-400 shrink-0">
                                  -₹{(Number(t.amount) || 0).toLocaleString('en-IN')}
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
