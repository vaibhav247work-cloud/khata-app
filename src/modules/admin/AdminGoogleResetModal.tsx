import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';

interface AdminGoogleResetModalProps {
  isOpen: boolean;
  isResetting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function AdminGoogleResetModal({
  isOpen,
  isResetting,
  onClose,
  onConfirm
}: AdminGoogleResetModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => !isResetting && onClose()}
        >
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] max-w-sm w-full text-center"
          >
            <div className="w-16 h-16 bg-blue-500/10 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold mb-2">Clear Google Sheet Data?</h3>
            <p className="text-zinc-500 text-sm mb-8">
              This will delete all rows from your Google Sheets cloud backup and keep only the headers.
              Local phone data will stay safe, and you can sync it again later if needed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isResetting}
                className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={isResetting}
                className="flex-1 bg-blue-500 py-4 rounded-2xl font-bold text-sm disabled:opacity-50"
              >
                {isResetting ? 'Resetting...' : 'Reset Sheet'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
