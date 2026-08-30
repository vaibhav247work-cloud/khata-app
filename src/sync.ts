import { db, type Order, type OrderPayment, type Transaction } from './db';

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

export const hasUnsyncedLocalChanges = async () => {
  const [transactionCount, orderCount, paymentCount] = await Promise.all([
    db.transactions.filter((tx) => !tx.synced).count(),
    db.orders.filter((order) => !order.synced).count(),
    db.orderPayments.filter((payment) => !payment.synced).count(),
  ]);

  return transactionCount + orderCount + paymentCount > 0;
};

export const pushLocalDataToGoogleSheets = async (apiLink: string) => {
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
  const [transactionRows, orderRows, paymentRows] = await Promise.all([
    getSheetRows(apiLink, SHEET_NAMES.transactions),
    getSheetRows(apiLink, SHEET_NAMES.orders),
    getSheetRows(apiLink, SHEET_NAMES.payments),
  ]);

  await db.transaction('rw', db.transactions, db.orders, db.orderPayments, async () => {
    await db.transactions.bulkPut(transactionRows
      .filter((row) => asString(row.id))
      .map((row) => ({
        id: asString(row.id), date: asString(row.date), type: asString(row.type) as Transaction['type'],
        category: asString(row.category), amount: asNumber(row.amount),
        payment_type: asString(row.payment_type) as Transaction['payment_type'],
        description: asString(row.description), reference: asString(row.reference),
        order_id: asString(row.order_id) || undefined, synced: true,
      })));

    await db.orders.bulkPut(orderRows
      .filter((row) => asString(row.order_id))
      .map((row) => ({
        order_id: asString(row.order_id),
        items: (() => { try { return JSON.parse(asString(row.items)) || []; } catch { return []; } })(),
        supplier: asString(row.supplier), total_amount: asNumber(row.total_amount),
        paid_amount: asNumber(row.paid_amount), remaining_amount: asNumber(row.remaining_amount),
        status: asString(row.status) as Order['status'], date: asString(row.date), synced: true,
      })));

    await db.orderPayments.bulkPut(paymentRows
      .filter((row) => asString(row.payment_id))
      .map((row) => ({
        payment_id: asString(row.payment_id), order_id: asString(row.order_id),
        amount: asNumber(row.amount), payment_type: asString(row.payment_type),
        date: asString(row.date), synced: true,
      })));
  });
};

export const syncLocalAndGoogleSheets = async (apiLink: string) => {
  // There is no updatedAt/version field in the current schema. Therefore an
  // unsynced local edit wins (it is pushed first); otherwise the latest sheet
  // value is accepted during the pull. A failed push/pull leaves local flags
  // unchanged so a later retry cannot silently discard the pending edit.
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
