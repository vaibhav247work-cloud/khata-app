import { db, type Order, type Transaction, type DeletedRecord } from '../db';

export const trackDeletedRecords = async (sheet: DeletedRecord['sheet'], recordIds: string[]) => {
  if (recordIds.length === 0) return;
  const now = new Date().toISOString();
  const records: DeletedRecord[] = recordIds.map((id) => ({
    id,
    sheet,
    date: now,
  }));
  await db.deletedRecords.bulkPut(records);
};

export const markAllLocalDataSynced = async () => {
  await Promise.all([
    db.transactions.toCollection().modify({ synced: true }),
    db.orders.toCollection().modify({ synced: true }),
    db.orderPayments.toCollection().modify({ synced: true }),
    db.deletedRecords.clear(),
  ]);
};

export const hasUnsyncedLocalChanges = async () => {
  const [unsyncedTxs, unsyncedOrders, unsyncedPayments, pendingDeletes] = await Promise.all([
    db.transactions.filter((tx) => !tx.synced).count(),
    db.orders.filter((order) => !order.synced).count(),
    db.orderPayments.filter((payment) => !payment.synced).count(),
    db.deletedRecords.count(),
  ]);

  return unsyncedTxs > 0 || unsyncedOrders > 0 || unsyncedPayments > 0 || pendingDeletes > 0;
};

export const reconcileOrdersWithTransactions = async () => {
  const [orders, transactions] = await Promise.all([
    db.orders.toArray(),
    db.transactions.toArray(),
  ]);

  if (orders.length === 0) return;

  const txByOrderId = new Map<string, number>();
  const txBySupplierItem = new Map<string, number>();

  transactions.forEach((tx) => {
    if (tx.type !== 'Debit') return;

    if (tx.order_id) {
      const current = txByOrderId.get(tx.order_id) || 0;
      txByOrderId.set(tx.order_id, current + Number(tx.amount || 0));
    }

    if (tx.category && tx.description) {
      const key = `${tx.category.trim().toLowerCase()}|${tx.description.trim().toLowerCase()}`;
      const current = txBySupplierItem.get(key) || 0;
      txBySupplierItem.set(key, current + Number(tx.amount || 0));
    }
  });

  const ordersToUpdate: { order_id: string; changes: Partial<Order> }[] = [];

  orders.forEach((order) => {
    const fromOrderId = txByOrderId.get(order.order_id);
    let matchedPaid = fromOrderId !== undefined ? fromOrderId : undefined;

    if (matchedPaid === undefined) {
      const itemSummary = Array.isArray(order.items) ? order.items.map((i) => i.material).join(', ') : '';
      const fallbackKey = `${order.supplier.trim().toLowerCase()}|payment done for ${itemSummary.trim().toLowerCase()}`;
      matchedPaid = txBySupplierItem.get(fallbackKey);
    }

    const calculatedPaid = matchedPaid !== undefined ? matchedPaid : Number(order.paid_amount || 0);
    const total = Number(order.total_amount || 0);
    const calculatedRemaining = Math.max(0, total - calculatedPaid);
    const calculatedStatus: Order['status'] =
      calculatedRemaining <= 0 ? 'Completed' : calculatedPaid > 0 ? 'Partial' : 'Pending';

    if (
      Number(order.paid_amount || 0) !== calculatedPaid ||
      Number(order.remaining_amount || 0) !== calculatedRemaining ||
      order.status !== calculatedStatus
    ) {
      ordersToUpdate.push({
        order_id: order.order_id,
        changes: {
          paid_amount: calculatedPaid,
          remaining_amount: calculatedRemaining,
          status: calculatedStatus,
        },
      });
    }
  });

  for (const { order_id, changes } of ordersToUpdate) {
    await db.orders.update(order_id, changes);
  }
};

export const deleteTransactionsWithRecalculation = async (transactionIds: Set<string> | string[]): Promise<number> => {
  const idsArray = Array.from(transactionIds);
  if (idsArray.length === 0) return 0;

  // 1. Fetch transactions before deleting to identify their amounts and relations
  const txsToDelete = await db.transactions.where('id').anyOf(idsArray).toArray();
  if (txsToDelete.length === 0) return 0;

  // 2. Track deleted transactions for cloud sync
  await trackDeletedRecords('Transactions', idsArray);

  // 3. Delete transactions locally
  await db.transactions.bulkDelete(idsArray);

  // 4. Also clean up associated OrderPayments if any
  for (const tx of txsToDelete) {
    if (tx.order_id) {
      const payments = await db.orderPayments.where('order_id').equals(tx.order_id).toArray();
      const matchingPayments = payments.filter((p) => p.amount === tx.amount && p.date === tx.date);
      if (matchingPayments.length > 0) {
        const paymentIds = matchingPayments.map((p) => p.payment_id);
        await trackDeletedRecords('OrderPayments', paymentIds);
        await db.orderPayments.bulkDelete(paymentIds);
      }
    } else {
      const order = await db.orders.where('supplier').equals(tx.category).first();
      if (order) {
        const payments = await db.orderPayments.where('order_id').equals(order.order_id).toArray();
        const matchingPayments = payments.filter((p) => p.amount === tx.amount && p.date === tx.date);
        if (matchingPayments.length > 0) {
          const paymentIds = matchingPayments.map((p) => p.payment_id);
          await trackDeletedRecords('OrderPayments', paymentIds);
          await db.orderPayments.bulkDelete(paymentIds);
        }
      }
    }
  }

  // 5. Always run global reconciliation so orders immediately reflect accurate balance & status
  await reconcileOrdersWithTransactions();

  return txsToDelete.length;
};

export const deleteOrderWithAssociated = async (order: Order) => {
  // 1. Find and track all payments for this order
  const payments = await db.orderPayments.where('order_id').equals(order.order_id).toArray();
  const paymentIds = payments.map((p) => p.payment_id);
  if (paymentIds.length > 0) {
    await trackDeletedRecords('OrderPayments', paymentIds);
    await db.orderPayments.bulkDelete(paymentIds);
  }

  // 2. Find and track all transactions for this order
  const txsByOrderId = await db.transactions.where('order_id').equals(order.order_id).toArray();
  const txIdsByOrderId = txsByOrderId.map((t) => t.id);

  // Fallback for older transactions without order_id
  const itemSummary = Array.isArray(order.items) ? order.items.map((i) => i.material).join(', ') : '';
  const txsByDesc = itemSummary
    ? await db.transactions
        .where('category')
        .equals(order.supplier)
        .and((t) => t.description === `Payment done for ${itemSummary}`)
        .toArray()
    : [];
  const txIdsByDesc = txsByDesc.map((t) => t.id);

  const allTxIdsToDelete = Array.from(new Set([...txIdsByOrderId, ...txIdsByDesc]));
  if (allTxIdsToDelete.length > 0) {
    await trackDeletedRecords('Transactions', allTxIdsToDelete);
    await db.transactions.bulkDelete(allTxIdsToDelete);
  }

  // 3. Track and delete the order itself
  await trackDeletedRecords('Orders', [order.order_id]);
  await db.orders.delete(order.order_id);
};
