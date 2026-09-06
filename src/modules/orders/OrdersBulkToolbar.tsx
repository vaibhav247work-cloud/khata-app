import { motion } from 'motion/react';
import { 
  Printer, 
  CheckSquare, 
  Square, 
  CheckCircle, 
  X 
} from 'lucide-react';

interface OrdersBulkToolbarProps {
  selectedCount: number;
  allFilteredSelected: boolean;
  onToggleSelectAll: () => void;
  onBulkPrint: () => void;
  onBulkComplete: () => void;
  onCancelSelection: () => void;
}

export function OrdersBulkToolbar({
  selectedCount,
  allFilteredSelected,
  onToggleSelectAll,
  onBulkPrint,
  onBulkComplete,
  onCancelSelection
}: OrdersBulkToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="bg-zinc-900 border border-orange-500/40 rounded-2xl p-3 shadow-xl flex flex-wrap items-center justify-between gap-2"
    >
      <div className="flex items-center gap-2">
        <button
          id="select-all-orders-btn"
          type="button"
          onClick={onToggleSelectAll}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
        >
          {allFilteredSelected ? (
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

        <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-bold px-2.5 py-1 rounded-xl">
          {selectedCount} Selected
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Bulk Print Receipts Button */}
        <button
          id="bulk-print-receipts-btn"
          type="button"
          onClick={onBulkPrint}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-orange-500/20 text-zinc-300 hover:text-orange-400 border border-zinc-700/80 hover:border-orange-500/40 transition-all shadow-sm"
        >
          <Printer className="w-3.5 h-3.5" />
          Receipts
        </button>

        {/* Bulk Settle / Complete Button */}
        <button
          id="bulk-settle-orders-btn"
          type="button"
          onClick={onBulkComplete}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 active:scale-95 text-white transition-all shadow-md shadow-green-600/20"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          Complete / Settle
        </button>

        <button
          id="cancel-orders-selection-btn"
          type="button"
          onClick={onCancelSelection}
          className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
