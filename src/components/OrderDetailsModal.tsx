import React from 'react';
import { 
  X, 
  Printer, 
  Pencil, 
  Wallet, 
  Calendar, 
  Clock, 
  AlertTriangle, 
  Package, 
  FileText,
  CreditCard,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO, startOfDay, differenceInCalendarDays } from 'date-fns';
import { type Order, type OrderItem } from '../db';
import { OrderHistorySection } from './OrderHistorySection';
import { useBackHandler } from '../utils/backHandler';

interface OrderDetailsModalProps {
  order: Order | null;
  onClose: () => void;
  onMakePayment: (order: Order) => void;
  onEditOrder: (order: Order) => void;
  onPrintOrder: (order: Order) => void;
  onDeleteOrder?: (order: Order) => void;
  isAdmin?: boolean;
  onPaymentDeleted?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  isPrinting?: boolean;
  printingOrderId?: string | null;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({
  order,
  onClose,
  onMakePayment,
  onEditOrder,
  onPrintOrder,
  onDeleteOrder,
  isAdmin = false,
  onPaymentDeleted,
  showToast,
  isPrinting = false,
  printingOrderId = null,
}) => {
  // Register Android back gesture to close details modal with priority 48
  useBackHandler(() => {
    onClose();
    return true;
  }, !!order, 48);

  if (!order) return null;

  const now = startOfDay(new Date());
  let orderDateObj = new Date();
  try {
    orderDateObj = parseISO(order.date);
  } catch (e) {
    console.error(e);
  }

  const daysPending = differenceInCalendarDays(now, startOfDay(orderDateObj));
  const isOverdue = (order.status === 'Pending' || order.status === 'Partial') && daysPending > 7;
  const progressPct = Math.min(100, Math.round(((order.paid_amount || 0) / (order.total_amount || 1)) * 100));

  const formattedDate = (() => {
    try {
      return format(orderDateObj, 'dd MMM yyyy, hh:mm a');
    } catch {
      return order.date;
    }
  })();

  return (
    <div 
      className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 w-full max-w-2xl rounded-t-[36px] sm:rounded-[36px] p-5 sm:p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[90vh] pb-32 sm:pb-8 flex flex-col gap-6"
      >
        {/* Header Bar */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-800">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="text-xs font-mono text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded-lg border border-zinc-700/50">
                #{order.order_id.slice(0, 8)}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                order.status === 'Completed'
                  ? 'bg-green-500/10 text-green-400 border-green-500/20'
                  : order.status === 'Partial'
                  ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                  : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              }`}>
                {order.status}
              </span>
              {isOverdue && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 animate-pulse">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>{daysPending}d Overdue</span>
                </span>
              )}
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white truncate">
              {order.supplier}
            </h2>
            <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              <span>{formattedDate}</span>
              <span className="text-zinc-600">•</span>
              <span>{order.items?.length || 0} Material Item{(order.items?.length || 0) !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Top Quick Actions */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              id={`details-print-btn-${order.order_id}`}
              type="button"
              onClick={() => onPrintOrder(order)}
              disabled={isPrinting}
              className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-orange-400 border border-zinc-700/60 transition-colors disabled:opacity-50"
              title="Print / Share Receipt"
            >
              {isPrinting && printingOrderId === order.order_id ? (
                <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
            </button>
            <button
              id={`details-edit-btn-${order.order_id}`}
              type="button"
              onClick={() => {
                onClose();
                onEditOrder(order);
              }}
              className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-orange-400 border border-zinc-700/60 transition-colors"
              title="Edit Order"
            >
              <Pencil className="w-4 h-4" />
            </button>
            {onDeleteOrder && (
              <button
                id={`details-delete-btn-${order.order_id}`}
                type="button"
                onClick={() => {
                  onDeleteOrder(order);
                }}
                className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-700/60 transition-colors"
                title={isAdmin ? "Delete Order (Admin)" : ((order.paid_amount || 0) > 0 ? "Only Admin can delete orders with payments" : "Delete Order")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              id="details-close-btn"
              type="button"
              onClick={onClose}
              className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700/60 transition-colors"
              title="Close Details"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Financial Summary Cards */}
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-zinc-800/50 border border-zinc-800 rounded-2xl p-3.5">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">Total Value</span>
              <span className="text-base sm:text-lg font-bold text-white">
                ₹{order.total_amount.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="bg-zinc-800/50 border border-zinc-800 rounded-2xl p-3.5">
              <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">Amount Paid</span>
              <span className="text-base sm:text-lg font-bold text-green-500">
                ₹{order.paid_amount.toLocaleString('en-IN')}
              </span>
            </div>
            <div className={`border rounded-2xl p-3.5 ${
              isOverdue 
                ? 'bg-amber-950/20 border-amber-500/40' 
                : 'bg-zinc-800/50 border-zinc-800'
            }`}>
              <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1 flex items-center justify-between">
                <span>Balance Due</span>
                {isOverdue && <span className="text-amber-400 font-normal lowercase">(&gt;7d)</span>}
              </span>
              <span className={`text-base sm:text-lg font-bold ${isOverdue ? 'text-amber-400' : 'text-red-500'}`}>
                ₹{order.remaining_amount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-zinc-800/60 rounded-xl p-3 border border-zinc-800 flex items-center gap-3">
            <div className="flex-1 bg-zinc-800 h-2.5 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  order.status === 'Completed' ? 'bg-green-500' : 'bg-orange-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs font-bold text-zinc-300 shrink-0">
              {progressPct}% Paid
            </span>
          </div>
        </div>

        {/* Items / Materials Breakdown */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2.5 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-orange-500" />
            <span>Materials & Items Breakdown</span>
          </h4>
          <div className="bg-zinc-800/40 border border-zinc-800/80 rounded-2xl divide-y divide-zinc-800/60 overflow-hidden">
            {order.items && order.items.length > 0 ? (
              order.items.map((item: OrderItem, idx: number) => (
                <div key={item.id || idx} className="p-3 sm:p-3.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{item.material}</p>
                    {item.quantity && (
                      <p className="text-xs text-zinc-400">Qty: {item.quantity}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-white">
                      ₹{Number(item.amount).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-zinc-500">
                No individual items recorded
              </div>
            )}
          </div>
        </div>

        {/* NEW 'History' Section */}
        <div>
          <OrderHistorySection 
            order={order} 
            onMakePayment={order.status !== 'Completed' ? () => onMakePayment(order) : undefined}
            isAdmin={isAdmin}
            onPaymentDeleted={onPaymentDeleted}
            showToast={showToast}
          />
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-zinc-800 flex flex-col sm:flex-row gap-3">
          {order.status !== 'Completed' ? (
            <button
              id={`modal-make-payment-btn-${order.order_id}`}
              type="button"
              onClick={() => onMakePayment(order)}
              className="flex-1 py-3.5 px-4 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all"
            >
              <CreditCard className="w-4 h-4" />
              <span>Make Payment (₹{order.remaining_amount.toLocaleString('en-IN')})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPrintOrder(order)}
              className="flex-1 py-3.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all"
            >
              <Printer className="w-4 h-4 text-orange-400" />
              <span>Print Completed Receipt</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="py-3.5 px-6 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm transition-all"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
