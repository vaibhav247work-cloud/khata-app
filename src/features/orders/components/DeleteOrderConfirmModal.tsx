import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { type Order } from '../../../db';

interface DeleteOrderConfirmModalProps {
  orderToDelete: Order | null;
  onClose: () => void;
  onConfirm: (order: Order) => void;
}

export function DeleteOrderConfirmModal({
  orderToDelete,
  onClose,
  onConfirm,
}: DeleteOrderConfirmModalProps) {
  if (!orderToDelete) return null;

  return (
    <AnimatePresence>
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
          <h3 className="text-xl font-bold mb-2 text-white">Delete Order?</h3>
          <p className="text-zinc-500 text-sm mb-8">
            {orderToDelete.paid_amount > 0 
              ? "This will permanently remove the order and all its payment history. This action cannot be undone."
              : "Are you sure you want to remove this order? This action cannot be undone."}
          </p>
          <div className="flex gap-3">
            <button 
              type="button"
              onClick={onClose} 
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-4 rounded-2xl font-bold text-sm cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button 
              type="button"
              onClick={() => onConfirm(orderToDelete)} 
              className="flex-1 bg-red-500 hover:bg-red-600 text-white py-4 rounded-2xl font-bold text-sm cursor-pointer transition-colors"
            >
              Delete
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
