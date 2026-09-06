import React from 'react';

interface PassbookSummaryProps {
  currentBalance: number;
  periodInflow: number;
  periodOutflow: number;
  filterDate: 'All' | 'Today' | 'This Week' | 'This Month' | 'Custom';
  setFilterDate: (d: any) => void;
  customDateRange: { start: string; end: string };
  setCustomDateRange: React.Dispatch<React.SetStateAction<{ start: string; end: string }>>;
}

export function PassbookSummary({
  currentBalance,
  periodInflow,
  periodOutflow,
  filterDate,
  setFilterDate,
  customDateRange,
  setCustomDateRange
}: PassbookSummaryProps) {
  const filterOptions = ['All', 'Today', 'This Week', 'This Month', 'Custom'] as const;

  return (
    <div className="space-y-4">
      {/* 3 Summary Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-zinc-900 border border-zinc-800 p-3 sm:p-4 rounded-2xl">
          <span className="text-[10px] sm:text-xs text-zinc-500 font-bold uppercase tracking-wider block">Net Balance</span>
          <p className="text-sm sm:text-lg font-bold text-white mt-1">₹{currentBalance.toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3 sm:p-4 rounded-2xl">
          <span className="text-[10px] sm:text-xs text-green-500 font-bold uppercase tracking-wider block">Total Inflow</span>
          <p className="text-sm sm:text-lg font-bold text-green-500 mt-1">+₹{periodInflow.toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-3 sm:p-4 rounded-2xl">
          <span className="text-[10px] sm:text-xs text-red-500 font-bold uppercase tracking-wider block">Total Outflow</span>
          <p className="text-sm sm:text-lg font-bold text-red-500 mt-1">-₹{periodOutflow.toLocaleString()}</p>
        </div>
      </div>

      {/* Date Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {filterOptions.map(f => (
          <button 
            key={f}
            onClick={() => setFilterDate(f)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              filterDate === f 
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' 
                : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Custom Date Range Picker */}
      {filterDate === 'Custom' && (
        <div className="grid grid-cols-2 gap-3 bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Start Date</label>
            <input 
              type="date" 
              value={customDateRange.start} 
              onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">End Date</label>
            <input 
              type="date" 
              value={customDateRange.end} 
              onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}
