import { format, parseISO } from 'date-fns';
import { type Order, type Transaction } from '../db';

/**
 * Open WhatsApp with pre-composed text, with clipboard copy fallback.
 */
export async function shareToWhatsApp(text: string, phone?: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch (e) {
    console.warn('Clipboard write fallback error:', e);
  }

  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  try {
    window.open(url, '_blank');
    return true;
  } catch (e) {
    console.error('Failed to open WhatsApp URL:', e);
    return false;
  }
}

/**
 * Generates a clean, professional WhatsApp payment reminder for an order.
 */
export function generateOrderWhatsAppReminder(order: Order, daysOverdue?: number): string {
  let dateFormatted = order.date;
  try {
    dateFormatted = format(parseISO(order.date), 'dd MMM yyyy');
  } catch {
    dateFormatted = order.date || 'Recent';
  }

  const itemsList = (order.items || [])
    .filter((i) => i.material && i.material.trim().length > 0)
    .map((i) => `  • ${i.material}${i.quantity ? ` (${i.quantity})` : ''}: ₹${Number(i.amount).toLocaleString('en-IN')}`)
    .join('\n');

  const overdueLine = daysOverdue !== undefined && daysOverdue > 7
    ? `⚠️ *Overdue Alert:* Payment delayed by ${daysOverdue} days\n`
    : '';

  return [
    `🔔 *PAYMENT REMINDER - KhataBook Pro*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `To: *${order.supplier || 'Supplier'}*`,
    `Order ID: #${order.order_id.slice(0, 8)}`,
    `Order Date: ${dateFormatted}`,
    overdueLine ? overdueLine.trim() : null,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 *Order Items:*`,
    itemsList || '  • Materials & Supplies',
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `💵 Total Billed: ₹${Number(order.total_amount).toLocaleString('en-IN')}`,
    `✅ Amount Paid: ₹${Number(order.paid_amount || 0).toLocaleString('en-IN')}`,
    `🚨 *Pending Balance: ₹${Number(order.remaining_amount).toLocaleString('en-IN')}*`,
    `Current Status: *${order.status}*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `Please clear this balance at your earliest convenience or share payment details. Thank you!`,
    `_Sent via KhataBook Pro on ${format(new Date(), 'dd MMM yyyy, hh:mm a')}_`,
  ].filter(Boolean).join('\n');
}

/**
 * Generates an official payment receipt for an order.
 */
export function generateOrderWhatsAppReceipt(order: Order): string {
  let dateFormatted = order.date;
  try {
    dateFormatted = format(parseISO(order.date), 'dd MMM yyyy');
  } catch {
    dateFormatted = order.date || 'Recent';
  }

  const itemsList = (order.items || [])
    .filter((i) => i.material && i.material.trim().length > 0)
    .map((i) => `  • ${i.material}${i.quantity ? ` (${i.quantity})` : ''}: ₹${Number(i.amount).toLocaleString('en-IN')}`)
    .join('\n');

  return [
    `🧾 *PAYMENT RECEIPT - KhataBook Pro*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `Supplier / Vendor: *${order.supplier || 'Supplier'}*`,
    `Order Ref: #${order.order_id.slice(0, 8)}`,
    `Date: ${dateFormatted}`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 *Materials Supplied:*`,
    itemsList || '  • Materials & Supplies',
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `💵 Total Order Value: ₹${Number(order.total_amount).toLocaleString('en-IN')}`,
    `✅ Total Paid: ₹${Number(order.paid_amount || 0).toLocaleString('en-IN')}`,
    `Remaining Balance: ₹${Number(order.remaining_amount).toLocaleString('en-IN')}`,
    `Status: *${order.status}*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `Thank you for your business!`,
    `_Generated from KhataBook Pro on ${format(new Date(), 'dd MMM yyyy, hh:mm a')}_`,
  ].join('\n');
}

/**
 * Generates an official transaction voucher for sharing via WhatsApp.
 */
export function generateTransactionWhatsAppReceipt(tx: Transaction): string {
  let dateFormatted = tx.date;
  try {
    dateFormatted = format(parseISO(tx.date), 'dd MMM yyyy, hh:mm a');
  } catch {
    dateFormatted = tx.date || 'Recent';
  }

  const isDebit = tx.type === 'Debit';

  return [
    `🧾 *TRANSACTION VOUCHER - KhataBook Pro*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `Voucher ID: #${tx.id.slice(0, 8)}`,
    `Date: ${dateFormatted}`,
    `Entry Type: *${isDebit ? 'Payment Outflow (Debit)' : 'Income Inflow (Credit)'}*`,
    `Category / Party: *${tx.category || 'General'}*`,
    `Payment Mode: *${tx.payment_type || 'Cash'}*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 *Amount: ${isDebit ? '-' : '+'}₹${Number(tx.amount).toLocaleString('en-IN')}*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    tx.description ? `📝 Note: ${tx.description}` : null,
    tx.reference ? `🔗 Ref / UTR: ${tx.reference}` : null,
    tx.order_id ? `📦 Linked Order: #${tx.order_id.slice(0, 8)}` : null,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `_Verified business transaction via KhataBook Pro_`,
  ].filter(Boolean).join('\n');
}

/**
 * Generates a comprehensive party-wise statement for a supplier.
 */
export function generateSupplierWhatsAppStatement(
  supplierName: string,
  summary: { totalBilled: number; totalPaid: number; remaining: number; orderCount: number },
  pendingOrders?: Order[]
): string {
  const pendingOrdersList = (pendingOrders || [])
    .filter((o) => o.status !== 'Completed' && Number(o.remaining_amount) > 0)
    .slice(0, 5)
    .map((o) => {
      let d = o.date;
      try {
        d = format(parseISO(o.date), 'dd MMM');
      } catch {}
      return `  • #${o.order_id.slice(0, 6)} (${d}): ₹${Number(o.remaining_amount).toLocaleString('en-IN')} due [${o.status}]`;
    })
    .join('\n');

  return [
    `📋 *SUPPLIER LEDGER STATEMENT - KhataBook Pro*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `Supplier / Party: *${supplierName}*`,
    `Statement Date: ${format(new Date(), 'dd MMM yyyy')}`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 Total Orders Billed: ${summary.orderCount} (₹${summary.totalBilled.toLocaleString('en-IN')})`,
    `✅ Total Amount Cleared: ₹${summary.totalPaid.toLocaleString('en-IN')}`,
    `🚨 *NET OUTSTANDING BALANCE: ₹${summary.remaining.toLocaleString('en-IN')}*`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    pendingOrdersList ? `⚠️ *Pending Invoices:*\n${pendingOrdersList}` : `✨ All accounts currently clear!`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `Please reconcile with your ledger. Thank you!`,
    `_KhataBook Pro Business Accounting_`,
  ].join('\n');
}
