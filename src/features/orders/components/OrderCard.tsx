import React from 'react';
import { motion } from 'motion/react';
import { 
  Check, 
  ChevronRight, 
  Clock, 
  History, 
  Share2, 
  Printer, 
  Pencil, 
  Trash2, 
  RefreshCw, 
  AlertTriangle 
} from 'lucide-react';
import { format, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';
import { type Order, type OrderItem } from '../../../db';
import { 
  shareToWhatsApp, 
  generateOrderWhatsAppReminder, 
  generateOrderWhatsAppReceipt 
} from '../../../utils/whatsappReminders';

interface OrderCardProps {
  key?: React.Key;
  order: Order;
  isSelected: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onViewDetails: (order: Order) => void;
  onPrint: (orders: Order[]) => void;
  onEdit: (order: Order) => void;
  onDelete: (order: Order) => void;
  onMakePayment: (order: Order) => void;
  isAdmin: boolean;
  isPrinting: boolean;
  printingOrderId: string | null;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function OrderCard({
  order,
  isSelected,
  onToggleSelect,
  onViewDetails,
  onPrint,
  onEdit,
  onDelete,
  onMakePayment,
  isAdmin,
  isPrinting,
  printingOrderId,
  showToast,
}: OrderCardProps) {
  const orderDateParsed = (() => {
    try {
      return parseISO(order.date);
    } catch {
      return new Date();
    }
  })();
  const daysPending = differenceInCalendarDays(startOfDay(new Date()), startOfDay(orderDateParsed));
  const isOverdue = (order.status === 'Pending' || order.status === 'Partial') && daysPending > 7;

  const getItemSummary = (items: OrderItem[]) => {
    if (!items || items.length === 0) return 'No items recorded';
    return items.map(i => `${i.material}${i.quantity ? ` (${i.quantity})` : ''}`).join(', ');
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2 }}
      className={`bg-zinc-900 border rounded-3xl p-4 sm:p-6 relative group transition-all overflow-hidden min-w-0 ${
        isSelected
          ? 'border-orange-500/60 shadow-lg shadow-orange-500/5'
          : isOverdue
          ? 'border-amber-500/40 bg-gradient-to-b from-amber-950/10 via-zinc-900 to-zinc-900 hover:border-amber-500/60 ring-1 ring-amber-500/20 shadow-sm'
          : 'border-zinc-800 hover:border-zinc-750'
      }`}
    >
      {/* Header Row: Checkbox, Supplier & Badges, Actions Toolbar */}
      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
        {/* Left: Checkbox + Supplier Info & Badges */}
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
          <button
            id={`select-order-checkbox-${order.order_id}`}
            type="button"
            onClick={(e) => onToggleSelect(order.order_id, e)}
            className={`w-5 h-5 mt-0.5 rounded-md border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
              isSelected
                ? 'bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/30'
                : 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-500 text-transparent hover:bg-zinc-800'
            }`}
            title={isSelected ? 'Deselect order' : 'Select order for bulk actions / print'}
          >
            <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
          </button>

          <div 
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => onViewDetails(order)}
            title="Click to view Order Details & History"
          >
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1">
              <h3 className="text-base sm:text-lg font-bold truncate text-white hover:text-orange-400 transition-colors flex items-center gap-1 max-w-full">
                <span className="truncate">{order.supplier}</span>
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-500 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
              </h3>
              
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                {isOverdue && (
                  <span 
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0 shadow-sm"
                    title={`Order is ${order.status.toLowerCase()} for ${daysPending} days (>7 days limit)`}
                  >
                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>{daysPending}d Overdue</span>
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                  order.status === 'Completed' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
                  order.status === 'Partial' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                }`}>
                  {order.status}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-zinc-500 flex-wrap">
              <span className="truncate max-w-[130px] sm:max-w-none">{getItemSummary(order.items || [])}</span>
              <span>•</span>
              <span className="shrink-0">{format(parseISO(order.date), 'dd MMM yyyy')}</span>
              {isOverdue && (
                <>
                  <span>•</span>
                  <span className="text-amber-400/90 font-medium shrink-0">
                    {daysPending}d ago
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            id={`view-order-history-btn-${order.order_id}`}
            type="button"
            onClick={() => onViewDetails(order)}
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 cursor-pointer"
            title="Order Details & History Log"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            id={`whatsapp-order-btn-${order.order_id}`}
            type="button"
            onClick={async () => {
              const isPending = order.status !== 'Completed' && Number(order.remaining_amount) > 0;
              const text = isPending
                ? generateOrderWhatsAppReminder(order, isOverdue ? daysPending : undefined)
                : generateOrderWhatsAppReceipt(order);
              await shareToWhatsApp(text);
              showToast?.(
                isPending 
                  ? 'Payment reminder formatted & opened in WhatsApp!' 
                  : 'Order receipt formatted & opened in WhatsApp!', 
                'success'
              );
            }}
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer"
            title={order.status === 'Completed' ? "Share Order Receipt on WhatsApp" : "Send WhatsApp Payment Reminder"}
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            id={`print-single-order-btn-${order.order_id}`}
            type="button"
            onClick={() => onPrint([order])}
            disabled={isPrinting}
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 disabled:opacity-50 cursor-pointer"
            title="Print / Share Receipt"
          >
            {printingOrderId === order.order_id ? (
              <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
          </button>
          <button
            id={`edit-order-btn-${order.order_id}`}
            type="button"
            onClick={() => onEdit(order)}
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 cursor-pointer"
            title="Edit Order"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button 
            id={`delete-order-btn-${order.order_id}`}
            type="button"
            onClick={() => onDelete(order)}
            className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all text-zinc-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
            title={isAdmin ? "Delete Order (Admin)" : ((order.paid_amount || 0) > 0 ? "Only Admin can delete orders with payments" : "Delete Order")}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Overdue Payment Notice Banner */}
      {isOverdue && (
        <div className="mb-4 flex items-center justify-between gap-2 px-3.5 py-2 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold truncate">Potential Overdue Payment</span>
          </div>
          <span className="text-[11px] font-medium text-amber-300/90 shrink-0">
            {daysPending} days since order
          </span>
        </div>
      )}

      {/* Items List */}
      <div className="mb-6 space-y-2">
        {(order.items || []).map((item) => (
          <div key={item.id} className="flex justify-between text-xs border-b border-zinc-800 pb-2 last:border-0">
            <div className="flex flex-col">
              <span className="font-medium text-zinc-300">{item.material}</span>
              <span className="text-zinc-500">{item.quantity}</span>
            </div>
            <span className="font-bold">₹{item.amount.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Total</p>
          <p className="font-bold text-sm">₹{order.total_amount.toLocaleString('en-IN')}</p>
        </div>
        <div>
          <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Paid</p>
          <p className="font-bold text-sm text-green-500">₹{order.paid_amount.toLocaleString('en-IN')}</p>
        </div>
        <div>
          <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1 flex items-center gap-1">
            Balance
            {isOverdue && <span className="text-amber-400 font-normal lowercase">(&gt;7d)</span>}
          </p>
          <p className={`font-bold text-sm ${isOverdue ? 'text-amber-400 font-extrabold' : 'text-red-500'}`}>
            ₹{order.remaining_amount.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      <div className="w-full bg-zinc-800 h-2 rounded-full mb-6 overflow-hidden">
        <div 
          className="bg-green-500 h-full transition-all duration-500" 
          style={{ width: `${Math.min(100, (order.paid_amount / order.total_amount) * 100)}%` }}
        />
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <button
          id={`view-order-details-btn-${order.order_id}`}
          type="button"
          onClick={() => onViewDetails(order)}
          className="flex-1 py-2.5 sm:py-3 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/60 cursor-pointer"
        >
          <History className="w-3.5 h-3.5 text-orange-400" />
          <span>View Details & History</span>
        </button>

        {order.status !== 'Completed' && (
          <button 
            id={`make-payment-order-btn-${order.order_id}`}
            onClick={() => onMakePayment(order)}
            className={`py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer ${
              isOverdue
                ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm shadow-orange-500/20'
            }`}
          >
            {isOverdue && <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            <span>Make Payment</span>
            {isOverdue && <span className="text-xs text-amber-300 font-normal">({daysPending}d Overdue)</span>}
          </button>
        )}
      </div>
    </motion.div>
  );
}
