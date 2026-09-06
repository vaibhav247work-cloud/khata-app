import { format, parseISO } from 'date-fns';
import { CreditCard } from 'lucide-react';

interface PassbookTableProps {
  entries: any[];
}

export function PassbookTable({ entries }: PassbookTableProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50 text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider font-bold">
              <th className="p-3 sm:p-4">Date</th>
              <th className="p-3 sm:p-4">Particulars</th>
              <th className="p-3 sm:p-4 hidden sm:table-cell">Mode</th>
              <th className="p-3 sm:p-4 text-right">Debit (-)</th>
              <th className="p-3 sm:p-4 text-right">Credit (+)</th>
              <th className="p-3 sm:p-4 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50 text-xs sm:text-sm">
            {entries.map((item: any) => {
              const isCredit = item.type === 'Credit';
              return (
                <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="p-3 sm:p-4 text-zinc-400 whitespace-nowrap">
                    <div>{format(parseISO(item.date), 'dd MMM yyyy')}</div>
                    <div className="text-[10px] text-zinc-600">{format(parseISO(item.date), 'hh:mm a')}</div>
                  </td>
                  <td className="p-3 sm:p-4 max-w-[140px] sm:max-w-xs">
                    <p className="font-bold text-white truncate">{item.category}</p>
                    <p className="text-zinc-500 text-[11px] truncate">{item.description}</p>
                    {item.reference && (
                      <span className="text-[9px] text-zinc-600 truncate block">Ref: {item.reference}</span>
                    )}
                    <span className="inline-flex sm:hidden items-center gap-1 text-[9px] px-1.5 py-0.5 mt-1 bg-zinc-800 text-zinc-400 rounded">
                      <CreditCard className="w-2.5 h-2.5" /> {item.payment_type}
                    </span>
                  </td>
                  <td className="p-3 sm:p-4 text-zinc-400 hidden sm:table-cell whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-800/80 rounded-lg text-xs">
                      <CreditCard className="w-3 h-3 text-zinc-500" /> {item.payment_type}
                    </span>
                  </td>
                  <td className="p-3 sm:p-4 text-right font-bold text-red-500 whitespace-nowrap">
                    {!isCredit ? `₹${item.amount.toLocaleString()}` : '-'}
                  </td>
                  <td className="p-3 sm:p-4 text-right font-bold text-green-500 whitespace-nowrap">
                    {isCredit ? `₹${item.amount.toLocaleString()}` : '-'}
                  </td>
                  <td className="p-3 sm:p-4 text-right font-bold text-white whitespace-nowrap">
                    ₹{item.runningBalance.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-12 text-zinc-500 text-sm">
          No records found for this period
        </div>
      )}
    </div>
  );
}
