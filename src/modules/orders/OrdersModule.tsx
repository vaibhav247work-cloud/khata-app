import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Package } from 'lucide-react';
import type { Order, OrderItem } from '../../types';
import { generateAndShareOrderReceipts } from './orderReceiptPdf';
import { OrderCard } from './OrderCard';
import { OrdersHeaderBar } from './OrdersHeaderBar';
import { OrdersSummaryBar } from './OrdersSummaryBar';
import { OrdersBulkToolbar } from './OrdersBulkToolbar';
import { OrderFormModal } from './OrderFormModal';
import { OrderPaymentModal } from './OrderPaymentModal';
import { OrderSettleModal } from './OrderSettleModal';
import { OrderDeleteModal } from './OrderDeleteModal';
import { 
  bulkSettleOrders, 
  saveOrder, 
  recordOrderPayment, 
  deleteOrder 
} from './orderOperations';

interface OrdersModuleProps {
  orders: Order[];
  onUpdate: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  isAdmin?: boolean;
  markSyncPending: () => void;
}

export function OrdersModule({ orders, onUpdate, showToast, isAdmin, markSyncPending }: OrdersModuleProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Partial' | 'Completed'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [orderIdToDelete, setOrderIdToDelete] = useState<string | null>(null);

  // Multi-Selection State for Orders
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [showBulkSettleModal, setShowBulkSettleModal] = useState(false);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [createTxForSettle, setCreateTxForSettle] = useState(true);
  const [settlePaymentMode, setSettlePaymentMode] = useState('UPI');

  // Form State for Items
  const [items, setItems] = useState<OrderItem[]>([{ material: '', quantity: '', amount: 0 }]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter(o => {
        const matchesStatus = statusFilter === 'All' || o.status === statusFilter;
        const matchesSearch = o.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (o.items && o.items.some(i => i.material.toLowerCase().includes(searchQuery.toLowerCase())));
        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => {
        return sortOrder === 'desc' 
          ? b.date.localeCompare(a.date)
          : a.date.localeCompare(b.date);
      });
  }, [orders, statusFilter, searchQuery, sortOrder]);

  const allFilteredSelected = filteredOrders.length > 0 && filteredOrders.every(o => selectedOrderIds.has(o.order_id));

  const toggleSelectOrder = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllOrders = () => {
    if (allFilteredSelected) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map(o => o.order_id)));
    }
  };

  const cancelSelection = () => setSelectedOrderIds(new Set());

  const selectedOrdersList = useMemo(() => {
    return orders.filter(o => selectedOrderIds.has(o.order_id));
  }, [orders, selectedOrderIds]);

  const totalOrderValue = filteredOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  const totalPaidValue = filteredOrders.reduce((sum, o) => sum + (Number(o.paid_amount) || 0), 0);
  const totalRemainingValue = filteredOrders.reduce((sum, o) => sum + (Number(o.remaining_amount) || 0), 0);

  const handleBulkPrintReceipts = async () => {
    if (selectedOrdersList.length === 0) return;
    await generateAndShareOrderReceipts(selectedOrdersList, showToast);
  };

  const handleBulkSettleAndComplete = async () => {
    if (selectedOrdersList.length === 0) return;
    setIsBulkProcessing(true);
    try {
      await bulkSettleOrders(selectedOrdersList, createTxForSettle, settlePaymentMode);
      markSyncPending();
      onUpdate();
      showToast(`Successfully completed and settled ${selectedOrdersList.length} order${selectedOrdersList.length > 1 ? 's' : ''}!`, 'success');
      setSelectedOrderIds(new Set());
      setShowBulkSettleModal(false);
    } catch (err) {
      console.error('Bulk settle failed:', err);
      showToast('Failed to complete selected orders', 'error');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleOrderSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await saveOrder(new FormData(e.currentTarget), items, editingOrder);
    showToast(result === 'updated' ? 'Order updated' : 'Order created', 'success');
    markSyncPending();
    setShowAdd(false);
    setEditingOrder(null);
    setItems([{ material: '', quantity: '', amount: 0 }]);
    onUpdate();
  };

  const handlePaymentSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!payingOrder) return;
    await recordOrderPayment(payingOrder, new FormData(e.currentTarget));
    markSyncPending();
    setPayingOrder(null);
    onUpdate();
    showToast('Payment recorded and transaction added', 'success');
  };

  const handleDeleteOrder = async () => {
    if (!orderIdToDelete) return;
    try {
      await deleteOrder(orderIdToDelete, orders);
      markSyncPending();
      setOrderIdToDelete(null);
      onUpdate();
      showToast('Order deleted', 'success');
    } catch (e) {
      console.error('Delete order error:', e);
      showToast('Failed to delete order', 'error');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
      <OrdersHeaderBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortOrder={sortOrder}
        onToggleSort={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
        hasFilteredOrders={filteredOrders.length > 0}
        selectedCount={selectedOrderIds.size}
        onToggleSelection={() => {
          if (selectedOrderIds.size > 0) cancelSelection();
          else toggleSelectAllOrders();
        }}
        onCreateOrder={() => {
          setEditingOrder(null);
          setItems([{ material: '', quantity: '', amount: 0 }]);
          setShowAdd(true);
        }}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        orders={orders}
      />

      {/* Filtered Orders Financial Summary Row */}
      <OrdersSummaryBar
        orderCount={filteredOrders.length}
        totalOrderValue={totalOrderValue}
        totalPaidValue={totalPaidValue}
        totalRemainingValue={totalRemainingValue}
      />

      {/* Multi-Select Action Toolbar for Orders */}
      <OrdersBulkToolbar
        selectedCount={selectedOrderIds.size}
        allFilteredSelected={allFilteredSelected}
        onToggleSelectAll={toggleSelectAllOrders}
        onBulkPrint={handleBulkPrintReceipts}
        onBulkComplete={() => setShowBulkSettleModal(true)}
        onCancelSelection={cancelSelection}
      />

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.map(order => (
          <OrderCard
            key={order.order_id}
            order={order}
            isSelected={selectedOrderIds.has(order.order_id)}
            onToggleSelect={toggleSelectOrder}
            onPrintReceipt={(o) => generateAndShareOrderReceipts([o], showToast)}
            onEdit={(o) => {
              setEditingOrder(o);
              setItems(o.items && o.items.length > 0 ? o.items : [{ material: '', quantity: '', amount: 0 }]);
              setShowAdd(true);
            }}
            onOpenPayment={(o) => setPayingOrder(o)}
            onOpenDelete={(id) => setOrderIdToDelete(id)}
            isAdmin={isAdmin}
          />
        ))}

        {filteredOrders.length === 0 && (
          <div className="text-center py-16 bg-zinc-900/50 border border-zinc-800 border-dashed rounded-[32px]">
            <div className="w-14 h-14 bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Package className="text-zinc-600 w-7 h-7" />
            </div>
            <p className="text-zinc-400 font-medium text-sm">No orders found</p>
            <p className="text-zinc-600 text-xs mt-1">Try switching filters or create a new order</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <OrderFormModal
        isOpen={showAdd || !!editingOrder}
        editingOrder={editingOrder}
        items={items}
        setItems={setItems}
        onClose={() => { setShowAdd(false); setEditingOrder(null); }}
        onSubmit={handleOrderSubmit}
      />

      <OrderPaymentModal
        order={payingOrder}
        onClose={() => setPayingOrder(null)}
        onSubmit={handlePaymentSubmit}
      />

      <OrderSettleModal
        isOpen={showBulkSettleModal}
        selectedOrders={selectedOrdersList}
        isBulkProcessing={isBulkProcessing}
        createTxForSettle={createTxForSettle}
        setCreateTxForSettle={setCreateTxForSettle}
        settlePaymentMode={settlePaymentMode}
        setSettlePaymentMode={setSettlePaymentMode}
        onClose={() => !isBulkProcessing && setShowBulkSettleModal(false)}
        onConfirm={handleBulkSettleAndComplete}
      />

      <OrderDeleteModal
        orderIdToDelete={orderIdToDelete}
        onClose={() => setOrderIdToDelete(null)}
        onConfirm={handleDeleteOrder}
      />
    </motion.div>
  );
}
