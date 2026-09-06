import React from 'react';
import { motion } from 'motion/react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Pencil, 
  Check, 
  CreditCard 
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Transaction } from '../../types';

interface TransactionCardProps {
  tx: Transaction;
  isSelected: boolean;
  onToggleSelect: (id: string, e?: React.MouseEvent) => void;
  onEdit: (tx: Transaction) => void;
}

export function TransactionCard({
  tx,
  isSelected,
  onToggleSelect,
  onEdit
}: TransactionCardProps) {
  const isCredit = tx.type === 'Credit';

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className={`bg-zinc-900 border rounded-2xl p-4 flex items-center justify-between transition-all group ${
        isSelected
          ? 'border-orange-500/60 bg-orange-500/5 shadow-md shadow-orange-500/10'
          : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Selection Checkbox */}
        <button
          id={`select-tx-checkbox-${tx.id}`}
          type="button"
          onClick={(e) => onToggleSelect(tx.id, e)}
          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
            isSelected
              ? 'bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/30'
              : 'border-zinc-700 bg-zinc-800/60 hover:border-zinc-500 text-transparent hover:bg-zinc-800'
          }`}
          title={isSelected ? 'Deselect transaction' : 'Select transaction'}
        >
          <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
        </button>

        {/* Type Indicator Icon */}
        <div className={`p-2.5 rounded-xl shrink-0 ${isCredit ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
          {isCredit ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
        </div>

        {/* Transaction Details */}
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <p className="font-bold text-sm text-white truncate">{tx.category}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-medium shrink-0 flex items-center gap-1 border border-zinc-700/40">
              <CreditCard className="w-2.5 h-2.5" />
              {tx.payment_type}
            </span>
          </div>
          <p className="text-zinc-400 text-xs truncate mt-0.5">{tx.description}</p>
          <p className="text-zinc-600 text-[10px] mt-0.5 flex items-center gap-1">
            <span>{format(parseISO(tx.date), 'dd MMM yyyy, hh:mm a')}</span>
            {tx.reference && (
              <>
                <span>•</span>
                <span className="truncate">Ref: {tx.reference}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Amount & Actions */}
      <div className="flex items-center gap-3 shrink-0">
        <p className={`font-bold text-sm sm:text-base ${isCredit ? 'text-green-500' : 'text-red-500'}`}>
          {isCredit ? '+' : '-'}₹{tx.amount.toLocaleString()}
        </p>
        <button 
          id={`edit-tx-btn-${tx.id}`}
          onClick={() => onEdit(tx)} 
          className="p-2 text-zinc-600 hover:text-orange-500 hover:bg-orange-500/10 rounded-xl transition-all opacity-70 group-hover:opacity-100"
          title="Edit transaction"
        >
          <Pencil className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
