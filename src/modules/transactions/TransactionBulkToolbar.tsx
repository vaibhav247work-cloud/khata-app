import { motion, AnimatePresence } from 'motion/react';
import { Trash2, CheckSquare, Square, X } from 'lucide-react';

interface TransactionBulkToolbarProps {
  selectedCount: number;
  allVisibleSelected: boolean;
  selectedDebitTotal: number;
  selectedCreditTotal: number;
  onToggleSelectAll: () => void;
  onBulkDelete: () => void;
  onCancelSelection: () => void;
}

export function TransactionBulkToolbar({
  selectedCount,
  allVisibleSelected,
  selectedDebitTotal,
  selectedCreditTotal,
  onToggleSelectAll,
  onBulkDelete,
  onCancelSelection,
}: TransactionBulkToolbarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="bg-zinc-900 border border-orange-500/40 rounded-2xl p-3 shadow-xl flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <button
              id="select-all-visible-btn"
              type="button"
              onClick={onToggleSelectAll}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
            >
              {allVisibleSelected ? (
                <>
                  <CheckSquare className="w-3.5 h-3.5 text-orange-500" />
                  Deselect All
                </>
              ) : (
                <>
                  <Square className="w-3.5 h-3.5 text-zinc-400" />
                  Select All
                </>
              )}
            </button>
            <span className="text-xs font-bold text-orange-400">
              {selectedCount} Selected
            </span>
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-zinc-400 pl-2 border-l border-zinc-800">
              {selectedDebitTotal > 0 && (
                <span className="text-red-400 font-medium">Debit: ₹{selectedDebitTotal.toLocaleString()}</span>
              )}
              {selectedCreditTotal > 0 && (
                <span className="text-green-400 font-medium">Credit: ₹{selectedCreditTotal.toLocaleString()}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="bulk-delete-btn"
              type="button"
              onClick={onBulkDelete}
              className="flex items-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/40 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete ({selectedCount})
            </button>
            <button
              id="cancel-multi-select-btn"
              type="button"
              onClick={onCancelSelection}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
              title="Cancel Selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
