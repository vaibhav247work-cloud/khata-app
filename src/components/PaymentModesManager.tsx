import React, { useState, useMemo } from 'react';
import { CreditCard, Plus, Pencil, Trash2, Check, X, RotateCcw, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, type Transaction, type OrderPayment } from '../db';
import { DEFAULT_PAYMENT_MODES } from '../utils/categoriesAndModes';

interface PaymentModesManagerProps {
  paymentModes: string[];
  onUpdatePaymentModes: (newModes: string[]) => void;
  transactions: Transaction[];
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  markSyncPending?: () => void;
  onRefreshData?: () => void;
}

export function PaymentModesManager({
  paymentModes,
  onUpdatePaymentModes,
  transactions,
  showToast,
  markSyncPending,
  onRefreshData
}: PaymentModesManagerProps) {
  const [newModeName, setNewModeName] = useState('');
  const [editingMode, setEditingMode] = useState<{ oldName: string; currentName: string } | null>(null);
  const [modeToDelete, setModeToDelete] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Usage count across transactions
  const modeUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.payment_type) {
        counts[tx.payment_type] = (counts[tx.payment_type] || 0) + 1;
      }
    }
    return counts;
  }, [transactions]);

  const handleAddMode = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newModeName.trim();
    if (!trimmed) {
      showToast('Payment mode name cannot be empty', 'error');
      return;
    }

    const exists = paymentModes.some(m => m.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      showToast(`Payment mode "${trimmed}" already exists`, 'error');
      return;
    }

    const updated = [...paymentModes, trimmed];
    onUpdatePaymentModes(updated);
    setNewModeName('');
    showToast(`Added payment mode "${trimmed}"`, 'success');
  };

  const handleStartEdit = (mode: string) => {
    setEditingMode({ oldName: mode, currentName: mode });
  };

  const handleSaveEdit = async () => {
    if (!editingMode) return;
    const trimmed = editingMode.currentName.trim();
    const oldName = editingMode.oldName;

    if (!trimmed) {
      showToast('Payment mode name cannot be empty', 'error');
      return;
    }

    if (trimmed.toLowerCase() === oldName.toLowerCase()) {
      setEditingMode(null);
      return;
    }

    const exists = paymentModes.some(
      m => m.toLowerCase() === trimmed.toLowerCase() && m.toLowerCase() !== oldName.toLowerCase()
    );
    if (exists) {
      showToast(`Payment mode "${trimmed}" already exists`, 'error');
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Update modes list
      const updated = paymentModes.map(m => (m === oldName ? trimmed : m));
      onUpdatePaymentModes(updated);

      // 2. Update existing transactions & order payments in local database
      const usedCount = modeUsageCounts[oldName] || 0;
      if (usedCount > 0) {
        await db.transactions
          .where('payment_type')
          .equals(oldName)
          .modify({ payment_type: trimmed, synced: false });

        await db.orderPayments
          .where('payment_type')
          .equals(oldName)
          .modify({ payment_type: trimmed, synced: false });

        markSyncPending?.();
        onRefreshData?.();
      }

      setEditingMode(null);
      showToast(
        usedCount > 0
          ? `Updated "${oldName}" to "${trimmed}" (and updated ${usedCount} transaction${usedCount > 1 ? 's' : ''})`
          : `Updated payment mode to "${trimmed}"`,
        'success'
      );
    } catch (err) {
      console.error('Error renaming payment mode:', err);
      showToast('Failed to update payment mode', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!modeToDelete) return;
    const modeName = modeToDelete;
    const updated = paymentModes.filter(m => m !== modeName);
    onUpdatePaymentModes(updated);
    setModeToDelete(null);
    showToast(`Deleted payment mode "${modeName}"`, 'success');
  };

  const handleResetDefaults = () => {
    onUpdatePaymentModes(DEFAULT_PAYMENT_MODES);
    showToast('Payment modes reset to defaults', 'success');
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-[36px] p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-white">Payment Modes</h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {paymentModes.length}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Modes available in transactions, order payments, and filters
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetDefaults}
          className="text-xs font-semibold text-zinc-400 hover:text-emerald-400 flex items-center gap-1.5 transition-colors self-start sm:self-center px-3 py-1.5 rounded-xl hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700"
          title="Reset to default payment modes"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Defaults</span>
        </button>
      </div>

      {/* Add Mode Form */}
      <form onSubmit={handleAddMode} className="flex gap-2">
        <input
          type="text"
          value={newModeName}
          onChange={(e) => setNewModeName(e.target.value)}
          placeholder="New payment mode (e.g. RTGS, Cheque, Forex)..."
          className="flex-1 bg-zinc-800/60 border border-zinc-700/60 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60 transition-all"
        />
        <button
          type="submit"
          className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-sm px-5 py-3 rounded-2xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Mode</span>
          <span className="sm:hidden">Add</span>
        </button>
      </form>

      {/* Payment Modes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
        {paymentModes.map((mode) => {
          const isEditing = editingMode?.oldName === mode;
          const usageCount = modeUsageCounts[mode] || 0;

          if (isEditing) {
            return (
              <div
                key={mode}
                className="col-span-1 sm:col-span-2 flex items-center gap-2 p-2 bg-zinc-800 border border-emerald-500/50 rounded-2xl"
              >
                <input
                  type="text"
                  value={editingMode.currentName}
                  onChange={(e) =>
                    setEditingMode({ ...editingMode, currentName: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      setEditingMode(null);
                    }
                  }}
                  autoFocus
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isProcessing}
                  className="p-2 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white transition-all disabled:opacity-50"
                  title="Save mode name"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingMode(null)}
                  className="p-2 rounded-xl bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-all"
                  title="Cancel edit"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          }

          return (
            <div
              key={mode}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-800/40 hover:bg-zinc-800/70 border border-zinc-750/50 transition-all group"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-sm font-semibold text-zinc-200 truncate">{mode}</span>
                {usageCount > 0 && (
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 shrink-0"
                    title={`${usageCount} transaction${usageCount > 1 ? 's' : ''} recorded with this mode`}
                  >
                    {usageCount} {usageCount === 1 ? 'entry' : 'entries'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleStartEdit(mode)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  title={`Edit "${mode}"`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setModeToDelete(mode)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title={`Delete "${mode}"`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {paymentModes.length === 0 && (
          <div className="col-span-1 sm:col-span-2 py-8 text-center text-zinc-500 text-xs">
            No payment modes configured.
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {modeToDelete && (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={() => setModeToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-zinc-800 p-6 sm:p-7 rounded-[32px] max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div className="text-center space-y-2">
                <h4 className="text-lg font-bold text-white">Delete Payment Mode?</h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Are you sure you want to remove <strong className="text-white">"{modeToDelete}"</strong>?
                  {(modeUsageCounts[modeToDelete] || 0) > 0 && (
                    <span className="block text-amber-400 mt-2 font-medium">
                      Note: {modeUsageCounts[modeToDelete]} existing transaction(s) use this mode.
                      Their records will remain intact, but this mode won't be selectable for new entries.
                    </span>
                  )}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModeToDelete(null)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl font-bold text-xs text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 py-3 rounded-xl font-bold text-xs text-white transition-colors shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
