import { db, type Order, type OrderPayment, type Transaction, type DeletedRecord } from './db';

const SHEET_NAMES = {
  transactions: 'Transactions',
  orders: 'Orders',
  payments: 'OrderPayments',
} as const;

type SheetRow = Record<string, string | number | boolean>;

export type SyncTrigger = 'manual' | 'background' | 'reconnect';

const serializeTransaction = (tx: Transaction): SheetRow => ({
  id: tx.id,
  date: tx.date,
  type: tx.type,
  category: tx.category,
  amount: tx.amount,
  payment_type: tx.payment_type,
  description: tx.description,
  reference: tx.reference ?? '',
  order_id: tx.order_id ?? '',
  synced: true,
});

const serializeOrder = (order: Order): SheetRow => ({
  order_id: order.order_id,
  items: JSON.stringify(order.items ?? []),
  supplier: order.supplier,
  total_amount: order.total_amount,
  paid_amount: order.paid_amount,
  remaining_amount: order.remaining_amount,
  status: order.status,
  date: order.date,
  synced: true,
});

const serializePayment = (payment: OrderPayment): SheetRow => ({
  payment_id: payment.payment_id,
  order_id: payment.order_id,
  amount: payment.amount,
  payment_type: payment.payment_type,
  date: payment.date,
  synced: true,
});

const requestJson = async (apiLink: string, init: RequestInit) => {
  const response = await fetch(apiLink, { ...init, mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Google Sheets request failed (${response.status})`);
  }
  const payload = await response.json();
  if (payload?.error || payload?.success === false) {
    throw new Error(payload.error || 'Google Sheets rejected the request');
  }
  return payload;
};

const syncSheet = async (apiLink: string, sheet: string, data: SheetRow[]) => {
  if (data.length === 0) return;
  await requestJson(apiLink, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'sync',
      sheet,
      data,
    }),
  });
};

const deleteFromSheet = async (apiLink: string, sheet: string, keys: string[]): Promise<boolean> => {
  if (keys.length === 0) return true;
  
  try {
    // 1. Try dedicated 'delete' action
    await requestJson(apiLink, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'delete',
        sheet,
        keys,
      }),
    });
    return true;
  } catch (error: any) {
    const errorMsg = error?.message ? String(error.message).toLowerCase() : '';
    
    // If the deployed Apps Script returns "Invalid action", fallback to action: 'sync' with deleteKeys
    if (errorMsg.includes('invalid action')) {
      try {
        await requestJson(apiLink, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: JSON.stringify({
            action: 'sync',
            sheet,
            data: [],
            deleteKeys: keys,
            keys,
          }),
        });
        return true;
      } catch (fallbackError: any) {
        console.warn('Google Sheet deletion skipped (Google Apps Script update recommended):', fallbackError?.message || fallbackError);
        // Do not crash sync for older deployed Google Apps Script scripts
        return false;
      }
    }
    
    // For network errors / invalid URLs, throw so caller is aware
    throw error;
  }
};

export const trackDeletedRecords = async (sheet: 'Transactions' | 'Orders' | 'OrderPayments', ids: string[]) => {
  const cleanIds = ids.filter((id) => id && id.trim() !== '');
  if (cleanIds.length === 0) return;
  const now = new Date().toISOString();
  const records: DeletedRecord[] = cleanIds.map((id) => ({
    id,
    sheet,
    date: now,
  }));
  await db.deletedRecords.bulkPut(records);
};

export const hasUnsyncedLocalChanges = async () => {
  const [transactionCount, orderCount, paymentCount, deletedCount] = await Promise.all([
    db.transactions.filter((tx) => !tx.synced).count(),
    db.orders.filter((order) => !order.synced).count(),
    db.orderPayments.filter((payment) => !payment.synced).count(),
    db.deletedRecords.count(),
  ]);

  return transactionCount + orderCount + paymentCount + deletedCount > 0;
};

export const pushDeletedRecordsToGoogleSheets = async (apiLink: string) => {
  const deletedRecords = await db.deletedRecords.toArray();
  if (deletedRecords.length === 0) return;

  const txKeys = deletedRecords.filter((d) => d.sheet === 'Transactions').map((d) => d.id);
  const orderKeys = deletedRecords.filter((d) => d.sheet === 'Orders').map((d) => d.id);
  const paymentKeys = deletedRecords.filter((d) => d.sheet === 'OrderPayments').map((d) => d.id);

  const successfullyDeletedIds: string[] = [];

  if (txKeys.length > 0) {
    const success = await deleteFromSheet(apiLink, SHEET_NAMES.transactions, txKeys);
    if (success) successfullyDeletedIds.push(...txKeys);
  }
  if (orderKeys.length > 0) {
    const success = await deleteFromSheet(apiLink, SHEET_NAMES.orders, orderKeys);
    if (success) successfullyDeletedIds.push(...orderKeys);
  }
  if (paymentKeys.length > 0) {
    const success = await deleteFromSheet(apiLink, SHEET_NAMES.payments, paymentKeys);
    if (success) successfullyDeletedIds.push(...paymentKeys);
  }

  // Once Google Sheets has successfully deleted the rows, clear them from local deletedRecords tracking
  if (successfullyDeletedIds.length > 0) {
    await db.deletedRecords.bulkDelete(successfullyDeletedIds);
  }
};

export const pushLocalDataToGoogleSheets = async (apiLink: string) => {
  // First, push all deleted records so they are removed from Google Sheets
  await pushDeletedRecordsToGoogleSheets(apiLink);

  // Then, push any unsynced local records
  const [transactions, orders, payments] = await Promise.all([
    db.transactions.filter((tx) => !tx.synced).toArray(),
    db.orders.filter((order) => !order.synced).toArray(),
    db.orderPayments.filter((payment) => !payment.synced).toArray(),
  ]);

  await Promise.all([
    syncSheet(apiLink, SHEET_NAMES.transactions, transactions.map(serializeTransaction)),
    syncSheet(apiLink, SHEET_NAMES.orders, orders.map(serializeOrder)),
    syncSheet(apiLink, SHEET_NAMES.payments, payments.map(serializePayment)),
  ]);
};

const getSheetRows = async (apiLink: string, sheet: string): Promise<SheetRow[]> => {
  const url = new URL(apiLink);
  url.searchParams.set('sheet', sheet);
  const rows = await requestJson(url.toString(), { method: 'GET' });
  if (!Array.isArray(rows)) {
    throw new Error(`Invalid response received for ${sheet}`);
  }
  return rows as SheetRow[];
};

const asNumber = (value: string | number | boolean | undefined) => Number(value || 0);
const asString = (value: string | number | boolean | undefined) => String(value ?? '');

const pullOnlineDataIntoLocalDb = async (apiLink: string) => {
  const [transactionRows, orderRows, paymentRows, pendingDeletes] = await Promise.all([
    getSheetRows(apiLink, SHEET_NAMES.transactions),
    getSheetRows(apiLink, SHEET_NAMES.orders),
    getSheetRows(apiLink, SHEET_NAMES.payments),
    db.deletedRecords.toArray(),
  ]);

  const deletedIdSet = new Set(pendingDeletes.map((d) => d.id));

  await db.transaction('rw', db.transactions, db.orders, db.orderPayments, async () => {
    // Filter out rows that were deleted locally and are pending deletion sync
    const validTxRows = transactionRows.filter((row) => asString(row.id) && !deletedIdSet.has(asString(row.id)));
    const validOrderRows = orderRows.filter((row) => asString(row.order_id) && !deletedIdSet.has(asString(row.order_id)));
    const validPaymentRows = paymentRows.filter((row) => asString(row.payment_id) && !deletedIdSet.has(asString(row.payment_id)));

    await db.transactions.bulkPut(validTxRows
      .map((row) => ({
        id: asString(row.id), date: asString(row.date), type: asString(row.type) as Transaction['type'],
        category: asString(row.category), amount: asNumber(row.amount),
        payment_type: asString(row.payment_type) as Transaction['payment_type'],
        description: asString(row.description), reference: asString(row.reference),
        order_id: asString(row.order_id) || undefined, synced: true,
      })));

    await db.orders.bulkPut(validOrderRows
      .map((row) => ({
        order_id: asString(row.order_id),
        items: (() => { try { return JSON.parse(asString(row.items)) || []; } catch { return []; } })(),
        supplier: asString(row.supplier), total_amount: asNumber(row.total_amount),
        paid_amount: asNumber(row.paid_amount), remaining_amount: asNumber(row.remaining_amount),
        status: asString(row.status) as Order['status'], date: asString(row.date), synced: true,
      })));

    await db.orderPayments.bulkPut(validPaymentRows
      .map((row) => ({
        payment_id: asString(row.payment_id), order_id: asString(row.order_id),
        amount: asNumber(row.amount), payment_type: asString(row.payment_type),
        date: asString(row.date), synced: true,
      })));
  });

  // Automatically reconcile orders with transactions so balances & status are always 100% accurate
  await reconcileOrdersWithTransactions();
};

export const reconcileOrdersWithTransactions = async () => {
  const [allOrders, allTxs] = await Promise.all([
    db.orders.toArray(),
    db.transactions.toArray(),
  ]);

  if (allOrders.length === 0) return;

  for (const order of allOrders) {
    // Find all active debit transactions associated with this order
    const orderTxs = allTxs.filter((t) => {
      if (t.type !== 'Debit') return false;
      if (t.order_id && t.order_id === order.order_id) return true;
      // Fallback matching by supplier and description for older transactions
      if (order.supplier && t.category === order.supplier && t.description && t.description.startsWith('Payment done for')) {
        return true;
      }
      return false;
    });

    const actualPaid = orderTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const totalAmount = Number(order.total_amount) || 0;
    const expectedRemaining = Math.max(0, totalAmount - actualPaid);
    
    let expectedStatus: Order['status'] = 'Pending';
    if (expectedRemaining <= 0 && totalAmount > 0) {
      expectedStatus = 'Completed';
    } else if (actualPaid > 0) {
      expectedStatus = 'Partial';
    } else {
      expectedStatus = 'Pending';
    }

    if (
      order.paid_amount !== actualPaid ||
      order.remaining_amount !== expectedRemaining ||
      order.status !== expectedStatus
    ) {
      await db.orders.update(order.order_id, {
        paid_amount: actualPaid,
        remaining_amount: expectedRemaining,
        status: expectedStatus,
        synced: false,
      });
    }
  }
};

export const syncLocalAndGoogleSheets = async (apiLink: string) => {
  await pushLocalDataToGoogleSheets(apiLink);
  await pullOnlineDataIntoLocalDb(apiLink);
  await markAllLocalDataSynced();
};

export const markAllLocalDataSynced = async () => {
  await Promise.all([
    db.transactions.toCollection().modify((tx) => {
      tx.synced = true;
    }),
    db.orders.toCollection().modify((order) => {
      order.synced = true;
    }),
    db.orderPayments.toCollection().modify((payment) => {
      payment.synced = true;
    }),
  ]);
};

export const deleteTransactionsWithRecalculation = async (idsToDelete: string[]) => {
  if (idsToDelete.length === 0) return;

  // 1. Get transactions before deleting them
  const txs = await db.transactions.where('id').anyOf(idsToDelete).toArray();
  const orderIds = new Set<string>();

  for (const tx of txs) {
    if (tx.order_id) {
      orderIds.add(tx.order_id);
    }
  }

  // 2. Track deleted transactions for Google Sheets sync
  await trackDeletedRecords('Transactions', idsToDelete);

  // 3. Delete transactions from Dexie
  await db.transactions.bulkDelete(idsToDelete);

  // 4. Also clean up any associated orderPayments if any match
  if (orderIds.size > 0) {
    for (const tx of txs) {
      if (tx.order_id) {
        // Find matching payment with same order_id, amount and date
        const matchingPayments = await db.orderPayments
          .where('order_id')
          .equals(tx.order_id)
          .and((p) => Math.abs(Number(p.amount) - Number(tx.amount)) < 0.01)
          .toArray();

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


