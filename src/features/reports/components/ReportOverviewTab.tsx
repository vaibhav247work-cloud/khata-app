import React from 'react';
import { Sparkles } from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export interface FinancialInsights {
  expenseRatio: number;
  dailyAvgExpense: number;
  dailyAvgIncome: number;
  digitalShare: number;
  cashShare: number;
  topExpense: { name: string; value: number; count: number; percentage: number } | null;
  topIncome: { name: string; value: number; count: number; percentage: number } | null;
}

export interface DailyCashFlowItem {
  date: string;
  credit: number;
  debit: number;
}

interface ReportOverviewTabProps {
  periodLabel: string;
  financialInsights: FinancialInsights;
  dailyCashFlowData: DailyCashFlowItem[];
}

export function ReportOverviewTab({
  periodLabel,
  financialInsights,
  dailyCashFlowData,
}: ReportOverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Executive Spending Habits & Financial Health Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Financial Health & Spending Habits</h3>
              <p className="text-zinc-500 text-xs">Real-time performance benchmarks for {periodLabel}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Metric 1: Operating Expense Ratio */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
              <span>Operating Ratio</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                financialInsights.expenseRatio <= 70 
                  ? 'bg-emerald-500/10 text-emerald-400' 
                  : financialInsights.expenseRatio <= 95 
                  ? 'bg-amber-500/10 text-amber-400' 
                  : 'bg-rose-500/10 text-rose-400'
              }`}>
                {financialInsights.expenseRatio <= 70 ? 'Healthy' : financialInsights.expenseRatio <= 95 ? 'Moderate' : 'High Burn'}
              </span>
            </div>
            <p className="text-lg font-black text-white font-mono">
              {financialInsights.expenseRatio.toFixed(1)}%
            </p>
            <p className="text-[10px] text-zinc-500">Outflow vs Total Inflow</p>
          </div>

          {/* Metric 2: Daily Outflow Burn */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
              <span>Daily Avg Outflow</span>
              <span className="text-orange-400 text-xs font-mono">₹/day</span>
            </div>
            <p className="text-lg font-black text-white font-mono">
              ₹{financialInsights.dailyAvgExpense.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-zinc-500">Based on period activity</p>
          </div>

          {/* Metric 3: Digital vs Cash Ratio */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
              <span>Payment Channels</span>
              <span className="text-blue-400 text-[10px] font-bold">{financialInsights.digitalShare.toFixed(0)}% Digital</span>
            </div>
            <p className="text-sm font-bold text-white">
              {financialInsights.digitalShare.toFixed(0)}% Online <span className="text-zinc-500 font-normal">/</span> {financialInsights.cashShare.toFixed(0)}% Cash
            </p>
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden flex">
              <div className="bg-blue-500 h-full" style={{ width: `${financialInsights.digitalShare}%` }} />
              <div className="bg-amber-500 h-full" style={{ width: `${financialInsights.cashShare}%` }} />
            </div>
          </div>

          {/* Metric 4: Top Outflow Driver */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-medium">
              <span>Primary Cost Driver</span>
              <span className="text-orange-400 text-[10px] font-bold">
                {financialInsights.topExpense ? `${financialInsights.topExpense.percentage.toFixed(0)}%` : '0%'}
              </span>
            </div>
            <p className="text-sm font-bold text-orange-400 truncate">
              {financialInsights.topExpense?.name || 'None'}
            </p>
            <p className="text-[10px] text-zinc-500 font-mono">
              ₹{financialInsights.topExpense ? financialInsights.topExpense.value.toLocaleString('en-IN') : '0'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-base sm:text-lg text-white">Daily Cash Flow Comparison</h3>
            <p className="text-zinc-500 text-xs">Inflow (Credit) vs Outflow (Debit) activity over time</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-emerald-400">Inflow</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              <span className="text-orange-400">Outflow</span>
            </div>
          </div>
        </div>

        {dailyCashFlowData.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 text-xs">
            No transactions recorded for the selected date range.
          </div>
        ) : (
          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyCashFlowData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis 
                  dataKey="date" 
                  stroke="#71717a" 
                  fontSize={10} 
                  angle={-30} 
                  textAnchor="end"
                  height={40}
                />
                <YAxis 
                  stroke="#71717a" 
                  fontSize={10} 
                  tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '12px', fontSize: '12px' }}
                  formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, '']}
                />
                <Bar dataKey="credit" name="Inflow" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="debit" name="Outflow" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
