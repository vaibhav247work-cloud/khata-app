import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Printer, 
  Search, 
  X 
} from 'lucide-react';
import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval, 
  parseISO 
} from 'date-fns';
import type { Transaction } from '../../types';
import { generateAndSharePassbookPDF } from './passbookPdf';
import { PassbookSummary } from './PassbookSummary';
import { PassbookTable } from './PassbookTable';

interface PassbookModuleProps {
  transactions: Transaction[];
  filterDate: 'All' | 'Today' | 'This Week' | 'This Month' | 'Custom';
  setFilterDate: (d: any) => void;
  customDateRange: { start: string; end: string };
  setCustomDateRange: React.Dispatch<React.SetStateAction<{ start: string; end: string }>>;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function PassbookModule({
  transactions,
  filterDate,
  setFilterDate,
  customDateRange,
  setCustomDateRange,
  showToast
}: PassbookModuleProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Calculate running balances chronologically (Oldest first)
  const sortedChronological = useMemo(() => {
    return [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions]);

  const passbookWithBalances = useMemo(() => {
    let currentBal = 0;
    return sortedChronological.map(tx => {
      if (tx.type === 'Credit') {
        currentBal += tx.amount;
      } else {
        currentBal -= tx.amount;
      }
      return {
        ...tx,
        runningBalance: currentBal
      };
    });
  }, [sortedChronological]);

  // 2. Apply Filters and then display Newest first
  const filteredPassbook = useMemo(() => {
    const now = new Date();
    return passbookWithBalances
      .filter(tx => {
        const txDate = parseISO(tx.date);
        
        // Search Filter
        const matchesSearch = tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              tx.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (tx.payment_type && tx.payment_type.toLowerCase().includes(searchQuery.toLowerCase())) ||
                              (tx.reference && tx.reference.toLowerCase().includes(searchQuery.toLowerCase()));
        if (!matchesSearch) return false;

        // Date Filter
        if (filterDate === 'Today') {
          return isWithinInterval(txDate, { start: startOfDay(now), end: endOfDay(now) });
        }
        if (filterDate === 'This Week') {
          return isWithinInterval(txDate, { start: startOfWeek(now), end: endOfWeek(now) });
        }
        if (filterDate === 'This Month') {
          return isWithinInterval(txDate, { start: startOfMonth(now), end: endOfMonth(now) });
        }
        if (filterDate === 'Custom' && customDateRange.start && customDateRange.end) {
          return isWithinInterval(txDate, {
            start: startOfDay(parseISO(customDateRange.start)),
            end: endOfDay(parseISO(customDateRange.end))
          });
        }
        return true;
      })
      .reverse(); // Reverse so newest is at the top
  }, [passbookWithBalances, filterDate, customDateRange, searchQuery]);

  // Summary Metrics for the filtered period
  const periodInflow = filteredPassbook.filter(t => t.type === 'Credit').reduce((sum, t) => sum + t.amount, 0);
  const periodOutflow = filteredPassbook.filter(t => t.type === 'Debit').reduce((sum, t) => sum + t.amount, 0);
  const currentBalance = passbookWithBalances.length > 0 ? passbookWithBalances[passbookWithBalances.length - 1].runningBalance : 0;

  const handlePrintPassbook = async () => {
    if (filteredPassbook.length === 0) {
      if (showToast) showToast('No passbook records to print', 'info');
      return;
    }
    await generateAndSharePassbookPDF(filteredPassbook, filterDate, 'All', showToast);
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
      {/* Header and Print Statement Action */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-lg text-white">Digital Passbook</h3>
          <p className="text-zinc-500 text-xs">Official chronological statement of account</p>
        </div>
        <button
          id="print-passbook-btn"
          type="button"
          onClick={handlePrintPassbook}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-orange-500/20 text-zinc-300 hover:text-orange-400 border border-zinc-700/80 hover:border-orange-500/40 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
          title="Print or share official passbook statement PDF"
        >
          <Printer className="w-4 h-4" />
          <span>Print Passbook</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
        <input 
          type="text" 
          placeholder="Search by category, desc, mode..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-11 pr-10 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs sm:text-sm"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-white bg-zinc-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Summary Cards and Filters */}
      <PassbookSummary
        currentBalance={currentBalance}
        periodInflow={periodInflow}
        periodOutflow={periodOutflow}
        filterDate={filterDate}
        setFilterDate={setFilterDate}
        customDateRange={customDateRange}
        setCustomDateRange={setCustomDateRange}
      />

      {/* Passbook Table */}
      <PassbookTable entries={filteredPassbook} />
    </motion.div>
  );
}
