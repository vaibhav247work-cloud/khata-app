import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { type Order, type OrderItem } from '../../../db';

interface AddEditOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingOrder: Order | null;
  newItems: OrderItem[];
  onAddItemRow: () => void;
  onRemoveItemRow: (id: string) => void;
  onItemChange: (id: string, field: keyof OrderItem, value: any) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function AddEditOrderModal({
  isOpen,
  onClose,
  editingOrder,
  newItems,
  onAddItemRow,
  onRemoveItemRow,
  onItemChange,
  onSubmit,
}: AddEditOrderModalProps) {
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
            <h2 className="text-2xl font-bold mb-6">{editingOrder ? 'Edit Order' : 'New Order'}</h2>
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Supplier Name</label>
                  <input name="supplier" type="text" defaultValue={editingOrder?.supplier} placeholder="Company or Person" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Order Date</label>
                  <input name="date" type="date" defaultValue={editingOrder ? format(parseISO(editingOrder.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Items / Materials</label>
                  <button 
                    type="button" 
                    onClick={onAddItemRow}
                    className="text-orange-500 text-xs font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                </div>
                
                <div className="space-y-3">
                  {newItems.map((item) => (
                    <div key={item.id} className="relative bg-zinc-800/30 p-4 rounded-2xl border border-zinc-800/50 group">
                      <div className="grid grid-cols-12 gap-3 items-end">
                        <div className="col-span-12 sm:col-span-5">
                          <label className="block text-[10px] font-bold text-zinc-600 uppercase mb-1">Material</label>
                          <input 
                            type="text" 
                            value={item.material}
                            onChange={(e) => onItemChange(item.id, 'material', e.target.value)}
                            placeholder="e.g. Cement" 
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-orange-500 outline-none transition-all text-white" 
                            required 
                          />
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                          <label className="block text-[10px] font-bold text-zinc-600 uppercase mb-1">Qty</label>
                          <input 
                            type="text" 
                            value={item.quantity}
                            onChange={(e) => onItemChange(item.id, 'quantity', e.target.value)}
                            placeholder="100 Bags" 
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs focus:ring-1 focus:ring-orange-500 outline-none transition-all text-white" 
                            required 
                          />
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                          <label className="block text-[10px] font-bold text-zinc-600 uppercase mb-1">Amount</label>
                          <input 
                            type="number" 
                            value={item.amount || ''}
                            onChange={(e) => onItemChange(item.id, 'amount', Number(e.target.value))}
                            placeholder="0" 
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs no-spinner focus:ring-1 focus:ring-orange-500 outline-none transition-all text-white" 
                            required 
                          />
                        </div>
                        <div className="col-span-12 sm:col-span-1 flex justify-end">
                          <button 
                            type="button" 
                            onClick={() => onRemoveItemRow(item.id)}
                            className="p-2 text-zinc-600 hover:text-red-500 transition-colors bg-zinc-900 sm:bg-transparent rounded-lg cursor-pointer"
                            disabled={newItems.length === 1}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-800/50 p-6 rounded-2xl border border-zinc-800">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-zinc-500 uppercase mb-1">Total Order Value</p>
                    <p className="text-2xl font-bold text-orange-500">
                      ₹{newItems.reduce((sum, item) => sum + Number(item.amount), 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-zinc-600 uppercase mb-1">Items Count</p>
                    <p className="text-lg font-bold text-zinc-400">{newItems.length}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm hover:bg-zinc-700 transition-colors text-zinc-300 cursor-pointer">Cancel</button>
                <button type="submit" className="flex-1 bg-orange-500 py-4 rounded-2xl font-bold text-sm hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20 text-white cursor-pointer">{editingOrder ? 'Update Order' : 'Create Order'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
