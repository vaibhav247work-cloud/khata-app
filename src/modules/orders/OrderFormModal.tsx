import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Order, OrderItem } from '../../types';

interface OrderFormModalProps {
  isOpen: boolean;
  editingOrder: Order | null;
  items: OrderItem[];
  setItems: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function OrderFormModal({
  isOpen,
  editingOrder,
  items,
  setItems,
  onClose,
  onSubmit
}: OrderFormModalProps) {
  const addItem = () => {
    setItems([...items, { material: '', quantity: '', amount: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof OrderItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

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
            className="bg-zinc-900 w-full max-w-xl rounded-t-[40px] sm:rounded-[40px] p-8 border-t sm:border border-zinc-800 shadow-2xl overflow-y-auto max-h-[85vh] pb-32 sm:pb-8"
          >
            <div className="w-12 h-1.5 bg-zinc-800 rounded-full mx-auto mb-8" />
            <h2 className="text-2xl font-bold mb-6">{editingOrder ? 'Edit Order' : 'Create New Order'}</h2>
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Supplier Name</label>
                  <input name="supplier" type="text" defaultValue={editingOrder?.supplier || ''} placeholder="Vendor name" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Order Date</label>
                  <input name="date" type="date" defaultValue={editingOrder ? format(parseISO(editingOrder.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white" required />
                </div>
              </div>

              {/* Items Dynamic List */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-zinc-500 uppercase">Items / Materials</label>
                  <button type="button" onClick={addItem} className="text-xs text-orange-500 font-bold flex items-center gap-1 hover:underline">
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                </div>
                
                {items.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center bg-zinc-800/30 p-2 rounded-xl border border-zinc-800">
                    <input 
                      type="text" 
                      placeholder="Material" 
                      value={item.material} 
                      onChange={(e) => updateItem(index, 'material', e.target.value)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                      required
                    />
                    <input 
                      type="text" 
                      placeholder="Qty" 
                      value={item.quantity} 
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                    />
                    <input 
                      type="number" 
                      inputMode="decimal"
                      placeholder="Amt" 
                      value={item.amount || ''} 
                      onChange={(e) => updateItem(index, 'amount', Number(e.target.value))}
                      className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs no-spinner text-white"
                      required
                    />
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(index)} className="p-2 text-zinc-500 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-zinc-800/50 p-4 rounded-2xl flex justify-between items-center">
                <span className="text-zinc-400 font-bold text-sm">Total Calculated Amount:</span>
                <span className="text-xl font-bold text-white">₹{totalAmount.toLocaleString()}</span>
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 py-4 rounded-2xl font-bold text-sm text-zinc-300">Cancel</button>
                <button type="submit" className="flex-1 bg-orange-500 py-4 rounded-2xl font-bold text-sm text-white shadow-lg shadow-orange-500/20">{editingOrder ? 'Update Order' : 'Create Order'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
