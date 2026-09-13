export const DEFAULT_EXPENSE_CATEGORIES = [
  'Material',
  'Labor / Wages',
  'Transport / Freight',
  'Machinery & Equipment',
  'Site Operations',
  'Fuel',
  'Contractor',
  'Office / Admin',
  'Utilities',
  'Miscellaneous'
];

export const DEFAULT_PAYMENT_MODES = [
  'Cash',
  'UPI',
  'Bank Transfer',
  'Card',
  'Online',
  'Cheque'
];

export const STORAGE_KEY_CATEGORIES = 'BT_EXPENSE_CATEGORIES';
export const STORAGE_KEY_PAYMENT_MODES = 'BT_PAYMENT_MODES';
export const STORAGE_KEY_CATEGORIES_PENDING = 'BT_CATEGORIES_SYNC_PENDING';
export const STORAGE_KEY_PAYMENT_MODES_PENDING = 'BT_PAYMENT_MODES_SYNC_PENDING';

export function getStoredExpenseCategories(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(item => typeof item === 'string' && item.trim().length > 0);
      }
    }
  } catch (err) {
    console.error('Error loading expense categories:', err);
  }
  return DEFAULT_EXPENSE_CATEGORIES;
}

export function saveStoredExpenseCategories(categories: string[], markPending: boolean = true): void {
  try {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
    if (markPending) {
      localStorage.setItem(STORAGE_KEY_CATEGORIES_PENDING, 'true');
    }
    window.dispatchEvent(new CustomEvent('bt_categories_updated', { detail: categories }));
  } catch (err) {
    console.error('Error saving expense categories:', err);
  }
}

export function isCategoriesSyncPending(): boolean {
  return localStorage.getItem(STORAGE_KEY_CATEGORIES_PENDING) === 'true';
}

export function clearCategoriesSyncPending(): void {
  localStorage.removeItem(STORAGE_KEY_CATEGORIES_PENDING);
}

export function getStoredPaymentModes(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAYMENT_MODES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(item => typeof item === 'string' && item.trim().length > 0);
      }
    }
  } catch (err) {
    console.error('Error loading payment modes:', err);
  }
  return DEFAULT_PAYMENT_MODES;
}

export function saveStoredPaymentModes(modes: string[], markPending: boolean = true): void {
  try {
    localStorage.setItem(STORAGE_KEY_PAYMENT_MODES, JSON.stringify(modes));
    if (markPending) {
      localStorage.setItem(STORAGE_KEY_PAYMENT_MODES_PENDING, 'true');
    }
    window.dispatchEvent(new CustomEvent('bt_payment_modes_updated', { detail: modes }));
  } catch (err) {
    console.error('Error saving payment modes:', err);
  }
}

export function isPaymentModesSyncPending(): boolean {
  return localStorage.getItem(STORAGE_KEY_PAYMENT_MODES_PENDING) === 'true';
}

export function clearPaymentModesSyncPending(): void {
  localStorage.removeItem(STORAGE_KEY_PAYMENT_MODES_PENDING);
}
