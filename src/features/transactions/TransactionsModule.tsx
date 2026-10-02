import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  X, 
  ListChecks, 
  Plus, 
  Trash2, 
  RefreshCw 
} from 'lucide-react';
import { 
  format, 
  parseISO, 
  isWithinInterval, 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  subMonths, 
  subDays, 
  startOfYear, 
  endOfYear 
} from 'date-fns';
import { 
  db, 
  type Transaction 
} from '../../db';
import { 
  deleteTransactionsWithRecalculation, 
  reconcileOrdersWithTransactions 
} from '../../sync';
import { 
  DEFAULT_EXPENSE_CATEGORIES, 
  DEFAULT_PAYMENT_MODES 
} from '../../utils/categoriesAndModes';
import { useBackHandler } from '../../utils/backHandler';
import { TransactionCard } from './components/TransactionCard';
import { AddEditTransactionModal } from './components/AddEditTransactionModal';
import { BulkDeleteConfirmModal } from './components/BulkDeleteConfirmModal';

interface TransactionsModuleProps {
  transactions: Transaction[];
  onAdd: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  markSyncPending: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  isAdmin?: boolean;
  expenseCategories?: string[];
  paymentModes?: string[];
  initialOpenAdd?: boolean;
  onAddModalClosed?: () => void;
}

export function TransactionsModule({ 
  transactions, 
  onAdd, 
  searchQuery, 
  setSearchQuery, 
  markSyncPending, 
  showToast,
  isAdmin,
  expenseCategories = DEFAULT_EXPENSE_CATEGORIES,
  paymentModes = DEFAULT_PAYMENT_MODES,
  initialOpenAdd = false,
  onAddModalClosed,
}: TransactionsModuleProps) {
  const [showAdd, setShowAdd] = useState(initialOpenAdd);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    if (initialOpenAdd) {
      setShowAdd(true);
      setEditingTransaction(null);
    }
  }, [initialOpenAdd]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter states
  const [periodFilter, setPeriodFilter] = useState<'All' | 'Today' | 'This Week' | 'This Month' | 'Last Month' | 'Last 30 Days' | 'This Year' | 'Custom'>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Credit' | 'Debit'>('All');
  const [paymentModeFilter, setPaymentModeFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

  // Progressive Lazy Loading State (Virtual Pagination)
  const PAGE_SIZE = 30;
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // Reset pagination limit when any filter or query changes
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [searchQuery, periodFilter, typeFilter, paymentModeFilter, categoryFilter, customRange]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const now = new Date();

    return transactions.filter((tx: Transaction) => {
      if (q) {
        const matchDesc = (tx.description || '').toLowerCase().includes(q);
        const matchCat = (tx.category || '').toLowerCase().includes(q);
        const matchRef = (tx.reference || '').toLowerCase().includes(q);
        const matchAmt = tx.amount ? tx.amount.toString().includes(q) : false;
        if (!matchDesc && !matchCat && !matchRef && !matchAmt) return false;
      }

      if (typeFilter !== 'All' && tx.type !== typeFilter) return false;
      if (paymentModeFilter !== 'All' && tx.payment_type !== paymentModeFilter) return false;
      if (categoryFilter !== 'All' && tx.category !== categoryFilter) return false;
      if (periodFilter === 'All') return true;

      try {
        const txDate = parseISO(tx.date);
        if (periodFilter === 'Today') {
          return isWithinInterval(txDate, { start: startOfDay(now), end: endOfDay(now) });
        }
        if (periodFilter === 'This Week') {
          return isWithinInterval(txDate, { start: startOfWeek(now), end: endOfWeek(now) });
        }
        if (periodFilter === 'This Month') {
          return isWithinInterval(txDate, { start: startOfMonth(now), end: endOfMonth(now) });
        }
        if (periodFilter === 'Last Month') {
          const lastMonth = subMonths(now, 1);
          return isWithinInterval(txDate, { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) });
        }
        if (periodFilter === 'Last 30 Days') {
          return isWithinInterval(txDate, { start: startOfDay(subDays(now, 30)), end: endOfDay(now) });
        }
        if (periodFilter === 'This Year') {
          return isWithinInterval(txDate, { start: startOfYear(now), end: endOfYear(now) });
        }
        if (periodFilter === 'Custom' && customRange.start && customRange.end) {
          return isWithinInterval(txDate, { 
            start: startOfDay(parseISO(customRange.start)), 
            end: endOfDay(parseISO(customRange.end)) 
          });
        }
      } catch {
        return true;
      }

      return true;
    });
  }, [transactions, searchQuery, periodFilter, typeFilter, paymentModeFilter, categoryFilter, customRange]);

  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredTransactions]);

  const visibleTransactions = useMemo(() => {
    return sortedTransactions.slice(0, displayLimit);
  }, [sortedTransactions, displayLimit]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayLimit < sortedTransactions.length) {
          setDisplayLimit((prev) => Math.min(prev + PAGE_SIZE, sortedTransactions.length));
        }
      },
      { threshold: 0.1, rootMargin: '300px' }
    );

    const target = loadMoreSentinelRef.current;
    if (target) observer.observe(target);
    return () => {
      if (target) observer.unobserve(target);
    };
  }, [displayLimit, sortedTransactions.length]);

  const filteredStats = useMemo(() => {
    const totalCredit = filteredTransactions
      .filter((t) => t.type === 'Credit')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalDebit = filteredTransactions
      .filter((t) => t.type === 'Debit')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    return { totalCredit, totalDebit };
  }, [filteredTransactions]);

  const selectedTransactions = useMemo(() => {
    return transactions.filter((t) => selectedIds.has(t.id));
  }, [transactions, selectedIds]);

  const selectedDebitTotal = useMemo(() => {
    return selectedTransactions
      .filter((t) => t.type === 'Debit')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [selectedTransactions]);

  const selectedCreditTotal = useMemo(() => {
    return selectedTransactions
      .filter((t) => t.type === 'Credit')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [selectedTransactions]);

  const allVisibleSelected = sortedTransactions.length > 0 && sortedTransactions.every((t) => selectedIds.has(t.id));

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedTransactions.map((t) => t.id)));
    }
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
  };

  const executeBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);

    try {
      const idsToDelete: string[] = Array.from(selectedIds);
      await deleteTransactionsWithRecalculation(idsToDelete);
      
      markSyncPending();
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      
      if (showToast) {
        showToast(`Deleted ${idsToDelete.length} transaction${idsToDelete.length > 1 ? 's' : ''} successfully`, 'success');
      }
      onAdd();
    } catch (err) {
      console.error('Bulk delete error:', err);
      if (showToast) {
        showToast('Failed to delete transactions. Please try again.', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async (id: string) => {
    try {
      await deleteTransactionsWithRecalculation([id]);
      markSyncPending();
      closeTransactionForm();
      if (showToast) {
        showToast('Transaction deleted successfully', 'success');
      }
      onAdd();
    } catch (err) {
      console.error('Delete transaction error:', err);
      if (showToast) {
        showToast('Failed to delete transaction', 'error');
      }
    }
  };

  const closeTransactionForm = () => {
    setShowAdd(false);
    setEditingTransaction(null);
    if (onAddModalClosed) {
      onAddModalClosed();
    }
  };

  useBackHandler(() => {
    if (isDeleting) return true;
    setShowBulkDeleteConfirm(false);
    return true;
  }, showBulkDeleteConfirm, 60);

  useBackHandler(() => {
    closeTransactionForm();
    return true;
  }, showAdd || !!editingTransaction, 50);

  useBackHandler(() => {
    setSelectedIds(new Set());
    return true;
  }, selectedIds.size > 0, 40);

  const handleTransactionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = editingTransaction?.date.split('T')[1] || format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const tx: Transaction = {
      id: editingTransaction?.id || crypto.randomUUID(),
      date: fullDate,
      type: formData.get('type') as any,
      category: formData.get('category') as string,
      amount: Number(formData.get('amount')),
      payment_type: formData.get('payment_type') as any,
      description: formData.get('description') as string,
      reference: formData.get('reference') as string,
      order_id: editingTransaction?.order_id,
      synced: false
    };

    if (editingTransaction) {
      await db.transactions.put(tx);
    } else {
      await db.transactions.add(tx);
    }

    await reconcileOrdersWithTransactions();
    markSyncPending();
    closeTransactionForm();
    onAdd();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-4 sm:space-y-5"
    >
      {/* Top Search & Action Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            id="transaction-search-input"
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search category, note, ref, amount..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {sortedTransactions.length > 0 && (
          <button
            id="toggle-multi-select-btn"
            onClick={() => {
              if (selectedIds.size > 0) {
                cancelSelection();
              } else {
                toggleSelectAll();
              }
            }}
            title={selectedIds.size > 0 ? 'Clear Selection' : 'Select All Filtered Transactions'}
            className={`p-3.5 rounded-2xl border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
              selectedIds.size > 0 
                ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-lg shadow-orange-500/20' 
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
            }`}
          >
            <ListChecks className="w-5 h-5" />
          </button>
        )}

        <button 
          id="add-transaction-open-btn"
          onClick={() => {
            setEditingTransaction(null);
            setShowAdd(true);
          }}
          className="bg-orange-500 hover:bg-orange-600 p-3.5 rounded-2xl text-white shadow-lg shadow-orange-500/20 active:scale-95 transition-all shrink-0 flex items-center gap-1.5 font-bold text-sm cursor-pointer"
          title="Add Transaction"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Add Entry</span>
        </button>
      </div>

      {/* Filter Chips Toolbar */}
      <div className="space-y-2.5 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3">
        {/* Period Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {(['All', 'This Month', 'Last Month', 'Last 30 Days', 'This Year', 'Today', 'Custom'] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setPeriodFilter(period)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all text-xs cursor-pointer ${
                periodFilter === period
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {period}
            </button>
          ))}
        </div>

        {/* Custom Date Range Picker */}
        {periodFilter === 'Custom' && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase font-bold mb-1">From Date</label>
              <input
                type="date"
                value={customRange.start}
                onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase font-bold mb-1">To Date</label>
              <input
                type="date"
                value={customRange.end}
                onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>
        )}

        {/* Type & Payment Mode Sub-Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/60 text-xs">
          {/* Type Filter */}
          <div className="flex items-center gap-1">
            {(['All', 'Credit', 'Debit'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
                  typeFilter === t
                    ? t === 'Credit'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : t === 'Debit'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-zinc-700 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t === 'All' ? 'All Types' : t === 'Credit' ? '+ Income' : '- Expense'}
              </button>
            ))}
          </div>

          {/* Payment Mode Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Mode:</span>
            <select
              value={paymentModeFilter}
              onChange={(e) => setPaymentModeFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] rounded-lg px-2 py-1 focus:outline-none"
            >
              <option value="All">All Modes</option>
              {paymentModes.map((p: string) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Category Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-zinc-500">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] rounded-lg px-2 py-1 focus:outline-none max-w-[130px] truncate"
            >
              <option value="All">All Categories</option>
              {expenseCategories.map((c: string) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Dataset Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span>
            Showing <strong className="text-zinc-200">{visibleTransactions.length}</strong> of{' '}
            <strong className="text-zinc-200">{sortedTransactions.length}</strong> transactions
          </span>
          {sortedTransactions.length !== transactions.length && (
            <span className="text-[11px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md">
              (Filtered from {transactions.length} total)
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          {filteredStats.totalCredit > 0 && (
            <span className="text-green-400 font-bold">
              +₹{filteredStats.totalCredit.toLocaleString('en-IN')}
            </span>
          )}
          {filteredStats.totalDebit > 0 && (
            <span className="text-red-400 font-bold">
              -₹{filteredStats.totalDebit.toLocaleString('en-IN')}
            </span>
          )}
        </div>
      </div>

      {/* Multi-Select Action Toolbar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            className="p-3 rounded-2xl bg-zinc-900 border border-orange-500/40 shadow-xl space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="font-bold text-xs text-white">
                  {selectedIds.size} Selected
                </span>
                <span className="text-zinc-500 text-[11px]">
                  (of {sortedTransactions.length})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="select-all-filtered-btn"
                  onClick={toggleSelectAll}
                  className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {allVisibleSelected ? 'Deselect All' : 'Select All'}
                </button>
                <button
                  id="bulk-delete-open-btn"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="px-3 py-1 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition-all shadow-sm shadow-red-500/20 flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete ({selectedIds.size})</span>
                </button>
                <button
                  id="cancel-selection-btn"
                  onClick={cancelSelection}
                  className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Selection Breakdown */}
            <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
              <span>Selected totals:</span>
              {selectedCreditTotal > 0 && (
                <span className="text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-md border border-green-500/20">
                  Credit: +₹{selectedCreditTotal.toLocaleString('en-IN')}
                </span>
              )}
              {selectedDebitTotal > 0 && (
                <span className="text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20">
                  Debit: -₹{selectedDebitTotal.toLocaleString('en-IN')}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transactions List */}
      <div className="space-y-3">
        {visibleTransactions.map((tx) => (
          <TransactionCard
            key={tx.id}
            tx={tx}
            isSelected={selectedIds.has(tx.id)}
            onToggleSelect={toggleSelect}
            onEdit={(t) => {
              setEditingTransaction(t);
              setShowAdd(false);
            }}
            showToast={showToast}
          />
        ))}

        {displayLimit < sortedTransactions.length && (
          <div className="pt-3 pb-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setDisplayLimit((prev) => Math.min(prev + PAGE_SIZE, sortedTransactions.length))}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Load More (+{Math.min(PAGE_SIZE, sortedTransactions.length - displayLimit)} remaining)</span>
            </button>
            <button
              type="button"
              onClick={() => setDisplayLimit(sortedTransactions.length)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
            >
              Show All ({sortedTransactions.length})
            </button>
          </div>
        )}

        <div ref={loadMoreSentinelRef} className="h-4" />

        {sortedTransactions.length === 0 && (
          <div className="text-center py-16 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-[32px]">
            <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <RefreshCw className="text-zinc-600 w-7 h-7" />
            </div>
            <p className="text-zinc-400 font-medium text-sm">No transactions match your criteria</p>
            <p className="text-zinc-600 text-xs mt-1">Try clearing your search or date filter</p>
          </div>
        )}
      </div>

      {/* Bulk Delete Confirmation Modal */}
      <BulkDeleteConfirmModal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        selectedCount={selectedIds.size}
        selectedDebitTotal={selectedDebitTotal}
        selectedCreditTotal={selectedCreditTotal}
        isDeleting={isDeleting}
        onConfirm={executeBulkDelete}
      />

      {/* Add / Edit Modal */}
      <AddEditTransactionModal
        isOpen={showAdd || !!editingTransaction}
        onClose={closeTransactionForm}
        editingTransaction={editingTransaction}
        expenseCategories={expenseCategories}
        paymentModes={paymentModes}
        onSubmit={handleTransactionSubmit}
        onDeleteSingle={handleDeleteSingle}
      />
    </motion.div>
  );
}
