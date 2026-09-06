import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { PAYMENT_TYPES } from '../../constants';
import type { Transaction } from '../../types';

interface TransactionFormModalProps {
  isOpen: boolean;
  editingTransaction: Transaction | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onDeleteSingle: (id: string) => void;
}

export function TransactionFormModal({
  isOpen,
  editingTransaction,
  onClose,
  onSubmit,
  onDeleteSingle
}: TransactionFormModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[85vh] pb-32 sm:pb-8"
          >
            <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-8" />
            <h2 className="text-2xl font-bold mb-6">{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</h2>
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Type</label>
                  <select name="type" defaultValue={editingTransaction?.type || 'Debit'} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white">
                    <option value="Debit">Debit (Expense)</option>
                    <option value="Credit">Credit (Income)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Date</label>
                  <input name="date" type="date" defaultValue={editingTransaction ? format(parseISO(editingTransaction.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Name / Category</label>
                <input 
                  name="category" 
                  type="text" 
                  defaultValue={editingTransaction?.category || ''}
                  placeholder="e.g. Cement, Site Payment" 
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" 
                  required 
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Amount</label>
                  <input 
                    name="amount" 
                    type="number" 
                    defaultValue={editingTransaction?.amount ?? ''}
                    inputMode="decimal"
                    placeholder="0.00" 
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm no-spinner text-white" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Payment Mode</label>
                  <select name="payment_type" defaultValue={editingTransaction?.payment_type || PAYMENT_TYPES[0]} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white">
                    {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Description</label>
                <input name="description" type="text" defaultValue={editingTransaction?.description || ''} placeholder="What is this for?" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Reference (Optional)</label>
                <input name="reference" type="text" defaultValue={editingTransaction?.reference || ''} placeholder="Bill No / UPI ID" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                {editingTransaction && (
                  <button 
                    type="button" 
                    onClick={() => onDeleteSingle(editingTransaction.id)} 
                    className="bg-red-500/15 hover:bg-red-500 border border-red-500/30 text-red-400 hover:text-white py-4 px-6 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                )}
                <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-4 rounded-2xl font-bold text-sm text-zinc-300 transition-colors">Cancel</button>
                <button type="submit" className="flex-1 bg-orange-500 hover:bg-orange-600 py-4 rounded-2xl font-bold text-sm text-white shadow-lg shadow-orange-500/20 transition-colors">{editingTransaction ? 'Update Entry' : 'Save Entry'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
