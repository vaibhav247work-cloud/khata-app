import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  History, 
  CreditCard, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ArrowUpDown, 
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Plus,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { format, parseISO, startOfDay, differenceInCalendarDays } from 'date-fns';
import { db, type Order, type OrderPayment, type Transaction } from '../db';
import { deleteOrderPaymentWithRecalculation } from '../sync';

interface OrderHistorySectionProps {
  order: Order;
  onMakePayment?: () => void;
  className?: string;
  isInline?: boolean;
  isAdmin?: boolean;
  onPaymentDeleted?: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export interface HistoryLogEvent {
  id: string;
  type: 'order_created' | 'payment' | 'milestone_completed';
  date: string;
  title: string;
  subtitle?: string;
  amount?: number;
  paymentType?: string;
  previousStatus?: Order['status'];
  newStatus?: Order['status'];
  statusChangeText?: string;
  runningPaid: number;
  runningRemaining: number;
  isOverdueNotice?: boolean;
}

export const OrderHistorySection: React.FC<OrderHistorySectionProps> = ({
  order,
  onMakePayment,
  className = '',
  isInline = false,
  isAdmin = false,
  onPaymentDeleted,
  showToast,
}) => {
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc'); // asc = chronological (oldest to newest)
  const [paymentToDelete, setPaymentToDelete] = useState<HistoryLogEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch from orderPayments table
      const paymentRecords = await db.orderPayments.where('order_id').equals(order.order_id).toArray();
      
      // 2. Cross-reference with transactions table to capture all debit records linked to this order
      const txRecords = await db.transactions.where('order_id').equals(order.order_id).toArray();
      
      const existingPaymentIds = new Set(paymentRecords.map((p) => p.payment_id));
      const supplementalPayments: OrderPayment[] = [];
      
      for (const tx of txRecords) {
        if (tx.type !== 'Debit') continue;
        if (existingPaymentIds.has(tx.id)) continue;
        
        // Avoid duplicate by date & amount match
        const isDuplicate = paymentRecords.some(
          (p) => Math.abs(p.amount - tx.amount) < 0.01 && p.date === tx.date
        );
        if (!isDuplicate) {
          supplementalPayments.push({
            payment_id: tx.id,
            order_id: order.order_id,
            amount: tx.amount,
            payment_type: tx.payment_type || 'Cash',
            date: tx.date,
            synced: tx.synced ?? true,
          });
        }
      }
      
      let allPayments = [...paymentRecords, ...supplementalPayments];
      
      // Fallback: If order has paid_amount > 0 but no payment records found
      if (allPayments.length === 0 && (order.paid_amount || 0) > 0) {
        allPayments.push({
          payment_id: `recorded-${order.order_id}`,
          order_id: order.order_id,
          amount: order.paid_amount,
          payment_type: 'Cash / Recorded',
          date: order.date,
          synced: true,
        });
      }
      
      // Sort chronologically ascending by date
      allPayments.sort((a, b) => a.date.localeCompare(b.date));
      setPayments(allPayments);
    } catch (err) {
      console.error('Failed to load order payment history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [order.order_id, order.paid_amount, order.date]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Compute chronological log with cumulative financial progression and status transitions
  const chronologicalEvents = useMemo(() => {
    const events: HistoryLogEvent[] = [];
    const totalAmount = Number(order.total_amount) || 0;

    // 1. Initial Order Placement Event
    events.push({
      id: `created-${order.order_id}`,
      type: 'order_created',
      date: order.date,
      title: 'Order Created',
      subtitle: `Order placed with ${order.supplier} (${order.items?.length || 0} item${(order.items?.length || 0) !== 1 ? 's' : ''})`,
      amount: totalAmount,
      newStatus: 'Pending',
      statusChangeText: 'Marked as Pending',
      runningPaid: 0,
      runningRemaining: totalAmount,
    });

    // 2. Sequential Payments & Status Updates
    let runningPaid = 0;
    payments.forEach((payment, index) => {
      const prevPaid = runningPaid;
      runningPaid += payment.amount;
      const remainingAfter = Math.max(0, totalAmount - runningPaid);
      
      const prevStatus: Order['status'] = prevPaid === 0 ? 'Pending' : 'Partial';
      const newStatus: Order['status'] = remainingAfter <= 0 ? 'Completed' : 'Partial';
      
      let statusChangeText = '';
      if (prevStatus !== newStatus) {
        statusChangeText = `${prevStatus} → ${newStatus}`;
      } else {
        statusChangeText = `Maintained ${newStatus}`;
      }

      events.push({
        id: payment.payment_id || `payment-${index}`,
        type: 'payment',
        date: payment.date,
        title: `Payment Received: ₹${payment.amount.toLocaleString('en-IN')}`,
        subtitle: `Mode: ${payment.payment_type}`,
        amount: payment.amount,
        paymentType: payment.payment_type,
        previousStatus: prevStatus,
        newStatus,
        statusChangeText,
        runningPaid,
        runningRemaining: remainingAfter,
      });
    });

    // 3. Final Milestone: Fully Completed (if order is completed)
    if (order.status === 'Completed' && payments.length > 0) {
      const lastPayment = payments[payments.length - 1];
      events.push({
        id: `completed-${order.order_id}`,
        type: 'milestone_completed',
        date: lastPayment ? lastPayment.date : order.date,
        title: 'Order Completed',
        subtitle: 'All pending balances settled in full. Order marked as Completed.',
        newStatus: 'Completed',
        statusChangeText: 'Completed',
        runningPaid: totalAmount,
        runningRemaining: 0,
      });
    }

    return events;
  }, [order, payments]);

  // Handle user sort toggle
  const displayedEvents = useMemo(() => {
    const list = [...chronologicalEvents];
    if (sortOrder === 'desc') {
      return list.reverse();
    }
    return list;
  }, [chronologicalEvents, sortOrder]);

  const formatDate = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      return format(d, 'dd MMM yyyy, hh:mm a');
    } catch {
      return dateStr;
    }
  };

  const getRelativeDays = (dateStr: string) => {
    try {
      const days = differenceInCalendarDays(startOfDay(new Date()), startOfDay(parseISO(dateStr)));
      if (days === 0) return 'Today';
      if (days === 1) return 'Yesterday';
      if (days > 1) return `${days}d ago`;
      return '';
    } catch {
      return '';
    }
  };

  const daysSinceCreation = useMemo(() => {
    try {
      return differenceInCalendarDays(startOfDay(new Date()), startOfDay(parseISO(order.date)));
    } catch {
      return 0;
    }
  }, [order.date]);

  const isOverdue = (order.status === 'Pending' || order.status === 'Partial') && daysSinceCreation > 7;

  const handleConfirmDeletePayment = async () => {
    if (!paymentToDelete) return;
    setIsDeleting(true);
    try {
      await deleteOrderPaymentWithRecalculation(order.order_id, paymentToDelete.id);
      showToast?.(`Payment of ₹${(paymentToDelete.amount || 0).toLocaleString('en-IN')} deleted`, 'success');
      setPaymentToDelete(null);
      await fetchHistory();
      onPaymentDeleted?.();
    } catch (err) {
      console.error('Failed to delete order payment:', err);
      showToast?.('Failed to delete payment', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`bg-zinc-950/70 border border-zinc-800/90 rounded-3xl p-4 sm:p-6 ${className}`}>
      {/* Section Header */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
            <History className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-sm sm:text-base text-white truncate">
              Order History & Status Log
            </h4>
            <p className="text-[11px] text-zinc-500 truncate">
              Chronological payments and status transitions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title={sortOrder === 'asc' ? 'Showing oldest first. Click for newest first' : 'Showing newest first. Click for oldest first'}
          >
            <ArrowUpDown className="w-3 h-3 text-orange-400" />
            <span className="hidden xs:inline">{sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}</span>
            <span className="xs:hidden">{sortOrder === 'asc' ? 'Old' : 'New'}</span>
          </button>

          <button
            type="button"
            onClick={fetchHistory}
            disabled={isLoading}
            className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Refresh history"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-orange-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Overdue Banner inside History if >7d */}
      {isOverdue && (
        <div className="mb-4 flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <div className="flex-1 min-w-0">
            <span className="font-bold">Overdue Payment Notice: </span>
            <span className="text-amber-300/90">
              This order has had an unpaid balance of ₹{order.remaining_amount.toLocaleString('en-IN')} for {daysSinceCreation} days (&gt;7 days).
            </span>
          </div>
        </div>
      )}

      {/* Mini Financial Progress Strip */}
      <div className="grid grid-cols-3 gap-2 mb-5 p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 text-center">
        <div>
          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Total Order</span>
          <span className="text-xs sm:text-sm font-bold text-white">
            ₹{order.total_amount.toLocaleString('en-IN')}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Total Paid</span>
          <span className="text-xs sm:text-sm font-bold text-green-500">
            ₹{order.paid_amount.toLocaleString('en-IN')}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Balance Due</span>
          <span className={`text-xs sm:text-sm font-bold ${isOverdue ? 'text-amber-400' : 'text-red-500'}`}>
            ₹{order.remaining_amount.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-zinc-500">
          <RefreshCw className="w-5 h-5 animate-spin text-orange-500" />
          <span className="text-xs font-medium">Loading history log...</span>
        </div>
      )}

      {/* Timeline Events List */}
      {!isLoading && displayedEvents.length > 0 && (
        <div className="relative pl-6 sm:pl-7 space-y-6 before:content-[''] before:absolute before:left-[11px] sm:before:left-[13px] before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-800">
          {displayedEvents.map((event, index) => {
            const relativeTime = getRelativeDays(event.date);

            return (
              <div key={event.id} className="relative group">
                {/* Timeline Icon Node */}
                <div className={`absolute -left-6 sm:-left-7 top-1 w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                  event.type === 'order_created'
                    ? 'bg-zinc-900 border-blue-500 text-blue-400'
                    : event.type === 'milestone_completed'
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : 'bg-zinc-900 border-green-500 text-green-400'
                }`}>
                  {event.type === 'order_created' && <FileText className="w-3 h-3" />}
                  {event.type === 'payment' && <CreditCard className="w-3 h-3" />}
                  {event.type === 'milestone_completed' && <CheckCircle2 className="w-3 h-3" />}
                </div>

                {/* Event Card Content */}
                <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-2xl p-3 sm:p-4 hover:border-zinc-700/80 transition-all shadow-sm overflow-hidden min-w-0">
                  {/* Top Bar: Event Title & Actions */}
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <span className="text-xs sm:text-sm font-bold text-white">
                        {event.title}
                      </span>
                      {event.paymentType && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-orange-400 border border-zinc-700 shrink-0">
                          {event.paymentType}
                        </span>
                      )}
                    </div>

                    {event.type === 'payment' && (
                      <button
                        id={`delete-payment-btn-${event.id}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isAdmin) {
                            showToast?.('Only Admin can delete order payments', 'error');
                            return;
                          }
                          setPaymentToDelete(event);
                        }}
                        className={`p-1 sm:p-1.5 px-2 rounded-lg border transition-all flex items-center gap-1 text-[11px] font-semibold shrink-0 ${
                          isAdmin
                            ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30 hover:border-red-500/50 cursor-pointer active:scale-95'
                            : 'bg-zinc-900/40 text-zinc-600 border-zinc-800/40 cursor-not-allowed opacity-60'
                        }`}
                        title={isAdmin ? 'Delete this payment (Admin)' : 'Only Admin can delete payments'}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        <span className="text-[10px]">Delete</span>
                      </button>
                    )}
                  </div>

                  {/* Sub-bar: Date & Relative Time */}
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-2 flex-wrap">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Clock className="w-3 h-3 text-zinc-500 shrink-0" />
                      <span>{formatDate(event.date)}</span>
                    </div>
                    {relativeTime && (
                      <span className="px-1.5 py-0.2 rounded-md bg-zinc-800 text-zinc-400 text-[10px] font-semibold shrink-0">
                        {relativeTime}
                      </span>
                    )}
                  </div>

                  {/* Subtitle / Description */}
                  {event.subtitle && (
                    <p className="text-xs text-zinc-400 mb-2.5">
                      {event.subtitle}
                    </p>
                  )}

                  {/* Status Transition & Balance Snapshot */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/60 text-xs">
                    {/* Status Update Chip */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        Status Update:
                      </span>
                      {event.previousStatus && event.newStatus && event.previousStatus !== event.newStatus ? (
                        <div className="inline-flex items-center gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            event.previousStatus === 'Pending'
                              ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                              : 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                          }`}>
                            {event.previousStatus}
                          </span>
                          <ArrowRight className="w-3 h-3 text-zinc-500" />
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            event.newStatus === 'Completed'
                              ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                              : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                          }`}>
                            {event.newStatus}
                          </span>
                        </div>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          event.newStatus === 'Completed'
                            ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                            : event.newStatus === 'Partial'
                            ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                        }`}>
                          {event.newStatus || 'Pending'}
                        </span>
                      )}
                    </div>

                    {/* Cumulative Balance Snapshot */}
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-medium">
                      <span>Paid: <strong className="text-zinc-300">₹{event.runningPaid.toLocaleString('en-IN')}</strong></span>
                      <span>•</span>
                      <span>Balance: <strong className={event.runningRemaining > 0 ? 'text-red-400' : 'text-green-400'}>₹{event.runningRemaining.toLocaleString('en-IN')}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State when no payment events yet */}
      {!isLoading && payments.length === 0 && (
        <div className="mt-2 text-center py-6 px-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/60 border-dashed">
          <Clock className="w-6 h-6 text-zinc-500 mx-auto mb-2 opacity-60" />
          <p className="text-xs font-semibold text-zinc-400">
            No payments recorded yet
          </p>
          <p className="text-[11px] text-zinc-600 mt-0.5 max-w-xs mx-auto">
            This order is currently Pending full payment of ₹{order.remaining_amount.toLocaleString('en-IN')}.
          </p>
          {onMakePayment && (
            <button
              type="button"
              onClick={onMakePayment}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record First Payment</span>
            </button>
          )}
        </div>
      )}

      {/* Bottom Action inside History */}
      {order.status !== 'Completed' && onMakePayment && payments.length > 0 && (
        <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">
            Remaining balance: <strong className="text-white">₹{order.remaining_amount.toLocaleString('en-IN')}</strong>
          </div>
          <button
            type="button"
            onClick={onMakePayment}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-orange-400 text-xs font-bold transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
        </div>
      )}
      {/* Delete Payment Confirmation Modal */}
      {paymentToDelete && (
        <div 
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => !isDeleting && setPaymentToDelete(null)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-800 p-6 sm:p-7 rounded-[32px] max-w-sm w-full text-center shadow-2xl"
          >
            <div className="w-14 h-14 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <Trash2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1.5">Delete Order Payment?</h3>
            <p className="text-zinc-400 text-xs mb-4 leading-relaxed">
              Delete payment of <strong className="text-white">₹{(paymentToDelete.amount || 0).toLocaleString('en-IN')}</strong> ({paymentToDelete.paymentType || 'Payment'}) recorded on {formatDate(paymentToDelete.date)}?
            </p>
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-3 mb-5 text-left text-[11px] text-zinc-400 space-y-1">
              <div className="flex justify-between">
                <span>Deduct from Paid:</span>
                <span className="font-bold text-red-400">-₹{(paymentToDelete.amount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span>Restore to Balance:</span>
                <span className="font-bold text-green-400">+₹{(paymentToDelete.amount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="text-[10px] text-zinc-500 pt-1.5 border-t border-zinc-800">
                Associated transaction ledger debit entry will also be deleted.
              </div>
            </div>
            <div className="flex gap-2.5">
              <button 
                type="button"
                disabled={isDeleting}
                onClick={() => setPaymentToDelete(null)} 
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-3 rounded-2xl font-bold text-xs text-zinc-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="button"
                id="confirm-delete-payment-btn"
                disabled={isDeleting}
                onClick={handleConfirmDeletePayment} 
                className="flex-1 bg-red-500 hover:bg-red-600 py-3 rounded-2xl font-bold text-xs text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Payment</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
