import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, RefreshCw } from 'lucide-react';

interface BulkDeleteModalProps {
  isOpen: boolean;
  isDeleting: boolean;
  selectedCount: number;
  selectedDebitTotal: number;
  selectedCreditTotal: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function BulkDeleteModal({
  isOpen,
  isDeleting,
  selectedCount,
  selectedDebitTotal,
  selectedCreditTotal,
  onClose,
  onConfirm
}: BulkDeleteModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !isDeleting && onClose()}
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6"
          >
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-white">
                Delete {selectedCount} Transaction{selectedCount > 1 ? 's' : ''}?
              </h3>
              <p className="text-xs sm:text-sm text-zinc-400">
                Are you sure you want to permanently delete the selected entries? This will clean up your local records and update your ledger balance.
              </p>
            </div>

            {/* Breakdown */}
            <div className="bg-zinc-800/50 border border-zinc-700/40 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Selected Records:</span>
                <span className="font-bold text-white">{selectedCount}</span>
              </div>
              {selectedDebitTotal > 0 && (
                <div className="flex justify-between text-red-400">
                  <span>Total Expense (Debit):</span>
                  <span className="font-bold">-₹{selectedDebitTotal.toLocaleString('en-IN')}</span>
                </div>
              )}
              {selectedCreditTotal > 0 && (
                <div className="flex justify-between text-green-400">
                  <span>Total Income (Credit):</span>
                  <span className="font-bold">+₹{selectedCreditTotal.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                id="cancel-bulk-delete-btn"
                type="button"
                disabled={isDeleting}
                onClick={onClose}
                className="flex-1 py-3.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                id="confirm-bulk-delete-btn"
                type="button"
                disabled={isDeleting}
                onClick={onConfirm}
                className="flex-1 py-3.5 px-4 rounded-2xl bg-red-500 hover:bg-red-600 active:scale-98 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
