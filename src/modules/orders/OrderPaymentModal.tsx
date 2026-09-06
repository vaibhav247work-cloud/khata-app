import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { PAYMENT_TYPES } from '../../constants';
import type { Order } from '../../types';

interface OrderPaymentModalProps {
  order: Order | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function OrderPaymentModal({
  order,
  onClose,
  onSubmit
}: OrderPaymentModalProps) {
  return (
    <AnimatePresence>
      {order && (
        <div 
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl pb-32 sm:pb-8"
          >
            <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-8" />
            <h2 className="text-2xl font-bold mb-2">Record Payment</h2>
            <p className="text-zinc-500 text-sm mb-6">Payment for {order.supplier} (Remaining: ₹{order.remaining_amount.toLocaleString()})</p>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Payment Amount</label>
                <input 
                  name="amount" 
                  type="number" 
                  defaultValue={order.remaining_amount} 
                  max={order.remaining_amount} 
                  inputMode="decimal"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm no-spinner text-white" 
                  required 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Mode</label>
                  <select name="payment_type" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white">
                    {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Date</label>
                  <input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Description</label>
                <input name="description" type="text" defaultValue={`Payment done for ${order.supplier}`} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm text-zinc-300">Cancel</button>
                <button type="submit" className="flex-1 bg-orange-500 py-4 rounded-2xl font-bold text-sm text-white shadow-lg shadow-orange-500/20">Record Payment</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
