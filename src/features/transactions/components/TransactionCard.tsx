import React from 'react';
import { 
  Check, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Share2, 
  Pencil 
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { type Transaction } from '../../../db';
import { 
  shareToWhatsApp, 
  generateTransactionWhatsAppReceipt 
} from '../../../utils/whatsappReminders';

interface TransactionCardProps {
  key?: React.Key;
  tx: Transaction;
  isSelected: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onEdit: (tx: Transaction) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function TransactionCard({
  tx,
  isSelected,
  onToggleSelect,
  onEdit,
  showToast,
}: TransactionCardProps) {
  return (
    <div 
      id={`transaction-card-${tx.id}`}
      className={`border rounded-2xl p-3.5 sm:p-4 flex items-center justify-between transition-all select-none ${
        isSelected 
          ? 'bg-orange-500/10 border-orange-500/60 shadow-lg shadow-orange-500/5 ring-1 ring-orange-500/30' 
          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-2.5 sm:gap-3.5 flex-1 min-w-0 pr-2">
        {/* Small Compact Checkbox Button */}
        <button
          id={`select-checkbox-${tx.id}`}
          type="button"
          onClick={(e) => onToggleSelect(tx.id, e)}
          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all cursor-pointer ${
            isSelected 
              ? 'bg-orange-500 border-orange-500 text-white shadow-sm shadow-orange-500/30' 
              : 'border-zinc-700/80 bg-zinc-800/30 hover:border-zinc-500 text-transparent hover:bg-zinc-800'
          }`}
          title={isSelected ? 'Deselect transaction' : 'Select transaction'}
        >
          <Check className={`w-3.5 h-3.5 stroke-[3] ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
        </button>

        {/* Small Compact Type Indicator */}
        <div className={`p-1.5 rounded-lg shrink-0 ${tx.type === 'Credit' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
          {tx.type === 'Credit' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
        </div>

        {/* High-Visibility Expanded Text Block */}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm sm:text-base text-zinc-100 truncate leading-snug">{tx.category}</p>
          {tx.description && (
            <p className="text-zinc-400 text-xs truncate mt-0.5 leading-normal">{tx.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
            <span className="bg-zinc-800/90 text-zinc-300 text-[10px] px-2 py-0.5 rounded-md uppercase font-bold tracking-wider">{tx.payment_type}</span>
            <span className="text-zinc-500 text-[10px]">{format(parseISO(tx.date), 'dd MMM yyyy')}</span>
            {tx.order_id && (
              <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] px-1.5 py-0.5 rounded font-bold">
                Order
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className={`text-base sm:text-lg font-extrabold tracking-tight ${tx.type === 'Credit' ? 'text-green-500' : 'text-red-500'}`}>
          {tx.type === 'Credit' ? '+' : '-'}₹{Number(tx.amount || 0).toLocaleString('en-IN')}
        </p>
        {tx.reference && <p className="text-zinc-500 text-[10px] truncate max-w-[110px] mt-0.5">Ref: {tx.reference}</p>}
        
        <div className="flex items-center justify-end gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              const voucher = generateTransactionWhatsAppReceipt(tx);
              await shareToWhatsApp(voucher);
              showToast?.('Payment voucher copied & opened in WhatsApp!', 'success');
            }}
            className="p-1 rounded-lg bg-zinc-800/80 hover:bg-emerald-950/60 text-zinc-400 hover:text-emerald-400 border border-zinc-700/60 transition-colors cursor-pointer"
            title="Share Voucher on WhatsApp"
          >
            <Share2 className="w-3 h-3" />
          </button>
          {!tx.order_id && (
            <button
              id={`edit-tx-btn-${tx.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onEdit(tx);
              }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-400 hover:text-orange-400 transition-colors cursor-pointer"
              title="Edit Transaction"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
