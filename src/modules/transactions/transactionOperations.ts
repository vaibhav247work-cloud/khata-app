import { format } from 'date-fns';
import { db } from '../../db';
import { deleteTransactionsWithRecalculation } from '../../sync';
import type { Transaction } from '../../types';

export async function saveTransaction(
  formData: FormData,
  editingTransaction: Transaction | null
): Promise<'updated' | 'created'> {
  const type = formData.get('type') as 'Credit' | 'Debit';
  const category = formData.get('category') as string;
  const amount = Number(formData.get('amount'));
  const payment_type = formData.get('payment_type') as any;
  const description = formData.get('description') as string;
  const reference = formData.get('reference') as string;
  const selectedDate = formData.get('date') as string;
  const now = new Date();
  const timeStr = editingTransaction?.date.split('T')[1] || format(now, 'HH:mm:ss');
  const fullDate = `${selectedDate}T${timeStr}`;

  if (editingTransaction) {
    await db.transactions.update(editingTransaction.id, {
      date: fullDate,
      type,
      category,
      amount,
      payment_type,
      description,
      reference,
      synced: false,
    });
    return 'updated';
  } else {
    await db.transactions.add({
      id: crypto.randomUUID(),
      date: fullDate,
      type,
      category,
      amount,
      payment_type,
      description,
      reference,
      synced: false,
    });
    return 'created';
  }
}

export async function deleteSingleTransaction(id: string): Promise<void> {
  await deleteTransactionsWithRecalculation([id]);
}

export async function deleteBulkTransactions(selectedIds: Set<string>): Promise<number> {
  return await deleteTransactionsWithRecalculation(selectedIds);
}
