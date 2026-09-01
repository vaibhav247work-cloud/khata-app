import Dexie, { type Table } from 'dexie';

export interface Transaction {
  id: string;
  date: string;
  type: 'Credit' | 'Debit';
  category: string;
  amount: number;
  payment_type: 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Online';
  description: string;
  reference?: string;
  order_id?: string;
  synced: boolean;
}

export interface OrderItem {
  id: string;
  material: string;
  quantity: string;
  amount: number;
}

export interface Order {
  order_id: string;
  items: OrderItem[];
  supplier: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: 'Pending' | 'Partial' | 'Completed';
  date: string;
  synced: boolean;
}

export interface OrderPayment {
  payment_id: string;
  order_id: string;
  amount: number;
  payment_type: string;
  date: string;
  synced: boolean;
}

export interface DeletedRecord {
  id: string;
  sheet: 'Transactions' | 'Orders' | 'OrderPayments';
  date: string;
}

export class BuildTrackDB extends Dexie {
  transactions!: Table<Transaction>;
  orders!: Table<Order>;
  orderPayments!: Table<OrderPayment>;
  deletedRecords!: Table<DeletedRecord>;

  constructor() {
    super('BuildTrackDB');
    this.version(2).stores({
      transactions: 'id, date, type, category, payment_type, synced, order_id',
      orders: 'order_id, supplier, status, date, synced',
      orderPayments: 'payment_id, order_id, date, synced'
    });
    this.version(3).stores({
      transactions: 'id, date, type, category, payment_type, synced, order_id',
      orders: 'order_id, supplier, status, date, synced',
      orderPayments: 'payment_id, order_id, date, synced',
      deletedRecords: 'id, sheet, date'
    });
  }
}

export const db = new BuildTrackDB();
