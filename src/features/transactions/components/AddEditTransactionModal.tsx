import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { type Transaction } from '../../../db';

interface AddEditTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTransaction: Transaction | null;
  expenseCategories: string[];
  paymentModes: string[];
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onDeleteSingle: (id: string) => void;
}

export function AddEditTransactionModal({
  isOpen,
  onClose,
  editingTransaction,
  expenseCategories,
  paymentModes,
  onSubmit,
  onDeleteSingle,
}: AddEditTransactionModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>(() => expenseCategories[0] || 'Material');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  useEffect(() => {
    if (editingTransaction) {
      const existing = editingTransaction.category || '';
      setSelectedCategory(existing || expenseCategories[0] || 'Material');
      setIsCustomCategory(false);
      setCustomCategoryInput('');
    } else if (isOpen) {
      setSelectedCategory(expenseCategories[0] || 'Material');
      setIsCustomCategory(false);
      setCustomCategoryInput('');
    }
  }, [editingTransaction, isOpen, expenseCategories]);

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
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-zinc-500 uppercase">Category / Name</label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCategory(!isCustomCategory);
                      if (!isCustomCategory) {
                        setCustomCategoryInput(selectedCategory && selectedCategory !== '__custom__' ? selectedCategory : '');
                      }
                    }}
                    className="text-[11px] font-bold text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
                  >
                    {isCustomCategory ? '← Choose from List' : '+ Type Custom'}
                  </button>
                </div>

                {!isCustomCategory ? (
                  <div className="space-y-2">
                    <select 
                      value={selectedCategory}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomCategory(true);
                          setCustomCategoryInput('');
                        } else {
                          setSelectedCategory(e.target.value);
                        }
                      }}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-orange-500"
                      required
                    >
                      {expenseCategories.map((cat: string) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      {editingTransaction?.category && !expenseCategories.includes(editingTransaction.category) && (
                        <option value={editingTransaction.category}>{editingTransaction.category} (Existing)</option>
                      )}
                      <option value="__custom__">+ Other / Type Custom Category...</option>
                    </select>

                    {/* Quick chip selection for top categories */}
                    {expenseCategories.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {expenseCategories.slice(0, 6).map((cat: string) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                              selectedCategory === cat
                                ? 'bg-orange-500 text-white shadow-sm'
                                : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-750'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input 
                      type="text" 
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      placeholder="Enter custom category name (e.g. Plumbing, Electrical)..." 
                      className="w-full bg-zinc-800 border border-orange-500/60 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500" 
                      required={isCustomCategory}
                      autoFocus
                    />
                    <p className="text-[11px] text-zinc-500">
                      Tip: You can manage permanent categories and payment modes anytime in the Admin tab.
                    </p>
                  </div>
                )}

                {/* Hidden input ensuring the resolved category is always submitted in FormData */}
                <input 
                  type="hidden" 
                  name="category" 
                  value={isCustomCategory ? customCategoryInput.trim() : selectedCategory} 
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
                  <select 
                    name="payment_type" 
                    defaultValue={editingTransaction?.payment_type || paymentModes[0] || 'Cash'} 
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-orange-500"
                  >
                    {paymentModes.map((p: string) => <option key={p} value={p}>{p}</option>)}
                    {editingTransaction?.payment_type && !paymentModes.includes(editingTransaction.payment_type) && (
                      <option value={editingTransaction.payment_type}>{editingTransaction.payment_type} (Existing)</option>
                    )}
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
                    className="bg-red-500/15 hover:bg-red-500 border border-red-500/30 text-red-400 hover:text-white py-4 px-6 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                )}
                <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-4 rounded-2xl font-bold text-sm text-zinc-300 transition-colors cursor-pointer">Cancel</button>
                <button type="submit" className="flex-1 bg-orange-500 hover:bg-orange-600 py-4 rounded-2xl font-bold text-sm text-white shadow-lg shadow-orange-500/20 transition-colors cursor-pointer">{editingTransaction ? 'Update Entry' : 'Save Entry'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
