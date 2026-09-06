import { motion, AnimatePresence } from 'motion/react';

interface OrderDeleteModalProps {
  orderIdToDelete: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function OrderDeleteModal({
  orderIdToDelete,
  onClose,
  onConfirm
}: OrderDeleteModalProps) {
  return (
    <AnimatePresence>
      {orderIdToDelete && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-bold text-white">Delete Order?</h3>
            <p className="text-xs text-zinc-400">
              Are you sure you want to delete this order? It will be permanently removed.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-xl font-bold text-xs text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="flex-1 bg-red-500 hover:bg-red-600 py-3 rounded-xl font-bold text-xs text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
