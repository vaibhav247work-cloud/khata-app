import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCheck, X, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { type Order } from '../../../db';

interface SettleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOrders: Order[];
  ordersWithPendingBalance: Order[];
  settlePaymentType: string;
  setSettlePaymentType: (val: string) => void;
  settleDate: string;
  setSettleDate: (val: string) => void;
  isSettling: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  paymentModes: string[];
}

export function SettleModal({
  isOpen,
  onClose,
  selectedOrders,
  ordersWithPendingBalance,
  settlePaymentType,
  setSettlePaymentType,
  settleDate,
  setSettleDate,
  isSettling,
  onSubmit,
  paymentModes,
}: SettleModalProps) {
  if (!isOpen) return null;

  const getItemSummary = (items: any[]) => {
    if (!items || items.length === 0) return 'No items recorded';
    return items.map(i => `${i.material}${i.quantity ? ` (${i.quantity})` : ''}`).join(', ');
  };

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[105] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div 
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-zinc-900 w-full max-w-2xl rounded-t-[36px] sm:rounded-[36px] p-6 sm:p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col pb-28 sm:pb-8"
        >
          {/* Modal Header */}
          <div className="flex items-start justify-between gap-4 mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-400">
                <CheckCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Settle & Mark Orders Completed</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Review pending balances and confirm payments to mark all {selectedOrders.length} selected order(s) as Completed.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Order Rows with Details */}
          <div className="overflow-y-auto flex-1 pr-1 space-y-2.5 my-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 px-1 flex items-center justify-between">
              <span>Selected Orders ({selectedOrders.length})</span>
              <span>Pending Balances</span>
            </div>

            {selectedOrders.map((order: Order, index: number) => {
              const hasBalance = Number(order.remaining_amount) > 0;
              return (
                <div 
                  key={order.order_id} 
                  className="bg-zinc-800/40 border border-zinc-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-zinc-750 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm truncate">{order.supplier}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                          order.status === 'Completed' ? 'bg-green-500/10 text-green-400' :
                          order.status === 'Partial' ? 'bg-orange-500/10 text-orange-400' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">
                        {getItemSummary(order.items || [])} • {format(parseISO(order.date), 'dd MMM yyyy')}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1">
                        <span>Total: <strong className="text-zinc-300 font-semibold">₹{Number(order.total_amount).toLocaleString('en-IN')}</strong></span>
                        <span>•</span>
                        <span>Paid: <strong className="text-green-400 font-semibold">₹{Number(order.paid_amount).toLocaleString('en-IN')}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right sm:text-right shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-800/60 flex sm:flex-col justify-between sm:justify-center items-center sm:items-end">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold sm:mb-0.5">Balance To Pay</span>
                    <span className={`text-base font-bold ${hasBalance ? 'text-red-400' : 'text-green-400'}`}>
                      ₹{Number(order.remaining_amount).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total Balance Summary Box */}
          <div className="bg-zinc-800/70 border border-zinc-700/60 rounded-2xl p-4 my-2 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">Total Balance To Settle</span>
                <span className="text-xs text-zinc-500">
                  {ordersWithPendingBalance.length} order(s) require payment entries
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-orange-400">
                  ₹{ordersWithPendingBalance.reduce((sum, o) => sum + Number(o.remaining_amount), 0).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Details Form */}
          <form onSubmit={onSubmit} className="space-y-4 shrink-0 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5">Payment Mode for Entries</label>
                <select 
                  value={settlePaymentType}
                  onChange={(e) => setSettlePaymentType(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {paymentModes.map((p: string) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1.5">Payment Date</label>
                <input 
                  type="date" 
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required 
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button" 
                onClick={onClose}
                disabled={isSettling}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3.5 rounded-2xl font-bold text-sm text-zinc-300 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSettling}
                className="flex-[1.5] bg-green-600 hover:bg-green-500 active:scale-95 py-3.5 rounded-2xl font-bold text-sm text-white shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSettling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Recording Payments...</span>
                  </>
                ) : (
                  <>
                    <CheckCheck className="w-4 h-4" />
                    <span>Confirm & Complete All ({selectedOrders.length})</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
