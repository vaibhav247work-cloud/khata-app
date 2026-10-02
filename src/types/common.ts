export type Tab = 'Dashboard' | 'Transactions' | 'Orders' | 'Passbook' | 'Reports' | 'Admin';

export type FilterDate = 'All' | 'Today' | 'This Week' | 'This Month' | 'Custom';

export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface PdfPreviewData {
  blob: Blob;
  filename: string;
  base64Data: string;
  rawArrayBuffer?: ArrayBuffer;
  title: string;
}

export interface CustomDateRange {
  start: string;
  end: string;
}
