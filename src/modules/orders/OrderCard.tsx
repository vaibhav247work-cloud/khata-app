import React from 'react';
import { motion } from 'motion/react';
import { 
  Printer, 
  Trash2, 
  Pencil, 
  Check, 
  Layers 
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Order } from '../../types';

interface OrderCardProps {
  key?: React.Key;
  order: Order;
  isSelected: boolean;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onPrintReceipt: (order: Order) => void;
  onEdit: (order: Order) => void;
  onOpenPayment: (order: Order) => void;
  onOpenDelete: (id: string) => void;
  isAdmin?: boolean;
}

export function OrderCard({
  order,
  isSelected,
  onToggleSelect,
  onPrintReceipt,
  onEdit,
  onOpenPayment,
  onOpenDelete,
  isAdmin
}: OrderCardProps) {
  const percentage = order.total_amount > 0 ? (order.paid_amount / order.total_amount) * 100 : 0;

  return (
    <motion.div 
      layout
      className={`bg-zinc-900 border rounded-3xl p-6 transition-all ${
        isSelected
          ? 'border-orange-500/60 bg-orange-500/5 shadow-md shadow-orange-500/10'
          : 'border-zinc-800'
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Selection Checkbox */}
          <button
            id={`select-order-checkbox-${order.order_id}`}
            type="button"
            onClick={(e) => onToggleSelect(order.order_id, e)}
            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
              isSelected
                ? 'bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/30'
                : 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-500 text-transparent hover:bg-zinc-800'
            }`}
            title={isSelected ? 'Deselect order' : 'Select order'}
          >
            <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
          </button>

          <div>
            <h4 className="font-bold text-base text-white">{order.supplier}</h4>
            <p className="text-zinc-500 text-xs">{format(parseISO(order.date), 'dd MMM yyyy')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Single Order Print Receipt Button */}
          <button
            id={`print-single-order-${order.order_id}`}
            type="button"
            onClick={() => onPrintReceipt(order)}
            title="Print / Share Official Order Receipt"
            className="p-2 rounded-xl bg-zinc-800/80 hover:bg-orange-500/20 text-zinc-400 hover:text-orange-400 border border-zinc-700/60 transition-all"
          >
            <Printer className="w-4 h-4" />
          </button>

          <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${
            order.status === 'Completed' ? 'bg-green-500/10 text-green-500' :
            order.status === 'Partial' ? 'bg-orange-500/10 text-orange-500' :
            'bg-zinc-800 text-zinc-400'
          }`}>
            {order.status}
          </span>

          {isAdmin && (
            <button 
              id={`delete-order-btn-${order.order_id}`}
              onClick={() => onOpenDelete(order.order_id)}
              className="text-zinc-600 hover:text-red-500 transition-colors p-1"
              title="Delete Order"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Materials List Preview */}
      <div className="bg-zinc-800/40 rounded-2xl p-3 mb-4 space-y-2 border border-zinc-800/60">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold px-1">
          <Layers className="w-3.5 h-3.5 text-orange-400" />
          <span>Materials & Items ({order.items?.length || 0})</span>
        </div>
        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {order.items && order.items.length > 0 ? (
            order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-xs bg-zinc-800/60 px-2.5 py-1.5 rounded-xl">
                <span className="text-zinc-300 font-medium">
                  {item.material} 
                  {item.quantity && <span className="text-zinc-500 ml-1.5 text-[11px]">({item.quantity})</span>}
                </span>
                <span className="text-zinc-400 font-semibold">₹{item.amount.toLocaleString()}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-zinc-500 italic px-1">No item details recorded</div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-xs text-zinc-400">
          <span>Paid: ₹{order.paid_amount.toLocaleString()}</span>
          <span>Total: ₹{order.total_amount.toLocaleString()}</span>
        </div>
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-orange-500 rounded-full transition-all duration-500" 
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="flex justify-between items-center pt-2 border-t border-zinc-800/50">
        <div>
          <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider block">Remaining</span>
          <p className="text-lg font-bold text-white">₹{order.remaining_amount.toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          {order.remaining_amount > 0 && (
            <button 
              id={`record-payment-btn-${order.order_id}`}
              onClick={() => onOpenPayment(order)}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-orange-500/20 active:scale-95"
            >
              Record Payment
            </button>
          )}
          <button 
            id={`edit-order-btn-${order.order_id}`}
            onClick={() => onEdit(order)}
            className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            title="Edit Order"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
