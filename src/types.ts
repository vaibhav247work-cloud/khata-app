export type Tab = 'Dashboard' | 'Transactions' | 'Orders' | 'Passbook' | 'Reports' | 'Admin';

export type { Transaction, Order, OrderItem, OrderPayment, DeletedRecord } from './db';
export type { SyncTrigger } from './sync';

export interface AppPermissionsPluginType {
  checkStoragePermission(): Promise<{ granted: boolean }>;
  requestStoragePermission(): Promise<{ granted: boolean }>;
}

export interface ToastInfo {
  message: string;
  type: 'success' | 'error' | 'info';
}
