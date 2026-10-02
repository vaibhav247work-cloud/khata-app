import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  X, 
  ListChecks, 
  Plus, 
  ArrowUpDown, 
  Clock, 
  CheckSquare, 
  Square, 
  CheckCheck, 
  Printer, 
  RefreshCw, 
  AlertCircle 
} from 'lucide-react';
import { format, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns';
import { db, type Order, type OrderItem } from '../../db';
import { deleteOrderWithAssociated } from '../../sync';
import { DEFAULT_PAYMENT_MODES } from '../../utils/categoriesAndModes';
import { useBackHandler } from '../../utils/backHandler';
import { generateAndShareOrderReceipts } from '../../utils/pdfExport';
import { type PdfPreviewData } from '../../types/common';
import { OrderDetailsModal } from '../../components/OrderDetailsModal';
import { OrderCard } from './components/OrderCard';
import { AddEditOrderModal } from './components/AddEditOrderModal';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import { SettleModal } from './components/SettleModal';
import { DeleteOrderConfirmModal } from './components/DeleteOrderConfirmModal';

interface OrdersModuleProps {
  orders: Order[];
  onUpdate: () => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  isAdmin: boolean;
  markSyncPending: () => void;
  onPreviewPdf?: (data: PdfPreviewData) => void;
  paymentModes?: string[];
  initialStatusFilter?: 'All' | 'Pending' | 'Partial' | 'Completed' | 'Overdue';
  initialOpenAdd?: boolean;
  onAddModalClosed?: () => void;
}

export function OrdersModule({ 
  orders, 
  onUpdate, 
  showToast, 
  isAdmin, 
  markSyncPending, 
  onPreviewPdf, 
  paymentModes = DEFAULT_PAYMENT_MODES,
  initialStatusFilter = 'All',
  initialOpenAdd = false,
  onAddModalClosed,
}: OrdersModuleProps) {
  const [showAdd, setShowAdd] = useState(initialOpenAdd);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const createEmptyOrderItem = (): OrderItem => ({ id: crypto.randomUUID(), material: '', quantity: '', amount: 0 });
  const [newItems, setNewItems] = useState<OrderItem[]>([createEmptyOrderItem()]);

  useEffect(() => {
    if (initialOpenAdd) {
      setShowAdd(true);
      setEditingOrder(null);
      setNewItems([createEmptyOrderItem()]);
    }
  }, [initialOpenAdd]);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [viewingOrderDetails, setViewingOrderDetails] = useState<Order | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Partial' | 'Completed' | 'Overdue'>(initialStatusFilter);

  useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  const [sortAsc, setSortAsc] = useState(false);

  // Multi-select & Bulk Action state
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [isBulkCompleting, setIsBulkCompleting] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settlePaymentType, setSettlePaymentType] = useState(() => paymentModes[0] || 'Cash');
  const [settleDate, setSettleDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [isSettling, setIsSettling] = useState(false);

  const overdueOrdersCount = useMemo(() => {
    const now = startOfDay(new Date());
    return orders.filter((o: Order) => {
      if (o.status !== 'Pending' && o.status !== 'Partial') return false;
      try {
        const days = differenceInCalendarDays(now, startOfDay(parseISO(o.date)));
        return days > 7;
      } catch {
        return false;
      }
    }).length;
  }, [orders]);

  const statusCounts = useMemo(() => ({
    All: orders.length,
    Pending: orders.filter((o: Order) => o.status === 'Pending').length,
    Partial: orders.filter((o: Order) => o.status === 'Partial').length,
    Completed: orders.filter((o: Order) => o.status === 'Completed').length,
    Overdue: overdueOrdersCount,
  }), [orders, overdueOrdersCount]);

  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (statusFilter === 'Overdue') {
      const now = startOfDay(new Date());
      result = result.filter((o: Order) => {
        if (o.status !== 'Pending' && o.status !== 'Partial') return false;
        try {
          return differenceInCalendarDays(now, startOfDay(parseISO(o.date))) > 7;
        } catch {
          return false;
        }
      });
    } else if (statusFilter !== 'All') {
      result = result.filter((o: Order) => o.status === statusFilter);
    }

    if (orderSearchQuery.trim()) {
      const q = orderSearchQuery.toLowerCase().trim();
      result = result.filter((order: Order) => {
        const matchSupplier = (order.supplier || '').toLowerCase().includes(q);
        const matchItems = (order.items || []).some(item => 
          (item.material || '').toLowerCase().includes(q) ||
          (item.quantity || '').toLowerCase().includes(q)
        );
        return matchSupplier || matchItems;
      });
    }

    result.sort((a: Order, b: Order) => {
      const cmp = b.date.localeCompare(a.date);
      return sortAsc ? -cmp : cmp;
    });

    return result;
  }, [orders, statusFilter, orderSearchQuery, sortAsc]);

  const filteredSummary = useMemo(() => {
    const totalCount = filteredOrders.length;
    const totalValue = filteredOrders.reduce((sum: number, o: Order) => sum + (Number(o.total_amount) || 0), 0);
    const totalPaid = filteredOrders.reduce((sum: number, o: Order) => sum + (Number(o.paid_amount) || 0), 0);
    const totalRemaining = filteredOrders.reduce((sum: number, o: Order) => sum + (Number(o.remaining_amount) || 0), 0);
    return { totalCount, totalValue, totalPaid, totalRemaining };
  }, [filteredOrders]);

  const selectedOrders = useMemo(() => {
    return orders.filter((o: Order) => selectedOrderIds.has(o.order_id));
  }, [orders, selectedOrderIds]);

  const selectedTotalAmount = useMemo(() => {
    return selectedOrders.reduce((sum: number, o: Order) => sum + (Number(o.total_amount) || 0), 0);
  }, [selectedOrders]);

  const selectedPaidAmount = useMemo(() => {
    return selectedOrders.reduce((sum: number, o: Order) => sum + (Number(o.paid_amount) || 0), 0);
  }, [selectedOrders]);

  const selectedRemainingAmount = useMemo(() => {
    return selectedOrders.reduce((sum: number, o: Order) => sum + (Number(o.remaining_amount) || 0), 0);
  }, [selectedOrders]);

  const ordersWithPendingBalance = useMemo(() => {
    return selectedOrders.filter((o: Order) => Number(o.remaining_amount) > 0);
  }, [selectedOrders]);

  const allVisibleOrdersSelected = filteredOrders.length > 0 && filteredOrders.every((o: Order) => selectedOrderIds.has(o.order_id));

  const toggleSelectOrder = (orderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const toggleSelectAllOrders = () => {
    if (allVisibleOrdersSelected) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map((o: Order) => o.order_id)));
    }
  };

  const cancelOrderSelection = () => {
    setSelectedOrderIds(new Set());
  };

  const handleBulkMarkCompleted = async () => {
    if (selectedOrders.length === 0) return;

    const incompleteOrders = selectedOrders.filter(
      (o: Order) => o.status !== 'Completed' || Number(o.remaining_amount) > 0
    );

    if (incompleteOrders.length === 0) {
      showToast?.('All selected orders are already marked as Completed.', 'info');
      return;
    }

    if (ordersWithPendingBalance.length > 0) {
      setSettleDate(format(new Date(), 'yyyy-MM-dd'));
      setShowSettleModal(true);
      return;
    }

    setIsBulkCompleting(true);
    try {
      for (const order of incompleteOrders) {
        await db.orders.update(order.order_id, {
          status: 'Completed',
          remaining_amount: 0,
          synced: false
        });
      }
      markSyncPending();
      onUpdate();
      showToast?.(`Marked ${incompleteOrders.length} fully paid order${incompleteOrders.length > 1 ? 's' : ''} as Completed!`, 'success');
      setSelectedOrderIds(new Set());
    } catch (err) {
      console.error('Bulk mark completed error:', err);
      showToast?.('Failed to mark orders as Completed', 'error');
    } finally {
      setIsBulkCompleting(false);
    }
  };

  const getItemSummary = (items: OrderItem[]) => {
    const validItems = (items || []).filter(i => i.material.trim() !== '');
    if (validItems.length === 0) return 'Untitled Order';
    if (validItems.length === 1) return validItems[0].material;
    return `${validItems[0].material} + ${validItems.length - 1} more`;
  };

  const handleConfirmSettlePayments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOrders.length === 0) return;

    setIsSettling(true);
    try {
      const now = new Date();
      const timeStr = format(now, 'HH:mm:ss');
      const fullDate = `${settleDate}T${timeStr}`;

      let settledCount = 0;
      let totalSettledAmount = 0;

      for (const order of selectedOrders) {
        const balance = Number(order.remaining_amount);
        if (balance > 0) {
          await db.orderPayments.add({
            payment_id: crypto.randomUUID(),
            order_id: order.order_id,
            amount: balance,
            payment_type: settlePaymentType,
            date: fullDate,
            synced: false,
          });

          const itemSummary = getItemSummary(order.items || []);
          await db.transactions.add({
            id: crypto.randomUUID(),
            date: fullDate,
            type: 'Debit',
            category: order.supplier,
            amount: balance,
            payment_type: settlePaymentType as any,
            description: `Payment done for ${itemSummary}`,
            order_id: order.order_id,
            synced: false,
          });

          await db.orders.update(order.order_id, {
            paid_amount: order.total_amount,
            remaining_amount: 0,
            status: 'Completed',
            synced: false,
          });

          settledCount++;
          totalSettledAmount += balance;
        } else {
          await db.orders.update(order.order_id, {
            status: 'Completed',
            remaining_amount: 0,
            synced: false,
          });
        }
      }

      markSyncPending();
      onUpdate();
      showToast?.(
        `Recorded balance payments (₹${totalSettledAmount.toLocaleString('en-IN')}) and marked ${selectedOrders.length} order(s) as Completed!`,
        'success'
      );
      setShowSettleModal(false);
      setSelectedOrderIds(new Set());
    } catch (error) {
      console.error('Error settling orders:', error);
      showToast?.('Failed to complete order payments', 'error');
    } finally {
      setIsSettling(false);
    }
  };

  const handlePrintOrders = async (ordersToPrint: Order[]) => {
    if (ordersToPrint.length === 0) {
      showToast?.('Please select at least one order to print', 'info');
      return;
    }
    setIsPrinting(true);
    if (ordersToPrint.length === 1) {
      setPrintingOrderId(ordersToPrint[0].order_id);
    }
    try {
      await generateAndShareOrderReceipts(ordersToPrint, showToast, onPreviewPdf);
    } finally {
      setIsPrinting(false);
      setPrintingOrderId(null);
    }
  };

  const closeOrderForm = () => {
    setShowAdd(false);
    setEditingOrder(null);
    setNewItems([createEmptyOrderItem()]);
    if (onAddModalClosed) {
      onAddModalClosed();
    }
  };

  useBackHandler(() => {
    setOrderToDelete(null);
    return true;
  }, !!orderToDelete, 70);

  useBackHandler(() => {
    if (isSettling) return true;
    setShowSettleModal(false);
    return true;
  }, showSettleModal, 60);

  useBackHandler(() => {
    closeOrderForm();
    return true;
  }, showAdd || !!editingOrder, 55);

  useBackHandler(() => {
    setSelectedOrder(null);
    return true;
  }, !!selectedOrder, 50);

  useBackHandler(() => {
    setViewingOrderDetails(null);
    return true;
  }, !!viewingOrderDetails, 48);

  useEffect(() => {
    if (viewingOrderDetails) {
      const fresh = orders.find((o) => o.order_id === viewingOrderDetails.order_id);
      if (fresh) {
        setViewingOrderDetails(fresh);
      }
    }
  }, [orders]);

  useBackHandler(() => {
    setSelectedOrderIds(new Set());
    return true;
  }, selectedOrderIds.size > 0, 40);

  const openAddOrderForm = () => {
    setEditingOrder(null);
    setNewItems([createEmptyOrderItem()]);
    setShowAdd(true);
  };

  const openEditOrderForm = (order: Order) => {
    setShowAdd(false);
    setEditingOrder(order);
    setNewItems(order.items?.length ? order.items.map(item => ({ ...item })) : [createEmptyOrderItem()]);
  };

  const handleAddItemRow = () => {
    setNewItems([...newItems, createEmptyOrderItem()]);
  };

  const handleRemoveItemRow = (id: string) => {
    if (newItems.length > 1) {
      setNewItems(newItems.filter(i => i.id !== id));
    }
  };

  const handleItemChange = (id: string, field: keyof OrderItem, value: any) => {
    setNewItems(newItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleOrderSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const filteredItems = newItems.filter(item => item.material.trim() !== '');
    if (filteredItems.length === 0) {
      showToast?.('Please add at least one material name', 'error');
      return;
    }

    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = editingOrder?.date.split('T')[1] || format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const total = filteredItems.reduce((sum, item) => sum + Number(item.amount), 0);
    const supplier = formData.get('supplier') as string;

    if (editingOrder) {
      if (total < editingOrder.paid_amount) {
        showToast?.(`Total amount cannot be less than paid amount of ₹${editingOrder.paid_amount.toLocaleString()}`, 'error');
        return;
      }

      const remaining = total - editingOrder.paid_amount;
      const status = remaining <= 0 ? 'Completed' : editingOrder.paid_amount > 0 ? 'Partial' : 'Pending';

      await db.orders.put({
        ...editingOrder,
        items: filteredItems,
        supplier,
        total_amount: total,
        remaining_amount: remaining,
        status,
        date: fullDate,
        synced: false
      });

      const itemSummary = getItemSummary(filteredItems);
      await db.transactions.where('order_id').equals(editingOrder.order_id).modify((tx) => {
        tx.category = supplier;
        tx.description = `Payment done for ${itemSummary}`;
        tx.synced = false;
      });
    } else {
      const order: Order = {
        order_id: crypto.randomUUID(),
        items: filteredItems,
        supplier,
        total_amount: total,
        paid_amount: 0,
        remaining_amount: total,
        status: 'Pending',
        date: fullDate,
        synced: false
      };
      await db.orders.add(order);
    }

    markSyncPending();
    closeOrderForm();
    onUpdate();
  };

  const handlePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOrder) return;
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const paymentType = formData.get('payment_type') as string;
    const selectedDate = formData.get('date') as string;
    const now = new Date();
    const timeStr = format(now, 'HH:mm:ss');
    const fullDate = `${selectedDate}T${timeStr}`;

    const newPaid = selectedOrder.paid_amount + amount;
    const newRemaining = selectedOrder.total_amount - newPaid;
    const newStatus = newRemaining <= 0 ? 'Completed' : 'Partial';

    const itemSummary = getItemSummary(selectedOrder.items || []);

    await db.orders.update(selectedOrder.order_id, {
      paid_amount: newPaid,
      remaining_amount: newRemaining,
      status: newStatus,
      synced: false
    });

    await db.orderPayments.add({
      payment_id: crypto.randomUUID(),
      order_id: selectedOrder.order_id,
      amount,
      payment_type: paymentType,
      date: fullDate,
      synced: false
    });

    await db.transactions.add({
      id: crypto.randomUUID(),
      date: fullDate,
      type: 'Debit',
      category: selectedOrder.supplier,
      amount,
      payment_type: paymentType as any,
      description: `Payment done for ${itemSummary}`,
      order_id: selectedOrder.order_id,
      synced: false
    });

    markSyncPending();
    setSelectedOrder(null);
    onUpdate();
  };

  const handlePaymentDeleted = async () => {
    markSyncPending();
    onUpdate();
    if (viewingOrderDetails) {
      const refreshed = await db.orders.get(viewingOrderDetails.order_id);
      if (refreshed) {
        setViewingOrderDetails(refreshed);
      }
    }
    if (selectedOrder) {
      const refreshed = await db.orders.get(selectedOrder.order_id);
      if (refreshed) {
        setSelectedOrder(refreshed);
      }
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    try {
      const payments = await db.orderPayments.where('order_id').equals(order.order_id).toArray();
      const hasPayments = payments.length > 0 || (order.paid_amount || 0) > 0;
      
      if (hasPayments && !isAdmin) {
        showToast?.('Only Admin can delete orders with payments', 'error');
        setOrderToDelete(null);
        return;
      }

      await deleteOrderWithAssociated(order);
      
      setOrderToDelete(null);
      if (viewingOrderDetails?.order_id === order.order_id) {
        setViewingOrderDetails(null);
      }
      markSyncPending();
      showToast?.('Order and associated payments deleted', 'success');
      onUpdate();
    } catch (error) {
      console.error('Delete error:', error);
      showToast?.('Failed to delete order', 'error');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-5"
    >
      {/* Top Search & Actions Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            id="order-search-input"
            type="text" 
            value={orderSearchQuery}
            onChange={(e) => setOrderSearchQuery(e.target.value)}
            placeholder="Search by supplier or material..." 
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-12 pr-10 py-3.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
          />
          {orderSearchQuery && (
            <button
              id="clear-order-search-btn"
              type="button"
              onClick={() => setOrderSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {filteredOrders.length > 0 && (
            <button
              id="toggle-multi-select-orders-btn"
              type="button"
              onClick={() => {
                if (selectedOrderIds.size > 0) {
                  cancelOrderSelection();
                } else {
                  toggleSelectAllOrders();
                }
              }}
              title={selectedOrderIds.size > 0 ? 'Clear Selection' : 'Select All Orders for Bulk Actions'}
              className={`p-3.5 rounded-2xl border transition-all flex items-center justify-center shrink-0 cursor-pointer ${
                selectedOrderIds.size > 0 
                  ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-lg shadow-orange-500/20' 
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
              }`}
            >
              <ListChecks className="w-5 h-5" />
            </button>
          )}

          <button 
            id="add-new-order-btn"
            onClick={openAddOrderForm}
            className="bg-orange-500 hover:bg-orange-600 px-4 sm:px-5 py-3.5 rounded-2xl text-white font-bold shadow-lg shadow-orange-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 flex-1 sm:flex-initial cursor-pointer"
          >
            <Plus className="w-5 h-5 text-white" />
            <span className="text-sm">New Order</span>
          </button>
        </div>
      </div>

      {/* Status Filter & Sort Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-zinc-900/90 border border-zinc-800/80 rounded-2xl overflow-x-auto max-w-full">
          {(['All', 'Pending', 'Partial', 'Completed', 'Overdue'] as const).map((tab) => {
            const count = statusCounts[tab];
            const isActive = statusFilter === tab;
            return (
              <button
                key={tab}
                id={`order-status-filter-tab-${tab.toLowerCase()}`}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? tab === 'Completed'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/40 shadow-sm'
                      : tab === 'Partial'
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                      : tab === 'Pending'
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 shadow-sm'
                      : tab === 'Overdue'
                      ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm'
                      : 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                    : tab === 'Overdue' && count > 0
                    ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-500/25'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent'
                }`}
              >
                {tab === 'Overdue' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                <span>{tab}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full leading-none font-bold ${
                  isActive 
                    ? 'bg-white/15' 
                    : tab === 'Overdue' && count > 0 
                    ? 'bg-amber-500/20 text-amber-300' 
                    : 'bg-zinc-800 text-zinc-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Date Sort Toggle Button */}
        <button
          id="toggle-order-date-sort-btn"
          type="button"
          onClick={() => setSortAsc(!sortAsc)}
          className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-750 rounded-xl text-xs font-semibold text-zinc-300 transition-colors shrink-0 active:scale-95 cursor-pointer"
          title={sortAsc ? 'Currently sorting: Oldest First. Click for Newest First.' : 'Currently sorting: Newest First. Click for Oldest First.'}
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-orange-400" />
          <span>{sortAsc ? 'Date: Oldest First' : 'Date: Newest First'}</span>
        </button>
      </div>

      {/* Overdue Payment Alert Banner */}
      {overdueOrdersCount > 0 && statusFilter !== 'Overdue' && (
        <div 
          onClick={() => setStatusFilter('Overdue')}
          className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs cursor-pointer hover:bg-amber-500/15 transition-all shadow-sm group"
          title="Click to view all overdue orders"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-1 rounded-lg bg-amber-500/20 text-amber-300 shrink-0">
              <Clock className="w-3.5 h-3.5" />
            </span>
            <span className="font-medium truncate">
              <strong>{overdueOrdersCount} order{overdueOrdersCount > 1 ? 's have' : ' has'}</strong> pending payment for more than 7 days
            </span>
          </div>
          <span className="text-[11px] font-bold text-amber-300 group-hover:text-amber-200 underline shrink-0">
            Filter Overdue →
          </span>
        </div>
      )}

      {/* Filtered Orders Financial Summary Row */}
      <div className="grid grid-cols-3 gap-3 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800/90 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col min-w-0">
          <span className="text-zinc-500 text-[11px] font-semibold tracking-wide uppercase truncate">
            {statusFilter === 'All' ? 'Total Orders' : `${statusFilter} Orders`}
          </span>
          <span className="text-lg sm:text-xl font-bold text-white mt-0.5">
            {filteredSummary.totalCount}
            <span className="text-[11px] text-zinc-500 font-normal ml-1.5 hidden sm:inline">
              {filteredSummary.totalCount === 1 ? 'order' : 'orders'}
            </span>
          </span>
        </div>

        <div className="flex flex-col min-w-0 border-l border-zinc-800 pl-3 sm:pl-4">
          <span className="text-zinc-500 text-[11px] font-semibold tracking-wide uppercase truncate">Total Value</span>
          <span className="text-lg sm:text-xl font-bold text-zinc-100 mt-0.5 truncate">
            ₹{filteredSummary.totalValue.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="flex flex-col min-w-0 border-l border-zinc-800 pl-3 sm:pl-4">
          <span className="text-zinc-500 text-[11px] font-semibold tracking-wide uppercase truncate">Remaining Balance</span>
          <span className={`text-lg sm:text-xl font-bold mt-0.5 truncate ${filteredSummary.totalRemaining > 0 ? 'text-red-400' : 'text-green-400'}`}>
            ₹{filteredSummary.totalRemaining.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Multi-Select Action Toolbar for Orders */}
      <AnimatePresence>
        {selectedOrderIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.15 }}
            className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-850 border border-orange-500/40 rounded-2xl p-3.5 shadow-xl space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <button
                  id="select-all-orders-btn"
                  type="button"
                  onClick={toggleSelectAllOrders}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                >
                  {allVisibleOrdersSelected ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-orange-500" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-zinc-400" />
                      Select All ({filteredOrders.length})
                    </>
                  )}
                </button>

                <span className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-bold px-2.5 py-1 rounded-xl">
                  {selectedOrderIds.size} Selected
                </span>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                {/* Mark as Completed Bulk Action */}
                <button
                  id="bulk-mark-completed-btn"
                  type="button"
                  onClick={handleBulkMarkCompleted}
                  disabled={isBulkCompleting || selectedOrders.length === 0}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-500 active:scale-95 text-white transition-all shadow-md shadow-green-600/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title={
                    ordersWithPendingBalance.length > 0 
                      ? `Settle remaining balances and mark ${selectedOrders.length} order(s) as Completed` 
                      : `Mark ${selectedOrders.length} fully paid order(s) as Completed`
                  }
                >
                  {isBulkCompleting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="w-3.5 h-3.5" />
                  )}
                  <span>
                    Mark Completed ({selectedOrderIds.size})
                  </span>
                </button>

                {/* Print & Share Selected Orders */}
                <button
                  id="print-selected-orders-btn"
                  type="button"
                  onClick={() => handlePrintOrders(selectedOrders)}
                  disabled={isPrinting}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white transition-all shadow-md shadow-orange-500/20 disabled:opacity-50 cursor-pointer"
                  title="Print & Share Selected Orders"
                >
                  {isPrinting && !printingOrderId ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Printer className="w-3.5 h-3.5" />
                  )}
                  <span>Print / Share ({selectedOrderIds.size})</span>
                </button>

                <button
                  id="cancel-order-selection-btn"
                  type="button"
                  onClick={cancelOrderSelection}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Clear selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Selected Orders Financial Summary */}
            <div className="grid grid-cols-3 gap-2 bg-zinc-950/60 rounded-xl p-2.5 border border-zinc-800/80 text-xs">
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Selected Total</span>
                <span className="text-zinc-200 font-bold">₹{selectedTotalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Selected Paid</span>
                <span className="text-green-500 font-bold">₹{selectedPaidAmount.toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-zinc-500 block text-[10px] uppercase font-bold">Selected Balance</span>
                <span className="text-red-500 font-bold">₹{selectedRemainingAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orders List */}
      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {filteredOrders.map((order: Order) => (
            <OrderCard
              key={order.order_id}
              order={order}
              isSelected={selectedOrderIds.has(order.order_id)}
              onToggleSelect={toggleSelectOrder}
              onViewDetails={(o) => setViewingOrderDetails(o)}
              onPrint={handlePrintOrders}
              onEdit={openEditOrderForm}
              onDelete={(o) => setOrderToDelete(o)}
              onMakePayment={(o) => setSelectedOrder(o)}
              isAdmin={isAdmin}
              isPrinting={isPrinting}
              printingOrderId={printingOrderId}
              showToast={showToast}
            />
          ))}
        </AnimatePresence>

        {filteredOrders.length === 0 && (
          <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-3xl">
            <p className="text-zinc-500 text-sm">No orders found</p>
          </div>
        )}
      </div>

      {/* Add / Edit Order Modal */}
      <AddEditOrderModal
        isOpen={showAdd || !!editingOrder}
        onClose={closeOrderForm}
        editingOrder={editingOrder}
        newItems={newItems}
        onAddItemRow={handleAddItemRow}
        onRemoveItemRow={handleRemoveItemRow}
        onItemChange={handleItemChange}
        onSubmit={handleOrderSubmit}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        order={selectedOrder}
        paymentModes={paymentModes}
        isAdmin={isAdmin}
        onClose={() => setSelectedOrder(null)}
        onSubmit={handlePayment}
        onPaymentDeleted={handlePaymentDeleted}
        showToast={showToast}
      />

      {/* Settle & Mark Completed Modal */}
      <SettleModal
        isOpen={showSettleModal}
        onClose={() => setShowSettleModal(false)}
        selectedOrders={selectedOrders}
        ordersWithPendingBalance={ordersWithPendingBalance}
        settlePaymentType={settlePaymentType}
        setSettlePaymentType={setSettlePaymentType}
        settleDate={settleDate}
        setSettleDate={setSettleDate}
        isSettling={isSettling}
        onSubmit={handleConfirmSettlePayments}
        paymentModes={paymentModes}
      />

      {/* Delete Confirmation Modal */}
      <DeleteOrderConfirmModal
        orderToDelete={orderToDelete}
        onClose={() => setOrderToDelete(null)}
        onConfirm={handleDeleteOrder}
      />

      {/* Order Details View & History Modal */}
      <AnimatePresence>
        {viewingOrderDetails && (
          <OrderDetailsModal
            order={viewingOrderDetails}
            onClose={() => setViewingOrderDetails(null)}
            onMakePayment={(order) => {
              setSelectedOrder(order);
            }}
            onEditOrder={openEditOrderForm}
            onPrintOrder={(order) => handlePrintOrders([order])}
            onDeleteOrder={(order) => setOrderToDelete(order)}
            isAdmin={isAdmin}
            onPaymentDeleted={handlePaymentDeleted}
            showToast={showToast}
            isPrinting={isPrinting}
            printingOrderId={printingOrderId}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
