import { format } from 'date-fns';
import { db } from '../../db';
import { deleteOrderWithAssociated } from '../../sync';
import type { Order, OrderItem } from '../../types';

export async function bulkSettleOrders(
  selectedOrders: Order[],
  createTxForSettle: boolean,
  settlePaymentMode: string
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();

  for (const order of selectedOrders) {
    const remainingToPay = Number(order.remaining_amount) || 0;

    if (remainingToPay > 0 && createTxForSettle) {
      const paymentId = crypto.randomUUID();
      await db.transactions.add({
        id: paymentId,
        date: nowIso,
        type: 'Debit',
        category: order.supplier,
        amount: remainingToPay,
        payment_type: settlePaymentMode as any,
        description: `Payment done for ${order.supplier} (ORD-${order.order_id.slice(0, 6).toUpperCase()})`,
        reference: `ORD-${order.order_id.slice(0, 8)}`,
        order_id: order.order_id,
        synced: false,
      });

      await db.orderPayments.add({
        payment_id: paymentId,
        order_id: order.order_id,
        amount: remainingToPay,
        payment_type: settlePaymentMode,
        date: nowIso,
        synced: false,
      });

      await db.orders.update(order.order_id, {
        status: 'Completed',
        paid_amount: order.total_amount,
        remaining_amount: 0,
        synced: false,
      });
    } else {
      await db.orders.update(order.order_id, {
        status: 'Completed',
        paid_amount: order.total_amount,
        remaining_amount: 0,
        synced: false,
      });
    }
  }
}

export async function saveOrder(
  formData: FormData,
  items: OrderItem[],
  editingOrder: Order | null
): Promise<'updated' | 'created'> {
  const supplier = formData.get('supplier') as string;
  const selectedDate = formData.get('date') as string;
  const now = new Date();
  const timeStr = editingOrder?.date.split('T')[1] || format(now, 'HH:mm:ss');
  const fullDate = `${selectedDate}T${timeStr}`;
  const validItems = items.filter(item => item.material.trim() !== '' && item.amount > 0);
  const total_amount = validItems.reduce((sum, item) => sum + Number(item.amount), 0);

  if (editingOrder) {
    const remaining_amount = total_amount - editingOrder.paid_amount;
    const status = remaining_amount <= 0 ? 'Completed' : editingOrder.paid_amount > 0 ? 'Partial' : 'Pending';

    await db.orders.update(editingOrder.order_id, {
      supplier,
      date: fullDate,
      items: validItems,
      total_amount,
      remaining_amount: Math.max(0, remaining_amount),
      status,
      synced: false,
    });
    return 'updated';
  } else {
    const order_id = crypto.randomUUID();
    await db.orders.add({
      order_id,
      supplier,
      date: fullDate,
      items: validItems,
      total_amount,
      paid_amount: 0,
      remaining_amount: total_amount,
      status: 'Pending',
      synced: false,
    });
    return 'created';
  }
}

export async function recordOrderPayment(
  payingOrder: Order,
  formData: FormData
): Promise<void> {
  const amount = Number(formData.get('amount'));
  const payment_type = formData.get('payment_type') as string;
  const description = formData.get('description') as string;
  const selectedDate = formData.get('date') as string;
  const now = new Date();
  const fullDate = `${selectedDate}T${format(now, 'HH:mm:ss')}`;
  const paymentId = crypto.randomUUID();

  await db.transactions.add({
    id: paymentId,
    date: fullDate,
    type: 'Debit',
    category: payingOrder.supplier,
    amount,
    payment_type: payment_type as any,
    description,
    reference: `ORD-${payingOrder.order_id.slice(0, 8)}`,
    order_id: payingOrder.order_id,
    synced: false,
  });

  await db.orderPayments.add({
    payment_id: paymentId,
    order_id: payingOrder.order_id,
    amount,
    payment_type,
    date: fullDate,
    synced: false,
  });

  const newPaidAmount = payingOrder.paid_amount + amount;
  const newRemainingAmount = payingOrder.total_amount - newPaidAmount;
  const newStatus = newRemainingAmount <= 0 ? 'Completed' : 'Partial';

  await db.orders.update(payingOrder.order_id, {
    paid_amount: newPaidAmount,
    remaining_amount: Math.max(0, newRemainingAmount),
    status: newStatus,
    synced: false,
  });
}

export async function deleteOrder(
  orderId: string,
  orders: Order[]
): Promise<void> {
  const orderToDelete = orders.find(o => o.order_id === orderId);
  if (orderToDelete) {
    await deleteOrderWithAssociated(orderToDelete);
  } else {
    await db.orders.delete(orderId);
  }
}
