import { db, type Order, type OrderPayment, type Transaction } from '../db';
import { reconcileOrdersWithTransactions } from './reconcile';

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
          }),
        });
        return true;
      } catch (innerError) {
        console.warn(`Fallback delete for sheet "${sheet}" failed:`, innerError);
      }
    }
    return false;
  }
};

const readSheet = async (apiLink: string, sheet: string): Promise<Record<string, unknown>[]> => {
  const url = new URL(apiLink);
  url.searchParams.set('action', 'read');
  url.searchParams.set('sheet', sheet);

  const payload = await requestJson(url.toString(), {
    method: 'GET',
  });

  return Array.isArray(payload?.data) ? (payload.data as Record<string, unknown>[]) : [];
};

export const syncLocalAndGoogleSheets = async (apiLink: string) => {
  // 1. Process pending deletions
  const pendingDeletes = await db.deletedRecords.toArray();
  if (pendingDeletes.length > 0) {
    const txDeletes = pendingDeletes.filter((d) => d.sheet === 'Transactions').map((d) => d.id);
    const orderDeletes = pendingDeletes.filter((d) => d.sheet === 'Orders').map((d) => d.id);
    const paymentDeletes = pendingDeletes.filter((d) => d.sheet === 'OrderPayments').map((d) => d.id);

    const successfulDeletes: string[] = [];

    if (txDeletes.length > 0) {
      const ok = await deleteFromSheet(apiLink, SHEET_NAMES.transactions, txDeletes);
      if (ok) successfulDeletes.push(...pendingDeletes.filter((d) => d.sheet === 'Transactions').map((d) => d.id));
    }
    if (orderDeletes.length > 0) {
      const ok = await deleteFromSheet(apiLink, SHEET_NAMES.orders, orderDeletes);
      if (ok) successfulDeletes.push(...pendingDeletes.filter((d) => d.sheet === 'Orders').map((d) => d.id));
    }
    if (paymentDeletes.length > 0) {
      const ok = await deleteFromSheet(apiLink, SHEET_NAMES.payments, paymentDeletes);
      if (ok) successfulDeletes.push(...pendingDeletes.filter((d) => d.sheet === 'OrderPayments').map((d) => d.id));
    }

    if (successfulDeletes.length > 0) {
      await db.deletedRecords.bulkDelete(successfulDeletes);
    }
  }

  // 2. Fetch remote records
  const [remoteTxsRaw, remoteOrdersRaw, remotePaymentsRaw] = await Promise.all([
    readSheet(apiLink, SHEET_NAMES.transactions),
    readSheet(apiLink, SHEET_NAMES.orders),
    readSheet(apiLink, SHEET_NAMES.payments),
  ]);

  const remoteTxs: Transaction[] = remoteTxsRaw.map((row) => ({
    id: String(row.id || ''),
    date: String(row.date || ''),
    type: (row.type as 'Credit' | 'Debit') || 'Debit',
    category: String(row.category || ''),
    amount: Number(row.amount || 0),
    payment_type: (row.payment_type as Transaction['payment_type']) || 'Cash',
    description: String(row.description || ''),
    reference: row.reference ? String(row.reference) : undefined,
    order_id: row.order_id ? String(row.order_id) : undefined,
    synced: true,
  })).filter((tx) => tx.id && tx.date);

  const remoteOrders: Order[] = remoteOrdersRaw.map((row) => {
    let items: Order['items'] = [];
    if (typeof row.items === 'string') {
      try {
        items = JSON.parse(row.items);
      } catch {
        items = [];
      }
    } else if (Array.isArray(row.items)) {
      items = row.items as Order['items'];
    }

    return {
      id: String(row.order_id || ''),
      order_id: String(row.order_id || ''),
      items,
      supplier: String(row.supplier || ''),
      total_amount: Number(row.total_amount || 0),
      paid_amount: Number(row.paid_amount || 0),
      remaining_amount: Number(row.remaining_amount || 0),
      status: (row.status as Order['status']) || 'Pending',
      date: String(row.date || ''),
      synced: true,
    };
  }).filter((order) => order.order_id && order.date);

  const remotePayments: OrderPayment[] = remotePaymentsRaw.map((row) => ({
    payment_id: String(row.payment_id || ''),
    order_id: String(row.order_id || ''),
    amount: Number(row.amount || 0),
    payment_type: String(row.payment_type || 'Cash'),
    date: String(row.date || ''),
    synced: true,
  })).filter((p) => p.payment_id && p.order_id);

  // 3. Upsert into local database
  if (remoteTxs.length > 0) await db.transactions.bulkPut(remoteTxs);
  if (remoteOrders.length > 0) await db.orders.bulkPut(remoteOrders);
  if (remotePayments.length > 0) await db.orderPayments.bulkPut(remotePayments);

  // 4. Push local changes
  const [localTxs, localOrders, localPayments] = await Promise.all([
    db.transactions.toArray(),
    db.orders.toArray(),
    db.orderPayments.toArray(),
  ]);

  await syncSheet(apiLink, SHEET_NAMES.transactions, localTxs.map(serializeTransaction));
  await syncSheet(apiLink, SHEET_NAMES.orders, localOrders.map(serializeOrder));
  await syncSheet(apiLink, SHEET_NAMES.payments, localPayments.map(serializePayment));

  // 5. Mark local records as synced
  await Promise.all([
    db.transactions.toCollection().modify({ synced: true }),
    db.orders.toCollection().modify({ synced: true }),
    db.orderPayments.toCollection().modify({ synced: true }),
    db.deletedRecords.clear(),
  ]);

  // 6. Final reconciliation
  await reconcileOrdersWithTransactions();
};
