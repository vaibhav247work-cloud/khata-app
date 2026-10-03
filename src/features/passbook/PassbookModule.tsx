import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, X, Printer, RefreshCw } from 'lucide-react';
import { 
  format, 
  parseISO, 
  isWithinInterval, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth 
} from 'date-fns';
import { type Transaction } from '../../db';
import { generateAndSharePassbookPDF } from '../../utils/pdfExport';
import { type CustomDateRange, type FilterDate, type PdfPreviewData } from '../../types/common';

export interface PassbookModuleProps {
  transactions: Transaction[];
  filterDate: FilterDate;
  setFilterDate: (date: FilterDate) => void;
  customDateRange: CustomDateRange;
  setCustomDateRange: (range: CustomDateRange) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  onPreviewPdf?: (data: PdfPreviewData) => void;
}

export function PassbookModule({ 
  transactions, 
  filterDate, 
  setFilterDate, 
  customDateRange, 
  setCustomDateRange, 
  showToast, 
  onPreviewPdf 
}: PassbookModuleProps) {
  const [typeFilter, setTypeFilter] = useState<'All' | 'Credit' | 'Debit'>('All');
  const [passbookSearch, setPassbookSearch] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  // 1. Calculate running balance from the beginning chronologically
  const allWithBalance = useMemo(() => {
    // Sort by date ascending to calculate accurate running balance from beginning
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    return sorted.map(tx => {
      if (tx.type === 'Credit') balance += Number(tx.amount || 0);
      else balance -= Number(tx.amount || 0);
      return { ...tx, runningBalance: balance };
    });
  }, [transactions]);

  // 2. Filter passbook items based on selected Date Range
  const dateFilteredData = useMemo(() => {
    if (filterDate === 'All') return allWithBalance;

    const now = new Date();
    return allWithBalance.filter(tx => {
      try {
        const txDate = parseISO(tx.date);
        if (filterDate === 'Today') {
          return isWithinInterval(txDate, { start: startOfDay(now), end: endOfDay(now) });
        }
        if (filterDate === 'This Week') {
          return isWithinInterval(txDate, { start: startOfWeek(now), end: endOfWeek(now) });
        }
        if (filterDate === 'This Month') {
          return isWithinInterval(txDate, { start: startOfMonth(now), end: endOfMonth(now) });
        }
        if (filterDate === 'Custom' && customDateRange?.start && customDateRange?.end) {
          return isWithinInterval(txDate, {
            start: startOfDay(parseISO(customDateRange.start)),
            end: endOfDay(parseISO(customDateRange.end))
          });
        }
        return true;
      } catch {
        return true;
      }
    });
  }, [allWithBalance, filterDate, customDateRange]);

  // 3. Filter passbook items based on type filter and search query
  const passbookData = useMemo(() => {
    let filtered = dateFilteredData;

    if (typeFilter !== 'All') {
      filtered = filtered.filter(tx => tx.type === typeFilter);
    }

    if (passbookSearch.trim()) {
      const q = passbookSearch.toLowerCase().trim();
      filtered = filtered.filter(tx => 
        (tx.category || '').toLowerCase().includes(q) ||
        (tx.description || '').toLowerCase().includes(q) ||
        (tx.reference || '').toLowerCase().includes(q) ||
        (tx.payment_type || '').toLowerCase().includes(q) ||
        String(tx.amount || '').includes(q)
      );
    }

    return [...filtered].reverse(); // Show newest first
  }, [dateFilteredData, typeFilter, passbookSearch]);

  // Progressive Lazy Loading (Virtual Pagination to prevent system freeze on large datasets)
  const PAGE_SIZE = 35;
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // Reset pagination limit when search, type filter, or date filter changes
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [passbookSearch, typeFilter, filterDate, customDateRange]);

  const visiblePassbookData = useMemo(() => {
    return passbookData.slice(0, displayLimit);
  }, [passbookData, displayLimit]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayLimit < passbookData.length) {
          setDisplayLimit((prev) => Math.min(prev + PAGE_SIZE, passbookData.length));
        }
      },
      { threshold: 0.1, rootMargin: '300px' }
    );

    const target = loadMoreSentinelRef.current;
    if (target) observer.observe(target);
    return () => {
      if (target) observer.unobserve(target);
    };
  }, [displayLimit, passbookData.length]);

  // Derive Period Label
  const periodLabel = useMemo(() => {
    if (filterDate === 'Custom') {
      if (customDateRange?.start && customDateRange?.end) {
        return `${format(parseISO(customDateRange.start), 'dd MMM yyyy')} to ${format(parseISO(customDateRange.end), 'dd MMM yyyy')}`;
      }
      return 'Custom Range';
    }
    if (filterDate === 'All') return 'All Time';
    return filterDate;
  }, [filterDate, customDateRange]);

  // Calculate summary metrics for current filtered passbook view
  const totalCredit = useMemo(() => {
    return passbookData.filter(t => t.type === 'Credit').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [passbookData]);

  const totalDebit = useMemo(() => {
    return passbookData.filter(t => t.type === 'Debit').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [passbookData]);

  const latestRunningBalance = useMemo(() => {
    return passbookData.length > 0 ? (passbookData[0] as any).runningBalance : 0;
  }, [passbookData]);

  const handlePrintPassbook = async () => {
    if (isPrinting || passbookData.length === 0) return;
    setIsPrinting(true);
    try {
      await generateAndSharePassbookPDF(passbookData, periodLabel, typeFilter, showToast, onPreviewPdf);
    } catch (err) {
      console.error('Print passbook error:', err);
      if (showToast) showToast('Failed to print passbook statement', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-4 sm:space-y-5"
    >
      {/* Top Search & Inline Print Action Header */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4 sm:w-5 sm:h-5 pointer-events-none" />
          <input 
            id="passbook-search-input"
            type="text" 
            value={passbookSearch}
            onChange={(e) => setPassbookSearch(e.target.value)}
            placeholder="Search passbook..." 
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-10 sm:pl-12 pr-9 sm:pr-10 py-3 sm:py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs sm:text-sm"
          />
          {passbookSearch && (
            <button
              id="clear-passbook-search-btn"
              type="button"
              onClick={() => setPassbookSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}
        </div>

        {/* Compact Print Button on Mobile, Expanded on Desktop */}
        <button
          id="print-passbook-statement-btn"
          type="button"
          onClick={handlePrintPassbook}
          disabled={isPrinting || passbookData.length === 0}
          title={`Print Passbook (${periodLabel})`}
          className="h-11 sm:h-12 px-3.5 sm:px-5 bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-900 border border-orange-500/30 disabled:border-zinc-800 text-white disabled:text-zinc-600 rounded-2xl transition-all shadow-md shadow-orange-500/20 disabled:shadow-none flex items-center justify-center gap-2 text-xs sm:text-sm font-bold shrink-0 disabled:cursor-not-allowed active:scale-95"
        >
          {isPrinting ? (
            <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-white" />
          ) : (
            <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
          <span className="hidden sm:inline">Print Passbook</span>
        </button>
      </div>

      {/* Date Period Filter Pills */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {(['All', 'Today', 'This Week', 'This Month', 'Custom'] as FilterDate[]).map((f) => (
            <button 
              key={f}
              id={`passbook-filter-date-${f.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => setFilterDate(f)}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                filterDate === f ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {f === 'All' ? 'All Time' : f}
            </button>
          ))}
        </div>

        {/* Credit / Debit Type Tabs */}
        <div className="flex gap-2">
          {(['All', 'Credit', 'Debit'] as const).map((t) => (
            <button 
              key={t}
              id={`passbook-filter-type-${t.toLowerCase()}`}
              onClick={() => setTypeFilter(t)}
              className={`flex-1 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold uppercase tracking-wider transition-all ${
                typeFilter === t 
                  ? t === 'Credit' 
                    ? 'bg-green-500 text-white shadow-md shadow-green-500/20' 
                    : t === 'Debit' 
                    ? 'bg-red-500 text-white shadow-md shadow-red-500/20' 
                    : 'bg-zinc-700 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              {t === 'Credit' ? 'Income (Credit)' : t === 'Debit' ? 'Expense (Debit)' : 'All Types'}
            </button>
          ))}
        </div>
      </div>

      {filterDate === 'Custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">From Date</label>
            <input 
              type="date" 
              value={customDateRange.start} 
              onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">To Date</label>
            <input 
              type="date" 
              value={customDateRange.end} 
              onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>
      )}

      {/* Financial Summary 3-Column Indicator (Mobile-Optimized) */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col min-w-0">
          <span className="text-zinc-500 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider truncate">Income</span>
          <span className="text-xs sm:text-base md:text-lg font-bold text-green-400 mt-0.5 truncate">
            +₹{totalCredit.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="flex flex-col min-w-0 border-l border-zinc-800 pl-2 sm:pl-3">
          <span className="text-zinc-500 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider truncate">Expense</span>
          <span className="text-xs sm:text-base md:text-lg font-bold text-red-400 mt-0.5 truncate">
            -₹{totalDebit.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="flex flex-col min-w-0 border-l border-zinc-800 pl-2 sm:pl-3">
          <span className="text-zinc-500 text-[9px] sm:text-[11px] font-bold uppercase tracking-wider truncate">Net Balance</span>
          <span className={`text-xs sm:text-base md:text-lg font-bold mt-0.5 truncate ${latestRunningBalance >= 0 ? 'text-zinc-100' : 'text-red-400'}`}>
            ₹{latestRunningBalance.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Passbook Table / Card List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-[32px] overflow-hidden shadow-sm">
        <div className="grid grid-cols-12 bg-zinc-800/60 p-4 text-[10px] font-bold uppercase tracking-widest text-zinc-400 border-b border-zinc-800">
          <span className="col-span-3 sm:col-span-2">Date</span>
          <span className="col-span-5 sm:col-span-4">Particulars</span>
          <span className="hidden sm:block sm:col-span-2 text-center">Mode</span>
          <span className="col-span-4 sm:col-span-2 text-right">Amount</span>
          <span className="hidden sm:block sm:col-span-2 text-right">Balance</span>
        </div>

        <div className="divide-y divide-zinc-800/70">
          {visiblePassbookData.map((item: any) => {
            const isCredit = item.type === 'Credit';
            return (
              <div key={item.id} className="grid grid-cols-12 p-4 items-center hover:bg-zinc-850/40 transition-colors">
                {/* Date */}
                <div className="col-span-3 sm:col-span-2 flex flex-col">
                  <span className="text-xs font-bold text-zinc-300">{format(parseISO(item.date), 'dd MMM')}</span>
                  <span className="text-[10px] text-zinc-500">{format(parseISO(item.date), 'yyyy, hh:mm a')}</span>
                </div>

                {/* Particulars */}
                <div className="col-span-5 sm:col-span-4 flex flex-col min-w-0 pr-2">
                  <span className="text-xs font-bold text-white truncate">{item.category}</span>
                  <span className="text-[11px] text-zinc-400 truncate">{item.description}</span>
                  {item.reference && (
                    <span className="text-[10px] text-zinc-500 truncate">Ref: {item.reference}</span>
                  )}
                  {/* Mobile payment mode display */}
                  <span className="text-[10px] text-orange-400 sm:hidden mt-0.5">{item.payment_type}</span>
                </div>

                {/* Mode (Desktop) */}
                <div className="hidden sm:flex sm:col-span-2 items-center justify-center">
                  <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[11px] font-semibold border border-zinc-700/60">
                    {item.payment_type || 'Cash'}
                  </span>
                </div>

                {/* Amount */}
                <div className="col-span-4 sm:col-span-2 text-right flex flex-col items-end">
                  <span className={`text-xs sm:text-sm font-bold ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                    {isCredit ? '+' : '-'}₹{(Number(item.amount) || 0).toLocaleString('en-IN')}
                  </span>
                  {/* Mobile Running Balance */}
                  <span className="text-[10px] text-zinc-500 sm:hidden">
                    Bal: ₹{(Number(item.runningBalance) || 0).toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Running Balance (Desktop) */}
                <div className="hidden sm:block sm:col-span-2 text-right">
                  <span className="text-xs sm:text-sm font-bold text-zinc-200">
                    ₹{(Number(item.runningBalance) || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Progressive Infinite Scroll Sentinel & Load More button */}
          {passbookData.length > displayLimit && (
            <div 
              ref={loadMoreSentinelRef} 
              className="p-4 text-center border-t border-zinc-800/70 bg-zinc-950/40"
            >
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-orange-500" />
                  <span>Showing {visiblePassbookData.length} of {passbookData.length} entries</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDisplayLimit((prev) => Math.min(prev + PAGE_SIZE * 2, passbookData.length))}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-xs font-semibold text-zinc-200 hover:text-white transition-colors border border-zinc-700/60 cursor-pointer shadow-xs active:scale-95"
                >
                  Load Next 70
                </button>
              </div>
            </div>
          )}

          {passbookData.length > PAGE_SIZE && visiblePassbookData.length >= passbookData.length && (
            <div className="p-3 text-center border-t border-zinc-800/50 bg-zinc-950/30 text-zinc-500 text-xs font-medium">
              ✓ All {passbookData.length} transactions loaded for this period
            </div>
          )}

          {passbookData.length === 0 && (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto text-zinc-500">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-zinc-400 font-bold text-sm">
                {passbookSearch || typeFilter !== 'All' ? 'No matching passbook entries' : 'No records found for this period'}
              </p>
              <p className="text-zinc-600 text-xs max-w-xs mx-auto">
                {passbookSearch ? `No records matched "${passbookSearch}".` : 'Try changing the date filter or entry type.'}
              </p>
              {(passbookSearch || typeFilter !== 'All' || filterDate !== 'All') && (
                <button
                  id="reset-passbook-filters-btn"
                  type="button"
                  onClick={() => {
                    setPassbookSearch('');
                    setTypeFilter('All');
                    setFilterDate('All');
                  }}
                  className="text-xs font-bold text-orange-400 hover:text-orange-300 underline"
                >
                  Reset all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
