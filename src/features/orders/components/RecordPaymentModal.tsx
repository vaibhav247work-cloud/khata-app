import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { type Order } from '../../../db';
import { OrderHistorySection } from '../../../components/OrderHistorySection';

interface RecordPaymentModalProps {
  order: Order | null;
  paymentModes: string[];
  isAdmin: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onPaymentDeleted: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function RecordPaymentModal({
  order,
  paymentModes,
  isAdmin,
  onClose,
  onSubmit,
  onPaymentDeleted,
  showToast,
}: RecordPaymentModalProps) {
  if (!order) return null;

  const getItemSummary = (items: any[]) => {
    if (!items || items.length === 0) return 'items';
    return items.map(i => `${i.material}${i.quantity ? ` (${i.quantity})` : ''}`).join(', ');
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div 
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          onClick={(e) => e.stopPropagation()}
          className="bg-zinc-900 w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[85vh] pb-32 sm:pb-8"
        >
          <h2 className="text-2xl font-bold mb-2">Make Payment</h2>
          <p className="text-zinc-500 text-sm mb-6">Paying for {getItemSummary(order.items || [])} to {order.supplier}</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-zinc-500 uppercase">Amount (Max: ₹{order.remaining_amount.toLocaleString('en-IN')})</label>
                <button
                  type="button"
                  onClick={(e) => {
                    const input = (e.currentTarget.closest('form')?.querySelector('input[name="amount"]') as HTMLInputElement);
                    if (input) input.value = String(order.remaining_amount);
                  }}
                  className="text-[11px] font-bold text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
                >
                  Fill Full Balance (₹{order.remaining_amount.toLocaleString('en-IN')})
                </button>
              </div>
              <input 
                name="amount" 
                type="number" 
                inputMode="decimal"
                defaultValue={order.remaining_amount}
                max={order.remaining_amount} 
                placeholder="0.00" 
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-xl font-bold text-white no-spinner focus:outline-none focus:ring-2 focus:ring-orange-500" 
                required 
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Payment Mode</label>
                <select name="payment_type" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {paymentModes.map((p: string) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Date</label>
                <input name="date" type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500" required />
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-4 rounded-2xl font-bold text-sm text-zinc-300 transition-colors cursor-pointer">Cancel</button>
              <button type="submit" className="flex-1 bg-green-600 hover:bg-green-500 py-4 rounded-2xl font-bold text-sm text-white shadow-lg shadow-green-600/20 transition-all cursor-pointer">Confirm Payment</button>
            </div>
          </form>

          {/* Chronological Payment Records & Status History inside Payment Modal */}
          <div className="mt-6 pt-6 border-t border-zinc-800">
            <OrderHistorySection 
              order={order} 
              isAdmin={isAdmin}
              onPaymentDeleted={onPaymentDeleted}
              showToast={showToast}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
