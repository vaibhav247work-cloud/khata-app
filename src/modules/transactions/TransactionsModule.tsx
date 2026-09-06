import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  subDays,
  subMonths,
  startOfYear,
  endOfYear,
  isWithinInterval, 
  parseISO 
} from 'date-fns';
import type { Transaction } from '../../types';
import { TransactionCard } from './TransactionCard';
import { TransactionFilters } from './TransactionFilters';
import { TransactionFormModal } from './TransactionFormModal';
import { BulkDeleteModal } from './BulkDeleteModal';
import { TransactionBulkToolbar } from './TransactionBulkToolbar';
import { TransactionHeaderBar } from './TransactionHeaderBar';
import { 
  saveTransaction, 
  deleteSingleTransaction, 
  deleteBulkTransactions 
} from './transactionOperations';

interface TransactionsModuleProps {
  transactions: Transaction[];
  onAdd: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  markSyncPending: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  isAdmin?: boolean;
}

export function TransactionsModule({ 
  transactions, 
  onAdd, 
  searchQuery, 
  setSearchQuery, 
  markSyncPending, 
  showToast 
}: TransactionsModuleProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filter states
  const [periodFilter, setPeriodFilter] = useState<'All' | 'Today' | 'This Week' | 'This Month' | 'Last Month' | 'Last 30 Days' | 'This Year' | 'Custom'>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'Credit' | 'Debit'>('All');
  const [paymentModeFilter, setPaymentModeFilter] = useState<string>('All');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });

  // Progressive Lazy Loading State (Virtual Pagination)
  const PAGE_SIZE = 30;
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [searchQuery, periodFilter, typeFilter, paymentModeFilter, customRange]);

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    return transactions.filter(tx => {
      if (typeFilter !== 'All' && tx.type !== typeFilter) return false;
      if (paymentModeFilter !== 'All' && tx.payment_type !== paymentModeFilter) return false;

      if (periodFilter !== 'All') {
        try {
          const txDate = parseISO(tx.date);
          if (periodFilter === 'Today' && !isWithinInterval(txDate, { start: startOfDay(now), end: endOfDay(now) })) return false;
          if (periodFilter === 'This Week' && !isWithinInterval(txDate, { start: startOfWeek(now), end: endOfWeek(now) })) return false;
          if (periodFilter === 'This Month' && !isWithinInterval(txDate, { start: startOfMonth(now), end: endOfMonth(now) })) return false;
          if (periodFilter === 'Last Month') {
            const prevMonth = subMonths(now, 1);
            if (!isWithinInterval(txDate, { start: startOfMonth(prevMonth), end: endOfMonth(prevMonth) })) return false;
          }
          if (periodFilter === 'Last 30 Days' && !isWithinInterval(txDate, { start: startOfDay(subDays(now, 30)), end: endOfDay(now) })) return false;
          if (periodFilter === 'This Year' && !isWithinInterval(txDate, { start: startOfYear(now), end: endOfYear(now) })) return false;
          if (periodFilter === 'Custom' && customRange.start && customRange.end) {
            if (!isWithinInterval(txDate, { start: startOfDay(parseISO(customRange.start)), end: endOfDay(parseISO(customRange.end)) })) return false;
          }
        } catch {
          return true;
        }
      }
      return true;
    });
  }, [transactions, periodFilter, typeFilter, paymentModeFilter, customRange]);

  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredTransactions]);

  const visibleTransactions = useMemo(() => {
    return sortedTransactions.slice(0, displayLimit);
  }, [sortedTransactions, displayLimit]);

  const hasMore = displayLimit < sortedTransactions.length;

  useEffect(() => {
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayLimit(prev => Math.min(prev + PAGE_SIZE, sortedTransactions.length));
        }
      },
      { rootMargin: '200px' }
    );
    const el = loadMoreSentinelRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [hasMore, sortedTransactions.length]);

  const allVisibleSelected = visibleTransactions.length > 0 && visibleTransactions.every(tx => selectedIds.has(tx.id));

  const toggleSelectTx = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleTransactions.map(tx => tx.id)));
    }
  };

  const cancelSelection = () => setSelectedIds(new Set());

  const selectedDebitTotal = useMemo(() => {
    return transactions.filter(t => selectedIds.has(t.id) && t.type === 'Debit').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [transactions, selectedIds]);

  const selectedCreditTotal = useMemo(() => {
    return transactions.filter(t => selectedIds.has(t.id) && t.type === 'Credit').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }, [transactions, selectedIds]);

  const executeBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const count = await deleteBulkTransactions(selectedIds);
      markSyncPending();
      onAdd();
      showToast(`Successfully deleted ${count} transaction${count > 1 ? 's' : ''}`, 'success');
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
    } catch (err) {
      console.error('Bulk delete failed:', err);
      showToast('Failed to delete selected transactions', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async (id: string) => {
    try {
      await deleteSingleTransaction(id);
      markSyncPending();
      setEditingTransaction(null);
      onAdd();
      showToast('Transaction deleted', 'success');
    } catch (error) {
      console.error('Delete error:', error);
      showToast('Failed to delete transaction', 'error');
    }
  };

  const handleTransactionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await saveTransaction(new FormData(e.currentTarget), editingTransaction);
    showToast(result === 'updated' ? 'Transaction updated' : 'Transaction added', 'success');
    markSyncPending();
    setShowAdd(false);
    setEditingTransaction(null);
    onAdd();
  };

  const hasActiveFilters = periodFilter !== 'All' || typeFilter !== 'All' || paymentModeFilter !== 'All';

  const clearAllFilters = () => {
    setPeriodFilter('All');
    setTypeFilter('All');
    setPaymentModeFilter('All');
    setCustomRange({ start: '', end: '' });
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
      {/* Top Search & Actions Row */}
      <TransactionHeaderBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        hasVisibleTransactions={visibleTransactions.length > 0}
        selectedCount={selectedIds.size}
        onToggleMultiSelect={() => {
          if (selectedIds.size > 0) cancelSelection();
          else toggleSelectAll();
        }}
        onAddNewTransaction={() => { setEditingTransaction(null); setShowAdd(true); }}
      />

      {/* Advanced Filter Component */}
      <TransactionFilters
        periodFilter={periodFilter}
        setPeriodFilter={setPeriodFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        paymentModeFilter={paymentModeFilter}
        setPaymentModeFilter={setPaymentModeFilter}
        customRange={customRange}
        setCustomRange={setCustomRange}
        hasActiveFilters={hasActiveFilters}
        onClearAllFilters={clearAllFilters}
        filteredCount={sortedTransactions.length}
        totalCount={transactions.length}
      />

      {/* Multi-Select Action Toolbar */}
      <TransactionBulkToolbar
        selectedCount={selectedIds.size}
        allVisibleSelected={allVisibleSelected}
        selectedDebitTotal={selectedDebitTotal}
        selectedCreditTotal={selectedCreditTotal}
        onToggleSelectAll={toggleSelectAll}
        onBulkDelete={() => setShowBulkDeleteConfirm(true)}
        onCancelSelection={cancelSelection}
      />

      {/* Transactions List with Virtual Lazy Scroll */}
      <div className="space-y-3">
        {visibleTransactions.map(tx => (
          <TransactionCard
            key={tx.id}
            tx={tx}
            isSelected={selectedIds.has(tx.id)}
            onToggleSelect={toggleSelectTx}
            onEdit={(t) => { setEditingTransaction(t); setShowAdd(true); }}
          />
        ))}

        {hasMore && (
          <div ref={loadMoreSentinelRef} className="py-6 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-zinc-500">Loading more transactions...</span>
          </div>
        )}

        {sortedTransactions.length === 0 && (
          <div className="text-center py-12 text-zinc-500 bg-zinc-900/50 rounded-2xl border border-zinc-800 border-dashed">
            No transactions found
          </div>
        )}
      </div>

      {/* Transaction Form Modal */}
      <TransactionFormModal
        isOpen={showAdd || !!editingTransaction}
        editingTransaction={editingTransaction}
        onClose={() => { setShowAdd(false); setEditingTransaction(null); }}
        onSubmit={handleTransactionSubmit}
        onDeleteSingle={handleDeleteSingle}
      />

      {/* Bulk Delete Confirmation Modal */}
      <BulkDeleteModal
        isOpen={showBulkDeleteConfirm}
        selectedCount={selectedIds.size}
        selectedDebitTotal={selectedDebitTotal}
        selectedCreditTotal={selectedCreditTotal}
        isDeleting={isDeleting}
        onClose={() => !isDeleting && setShowBulkDeleteConfirm(false)}
        onConfirm={executeBulkDelete}
      />
    </motion.div>
  );
}
