import React from 'react';
import { PAYMENT_TYPES } from '../../constants';

interface TransactionFiltersProps {
  periodFilter: 'All' | 'Today' | 'This Week' | 'This Month' | 'Last Month' | 'Last 30 Days' | 'This Year' | 'Custom';
  setPeriodFilter: (p: any) => void;
  typeFilter: 'All' | 'Credit' | 'Debit';
  setTypeFilter: (t: any) => void;
  paymentModeFilter: string;
  setPaymentModeFilter: (m: string) => void;
  customRange: { start: string; end: string };
  setCustomRange: React.Dispatch<React.SetStateAction<{ start: string; end: string }>>;
  hasActiveFilters: boolean;
  onClearAllFilters: () => void;
  filteredCount: number;
  totalCount: number;
}

export function TransactionFilters({
  periodFilter,
  setPeriodFilter,
  typeFilter,
  setTypeFilter,
  paymentModeFilter,
  setPaymentModeFilter,
  customRange,
  setCustomRange,
  hasActiveFilters,
  onClearAllFilters,
  filteredCount,
  totalCount
}: TransactionFiltersProps) {
  const periodTabs = ['All', 'Today', 'This Week', 'This Month', 'Last Month', 'Last 30 Days', 'This Year', 'Custom'] as const;

  return (
    <div className="space-y-2.5">
      {/* Date Period Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {periodTabs.map((f) => (
          <button 
            key={f}
            id={`filter-period-${f.toLowerCase().replace(/\s+/g, '-')}`}
            type="button"
            onClick={() => setPeriodFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              periodFilter === f 
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' 
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
            }`}
          >
            {f === 'All' ? 'All Time' : f}
          </button>
        ))}
      </div>

      {/* Custom Date Range Picker */}
      {periodFilter === 'Custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">From Date</label>
            <input 
              type="date" 
              value={customRange.start} 
              onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">To Date</label>
            <input 
              type="date" 
              value={customRange.end} 
              onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>
      )}

      {/* Type & Payment Mode Filter Row */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Credit / Debit Tabs */}
        <div className="flex gap-1.5 flex-1">
          {(['All', 'Credit', 'Debit'] as const).map((t) => (
            <button 
              key={t}
              id={`filter-type-${t.toLowerCase()}`}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                typeFilter === t 
                  ? t === 'Credit' 
                    ? 'bg-green-500 text-white shadow-md shadow-green-500/20' 
                    : t === 'Debit' 
                    ? 'bg-red-500 text-white shadow-md shadow-red-500/20' 
                    : 'bg-zinc-700 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {t === 'Credit' ? 'Income' : t === 'Debit' ? 'Expense' : 'All Types'}
            </button>
          ))}
        </div>

        {/* Payment Mode Filter Dropdown */}
        <div className="sm:w-44 shrink-0">
          <select
            id="filter-payment-mode-select"
            value={paymentModeFilter}
            onChange={(e) => setPaymentModeFilter(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium"
          >
            <option value="All">All Payment Modes</option>
            {PAYMENT_TYPES.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Filter Pills Bar */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-3 py-2">
          <span>Showing {filteredCount} of {totalCount} records</span>
          <button
            id="clear-all-tx-filters-btn"
            type="button"
            onClick={onClearAllFilters}
            className="text-orange-400 hover:text-orange-300 font-bold transition-colors"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
