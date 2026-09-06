import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';

interface AdminClearConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function AdminClearConfirmModal({
  isOpen,
  onClose,
  onConfirm
}: AdminClearConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] max-w-sm w-full text-center"
          >
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-2">Delete All Data?</h3>
            <p className="text-zinc-500 text-sm mb-8">This action cannot be undone. All your local transactions and orders will be permanently deleted.</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm">Cancel</button>
              <button onClick={onConfirm} className="flex-1 bg-red-500 py-4 rounded-2xl font-bold text-sm">Delete</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
