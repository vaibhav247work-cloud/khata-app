import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { PAYMENT_TYPES } from '../../constants';
import type { Order } from '../../types';

interface OrderSettleModalProps {
  isOpen: boolean;
  selectedOrders: Order[];
  isBulkProcessing: boolean;
  createTxForSettle: boolean;
  setCreateTxForSettle: (val: boolean) => void;
  settlePaymentMode: string;
  setSettlePaymentMode: (val: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function OrderSettleModal({
  isOpen,
  selectedOrders,
  isBulkProcessing,
  createTxForSettle,
  setCreateTxForSettle,
  settlePaymentMode,
  setSettlePaymentMode,
  onClose,
  onConfirm
}: OrderSettleModalProps) {
  const selectedPendingOrders = selectedOrders.filter(o => o.remaining_amount > 0);
  const totalPendingSettleAmount = selectedOrders.reduce((sum, o) => sum + (Number(o.remaining_amount) || 0), 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !isBulkProcessing && onClose()}
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 rounded-[32px] p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-5"
          >
            <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-500 flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-xl font-bold text-white">Complete & Settle {selectedOrders.length} Orders?</h3>
              <p className="text-xs text-zinc-400">
                Mark selected orders as 100% completed. Outstanding balances will be cleared.
              </p>
            </div>

            {/* Summary List of Selected Orders */}
            <div className="bg-zinc-800/40 border border-zinc-800 rounded-2xl p-3.5 max-h-48 overflow-y-auto space-y-2 text-xs">
              {selectedOrders.map(o => (
                <div key={o.order_id} className="flex justify-between items-center bg-zinc-800/60 p-2 rounded-xl">
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-zinc-200 truncate">{o.supplier}</p>
                    <p className="text-[10px] text-zinc-500">{format(new Date(o.date), 'dd MMM yyyy')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-white">₹{o.total_amount.toLocaleString()}</p>
                    {o.remaining_amount > 0 ? (
                      <p className="text-[10px] text-orange-400 font-medium">Bal: ₹{o.remaining_amount.toLocaleString()}</p>
                    ) : (
                      <p className="text-[10px] text-green-400 font-medium">Paid in Full</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Total balance to clear */}
            {totalPendingSettleAmount > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3 text-xs flex justify-between items-center">
                <span className="text-orange-400 font-medium">Unpaid Balance to Clear:</span>
                <span className="text-orange-400 font-bold text-sm">₹{totalPendingSettleAmount.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Option to create matching ledger expense transactions */}
            {selectedPendingOrders.length > 0 && (
              <div className="space-y-3 bg-zinc-800/30 border border-zinc-800 rounded-2xl p-4">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createTxForSettle}
                    onChange={(e) => setCreateTxForSettle(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-orange-500 focus:ring-orange-500 bg-zinc-800 border-zinc-700"
                  />
                  <div>
                    <p className="text-xs font-bold text-zinc-200">Record in Transactions Ledger (Recommended)</p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Automatically creates debit expense entries so your cash balance stays balanced.
                    </p>
                  </div>
                </label>

                {createTxForSettle && (
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Settlement Payment Mode</label>
                    <select
                      value={settlePaymentMode}
                      onChange={(e) => setSettlePaymentMode(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 text-white text-xs rounded-xl px-3 py-2"
                    >
                      {PAYMENT_TYPES.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                disabled={isBulkProcessing}
                onClick={onClose}
                className="flex-1 py-3.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isBulkProcessing}
                onClick={onConfirm}
                className="flex-1 py-3.5 px-4 rounded-2xl bg-green-600 hover:bg-green-700 active:scale-98 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-600/20 disabled:opacity-60"
              >
                {isBulkProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Settling...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirm Settle
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
